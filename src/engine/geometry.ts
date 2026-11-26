import type {
  BodyAngles,
  CalibrationResult,
  ErgonomicZones,
  NioshLiveGeometry,
  Point2D,
  PoseLandmark2D,
} from '../types/ergo';

// MediaPipe Pose 33-landmark indices
export const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export function toPixel(lm: PoseLandmark2D, width: number, height: number): Point2D {
  return { x: lm.x * width, y: lm.y * height };
}

export function dist2D(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint2D(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function angleBetween3D(
  a: { x: number; y: number; z: number },
  vertex: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): number {
  const v1 = { x: a.x - vertex.x, y: a.y - vertex.y, z: a.z - vertex.z };
  const v2 = { x: b.x - vertex.x, y: b.y - vertex.y, z: b.z - vertex.z };
  const mag1 = Math.hypot(v1.x, v1.y, v1.z);
  const mag2 = Math.hypot(v2.x, v2.y, v2.z);
  if (mag1 < 1e-6 || mag2 < 1e-6) return 0;
  const cos = Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y + v1.z * v2.z) / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function angleFromVertical2D(from: Point2D, to: Point2D): number {
  // Vector pointing UP in image coords is (0, -1)
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const mag = Math.hypot(dx, dy);
  if (mag < 1e-6) return 0;
  const cos = Math.max(-1, Math.min(1, -dy / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

function angleBetween2D(a: Point2D, vertex: Point2D, b: Point2D): number {
  const v1x = a.x - vertex.x;
  const v1y = a.y - vertex.y;
  const v2x = b.x - vertex.x;
  const v2y = b.y - vertex.y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 < 1e-6 || m2 < 1e-6) return 0;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (m1 * m2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function extractBodyAngles(
  landmarks2D: PoseLandmark2D[],
  width: number,
  height: number,
  worldLandmarks?: PoseLandmark2D[]
): BodyAngles {
  const px = (idx: number) => toPixel(landmarks2D[idx], width, height);
  const vis = (idx: number) => landmarks2D[idx]?.visibility ?? 1;

  const lSh = px(LM.LEFT_SHOULDER);
  const rSh = px(LM.RIGHT_SHOULDER);
  const lEl = px(LM.LEFT_ELBOW);
  const rEl = px(LM.RIGHT_ELBOW);
  const lWr = px(LM.LEFT_WRIST);
  const rWr = px(LM.RIGHT_WRIST);
  const lIdx = px(LM.LEFT_INDEX);
  const rIdx = px(LM.RIGHT_INDEX);
  const lHip = px(LM.LEFT_HIP);
  const rHip = px(LM.RIGHT_HIP);
  const lKnee = px(LM.LEFT_KNEE);
  const rKnee = px(LM.RIGHT_KNEE);
  const lAnk = px(LM.LEFT_ANKLE);
  const rAnk = px(LM.RIGHT_ANKLE);
  const lEar = px(LM.LEFT_EAR);
  const rEar = px(LM.RIGHT_EAR);

  const midSh = midpoint2D(lSh, rSh);
  const midHip = midpoint2D(lHip, rHip);
  const midEar = midpoint2D(lEar, rEar);

  // Facing sign: +1 if facing right in image, -1 if facing left
  const facingRight = px(LM.NOSE).x >= midSh.x ? 1 : -1;

  // Trunk flexion angle from vertical (0 = upright, >0 = forward bend)
  const rawTrunkAngle = angleFromVertical2D(midHip, midSh);
  const forwardComponent = (midSh.x - midHip.x) * facingRight;
  const trunkFlexionDeg = forwardComponent >= -5 ? rawTrunkAngle : -rawTrunkAngle;

  // Neck flexion relative to trunk vector (midHip->midSh vs midSh->midEar)
  const trunkVec = { x: midSh.x - midHip.x, y: midSh.y - midHip.y };
  const neckVec = { x: midEar.x - midSh.x, y: midEar.y - midSh.y };
  const tMag = Math.hypot(trunkVec.x, trunkVec.y) || 1;
  const nMag = Math.hypot(neckVec.x, neckVec.y) || 1;
  const dotTN = Math.max(-1, Math.min(1, (trunkVec.x * neckVec.x + trunkVec.y * neckVec.y) / (tMag * nMag)));
  const neckDelta = (Math.acos(dotTN) * 180) / Math.PI;
  const crossTN = (trunkVec.x * neckVec.y - trunkVec.y * neckVec.x) * facingRight;
  const neckFlexionDeg = crossTN >= 0 ? neckDelta : -neckDelta;

  // Trunk & neck side bend / twist using 3D world landmarks when available
  let trunkTwistDeg = 0;
  let trunkSideBendDeg = 0;
  let neckTwistDeg = 0;
  let neckSideBendDeg = 0;
  let asymmetryAngleDeg = 0;

  if (worldLandmarks && worldLandmarks.length >= 33) {
    const wLSh = worldLandmarks[LM.LEFT_SHOULDER];
    const wRSh = worldLandmarks[LM.RIGHT_SHOULDER];
    const wLHip = worldLandmarks[LM.LEFT_HIP];
    const wRHip = worldLandmarks[LM.RIGHT_HIP];
    const wLAnk = worldLandmarks[LM.LEFT_ANKLE];
    const wRAnk = worldLandmarks[LM.RIGHT_ANKLE];
    const wLWr = worldLandmarks[LM.LEFT_WRIST];
    const wRWr = worldLandmarks[LM.RIGHT_WRIST];
    const wLHeel = worldLandmarks[LM.LEFT_HEEL];
    const wRHeel = worldLandmarks[LM.RIGHT_HEEL];
    const wLFoot = worldLandmarks[LM.LEFT_FOOT_INDEX];
    const wRFoot = worldLandmarks[LM.RIGHT_FOOT_INDEX];

    // Horizontal XZ plane vectors for shoulder line vs hip line -> trunk twist
    const shXZ = { x: wRSh.x - wLSh.x, z: wRSh.z - wLSh.z };
    const hipXZ = { x: wRHip.x - wLHip.x, z: wRHip.z - wLHip.z };
    const shMag = Math.hypot(shXZ.x, shXZ.z) || 1;
    const hipMag = Math.hypot(hipXZ.x, hipXZ.z) || 1;
    const twistCos = Math.max(-1, Math.min(1, (shXZ.x * hipXZ.x + shXZ.z * hipXZ.z) / (shMag * hipMag)));
    trunkTwistDeg = (Math.acos(twistCos) * 180) / Math.PI;

    // Shoulder tilt in Y -> side bend proxy
    trunkSideBendDeg = (Math.atan2(Math.abs(wRSh.y - wLSh.y), shMag) * 180) / Math.PI;

    // Neck twist (ears vs shoulders in XZ)
    const earXZ = {
      x: worldLandmarks[LM.RIGHT_EAR].x - worldLandmarks[LM.LEFT_EAR].x,
      z: worldLandmarks[LM.RIGHT_EAR].z - worldLandmarks[LM.LEFT_EAR].z,
    };
    const earMag = Math.hypot(earXZ.x, earXZ.z) || 1;
    const nTwistCos = Math.max(-1, Math.min(1, (earXZ.x * shXZ.x + earXZ.z * shXZ.z) / (earMag * shMag)));
    neckTwistDeg = (Math.acos(nTwistCos) * 180) / Math.PI;
    neckSideBendDeg = (Math.atan2(Math.abs(worldLandmarks[LM.RIGHT_EAR].y - worldLandmarks[LM.LEFT_EAR].y), earMag) * 180) / Math.PI;

    // NIOSH Angle of Asymmetry (A): angle in horizontal XZ plane between sagittal foot facing line & ankle-mid to hand-mid vector
    const footFwd = {
      x: (wLFoot.x - wLHeel.x + (wRFoot.x - wRHeel.x)) / 2,
      z: (wLFoot.z - wLHeel.z + (wRFoot.z - wRHeel.z)) / 2,
    };
    const ankMid = { x: (wLAnk.x + wRAnk.x) / 2, z: (wLAnk.z + wRAnk.z) / 2 };
    const handMid = { x: (wLWr.x + wRWr.x) / 2, z: (wLWr.z + wRWr.z) / 2 };
    const loadVec = { x: handMid.x - ankMid.x, z: handMid.z - ankMid.z };
    const fMag = Math.hypot(footFwd.x, footFwd.z);
    const lMag = Math.hypot(loadVec.x, loadVec.z);
    if (fMag > 0.03 && lMag > 0.03) {
      const aCos = Math.max(-1, Math.min(1, (footFwd.x * loadVec.x + footFwd.z * loadVec.z) / (fMag * lMag)));
      asymmetryAngleDeg = Math.min(135, (Math.acos(aCos) * 180) / Math.PI);
    } else {
      asymmetryAngleDeg = trunkTwistDeg;
    }
  } else {
    // 2D fallback estimate for side bend & asymmetry
    const shWidthPx = Math.abs(rSh.x - lSh.x);
    trunkSideBendDeg = shWidthPx > 20 ? (Math.atan2(Math.abs(rSh.y - lSh.y), shWidthPx) * 180) / Math.PI : 0;
    const midAnk = midpoint2D(lAnk, rAnk);
    const midWr = midpoint2D(lWr, rWr);
    const midFoot = midpoint2D(px(LM.LEFT_FOOT_INDEX), px(LM.RIGHT_FOOT_INDEX));
    const footVec = { x: midFoot.x - midAnk.x, y: midFoot.y - midAnk.y };
    const handVec = { x: midWr.x - midAnk.x, y: midWr.y - midAnk.y };
    const fM = Math.hypot(footVec.x, footVec.y);
    const hM = Math.hypot(handVec.x, handVec.y);
    if (fM > 10 && hM > 10) {
      const c = Math.max(-1, Math.min(1, (footVec.x * handVec.x + footVec.y * handVec.y) / (fM * hM)));
      asymmetryAngleDeg = Math.min(135, (Math.acos(c) * 180) / Math.PI);
    }
  }

  // Knees flexion (0 = straight leg, >0 = bent knee)
  const leftKneeInterior =
    worldLandmarks && worldLandmarks.length >= 33
      ? angleBetween3D(worldLandmarks[LM.LEFT_HIP], worldLandmarks[LM.LEFT_KNEE], worldLandmarks[LM.LEFT_ANKLE])
      : angleBetween2D(lHip, lKnee, lAnk);
  const rightKneeInterior =
    worldLandmarks && worldLandmarks.length >= 33
      ? angleBetween3D(worldLandmarks[LM.RIGHT_HIP], worldLandmarks[LM.RIGHT_KNEE], worldLandmarks[LM.RIGHT_ANKLE])
      : angleBetween2D(rHip, rKnee, rAnk);
  const leftKneeFlexionDeg = Math.max(0, 180 - leftKneeInterior);
  const rightKneeFlexionDeg = Math.max(0, 180 - rightKneeInterior);
  const maxKneeFlexionDeg = Math.max(leftKneeFlexionDeg, rightKneeFlexionDeg);

  // Upper Arm flexion relative to trunk (shoulder-hip vs shoulder-elbow)
  const computeUpperArmFlex = (sh: Point2D, hip: Point2D, el: Point2D) => {
    const downTrunk = { x: hip.x - sh.x, y: hip.y - sh.y };
    const arm = { x: el.x - sh.x, y: el.y - sh.y };
    const m1 = Math.hypot(downTrunk.x, downTrunk.y) || 1;
    const m2 = Math.hypot(arm.x, arm.y) || 1;
    const c = Math.max(-1, Math.min(1, (downTrunk.x * arm.x + downTrunk.y * arm.y) / (m1 * m2)));
    const deg = (Math.acos(c) * 180) / Math.PI;
    const forward = (el.x - sh.x) * facingRight;
    return forward >= -10 ? deg : -deg;
  };
  const leftUpperArmFlexionDeg = computeUpperArmFlex(lSh, lHip, lEl);
  const rightUpperArmFlexionDeg = computeUpperArmFlex(rSh, rHip, rEl);

  // Lower Arm flexion (0 = fully extended straight arm, 90 = right angle at elbow)
  const leftElbowInterior =
    worldLandmarks && worldLandmarks.length >= 33
      ? angleBetween3D(worldLandmarks[LM.LEFT_SHOULDER], worldLandmarks[LM.LEFT_ELBOW], worldLandmarks[LM.LEFT_WRIST])
      : angleBetween2D(lSh, lEl, lWr);
  const rightElbowInterior =
    worldLandmarks && worldLandmarks.length >= 33
      ? angleBetween3D(worldLandmarks[LM.RIGHT_SHOULDER], worldLandmarks[LM.RIGHT_ELBOW], worldLandmarks[LM.RIGHT_WRIST])
      : angleBetween2D(rSh, rEl, rWr);
  const leftLowerArmFlexionDeg = Math.max(0, 180 - leftElbowInterior);
  const rightLowerArmFlexionDeg = Math.max(0, 180 - rightElbowInterior);

  // Wrist flexion (deviation from straight elbow->wrist->index line)
  const leftWristFlexionDeg = Math.max(0, 180 - angleBetween2D(lEl, lWr, lIdx));
  const rightWristFlexionDeg = Math.max(0, 180 - angleBetween2D(rEl, rWr, rIdx));

  // Shoulder raised / abducted proxies
  const earToShDistL = Math.abs(lEar.y - lSh.y);
  const earToShDistR = Math.abs(rEar.y - rSh.y);
  const torsoPx = Math.max(30, dist2D(midSh, midHip));
  const leftShoulderRaised = earToShDistL < torsoPx * 0.16 && Math.abs(trunkFlexionDeg) < 25;
  const rightShoulderRaised = earToShDistR < torsoPx * 0.16 && Math.abs(trunkFlexionDeg) < 25;

  const shWidthPx = Math.max(10, dist2D(lSh, rSh));
  const leftUpperArmAbducted = Math.abs(lEl.x - lSh.x) > shWidthPx * 0.9 && shWidthPx > torsoPx * 0.35;
  const rightUpperArmAbducted = Math.abs(rEl.x - rSh.x) > shWidthPx * 0.9 && shWidthPx > torsoPx * 0.35;

  // Slide 32 safety checks
  const feetVisible =
    vis(LM.LEFT_ANKLE) > 0.45 &&
    vis(LM.RIGHT_ANKLE) > 0.45 &&
    vis(LM.LEFT_HEEL) > 0.4 &&
    vis(LM.RIGHT_HEEL) > 0.4 &&
    landmarks2D[LM.LEFT_ANKLE].y <= 0.99 &&
    landmarks2D[LM.RIGHT_ANKLE].y <= 0.99;

  const kneelingSuspected = maxKneeFlexionDeg > 95;
  const wristHeightDiffPx = Math.abs(lWr.y - rWr.y);
  const oneHandSuspected = wristHeightDiffPx > torsoPx * 0.65 && vis(LM.LEFT_WRIST) > 0.5 && vis(LM.RIGHT_WRIST) > 0.5;

  // Dominant side: choose the arm with higher visibility or greater flexion
  const leftVis = (vis(LM.LEFT_SHOULDER) + vis(LM.LEFT_ELBOW) + vis(LM.LEFT_WRIST)) / 3;
  const rightVis = (vis(LM.RIGHT_SHOULDER) + vis(LM.RIGHT_ELBOW) + vis(LM.RIGHT_WRIST)) / 3;
  let dominantSide: 'left' | 'right' = rightVis >= leftVis ? 'right' : 'left';
  if (Math.abs(leftVis - rightVis) < 0.15) {
    dominantSide = Math.abs(leftUpperArmFlexionDeg) > Math.abs(rightUpperArmFlexionDeg) ? 'left' : 'right';
  }

  return {
    trunkFlexionDeg: round1(trunkFlexionDeg),
    trunkSideBendDeg: round1(trunkSideBendDeg),
    trunkTwistDeg: round1(trunkTwistDeg),
    neckFlexionDeg: round1(neckFlexionDeg),
    neckSideBendDeg: round1(neckSideBendDeg),
    neckTwistDeg: round1(neckTwistDeg),
    leftKneeFlexionDeg: round1(leftKneeFlexionDeg),
    rightKneeFlexionDeg: round1(rightKneeFlexionDeg),
    maxKneeFlexionDeg: round1(maxKneeFlexionDeg),
    leftUpperArmFlexionDeg: round1(leftUpperArmFlexionDeg),
    rightUpperArmFlexionDeg: round1(rightUpperArmFlexionDeg),
    leftShoulderRaised,
    rightShoulderRaised,
    leftUpperArmAbducted,
    rightUpperArmAbducted,
    leftLowerArmFlexionDeg: round1(leftLowerArmFlexionDeg),
    rightLowerArmFlexionDeg: round1(rightLowerArmFlexionDeg),
    leftWristFlexionDeg: round1(leftWristFlexionDeg),
    rightWristFlexionDeg: round1(rightWristFlexionDeg),
    asymmetryAngleDeg: round1(asymmetryAngleDeg),
    feetVisible,
    kneelingSuspected,
    oneHandSuspected,
    dominantSide,
  };
}

export function classifyHeightZone(V_cm: number, zones: ErgonomicZones): NioshLiveGeometry['heightZone'] {
  if (V_cm < zones.kneeCm) return 'Below Knee (Poor)';
  if (V_cm < zones.knuckleCm) return 'Knee–Knuckle (Fair)';
  if (V_cm <= zones.elbowCm) return 'Knuckle–Elbow (Preferred)';
  if (V_cm <= zones.shoulderCm) return 'Elbow–Shoulder (Fair)';
  return 'Above Shoulder (Poor)';
}

export function computeNioshLiveGeometry(
  landmarks2D: PoseLandmark2D[],
  width: number,
  height: number,
  calibration: CalibrationResult,
  angles: BodyAngles,
  zones: ErgonomicZones,
  customPins?: { ankleMidPx?: Point2D; handMidPx?: Point2D; floorY?: number }
): NioshLiveGeometry {
  const px = (idx: number) => toPixel(landmarks2D[idx], width, height);

  const lAnk = px(LM.LEFT_ANKLE);
  const rAnk = px(LM.RIGHT_ANKLE);
  const defaultAnkleMid = midpoint2D(lAnk, rAnk);

  // Hand grasp midpoint = center between both wrists & index knuckles (Slide 23 Figure 1)
  const lHand = midpoint2D(px(LM.LEFT_WRIST), px(LM.LEFT_INDEX));
  const rHand = midpoint2D(px(LM.RIGHT_WRIST), px(LM.RIGHT_INDEX));
  const defaultHandMid = midpoint2D(lHand, rHand);

  const ankleMidPx = customPins?.ankleMidPx ?? defaultAnkleMid;
  const handMidPx = customPins?.handMidPx ?? defaultHandMid;
  const floorY = customPins?.floorY ?? calibration.floorY;

  const floorProjectionPx: Point2D = { x: handMidPx.x, y: floorY };

  // Sagittal direction marker from ankle midpoint toward foot-index midpoint
  const midFoot = midpoint2D(px(LM.LEFT_FOOT_INDEX), px(LM.RIGHT_FOOT_INDEX));
  const sagittalDirectionPx: Point2D = {
    x: ankleMidPx.x + (midFoot.x - ankleMidPx.x) * 2.5,
    y: ankleMidPx.y + (midFoot.y - ankleMidPx.y) * 2.5,
  };

  // V = vertical height from floor line up to hands
  const V_px = Math.max(0, floorY - handMidPx.y);
  const V_cm = round1(V_px * calibration.cmPerPixel);

  // H = horizontal distance from ankle midpoint to hand projection on floor
  const H_px =
    calibration.detectedView === 'front_top'
      ? dist2D(ankleMidPx, handMidPx)
      : Math.abs(handMidPx.x - ankleMidPx.x);
  const H_cm = round1(H_px * calibration.cmPerPixel);

  return {
    ankleMidPx,
    handMidPx,
    floorProjectionPx,
    sagittalDirectionPx,
    V_cm,
    H_cm,
    A_deg: angles.asymmetryAngleDeg,
    heightZone: classifyHeightZone(V_cm, zones),
  };
}
