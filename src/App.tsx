import React, { useMemo, useState } from 'react';
import { Ruler, User, Users } from 'lucide-react';
import { MetricsPanel } from './components/MetricsPanel';
import { StudentSelectorModal } from './components/StudentSelectorModal';
import { TimelineChart } from './components/TimelineChart';
import { type LiveFrameAnalysis, VideoCanvas } from './components/VideoCanvas';
import { WorksheetReport } from './components/WorksheetReport';
import { CLASS_ANTHROPOMETRY } from './data/anthropometry';
import { evaluateFullNiosh } from './engine/niosh';
import type {
  CameraViewMode,
  CapturedMoment,
  ManualReferenceLine,
  NioshPointMeasurement,
  StudentProfile,
  TaskParameters,
  TimelineSample,
} from './types/ergo';

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const App: React.FC = () => {
  const [profiles, setProfiles] = useState<StudentProfile[]>(CLASS_ANTHROPOMETRY);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('joseph');
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId) ?? profiles[0],
    [profiles, selectedProfileId]
  );

  const [params, setParams] = useState<TaskParameters>({
    department: 'Toko Ritel (Indomaret)',
    jobTitle: 'Pramuniaga / Staf Toko',
    jobDescription: 'Pengangkatan karung beras 5 kg dari kotak stok lantai ke rak display tengah',
    analystName: 'Joseph',
    date: todayIso(),
    loadWeightKg: 5,
    objectLengthCm: 35,
    objectWidthCm: 24,
    objectHeightCm: 10,
    liftDirection: 'lifting',
    originSurface: 'lantai',
    originSurfaceCustom: '',
    originHeightCm: 0,
    destinationSurface: 'rak',
    destinationSurfaceCustom: '',
    destinationHeightCm: 85,
    frequencyPerMin: 2,
    durationCategory: 'short',
    coupling: 'poor',
    significantControl: true,
    staticPostureOver1Min: false,
    rapidLargeChange: false,
    shockOrForceBuildup: false,
    armSupported: false,
    useSlide41Rounding: true,
  });

  const [cameraViewMode, setCameraViewMode] = useState<CameraViewMode>('auto');
  const [sideSelection, setSideSelection] = useState<'auto' | 'left' | 'right'>('auto');
  const [manualRef, setManualRef] = useState<ManualReferenceLine | null>(null);
  const [liveFrame, setLiveFrame] = useState<LiveFrameAnalysis | null>(null);

  const [originCapture, setOriginCapture] = useState<CapturedMoment | null>(null);
  const [destinationCapture, setDestinationCapture] = useState<CapturedMoment | null>(null);
  const [originManual, setOriginManual] = useState<NioshPointMeasurement>({ H: 35, V: 15, A: 0 });
  const [destinationManual, setDestinationManual] = useState<NioshPointMeasurement>({ H: 35, V: 90, A: 30 });

  const [timelineSamples, setTimelineSamples] = useState<TimelineSample[]>([]);
  const [seekRequestSec, setSeekRequestSec] = useState<number | null>(null);

  const handleSelectProfile = (p: StudentProfile) => {
    setSelectedProfileId(p.id);
    setParams((prev) => ({ ...prev, analystName: p.name }));
  };

  const handleCaptureMoment = (moment: CapturedMoment) => {
    if (moment.kind === 'origin') {
      setOriginCapture(moment);
      setOriginManual({ ...moment.rawMeasurements });
    } else {
      setDestinationCapture(moment);
      setDestinationManual({ ...moment.rawMeasurements });
    }
  };

  const handleOriginOverride = (patch: Partial<NioshPointMeasurement>) => {
    setOriginManual((prev) => ({ ...prev, ...patch }));
    setOriginCapture((prev) =>
      prev ? { ...prev, overrideMeasurements: { ...prev.overrideMeasurements, ...patch } } : prev
    );
  };

  const handleDestinationOverride = (patch: Partial<NioshPointMeasurement>) => {
    setDestinationManual((prev) => ({ ...prev, ...patch }));
    setDestinationCapture((prev) =>
      prev ? { ...prev, overrideMeasurements: { ...prev.overrideMeasurements, ...patch } } : prev
    );
  };

  const nioshResult = useMemo(
    () =>
      evaluateFullNiosh(originManual, destinationManual, params, {
        feetVisible: liveFrame?.angles.feetVisible,
        kneelingSuspected: liveFrame?.angles.kneelingSuspected,
        oneHandSuspected: liveFrame?.angles.oneHandSuspected,
      }),
    [originManual, destinationManual, params, liveFrame]
  );

  return (
    <div className="min-h-screen bg-[#F6F8FA] text-[#142130]">
      {/* Header Bar */}
      <header className="no-print sticky top-0 z-30 border-b border-[#D8E0E8] bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#142130] text-white font-bold">
              EV
            </div>
            <div>
              <h1 className="text-base font-extrabold leading-tight tracking-tight text-[#142130]">
                ErgoVision AI
              </h1>
              <p className="text-[11px] text-[#516275]">
                Live AI Biomechanics &amp; Ergonomics Analyzer — REBA · RULA · NIOSH 1991
              </p>
            </div>
          </div>

          {/* Fast Student Identity Picker */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-2.5 py-1.5">
              <User className="h-4 w-4 text-[#0F5BD8]" />
              <label htmlFor="student-select" className="text-xs font-bold text-[#142130]">
                Nama Subjek:
              </label>
              <select
                id="student-select"
                value={selectedProfile.id}
                onChange={(e) => {
                  const found = profiles.find((p) => p.id === e.target.value);
                  if (found) handleSelectProfile(found);
                }}
                className="rounded-md border border-blue-300 bg-white px-2.5 py-1 text-xs font-bold text-[#0F5BD8] cursor-pointer"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (B2: {p.dimensions.B2} cm)
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-bold text-[#142130] hover:bg-slate-50 cursor-pointer"
            >
              <Users className="h-3.5 w-3.5 text-[#0F5BD8]" />
              Data Antropometri ({profiles.length})
            </button>
          </div>
        </div>
      </header>

      {/* Main Workbench */}
      <main className="mx-auto max-w-[1440px] space-y-5 px-4 py-4">
        {/* Active Anthropometry Calibration Strip */}
        <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#D8E0E8] bg-white px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Ruler className="h-4 w-4 text-[#0F5BD8]" />
            <span className="font-bold text-[#142130]">Panduan Kalibrasi Aktif ({selectedProfile.name}):</span>
            <span className="font-numeric rounded bg-slate-100 px-2 py-0.5">B2 Tegak {selectedProfile.dimensions.B2} cm</span>
            <span className="font-numeric rounded bg-slate-100 px-2 py-0.5">B10 Bahu {selectedProfile.dimensions.B10} cm</span>
            <span className="font-numeric rounded bg-slate-100 px-2 py-0.5">B13 Siku {selectedProfile.dimensions.B13} cm</span>
            <span className="font-numeric rounded bg-slate-100 px-2 py-0.5">B14 Tangan {selectedProfile.dimensions.B14} cm</span>
            <span className="font-numeric rounded bg-slate-100 px-2 py-0.5">D7 Lutut {selectedProfile.dimensions.D7} cm</span>
            <span className="font-numeric rounded bg-slate-100 px-2 py-0.5">D21 Lengan Bawah {selectedProfile.dimensions.D21} cm</span>
            <span className="font-numeric rounded bg-slate-100 px-2 py-0.5">T5 Kaki {selectedProfile.dimensions.T5} cm</span>
          </div>
          <button
            type="button"
            onClick={() => setProfileModalOpen(true)}
            className="text-xs font-semibold text-[#0F5BD8] hover:underline cursor-pointer"
          >
            Lihat 22 Dimensi / Tambah Nama
          </button>
        </div>

        {/* 2-Column Live Stage + Inspector */}
        <div className="no-print grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            <VideoCanvas
              profile={selectedProfile}
              params={params}
              cameraViewMode={cameraViewMode}
              sideSelection={sideSelection}
              manualRef={manualRef}
              onManualRefChange={setManualRef}
              onLiveAnalysis={setLiveFrame}
              onCaptureMoment={handleCaptureMoment}
              onTimelineComplete={setTimelineSamples}
              seekRequestSec={seekRequestSec}
              onSeekHandled={() => setSeekRequestSec(null)}
            />

            <TimelineChart samples={timelineSamples} onSeekToSec={(sec) => setSeekRequestSec(sec)} />
          </div>

          <div className="lg:col-span-4">
            <MetricsPanel
              profile={selectedProfile}
              params={params}
              onParamsChange={setParams}
              cameraViewMode={cameraViewMode}
              onCameraViewModeChange={setCameraViewMode}
              sideSelection={sideSelection}
              onSideSelectionChange={setSideSelection}
              liveFrame={liveFrame}
              nioshResult={nioshResult}
            />
          </div>
        </div>

        {/* Full-Width Job Analysis Worksheet & DOCX Export Studio */}
        <WorksheetReport
          profile={selectedProfile}
          params={params}
          originPoint={originManual}
          destinationPoint={destinationManual}
          onOriginOverride={handleOriginOverride}
          onDestinationOverride={handleDestinationOverride}
          niosh={nioshResult}
          originCapture={originCapture}
          destinationCapture={destinationCapture}
          timelineSamples={timelineSamples}
        />
      </main>

      <StudentSelectorModal
        open={profileModalOpen}
        profiles={profiles}
        selectedProfile={selectedProfile}
        onClose={() => setProfileModalOpen(false)}
        onSelect={handleSelectProfile}
        onAddProfile={(created) => setProfiles((prev) => [...prev, created])}
        onImportProfiles={(imported) => {
          setProfiles((prev) => {
            const map = new Map(prev.map((p) => [p.id, p]));
            imported.forEach((p) => map.set(p.id, p));
            return Array.from(map.values());
          });
          if (imported.length > 0) handleSelectProfile(imported[0]);
        }}
      />
    </div>
  );
};

export default App;
