export interface AnthropometryDimensions {
  /** B2: Tinggi badan tegak (cm) */
  B2: number;
  /** B3: Tinggi mata berdiri (cm) */
  B3: number;
  /** B10: Tinggi bahu ke lantai (cm) */
  B10: number;
  /** B13: Tinggi siku ke lantai (cm) */
  B13: number;
  /** B14: Tinggi tangan/knuckle ke lantai (cm) */
  B14: number;
  /** B16: Lebar tubuh maksimal (cm) */
  B16: number;
  /** B18: Panjang jangkauan sampai kepalan tangan (cm) */
  B18: number;
  /** D1: Tinggi kepala duduk (cm) */
  D1: number;
  /** D2: Tinggi mata duduk (cm) */
  D2: number;
  /** D3: Pantat ke popliteal (cm) */
  D3: number;
  /** D4: Tinggi bahu duduk (cm) */
  D4: number;
  /** D6: Tinggi popliteal (cm) */
  D6: number;
  /** D7: Lutut ke lantai (cm) */
  D7: number;
  /** D9: Siku ke ujung jari (cm) */
  D9: number;
  /** D11: Tinggi siku duduk (cm) */
  D11: number;
  /** D12: Pantat ke tumit (cm) */
  D12: number;
  /** D13: Lebar bahu (cm) */
  D13: number;
  /** D14: Lebar pinggul duduk (cm) */
  D14: number;
  /** D21: Siku ke pergelangan tangan / panjang lengan bawah (cm) */
  D21: number;
  /** T1: Panjang telapak tangan (cm) */
  T1: number;
  /** T5: Panjang telapak kaki (cm) */
  T5: number;
  /** T6: Lebar telapak kaki (cm) */
  T6: number;
}

export interface StudentProfile {
  id: string;
  name: string;
  dimensions: AnthropometryDimensions;
  isCustom?: boolean;
}

export interface PoseLandmark2D {
  x: number; // normalized [0..1]
  y: number; // normalized [0..1]
  z: number;
  visibility?: number;
}

export interface Point2D {
  x: number; // pixel coordinates on canvas
  y: number; // pixel coordinates on canvas
}

export type CameraViewMode = 'auto' | 'side' | 'front_top';

export type CalibrationMethod = 'auto_anthropometry' | 'manual_reference';

export interface ManualReferenceLine {
  p1: Point2D;
  p2: Point2D;
  knownCm: number;
  label: string;
}

export interface SegmentScaleSample {
  segmentKey: string;
  label: string;
  realCm: number;
  pixelLength: number;
  cmPerPixel: number;
  visibility: number;
}

export interface CalibrationResult {
  cmPerPixel: number;
  methodUsed: CalibrationMethod;
  detectedView: 'side' | 'front_top';
  confidence: number; // 0..1
  segmentsUsed: SegmentScaleSample[];
  floorY: number; // pixel Y of floor anchored at heels
}

export interface ErgonomicZones {
  kneeCm: number; // D7
  knuckleCm: number; // B14
  elbowCm: number; // B13
  shoulderCm: number; // B10
  statureCm: number; // B2
}

export interface BodyAngles {
  trunkFlexionDeg: number; // 0 = upright, >0 = forward bend
  trunkSideBendDeg: number;
  trunkTwistDeg: number;
  neckFlexionDeg: number; // >0 = flexion, <0 = extension
  neckSideBendDeg: number;
  neckTwistDeg: number;
  leftKneeFlexionDeg: number;
  rightKneeFlexionDeg: number;
  maxKneeFlexionDeg: number;
  leftUpperArmFlexionDeg: number;
  rightUpperArmFlexionDeg: number;
  leftShoulderRaised: boolean;
  rightShoulderRaised: boolean;
  leftUpperArmAbducted: boolean;
  rightUpperArmAbducted: boolean;
  leftLowerArmFlexionDeg: number;
  rightLowerArmFlexionDeg: number;
  leftWristFlexionDeg: number;
  rightWristFlexionDeg: number;
  asymmetryAngleDeg: number; // NIOSH A (0..135+)
  feetVisible: boolean;
  kneelingSuspected: boolean;
  oneHandSuspected: boolean;
  dominantSide: 'left' | 'right';
}

