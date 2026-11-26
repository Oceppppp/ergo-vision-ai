import type {
  BodyAngles,
  CalibrationResult,
  ErgonomicZones,
  ManualReferenceLine,
  NioshLiveGeometry,
  Point2D,
  PoseLandmark2D,
  RebaResult,
  RulaResult,
  StudentProfile,
} from '../types/ergo';
import { LM, midpoint2D, toPixel } from '../engine/geometry';

export type OverlayMode = 'combined' | 'niosh' | 'reba_rula' | 'zones';

export interface OverlayDrawOptions {
  mode: OverlayMode;
  showZones: boolean;
  showHudBadge: boolean;
  profile: StudentProfile;
  landmarks2D: PoseLandmark2D[];
  angles: BodyAngles;
  calibration: CalibrationResult;
  nioshGeom: NioshLiveGeometry;
  zones: ErgonomicZones;
  reba: RebaResult;
  rula: RulaResult;
  manualRef?: ManualReferenceLine | null;
  pendingRefPoint?: Point2D | null;
  interactivePins?: boolean;
  timestampLabel?: string;
}

/**
 * Guarantees a sharp HD internal canvas resolution even for low-res WhatsApp videos
 * (e.g., upscales 360x640 -> 760x1351 while capping max dimension at 1440px).
 */
export function computeCrispCanvasSize(videoWidth: number, videoHeight: number): { width: number; height: number } {
  if (videoWidth <= 0 || videoHeight <= 0) return { width: 1280, height: 720 };
  const shortSide = Math.min(videoWidth, videoHeight);
  const longSide = Math.max(videoWidth, videoHeight);

  let scale = 1;
  if (shortSide < 760) {
    scale = 760 / shortSide;
  }
  if (longSide * scale > 1440) {
    scale = 1440 / longSide;
  }
  return {
    width: Math.round(videoWidth * scale),
    height: Math.round(videoHeight * scale),
  };
}

interface BoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

class LabelPlacer {
  private placed: BoxRect[] = [];
  private canvasW: number;
  private canvasH: number;

  constructor(canvasW: number, canvasH: number) {
    this.canvasW = canvasW;
    this.canvasH = canvasH;
  }

  reserve(rect: BoxRect) {
    this.placed.push(rect);
  }

  private intersectsAny(r: BoxRect): boolean {
    const pad = 4;
    for (const o of this.placed) {
      if (
        r.x < o.x + o.w + pad &&
        r.x + r.w + pad > o.x &&
        r.y < o.y + o.h + pad &&
        r.y + r.h + pad > o.y
      ) {
        return true;
      }
    }
    return false;
  }

  place(
    ctx: CanvasRenderingContext2D,
    text: string,
    targetX: number,
    targetY: number,
    bgColor: string,
    textColor: string,
    fontSize: number,
    anchor?: Point2D
  ) {
    ctx.save();
    ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
    const metrics = ctx.measureText(text);
    const padX = Math.round(fontSize * 0.55);
    const padY = Math.round(fontSize * 0.34);
    const w = Math.ceil(metrics.width + padX * 2);
    const h = Math.ceil(fontSize + padY * 2);

    const clampRect = (cx: number, cy: number): BoxRect => ({
      x: Math.max(8, Math.min(this.canvasW - w - 8, cx - w / 2)),
      y: Math.max(8, Math.min(this.canvasH - h - 8, cy - h / 2)),
      w,
      h,
    });

    const stepY = h + 6;
    const stepX = Math.round(w * 0.65);
    const offsets: Array<[number, number]> = [
      [0, 0],
      [0, -stepY],
      [0, stepY],
      [stepX, 0],
      [-stepX, 0],
      [stepX, -stepY],
      [-stepX, -stepY],
      [stepX, stepY],
      [-stepX, stepY],
      [0, -stepY * 2],
      [0, stepY * 2],
      [stepX * 1.4, -stepY],
      [-stepX * 1.4, -stepY],
      [0, -stepY * 3],
      [0, stepY * 3],
    ];

    let chosen = clampRect(targetX, targetY);
    for (const [dx, dy] of offsets) {
      const candidate = clampRect(targetX + dx, targetY + dy);
      if (!this.intersectsAny(candidate)) {
        chosen = candidate;
        break;
      }
    }
    this.placed.push(chosen);

    // Draw subtle leader line if label was nudged away from its anchor
    if (anchor) {
      const cx = chosen.x + chosen.w / 2;
      const cy = chosen.y + chosen.h / 2;
      const dist = Math.hypot(cx - anchor.x, cy - anchor.y);
      if (dist > 22) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = Math.max(1.5, fontSize * 0.11);
        ctx.beginPath();
        ctx.moveTo(anchor.x, anchor.y);
        ctx.lineTo(cx, cy);
        ctx.stroke();
      }
    }

