import React, { useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowLeftRight, ArrowUp, CheckCircle2, Gauge, SlidersHorizontal } from 'lucide-react';
import { PLACEMENT_PRESETS } from '../data/placement';
import type {
  CameraViewMode,
  CouplingQuality,
  LiftDirection,
  NioshFullResult,
  PlacementSurfacePreset,
  StudentProfile,
  TaskParameters,
  WorkDurationCategory,
} from '../types/ergo';
import type { LiveFrameAnalysis } from './VideoCanvas';

interface MetricsPanelProps {
  profile: StudentProfile;
  params: TaskParameters;
  onParamsChange: (next: TaskParameters) => void;
  cameraViewMode: CameraViewMode;
  onCameraViewModeChange: (mode: CameraViewMode) => void;
  sideSelection: 'auto' | 'left' | 'right';
  onSideSelectionChange: (side: 'auto' | 'left' | 'right') => void;
  liveFrame: LiveFrameAnalysis | null;
  nioshResult: NioshFullResult;
}

function badgeClass(level: number, maxLevel: number): string {
  const ratio = level / maxLevel;
  if (ratio <= 0.25) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (ratio <= 0.5) return 'bg-amber-50 text-amber-800 border-amber-200';
  if (ratio <= 0.75) return 'bg-orange-50 text-orange-800 border-orange-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

export const MetricsPanel: React.FC<MetricsPanelProps> = ({
  profile,
  params,
  onParamsChange,
  cameraViewMode,
  onCameraViewModeChange,
  sideSelection,
  onSideSelectionChange,
  liveFrame,
  nioshResult,
}) => {
  const [activeTab, setActiveTab] = useState<'scores' | 'params'>('scores');

  const update = <K extends keyof TaskParameters>(key: K, value: TaskParameters[K]) => {
    onParamsChange({ ...params, [key]: value });
  };

  return (
    <aside className="flex flex-col gap-3 rounded-xl border border-[#D8E0E8] bg-white p-3.5">
      {/* Inspector Tab Switcher */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('scores')}
          className={`inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold cursor-pointer ${
            activeTab === 'scores' ? 'bg-white text-[#142130] shadow-xs' : 'text-[#516275]'
          }`}
        >
          <Gauge className="h-3.5 w-3.5" />
          Live Analisis
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('params')}
          className={`inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold cursor-pointer ${
            activeTab === 'params' ? 'bg-white text-[#142130] shadow-xs' : 'text-[#516275]'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Parameter Tugas
        </button>
      </div>

      {activeTab === 'scores' ? (
        <div className="space-y-3">
          {/* 3-Card Headline Scores */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 text-center">
              <div className="text-[11px] font-semibold text-[#516275]">REBA</div>
              <div className="font-numeric mt-0.5 text-2xl font-extrabold text-[#142130]">
                {liveFrame ? liveFrame.reba.finalScore : '—'}
              </div>
              <div className="text-[10px] font-medium text-[#516275]">
                {liveFrame ? `Level ${liveFrame.reba.actionLevel}` : 'Skala 1–15'}
              </div>
            </div>

            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 text-center">
              <div className="text-[11px] font-semibold text-[#516275]">RULA</div>
              <div className="font-numeric mt-0.5 text-2xl font-extrabold text-[#142130]">
                {liveFrame ? liveFrame.rula.finalScore : '—'}
              </div>
              <div className="text-[10px] font-medium text-[#516275]">
                {liveFrame ? `Level ${liveFrame.rula.actionLevel}` : 'Skala 1–7'}
              </div>
            </div>

            <div
              className={`rounded-lg border p-2.5 text-center ${
                nioshResult.isSafe ? 'border-emerald-200 bg-emerald-50/70' : 'border-red-200 bg-red-50/70'
              }`}
            >
              <div className="text-[11px] font-semibold text-[#516275]">NIOSH LI</div>
              <div
                className={`font-numeric mt-0.5 text-2xl font-extrabold ${
                  nioshResult.isSafe ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {Number.isFinite(nioshResult.governingLI) ? nioshResult.governingLI.toFixed(2) : '∞'}
              </div>
              <div className="text-[10px] font-semibold text-[#516275]">
                {nioshResult.isSafe ? 'Aman (≤ 1)' : 'Berisiko (> 1)'}
              </div>
            </div>
          </div>

          {/* Live Measured NIOSH Geometry & Anthropometry Calibration Status */}
          {liveFrame ? (
            <>
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-[#142130]">Pengukuran Jarak & Sudut Frame Aktif</span>
                  <span className="font-numeric rounded bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-[#0F5BD8] border border-blue-200">
                    {liveFrame.calibration.methodUsed === 'manual_reference' ? 'Manual 2-Titik' : `Antropometri ${profile.name}`}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 font-numeric text-center">
                  <div className="rounded bg-white p-1.5 border border-slate-200">
                    <div className="text-[10px] font-sans text-slate-500">Tinggi V</div>
                    <div className="text-sm font-bold text-amber-700">{liveFrame.nioshGeom.V_cm} cm</div>
                  </div>
                  <div className="rounded bg-white p-1.5 border border-slate-200">
                    <div className="text-[10px] font-sans text-slate-500">Horizontal H</div>
                    <div className="text-sm font-bold text-[#0F5BD8]">{liveFrame.nioshGeom.H_cm} cm</div>
                  </div>
                  <div className="rounded bg-white p-1.5 border border-slate-200">
                    <div className="text-[10px] font-sans text-slate-500">Asimetri A</div>
                    <div className="text-sm font-bold text-pink-700">{liveFrame.nioshGeom.A_deg}°</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px] text-[#516275]">
                  <span>Zona: <strong className="text-[#142130]">{liveFrame.nioshGeom.heightZone}</strong></span>
                  <span className="font-numeric">Akurasi skala: {Math.round(liveFrame.calibration.confidence * 100)}%</span>
                </div>
                <div className="mt-1 text-[10.5px] text-slate-500">
                  Segmen aktif: {liveFrame.calibration.segmentsUsed.map((s) => `${s.segmentKey} (${s.realCm}cm)`).join(' · ')}
                </div>
              </div>

              {/* Feet & Slide 32 Compliance Checks */}
              <div
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                  liveFrame.angles.feetVisible && !liveFrame.angles.kneelingSuspected && !liveFrame.angles.oneHandSuspected
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                {liveFrame.angles.feetVisible && !liveFrame.angles.kneelingSuspected && !liveFrame.angles.oneHandSuspected ? (
                  <>
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>Kaki terlihat jelas, posisi berdiri, dan 2 tangan terdeteksi (memenuhi syarat dosen & Slide 32).</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="space-y-0.5">
                      {!liveFrame.angles.feetVisible && <div>Kaki tidak terlihat penuh di kamera (mundurkan kamera agar mata kaki tampak).</div>}
                      {liveFrame.angles.kneelingSuspected && <div>Indikasi berlutut/jongkok ekstrem (NIOSH Slide 32 berlaku untuk posisi berdiri).</div>}
                      {liveFrame.angles.oneHandSuspected && <div>Indikasi angkat 1 tangan (NIOSH Slide 32 mewajibkan 2 tangan).</div>}
                    </div>
                  </>
                )}
              </div>

              {/* Detailed REBA Breakdown */}
              <div className="rounded-lg border border-[#E2E8F0] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-[#142130]">Rincian REBA (Sisi {liveFrame.reba.side === 'left' ? 'Kiri' : 'Kanan'})</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${badgeClass(liveFrame.reba.actionLevel, 4)}`}>
                    {liveFrame.reba.riskLevelId}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  <div className="rounded bg-slate-50 px-2 py-1">
                    Trunk: <strong className="font-numeric">{liveFrame.angles.trunkFlexionDeg}°</strong> ({liveFrame.reba.trunkScore})
                  </div>
                  <div className="rounded bg-slate-50 px-2 py-1">
                    Neck: <strong className="font-numeric">{liveFrame.angles.neckFlexionDeg}°</strong> ({liveFrame.reba.neckScore})
                  </div>
                  <div className="rounded bg-slate-50 px-2 py-1">
                    Knee: <strong className="font-numeric">{liveFrame.angles.maxKneeFlexionDeg}°</strong> ({liveFrame.reba.legsScore})
                  </div>
                  <div className="rounded bg-slate-50 px-2 py-1">
                    UA: <strong className="font-numeric">{liveFrame.reba.side === 'left' ? liveFrame.angles.leftUpperArmFlexionDeg : liveFrame.angles.rightUpperArmFlexionDeg}°</strong> ({liveFrame.reba.upperArmScore})
                  </div>
                  <div className="rounded bg-slate-50 px-2 py-1">
                    LA: <strong className="font-numeric">{liveFrame.reba.side === 'left' ? liveFrame.angles.leftLowerArmFlexionDeg : liveFrame.angles.rightLowerArmFlexionDeg}°</strong> ({liveFrame.reba.lowerArmScore})
                  </div>
                  <div className="rounded bg-slate-50 px-2 py-1">
                    Wrist: <strong className="font-numeric">{liveFrame.reba.side === 'left' ? liveFrame.angles.leftWristFlexionDeg : liveFrame.angles.rightWristFlexionDeg}°</strong> ({liveFrame.reba.wristScore})
                  </div>
                </div>
                <div className="font-numeric mt-2 flex justify-between border-t border-slate-100 pt-1.5 text-[11px] text-[#516275]">
                  <span>Score A: {liveFrame.reba.scoreA} (T.A {liveFrame.reba.tableAScore}+{liveFrame.reba.loadScore})</span>
                  <span>Score B: {liveFrame.reba.scoreB} (T.B {liveFrame.reba.tableBScore}+{liveFrame.reba.couplingScore})</span>
                </div>
              </div>

              {/* Detailed RULA Breakdown */}
              <div className="rounded-lg border border-[#E2E8F0] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-[#142130]">Rincian RULA</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${badgeClass(liveFrame.rula.actionLevel, 4)}`}>
                    {liveFrame.rula.riskLevelId}
                  </span>
                </div>
                <div className="font-numeric grid grid-cols-2 gap-1.5 text-[11px] text-[#516275]">
                  <div className="rounded bg-slate-50 px-2 py-1">
                    Score C (Arm/Wrist): <strong className="text-[#142130]">{liveFrame.rula.scoreC}</strong>
                  </div>
                  <div className="rounded bg-slate-50 px-2 py-1">
                    Score D (Neck/Trunk): <strong className="text-[#142130]">{liveFrame.rula.scoreD}</strong>
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-[#516275]">{liveFrame.rula.recommendation}</p>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-[#516275]">
              Upload video atau aktifkan kamera untuk melihat perhitungan sudut sendi REBA, RULA, dan jarak NIOSH (V, H, A) secara otomatis.
            </div>
          )}

          {/* Quick View / Side Controls */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="block text-[10.5px] font-semibold text-[#516275]">Sudut Kamera</label>
              <select
                value={cameraViewMode}
                onChange={(e) => onCameraViewModeChange(e.target.value as CameraViewMode)}
                className="mt-0.5 w-full rounded-md border border-[#CBD5E1] bg-slate-50 px-2 py-1 text-xs font-medium"
              >
                <option value="auto">Otomatis</option>
                <option value="side">Tampak Samping (V & REBA)</option>
                <option value="front_top">Tampak Depan/Atas (H & A)</option>
              </select>
            </div>
            <div>
              <label className="block text-[10.5px] font-semibold text-[#516275]">Sisi Analisis REBA/RULA</label>
              <select
                value={sideSelection}
                onChange={(e) => onSideSelectionChange(e.target.value as 'auto' | 'left' | 'right')}
                className="mt-0.5 w-full rounded-md border border-[#CBD5E1] bg-slate-50 px-2 py-1 text-xs font-medium"
              >
                <option value="auto">Otomatis (Dominan)</option>
                <option value="right">Sisi Kanan</option>
                <option value="left">Sisi Kiri</option>
              </select>
            </div>
          </div>
        </div>
      ) : (
        /* Parameter Tugas Tab */
        <div className="space-y-2.5 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-[#516275]">Berat Beban L (kg)</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={params.loadWeightKg}
                onChange={(e) => update('loadWeightKg', Number.parseFloat(e.target.value) || 0)}
                className="font-numeric mt-0.5 w-full rounded-md border border-[#CBD5E1] px-2 py-1.5 font-semibold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#516275]">Frekuensi F (lifts/min)</label>
              <input
                type="number"
                step="0.1"
                min="0.001"
                value={params.frequencyPerMin}
                onChange={(e) => update('frequencyPerMin', Number.parseFloat(e.target.value) || 0.2)}
                className="font-numeric mt-0.5 w-full rounded-md border border-[#CBD5E1] px-2 py-1.5 font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-[#516275]">Durasi Kerja (Slide 20)</label>
              <select
                value={params.durationCategory}
                onChange={(e) => update('durationCategory', e.target.value as WorkDurationCategory)}
                className="mt-0.5 w-full rounded-md border border-[#CBD5E1] px-2 py-1.5"
              >
                <option value="short">≤ 1 jam (Short)</option>
                <option value="moderate">≤ 2 jam (Moderate)</option>
                <option value="long">≤ 8 jam (Long)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#516275]">Coupling / Pegangan (C)</label>
              <select
                value={params.coupling}
                onChange={(e) => update('coupling', e.target.value as CouplingQuality)}
                className="mt-0.5 w-full rounded-md border border-[#CBD5E1] px-2 py-1.5"
              >
                <option value="good">Good (Handle optimal)</option>
                <option value="fair">Fair (Bisa ditekuk 90°)</option>
                <option value="poor">Poor (Karung lentur / sulit)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10.5px] font-semibold text-[#516275]">Panjang (cm)</label>
              <input
                type="number"
                value={params.objectLengthCm}
                onChange={(e) => update('objectLengthCm', Number(e.target.value) || 0)}
                className="font-numeric mt-0.5 w-full rounded-md border border-[#CBD5E1] px-2 py-1"
              />
            </div>
            <div>
              <label className="block text-[10.5px] font-semibold text-[#516275]">Lebar (cm)</label>
              <input
                type="number"
                value={params.objectWidthCm}
                onChange={(e) => update('objectWidthCm', Number(e.target.value) || 0)}
                className="font-numeric mt-0.5 w-full rounded-md border border-[#CBD5E1] px-2 py-1"
              />
            </div>
            <div>
              <label className="block text-[10.5px] font-semibold text-[#516275]">Tinggi Benda (cm)</label>
              <input
                type="number"
                value={params.objectHeightCm}
                onChange={(e) => update('objectHeightCm', Number(e.target.value) || 0)}
                className="font-numeric mt-0.5 w-full rounded-md border border-[#CBD5E1] px-2 py-1"
              />
            </div>
          </div>

          {/* Flexible Origin & Destination Placement (Optional Rack/Table/Floor) */}
          <div className="rounded-lg border border-[#D8E0E8] bg-[#F8FAFC] p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#142130]">Arah &amp; Tempat Pengangkatan (Opsional)</span>
            </div>

            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'lifting', label: 'Lantai → Atas', icon: ArrowUp },
                  { id: 'lowering', label: 'Atas → Lantai', icon: ArrowDown },
                  { id: 'custom', label: 'Bebas', icon: ArrowLeftRight },
                ] as const
              ).map((dir) => {
                const Icon = dir.icon;
                const active = params.liftDirection === dir.id;
                return (
                  <button
                    key={dir.id}
                    type="button"
                    onClick={() => {
                      const next: TaskParameters = { ...params, liftDirection: dir.id as LiftDirection };
                      if (dir.id === 'lifting') {
                        next.originSurface = 'lantai';
                        next.originHeightCm = 0;
                        if (next.destinationSurface === 'lantai') {
                          next.destinationSurface = 'rak';
                          next.destinationHeightCm = 85;
                        }
                      } else if (dir.id === 'lowering') {
                        if (next.originSurface === 'lantai') {
                          next.originSurface = 'rak';
                          next.originHeightCm = 85;
                        }
                        next.destinationSurface = 'lantai';
                        next.destinationHeightCm = 0;
                      }
                      onParamsChange(next);
                    }}
                    className={`inline-flex items-center justify-center gap-1 rounded-md border px-1.5 py-1 text-[10.5px] font-bold cursor-pointer ${
                      active
                        ? 'border-[#0F5BD8] bg-[#0F5BD8] text-white'
                        : 'border-[#CBD5E1] bg-white text-[#516275] hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{dir.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Origin Surface */}
            <div className="grid grid-cols-12 gap-1.5 items-end">
              <div className="col-span-8">
                <label className="block text-[10.5px] font-semibold text-[#516275]">Tempat Asal (Origin)</label>
                <select
                  value={params.originSurface}
                  onChange={(e) => {
                    const preset = e.target.value as PlacementSurfacePreset;
                    onParamsChange({
                      ...params,
                      originSurface: preset,
                      originHeightCm: PLACEMENT_PRESETS[preset].defaultHeightCm,
                    });
                  }}
                  className="mt-0.5 w-full rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-[11px]"
                >
                  {(Object.keys(PLACEMENT_PRESETS) as PlacementSurfacePreset[]).map((k) => (
                    <option key={k} value={k}>
                      {PLACEMENT_PRESETS[k].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-4">
                <label className="block text-[10px] font-semibold text-[#516275]">Tinggi (cm)</label>
                <input
                  type="number"
                  min={0}
                  placeholder="Opsional"
                  value={params.originHeightCm ?? ''}
                  onChange={(e) =>
                    update('originHeightCm', e.target.value === '' ? null : Number.parseFloat(e.target.value) || 0)
                  }
                  className="font-numeric mt-0.5 w-full rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-[11px]"
                />
              </div>
              {params.originSurface === 'lainnya' && (
                <div className="col-span-12">
                  <input
                    type="text"
                    placeholder="Tulis nama tempat asal (mis. Bak Pikap, Meja Dapur, Kasur...)"
                    value={params.originSurfaceCustom ?? ''}
                    onChange={(e) => update('originSurfaceCustom', e.target.value)}
                    className="w-full rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-[11px]"
                  />
                </div>
              )}
            </div>

            {/* Destination Surface */}
            <div className="grid grid-cols-12 gap-1.5 items-end">
              <div className="col-span-8">
                <label className="block text-[10.5px] font-semibold text-[#516275]">Tempat Tujuan (Destination)</label>
                <select
                  value={params.destinationSurface}
                  onChange={(e) => {
                    const preset = e.target.value as PlacementSurfacePreset;
                    onParamsChange({
                      ...params,
                      destinationSurface: preset,
                      destinationHeightCm: PLACEMENT_PRESETS[preset].defaultHeightCm,
                    });
                  }}
                  className="mt-0.5 w-full rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-[11px]"
                >
                  {(Object.keys(PLACEMENT_PRESETS) as PlacementSurfacePreset[]).map((k) => (
                    <option key={k} value={k}>
                      {PLACEMENT_PRESETS[k].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-4">
                <label className="block text-[10px] font-semibold text-[#516275]">Tinggi (cm)</label>
                <input
                  type="number"
                  min={0}
                  placeholder="Opsional"
                  value={params.destinationHeightCm ?? ''}
                  onChange={(e) =>
                    update(
                      'destinationHeightCm',
                      e.target.value === '' ? null : Number.parseFloat(e.target.value) || 0
                    )
                  }
                  className="font-numeric mt-0.5 w-full rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-[11px]"
                />
              </div>
              {params.destinationSurface === 'lainnya' && (
                <div className="col-span-12">
                  <input
                    type="text"
                    placeholder="Tulis nama tempat tujuan (mis. Atas Dispenser, Penampang Jemuran...)"
                    value={params.destinationSurfaceCustom ?? ''}
                    onChange={(e) => update('destinationSurfaceCustom', e.target.value)}
                    className="w-full rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-[11px]"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5 border-t border-slate-100 pt-2">
            <div>
              <label className="block text-[10.5px] font-semibold text-[#516275]">Department / Lokasi</label>
              <input
                type="text"
                value={params.department}
                onChange={(e) => update('department', e.target.value)}
                className="mt-0.5 w-full rounded-md border border-[#CBD5E1] px-2 py-1"
              />
            </div>
            <div>
              <label className="block text-[10.5px] font-semibold text-[#516275]">Job Title</label>
              <input
                type="text"
                value={params.jobTitle}
                onChange={(e) => update('jobTitle', e.target.value)}
                className="mt-0.5 w-full rounded-md border border-[#CBD5E1] px-2 py-1"
              />
            </div>
            <div>
              <label className="block text-[10.5px] font-semibold text-[#516275]">Job Description</label>
              <input
                type="text"
                value={params.jobDescription}
                onChange={(e) => update('jobDescription', e.target.value)}
                className="mt-0.5 w-full rounded-md border border-[#CBD5E1] px-2 py-1"
              />
            </div>
          </div>

          <div className="space-y-1.5 border-t border-slate-100 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={params.significantControl}
                onChange={(e) => update('significantControl', e.target.checked)}
                className="accent-[#0F5BD8]"
              />
              <span>Butuh <strong>Significant Control</strong> di Destination (hitung Origin & Dest)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={params.useSlide41Rounding}
                onChange={(e) => update('useSlide41Rounding', e.target.checked)}
                className="accent-[#0F5BD8]"
              />
              <span>Pembulatan 2 desimal per multiplier (sesuai contoh Slide 41 PPT)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={params.staticPostureOver1Min}
                onChange={(e) => update('staticPostureOver1Min', e.target.checked)}
                className="accent-[#0F5BD8]"
              />
              <span>Postur ditahan statis &gt; 1 menit (REBA/RULA +1)</span>
            </label>
          </div>
        </div>
      )}
    </aside>
  );
};
