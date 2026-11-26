import { describe, expect, it } from 'vitest';
import {
  CLASS_ANTHROPOMETRY,
  computeClassPercentiles,
  getDerivedSegments,
  getErgonomicZones,
  parseAnthropometryCsv,
} from '../../data/anthropometry';
import { calibrateFromAnthropometry } from '../calibration';
import { computeNioshLiveGeometry, extractBodyAngles, LM } from '../geometry';
import { evaluateFullNiosh } from '../niosh';
import { calculateReba } from '../reba';
import { calculateRula } from '../rula';
import { generateWorksheetDocx } from '../../export/docxExporter';
import type { BodyAngles, PoseLandmark2D, TaskParameters } from '../../types/ergo';

function createSyntheticPose(overrides: Partial<Record<number, Partial<PoseLandmark2D>>> = {}): PoseLandmark2D[] {
  // Standing upright side view facing right on a 1000x1000 canvas (1 px = 0.25 cm -> 4 px/cm)
  const base: PoseLandmark2D[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.95,
  }));

  // Joseph B10=140.8cm, B13=108.6cm, D21=28.2cm, D7=52.7cm, T5=24cm
  // Floor at y = 0.90 (900px); scale = 4 px/cm (0.25 cm/px)
  const cmToY = (cm: number) => (900 - cm * 4) / 1000;
  const cmToX = (dxCm: number) => (400 + dxCm * 4) / 1000;

  base[LM.NOSE] = { x: cmToX(8), y: cmToY(160), z: 0, visibility: 0.95 };
  base[LM.LEFT_EAR] = { x: cmToX(0), y: cmToY(161), z: -0.05, visibility: 0.9 };
  base[LM.RIGHT_EAR] = { x: cmToX(0), y: cmToY(161), z: 0.05, visibility: 0.95 };
  base[LM.LEFT_SHOULDER] = { x: cmToX(0), y: cmToY(140.8), z: -0.1, visibility: 0.9 };
  base[LM.RIGHT_SHOULDER] = { x: cmToX(0), y: cmToY(140.8), z: 0.1, visibility: 0.98 };
  base[LM.LEFT_ELBOW] = { x: cmToX(2), y: cmToY(108.6), z: -0.1, visibility: 0.9 };
  base[LM.RIGHT_ELBOW] = { x: cmToX(2), y: cmToY(108.6), z: 0.1, visibility: 0.98 };
  // Forearm extended forward 28.2 cm horizontally -> elbow flexed ~90 deg, hand at V = 108.6 cm, H = 30.2 cm
  base[LM.LEFT_WRIST] = { x: cmToX(30.2), y: cmToY(108.6), z: -0.1, visibility: 0.9 };
  base[LM.RIGHT_WRIST] = { x: cmToX(30.2), y: cmToY(108.6), z: 0.1, visibility: 0.98 };
  base[LM.LEFT_INDEX] = { x: cmToX(35), y: cmToY(108.6), z: -0.1, visibility: 0.9 };
  base[LM.RIGHT_INDEX] = { x: cmToX(35), y: cmToY(108.6), z: 0.1, visibility: 0.98 };
  base[LM.LEFT_HIP] = { x: cmToX(0), y: cmToY(92), z: -0.1, visibility: 0.9 };
  base[LM.RIGHT_HIP] = { x: cmToX(0), y: cmToY(92), z: 0.1, visibility: 0.98 };
  base[LM.LEFT_KNEE] = { x: cmToX(0), y: cmToY(52.7), z: -0.1, visibility: 0.9 };
  base[LM.RIGHT_KNEE] = { x: cmToX(0), y: cmToY(52.7), z: 0.1, visibility: 0.98 };
  base[LM.LEFT_ANKLE] = { x: cmToX(0), y: cmToY(6.9), z: -0.1, visibility: 0.95 };
  base[LM.RIGHT_ANKLE] = { x: cmToX(0), y: cmToY(6.9), z: 0.1, visibility: 0.98 };
  base[LM.LEFT_HEEL] = { x: cmToX(-4), y: cmToY(0), z: -0.1, visibility: 0.95 };
  base[LM.RIGHT_HEEL] = { x: cmToX(-4), y: cmToY(0), z: 0.1, visibility: 0.98 };
  base[LM.LEFT_FOOT_INDEX] = { x: cmToX(20), y: cmToY(0), z: -0.1, visibility: 0.95 };
  base[LM.RIGHT_FOOT_INDEX] = { x: cmToX(20), y: cmToY(0), z: 0.1, visibility: 0.98 };

  Object.entries(overrides).forEach(([idxStr, val]) => {
    const idx = Number(idxStr);
    base[idx] = { ...base[idx], ...val };
  });

  return base;
}

