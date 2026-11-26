import type {
  CouplingQuality,
  NioshFullResult,
  NioshPointMeasurement,
  NioshPointResult,
  TaskParameters,
  WorkDurationCategory,
} from '../types/ergo';

export const NIOSH_LC_KG = 23;

interface FmRow {
  freq: number;
  shortLow: number; // <=1 hr, V < 75
  shortHigh: number; // <=1 hr, V >= 75
  modLow: number; // <=2 hrs, V < 75
  modHigh: number; // <=2 hrs, V >= 75
  longLow: number; // <=8 hrs, V < 75
  longHigh: number; // <=8 hrs, V >= 75
}

// Exact FM lookup table from Design of Manual Handling Task_online.ppt Slide 20
const FM_TABLE: FmRow[] = [
  { freq: 0.2, shortLow: 1.0, shortHigh: 1.0, modLow: 0.95, modHigh: 0.95, longLow: 0.85, longHigh: 0.85 },
  { freq: 0.5, shortLow: 0.97, shortHigh: 0.97, modLow: 0.92, modHigh: 0.92, longLow: 0.81, longHigh: 0.81 },
  { freq: 1, shortLow: 0.94, shortHigh: 0.94, modLow: 0.88, modHigh: 0.88, longLow: 0.75, longHigh: 0.75 },
  { freq: 2, shortLow: 0.91, shortHigh: 0.91, modLow: 0.84, modHigh: 0.84, longLow: 0.65, longHigh: 0.65 },
  { freq: 3, shortLow: 0.88, shortHigh: 0.88, modLow: 0.79, modHigh: 0.79, longLow: 0.55, longHigh: 0.55 },
  { freq: 4, shortLow: 0.84, shortHigh: 0.84, modLow: 0.72, modHigh: 0.72, longLow: 0.45, longHigh: 0.45 },
  { freq: 5, shortLow: 0.8, shortHigh: 0.8, modLow: 0.6, modHigh: 0.6, longLow: 0.35, longHigh: 0.35 },
  { freq: 6, shortLow: 0.75, shortHigh: 0.75, modLow: 0.5, modHigh: 0.5, longLow: 0.27, longHigh: 0.27 },
  { freq: 7, shortLow: 0.7, shortHigh: 0.7, modLow: 0.42, modHigh: 0.42, longLow: 0.22, longHigh: 0.22 },
  { freq: 8, shortLow: 0.6, shortHigh: 0.6, modLow: 0.35, modHigh: 0.35, longLow: 0.18, longHigh: 0.18 },
  { freq: 9, shortLow: 0.52, shortHigh: 0.52, modLow: 0.3, modHigh: 0.3, longLow: 0.0, longHigh: 0.15 },
  { freq: 10, shortLow: 0.45, shortHigh: 0.45, modLow: 0.26, modHigh: 0.26, longLow: 0.0, longHigh: 0.13 },
  { freq: 11, shortLow: 0.41, shortHigh: 0.41, modLow: 0.0, modHigh: 0.23, longLow: 0.0, longHigh: 0.0 },
  { freq: 12, shortLow: 0.37, shortHigh: 0.37, modLow: 0.0, modHigh: 0.21, longLow: 0.0, longHigh: 0.0 },
  { freq: 13, shortLow: 0.0, shortHigh: 0.34, modLow: 0.0, modHigh: 0.0, longLow: 0.0, longHigh: 0.0 },
  { freq: 14, shortLow: 0.0, shortHigh: 0.31, modLow: 0.0, modHigh: 0.0, longLow: 0.0, longHigh: 0.0 },
  { freq: 15, shortLow: 0.0, shortHigh: 0.28, modLow: 0.0, modHigh: 0.0, longLow: 0.0, longHigh: 0.0 },
];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeHM(H_cm: number): number {
  if (H_cm <= 25) return 1.0;
  if (H_cm > 63) return 0;
  return 25 / H_cm;
}

export function computeVM(V_cm: number): number {
  if (V_cm < 0) return Math.max(0, 1 - 0.003 * 75);
  if (V_cm > 175) return 0;
  return Math.max(0, 1 - 0.003 * Math.abs(V_cm - 75));
}

export function computeDM(D_cm: number): number {
  if (D_cm <= 25) return 1.0;
  if (D_cm > 175) return 0;
  return 0.82 + 4.5 / D_cm;
}

