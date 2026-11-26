import { getDerivedSegments } from '../data/anthropometry';
import type {
  CalibrationResult,
  CameraViewMode,
  ManualReferenceLine,
  PoseLandmark2D,
  SegmentScaleSample,
  StudentProfile,
} from '../types/ergo';
import { dist2D, LM, midpoint2D, toPixel } from './geometry';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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
  return shWidth / torsoLen > 0.52 ? 'front_top' : 'side';
}

export function calibrateFromAnthropometry(
  landmarks2D: PoseLandmark2D[],
  width: number,
  height: number,
  profile: StudentProfile,
  options?: {
    cameraViewMode?: CameraViewMode;
    manualReference?: ManualReferenceLine | null;
  }
): CalibrationResult {
  const px = (idx: number) => toPixel(landmarks2D[idx], width, height);
  const vis = (idx: number) => landmarks2D[idx]?.visibility ?? 1;

  // Floor Y anchored to the lowest heel / foot-index point
  const floorCandidates = [
    px(LM.LEFT_HEEL).y,
    px(LM.RIGHT_HEEL).y,
    px(LM.LEFT_FOOT_INDEX).y,
    px(LM.RIGHT_FOOT_INDEX).y,
  ].filter((y) => Number.isFinite(y) && y > 0);
  const floorY = floorCandidates.length > 0 ? Math.max(...floorCandidates) : height * 0.92;

  const detectedView = detectCameraView(landmarks2D, width, height, options?.cameraViewMode ?? 'auto');

  // If user locked a 2-point manual physical reference line (e.g. shelf height 85cm or tape measure)
  const manual = options?.manualReference;
  if (manual && manual.knownCm > 0) {
    const refPx = dist2D(manual.p1, manual.p2);
    if (refPx > 5) {
      const cmPerPixel = manual.knownCm / refPx;
      return {
        cmPerPixel,
        methodUsed: 'manual_reference',
        detectedView,
        confidence: 0.98,
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
        floorY,
      };
    }
  }

  const segs = getDerivedSegments(profile);
  const samples: SegmentScaleSample[] = [];

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
    const pixelLength = dist2D(px(idxA), px(idxB));
    if (pixelLength < 12) return;
    samples.push({
      segmentKey,
      label,
      realCm,
      pixelLength: Math.round(pixelLength),
      cmPerPixel: realCm / pixelLength,
      visibility: Number(v.toFixed(2)),
    });
  };

  if (detectedView === 'side') {
    // Pick the camera-facing side with higher overall visibility to avoid foreshortened far-side limbs
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

    // Rigid bone segments stay true to real length even when worker bends down!
    pushSample('D21', `Lengan Bawah D21 (${segs.forearmCm} cm)`, segs.forearmCm, el, wr);
    pushSample('B10-B13', `Lengan Atas B10–B13 (${segs.upperArmCm} cm)`, segs.upperArmCm, sh, el);
    pushSample('D7', `Tungkai Bawah D7 (${segs.lowerLegBoneCm} cm)`, segs.lowerLegBoneCm, kn, an);
    pushSample('T5', `Telapak Kaki T5 (${segs.footLengthCm} cm)`, segs.footLengthCm, he, fi, 0.45);

    // If standing nearly upright (shoulder above hip & knee straight), also include full B10 shoulder-to-floor
    const shPt = px(sh);
    const hipPt = px(useRight ? LM.RIGHT_HIP : LM.LEFT_HIP);
    const uprightRatio = Math.abs(shPt.x - hipPt.x) / Math.max(1, Math.abs(hipPt.y - shPt.y));
    if (uprightRatio < 0.25 && vis(sh) > 0.6 && vis(he) > 0.5) {
      const shToFloorPx = Math.abs(floorY - shPt.y);
      if (shToFloorPx > 60) {
        samples.push({
          segmentKey: 'B10',
          label: `Bahu ke Lantai B10 (${profile.dimensions.B10} cm)`,
          realCm: profile.dimensions.B10,
          pixelLength: Math.round(shToFloorPx),
          cmPerPixel: profile.dimensions.B10 / shToFloorPx,
          visibility: Number(Math.min(vis(sh), vis(he)).toFixed(2)),
        });
      }
    }
  } else {
    // Front or top-down view: shoulder width D13 and foot length T5 are primary rigid references
    pushSample('D13', `Lebar Bahu D13 (${segs.shoulderWidthCm} cm)`, segs.shoulderWidthCm, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, 0.55);
    pushSample('T5-L', `Telapak Kaki Kiri T5 (${segs.footLengthCm} cm)`, segs.footLengthCm, LM.LEFT_HEEL, LM.LEFT_FOOT_INDEX, 0.4);
    pushSample('T5-R', `Telapak Kaki Kanan T5 (${segs.footLengthCm} cm)`, segs.footLengthCm, LM.RIGHT_HEEL, LM.RIGHT_FOOT_INDEX, 0.4);
    pushSample('D21-R', `Lengan Bawah D21 (${segs.forearmCm} cm)`, segs.forearmCm, LM.RIGHT_ELBOW, LM.RIGHT_WRIST, 0.6);
    pushSample('D21-L', `Lengan Bawah D21 (${segs.forearmCm} cm)`, segs.forearmCm, LM.LEFT_ELBOW, LM.LEFT_WRIST, 0.6);
  }

  // Fallback if few rigid segments passed strict visibility: use nose-to-ankle height estimate
  if (samples.length === 0) {
    const noseY = px(LM.NOSE).y;
    const spanPx = Math.max(80, floorY - noseY);
    const approxEyeCm = profile.dimensions.B3;
    const cmPerPixel = approxEyeCm / spanPx;
    return {
      cmPerPixel,
      methodUsed: 'auto_anthropometry',
      detectedView,
      confidence: 0.45,
      segmentsUsed: [
        {
          segmentKey: 'B3',
          label: `Fallback Tinggi Mata B3 (${approxEyeCm} cm)`,
          realCm: approxEyeCm,
          pixelLength: Math.round(spanPx),
          cmPerPixel,
          visibility: 0.5,
        },
      ],
      floorY,
    };
  }

  // Robust median scale across visible rigid body segments to resist single-joint foreshortening
  const scales = samples.map((s) => s.cmPerPixel);
  const cmPerPixel = median(scales);

  // Confidence reflects number of corroborating segments and their agreement
  const avgVis = samples.reduce((acc, s) => acc + s.visibility, 0) / samples.length;
  const maxDev = Math.max(...scales.map((s) => Math.abs(s - cmPerPixel) / cmPerPixel));
  const agreement = Math.max(0.4, 1 - maxDev);
  const confidence = Number(Math.min(0.95, avgVis * agreement * (samples.length >= 2 ? 1.0 : 0.8)).toFixed(2));

  return {
    cmPerPixel,
    methodUsed: 'auto_anthropometry',
    detectedView,
    confidence,
    segmentsUsed: samples,
    floorY,
  };
}