describe('Anthropometry Dataset', () => {
  it('contains all 15 students with exact CSV values', () => {
    expect(CLASS_ANTHROPOMETRY).toHaveLength(15);
    const evan = CLASS_ANTHROPOMETRY.find((s) => s.id === 'evan')!;
    const joseph = CLASS_ANTHROPOMETRY.find((s) => s.id === 'joseph')!;
    const hillary = CLASS_ANTHROPOMETRY.find((s) => s.id === 'hillary')!;

    expect(evan.dimensions.B2).toBe(184.4);
    expect(evan.dimensions.T5).toBe(27.5);
    expect(joseph.dimensions.B2).toBe(172.4);
    expect(joseph.dimensions.B10).toBe(140.8);
    expect(joseph.dimensions.D21).toBe(28.2);
    expect(joseph.dimensions.D13).toBe(47.6);
    expect(hillary.dimensions.B2).toBe(153.6);
    expect(hillary.dimensions.T6).toBe(8.7);
  });

  it('computes percentiles and parses uploaded CSV properly', () => {
    const stats = computeClassPercentiles(CLASS_ANTHROPOMETRY, 'B2');
    expect(stats.min).toBe(150.4);
    expect(stats.max).toBe(184.4);
    expect(stats.p50).toBeCloseTo(169.5, 1);

    const miniCsv = `,,budi,siti\n1,B2 (tinggi badan tegak),175.0,160.0\n2,D21(siku ke pergelangan tangan),29.0,25.5`;
    const parsed = parseAnthropometryCsv(miniCsv);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe('Budi');
    expect(parsed[0].dimensions.B2).toBe(175);
    expect(parsed[1].dimensions.D21).toBe(25.5);
  });
});

describe('1991 Revised NIOSH Lifting Equation (PPT Slide 41 Verification)', () => {
  it('matches Slide 41 worked example (Loading Punch Press Stock) exactly', () => {
    const slide41Params: TaskParameters = {
      department: 'Production',
      jobTitle: 'Punch Press Operator',
      jobDescription: 'Load heavy reel onto punch press',
      analystName: 'Test',
      date: '2026-11-26',
      loadWeightKg: 19.96,
      objectLengthCm: 76.2,
      objectWidthCm: 30.48,
      objectHeightCm: 76.2,
      shelfHeightCm: 160.02,
      frequencyPerMin: 1 / 480,
      durationCategory: 'short',
      coupling: 'fair',
      significantControl: true,
      staticPostureOver1Min: false,
      rapidLargeChange: false,
      shockOrForceBuildup: false,
      armSupported: false,
      useSlide41Rounding: true,
    };

    const result = evaluateFullNiosh(
      { H: 58.42, V: 38.1, A: 0 },
      { H: 58.42, V: 160.02, A: 0 },
      slide41Params
    );

    expect(result.D).toBe(121.92);
    expect(result.origin.HM).toBe(0.43);
    expect(result.origin.VM).toBe(0.89);
    expect(result.origin.DM).toBe(0.86);
    expect(result.origin.AM).toBe(1);
    expect(result.origin.FM).toBe(1);
    expect(result.origin.CM).toBe(0.95);
    expect(result.origin.RWL).toBe(7.19);
    expect(result.origin.LI).toBe(2.78);

    expect(result.destination.VM).toBe(0.74);
    expect(result.destination.CM).toBe(1);
    expect(result.destination.RWL).toBe(6.29);
    expect(result.destination.LI).toBe(3.17);
    expect(result.governingSide).toBe('destination');
    expect(result.governingLI).toBe(3.17);
    expect(result.isSafe).toBe(false);
  });

  it('evaluates 5 kg Indomaret rice sack scenario accurately', () => {
    const params: TaskParameters = {
      department: 'Minimarket',
      jobTitle: 'Pramuniaga Indomaret',
      jobDescription: 'Pengangkatan karung beras 5 kg ke rak display',
      analystName: 'Joseph',
      date: '2026-11-26',
      loadWeightKg: 5,
      objectLengthCm: 35,
      objectWidthCm: 24,
      objectHeightCm: 10,
      shelfHeightCm: 85,
      frequencyPerMin: 2,
      durationCategory: 'short',
      coupling: 'poor',
      significantControl: true,
      staticPostureOver1Min: false,
      rapidLargeChange: false,
      shockOrForceBuildup: false,
      armSupported: false,
      useSlide41Rounding: true,
    };
    const res = evaluateFullNiosh(
      { H: 35, V: 15, A: 0 },
      { H: 35, V: 90, A: 30 },
      params
    );
    expect(res.D).toBe(75);
    expect(res.origin.RWL).toBe(9.65); // with Slide 41 2-decimal rounding: 23*0.71*0.82*0.88*1*0.91*0.90 = 9.65
    expect(res.isSafe).toBe(true);
    expect(res.governingLI).toBeLessThanOrEqual(1);
  });
});

