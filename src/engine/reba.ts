import type { BodyAngles, CouplingQuality, RebaResult, TaskParameters } from '../types/ergo';

// REBA Table A: [trunk 1..5][neck 1..3][legs 1..4] (Hignett & McAtamney, 2000)
const REBA_TABLE_A: number[][][] = [
  [
    [1, 2, 3, 4],
    [1, 2, 3, 4],
    [3, 3, 5, 6],
  ],
  [
    [2, 3, 4, 5],
    [3, 4, 5, 6],
    [4, 5, 6, 7],
  ],
  [
    [2, 4, 5, 6],
    [4, 5, 6, 7],
    [5, 6, 7, 8],
  ],
  [
    [3, 5, 6, 7],
    [5, 6, 7, 8],
    [6, 7, 8, 9],
  ],
  [
    [4, 6, 7, 8],
    [6, 7, 8, 9],
    [7, 8, 9, 9],
  ],
];

// REBA Table B: [upperArm 1..6][lowerArm 1..2][wrist 1..3]
const REBA_TABLE_B: number[][][] = [
  [
    [1, 2, 2],
    [1, 2, 3],
  ],
  [
    [1, 2, 3],
    [2, 3, 4],
  ],
  [
    [3, 4, 5],
    [4, 5, 5],
  ],
  [
    [4, 5, 5],
    [5, 6, 7],
  ],
  [
    [6, 7, 8],
    [7, 8, 8],
  ],
  [
    [7, 8, 8],
    [8, 9, 9],
  ],
];

