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
  LEFT_EYE: 2,
  RIGHT_EYE: 5,
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

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function toPixel(lm: PoseLandmark2D, width: number, height: number): Point2D {
  return { x: lm.x * width, y: lm.y * height };
}

export function dist2D(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint2D(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function mid3(a: Vec3, b: Vec3): Vec3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function norm3(v: Vec3): Vec3 {
  const m = Math.hypot(v.x, v.y, v.z);
  if (m < 1e-6) return { x: 0, y: 0, z: 0 };
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

function angleBetween3D(a: Vec3, vertex: Vec3, b: Vec3): number {
  const v1 = sub3(a, vertex);
  const v2 = sub3(b, vertex);
  const mag1 = Math.hypot(v1.x, v1.y, v1.z);
  const mag2 = Math.hypot(v2.x, v2.y, v2.z);
  if (mag1 < 1e-6 || mag2 < 1e-6) return 0;
  const cos = Math.max(-1, Math.min(1, dot3(v1, v2) / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function angleFromVertical2D(from: Point2D, to: Point2D): number {
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

/**
 * Computes a stable horizontal XZ unit vector representing the worker's neutral sagittal facing direction
 * (perpendicular to the inner-ankle stance line, oriented forward using heel-to-toe & pelvis vectors).
 */
function computeSagittalForwardXZ(world: PoseLandmark2D[]): { x: number; z: number } {
  const lAnk = world[LM.LEFT_ANKLE];
  const rAnk = world[LM.RIGHT_ANKLE];
  const lHeel = world[LM.LEFT_HEEL];
  const rHeel = world[LM.RIGHT_HEEL];
  const lFoot = world[LM.LEFT_FOOT_INDEX];
  const rFoot = world[LM.RIGHT_FOOT_INDEX];

  // Foot forward average vector in XZ
  const footFwd = {
    x: (lFoot.x - lHeel.x + (rFoot.x - rHeel.x)) / 2,
    z: (lFoot.z - lHeel.z + (rFoot.z - rHeel.z)) / 2,
  };
  const fMag = Math.hypot(footFwd.x, footFwd.z);

  // Stance lateral line (Left Ankle -> Right Ankle) in XZ; its perpendicular is much less noisy in Z!
  const latX = rAnk.x - lAnk.x;
  const latZ = rAnk.z - lAnk.z;
  const latMag = Math.hypot(latX, latZ);

  if (latMag > 0.08) {
    // Two candidate perpendiculars to stance line in XZ: (-latZ, latX) and (latZ, -latX)
    let px = -latZ / latMag;
    let pz = latX / latMag;
    // Choose the sign aligned with heel->toe forward direction (or nose/knees if feet are flat)
    const refX = fMag > 0.03 ? footFwd.x : world[LM.NOSE].x - (world[LM.LEFT_HIP].x + world[LM.RIGHT_HIP].x) / 2;
    const refZ = fMag > 0.03 ? footFwd.z : world[LM.NOSE].z - (world[LM.LEFT_HIP].z + world[LM.RIGHT_HIP].z) / 2;
    if (px * refX + pz * refZ < 0) {
      px = -px;
      pz = -pz;
    }

    if (fMag > 0.04) {
      const fx = footFwd.x / fMag;
      const fz = footFwd.z / fMag;
      // Blend 70% stance-perpendicular + 30% heel-to-toe for maximum stability
      const bx = px * 0.7 + fx * 0.3;
      const bz = pz * 0.7 + fz * 0.3;
      const bm = Math.hypot(bx, bz) || 1;
      return { x: bx / bm, z: bz / bm };
    }
    return { x: px, z: pz };
  }

  if (fMag > 0.03) {
    return { x: footFwd.x / fMag, z: footFwd.z / fMag };
  }
  return { x: 0, z: -1 };
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
  const facingRight = px(LM.NOSE).x >= midSh.x ? 1 : -1;

  const hasWorld = Boolean(worldLandmarks && worldLandmarks.length >= 33);

  let trunkFlexionDeg = 0;
  let trunkTwistDeg = 0;
  let trunkSideBendDeg = 0;
  let neckFlexionDeg = 0;
  let neckTwistDeg = 0;
  let neckSideBendDeg = 0;
  let asymmetryAngleDeg = 0;
  let leftUpperArmFlexionDeg = 0;
  let rightUpperArmFlexionDeg = 0;
  let leftUpperArmAbducted = false;
  let rightUpperArmAbducted = false;
  let leftArmCrossesMidline = false;
  let rightArmCrossesMidline = false;
  let leftLowerArmFlexionDeg = 0;
  let rightLowerArmFlexionDeg = 0;
  let leftWristFlexionDeg = 0;
  let rightWristFlexionDeg = 0;
  let leftKneeFlexionDeg = 0;
  let rightKneeFlexionDeg = 0;

  if (hasWorld && worldLandmarks) {
    const w = worldLandmarks;
    const wLSh = w[LM.LEFT_SHOULDER];
    const wRSh = w[LM.RIGHT_SHOULDER];
    const wLHip = w[LM.LEFT_HIP];
    const wRHip = w[LM.RIGHT_HIP];
    const wMidSh = mid3(wLSh, wRSh);
    const wMidHip = mid3(wLHip, wRHip);
    const wMidEar = mid3(w[LM.LEFT_EAR], w[LM.RIGHT_EAR]);
    const wNose = w[LM.NOSE];

    // Anatomical torso frame:
    // trunkUp = hip -> shoulder, torsoRight = leftHip -> rightHip, torsoForward = cross(torsoRight, trunkUp)
    const trunkVec = sub3(wMidSh, wMidHip);
    const trunkUp = norm3(trunkVec);
    const shRight = norm3(sub3(wRSh, wLSh));
    let torsoFwd = norm3(cross3(trunkUp, shRight));
    // Ensure torsoFwd points toward the nose side of the head
    if (dot3(torsoFwd, sub3(wNose, wMidEar)) < 0) {
      torsoFwd = { x: -torsoFwd.x, y: -torsoFwd.y, z: -torsoFwd.z };
    }

    // 1. Trunk Flexion (3D angle from gravity up (0,-1,0), signed positive when leaning forward)
    const cosUp = Math.max(-1, Math.min(1, -trunkUp.y));
    const magTrunkDeg = (Math.acos(cosUp) * 180) / Math.PI;
    // Check horizontal lean direction relative to pelvis/stance forward
    const pelvisFwd = computeSagittalForwardXZ(w);
    const leanDot = trunkUp.x * pelvisFwd.x + trunkUp.z * pelvisFwd.z;
    const signedTrunk = leanDot >= -0.15 ? magTrunkDeg : -magTrunkDeg;
    trunkFlexionDeg = Math.max(-45, Math.min(110, signedTrunk));

    // 2. Trunk Twist (shoulders vs hips in horizontal XZ) & Side Bend
    const shXZ = { x: wRSh.x - wLSh.x, z: wRSh.z - wLSh.z };
    const hipXZ = { x: wRHip.x - wLHip.x, z: wRHip.z - wLHip.z };
    const shMag = Math.hypot(shXZ.x, shXZ.z) || 1;
    const hipMag = Math.hypot(hipXZ.x, hipXZ.z) || 1;
    const twistCos = Math.max(-1, Math.min(1, (shXZ.x * hipXZ.x + shXZ.z * hipXZ.z) / (shMag * hipMag)));
    trunkTwistDeg = (Math.acos(twistCos) * 180) / Math.PI;
    trunkSideBendDeg = (Math.atan2(Math.abs(wRSh.y - wLSh.y), shMag) * 180) / Math.PI;

    // 3. Neck Flexion (3D signed angle between trunkUp and shoulder->ear vector)
    const neckDir = norm3(sub3(wMidEar, wMidSh));
    const neckMag = (Math.acos(Math.max(-1, Math.min(1, dot3(trunkUp, neckDir)))) * 180) / Math.PI;
    const neckForwardProj = dot3(neckDir, torsoFwd);
    // Natural standing ear sits slightly forward (~8 deg), so compare against slight neutral offset
    neckFlexionDeg = Math.max(-35, Math.min(60, neckForwardProj >= -0.05 ? neckMag : -neckMag));

    // Neck twist (ears vs shoulders in XZ) & side bend
    const earXZ = {
      x: w[LM.RIGHT_EAR].x - w[LM.LEFT_EAR].x,
      z: w[LM.RIGHT_EAR].z - w[LM.LEFT_EAR].z,
    };
    const earMag = Math.hypot(earXZ.x, earXZ.z) || 1;
    const nTwistCos = Math.max(-1, Math.min(1, (earXZ.x * shXZ.x + earXZ.z * shXZ.z) / (earMag * shMag)));
    neckTwistDeg = (Math.acos(nTwistCos) * 180) / Math.PI;
    neckSideBendDeg = (Math.atan2(Math.abs(w[LM.RIGHT_EAR].y - w[LM.LEFT_EAR].y), earMag) * 180) / Math.PI;

    // 4. NIOSH Asymmetry Angle A (Slide 25 Figure 2):
    // Angle in horizontal XZ plane between stance sagittal forward vector and ankle-mid -> hand-mid vector.
    // MediaPipe monocular pose exaggerates camera-axis Z-depth (~1.6-1.8x) when bending/reaching toward camera;
    // damping camera-axis Z (0.58x) prevents both H inflation and A underestimation during lateral twists!
    const ankMid = mid3(w[LM.LEFT_ANKLE], w[LM.RIGHT_ANKLE]);
    const handMid = mid3(
      mid3(w[LM.LEFT_WRIST], w[LM.LEFT_INDEX]),
      mid3(w[LM.RIGHT_WRIST], w[LM.RIGHT_INDEX])
    );
    const Z_DAMP = 0.48;
    const loadXZ = { x: handMid.x - ankMid.x, z: (handMid.z - ankMid.z) * Z_DAMP };
    const loadMag = Math.hypot(loadXZ.x, loadXZ.z);
    if (loadMag > 0.05) {
      const aCos = Math.max(-1, Math.min(1, (pelvisFwd.x * loadXZ.x + pelvisFwd.z * loadXZ.z) / loadMag));
      asymmetryAngleDeg = Math.min(135, (Math.acos(aCos) * 180) / Math.PI);
    } else {
      asymmetryAngleDeg = trunkTwistDeg;
    }

    // 5. 3D Upper Arm Flexion/Extension & True 3D Lateral Abduction
    const trunkDown = { x: -trunkUp.x, y: -trunkUp.y, z: -trunkUp.z };
    const compute3DUpperArm = (shPt: Vec3, elPt: Vec3, wrPt: Vec3, isRight: boolean) => {
      const armDir = norm3(sub3(elPt, shPt));
      const totalAngle = (Math.acos(Math.max(-1, Math.min(1, dot3(trunkDown, armDir)))) * 180) / Math.PI;
      const fwdComp = dot3(armDir, torsoFwd);
      const latSign = isRight ? 1 : -1;
      const latComp = dot3(armDir, shRight) * latSign; // >0 = outward abduction away from trunk
      const flexion = fwdComp >= -0.15 ? totalAngle : -totalAngle;
      const abducted = latComp > 0.36; // > ~21 deg outward abduction
      // Check if wrist crosses torso midline toward opposite side
      const wrOffsetLat = dot3(sub3(wrPt, wMidSh), shRight) * latSign;
      const crossesMidline = wrOffsetLat < -0.05;
      return { flexion, abducted, crossesMidline };
    };

    const uaL = compute3DUpperArm(wLSh, w[LM.LEFT_ELBOW], w[LM.LEFT_WRIST], false);
    const uaR = compute3DUpperArm(wRSh, w[LM.RIGHT_ELBOW], w[LM.RIGHT_WRIST], true);
    leftUpperArmFlexionDeg = uaL.flexion;
    rightUpperArmFlexionDeg = uaR.flexion;
    leftUpperArmAbducted = uaL.abducted;
    rightUpperArmAbducted = uaR.abducted;
    leftArmCrossesMidline = uaL.crossesMidline;
    rightArmCrossesMidline = uaR.crossesMidline;

    // 6. 3D Elbow (Lower Arm), Wrist, and Knee Flexion
    leftLowerArmFlexionDeg = Math.max(0, 180 - angleBetween3D(wLSh, w[LM.LEFT_ELBOW], w[LM.LEFT_WRIST]));
    rightLowerArmFlexionDeg = Math.max(0, 180 - angleBetween3D(wRSh, w[LM.RIGHT_ELBOW], w[LM.RIGHT_WRIST]));
    leftWristFlexionDeg = Math.max(0, 180 - angleBetween3D(w[LM.LEFT_ELBOW], w[LM.LEFT_WRIST], w[LM.LEFT_INDEX]));
    rightWristFlexionDeg = Math.max(0, 180 - angleBetween3D(w[LM.RIGHT_ELBOW], w[LM.RIGHT_WRIST], w[LM.RIGHT_INDEX]));
    leftKneeFlexionDeg = Math.max(0, 180 - angleBetween3D(wLHip, w[LM.LEFT_KNEE], w[LM.LEFT_ANKLE]));
    rightKneeFlexionDeg = Math.max(0, 180 - angleBetween3D(wRHip, w[LM.RIGHT_KNEE], w[LM.RIGHT_ANKLE]));
  } else {
    // 2D fallback (used in synthetic 2D unit tests when worldLandmarks are omitted)
    const rawTrunkAngle = angleFromVertical2D(midHip, midSh);
    const forwardComponent = (midSh.x - midHip.x) * facingRight;
    trunkFlexionDeg = Math.max(-45, Math.min(110, forwardComponent >= -5 ? rawTrunkAngle : -rawTrunkAngle));

    const trunkVec2 = { x: midSh.x - midHip.x, y: midSh.y - midHip.y };
    const neckVec2 = { x: midEar.x - midSh.x, y: midEar.y - midSh.y };
    const tMag = Math.hypot(trunkVec2.x, trunkVec2.y) || 1;
    const nMag = Math.hypot(neckVec2.x, neckVec2.y) || 1;
    const dotTN = Math.max(-1, Math.min(1, (trunkVec2.x * neckVec2.x + trunkVec2.y * neckVec2.y) / (tMag * nMag)));
    const neckDelta = (Math.acos(dotTN) * 180) / Math.PI;
    const crossTN = (trunkVec2.x * neckVec2.y - trunkVec2.y * neckVec2.x) * facingRight;
    neckFlexionDeg = Math.max(-35, Math.min(60, crossTN >= 0 ? neckDelta : -neckDelta));

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

    const computeUpperArm2D = (sh: Point2D, hip: Point2D, el: Point2D) => {
      const downTrunk = { x: hip.x - sh.x, y: hip.y - sh.y };
      const arm = { x: el.x - sh.x, y: el.y - sh.y };
      const m1 = Math.hypot(downTrunk.x, downTrunk.y) || 1;
      const m2 = Math.hypot(arm.x, arm.y) || 1;
      const c = Math.max(-1, Math.min(1, (downTrunk.x * arm.x + downTrunk.y * arm.y) / (m1 * m2)));
      const deg = (Math.acos(c) * 180) / Math.PI;
      const forward = (el.x - sh.x) * facingRight;
      return forward >= -10 ? deg : -deg;
    };
    leftUpperArmFlexionDeg = computeUpperArm2D(lSh, lHip, lEl);
    rightUpperArmFlexionDeg = computeUpperArm2D(rSh, rHip, rEl);
    leftLowerArmFlexionDeg = Math.max(0, 180 - angleBetween2D(lSh, lEl, lWr));
    rightLowerArmFlexionDeg = Math.max(0, 180 - angleBetween2D(rSh, rEl, rWr));
    leftWristFlexionDeg = Math.max(0, 180 - angleBetween2D(lEl, lWr, lIdx));
    rightWristFlexionDeg = Math.max(0, 180 - angleBetween2D(rEl, rWr, rIdx));
    leftKneeFlexionDeg = Math.max(0, 180 - angleBetween2D(lHip, lKnee, lAnk));
    rightKneeFlexionDeg = Math.max(0, 180 - angleBetween2D(rHip, rKnee, rAnk));
  }

  const maxKneeFlexionDeg = Math.max(leftKneeFlexionDeg, rightKneeFlexionDeg);

  // Shoulder raised proxy (ears close to shoulders when upright)
  const earToShDistL = Math.abs(lEar.y - lSh.y);
  const earToShDistR = Math.abs(rEar.y - rSh.y);
  const torsoPx = Math.max(30, dist2D(midSh, midHip));
  const leftShoulderRaised = earToShDistL < torsoPx * 0.14 && Math.abs(trunkFlexionDeg) < 25;
  const rightShoulderRaised = earToShDistR < torsoPx * 0.14 && Math.abs(trunkFlexionDeg) < 25;

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
  const oneHandSuspected =
    wristHeightDiffPx > torsoPx * 0.65 && vis(LM.LEFT_WRIST) > 0.5 && vis(LM.RIGHT_WRIST) > 0.5;

  // Dominant side selection
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
    leftArmCrossesMidline,
    rightArmCrossesMidline,
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
  customPins?: { ankleMidPx?: Point2D; handMidPx?: Point2D; floorY?: number },
  worldLandmarks?: PoseLandmark2D[]
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
  const baseFloorY = customPins?.floorY ?? calibration.floorY;

  // In a front-facing slightly elevated camera, an object on the floor in front of the toes
  // projects slightly lower on screen (near toe Y) than the heels further back.
  // When hands drop near floor level in front of the toes, anchor floor contact to toe ground plane so V reflects true height above floor!
  const toeFloorY = Math.max(px(LM.LEFT_FOOT_INDEX).y, px(LM.RIGHT_FOOT_INDEX).y, baseFloorY);
  const isLowFrontReach =
    !customPins?.floorY &&
    calibration.detectedView === 'front_top' &&
    handMidPx.y > baseFloorY - 22 / Math.max(0.05, calibration.cmPerPixel) &&
    angles.trunkFlexionDeg > 45;
  const floorY = isLowFrontReach ? toeFloorY : baseFloorY;

  const floorProjectionPx: Point2D = { x: handMidPx.x, y: floorY };

  // Sagittal direction marker from ankle midpoint toward foot-index midpoint
  const midFoot = midpoint2D(px(LM.LEFT_FOOT_INDEX), px(LM.RIGHT_FOOT_INDEX));
  const sagittalDirectionPx: Point2D = {
    x: ankleMidPx.x + (midFoot.x - ankleMidPx.x) * 2.5,
    y: ankleMidPx.y + (midFoot.y - ankleMidPx.y) * 2.5,
  };

  // Baseline 2D vertical height V and horizontal lateral X reach (exact in camera plane when standing anchor or manual ruler is active!)
  const V_px = Math.max(0, floorY - handMidPx.y);
  let V_cm = round1(V_px * calibration.cmPerPixel);

  const H_2D_x_cm = Math.abs(handMidPx.x - ankleMidPx.x) * calibration.cmPerPixel;
  let H_cm = round1(
    calibration.detectedView === 'front_top'
      ? Math.max(H_2D_x_cm, dist2D(ankleMidPx, handMidPx) * calibration.cmPerPixel)
      : H_2D_x_cm
  );

  const hasCustomPin = Boolean(customPins?.ankleMidPx || customPins?.handMidPx);
  const hasWorld = Boolean(worldLandmarks && worldLandmarks.length >= 33);

  // Combine exact camera-plane 2D X reach with monocular-damped 3D Z depth for H,
  // while keeping pure standing-calibrated 2D vertical height for V (gravity Y has zero foreshortening in upright camera views!).
  if (!hasCustomPin && hasWorld && worldLandmarks) {
    const w = worldLandmarks;
    const wScale = calibration.realCmPerWorldMeter;
    // Deep forward stoop facing camera produces stronger monocular Z-exaggeration in MediaPipe
    const Z_DAMP = calibration.detectedView === 'front_top' && angles.trunkFlexionDeg > 55 ? 0.42 : 0.48;

    const wFloorY = (w[LM.LEFT_HEEL].y + w[LM.RIGHT_HEEL].y) / 2;
    const wHand = mid3(mid3(w[LM.LEFT_WRIST], w[LM.LEFT_INDEX]), mid3(w[LM.RIGHT_WRIST], w[LM.RIGHT_INDEX]));
    const wAnk = mid3(w[LM.LEFT_ANKLE], w[LM.RIGHT_ANKLE]);

    // Depth component along camera Z-axis (damped) + lateral X component from exact 2D calibrated pixels!
    const dzCm = Math.abs(wHand.z - wAnk.z) * wScale * Z_DAMP;
    const dxWorldCm = Math.abs(wHand.x - wAnk.x) * wScale;
    const dxReliableCm =
      calibration.standingLocked || calibration.methodUsed === 'manual_reference'
        ? H_2D_x_cm
        : (H_2D_x_cm + dxWorldCm) / 2;

    const hCombinedCm = Math.hypot(dxReliableCm, dzCm);
    const v3DCm = Math.max(0, (wFloorY - wHand.y) * wScale);

    // 1) H_cm: exact 2D camera-plane X combined orthogonally with damped Z-depth
    if (hCombinedCm >= 8 && hCombinedCm <= 105) {
      H_cm = round1(hCombinedCm);
    }

    // 2) V_cm: trust standing-locked or manual-calibrated 2D vertical height directly (no 3D leg-length inflation!).
    // Only fall back to 3D V when perspective clips hands below the heel line while reaching forward toward camera.
    if (calibration.standingLocked || calibration.methodUsed === 'manual_reference') {
      if (V_cm < 4 && v3DCm > 4 && calibration.detectedView === 'front_top') {
        V_cm = round1(Math.min(v3DCm, 25));
      }
    } else if (v3DCm >= 0 && v3DCm <= zones.statureCm + 25) {
      V_cm = round1(V_cm * 0.65 + v3DCm * 0.35);
    }
  }

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
