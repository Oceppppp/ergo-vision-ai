import type { BodyAngles, RulaResult, TaskParameters } from '../types/ergo';

// RULA Table A: rows = (UA 1..6) x (LA 1..3) = 18 rows; cols = (W 1..4) x (Twist 1..2) = 8 cols
const RULA_TABLE_A: number[][] = [
  // UA 1
  [1, 2, 2, 2, 2, 3, 3, 3],
  [2, 2, 2, 2, 3, 3, 3, 3],
  [2, 3, 3, 3, 3, 3, 4, 4],
  // UA 2
  [2, 3, 3, 3, 3, 4, 4, 4],
  [3, 3, 3, 3, 3, 4, 4, 4],
  [3, 4, 4, 4, 4, 4, 5, 5],
  // UA 3
  [3, 3, 4, 4, 4, 4, 5, 5],
  [3, 4, 4, 4, 4, 4, 5, 5],
  [4, 4, 4, 4, 4, 5, 5, 5],
  // UA 4
  [4, 4, 4, 4, 4, 5, 5, 5],
  [4, 4, 4, 4, 4, 5, 5, 5],
  [4, 4, 4, 5, 5, 5, 6, 6],
  // UA 5
  [5, 5, 5, 5, 5, 6, 6, 7],
  [5, 6, 6, 6, 6, 7, 7, 7],
  [6, 6, 6, 7, 7, 7, 7, 8],
  // UA 6
  [7, 7, 7, 7, 7, 8, 8, 9],
  [8, 8, 8, 8, 8, 9, 9, 9],
  [9, 9, 9, 9, 9, 9, 9, 9],
];

// RULA Table B: rows = Neck 1..6; cols = (Trunk 1..6) x (Legs 1..2) = 12 cols
const RULA_TABLE_B: number[][] = [
  [1, 3, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7],
  [2, 3, 2, 3, 4, 5, 5, 5, 6, 7, 7, 7],
  [3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 7],
  [5, 5, 5, 6, 6, 7, 7, 7, 7, 7, 8, 8],
  [7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8],
  [8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9],
];