describe('REBA & RULA Engines', () => {
  const neutralAngles: BodyAngles = {
    trunkFlexionDeg: 2,
    trunkSideBendDeg: 0,
    trunkTwistDeg: 0,
    neckFlexionDeg: 8,
    neckSideBendDeg: 0,
    neckTwistDeg: 0,
    leftKneeFlexionDeg: 5,
    rightKneeFlexionDeg: 5,
    maxKneeFlexionDeg: 5,
    leftUpperArmFlexionDeg: 10,
    rightUpperArmFlexionDeg: 10,
    leftShoulderRaised: false,
    rightShoulderRaised: false,
    leftUpperArmAbducted: false,
    rightUpperArmAbducted: false,
    leftLowerArmFlexionDeg: 80,
    rightLowerArmFlexionDeg: 80,
    leftWristFlexionDeg: 3,
    rightWristFlexionDeg: 3,
    asymmetryAngleDeg: 0,
    feetVisible: true,
    kneelingSuspected: false,
    oneHandSuspected: false,
    dominantSide: 'right',
  };

  const highRiskAngles: BodyAngles = {
    ...neutralAngles,
    trunkFlexionDeg: 70,
    trunkTwistDeg: 30,
    neckFlexionDeg: 28,
    leftKneeFlexionDeg: 65,
    rightKneeFlexionDeg: 65,
    maxKneeFlexionDeg: 65,
    rightUpperArmFlexionDeg: 95,
    rightLowerArmFlexionDeg: 30,
    rightWristFlexionDeg: 25,
    asymmetryAngleDeg: 35,
  };

  const baseParams = {
    loadWeightKg: 5,
    coupling: 'poor' as const,
    frequencyPerMin: 2,
    staticPostureOver1Min: false,
    rapidLargeChange: false,
    shockOrForceBuildup: false,
    armSupported: false,
  };

  it('scores neutral posture low and severe bending + twist + 5kg load high in REBA', () => {
    const low = calculateReba(neutralAngles, { ...baseParams, loadWeightKg: 2, coupling: 'good' });
    expect(low.finalScore).toBe(1);
    expect(low.actionLevel).toBe(0);

    const high = calculateReba(highRiskAngles, baseParams);
    expect(high.trunkScore).toBe(5); // >60 + twisted
    expect(high.loadScore).toBe(1); // 5 kg -> +1
    expect(high.couplingScore).toBe(2); // poor -> +2
    expect(high.finalScore).toBeGreaterThanOrEqual(10);
    expect(high.actionLevel).toBeGreaterThanOrEqual(3);
  });

  it('scores neutral posture acceptable and severe posture high in RULA', () => {
    const low = calculateRula(neutralAngles, { ...baseParams, loadWeightKg: 1 });
    expect(low.finalScore).toBeLessThanOrEqual(2);
    expect(low.actionLevel).toBe(1);

    const high = calculateRula(highRiskAngles, baseParams);
    expect(high.finalScore).toBe(7);
    expect(high.actionLevel).toBe(4);
  });
});