// REBA Table C: [scoreA 1..12][scoreB 1..12]
const REBA_TABLE_C: number[][] = [
  [1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7],
  [1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8],
  [2, 3, 3, 3, 4, 5, 6, 7, 7, 8, 8, 8],
  [3, 4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9],
  [4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9, 9],
  [6, 6, 6, 7, 8, 8, 9, 9, 10, 10, 10, 10],
  [7, 7, 7, 8, 9, 9, 9, 10, 10, 11, 11, 11],
  [8, 8, 8, 9, 10, 10, 10, 10, 10, 11, 11, 11],
  [9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12],
  [10, 10, 10, 11, 11, 11, 11, 12, 12, 12, 12, 12],
  [11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12],
  [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
];

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function couplingToRebaScore(coupling: CouplingQuality): number {
  if (coupling === 'good') return 0;
  if (coupling === 'fair') return 1;
  return 2; // poor
}

export function calculateReba(
  angles: BodyAngles,
  params: Pick<
    TaskParameters,
    | 'loadWeightKg'
    | 'coupling'
    | 'frequencyPerMin'
    | 'staticPostureOver1Min'
    | 'rapidLargeChange'
    | 'shockOrForceBuildup'
    | 'armSupported'
  >,
  side: 'left' | 'right' = angles.dominantSide
): RebaResult {
  // 1. Trunk score (1..5)
  const trunkDeg = angles.trunkFlexionDeg;
  let trunkScore = 1;
  if (Math.abs(trunkDeg) <= 5) {
    trunkScore = 1;
  } else if (trunkDeg > 5 && trunkDeg <= 20) {
    trunkScore = 2;
  } else if (trunkDeg < -5 && trunkDeg >= -20) {
    trunkScore = 2;
  } else if ((trunkDeg > 20 && trunkDeg <= 60) || trunkDeg < -20) {
    trunkScore = 3;
  } else {
    trunkScore = 4;
  }
  if (Math.abs(angles.trunkTwistDeg) > 15 || Math.abs(angles.trunkSideBendDeg) > 12) {
    trunkScore += 1;
  }
  trunkScore = clamp(trunkScore, 1, 5);

  // 2. Neck score (1..3)
  let neckScore = angles.neckFlexionDeg >= 0 && angles.neckFlexionDeg <= 20 ? 1 : 2;
  if (Math.abs(angles.neckTwistDeg) > 15 || Math.abs(angles.neckSideBendDeg) > 12) {
    neckScore += 1;
  }
  neckScore = clamp(neckScore, 1, 3);

  // 3. Legs score (1..4)
  const kneeDiff = Math.abs(angles.leftKneeFlexionDeg - angles.rightKneeFlexionDeg);
  let legsScore = kneeDiff > 25 ? 2 : 1; // unilateral / asymmetric weight bearing
  if (angles.maxKneeFlexionDeg > 60) {
    legsScore += 2;
  } else if (angles.maxKneeFlexionDeg >= 30) {
    legsScore += 1;
  }
  legsScore = clamp(legsScore, 1, 4);

  const tableAScore = REBA_TABLE_A[trunkScore - 1][neckScore - 1][legsScore - 1];

  // Load/Force score
  let loadScore = 0;
  if (params.loadWeightKg > 10) {
    loadScore = 2;
  } else if (params.loadWeightKg >= 5) {
    loadScore = 1;
  }
  if (params.shockOrForceBuildup) {
    loadScore += 1;
  }
  const scoreA = clamp(tableAScore + loadScore, 1, 12);

  // 4. Upper Arm score (1..6)
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

  // 5. Lower Arm score (1..2)
  const laDeg = side === 'left' ? angles.leftLowerArmFlexionDeg : angles.rightLowerArmFlexionDeg;
  const lowerArmScore = laDeg >= 60 && laDeg <= 100 ? 1 : 2;

  // 6. Wrist score (1..3)
  const wristDeg = Math.abs(side === 'left' ? angles.leftWristFlexionDeg : angles.rightWristFlexionDeg);
  let wristScore = wristDeg <= 15 ? 1 : 2;
  if (wristDeg > 30) {
    wristScore += 1; // proxy for deviation/twist when hand flexes strongly
  }
  wristScore = clamp(wristScore, 1, 3);

  const tableBScore = REBA_TABLE_B[upperArmScore - 1][lowerArmScore - 1][wristScore - 1];
  const couplingScore = couplingToRebaScore(params.coupling);
  const scoreB = clamp(tableBScore + couplingScore, 1, 12);

  // Table C + Activity Score
  const tableCScore = REBA_TABLE_C[scoreA - 1][scoreB - 1];
  let activityScore = 0;
  if (params.staticPostureOver1Min) activityScore += 1;
  if (params.frequencyPerMin > 4) activityScore += 1;
  if (params.rapidLargeChange) activityScore += 1;

  const finalScore = clamp(tableCScore + activityScore, 1, 15);

  if (finalScore === 1) {
    return {
      side,
      trunkScore,
      neckScore,
      legsScore,
      tableAScore,
      loadScore,
      scoreA,
      upperArmScore,
      lowerArmScore,
      wristScore,
      tableBScore,
      couplingScore,
      scoreB,
      tableCScore,
      activityScore,
      finalScore,
      riskLevel: 'Negligible',
      riskLevelId: 'Sangat Rendah (Dapat Diabaikan)',
      actionLevel: 0,
      recommendation: 'Tidak diperlukan tindakan perbaikan.',
    };
  }
  if (finalScore <= 3) {
    return {
      side,
      trunkScore,
      neckScore,
      legsScore,
      tableAScore,
      loadScore,
      scoreA,
      upperArmScore,
      lowerArmScore,
      wristScore,
      tableBScore,
      couplingScore,
      scoreB,
      tableCScore,
      activityScore,
      finalScore,
      riskLevel: 'Low',
      riskLevelId: 'Rendah',
      actionLevel: 1,
      recommendation: 'Perubahan postur mungkin diperlukan untuk peningkatan kenyamanan.',
    };
  }
  if (finalScore <= 7) {
    return {
      side,
      trunkScore,
      neckScore,
      legsScore,
      tableAScore,
      loadScore,
      scoreA,
      upperArmScore,
      lowerArmScore,
      wristScore,
      tableBScore,
      couplingScore,
      scoreB,
      tableCScore,
      activityScore,
      finalScore,
      riskLevel: 'Medium',
      riskLevelId: 'Sedang',
      actionLevel: 2,
      recommendation: 'Perlu investigasi lebih lanjut dan perbaikan postur/area kerja segera.',
    };
  }
  if (finalScore <= 10) {
    return {
      side,
      trunkScore,
      neckScore,
      legsScore,
      tableAScore,
      loadScore,
      scoreA,
      upperArmScore,
      lowerArmScore,
      wristScore,
      tableBScore,
      couplingScore,
      scoreB,
      tableCScore,
      activityScore,
      finalScore,
      riskLevel: 'High',
      riskLevelId: 'Tinggi',
      actionLevel: 3,
      recommendation: 'Segera investigasi dan terapkan perubahan ergonomis pada tugas.',
    };
  }
  return {
    side,
    trunkScore,
    neckScore,
    legsScore,
    tableAScore,
    loadScore,
    scoreA,
    upperArmScore,
    lowerArmScore,
    wristScore,
    tableBScore,
    couplingScore,
    scoreB,
    tableCScore,
    activityScore,
    finalScore,
    riskLevel: 'Very High',
    riskLevelId: 'Sangat Tinggi',
    actionLevel: 4,
    recommendation: 'Lakukan perbaikan ergonomis sekarang juga (prioritas kritis).',
  };
}
