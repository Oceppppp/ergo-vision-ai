import type { AnthropometryDimensions, ErgonomicZones, StudentProfile } from '../types/ergo';

export const DIMENSION_META: Record<
  keyof AnthropometryDimensions,
  { code: string; label: string; group: 'Berdiri' | 'Duduk & Segmen' | 'Tangan & Kaki' }
> = {
  B2: { code: 'B2', label: 'Tinggi badan tegak', group: 'Berdiri' },
  B3: { code: 'B3', label: 'Tinggi mata berdiri', group: 'Berdiri' },
  B10: { code: 'B10', label: 'Bahu ke lantai', group: 'Berdiri' },
  B13: { code: 'B13', label: 'Siku ke lantai', group: 'Berdiri' },
  B14: { code: 'B14', label: 'Tinggi tangan ke lantai', group: 'Berdiri' },
  B16: { code: 'B16', label: 'Lebar tubuh maksimal', group: 'Berdiri' },
  B18: { code: 'B18', label: 'Panjang jangkauan sampai kepalan tangan', group: 'Berdiri' },
  D1: { code: 'D1', label: 'Tinggi kepala duduk', group: 'Duduk & Segmen' },
  D2: { code: 'D2', label: 'Tinggi mata duduk', group: 'Duduk & Segmen' },
  D3: { code: 'D3', label: 'Pantat ke popliteal', group: 'Duduk & Segmen' },
  D4: { code: 'D4', label: 'Tinggi bahu duduk', group: 'Duduk & Segmen' },
  D6: { code: 'D6', label: 'Tinggi popliteal', group: 'Duduk & Segmen' },
  D7: { code: 'D7', label: 'Lutut ke lantai', group: 'Duduk & Segmen' },
  D9: { code: 'D9', label: 'Siku ke ujung jari', group: 'Duduk & Segmen' },
  D11: { code: 'D11', label: 'Tinggi siku duduk', group: 'Duduk & Segmen' },
  D12: { code: 'D12', label: 'Pantat ke tumit', group: 'Duduk & Segmen' },
  D13: { code: 'D13', label: 'Lebar bahu', group: 'Duduk & Segmen' },
  D14: { code: 'D14', label: 'Lebar pinggul duduk', group: 'Duduk & Segmen' },
  D21: { code: 'D21', label: 'Siku ke pergelangan tangan', group: 'Duduk & Segmen' },
  T1: { code: 'T1', label: 'Panjang telapak tangan', group: 'Tangan & Kaki' },
  T5: { code: 'T5', label: 'Panjang telapak kaki', group: 'Tangan & Kaki' },
  T6: { code: 'T6', label: 'Lebar telapak kaki', group: 'Tangan & Kaki' },
};

const RAW_NAMES = [
  'Evan',
  'Keileen',
  'Raden',
  'Jose',
  'Joseph',
  'Arya',
  'Derrick',
  'Hansen',
  'Justin',
  'Callista',
  'Kelly',
  'Dev',
  'Anugrah',
  'Angel',
  'Hillary',
] as const;

