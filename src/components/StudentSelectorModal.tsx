import React, { useRef, useState } from 'react';
import { FileSpreadsheet, Plus, Ruler, UserCheck, X } from 'lucide-react';
import {
  CLASS_ANTHROPOMETRY,
  computeClassPercentiles,
  DIMENSION_META,
  parseAnthropometryCsv,
} from '../data/anthropometry';
import type { AnthropometryDimensions, StudentProfile } from '../types/ergo';

interface StudentSelectorModalProps {
  open: boolean;
  profiles: StudentProfile[];
  selectedProfile: StudentProfile;
  onClose: () => void;
  onSelect: (profile: StudentProfile) => void;
  onAddProfile: (profile: StudentProfile) => void;
  onImportProfiles: (imported: StudentProfile[]) => void;
}

export const StudentSelectorModal: React.FC<StudentSelectorModalProps> = ({
  open,
  profiles,
  selectedProfile,
  onClose,
  onSelect,
  onAddProfile,
  onImportProfiles,
}) => {
  const csvRef = useRef<HTMLInputElement | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDims, setNewDims] = useState<AnthropometryDimensions>({ ...CLASS_ANTHROPOMETRY[4].dimensions });
  const [csvNotice, setCsvNotice] = useState<string | null>(null);

  if (!open) return null;

  const pB2 = computeClassPercentiles(profiles, 'B2');
  const pB10 = computeClassPercentiles(profiles, 'B10');
  const pB13 = computeClassPercentiles(profiles, 'B13');
  const pD7 = computeClassPercentiles(profiles, 'D7');
  const pD21 = computeClassPercentiles(profiles, 'D21');

  const handleCsvUpload = async (file: File) => {
    const text = await file.text();
    const parsed = parseAnthropometryCsv(text);
    if (parsed.length > 0) {
      onImportProfiles(parsed);
      setCsvNotice(`Berhasil memuat ${parsed.length} profil mahasiswa dari ${file.name}.`);
    } else {
      setCsvNotice('Format CSV tidak dikenali. Pastikan baris pertama berisi daftar nama dan kolom kedua berisi kode B2..T6.');
    }
  };

  const handleSaveCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    const created: StudentProfile = {
      id: `custom-${Date.now()}`,
      name: trimmed,
      dimensions: { ...newDims },
      isCustom: true,
    };
    onAddProfile(created);
    onSelect(created);
    setNewName('');
    setShowAddForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#D8E0E8] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-[#0F5BD8]">
              <Ruler className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#142130]">Database Antropometri Mahasiswa ({profiles.length} Profil)</h2>
              <p className="text-xs text-[#516275]">
                Digunakan langsung sebagai panduan kalibrasi jarak (cm/pixel) dan zona tinggi ergonomis personal
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Student chips */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#142130]">Pilih Nama Subjek yang Tampil di Video:</span>
              <div className="flex items-center gap-2">
                <input
                  ref={csvRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleCsvUpload(f);
                  }}
                />
                <button
                  type="button"
                  onClick={() => csvRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#CBD5E1] px-2.5 py-1 text-xs font-semibold text-[#142130] hover:bg-slate-50 cursor-pointer"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                  Import CSV
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5BD8] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#0B4AB3] cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tambah Nama Baru
                </button>
              </div>
            </div>

            {csvNotice && (
              <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-800">
                {csvNotice}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {profiles.map((p) => {
                const active = p.id === selectedProfile.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelect(p)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                      active
                        ? 'border-[#0F5BD8] bg-[#0F5BD8] text-white'
                        : 'border-[#D8E0E8] bg-slate-50 text-[#142130] hover:border-blue-300 hover:bg-blue-50/50'
                    }`}
                  >
                    {active && <UserCheck className="h-3.5 w-3.5" />}
                    <span>{p.name}</span>
                    <span className={`font-numeric text-[11px] ${active ? 'text-blue-100' : 'text-slate-500'}`}>
                      {p.dimensions.B2}cm
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Add Custom Student Form */}
          {showAddForm && (
            <form onSubmit={handleSaveCustom} className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#142130]">Input Profil Antropometri Baru</h3>
                <button type="button" onClick={() => setShowAddForm(false)} className="text-xs text-slate-500 hover:underline">
                  Tutup
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-[#516275]">Nama Lengkap / Panggilan</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Kevin"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                {(['B2', 'B10', 'B13', 'B14', 'D7', 'D13', 'D21', 'T5'] as (keyof AnthropometryDimensions)[]).map(
                  (key) => (
                    <div key={key}>
                      <label className="block text-[11px] font-semibold text-[#516275]">
                        {key} ({DIMENSION_META[key].label})
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={newDims[key]}
                        onChange={(e) =>
                          setNewDims((prev) => ({ ...prev, [key]: Number.parseFloat(e.target.value) || 0 }))
                        }
                        className="font-numeric mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-2 py-1 text-xs"
                      />
                    </div>
                  )
                )}
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-[#0F5BD8] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0B4AB3] cursor-pointer"
                >
                  Simpan & Gunakan Profil
                </button>
              </div>
            </form>
          )}

          {/* Selected Student 22-Dimension Detail */}
          <div className="rounded-xl border border-[#D8E0E8] bg-[#F8FAFC] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#142130]">
                Detail 22 Dimensi Antropometri — {selectedProfile.name}
              </h3>
              <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-[#0F5BD8]">
                Segmen Kalibrasi Aktif: B10, B13, D7, D13, D21, T5
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {(Object.keys(DIMENSION_META) as (keyof AnthropometryDimensions)[]).map((key) => {
                const meta = DIMENSION_META[key];
                const isCalibrationSeg = ['B2', 'B10', 'B13', 'B14', 'D7', 'D13', 'D21', 'T5'].includes(key);
                return (
                  <div
                    key={key}
                    className={`rounded-lg border px-2.5 py-1.5 ${
                      isCalibrationSeg ? 'border-blue-200 bg-white' : 'border-slate-200 bg-white/70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-numeric text-xs font-bold text-[#0F5BD8]">{meta.code}</span>
                      <span className="font-numeric text-xs font-bold text-[#142130]">
                        {selectedProfile.dimensions[key]} cm
                      </span>
                    </div>
                    <div className="text-[10.5px] leading-snug text-[#516275]">
                      {meta.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Class Percentiles Summary */}
          <div>
            <h3 className="mb-2 text-xs font-bold text-[#142130]">Statistik Persentil Kelas (P5 / P50 / P95)</h3>
            <div className="overflow-x-auto rounded-lg border border-[#D8E0E8]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[#516275]">
                  <tr>
                    <th className="px-3 py-2">Dimensi</th>
                    <th className="px-3 py-2 text-right">Min</th>
                    <th className="px-3 py-2 text-right">P5</th>
                    <th className="px-3 py-2 text-right">P50 (Median)</th>
                    <th className="px-3 py-2 text-right">P95</th>
                    <th className="px-3 py-2 text-right">Max</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-numeric">
                  {[
                    { label: 'B2 Tinggi Badan Tegak', s: pB2 },
                    { label: 'B10 Bahu ke Lantai', s: pB10 },
                    { label: 'B13 Siku ke Lantai', s: pB13 },
                    { label: 'D7 Lutut ke Lantai', s: pD7 },
                    { label: 'D21 Lengan Bawah', s: pD21 },
                  ].map((row) => (
                    <tr key={row.label} className="bg-white">
                      <td className="px-3 py-1.5 font-sans font-medium text-[#142130]">{row.label}</td>
                      <td className="px-3 py-1.5 text-right">{row.s.min}</td>
                      <td className="px-3 py-1.5 text-right">{row.s.p5}</td>
                      <td className="px-3 py-1.5 text-right font-bold text-[#0F5BD8]">{row.s.p50}</td>
                      <td className="px-3 py-1.5 text-right">{row.s.p95}</td>
                      <td className="px-3 py-1.5 text-right">{row.s.max}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-[#E2E8F0] bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#142130] px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
          >
            Selesai — Gunakan Data {selectedProfile.name}
          </button>
        </div>
      </div>
    </div>
  );
};
