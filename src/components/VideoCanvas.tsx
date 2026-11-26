import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Crosshair,
  Film,
  Pause,
  Play,
  RotateCcw,
  Ruler,
  ScanLine,
  SkipBack,
  SkipForward,
  Upload,
} from 'lucide-react';
import { getErgonomicZones } from '../data/anthropometry';
import { calibrateFromAnthropometry } from '../engine/calibration';
import { computeNioshLiveGeometry, dist2D, extractBodyAngles } from '../engine/geometry';
import { calculateReba } from '../engine/reba';
import { calculateRula } from '../engine/rula';
import type {
  BodyAngles,
  CalibrationResult,
  CameraViewMode,
  CapturedMoment,
  ManualReferenceLine,
  NioshLiveGeometry,
  Point2D,
  PoseLandmark2D,
  RebaResult,
  RulaResult,
  StudentProfile,
  TaskParameters,
  TimelineSample,
} from '../types/ergo';
import { drawErgonomicOverlay, type OverlayMode } from '../vision/overlayRenderer';
import { ErgoPoseDetector } from '../vision/poseDetector';

export interface LiveFrameAnalysis {
  timestampSec: number;
  landmarks2D: PoseLandmark2D[];
  angles: BodyAngles;
  calibration: CalibrationResult;
  nioshGeom: NioshLiveGeometry;
  reba: RebaResult;
  rula: RulaResult;
}

interface VideoCanvasProps {
  profile: StudentProfile;
  params: TaskParameters;
  cameraViewMode: CameraViewMode;
  sideSelection: 'auto' | 'left' | 'right';
  manualRef: ManualReferenceLine | null;
  onManualRefChange: (ref: ManualReferenceLine | null) => void;
  onLiveAnalysis: (frame: LiveFrameAnalysis | null) => void;
  onCaptureMoment: (moment: CapturedMoment) => void;
  onTimelineComplete: (samples: TimelineSample[]) => void;
  seekRequestSec: number | null;
  onSeekHandled: () => void;
}