const RAW_ROWS: Record<keyof AnthropometryDimensions, number[]> = {
  B2: [184.4, 173.3, 171.2, 172.4, 172.4, 167.9, 170.1, 169.5, 170.1, 163.5, 160.3, 159.1, 154.2, 150.4, 153.6],
  B3: [172.4, 163.9, 158.8, 160.1, 157, 155.3, 157.2, 155.7, 157.1, 148.6, 146.6, 147.4, 142.6, 139.9, 142.6],
  B10: [153.8, 147.3, 142.7, 142.7, 140.8, 138.1, 140, 140.4, 141.3, 134.7, 131.3, 135, 128.2, 125.5, 127.4],
  B13: [113.7, 110.4, 106.9, 105.9, 108.6, 104.2, 109.6, 101.1, 106.5, 101.1, 98, 99.8, 97.9, 95.7, 96.1],
  B14: [81, 77.5, 74.4, 75.6, 77.7, 68.6, 77.4, 70.1, 74.9, 70.1, 72.7, 71.5, 68.8, 65.8, 65.1],
  B16: [52.6, 50.1, 49.2, 42.2, 50, 55.2, 62.8, 42.3, 45.4, 44.6, 40.5, 47.3, 36.3, 37.8, 37.8],
  B18: [78.8, 77.2, 81.4, 76, 70.1, 71.8, 73.7, 75.2, 75.2, 71.5, 64, 75.4, 62.8, 64.7, 66.6],
  D1: [97.8, 94.4, 91, 92.6, 94, 92.1, 95.8, 90, 89.1, 85.7, 89.4, 82.6, 82.2, 80.8, 81],
  D2: [87.4, 80.6, 80.6, 80.6, 81.2, 80, 84.1, 77.6, 79.3, 72.6, 78.4, 72.4, 70.6, 70.2, 70.5],
  D3: [52.6, 50.9, 48.8, 47.2, 45.9, 49, 42.2, 43.9, 49, 47.2, 43.5, 45.6, 46.1, 41.9, 42.4],
  D4: [66.8, 62.1, 64.3, 63.1, 64, 62.9, 63.2, 61.2, 59.2, 55.6, 61.2, 57.8, 54.7, 54.2, 53.2],
  D6: [44.6, 43.1, 40.7, 42.5, 42.1, 40.4, 40.2, 42.5, 41.3, 39.7, 39.1, 39.9, 38.3, 36.5, 38],
  D7: [55.8, 56.4, 53.5, 51.8, 52.7, 52.7, 53.9, 52.8, 53.4, 50.1, 47, 50.4, 46.3, 46.2, 45.3],
  D9: [48.2, 50, 47, 44.5, 45.6, 45.6, 45.6, 45.6, 44.4, 42.3, 39.5, 42, 39.4, 37.5, 42],
  D11: [24.5, 22.4, 23.6, 26, 29.2, 24.7, 26.2, 19.5, 27.6, 23.4, 23.5, 22.8, 20.9, 23.9, 26.2],
  D12: [113.8, 118.9, 106.1, 109.1, 106.2, 99.5, 105.6, 104.4, 104.2, 102.1, 96.8, 106.8, 95.3, 96.6, 91.9],
  D13: [47.4, 44.3, 47.7, 42.9, 47.6, 46.8, 46.8, 51.8, 55.2, 37.8, 36.9, 52.4, 37.9, 46.3, 35.6],
  D14: [40.2, 43.3, 36.8, 35, 36.2, 40, 47, 33.8, 36.9, 38.2, 35.7, 29.7, 33.5, 33.7, 26.4],
  D21: [31.1, 32.7, 28.9, 29.5, 28.2, 28.4, 28.7, 28.7, 28.4, 26.8, 26.6, 26.5, 23.3, 24.8, 25.8],
  T1: [19.8, 20.3, 19.3, 17.2, 18.3, 18, 18.5, 18.5, 16.9, 17.3, 17.5, 17.8, 16.5, 16.2, 16.8],
  T5: [27.5, 25, 24, 23.5, 24, 23, 24, 25, 22.5, 22.4, 24, 23, 22, 19.5, 21.4],
  T6: [11, 10.8, 8.5, 9, 10, 8, 10, 10, 10, 8, 9, 9.5, 9, 7, 8.7],
};

export const CLASS_ANTHROPOMETRY: StudentProfile[] = RAW_NAMES.map((name, idx) => {
  const dimensions = {} as AnthropometryDimensions;
  (Object.keys(RAW_ROWS) as (keyof AnthropometryDimensions)[]).forEach((key) => {
    dimensions[key] = RAW_ROWS[key][idx];
  });
  return {
    id: name.toLowerCase(),
    name,
    dimensions,
  };
});

export function getErgonomicZones(profile: StudentProfile): ErgonomicZones {
  const d = profile.dimensions;
  return {
    kneeCm: d.D7,
    knuckleCm: d.B14,
    elbowCm: d.B13,
    shoulderCm: d.B10,
    statureCm: d.B2,
  };
}