    // Pill background + crisp border
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(chosen.x, chosen.y, chosen.w, chosen.h, 6);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.25;
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, chosen.x + padX, chosen.y + chosen.h / 2 + 0.5);
    ctx.restore();
  }
}

const SKELETON_EDGES: Array<[number, number]> = [
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST],
  [LM.LEFT_WRIST, LM.LEFT_INDEX],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
  [LM.RIGHT_WRIST, LM.RIGHT_INDEX],
  [LM.LEFT_SHOULDER, LM.LEFT_HIP],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.LEFT_KNEE],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE],
  [LM.LEFT_ANKLE, LM.LEFT_HEEL],
  [LM.LEFT_HEEL, LM.LEFT_FOOT_INDEX],
  [LM.LEFT_ANKLE, LM.LEFT_FOOT_INDEX],
  [LM.RIGHT_HIP, LM.RIGHT_KNEE],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  [LM.RIGHT_ANKLE, LM.RIGHT_HEEL],
  [LM.RIGHT_HEEL, LM.RIGHT_FOOT_INDEX],
  [LM.RIGHT_ANKLE, LM.RIGHT_FOOT_INDEX],
  [LM.NOSE, LM.LEFT_EAR],
  [LM.NOSE, LM.RIGHT_EAR],
];

function drawDimensionLine(
  ctx: CanvasRenderingContext2D,
  placer: LabelPlacer,
  a: Point2D,
  b: Point2D,
  label: string,
  color: string,
  s: number,
  labelOffset: { dx: number; dy: number },
  dashed = false
) {
  ctx.save();
  // Dark outer casing for crisp visibility over any light/dark background
  ctx.strokeStyle = 'rgba(13, 21, 32, 0.78)';
  ctx.lineWidth = 6 * s;
  ctx.setLineDash(dashed ? [10 * s, 7 * s] : []);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = 3.2 * s;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  // End perpendicular ticks (engineering ruler style)
  ctx.setLineDash([]);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const perp = angle + Math.PI / 2;
  const tickLen = 12 * s;

  for (const pt of [a, b]) {
    ctx.strokeStyle = 'rgba(13, 21, 32, 0.78)';
    ctx.lineWidth = 5 * s;
    ctx.beginPath();
    ctx.moveTo(pt.x - Math.cos(perp) * tickLen, pt.y - Math.sin(perp) * tickLen);
    ctx.lineTo(pt.x + Math.cos(perp) * tickLen, pt.y + Math.sin(perp) * tickLen);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(pt.x - Math.cos(perp) * tickLen, pt.y - Math.sin(perp) * tickLen);
    ctx.lineTo(pt.x + Math.cos(perp) * tickLen, pt.y + Math.sin(perp) * tickLen);
    ctx.stroke();
  }
  ctx.restore();

  const mid = midpoint2D(a, b);
  placer.place(
    ctx,
    label,
    mid.x + labelOffset.dx * s,
    mid.y + labelOffset.dy * s,
    'rgba(13, 21, 32, 0.92)',
    color,
    Math.round(15 * s),
    mid
  );
}