export function computeAM(A_deg: number): number {
  const absA = Math.abs(A_deg);
  if (absA > 135) return 0;
  return Math.max(0, 1 - 0.0032 * absA);
}

function getRowFm(row: FmRow, duration: WorkDurationCategory, V_cm: number): number {
  const isHigh = V_cm >= 75;
  if (duration === 'short') return isHigh ? row.shortHigh : row.shortLow;
  if (duration === 'moderate') return isHigh ? row.modHigh : row.modLow;
  return isHigh ? row.longHigh : row.longLow;
}

export function computeFM(
  frequencyPerMin: number,
  duration: WorkDurationCategory,
  V_cm: number
): number {
  if (frequencyPerMin <= 0.2) {
    return getRowFm(FM_TABLE[0], duration, V_cm);
  }
  if (frequencyPerMin > 15) {
    return 0;
  }

  for (let i = 0; i < FM_TABLE.length; i++) {
    if (Math.abs(FM_TABLE[i].freq - frequencyPerMin) < 1e-6) {
      return getRowFm(FM_TABLE[i], duration, V_cm);
    }
    if (i < FM_TABLE.length - 1 && frequencyPerMin > FM_TABLE[i].freq && frequencyPerMin < FM_TABLE[i + 1].freq) {
      const f0 = FM_TABLE[i].freq;
      const f1 = FM_TABLE[i + 1].freq;
      const v0 = getRowFm(FM_TABLE[i], duration, V_cm);
      const v1 = getRowFm(FM_TABLE[i + 1], duration, V_cm);
      const ratio = (frequencyPerMin - f0) / (f1 - f0);
      return v0 + (v1 - v0) * ratio;
    }
  }
  return 0;
}

export function computeCM(coupling: CouplingQuality, V_cm: number): number {
  if (coupling === 'good') return 1.0;
  if (coupling === 'fair') return V_cm < 75 ? 0.95 : 1.0;
  return 0.9;
}

export function evaluateNioshPoint(
  point: NioshPointMeasurement,
  D_cm: number,
  params: Pick<
    TaskParameters,
    'loadWeightKg' | 'frequencyPerMin' | 'durationCategory' | 'coupling' | 'useSlide41Rounding'
  >
): NioshPointResult {
  const rawHM = computeHM(point.H);
  const rawVM = computeVM(point.V);
  const rawDM = computeDM(D_cm);
  const rawAM = computeAM(point.A);
  const rawFM = computeFM(params.frequencyPerMin, params.durationCategory, point.V);
  const rawCM = computeCM(params.coupling, point.V);

  const HM = params.useSlide41Rounding ? round2(rawHM) : rawHM;
  const VM = params.useSlide41Rounding ? round2(rawVM) : rawVM;
  const DM = params.useSlide41Rounding ? round2(rawDM) : rawDM;
  const AM = params.useSlide41Rounding ? round2(rawAM) : rawAM;
  const FM = params.useSlide41Rounding ? round2(rawFM) : rawFM;
  const CM = params.useSlide41Rounding ? round2(rawCM) : rawCM;

  const rawRWL = NIOSH_LC_KG * HM * VM * DM * AM * FM * CM;
  const RWL = round2(rawRWL);
  const LI = RWL > 0 ? round2(params.loadWeightKg / RWL) : Infinity;

  const multipliers: Array<{ name: string; value: number }> = [
    { name: 'Jarak Horizontal (HM)', value: HM },
    { name: 'Ketinggian Vertikal (VM)', value: VM },
    { name: 'Jarak Perpindahan (DM)', value: DM },
    { name: 'Sudut Asimetri (AM)', value: AM },
    { name: 'Frekuensi Angkat (FM)', value: FM },
    { name: 'Kualitas Pegangan (CM)', value: CM },
  ];
  multipliers.sort((a, b) => a.value - b.value);

  return {
    LC: NIOSH_LC_KG,
    HM: round2(HM),
    VM: round2(VM),
    DM: round2(DM),
    AM: round2(AM),
    FM: round2(FM),
    CM: round2(CM),
    RWL,
    LI,
    isSafe: LI <= 1.0,
    limitingFactor: multipliers[0].name,
  };
}