export function getDerivedSegments(profile: StudentProfile) {
  const d = profile.dimensions;
  // Upper arm length approximated directly from shoulder-to-floor minus elbow-to-floor
  const upperArmCm = Math.max(20, Number((d.B10 - d.B13).toFixed(1)));
  // Ankle bone (malleolus) height is roughly 4.0% of standing stature (standard anthropometric ratio)
  const ankleHeightCm = Number((d.B2 * 0.04).toFixed(1));
  // MediaPipe KNEE landmark sits at femoral-tibial joint center (~2.5 cm below top-of-patella sitting D7)
  const kneeJointHeightCm = Math.max(30, Number((d.D7 - 2.5).toFixed(1)));
  const lowerLegBoneCm = Math.max(25, Number((kneeJointHeightCm - ankleHeightCm).toFixed(1)));
  // MediaPipe SHOULDER landmark sits at glenohumeral joint center (~2.5 cm below acromion B10)
  const shoulderJointHeightCm = Math.max(100, Number((d.B10 - 2.5).toFixed(1)));
  const shoulderToAnkleCm = Math.max(90, Number((shoulderJointHeightCm - ankleHeightCm).toFixed(1)));
  // MediaPipe shoulder-to-shoulder distance is glenohumeral center width (~0.82x bideltoid breadth D13)
  const shoulderJointWidthCm = Math.max(28, Number((d.D13 * 0.82).toFixed(1)));
  // Eye height standing (B3) directly aligns with MediaPipe LEFT_EYE/RIGHT_EYE landmarks!
  const eyeHeightCm = d.B3;
  // Shoulder-to-hip torso bone length from sitting shoulder height (D4) minus gluteal soft tissue (~10 cm)
  const torsoSegmentCm = Math.max(35, Number((d.D4 - 10).toFixed(1)));

  return {
    upperArmCm,
    forearmCm: d.D21,
    lowerLegBoneCm,
    kneeToFloorCm: d.D7,
    kneeJointHeightCm,
    shoulderJointHeightCm,
    shoulderToAnkleCm,
    shoulderWidthCm: d.D13,
    shoulderJointWidthCm,
    eyeHeightCm,
    footLengthCm: d.T5,
    ankleHeightCm,
    torsoSegmentCm,
  };
}

export function computeClassPercentiles(
  profiles: StudentProfile[],
  key: keyof AnthropometryDimensions
): { p5: number; p50: number; p95: number; mean: number; min: number; max: number } {
  const values = profiles.map((p) => p.dimensions[key]).sort((a, b) => a - b);
  if (values.length === 0) {
    return { p5: 0, p50: 0, p95: 0, mean: 0, min: 0, max: 0 };
  }
  const percentile = (p: number) => {
    const rank = (p / 100) * (values.length - 1);
    const lo = Math.floor(rank);
    const hi = Math.ceil(rank);
    const frac = rank - lo;
    return Number((values[lo] + (values[hi] - values[lo]) * frac).toFixed(1));
  };
  const mean = Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(1));
  return {
    p5: percentile(5),
    p50: percentile(50),
    p95: percentile(95),
    mean,
    min: values[0],
    max: values[values.length - 1],
  };
}

/**
 * Parse a class anthropometry CSV matching the uploaded format:
 * Row 0: ,,name1,name2,...
 * Following rows: idx,B2 (label),val1,val2,...
 */
export function parseAnthropometryCsv(csvText: string): StudentProfile[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const headerCells = lines[0].split(',').map((c) => c.trim());
  const names = headerCells.slice(2).filter((n) => n.length > 0);
  if (names.length === 0) return [];

  const dimKeys = Object.keys(DIMENSION_META) as (keyof AnthropometryDimensions)[];
  const parsed: Record<string, Partial<AnthropometryDimensions>> = {};
  names.forEach((n) => {
    parsed[n] = {};
  });

  for (let r = 1; r < lines.length; r++) {
    const cells = lines[r].split(',').map((c) => c.trim());
    const labelCell = cells[1] ?? '';
    const matchKey = dimKeys.find((k) => new RegExp(`^${k}\\b`, 'i').test(labelCell));
    if (!matchKey) continue;

    names.forEach((name, idx) => {
      const val = Number.parseFloat(cells[idx + 2]);
      if (!Number.isNaN(val) && val > 0) {
        parsed[name][matchKey] = val;
      }
    });
  }

  return names
    .map((name) => {
      const dims = parsed[name];
      const base = CLASS_ANTHROPOMETRY[4].dimensions; // fallback if partial CSV
      const fullDims = { ...base, ...dims } as AnthropometryDimensions;
      const prettyName = name.charAt(0).toUpperCase() + name.slice(1);
      return {
        id: name.toLowerCase(),
        name: prettyName,
        dimensions: fullDims,
        isCustom: true,
      };
    })
    .filter((p) => p.dimensions.B2 > 0);
}