function drawAngleArc(
  ctx: CanvasRenderingContext2D,
  placer: LabelPlacer,
  vertex: Point2D,
  p1: Point2D,
  p2: Point2D,
  radius: number,
  color: string,
  label: string,
  s: number
) {
  const a1 = Math.atan2(p1.y - vertex.y, p1.x - vertex.x);
  const a2 = Math.atan2(p2.y - vertex.y, p2.x - vertex.x);
  let diff = a2 - a1;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color.replace('1)', '0.22)');
  ctx.lineWidth = 2.8 * s;
  ctx.beginPath();
  ctx.moveTo(vertex.x, vertex.y);
  ctx.arc(vertex.x, vertex.y, radius, a1, a1 + diff, diff < 0);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.arc(vertex.x, vertex.y, radius, a1, a1 + diff, diff < 0);
  ctx.stroke();
  ctx.restore();

  const midAngle = a1 + diff / 2;
  const lx = vertex.x + Math.cos(midAngle) * (radius + 34 * s);
  const ly = vertex.y + Math.sin(midAngle) * (radius + 34 * s);
  placer.place(ctx, label, lx, ly, 'rgba(13, 21, 32, 0.9)', '#FFFFFF', Math.round(13 * s), vertex);
}

function riskColorForScore(score: number, max: number): string {
  const ratio = score / max;
  if (ratio <= 0.3) return '#4ADE80';
  if (ratio <= 0.55) return '#FACC15';
  if (ratio <= 0.78) return '#FB923C';
  return '#F87171';
}