// RULA Table C: rows = Score C (1..8+), cols = Score D (1..7+)
const RULA_TABLE_C: number[][] = [
  [1, 2, 3, 3, 4, 5, 5],
  [2, 2, 3, 4, 4, 5, 5],
  [3, 3, 3, 4, 4, 5, 6],
  [3, 3, 3, 4, 5, 6, 6],
  [4, 4, 4, 5, 6, 7, 7],
  [4, 4, 5, 6, 6, 7, 7],
  [5, 5, 6, 6, 7, 7, 7],
  [5, 5, 6, 7, 7, 7, 7],
];

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function calculateRula(
  angles: BodyAngles,
  params: Pick<
    TaskParameters,
    'loadWeightKg' | 'frequencyPerMin' | 'staticPostureOver1Min' | 'shockOrForceBuildup' | 'armSupported'
  >,
  side: 'left' | 'right' = angles.dominantSide
): RulaResult {
  // Group A: Upper Arm (1..6)
  const uaDeg = side === 'left' ? angles.leftUpperArmFlexionDeg : angles.rightUpperArmFlexionDeg;
  const shoulderRaised = side === 'left' ? angles.leftShoulderRaised : angles.rightShoulderRaised;
  const uaAbducted = side === 'left' ? angles.leftUpperArmAbducted : angles.rightUpperArmAbducted;

  let upperArmScore = 1;
  if (uaDeg >= -20 && uaDeg <= 20) {
    upperArmScore = 1;
  } else if ((uaDeg > 20 && uaDeg <= 45) || uaDeg < -20) {
    upperArmScore = 2;
  } else if (uaDeg > 45 && uaDeg <= 90) {
    upperArmScore = 3;
  } else {
    upperArmScore = 4;
  }
  if (shoulderRaised) upperArmScore += 1;
  if (uaAbducted) upperArmScore += 1;
  if (params.armSupported) upperArmScore -= 1;
  upperArmScore = clamp(upperArmScore, 1, 6);

  // Lower Arm (1..3)
  const laDeg = side === 'left' ? angles.leftLowerArmFlexionDeg : angles.rightLowerArmFlexionDeg;
  let lowerArmScore = laDeg >= 60 && laDeg <= 100 ? 1 : 2;
  if (uaAbducted) lowerArmScore += 1;
  lowerArmScore = clamp(lowerArmScore, 1, 3);

  // Wrist (1..4) & Wrist Twist (1..2)
  const wristDeg = Math.abs(side === 'left' ? angles.leftWristFlexionDeg : angles.rightWristFlexionDeg);
  let wristScore = 1;
  if (wristDeg <= 5) {
    wristScore = 1;
  } else if (wristDeg <= 15) {
    wristScore = 2;
  } else {
    wristScore = 3;
  }
  if (wristDeg > 30) wristScore += 1;
  wristScore = clamp(wristScore, 1, 4);

  const wristTwistScore = wristDeg > 25 ? 2 : 1;

  const rowA = (upperArmScore - 1) * 3 + (lowerArmScore - 1);
  const colA = (wristScore - 1) * 2 + (wristTwistScore - 1);
  const tableAScore = RULA_TABLE_A[rowA][colA];

  // Muscle Use & Force/Load
  const isStaticOrRepeated = params.staticPostureOver1Min || params.frequencyPerMin >= 4;
  const armMuscleScore = isStaticOrRepeated ? 1 : 0;

  let armForceScore = 0;
  if (params.loadWeightKg > 10 || params.shockOrForceBuildup) {
    armForceScore = 3;
  } else if (params.loadWeightKg >= 2) {
    armForceScore = isStaticOrRepeated ? 2 : 1;
  }
  const scoreC = tableAScore + armMuscleScore + armForceScore;

  // Group B: Neck (1..6)
  let neckScore = 1;
  if (angles.neckFlexionDeg < -5) {
    neckScore = 4; // extension
  } else if (angles.neckFlexionDeg <= 10) {
    neckScore = 1;
  } else if (angles.neckFlexionDeg <= 20) {
    neckScore = 2;
  } else {
    neckScore = 3;
  }
  if (Math.abs(angles.neckTwistDeg) > 15) neckScore += 1;
  if (Math.abs(angles.neckSideBendDeg) > 12) neckScore += 1;
  neckScore = clamp(neckScore, 1, 6);

  // Trunk (1..6)
  let trunkScore = 1;
  const trunkDeg = angles.trunkFlexionDeg;
  if (Math.abs(trunkDeg) <= 5) {
    trunkScore = 1;
  } else if (trunkDeg > 5 && trunkDeg <= 20) {
    trunkScore = 2;
  } else if (trunkDeg > 20 && trunkDeg <= 60) {
    trunkScore = 3;
  } else {
    trunkScore = 4;
  }
  if (Math.abs(angles.trunkTwistDeg) > 15) trunkScore += 1;
  if (Math.abs(angles.trunkSideBendDeg) > 12) trunkScore += 1;
  trunkScore = clamp(trunkScore, 1, 6);

  // Legs (1..2)
  const kneeDiff = Math.abs(angles.leftKneeFlexionDeg - angles.rightKneeFlexionDeg);
  const legsScore = kneeDiff > 25 || angles.maxKneeFlexionDeg > 60 ? 2 : 1;

  const colB = (trunkScore - 1) * 2 + (legsScore - 1);
  const tableBScore = RULA_TABLE_B[neckScore - 1][colB];

  const neckTrunkMuscleScore = armMuscleScore;
  const neckTrunkForceScore = armForceScore;
  const scoreD = tableBScore + neckTrunkMuscleScore + neckTrunkForceScore;

  const rowC = clamp(scoreC, 1, 8) - 1;
  const colC = clamp(scoreD, 1, 7) - 1;
  const finalScore = RULA_TABLE_C[rowC][colC];

  if (finalScore <= 2) {
    return {
      side,
      upperArmScore,
      lowerArmScore,
      wristScore,
      wristTwistScore,
      tableAScore,
      armMuscleScore,
      armForceScore,
      scoreC,
      neckScore,
      trunkScore,
      legsScore,
      tableBScore,
      neckTrunkMuscleScore,
      neckTrunkForceScore,
      scoreD,
      finalScore,
      riskLevel: 'Acceptable',
      riskLevelId: 'Aman (Dapat Diterima)',
      actionLevel: 1,
      recommendation: 'Postur dapat diterima jika tidak dipertahankan dalam waktu lama.',
    };
  }
  if (finalScore <= 4) {
    return {
      side,
      upperArmScore,
      lowerArmScore,
      wristScore,
      wristTwistScore,
      tableAScore,
      armMuscleScore,
      armForceScore,
      scoreC,
      neckScore,
      trunkScore,
      legsScore,
      tableBScore,
      neckTrunkMuscleScore,
      neckTrunkForceScore,
      scoreD,
      finalScore,
      riskLevel: 'Low',
      riskLevelId: 'Rendah (Perlu Observasi)',
      actionLevel: 2,
      recommendation: 'Diperlukan investigasi lebih lanjut; perbaikan postur mungkin diperlukan.',
    };
  }
  if (finalScore <= 6) {
    return {
      side,
      upperArmScore,
      lowerArmScore,
      wristScore,
      wristTwistScore,
      tableAScore,
      armMuscleScore,
      armForceScore,
      scoreC,
      neckScore,
      trunkScore,
      legsScore,
      tableBScore,
      neckTrunkMuscleScore,
      neckTrunkForceScore,
      scoreD,
      finalScore,
      riskLevel: 'Medium',
      riskLevelId: 'Sedang (Perlu Perbaikan Segera)',
      actionLevel: 3,
      recommendation: 'Segera lakukan investigasi dan ubah metode/tata letak kerja.',
    };
  }
  return {
    side,
    upperArmScore,
    lowerArmScore,
    wristScore,
    wristTwistScore,
    tableAScore,
    armMuscleScore,
    armForceScore,
    scoreC,
    neckScore,
    trunkScore,
    legsScore,
    tableBScore,
    neckTrunkMuscleScore,
    neckTrunkForceScore,
    scoreD,
    finalScore,
    riskLevel: 'High',
    riskLevelId: 'Tinggi (Tindakan Segera)',
    actionLevel: 4,
    recommendation: 'Investigasi dan lakukan perbaikan ergonomis sekarang juga.',
  };
}
