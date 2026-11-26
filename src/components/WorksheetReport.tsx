import React, { useState } from 'react';
import { Download, FileText, Image as ImageIcon, Printer } from 'lucide-react';
import { formatPlacementLabel } from '../data/placement';
import { generateWorksheetDocx } from '../export/docxExporter';
import type {
  CapturedMoment,
  NioshFullResult,
  NioshPointMeasurement,
  StudentProfile,
  TaskParameters,
  TimelineSample,
} from '../types/ergo';
import { buildEvidenceCollageDataUrl, type EvidencePanelSpec } from '../vision/overlayRenderer';

interface WorksheetReportProps {
  profile: StudentProfile;
  params: TaskParameters;
  originPoint: NioshPointMeasurement;
  destinationPoint: NioshPointMeasurement;
  onOriginOverride: (patch: Partial<NioshPointMeasurement>) => void;
  onDestinationOverride: (patch: Partial<NioshPointMeasurement>) => void;
  niosh: NioshFullResult;
  originCapture: CapturedMoment | null;
  destinationCapture: CapturedMoment | null;
  timelineSamples: TimelineSample[];
}

function fmtComma(val: number, digits = 2): string {
  if (!Number.isFinite(val)) return '∞';
  return val.toFixed(digits).replace('.', ',');
}

function durationText(cat: TaskParameters['durationCategory']): string {
  if (cat === 'short') return '< 1';
  if (cat === 'moderate') return '≤ 2';
  return '≤ 8';
}

