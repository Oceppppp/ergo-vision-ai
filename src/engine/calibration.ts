import { getDerivedSegments } from '../data/anthropometry';
import type {
  CalibrationResult,
  CameraViewMode,
  ManualReferenceLine,
  PoseLandmark2D,
  SegmentScaleSample,
  StandingAnchor,
  StudentProfile,
} from '../types/ergo';
import { dist2D, LM, midpoint2D, toPixel } from './geometry';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function dist3D(a: PoseLandmark2D, b: PoseLandmark2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Returns cos(phi) = ratio of 2D image-plane projection to 3D bone length.
 * Close to 1.0 means bone is parallel to camera plane (no foreshortening);
 * < 0.76 means bone points sharply toward/away from camera and would distort 2D calibration.
 */
function projectionCosine3D(worldLandmarks: PoseLandmark2D[] | undefined, idxA: number, idxB: number): number {
  if (!worldLandmarks || worldLandmarks.length < 33) return 1.0;
  const a = worldLandmarks[idxA];
  const b = worldLandmarks[idxB];
  const d3 = dist3D(a, b);
  if (d3 < 1e-4) return 0;
  const d2 = Math.hypot(a.x - b.x, a.y - b.y);
  return d2 / d3;
}

/**
 * Calibrates MediaPipe 3D worldLandmarks (in meters) directly to the selected student's real cm
 * using rigid bone ratios (immune to camera distance & perspective foreshortening).
 */
export function computeRealCmPerWorldMeter(
  profile: StudentProfile,
  worldLandmarks?: PoseLandmark2D[],
  landmarks2D?: PoseLandmark2D[]
): number {
  if (!worldLandmarks || worldLandmarks.length < 33) {
    return 100 * (profile.dimensions.B2 / 170);
  }
  const segs = getDerivedSegments(profile);
  const vis = (idx: number) => landmarks2D?.[idx]?.visibility ?? worldLandmarks[idx]?.visibility ?? 1;
  const ratios: number[] = [];

  const pushWorldRatio = (realCm: number, iA: number, iB: number, minVis = 0.5) => {
    if (Math.min(vis(iA), vis(iB)) < minVis) return;
    const m = dist3D(worldLandmarks[iA], worldLandmarks[iB]);
    if (m < 0.08) return;
    const r = realCm / m;
    // Physically valid MediaPipe world scale lies within 70..135 cm per world meter
    if (r >= 70 && r <= 135) {
      ratios.push(r);
    }
  };

  // Both left & right arms + shins + glenohumeral shoulder span
  pushWorldRatio(segs.upperArmCm, LM.LEFT_SHOULDER, LM.LEFT_ELBOW);
  pushWorldRatio(segs.upperArmCm, LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW);
  pushWorldRatio(segs.forearmCm, LM.LEFT_ELBOW, LM.LEFT_WRIST);
  pushWorldRatio(segs.forearmCm, LM.RIGHT_ELBOW, LM.RIGHT_WRIST);
  pushWorldRatio(segs.lowerLegBoneCm, LM.LEFT_KNEE, LM.LEFT_ANKLE);
  pushWorldRatio(segs.lowerLegBoneCm, LM.RIGHT_KNEE, LM.RIGHT_ANKLE);
  pushWorldRatio(segs.shoulderJointWidthCm, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER);

  // If upright, include eye-to-floor (B3) world height span for maximum vertical fidelity
  const wMidEyeY = (worldLandmarks[LM.LEFT_EYE].y + worldLandmarks[LM.RIGHT_EYE].y) / 2;
  const wFloorY = Math.max(
    worldLandmarks[LM.LEFT_HEEL].y,
    worldLandmarks[LM.RIGHT_HEEL].y,
    worldLandmarks[LM.LEFT_FOOT_INDEX].y,
    worldLandmarks[LM.RIGHT_FOOT_INDEX].y
  );
  const wMidSh = {
    x: (worldLandmarks[LM.LEFT_SHOULDER].x + worldLandmarks[LM.RIGHT_SHOULDER].x) / 2,
    y: (worldLandmarks[LM.LEFT_SHOULDER].y + worldLandmarks[LM.RIGHT_SHOULDER].y) / 2,
    z: (worldLandmarks[LM.LEFT_SHOULDER].z + worldLandmarks[LM.RIGHT_SHOULDER].z) / 2,
  };
  const wMidHip = {
    x: (worldLandmarks[LM.LEFT_HIP].x + worldLandmarks[LM.RIGHT_HIP].x) / 2,
    y: (worldLandmarks[LM.LEFT_HIP].y + worldLandmarks[LM.RIGHT_HIP].y) / 2,
    z: (worldLandmarks[LM.LEFT_HIP].z + worldLandmarks[LM.RIGHT_HIP].z) / 2,
  };
  const torsoLen = Math.hypot(wMidSh.x - wMidHip.x, wMidSh.y - wMidHip.y, wMidSh.z - wMidHip.z) || 1;
  const uprightCos = -(wMidSh.y - wMidHip.y) / torsoLen;
  if (uprightCos > 0.94 && wFloorY - wMidEyeY > 0.9) {
    const eyeRatio = segs.eyeHeightCm / (wFloorY - wMidEyeY);
    if (eyeRatio >= 75 && eyeRatio <= 130) {
      // Weight eye-to-floor strongly when standing upright
      ratios.push(eyeRatio, eyeRatio);
    }
  }

  return ratios.length > 0 ? median(ratios) : 100 * (profile.dimensions.B2 / 170);
}

export function detectCameraView(
  landmarks2D: PoseLandmark2D[],
  width: number,
  height: number,
  overrideMode: CameraViewMode = 'auto'
): 'side' | 'front_top' {
  if (overrideMode === 'side') return 'side';
  if (overrideMode === 'front_top') return 'front_top';

  const lSh = toPixel(landmarks2D[LM.LEFT_SHOULDER], width, height);
  const rSh = toPixel(landmarks2D[LM.RIGHT_SHOULDER], width, height);
  const lHip = toPixel(landmarks2D[LM.LEFT_HIP], width, height);
  const rHip = toPixel(landmarks2D[LM.RIGHT_HIP], width, height);

  const shWidth = dist2D(lSh, rSh);
  const torsoLen = Math.max(1, dist2D(midpoint2D(lSh, rSh), midpoint2D(lHip, rHip)));

  // In a front or top-down view, shoulder width is large relative to projected torso length
  return shWidth / torsoLen > 0.48 ? 'front_top' : 'side';
}

/**
 * Checks if the subject is standing upright with both feet visible — ideal frame to lock a
 * gold-standard B3 (eye-to-floor) + B10 (shoulder-to-floor) calibration for the entire video.
 */
export function tryBuildStandingAnchor(
  landmarks2D: PoseLandmark2D[],
  width: number,
  height: number,
  profile: StudentProfile,
  timestampSec: number,
  worldLandmarks?: PoseLandmark2D[],
  trunkFlexionDeg?: number,
  maxKneeFlexionDeg?: number
): StandingAnchor | null {
  const px = (idx: number) => toPixel(landmarks2D[idx], width, height);
  const vis = (idx: number) => landmarks2D[idx]?.visibility ?? 1;

  // Require upright posture and clear feet/eyes visibility
  if (trunkFlexionDeg !== undefined && Math.abs(trunkFlexionDeg) > 16) return null;
  if (maxKneeFlexionDeg !== undefined && maxKneeFlexionDeg > 22) return null;
  if (Math.min(vis(LM.LEFT_HEEL), vis(LM.RIGHT_HEEL)) < 0.45) return null;
  if (Math.min(vis(LM.LEFT_SHOULDER), vis(LM.RIGHT_SHOULDER)) < 0.6) return null;

  // Anchor floor to heel midpoint (true stance ground plane — avoids downward perspective shift of forward toes)
  const floorY = (px(LM.LEFT_HEEL).y + px(LM.RIGHT_HEEL).y) / 2;
  if (floorY > height * 0.995) return null;

  const segs = getDerivedSegments(profile);
  const samples: SegmentScaleSample[] = [];

  // 1. Eye-to-floor B3 (vertical span — zero foreshortening in BOTH front & side views!)
  if (vis(LM.LEFT_EYE) > 0.5 && vis(LM.RIGHT_EYE) > 0.5) {
    const midEyeY = (px(LM.LEFT_EYE).y + px(LM.RIGHT_EYE).y) / 2;
    const eyeSpanPx = floorY - midEyeY;
    if (eyeSpanPx > height * 0.25) {
      samples.push({
        segmentKey: 'B3',
        label: `Tinggi Mata B3 (${segs.eyeHeightCm} cm)`,
        realCm: segs.eyeHeightCm,
        pixelLength: Math.round(eyeSpanPx),
        cmPerPixel: segs.eyeHeightCm / eyeSpanPx,
        visibility: Number(Math.min(vis(LM.LEFT_EYE), vis(LM.RIGHT_EYE)).toFixed(2)),
      });
    }
  }

  // 2. Shoulder-joint-to-floor (B10 - 2.5 cm)
  const midShY = (px(LM.LEFT_SHOULDER).y + px(LM.RIGHT_SHOULDER).y) / 2;
  const shSpanPx = floorY - midShY;
  if (shSpanPx > height * 0.2) {
    samples.push({
      segmentKey: 'B10',
      label: `Bahu ke Lantai B10 (${segs.shoulderJointHeightCm} cm)`,
      realCm: segs.shoulderJointHeightCm,
      pixelLength: Math.round(shSpanPx),
      cmPerPixel: segs.shoulderJointHeightCm / shSpanPx,
      visibility: Number(Math.min(vis(LM.LEFT_SHOULDER), vis(LM.RIGHT_SHOULDER)).toFixed(2)),
    });
  }

  // 3. Knee-joint-to-floor (D7 - 2.5 cm)
  if (vis(LM.LEFT_KNEE) > 0.5 && vis(LM.RIGHT_KNEE) > 0.5) {
    const midKneeY = (px(LM.LEFT_KNEE).y + px(LM.RIGHT_KNEE).y) / 2;
    const kneeSpanPx = floorY - midKneeY;
    if (kneeSpanPx > height * 0.08) {
      samples.push({
        segmentKey: 'D7',
        label: `Lutut ke Lantai D7 (${segs.kneeJointHeightCm} cm)`,
        realCm: segs.kneeJointHeightCm,
        pixelLength: Math.round(kneeSpanPx),
        cmPerPixel: segs.kneeJointHeightCm / kneeSpanPx,
        visibility: Number(Math.min(vis(LM.LEFT_KNEE), vis(LM.RIGHT_KNEE)).toFixed(2)),
      });
    }
  }

  if (samples.length < 2) return null;

  const scales = samples.map((s) => s.cmPerPixel);
  const cmPerPixel = median(scales);
  const maxDev = Math.max(...scales.map((s) => Math.abs(s - cmPerPixel) / cmPerPixel));
  const confidence = Number(Math.min(0.96, Math.max(0.7, 1 - maxDev)).toFixed(2));
  const realCmPerWorldMeter = computeRealCmPerWorldMeter(profile, worldLandmarks, landmarks2D);

  return {
    cmPerPixel,
    realCmPerWorldMeter,
    floorY,
    confidence,
    segmentsUsed: samples,
    capturedAtSec: timestampSec,
  };
}

export function calibrateFromAnthropometry(
  landmarks2D: PoseLandmark2D[],
  width: number,
  height: number,
  profile: StudentProfile,
  options?: {
    cameraViewMode?: CameraViewMode;
    manualReference?: ManualReferenceLine | null;
    worldLandmarks?: PoseLandmark2D[];
    standingAnchor?: StandingAnchor | null;
  }
): CalibrationResult {
  const px = (idx: number) => toPixel(landmarks2D[idx], width, height);
  const vis = (idx: number) => landmarks2D[idx]?.visibility ?? 1;

  const heelCandidates = [px(LM.LEFT_HEEL).y, px(LM.RIGHT_HEEL).y].filter((y) => Number.isFinite(y) && y > 0);
  const currentFloorY =
    heelCandidates.length > 0
      ? heelCandidates.reduce((a, b) => a + b, 0) / heelCandidates.length
      : height * 0.92;

  const detectedView = detectCameraView(landmarks2D, width, height, options?.cameraViewMode ?? 'auto');
  const worldScale = computeRealCmPerWorldMeter(profile, options?.worldLandmarks, landmarks2D);

  // Priority 1: User-drawn 2-point manual physical reference line (highest accuracy — e.g. 85 cm table leg or tape measure)
  const manual = options?.manualReference;
  if (manual && manual.knownCm > 0) {
    const refPx = dist2D(manual.p1, manual.p2);
    if (refPx > 5) {
      const cmPerPixel = manual.knownCm / refPx;
      return {
        cmPerPixel,
        realCmPerWorldMeter: options?.standingAnchor?.realCmPerWorldMeter ?? worldScale,
        methodUsed: 'manual_reference',
        detectedView,
        confidence: 0.99,
        segmentsUsed: [
          {
            segmentKey: 'MANUAL',
            label: manual.label || 'Garis Referensi 2-Titik',
            realCm: manual.knownCm,
            pixelLength: Math.round(refPx),
            cmPerPixel,
            visibility: 1,
          },
        ],
        floorY: options?.standingAnchor?.floorY ?? currentFloorY,
        standingLocked: true,
      };
    }
  }

  // Priority 2: Locked Standing Baseline Anchor from upright frame in same video (zero bending foreshortening drift!)
  if (options?.standingAnchor && options.standingAnchor.cmPerPixel > 0) {
    const anchor = options.standingAnchor;
    // Use standing floorY if close to current foot Y (static camera), else adapt softly if camera panned
    const floorY = Math.abs(currentFloorY - anchor.floorY) < height * 0.08 ? anchor.floorY : currentFloorY;
    return {
      cmPerPixel: anchor.cmPerPixel,
      realCmPerWorldMeter: anchor.realCmPerWorldMeter,
      methodUsed: 'auto_anthropometry',
      detectedView,
      confidence: anchor.confidence,
      segmentsUsed: anchor.segmentsUsed,
      floorY,
      standingLocked: true,
    };
  }

  const segs = getDerivedSegments(profile);
  const samples: SegmentScaleSample[] = [];
  const world = options?.worldLandmarks;

  const pushSample = (
    segmentKey: string,
    label: string,
    realCm: number,
    idxA: number,
    idxB: number,
    minVis = 0.55
  ) => {
    const v = Math.min(vis(idxA), vis(idxB));
    if (v < minVis) return;
    const cosPhi = projectionCosine3D(world, idxA, idxB);
    // Reject heavily foreshortened segments pointing toward/away from camera!
    if (cosPhi < 0.76) return;
    const pixelLength = dist2D(px(idxA), px(idxB));
    if (pixelLength < 16) return;
    // Compensate slight out-of-plane angle using 3D cosPhi
    const projectedRealCm = realCm * cosPhi;
    samples.push({
      segmentKey,
      label,
      realCm: Number(projectedRealCm.toFixed(1)),
      pixelLength: Math.round(pixelLength),
      cmPerPixel: projectedRealCm / pixelLength,
      visibility: Number(v.toFixed(2)),
    });
  };

  if (detectedView === 'side') {
    const leftScore = vis(LM.LEFT_SHOULDER) + vis(LM.LEFT_ELBOW) + vis(LM.LEFT_WRIST) + vis(LM.LEFT_KNEE) + vis(LM.LEFT_ANKLE);
    const rightScore = vis(LM.RIGHT_SHOULDER) + vis(LM.RIGHT_ELBOW) + vis(LM.RIGHT_WRIST) + vis(LM.RIGHT_KNEE) + vis(LM.RIGHT_ANKLE);
    const useRight = rightScore >= leftScore;

    const sh = useRight ? LM.RIGHT_SHOULDER : LM.LEFT_SHOULDER;
    const el = useRight ? LM.RIGHT_ELBOW : LM.LEFT_ELBOW;
    const wr = useRight ? LM.RIGHT_WRIST : LM.LEFT_WRIST;
    const kn = useRight ? LM.RIGHT_KNEE : LM.LEFT_KNEE;
    const an = useRight ? LM.RIGHT_ANKLE : LM.LEFT_ANKLE;
    const he = useRight ? LM.RIGHT_HEEL : LM.LEFT_HEEL;
    const fi = useRight ? LM.RIGHT_FOOT_INDEX : LM.LEFT_FOOT_INDEX;

    pushSample('D21', `Lengan Bawah D21 (${segs.forearmCm} cm)`, segs.forearmCm, el, wr);
    pushSample('B10-B13', `Lengan Atas B10–B13 (${segs.upperArmCm} cm)`, segs.upperArmCm, sh, el);
    pushSample('D7', `Tungkai Bawah D7 (${segs.lowerLegBoneCm} cm)`, segs.lowerLegBoneCm, kn, an);
    pushSample('T5', `Telapak Kaki T5 (${segs.footLengthCm} cm)`, segs.footLengthCm, he, fi, 0.5);

    // If nearly upright, add B3 eye-to-floor & B10 shoulder-to-floor
    const shPt = px(sh);
    const hipPt = px(useRight ? LM.RIGHT_HIP : LM.LEFT_HIP);
    const uprightRatio = Math.abs(shPt.x - hipPt.x) / Math.max(1, Math.abs(hipPt.y - shPt.y));
    if (uprightRatio < 0.22 && vis(sh) > 0.6 && vis(he) > 0.5) {
      const shToFloorPx = Math.abs(currentFloorY - shPt.y);
      if (shToFloorPx > height * 0.2) {
        samples.push({
          segmentKey: 'B10',
          label: `Bahu ke Lantai B10 (${segs.shoulderJointHeightCm} cm)`,
          realCm: segs.shoulderJointHeightCm,
          pixelLength: Math.round(shToFloorPx),
          cmPerPixel: segs.shoulderJointHeightCm / shToFloorPx,
          visibility: Number(Math.min(vis(sh), vis(he)).toFixed(2)),
        });
      }
      if (vis(LM.LEFT_EYE) > 0.5 || vis(LM.RIGHT_EYE) > 0.5) {
        const eyeY = (px(LM.LEFT_EYE).y + px(LM.RIGHT_EYE).y) / 2;
        const eyeToFloorPx = Math.abs(currentFloorY - eyeY);
        if (eyeToFloorPx > height * 0.25) {
          samples.push({
            segmentKey: 'B3',
            label: `Tinggi Mata B3 (${segs.eyeHeightCm} cm)`,
            realCm: segs.eyeHeightCm,
            pixelLength: Math.round(eyeToFloorPx),
            cmPerPixel: segs.eyeHeightCm / eyeToFloorPx,
            visibility: 0.9,
          });
        }
      }
    }
  } else {
    // Front / top view: use glenohumeral shoulder width (0.82 * D13), plus foreshortening-verified shins & arms!
    // Never blindly use feet T5 in front view unless cosPhi >= 0.76 (feet point toward camera!).
    pushSample(
      'D13',
      `Lebar Sendi Bahu D13 (${segs.shoulderJointWidthCm} cm)`,
      segs.shoulderJointWidthCm,
      LM.LEFT_SHOULDER,
      LM.RIGHT_SHOULDER,
      0.55
    );
    pushSample('D7-L', `Tungkai Kiri D7 (${segs.lowerLegBoneCm} cm)`, segs.lowerLegBoneCm, LM.LEFT_KNEE, LM.LEFT_ANKLE, 0.5);
    pushSample('D7-R', `Tungkai Kanan D7 (${segs.lowerLegBoneCm} cm)`, segs.lowerLegBoneCm, LM.RIGHT_KNEE, LM.RIGHT_ANKLE, 0.5);
    pushSample('D21-R', `Lengan Bawah D21 (${segs.forearmCm} cm)`, segs.forearmCm, LM.RIGHT_ELBOW, LM.RIGHT_WRIST, 0.6);
    pushSample('D21-L', `Lengan Bawah D21 (${segs.forearmCm} cm)`, segs.forearmCm, LM.LEFT_ELBOW, LM.LEFT_WRIST, 0.6);
    pushSample('T5-L', `Telapak Kaki T5 (${segs.footLengthCm} cm)`, segs.footLengthCm, LM.LEFT_HEEL, LM.LEFT_FOOT_INDEX, 0.55);
    pushSample('T5-R', `Telapak Kaki T5 (${segs.footLengthCm} cm)`, segs.footLengthCm, LM.RIGHT_HEEL, LM.RIGHT_FOOT_INDEX, 0.55);
  }

  if (samples.length === 0) {
    const eyeY = (px(LM.LEFT_EYE).y + px(LM.RIGHT_EYE).y) / 2;
    const spanPx = Math.max(80, currentFloorY - eyeY);
    const cmPerPixel = segs.eyeHeightCm / spanPx;
    return {
      cmPerPixel,
      realCmPerWorldMeter: worldScale,
      methodUsed: 'auto_anthropometry',
      detectedView,
      confidence: 0.5,
      segmentsUsed: [
        {
          segmentKey: 'B3',
          label: `Fallback Tinggi Mata B3 (${segs.eyeHeightCm} cm)`,
          realCm: segs.eyeHeightCm,
          pixelLength: Math.round(spanPx),
          cmPerPixel,
          visibility: 0.5,
        },
      ],
      floorY: currentFloorY,
      standingLocked: false,
    };
  }

  const scales = samples.map((s) => s.cmPerPixel);
  const cmPerPixel = median(scales);
  const avgVis = samples.reduce((acc, s) => acc + s.visibility, 0) / samples.length;
  const maxDev = Math.max(...scales.map((s) => Math.abs(s - cmPerPixel) / cmPerPixel));
  const agreement = Math.max(0.45, 1 - maxDev);
  const confidence = Number(Math.min(0.95, avgVis * agreement * (samples.length >= 2 ? 1.0 : 0.82)).toFixed(2));

  return {
    cmPerPixel,
    realCmPerWorldMeter: worldScale,
    methodUsed: 'auto_anthropometry',
    detectedView,
    confidence,
    segmentsUsed: samples,
    floorY: currentFloorY,
    standingLocked: false,
  };
}
