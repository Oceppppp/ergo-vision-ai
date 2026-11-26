import React from 'react';
import { Activity, ArrowDownCircle, ArrowUpCircle, Flame } from 'lucide-react';
import type { TimelineSample } from '../types/ergo';

interface TimelineChartProps {
  samples: TimelineSample[];
  onSeekToSec: (sec: number) => void;
}

export const TimelineChart: React.FC<TimelineChartProps> = ({ samples, onSeekToSec }) => {
  if (samples.length < 2) {
    return null;
  }

  const maxTime = samples[samples.length - 1].timeSec || 1;
  const maxV = Math.max(120, ...samples.map((s) => s.V_cm));

  const minVSample = samples.reduce((m, s) => (s.V_cm < m.V_cm ? s : m), samples[0]);
  const maxVSample = samples.reduce((m, s) => (s.V_cm > m.V_cm ? s : m), samples[0]);
  const peakRebaSample = samples.reduce((m, s) => (s.rebaScore > m.rebaScore ? s : m), samples[0]);

  const W = 720;
  const H = 160;
  const padL = 36;
  const padR = 16;
  const padT = 16;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const toX = (t: number) => padL + (t / maxTime) * plotW;
  const toYScore = (val: number, maxVal: number) => padT + plotH - (val / maxVal) * plotH;

  const buildPath = (getter: (s: TimelineSample) => number, maxVal: number) =>
    samples.map((s, i) => `${i === 0 ? 'M' : 'L'} ${toX(s.timeSec).toFixed(1)} ${toYScore(getter(s), maxVal).toFixed(1)}`).join(' ');

  const rebaPath = buildPath((s) => s.rebaScore, 15);
  const rulaPath = buildPath((s) => s.rulaScore, 7);
  const vPath = buildPath((s) => s.V_cm, maxV);

  return (
    <div className="rounded-xl border border-[#D8E0E8] bg-white p-3.5">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#0F5BD8]" />
          <h3 className="text-sm font-bold text-[#142130]">
            Grafik Pergerakan Video ({samples.length} Frame Teranalisis)
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => onSeekToSec(minVSample.timeSec)}
            className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-800 hover:bg-amber-100 cursor-pointer"
          >
            <ArrowDownCircle className="h-3.5 w-3.5" />
            Origin V min ({minVSample.V_cm}cm @ {minVSample.timeSec}s)
          </button>
          <button
            type="button"
            onClick={() => onSeekToSec(maxVSample.timeSec)}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
          >
            <ArrowUpCircle className="h-3.5 w-3.5" />
            Dest V max ({maxVSample.V_cm}cm @ {maxVSample.timeSec}s)
          </button>
          <button
            type="button"
            onClick={() => onSeekToSec(peakRebaSample.timeSec)}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 font-semibold text-red-700 hover:bg-red-100 cursor-pointer"
          >
            <Flame className="h-3.5 w-3.5" />
            Risiko Puncak REBA {peakRebaSample.rebaScore} (@ {peakRebaSample.timeSec}s)
          </button>
        </div>
      </div>

      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-40 w-full min-w-[480px] select-none cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * W;
            const ratio = Math.max(0, Math.min(1, (relX - padL) / plotW));
            onSeekToSec(Number((ratio * maxTime).toFixed(2)));
          }}
        >
          {/* Horizontal gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((g) => {
            const y = padT + plotH * (1 - g);
            return (
              <g key={g}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#E2E8F0" strokeWidth="1" />
                <text x={4} y={y + 4} fontSize="10" fill="#64748B" className="font-numeric">
                  {Math.round(g * 15)}
                </text>
              </g>
            );
          })}

          {/* Lines */}
          <path d={vPath} fill="none" stroke="#0F5BD8" strokeWidth="2" strokeDasharray="4 3" />
          <path d={rulaPath} fill="none" stroke="#F59E0B" strokeWidth="2" />
          <path d={rebaPath} fill="none" stroke="#DC2626" strokeWidth="2.5" />

          {/* Key markers */}
          <circle cx={toX(minVSample.timeSec)} cy={toYScore(minVSample.V_cm, maxV)} r="4.5" fill="#D97706" stroke="#fff" strokeWidth="1.5" />
          <circle cx={toX(maxVSample.timeSec)} cy={toYScore(maxVSample.V_cm, maxV)} r="4.5" fill="#15803D" stroke="#fff" strokeWidth="1.5" />
          <circle cx={toX(peakRebaSample.timeSec)} cy={toYScore(peakRebaSample.rebaScore, 15)} r="5" fill="#DC2626" stroke="#fff" strokeWidth="1.5" />

          {/* X-axis timestamps */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <text
              key={f}
              x={padL + f * plotW}
              y={H - 6}
              textAnchor="middle"
              fontSize="10"
              fill="#64748B"
              className="font-numeric"
            >
              {(f * maxTime).toFixed(1)}s
            </text>
          ))}
        </svg>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#516275]">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-600" /> REBA (0–15)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> RULA (skala 0–7)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-t-2 border-dashed border-[#0F5BD8]" /> Tinggi Tangan V (cm)
          </span>
        </div>
        <span>Klik grafik di detik mana saja untuk melompat ke frame tersebut.</span>
      </div>
    </div>
  );
};