export const WorksheetReport: React.FC<WorksheetReportProps> = ({
  profile,
  params,
  originPoint,
  destinationPoint,
  onOriginOverride,
  onDestinationOverride,
  niosh,
  originCapture,
  destinationCapture,
  timelineSamples,
}) => {
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);

  const handleDownloadDocx = async () => {
    setExportingDocx(true);
    try {
      const blob = await generateWorksheetDocx({
        profile,
        params,
        originPoint,
        destinationPoint,
        niosh,
        originCapture,
        destinationCapture,
        timelineSamples,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `JOB_ANALYSIS_WORKSHEET_${profile.name}_${params.date}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingDocx(false);
    }
  };

  const handleDownloadCollagePng = async () => {
    if (!originCapture && !destinationCapture) return;
    setExportingPng(true);
    try {
      const panels: EvidencePanelSpec[] = [];
      const formatDetails = (cap: CapturedMoment, pt: NioshPointMeasurement): string[] => {
        const a = cap.angles;
        const side = cap.reba.side;
        const ua = side === 'left' ? a.leftUpperArmFlexionDeg : a.rightUpperArmFlexionDeg;
        const la = side === 'left' ? a.leftLowerArmFlexionDeg : a.rightLowerArmFlexionDeg;
        const wr = side === 'left' ? a.leftWristFlexionDeg : a.rightWristFlexionDeg;
        return [
          `NIOSH  : V = ${pt.V} cm  |  H = ${pt.H} cm  |  A = ${pt.A}°  |  L = ${params.loadWeightKg} kg`,
          `SENDI  : Trunk ${a.trunkFlexionDeg}° · Neck ${a.neckFlexionDeg}° · Knee ${a.maxKneeFlexionDeg}°`,
          `LENGAN : UpperArm ${ua}° · LowerArm ${la}° · Wrist ${wr}°`,
          `SKOR   : REBA ${cap.reba.finalScore}/15 (L${cap.reba.actionLevel}) · RULA ${cap.rula.finalScore}/7 (L${cap.rula.actionLevel})`,
        ];
      };

      if (originCapture) {
        panels.push({
          title: `ORIGIN — ${profile.name} (${originCapture.timestampSec.toFixed(2)}s)`,
          subtitle: `Dari: ${formatPlacementLabel(params.originSurface, params.originSurfaceCustom, params.originHeightCm)}`,
          detailLines: formatDetails(originCapture, originPoint),
          imageDataUrl: originCapture.annotatedImageDataUrl,
        });
      }
      if (destinationCapture) {
        panels.push({
          title: `DESTINATION — ${profile.name} (${destinationCapture.timestampSec.toFixed(2)}s)`,
          subtitle: `Ke: ${formatPlacementLabel(params.destinationSurface, params.destinationSurfaceCustom, params.destinationHeightCm)}`,
          detailLines: formatDetails(destinationCapture, destinationPoint),
          imageDataUrl: destinationCapture.annotatedImageDataUrl,
        });
      }
      const dataUrl = await buildEvidenceCollageDataUrl(panels);
      if (dataUrl) {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `Bukti_Pengukuran_${profile.name}_${params.date}.png`;
        a.click();
      }
    } finally {
      setExportingPng(false);
    }
  };

  return (
    <section className="print-sheet rounded-xl border border-[#D8E0E8] bg-white p-5 space-y-5">
      {/* Header & Export Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-[#142130]">
            JOB ANALYSIS WORKSHEET &amp; Bukti Pengukuran
          </h2>
          <p className="text-xs text-[#516275]">
            Format sesuai DOCX Worksheet &amp; Slide 41 (NIOSH 1991) dilengkapi rincian REBA, RULA, dan foto beranotasi.
          </p>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={exportingDocx}
            onClick={handleDownloadDocx}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5BD8] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#0B4AB3] disabled:opacity-50 cursor-pointer"
          >
            <FileText className="h-4 w-4" />
            {exportingDocx ? 'Menyusun DOCX...' : 'Export Worksheet (.docx)'}
          </button>

          <button
            type="button"
            disabled={exportingPng || (!originCapture && !destinationCapture)}
            onClick={handleDownloadCollagePng}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-bold text-[#142130] hover:bg-slate-50 disabled:opacity-45 cursor-pointer"
          >
            <ImageIcon className="h-4 w-4 text-emerald-600" />
            {exportingPng ? 'Membuat PNG...' : 'Export Foto Bukti (.png)'}
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-bold text-[#142130] hover:bg-slate-50 cursor-pointer"
          >
            <Printer className="h-4 w-4 text-slate-600" />
            Cetak / PDF
          </button>
        </div>
      </div>

      {/* Captured Origin & Destination Snapshots + Manual Meteran Verification */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(
          [
            {
              key: 'origin',
              title: `ORIGIN — Dari: ${formatPlacementLabel(
                params.originSurface,
                params.originSurfaceCustom,
                params.originHeightCm
              )}`,
              badgeColor: 'bg-amber-100 text-amber-900',
              capture: originCapture,
              point: originPoint,
              onOverride: onOriginOverride,
            },
            {
              key: 'destination',
              title: `DESTINATION — Ke: ${formatPlacementLabel(
                params.destinationSurface,
                params.destinationSurfaceCustom,
                params.destinationHeightCm
              )}`,
              badgeColor: 'bg-emerald-100 text-emerald-900',
              capture: destinationCapture,
              point: destinationPoint,
              onOverride: onDestinationOverride,
            },
          ] as const
        ).map((card) => (
          <div key={card.key} className="rounded-xl border border-[#D8E0E8] bg-[#F8FAFC] p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${card.badgeColor}`}>{card.title}</span>
              {card.capture ? (
                <span className="font-numeric text-xs font-semibold text-[#516275]">
                  t = {card.capture.timestampSec.toFixed(2)}s · REBA {card.capture.reba.finalScore} · RULA {card.capture.rula.finalScore}
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">Belum di-capture (nilai awal dapat diedit)</span>
              )}
            </div>

            {card.capture ? (
              <div className="overflow-hidden rounded-lg border border-slate-300 bg-black">
                <img
                  src={card.capture.annotatedImageDataUrl}
                  alt={card.title}
                  className="max-h-60 w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-4 text-center text-xs text-slate-500">
                <p className="max-w-xs leading-relaxed">
                  Pause video di posisi {card.key.toUpperCase()} lalu klik tombol{' '}
                  <strong className="text-[#142130]">Capture {card.key.toUpperCase()}</strong> (atau jalankan{' '}
                  <strong className="text-[#0F766E]">Auto-Scan</strong>).
                </p>
              </div>
            )}

            {/* Editable verification fields (cross-check with physical tape measure) */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10.5px] font-semibold text-[#516275]">H (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={card.point.H}
                  onChange={(e) => card.onOverride({ H: Number.parseFloat(e.target.value) || 0 })}
                  className="font-numeric mt-0.5 w-full rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-xs font-bold text-[#0F5BD8]"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-semibold text-[#516275]">V (cm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={card.point.V}
                  onChange={(e) => card.onOverride({ V: Number.parseFloat(e.target.value) || 0 })}
                  className="font-numeric mt-0.5 w-full rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-xs font-bold text-amber-700"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-semibold text-[#516275]">Sudut A (°)</label>
                <input
                  type="number"
                  step="1"
                  value={card.point.A}
                  onChange={(e) => card.onOverride({ A: Number.parseFloat(e.target.value) || 0 })}
                  className="font-numeric mt-0.5 w-full rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-xs font-bold text-pink-700"
                />
              </div>
            </div>
            {card.capture && (
              <div className="text-[10.5px] text-slate-500">{card.capture.calibrationNote}</div>
            )}
          </div>
        ))}
      </div>

      {/* STEP 1 Table — Exact DOCX Worksheet Mirror */}
      <div>
        <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[#142130]">
          STEP 1. Measure and Record Task Variables
        </h3>
        <div className="overflow-x-auto rounded-lg border border-[#CBD5E1]">
          <table className="w-full border-collapse text-center text-xs">
            <thead>
              <tr className="bg-[#EAF1FB] text-[#142130]">
                <th colSpan={2} className="border border-[#CBD5E1] px-2 py-1.5">Object Weight (kg)</th>
                <th colSpan={4} className="border border-[#CBD5E1] px-2 py-1.5">Hand Location (cm)</th>
                <th rowSpan={2} className="border border-[#CBD5E1] px-2 py-1.5">Vertical Distance (cm)</th>
                <th colSpan={2} className="border border-[#CBD5E1] px-2 py-1.5">Asymmetric Angle (°)</th>
                <th rowSpan={2} className="border border-[#CBD5E1] px-2 py-1.5">Frequency Rate (lifts/min)</th>
                <th rowSpan={2} className="border border-[#CBD5E1] px-2 py-1.5">Duration (hrs)</th>
                <th rowSpan={2} className="border border-[#CBD5E1] px-2 py-1.5">Object Coupling</th>
              </tr>
              <tr className="bg-slate-50 text-[11px] text-[#516275]">
                <th className="border border-[#CBD5E1] px-2 py-1">L(avg)</th>
                <th className="border border-[#CBD5E1] px-2 py-1">L(max)</th>
                <th colSpan={2} className="border border-[#CBD5E1] px-2 py-1">Origin</th>
                <th colSpan={2} className="border border-[#CBD5E1] px-2 py-1">Destination</th>
                <th className="border border-[#CBD5E1] px-2 py-1">Origin</th>
                <th className="border border-[#CBD5E1] px-2 py-1">Dest.</th>
              </tr>
              <tr className="bg-slate-50 text-[11px] font-semibold text-[#142130]">
                <th className="border border-[#CBD5E1] px-2 py-1" colSpan={2} />
                <th className="border border-[#CBD5E1] px-2 py-1">H</th>
                <th className="border border-[#CBD5E1] px-2 py-1">V</th>
                <th className="border border-[#CBD5E1] px-2 py-1">H</th>
                <th className="border border-[#CBD5E1] px-2 py-1">V</th>
                <th className="border border-[#CBD5E1] px-2 py-1">D</th>
                <th className="border border-[#CBD5E1] px-2 py-1">A</th>
                <th className="border border-[#CBD5E1] px-2 py-1">A</th>
                <th className="border border-[#CBD5E1] px-2 py-1">F</th>
                <th className="border border-[#CBD5E1] px-2 py-1" />
                <th className="border border-[#CBD5E1] px-2 py-1">C</th>
              </tr>
            </thead>
            <tbody className="font-numeric font-bold text-[#142130]">
              <tr>
                <td className="border border-[#CBD5E1] px-2 py-2">{fmtComma(params.loadWeightKg)}</td>
                <td className="border border-[#CBD5E1] px-2 py-2">{fmtComma(params.loadWeightKg)}</td>
                <td className="border border-[#CBD5E1] px-2 py-2">{fmtComma(originPoint.H, 1)}</td>
                <td className="border border-[#CBD5E1] px-2 py-2">{fmtComma(originPoint.V, 1)}</td>
                <td className="border border-[#CBD5E1] px-2 py-2">{fmtComma(destinationPoint.H, 1)}</td>
                <td className="border border-[#CBD5E1] px-2 py-2">{fmtComma(destinationPoint.V, 1)}</td>
                <td className="border border-[#CBD5E1] px-2 py-2">{fmtComma(niosh.D, 1)}</td>
                <td className="border border-[#CBD5E1] px-2 py-2">{fmtComma(originPoint.A, 1)}°</td>
                <td className="border border-[#CBD5E1] px-2 py-2">{fmtComma(destinationPoint.A, 1)}°</td>
                <td className="border border-[#CBD5E1] px-2 py-2">{fmtComma(params.frequencyPerMin)}</td>
                <td className="border border-[#CBD5E1] px-2 py-2">{durationText(params.durationCategory)}</td>
                <td className="border border-[#CBD5E1] px-2 py-2 font-sans capitalize">{params.coupling}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* STEP 2 & STEP 3 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[#142130]">
            STEP 2. Multipliers &amp; Recommended Weight Limit (RWL = LC × HM × VM × DM × AM × FM × CM)
          </h3>
          <div className="overflow-x-auto rounded-lg border border-[#CBD5E1]">
            <table className="w-full border-collapse text-center text-xs">
              <thead>
                <tr className="bg-[#EAF1FB] text-[#142130]">
                  <th className="border border-[#CBD5E1] px-2 py-1.5">Posisi</th>
                  <th className="border border-[#CBD5E1] px-2 py-1.5">LC</th>
                  <th className="border border-[#CBD5E1] px-2 py-1.5">HM</th>
                  <th className="border border-[#CBD5E1] px-2 py-1.5">VM</th>
                  <th className="border border-[#CBD5E1] px-2 py-1.5">DM</th>
                  <th className="border border-[#CBD5E1] px-2 py-1.5">AM</th>
                  <th className="border border-[#CBD5E1] px-2 py-1.5">FM</th>
                  <th className="border border-[#CBD5E1] px-2 py-1.5">CM</th>
                  <th className="border border-[#CBD5E1] bg-amber-100 px-2 py-1.5">RWL (kg)</th>
                </tr>
              </thead>
              <tbody className="font-numeric">
                {[
                  { label: 'ORIGIN', r: niosh.origin },
                  { label: 'DESTINATION', r: niosh.destination },
                ].map((row) => (
                  <tr key={row.label}>
                    <td className="border border-[#CBD5E1] px-2 py-2 font-sans font-bold">{row.label}</td>
                    <td className="border border-[#CBD5E1] px-2 py-2">{row.r.LC}</td>
                    <td className="border border-[#CBD5E1] px-2 py-2">{fmtComma(row.r.HM)}</td>
                    <td className="border border-[#CBD5E1] px-2 py-2">{fmtComma(row.r.VM)}</td>
                    <td className="border border-[#CBD5E1] px-2 py-2">{fmtComma(row.r.DM)}</td>
                    <td className="border border-[#CBD5E1] px-2 py-2">{fmtComma(row.r.AM)}</td>
                    <td className="border border-[#CBD5E1] px-2 py-2">{fmtComma(row.r.FM)}</td>
                    <td className="border border-[#CBD5E1] px-2 py-2">{fmtComma(row.r.CM)}</td>
                    <td className="border border-[#CBD5E1] bg-amber-50 px-2 py-2 font-extrabold text-[#142130]">
                      {fmtComma(row.r.RWL)} kg
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="xl:col-span-5">
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[#142130]">
            STEP 3. Lifting Index (LI = L / RWL)
          </h3>
          <div className="overflow-x-auto rounded-lg border border-[#CBD5E1]">
            <table className="w-full border-collapse text-center text-xs">
              <thead>
                <tr className="bg-[#EAF1FB] text-[#142130]">
                  <th className="border border-[#CBD5E1] px-2 py-1.5">Posisi</th>
                  <th className="border border-[#CBD5E1] px-2 py-1.5">L / RWL</th>
                  <th className="border border-[#CBD5E1] px-2 py-1.5">LI</th>
                  <th className="border border-[#CBD5E1] px-2 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody className="font-numeric">
                {[
                  { label: 'ORIGIN', r: niosh.origin },
                  { label: 'DESTINATION', r: niosh.destination },
                ].map((row) => (
                  <tr key={row.label}>
                    <td className="border border-[#CBD5E1] px-2 py-2 font-sans font-bold">{row.label}</td>
                    <td className="border border-[#CBD5E1] px-2 py-2">
                      {fmtComma(params.loadWeightKg)} / {fmtComma(row.r.RWL)}
                    </td>
                    <td
                      className={`border border-[#CBD5E1] px-2 py-2 font-extrabold ${
                        row.r.isSafe ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {fmtComma(row.r.LI)}
                    </td>
                    <td className="border border-[#CBD5E1] px-2 py-2 font-sans font-semibold">
                      {row.r.isSafe ? 'Aman (≤ 1)' : 'Berisiko (> 1)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recommendations Box */}
      <div className="rounded-xl border border-[#D8E0E8] bg-[#F8FAFC] p-4">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-[#142130]">
            Kesimpulan &amp; Rekomendasi Perancangan Ulang Ergonomi
          </h3>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0F5BD8]">
            <Download className="h-3.5 w-3.5" />
            Otomatis masuk ke file .docx
          </span>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-[#334155]">
          {niosh.redesignSuggestions.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
};