export function evaluateFullNiosh(
  originPoint: NioshPointMeasurement,
  destinationPoint: NioshPointMeasurement,
  params: TaskParameters,
  flags?: { feetVisible?: boolean; kneelingSuspected?: boolean; oneHandSuspected?: boolean }
): NioshFullResult {
  const D = round2(Math.abs(destinationPoint.V - originPoint.V));
  const origin = evaluateNioshPoint(originPoint, D, params);
  const destination = evaluateNioshPoint(destinationPoint, D, params);

  const governingSide: 'origin' | 'destination' =
    params.significantControl && destination.LI > origin.LI ? 'destination' : 'origin';
  const governingLI = governingSide === 'destination' ? destination.LI : origin.LI;

  const slide32Warnings: string[] = [];
  if (flags?.oneHandSuspected) {
    slide32Warnings.push('Terdeteksi indikasi angkat 1 tangan (Slide 32: NIOSH hanya berlaku untuk 2 tangan).');
  }
  if (flags?.kneelingSuspected) {
    slide32Warnings.push('Terdeteksi postur jongkok/berlutut ekstrem (Slide 32: NIOSH berlaku untuk posisi berdiri).');
  }
  if (flags?.feetVisible === false) {
    slide32Warnings.push('Kaki tidak terlihat jelas di frame — pastikan kedua telapak kaki tampak agar pengukuran H & A sah.');
  }
  if (originPoint.H > 63 || destinationPoint.H > 63) {
    slide32Warnings.push('Jarak horizontal H melebihi 63 cm sehingga HM = 0 (RWL = 0).');
  }
  if (originPoint.A > 135 || destinationPoint.A > 135) {
    slide32Warnings.push('Sudut asimetri A melebihi 135° sehingga AM = 0 (RWL = 0).');
  }

  const redesignSuggestions: string[] = [];
  const worst = governingSide === 'destination' ? destination : origin;
  const worstPt = governingSide === 'destination' ? destinationPoint : originPoint;

  if (worst.HM < 0.85) {
    redesignSuggestions.push(
      `Dekatkan beban ke tubuh (saat ini H = ${round2(worstPt.H)} cm, HM = ${worst.HM}): sediakan ruang kaki di bawah rak/kotak stok agar H mendekati 25 cm (Slide 11 & 14).`
    );
  }
  if (worst.VM < 0.88) {
    redesignSuggestions.push(
      `Sesuaikan ketinggian permukaan kerja (V = ${round2(worstPt.V)} cm, VM = ${worst.VM}): naikkan alas tumpukan awal menggunakan palet/meja agar berada di rentang tinggi lutut–siku (~75 cm, Slide 11 & 14).`
    );
  }
  if (worst.AM < 0.95) {
    redesignSuggestions.push(
      `Kurangi sudut putaran tubuh (A = ${round2(worstPt.A)}°, AM = ${worst.AM}): atur tata letak asal dan rak tujuan sejajar atau latih pekerja memindahkan kaki, bukan memutar pinggang (Slide 8).`
    );
  }
  if (worst.CM < 1.0) {
    redesignSuggestions.push(
      `Tingkatkan kualitas pegangan (CM = ${worst.CM}): gunakan wadah/keranjang ber-handle atau kemasan dengan lubang pegangan optimal (Slide 13 & 29).`
    );
  }
  if (worst.DM < 0.92) {
    redesignSuggestions.push(
      `Perkecil jarak tempuh vertikal (D = ${D} cm, DM = ${worst.DM}) dengan menaikkan tinggi awal dan menurunkan tinggi rak tujuan (Slide 14).`
    );
  }
  if (governingLI > 1.0) {
    redesignSuggestions.push(
      `Karena LI = ${governingLI} (> 1), prioritaskan perancangan ulang tempat kerja, pengurangan berat beban/kemasan, rotasi kerja, atau penggunaan alat bantu mekanis seperti troli (Slide 12 & 35).`
    );
  } else if (redesignSuggestions.length === 0) {
    redesignSuggestions.push(
      `Nilai LI = ${governingLI} (≤ 1) berada pada kategori aman menurut NIOSH. Pertahankan teknik angkat dua tangan dan hindari memutar pinggang.`
    );
  }

  return {
    D,
    origin,
    destination,
    governingSide,
    governingLI,
    isSafe: governingLI <= 1.0,
    slide32Warnings,
    redesignSuggestions,
  };
}
