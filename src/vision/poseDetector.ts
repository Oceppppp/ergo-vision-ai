import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import type { PoseLandmark2D } from '../types/ergo';

export interface PoseDetectionFrame {
  landmarks2D: PoseLandmark2D[];
  worldLandmarks?: PoseLandmark2D[];
}

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

export class ErgoPoseDetector {
  private landmarker: PoseLandmarker | null = null;
  private initPromise: Promise<void> | null = null;
  private monotonicMs = 0;
  private prevSmoothed: PoseLandmark2D[] | null = null;

  async init(onStatus?: (msg: string) => void): Promise<void> {
    if (this.landmarker) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      onStatus?.('Memuat runtime AI MediaPipe Pose...');
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN);

      try {
        onStatus?.('Menginisialisasi model PoseLandmarker (GPU)...');
        this.landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.45,
          minPosePresenceConfidence: 0.45,
          minTrackingConfidence: 0.45,
        });
      } catch {
        onStatus?.('GPU tidak tersedia, beralih ke CPU...');
        this.landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.45,
          minPosePresenceConfidence: 0.45,
          minTrackingConfidence: 0.45,
        });
      }
      onStatus?.('AI Pose siap digunakan');
    })();

    return this.initPromise;
  }

  resetSmoothing(): void {
    this.prevSmoothed = null;
  }

  detectFrame(
    video: HTMLVideoElement,
    options?: { smooth?: boolean; alpha?: number }
  ): PoseDetectionFrame | null {
    if (!this.landmarker || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    // Monotonically increasing clock prevents MediaPipe VIDEO-mode timestamp errors during backward scrubbing
    this.monotonicMs += 33;
    let result: PoseLandmarkerResult;
    try {
      result = this.landmarker.detectForVideo(video, this.monotonicMs);
    } catch {
      return null;
    }

    if (!result.landmarks || result.landmarks.length === 0) {
      return null;
    }

    const raw2D: PoseLandmark2D[] = result.landmarks[0].map((lm) => ({
      x: lm.x,
      y: lm.y,
      z: lm.z,
      visibility: lm.visibility ?? 1,
    }));

    const worldLandmarks: PoseLandmark2D[] | undefined = result.worldLandmarks?.[0]?.map((lm) => ({
      x: lm.x,
      y: lm.y,
      z: lm.z,
      visibility: lm.visibility ?? 1,
    }));

    if (options?.smooth && this.prevSmoothed && this.prevSmoothed.length === raw2D.length) {
      const a = options.alpha ?? 0.48;
      const smoothed = raw2D.map((lm, i) => {
        const p = this.prevSmoothed![i];
        return {
          x: p.x + (lm.x - p.x) * a,
          y: p.y + (lm.y - p.y) * a,
          z: p.z + (lm.z - p.z) * a,
          visibility: lm.visibility,
        };
      });
      this.prevSmoothed = smoothed;
      return { landmarks2D: smoothed, worldLandmarks };
    }

    this.prevSmoothed = raw2D;
    return { landmarks2D: raw2D, worldLandmarks };
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
    this.initPromise = null;
    this.prevSmoothed = null;
  }
}
