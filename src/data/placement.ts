import type { PlacementSurfacePreset } from '../types/ergo';

export const PLACEMENT_PRESETS: Record<
  PlacementSurfacePreset,
  { label: string; defaultHeightCm: number | null }
> = {
  lantai: { label: 'Lantai', defaultHeightCm: 0 },
  palet: { label: 'Palet / Kotak Stok', defaultHeightCm: 10 },
  rak: { label: 'Rak Display / Penyimpanan', defaultHeightCm: 85 },
  meja: { label: 'Meja Kerja / Timbangan', defaultHeightCm: 80 },
  troli: { label: 'Troli / Keranjang', defaultHeightCm: 40 },
  bagasi: { label: 'Bagasi / Bak Kendaraan', defaultHeightCm: 100 },
  lainnya: { label: 'Lainnya (Tulis Sendiri)', defaultHeightCm: null },
};

export function formatPlacementLabel(
  preset: PlacementSurfacePreset,
  customName: string | undefined,
  heightCm: number | null
): string {
  const baseName =
    preset === 'lainnya'
      ? customName?.trim() || 'Permukaan Custom'
      : PLACEMENT_PRESETS[preset].label;

  if (heightCm === null || Number.isNaN(heightCm)) {
    return baseName;
  }
  return `${baseName} (${heightCm} cm)`;
}