export function drawErgonomicOverlay(ctx: CanvasRenderingContext2D, opts: OverlayDrawOptions): void {
  const { width, height } = ctx.canvas;
  const s = Math.max(0.95, Math.min(1.65, width / 640));
  const placer = new LabelPlacer(width, height);

  const {
    mode,
    showZones,
    showHudBadge,
    profile,
    landmarks2D,
    angles,
    calibration,
    nioshGeom,
    zones,
    reba,
    rula,
    manualRef,
    pendingRefPoint,
    interactivePins,
    timestampLabel,
  } = opts;

  const px = (idx: number) => toPixel(landmarks2D[idx], width, height);
  const vis = (idx: number) => landmarks2D[idx]?.visibility ?? 1;

  // Reserve full-width top HUD bar BEFORE placing any labels so nothing ever collides with HUD
  const hudH = showHudBadge ? Math.round(74 * s) : 0;
  if (showHudBadge) {
    placer.reserve({ x: 0, y: 0, w: width, h: hudH + 10 });
  }

  // 1. Anthropometric Ergonomic Height Zones (Slide 9, 11, 14)
  if ((showZones || mode === 'zones') && calibration.cmPerPixel > 0) {
    const cmToCanvasY = (cm: number) => calibration.floorY - cm / calibration.cmPerPixel;
    const yKnee = cmToCanvasY(zones.kneeCm);
    const yKnuckle = cmToCanvasY(zones.knuckleCm);
    const yElbow = cmToCanvasY(zones.elbowCm);
    const yShoulder = cmToCanvasY(zones.shoulderCm);

    ctx.save();
    const bandTop = Math.max(hudH, Math.min(yElbow, yKnuckle));
    const bandHeight = Math.abs(yKnuckle - yElbow);
    if (bandHeight > 6 && bandTop < height) {
      ctx.fillStyle = 'rgba(34, 197, 94, 0.13)';
      ctx.fillRect(0, bandTop, width, bandHeight);
    }

    const zoneLines = [
      { y: yShoulder, label: `B10 ${zones.shoulderCm}cm`, color: 'rgba(248, 113, 113, 0.9)' },
      { y: yElbow, label: `B13 ${zones.elbowCm}cm`, color: 'rgba(74, 222, 128, 0.95)' },
      { y: yKnuckle, label: `B14 ${zones.knuckleCm}cm`, color: 'rgba(74, 222, 128, 0.95)' },
      { y: yKnee, label: `D7 ${zones.kneeCm}cm`, color: 'rgba(250, 204, 21, 0.95)' },
    ];

    const zFont = Math.round(11.5 * s);
    ctx.font = `700 ${zFont}px "JetBrains Mono", monospace`;

    zoneLines.forEach((zl) => {
      if (zl.y < hudH + 18 || zl.y > height - 16) return;
      ctx.strokeStyle = zl.color;
      ctx.lineWidth = 1.6 * s;
      ctx.setLineDash([7 * s, 7 * s]);
      ctx.beginPath();
      ctx.moveTo(0, zl.y);
      ctx.lineTo(width, zl.y);
      ctx.stroke();

      ctx.setLineDash([]);
      const tw = ctx.measureText(zl.label).width + 12 * s;
      const th = zFont + 8 * s;
      ctx.fillStyle = 'rgba(13, 21, 32, 0.8)';
      ctx.beginPath();
      ctx.roundRect(8, zl.y - th - 2, tw, th, 4);
      ctx.fill();
      ctx.fillStyle = zl.color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(zl.label, 8 + 6 * s, zl.y - th / 2 - 2);
      placer.reserve({ x: 8, y: zl.y - th - 2, w: tw, h: th });
    });
    ctx.restore();
  }

  // 2. Pose Skeleton
  ctx.save();
  ctx.lineCap = 'round';
  for (const [i, j] of SKELETON_EDGES) {
    if (vis(i) < 0.35 || vis(j) < 0.35) continue;
    const a = px(i);
    const b = px(j);
    const isFoot = i >= LM.LEFT_ANKLE || j >= LM.LEFT_ANKLE;

    ctx.strokeStyle = 'rgba(13, 21, 32, 0.65)';
    ctx.lineWidth = (isFoot ? 6 : 4.5) * s;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.strokeStyle = isFoot ? '#38BDF8' : '#F8FAFC';
    ctx.lineWidth = (isFoot ? 3.8 : 2.6) * s;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  const keyJoints = [
    LM.LEFT_SHOULDER,
    LM.RIGHT_SHOULDER,
    LM.LEFT_ELBOW,
    LM.RIGHT_ELBOW,
    LM.LEFT_WRIST,
    LM.RIGHT_WRIST,
    LM.LEFT_HIP,
    LM.RIGHT_HIP,
    LM.LEFT_KNEE,
    LM.RIGHT_KNEE,
    LM.LEFT_ANKLE,
    LM.RIGHT_ANKLE,
    LM.LEFT_HEEL,
    LM.RIGHT_HEEL,
    LM.LEFT_FOOT_INDEX,
    LM.RIGHT_FOOT_INDEX,
  ];
  for (const idx of keyJoints) {
    if (vis(idx) < 0.35) continue;
    const pt = px(idx);
    ctx.fillStyle = idx >= LM.LEFT_ANKLE ? '#38BDF8' : '#FFFFFF';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4.8 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // 3. NIOSH Dimension Lines FIRST (higher visual priority: V cm, H cm, A °)
  if (mode === 'combined' || mode === 'niosh') {
    const floorY = nioshGeom.floorProjectionPx.y;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2.4 * s;
    ctx.setLineDash([12 * s, 8 * s]);
    ctx.beginPath();
    ctx.moveTo(Math.max(16, Math.min(nioshGeom.ankleMidPx.x, nioshGeom.handMidPx.x) - 85 * s), floorY);
    ctx.lineTo(Math.min(width - 16, Math.max(nioshGeom.ankleMidPx.x, nioshGeom.handMidPx.x) + 85 * s), floorY);
    ctx.stroke();
    ctx.restore();

    // Vertical height V (cm) — label cleanly to the right of the vertical ruler
    const vSideSign = nioshGeom.handMidPx.x > width * 0.7 ? -64 : 64;
    drawDimensionLine(
      ctx,
      placer,
      nioshGeom.floorProjectionPx,
      nioshGeom.handMidPx,
      `V = ${nioshGeom.V_cm} cm`,
      '#FACC15',
      s,
      { dx: vSideSign, dy: 0 }
    );

    // Horizontal reach H (cm) — label cleanly below floor line
    const ankleFloorPt: Point2D =
      calibration.detectedView === 'front_top'
        ? nioshGeom.ankleMidPx
        : { x: nioshGeom.ankleMidPx.x, y: floorY };
    const hTargetPt: Point2D =
      calibration.detectedView === 'front_top' ? nioshGeom.handMidPx : nioshGeom.floorProjectionPx;
    drawDimensionLine(ctx, placer, ankleFloorPt, hTargetPt, `H = ${nioshGeom.H_cm} cm`, '#38BDF8', s, {
      dx: 0,
      dy: 28,
    });

    // Asymmetry angle arc A (°)
    ctx.save();
    ctx.strokeStyle = '#F472B6';
    ctx.lineWidth = 2.4 * s;
    ctx.setLineDash([7 * s, 6 * s]);
    ctx.beginPath();
    ctx.moveTo(nioshGeom.ankleMidPx.x, nioshGeom.ankleMidPx.y);
    ctx.lineTo(nioshGeom.sagittalDirectionPx.x, nioshGeom.sagittalDirectionPx.y);
    ctx.stroke();
    ctx.restore();

    if (nioshGeom.A_deg >= 3) {
      drawAngleArc(
        ctx,
        placer,
        nioshGeom.ankleMidPx,
        nioshGeom.sagittalDirectionPx,
        nioshGeom.handMidPx,
        36 * s,
        'rgba(244, 114, 182, 1)',
        `A = ${nioshGeom.A_deg}°`,
        s
      );
    } else {
      placer.place(
        ctx,
        `A = ${nioshGeom.A_deg}°`,
        nioshGeom.ankleMidPx.x,
        nioshGeom.ankleMidPx.y + 30 * s,
        'rgba(13, 21, 32, 0.9)',
        '#F472B6',
        Math.round(13.5 * s),
        nioshGeom.ankleMidPx
      );
    }

    // Highlight Mid-Ankle & Hand Grip pins (omit "(geser)" clutter when exporting snapshots)
    const drawPin = (pt: Point2D, fill: string, label: string) => {
      ctx.save();
      ctx.fillStyle = fill;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = (interactivePins ? 3.2 : 2.4) * s;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, (interactivePins ? 8.5 : 6.5) * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (interactivePins) {
        placer.place(ctx, label, pt.x, pt.y - 24 * s, 'rgba(13, 21, 32, 0.88)', fill, Math.round(11.5 * s), pt);
      }
    };

    drawPin(nioshGeom.ankleMidPx, '#38BDF8', 'Mid-Ankle (geser)');
    drawPin(nioshGeom.handMidPx, '#FACC15', 'Hand Grip (geser)');
  }

  // 4. REBA & RULA Joint Angle Arcs (with collision-free label placement)
  if (mode === 'combined' || mode === 'reba_rula') {
    const side = angles.dominantSide;
    const sh = px(side === 'left' ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER);
    const el = px(side === 'left' ? LM.LEFT_ELBOW : LM.RIGHT_ELBOW);
    const wr = px(side === 'left' ? LM.LEFT_WRIST : LM.RIGHT_WRIST);
    const hip = px(side === 'left' ? LM.LEFT_HIP : LM.RIGHT_HIP);
    const knee = px(side === 'left' ? LM.LEFT_KNEE : LM.RIGHT_KNEE);
    const ankle = px(side === 'left' ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE);

    const midSh = midpoint2D(px(LM.LEFT_SHOULDER), px(LM.RIGHT_SHOULDER));
    const midHip = midpoint2D(px(LM.LEFT_HIP), px(LM.RIGHT_HIP));
    const midEar = midpoint2D(px(LM.LEFT_EAR), px(LM.RIGHT_EAR));

    const vertUp: Point2D = { x: midHip.x, y: midHip.y - 85 * s };
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.8 * s;
    ctx.setLineDash([6 * s, 6 * s]);
    ctx.beginPath();
    ctx.moveTo(midHip.x, midHip.y);
    ctx.lineTo(vertUp.x, vertUp.y);
    ctx.stroke();
    ctx.restore();

    drawAngleArc(
      ctx,
      placer,
      midHip,
      vertUp,
      midSh,
      34 * s,
      angles.trunkFlexionDeg > 20 ? 'rgba(239, 68, 68, 1)' : 'rgba(34, 197, 94, 1)',
      `Trunk ${angles.trunkFlexionDeg}°`,
      s
    );

    const uaDeg = side === 'left' ? angles.leftUpperArmFlexionDeg : angles.rightUpperArmFlexionDeg;
    const laDeg = side === 'left' ? angles.leftLowerArmFlexionDeg : angles.rightLowerArmFlexionDeg;
    const kneeDeg = side === 'left' ? angles.leftKneeFlexionDeg : angles.rightKneeFlexionDeg;
    const wristDeg = side === 'left' ? angles.leftWristFlexionDeg : angles.rightWristFlexionDeg;

    drawAngleArc(ctx, placer, sh, hip, el, 28 * s, uaDeg > 45 ? 'rgba(251, 146, 60, 1)' : 'rgba(56, 189, 248, 1)', `UA ${uaDeg}°`, s);
    drawAngleArc(ctx, placer, el, sh, wr, 24 * s, laDeg < 60 || laDeg > 100 ? 'rgba(250, 204, 21, 1)' : 'rgba(34, 197, 94, 1)', `LA ${laDeg}°`, s);
    drawAngleArc(ctx, placer, knee, hip, ankle, 24 * s, kneeDeg > 60 ? 'rgba(239, 68, 68, 1)' : 'rgba(56, 189, 248, 1)', `Knee ${kneeDeg}°`, s);

    placer.place(ctx, `Neck ${angles.neckFlexionDeg}°`, midEar.x + 58 * s, midEar.y - 16 * s, 'rgba(13, 21, 32, 0.9)', '#E2E8F0', Math.round(12.5 * s), midEar);
    placer.place(ctx, `Wrist ${wristDeg}°`, wr.x + 56 * s, wr.y + 20 * s, 'rgba(13, 21, 32, 0.9)', '#E2E8F0', Math.round(12.5 * s), wr);
  }

  // 5. Manual 2-Point Calibration Reference Ruler
  if (manualRef) {
    drawDimensionLine(ctx, placer, manualRef.p1, manualRef.p2, `Kalibrasi: ${manualRef.knownCm} cm`, '#C084FC', s, { dx: 0, dy: -22 }, true);
  }
  if (pendingRefPoint) {
    ctx.save();
    ctx.fillStyle = '#A855F7';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.arc(pendingRefPoint.x, pendingRefPoint.y, 8 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    placer.place(ctx, 'Klik titik ke-2...', pendingRefPoint.x, pendingRefPoint.y - 26 * s, '#581C87', '#FFFFFF', Math.round(12.5 * s), pendingRefPoint);
  }

  // 6. Full-Width Portrait-Safe 2-Row HUD Bar (never clips or collides!)
  if (showHudBadge) {
    ctx.save();
    ctx.fillStyle = 'rgba(13, 21, 32, 0.9)';
    ctx.fillRect(0, 0, width, hudH);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, hudH);
    ctx.lineTo(width, hudH);
    ctx.stroke();

    const padX = Math.round(14 * s);
    const titleSize = Math.round(14 * s);
    const metricSize = Math.round(13.5 * s);

    // Row 1 Left: Subject & Timestamp
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 ${titleSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const timePart = timestampLabel ? ` · ${timestampLabel}` : '';
    ctx.fillText(`${profile.name} (B2 ${profile.dimensions.B2} cm)${timePart}`, padX, Math.round(22 * s));

    // Row 1 Right: Feet status pill (always fits neatly inside right edge)
    const feetText = angles.feetVisible ? 'KAKI OK' : 'KAKI TDK TERLIHAT';
    const feetColor = angles.feetVisible ? '#15803D' : '#DC2626';
    const badgeFont = Math.round(11.5 * s);
    ctx.font = `700 ${badgeFont}px "JetBrains Mono", monospace`;
    const bw = ctx.measureText(feetText).width + 16 * s;
    const bh = Math.round(22 * s);
    const bx = width - padX - bw;
    const by = Math.round(11 * s);
    ctx.fillStyle = feetColor;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 5);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(feetText, bx + bw / 2, by + bh / 2 + 0.5);

    // Row 2: 5 evenly spaced metric cells across full canvas width
    const metrics = [
      { text: `V: ${nioshGeom.V_cm}cm`, color: '#FACC15' },
      { text: `H: ${nioshGeom.H_cm}cm`, color: '#38BDF8' },
      { text: `A: ${nioshGeom.A_deg}°`, color: '#F472B6' },
      { text: `REBA: ${reba.finalScore}`, color: riskColorForScore(reba.finalScore, 15) },
      { text: `RULA: ${rula.finalScore}`, color: riskColorForScore(rula.finalScore, 7) },
    ];
    const colW = (width - padX * 2) / metrics.length;
    ctx.font = `700 ${metricSize}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'left';
    metrics.forEach((m, i) => {
      ctx.fillStyle = m.color;
      ctx.fillText(m.text, padX + i * colW, Math.round(52 * s));
    });

    ctx.restore();
  }
}

export interface EvidencePanelSpec {
  title: string;
  subtitle: string;
  detailLines: string[];
  imageDataUrl: string;
}

/**
 * Generates an aspect-ratio-preserving HD PNG collage with ZERO black sidebars
 * and a crisp structured data footer under each snapshot.
 */
export async function buildEvidenceCollageDataUrl(panels: EvidencePanelSpec[]): Promise<string> {
  const valid = panels.filter((p) => Boolean(p.imageDataUrl));
  if (valid.length === 0) return '';

  const imgs = await Promise.all(
    valid.map(
      (p) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = p.imageDataUrl;
        })
    )
  );

  // Size each panel cleanly to match natural image aspect ratio (no giant black sidebars!)
  const isPortrait = imgs[0].height > imgs[0].width;
  const imgH = isPortrait ? 920 : 540;
  const panelWidths = imgs.map((img) => Math.max(460, Math.round((img.width / img.height) * imgH)));
  const headerH = 74;
  const footerH = 112;
  const gap = 24;
  const pad = 28;

  const totalW = pad * 2 + panelWidths.reduce((a, b) => a + b, 0) + gap * (valid.length - 1);
  const totalH = pad * 2 + headerH + imgH + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = totalW;
  canvas.height = totalH;

  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = '#0D1520';
  ctx.fillRect(0, 0, totalW, totalH);

  let cursorX = pad;
  valid.forEach((p, idx) => {
    const pw = panelWidths[idx];
    const x = cursorX;
    const y = pad;

    // Card shell
    ctx.fillStyle = '#162233';
    ctx.beginPath();
    ctx.roundRect(x, y, pw, headerH + imgH + footerH, 14);
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Header
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(p.title, x + 18, y + 14);

    ctx.fillStyle = '#93C5FD';
    ctx.font = '700 15px "JetBrains Mono", monospace';
    ctx.fillText(p.subtitle, x + 18, y + 44);

    // Image drawn at exact natural aspect ratio
    const img = imgs[idx];
    const drawW = Math.round((img.width / img.height) * imgH);
    const dx = x + Math.round((pw - drawW) / 2);
    ctx.drawImage(img, dx, y + headerH, drawW, imgH);

    // Structured Data Footer
    const fy = y + headerH + imgH;
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(x + 1, fy, pw - 2, footerH - 1);
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '600 14.5px "JetBrains Mono", monospace';
    p.detailLines.slice(0, 4).forEach((line, lineIdx) => {
      ctx.fillText(line, x + 18, fy + 16 + lineIdx * 23);
    });

    cursorX += pw + gap;
  });

  return canvas.toDataURL('image/png');
}