export const VideoCanvas: React.FC<VideoCanvasProps> = ({
  profile,
  params,
  cameraViewMode,
  sideSelection,
  manualRef,
  onManualRefChange,
  onLiveAnalysis,
  onCaptureMoment,
  onTimelineComplete,
  seekRequestSec,
  onSeekHandled,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const detectorRef = useRef<ErgoPoseDetector | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [sourceMode, setSourceMode] = useState<'none' | 'upload' | 'camera'>('none');
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [aiStatus, setAiStatus] = useState<string>('Menyiapkan AI Pose...');
  const [aiReady, setAiReady] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const [overlayMode, setOverlayMode] = useState<OverlayMode>('combined');
  const [showZones, setShowZones] = useState(true);
  const [isCalibratingRef, setIsCalibratingRef] = useState(false);
  const [pendingRefPt, setPendingRefPt] = useState<Point2D | null>(null);
  const [refKnownCm, setRefKnownCm] = useState<number>(85);

  const [customPins, setCustomPins] = useState<{ ankleMidPx?: Point2D; handMidPx?: Point2D; floorY?: number }>({});
  const [draggingPin, setDraggingPin] = useState<'ankle' | 'hand' | null>(null);

  const [isAutoScanning, setIsAutoScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  const latestAnalysisRef = useRef<LiveFrameAnalysis | null>(null);
  const lastPoseRef = useRef<{ landmarks2D: PoseLandmark2D[]; worldLandmarks?: PoseLandmark2D[] } | null>(null);

  // Initialize MediaPipe PoseLandmarker on mount
  useEffect(() => {
    const detector = new ErgoPoseDetector();
    detectorRef.current = detector;
    detector
      .init((msg) => setAiStatus(msg))
      .then(() => {
        setAiReady(true);
        setAiStatus('AI Pose Aktif');
      })
      .catch((err) => {
        setAiError(`Gagal memuat model AI Pose: ${err instanceof Error ? err.message : String(err)}`);
      });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      detector.dispose();
    };
  }, []);

  const renderAnalysisToCanvas = useCallback(
    (
      video: HTMLVideoElement,
      pose: { landmarks2D: PoseLandmark2D[]; worldLandmarks?: PoseLandmark2D[] } | null,
      overridePins = customPins
    ): LiveFrameAnalysis | null => {
      const canvas = canvasRef.current;
      if (!canvas || video.videoWidth === 0 || video.videoHeight === 0) return null;

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (!pose) {
        latestAnalysisRef.current = null;
        onLiveAnalysis(null);
        return null;
      }

      const zones = getErgonomicZones(profile);
      const calibration = calibrateFromAnthropometry(pose.landmarks2D, canvas.width, canvas.height, profile, {
        cameraViewMode,
        manualReference: manualRef,
      });
      const angles = extractBodyAngles(pose.landmarks2D, canvas.width, canvas.height, pose.worldLandmarks);
      const activeSide = sideSelection === 'auto' ? angles.dominantSide : sideSelection;
      const reba = calculateReba(angles, params, activeSide);
      const rula = calculateRula(angles, params, activeSide);
      const nioshGeom = computeNioshLiveGeometry(
        pose.landmarks2D,
        canvas.width,
        canvas.height,
        calibration,
        angles,
        zones,
        overridePins
      );

      drawErgonomicOverlay(ctx, {
        mode: overlayMode,
        showZones,
        showHudBadge: true,
        profile,
        landmarks2D: pose.landmarks2D,
        angles,
        calibration,
        nioshGeom,
        zones,
        reba,
        rula,
        manualRef,
        pendingRefPoint: pendingRefPt,
        interactivePins: !isPlaying && sourceMode === 'upload',
        timestampLabel: sourceMode === 'upload' ? `t=${video.currentTime.toFixed(2)}s` : 'LIVE',
      });

      const frameResult: LiveFrameAnalysis = {
        timestampSec: video.currentTime,
        landmarks2D: pose.landmarks2D,
        angles,
        calibration,
        nioshGeom,
        reba,
        rula,
      };
      latestAnalysisRef.current = frameResult;
      onLiveAnalysis(frameResult);
      return frameResult;
    },
    [
      profile,
      params,
      cameraViewMode,
      sideSelection,
      manualRef,
      overlayMode,
      showZones,
      pendingRefPt,
      customPins,
      isPlaying,
      sourceMode,
      onLiveAnalysis,
    ]
  );

  // Analyze the current single video frame (for paused scrubbing or after profile change)
  const analyzeCurrentFrame = useCallback(
    (useSmoothing = false) => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || !aiReady || video.readyState < 2) return null;
      const pose = detector.detectFrame(video, { smooth: useSmoothing });
      lastPoseRef.current = pose;
      return renderAnalysisToCanvas(video, pose);
    },
    [aiReady, renderAnalysisToCanvas]
  );

  // Re-render paused frame immediately when profile/params/overlay/manualRef/pins change
  useEffect(() => {
    const video = videoRef.current;
    if (!video || sourceMode === 'none' || isPlaying || isAutoScanning) return;
    if (lastPoseRef.current) {
      renderAnalysisToCanvas(video, lastPoseRef.current);
    } else if (aiReady && video.readyState >= 2) {
      analyzeCurrentFrame(false);
    }
  }, [
    profile,
    params,
    cameraViewMode,
    sideSelection,
    manualRef,
    overlayMode,
    showZones,
    pendingRefPt,
    customPins,
    isPlaying,
    isAutoScanning,
    sourceMode,
    aiReady,
    renderAnalysisToCanvas,
    analyzeCurrentFrame,
  ]);

  // Continuous loop while playing upload or live camera
  useEffect(() => {
    if (!aiReady || sourceMode === 'none' || isAutoScanning) return;
    if (sourceMode === 'upload' && !isPlaying) return;

    let active = true;
    const tick = () => {
      if (!active) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        if (sourceMode === 'upload') {
          setCurrentTime(video.currentTime);
        }
        analyzeCurrentFrame(sourceMode === 'camera');
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [aiReady, sourceMode, isPlaying, isAutoScanning, analyzeCurrentFrame]);

  // Handle external seek requests (e.g., clicking a point on the timeline chart)
  useEffect(() => {
    if (seekRequestSec === null || sourceMode !== 'upload') return;
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setIsPlaying(false);
    setCustomPins({});
    const onSeeked = () => {
      setCurrentTime(video.currentTime);
      detectorRef.current?.resetSmoothing();
      analyzeCurrentFrame(false);
      onSeekHandled();
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.currentTime = Math.max(0, Math.min(video.duration || 0, seekRequestSec));
  }, [seekRequestSec, sourceMode, analyzeCurrentFrame, onSeekHandled]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const handleVideoFile = (file: File) => {
    stopCamera();
    const url = URL.createObjectURL(file);
    setVideoFileName(file.name);
    setSourceMode('upload');
    setCustomPins({});
    onManualRefChange(null);
    detectorRef.current?.resetSmoothing();

    const video = videoRef.current;
    if (!video) return;
    video.srcObject = null;
    video.src = url;
    video.playbackRate = playbackRate;
    video.onloadedmetadata = () => {
      setDuration(video.duration || 0);
      setCurrentTime(0);
      video.currentTime = Math.min(0.1, video.duration || 0);
    };
    video.onseeked = () => {
      if (!isAutoScanning) {
        setCurrentTime(video.currentTime);
        analyzeCurrentFrame(false);
      }
    };
    video.onended = () => setIsPlaying(false);
  };

  const startLiveCamera = async () => {
    setAiError(null);
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.src = '';
      video.srcObject = stream;
      await video.play();
      setSourceMode('camera');
      setIsPlaying(true);
      setCustomPins({});
      detectorRef.current?.resetSmoothing();
    } catch (err) {
      setAiError(`Tidak dapat mengakses kamera: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || sourceMode !== 'upload') return;
    if (video.paused) {
      setCustomPins({});
      video.playbackRate = playbackRate;
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
      analyzeCurrentFrame(false);
    }
  };

  const stepFrame = (deltaSec: number) => {
    const video = videoRef.current;
    if (!video || sourceMode !== 'upload') return;
    video.pause();
    setIsPlaying(false);
    setCustomPins({});
    const next = Math.max(0, Math.min(duration, video.currentTime + deltaSec));
    video.currentTime = next;
    setCurrentTime(next);
  };

  const handleCapture = (kind: 'origin' | 'destination') => {
    const canvas = canvasRef.current;
    const analysis = latestAnalysisRef.current;
    if (!canvas || !analysis) return;

    const dataUrl = canvas.toDataURL('image/png');
    const calNote =
      analysis.calibration.methodUsed === 'manual_reference'
        ? `Kalibrasi Manual (${manualRef?.knownCm ?? 0} cm)`
        : `Kalibrasi Antropometri ${profile.name} (${analysis.calibration.segmentsUsed.map((s) => s.segmentKey).join(', ')})`;

    onCaptureMoment({
      kind,
      timestampSec: analysis.timestampSec,
      annotatedImageDataUrl: dataUrl,
      rawMeasurements: {
        H: analysis.nioshGeom.H_cm,
        V: analysis.nioshGeom.V_cm,
        A: analysis.nioshGeom.A_deg,
      },
      angles: analysis.angles,
      reba: analysis.reba,
      rula: analysis.rula,
      calibrationConfidence: analysis.calibration.confidence,
      calibrationNote: calNote,
    });
  };

  // Full video Auto-Scan across all motion frames
  const runAutoScan = async () => {
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!video || !detector || !aiReady || sourceMode !== 'upload' || duration <= 0) return;

    video.pause();
    setIsPlaying(false);
    setIsAutoScanning(true);
    setScanProgress(0);
    setCustomPins({});
    detector.resetSmoothing();

    const stepSec = duration > 25 ? 0.5 : duration > 10 ? 0.3 : 0.2;
    const samples: TimelineSample[] = [];
    const zones = getErgonomicZones(profile);

    for (let t = 0; t <= duration; t += stepSec) {
      const targetT = Math.min(duration - 0.02, t);
      await new Promise<void>((resolve) => {
        const handler = () => resolve();
        video.addEventListener('seeked', handler, { once: true });
        video.currentTime = Math.max(0, targetT);
      });

      const pose = detector.detectFrame(video, { smooth: false });
      const frame = renderAnalysisToCanvas(video, pose, {});
      if (frame) {
        samples.push({
          timeSec: Number(targetT.toFixed(2)),
          rebaScore: frame.reba.finalScore,
          rulaScore: frame.rula.finalScore,
          V_cm: frame.nioshGeom.V_cm,
          H_cm: frame.nioshGeom.H_cm,
          A_deg: frame.nioshGeom.A_deg,
          trunkFlexionDeg: frame.angles.trunkFlexionDeg,
          feetVisible: frame.angles.feetVisible,
        });
      }
      setCurrentTime(targetT);
      setScanProgress(Math.min(100, Math.round((t / duration) * 100)));
      // Yield briefly to keep UI responsive
      await new Promise((r) => setTimeout(r, 10));
    }

    // Automatically jump to lowest V (Origin) and capture Origin + highest V (Destination) if samples found
    if (samples.length >= 2) {
      const originSample = samples.reduce((min, cur) => (cur.V_cm < min.V_cm ? cur : min), samples[0]);
      const destSample = samples.reduce((max, cur) => (cur.V_cm > max.V_cm ? cur : max), samples[0]);

      const captureAtTime = async (timeSec: number, kind: 'origin' | 'destination') => {
        await new Promise<void>((resolve) => {
          video.addEventListener('seeked', () => resolve(), { once: true });
          video.currentTime = timeSec;
        });
        const pose = detector.detectFrame(video, { smooth: false });
        const frame = renderAnalysisToCanvas(video, pose, {});
        const canvas = canvasRef.current;
        if (frame && canvas) {
          onCaptureMoment({
            kind,
            timestampSec: frame.timestampSec,
            annotatedImageDataUrl: canvas.toDataURL('image/png'),
            rawMeasurements: {
              H: frame.nioshGeom.H_cm,
              V: frame.nioshGeom.V_cm,
              A: frame.nioshGeom.A_deg,
            },
            angles: frame.angles,
            reba: frame.reba,
            rula: frame.rula,
            calibrationConfidence: frame.calibration.confidence,
            calibrationNote: `Auto-Scan Antropometri ${profile.name} (zona B14–B13: ${zones.knuckleCm}–${zones.elbowCm} cm)`,
          });
        }
      };

      await captureAtTime(originSample.timeSec, 'origin');
      await captureAtTime(destSample.timeSec, 'destination');
    }

    onTimelineComplete(samples);
    setScanProgress(100);
    setIsAutoScanning(false);
  };

  // Convert pointer event to internal canvas coordinates
  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>): Point2D | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getCanvasPoint(e);
    if (!pt) return;

    if (isCalibratingRef) {
      if (!pendingRefPt) {
        setPendingRefPt(pt);
      } else {
        onManualRefChange({
          p1: pendingRefPt,
          p2: pt,
          knownCm: refKnownCm,
          label: `Referensi ${refKnownCm} cm`,
        });
        setPendingRefPt(null);
        setIsCalibratingRef(false);
      }
      return;
    }

    // Draggable measurement pins when paused
    if (!isPlaying && latestAnalysisRef.current) {
      const g = latestAnalysisRef.current.nioshGeom;
      if (dist2D(pt, g.handMidPx) < 28) {
        setDraggingPin('hand');
      } else if (dist2D(pt, g.ankleMidPx) < 28) {
        setDraggingPin('ankle');
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingPin) return;
    const pt = getCanvasPoint(e);
    if (!pt) return;
    setCustomPins((prev) =>
      draggingPin === 'hand' ? { ...prev, handMidPx: pt } : { ...prev, ankleMidPx: pt, floorY: Math.max(pt.y + 10, prev.floorY ?? pt.y + 10) }
    );
  };

  const handleCanvasMouseUp = () => {
    setDraggingPin(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#D8E0E8] bg-white px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleVideoFile(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F5BD8] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#0B4AB3] cursor-pointer"
          >
            <Upload className="h-4 w-4" />
            Upload Video
          </button>
          <button
            type="button"
            onClick={startLiveCamera}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 py-1.5 text-sm font-semibold text-[#142130] hover:bg-[#F1F5F9] cursor-pointer"
          >
            <Camera className="h-4 w-4 text-[#0F5BD8]" />
            Live Kamera
          </button>

          {sourceMode === 'upload' && (
            <button
              type="button"
              disabled={!aiReady || isAutoScanning}
              onClick={runAutoScan}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#115E59] disabled:opacity-50 cursor-pointer"
            >
              <ScanLine className="h-4 w-4" />
              {isAutoScanning ? `Memindai ${scanProgress}%...` : 'Auto-Scan Semua Gerakan'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${
              aiReady ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${aiReady ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
            {aiStatus}
          </span>
        </div>
      </div>

      {aiError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-sm text-red-700">{aiError}</div>
      )}

      {/* Video & Overlay Canvas Stage */}
      <div
        className="relative overflow-hidden rounded-xl border border-[#1E293B] bg-[#0D1520]"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f && f.type.startsWith('video/')) handleVideoFile(f);
        }}
      >
        <video ref={videoRef} playsInline muted className="hidden" />

        {sourceMode === 'none' ? (
          <div className="flex min-h-[380px] flex-col items-center justify-center px-6 py-12 text-center text-slate-300">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800/90 text-sky-400">
              <Film className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-bold text-white">
              Siap Menganalisis Video Pengangkatan — Profil Aktif: {profile.name}
            </h3>
            <p className="mt-2 max-w-lg text-sm text-slate-400">
              Kalibrasi otomatis telah diatur menggunakan data antropometri <strong className="text-sky-300">{profile.name}</strong>{' '}
              (Tinggi tegak <span className="font-numeric text-white">{profile.dimensions.B2} cm</span>, Lengan bawah{' '}
              <span className="font-numeric text-white">{profile.dimensions.D21} cm</span>, Lutut{' '}
              <span className="font-numeric text-white">{profile.dimensions.D7} cm</span>, Kaki{' '}
              <span className="font-numeric text-white">{profile.dimensions.T5} cm</span>).
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0F5BD8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0B4AB3] cursor-pointer"
              >
                <Upload className="h-4 w-4" />
                Pilih / Tarik File Video (.mp4 / .mov)
              </button>
              <button
                type="button"
                onClick={startLiveCamera}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 cursor-pointer"
              >
                <Camera className="h-4 w-4" />
                Mulai Live Kamera
              </button>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Tips: Pastikan kedua telapak kaki terlihat di frame agar pengukuran H, V, A sesuai ketentuan dosen.
            </p>
          </div>
        ) : (
          <div className="relative flex items-center justify-center bg-black">
            <canvas
              ref={canvasRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              className={`max-h-[540px] w-full object-contain ${
                isCalibratingRef ? 'cursor-crosshair' : !isPlaying ? 'cursor-grab' : 'cursor-default'
              }`}
            />
            {isCalibratingRef && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-purple-700 px-4 py-1.5 text-xs font-semibold text-white shadow-lg">
                {pendingRefPt
                  ? `Klik titik ujung kedua dari objek ${refKnownCm} cm`
                  : `Klik titik awal objek referensi (${refKnownCm} cm, misal tinggi rak atau meteran)`}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls Bar: Playback, Overlay Modes, Calibration & Capture */}
      {sourceMode !== 'none' && (
        <div className="flex flex-col gap-2.5 rounded-xl border border-[#D8E0E8] bg-white p-3">
          {/* Scrubber for Uploaded Video */}
          {sourceMode === 'upload' && (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => stepFrame(-0.04)}
                title="Mundur 1 frame"
                className="rounded-lg border border-[#CBD5E1] p-1.5 hover:bg-slate-100 cursor-pointer"
              >
                <SkipBack className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={togglePlay}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#142130] px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                onClick={() => stepFrame(0.04)}
                title="Maju 1 frame"
                className="rounded-lg border border-[#CBD5E1] p-1.5 hover:bg-slate-100 cursor-pointer"
              >
                <SkipForward className="h-4 w-4" />
              </button>

              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.02}
                value={currentTime}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  const video = videoRef.current;
                  if (video) {
                    video.pause();
                    setIsPlaying(false);
                    setCustomPins({});
                    video.currentTime = val;
                    setCurrentTime(val);
                  }
                }}
                className="h-2 flex-1 accent-[#0F5BD8] cursor-pointer"
              />

              <span className="font-numeric text-xs font-semibold text-[#516275]">
                {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
              </span>

              <select
                value={playbackRate}
                onChange={(e) => {
                  const rate = Number(e.target.value);
                  setPlaybackRate(rate);
                  if (videoRef.current) videoRef.current.playbackRate = rate;
                }}
                className="rounded-md border border-[#CBD5E1] bg-slate-50 px-2 py-1 text-xs font-semibold"
              >
                <option value={0.25}>0.25x</option>
                <option value={0.5}>0.5x</option>
                <option value={1}>1.0x</option>
              </select>
            </div>
          )}

          {/* Overlay toggles, 2-Point Calibration, Capture Origin/Dest */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'combined', label: 'Lengkap (V/H/A + Sudut)' },
                  { id: 'niosh', label: 'NIOSH (V, H, A)' },
                  { id: 'reba_rula', label: 'REBA/RULA (Sudut)' },
                  { id: 'zones', label: 'Zona Tinggi' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setOverlayMode(tab.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                    overlayMode === tab.id
                      ? 'bg-[#142130] text-white'
                      : 'bg-slate-100 text-[#516275] hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <label className="ml-1 inline-flex items-center gap-1.5 text-xs font-medium text-[#516275] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showZones}
                  onChange={(e) => setShowZones(e.target.checked)}
                  className="accent-[#0F5BD8]"
                />
                Zona {profile.name}
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* 2-point reference ruler */}
              <div className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2 py-1">
                <Ruler className="h-3.5 w-3.5 text-purple-700" />
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={refKnownCm}
                  onChange={(e) => setRefKnownCm(Number(e.target.value) || 85)}
                  className="font-numeric w-12 rounded border border-purple-200 bg-white px-1 py-0.5 text-xs font-semibold text-purple-900"
                  title="Panjang nyata objek referensi (cm), misal tinggi rak 85 cm"
                />
                <span className="text-[11px] font-medium text-purple-800">cm</span>
                <button
                  type="button"
                  onClick={() => {
                    setPendingRefPt(null);
                    setIsCalibratingRef((v) => !v);
                  }}
                  className="ml-1 rounded bg-purple-700 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-purple-800 cursor-pointer"
                >
                  {isCalibratingRef ? 'Batal' : 'Kalibrasi 2-Titik'}
                </button>
                {manualRef && (
                  <button
                    type="button"
                    onClick={() => onManualRefChange(null)}
                    title="Kembali ke kalibrasi antropometri otomatis"
                    className="rounded p-0.5 text-purple-700 hover:bg-purple-100 cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {(customPins.ankleMidPx || customPins.handMidPx) && (
                <button
                  type="button"
                  onClick={() => setCustomPins({})}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <Crosshair className="h-3.5 w-3.5" />
                  Reset Pin
                </button>
              )}

              <button
                type="button"
                onClick={() => handleCapture('origin')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 cursor-pointer"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Capture ORIGIN
              </button>
              <button
                type="button"
                onClick={() => handleCapture('destination')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Capture DESTINATION
              </button>
            </div>
          </div>

          {videoFileName && (
            <div className="flex items-center justify-between text-[11px] text-[#516275]">
              <span>File aktif: <strong>{videoFileName}</strong></span>
              <span>Saat pause, pin <strong>Hand Grip</strong> & <strong>Mid-Ankle</strong> dapat digeser langsung di video untuk koreksi presisi.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