export type CouplingQuality = 'good' | 'fair' | 'poor';
export type RebaCouplingQuality = 'good' | 'fair' | 'poor' | 'unacceptable';
export type WorkDurationCategory = 'short' | 'moderate' | 'long'; // <=1hr, <=2hr, <=8hr

export interface TaskParameters {
  department: string;
  jobTitle: string;
  jobDescription: string;
  analystName: string;
  date: string;
  loadWeightKg: number;
  objectLengthCm: number;
  objectWidthCm: number;
  objectHeightCm: number;
  shelfHeightCm: number;
  frequencyPerMin: number;
  durationCategory: WorkDurationCategory;
  coupling: CouplingQuality;
  significantControl: boolean;
  staticPostureOver1Min: boolean;
  rapidLargeChange: boolean;
  shockOrForceBuildup: boolean;
  armSupported: boolean;
  useSlide41Rounding: boolean;
}

export interface RebaResult {
  side: 'left' | 'right';
  trunkScore: number;
  neckScore: number;
  legsScore: number;
  tableAScore: number;
  loadScore: number;
  scoreA: number;
  upperArmScore: number;
  lowerArmScore: number;
  wristScore: number;
  tableBScore: number;
  couplingScore: number;
  scoreB: number;
  tableCScore: number;
  activityScore: number;
  finalScore: number;
  riskLevel: 'Negligible' | 'Low' | 'Medium' | 'High' | 'Very High';
  riskLevelId: string;
  actionLevel: 0 | 1 | 2 | 3 | 4;
  recommendation: string;
}

export interface RulaResult {
  side: 'left' | 'right';
  upperArmScore: number;
  lowerArmScore: number;
  wristScore: number;
  wristTwistScore: number;
  tableAScore: number;
  armMuscleScore: number;
  armForceScore: number;
  scoreC: number;
  neckScore: number;
  trunkScore: number;
  legsScore: number;
  tableBScore: number;
  neckTrunkMuscleScore: number;
  neckTrunkForceScore: number;
  scoreD: number;
  finalScore: number;
  riskLevel: 'Acceptable' | 'Low' | 'Medium' | 'High';
  riskLevelId: string;
  actionLevel: 1 | 2 | 3 | 4;
  recommendation: string;
}

export interface NioshPointMeasurement {
  H: number; // cm
  V: number; // cm
  A: number; // degrees
}

export interface NioshPointResult {
  LC: number;
  HM: number;
  VM: number;
  DM: number;
  AM: number;
  FM: number;
  CM: number;
  RWL: number;
  LI: number;
  isSafe: boolean;
  limitingFactor: string;
}

export interface NioshFullResult {
  D: number;
  origin: NioshPointResult;
  destination: NioshPointResult;
  governingSide: 'origin' | 'destination';
  governingLI: number;
  isSafe: boolean;
  slide32Warnings: string[];
  redesignSuggestions: string[];
}

export interface NioshLiveGeometry {
  ankleMidPx: Point2D;
  handMidPx: Point2D;
  floorProjectionPx: Point2D;
  sagittalDirectionPx: Point2D;
  V_cm: number;
  H_cm: number;
  A_deg: number;
  heightZone: 'Below Knee (Poor)' | 'Knee–Knuckle (Fair)' | 'Knuckle–Elbow (Preferred)' | 'Elbow–Shoulder (Fair)' | 'Above Shoulder (Poor)';
}

export interface CapturedMoment {
  kind: 'origin' | 'destination';
  timestampSec: number;
  annotatedImageDataUrl: string;
  rawMeasurements: NioshPointMeasurement;
  overrideMeasurements?: Partial<NioshPointMeasurement>;
  angles: BodyAngles;
  reba: RebaResult;
  rula: RulaResult;
  calibrationConfidence: number;
  calibrationNote: string;
}

export interface TimelineSample {
  timeSec: number;
  rebaScore: number;
  rulaScore: number;
  V_cm: number;
  H_cm: number;
  A_deg: number;
  trunkFlexionDeg: number;
  feetVisible: boolean;
}