describe('Anthropometric Calibration & Geometry', () => {
  it('recovers accurate cm/px scale (0.25 cm/px) and V/H distances using Joseph anthropometry', () => {
    const joseph = CLASS_ANTHROPOMETRY.find((s) => s.id === 'joseph')!;
    const segs = getDerivedSegments(joseph);
    expect(segs.forearmCm).toBe(28.2);
    expect(segs.upperArmCm).toBe(32.2);

    const pose = createSyntheticPose();
    const cal = calibrateFromAnthropometry(pose, 1000, 1000, joseph, { cameraViewMode: 'side' });
    expect(cal.methodUsed).toBe('auto_anthropometry');
    expect(cal.cmPerPixel).toBeCloseTo(0.25, 2);
    expect(cal.confidence).toBeGreaterThan(0.75);

    const angles = extractBodyAngles(pose, 1000, 1000);
    expect(angles.feetVisible).toBe(true);
    expect(angles.trunkFlexionDeg).toBeLessThan(5);
    expect(angles.rightLowerArmFlexionDeg).toBeCloseTo(86.4, 0);

    const zones = getErgonomicZones(joseph);
    const geom = computeNioshLiveGeometry(pose, 1000, 1000, cal, angles, zones);
    expect(geom.V_cm).toBeCloseTo(108.6, 0);
    expect(geom.H_cm).toBeCloseTo(32.6, 0);
    expect(geom.heightZone).toBe('Knuckle–Elbow (Preferred)');
  });

  it('flags missing feet when ankles are clipped out of frame', () => {
    const pose = createSyntheticPose({
      [LM.LEFT_ANKLE]: { visibility: 0.1, y: 1.05 },
      [LM.RIGHT_ANKLE]: { visibility: 0.1, y: 1.05 },
    });
    const angles = extractBodyAngles(pose, 1000, 1000);
    expect(angles.feetVisible).toBe(false);
  });

  it('generates a valid DOCX JOB ANALYSIS WORKSHEET blob', async () => {
    const joseph = CLASS_ANTHROPOMETRY.find((s) => s.id === 'joseph')!;
    const params: TaskParameters = {
      department: 'Indomaret',
      jobTitle: 'Pramuniaga',
      jobDescription: 'Pengangkatan karung beras 5 kg',
      analystName: 'Joseph',
      date: '2026-11-26',
      loadWeightKg: 5,
      objectLengthCm: 35,
      objectWidthCm: 24,
      objectHeightCm: 10,
      shelfHeightCm: 85,
      frequencyPerMin: 2,
      durationCategory: 'short',
      coupling: 'poor',
      significantControl: true,
      staticPostureOver1Min: false,
      rapidLargeChange: false,
      shockOrForceBuildup: false,
      armSupported: false,
      useSlide41Rounding: true,
    };
    const origin = { H: 35, V: 15, A: 0 };
    const dest = { H: 35, V: 90, A: 30 };
    const niosh = evaluateFullNiosh(origin, dest, params);
    const blob = await generateWorksheetDocx({
      profile: joseph,
      params,
      originPoint: origin,
      destinationPoint: dest,
      niosh,
      originCapture: null,
      destinationCapture: null,
      timelineSamples: [],
    });

    const buf = new Uint8Array(await blob.arrayBuffer());
    expect(buf.byteLength).toBeGreaterThan(2000);
    // DOCX files are ZIP archives starting with ASCII "PK" (0x50, 0x4B)
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });
});
