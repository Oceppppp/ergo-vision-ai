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

function drawPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  bgColor: string,
  textColor = '#FFFFFF',
  fontSize = 13
) {
  ctx.save();
  ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
  const metrics = ctx.measureText(text);
  const padX = 7;
  const padY = 4;
  const w = metrics.width + padX * 2;
  const h = fontSize + padY * 2;

  const rx = Math.max(4, Math.min(ctx.canvas.width - w - 4, x - w / 2));
  const ry = Math.max(4, Math.min(ctx.canvas.height - h - 4, y - h / 2));

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(rx, ry, w, h, 5);
  ctx.fill();

  ctx.fillStyle = textColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, rx + padX, ry + h / 2 + 0.5);
  ctx.restore();
}

function drawDimensionLine(
  ctx: CanvasRenderingContext2D,
  a: Point2D,
  b: Point2D,
  label: string,
  color: string,
  dashed = false
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.setLineDash(dashed ? [8, 6] : []);

  // Main line
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  // End perpendicular ticks (engineering ruler style like lecturer's photo)
  ctx.setLineDash([]);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const perp = angle + Math.PI / 2;
  const tickLen = 10;

  for (const pt of [a, b]) {
    ctx.beginPath();
    ctx.moveTo(pt.x - Math.cos(perp) * tickLen, pt.y - Math.sin(perp) * tickLen);
    ctx.lineTo(pt.x + Math.cos(perp) * tickLen, pt.y + Math.sin(perp) * tickLen);
    ctx.stroke();
  }

  // Label at midpoint offset slightly
  const mid = midpoint2D(a, b);
  drawPill(ctx, label, mid.x, mid.y - 16, 'rgba(13, 21, 32, 0.9)', color, 13);
  ctx.restore();
}

function drawAngleArc(
  ctx: CanvasRenderingContext2D,
  vertex: Point2D,
  p1: Point2D,
  p2: Point2D,
  radius: number,
  color: string,
  label: string
) {
  const a1 = Math.atan2(p1.y - vertex.y, p1.x - vertex.x);
  const a2 = Math.atan2(p2.y - vertex.y, p2.x - vertex.x);
  let diff = a2 - a1;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color.replace('1)', '0.18)');
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(vertex.x, vertex.y);
  ctx.arc(vertex.x, vertex.y, radius, a1, a1 + diff, diff < 0);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.arc(vertex.x, vertex.y, radius, a1, a1 + diff, diff < 0);
  ctx.stroke();

  const midAngle = a1 + diff / 2;
  const lx = vertex.x + Math.cos(midAngle) * (radius + 26);
  const ly = vertex.y + Math.sin(midAngle) * (radius + 26);
  drawPill(ctx, label, lx, ly, 'rgba(13, 21, 32, 0.88)', '#FFFFFF', 11.5);
  ctx.restore();
}

function riskColorForScore(score: number, max: number): string {
  const ratio = score / max;
  if (ratio <= 0.3) return '#22C55E';
  if (ratio <= 0.55) return '#FACC15';
  if (ratio <= 0.78) return '#FB923C';
  return '#EF4444';
}

export function drawErgonomicOverlay(ctx: CanvasRenderingContext2D, opts: OverlayDrawOptions): void {
  const { width, height } = ctx.canvas;
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

  // 1. Anthropometric Ergonomic Height Zones (Slide 9, 11, 14)
  if ((showZones || mode === 'zones') && calibration.cmPerPixel > 0) {
    const cmToCanvasY = (cm: number) => calibration.floorY - cm / calibration.cmPerPixel;
    const yKnee = cmToCanvasY(zones.kneeCm);
    const yKnuckle = cmToCanvasY(zones.knuckleCm);
    const yElbow = cmToCanvasY(zones.elbowCm);
    const yShoulder = cmToCanvasY(zones.shoulderCm);

    ctx.save();
    // Preferred zone band (Knuckle B14 to Elbow B13)
    const bandTop = Math.max(0, Math.min(yElbow, yKnuckle));
    const bandHeight = Math.abs(yKnuckle - yElbow);
    if (bandHeight > 6 && bandTop < height) {
      ctx.fillStyle = 'rgba(34, 197, 94, 0.14)';
      ctx.fillRect(0, bandTop, width, bandHeight);
    }

    const zoneLines = [
      { y: yShoulder, label: `B10 Bahu ${zones.shoulderCm} cm`, color: 'rgba(248, 113, 113, 0.85)' },
      { y: yElbow, label: `B13 Siku ${zones.elbowCm} cm (Ideal Top)`, color: 'rgba(74, 222, 128, 0.9)' },
      { y: yKnuckle, label: `B14 Tangan ${zones.knuckleCm} cm (Ideal Low)`, color: 'rgba(74, 222, 128, 0.9)' },
      { y: yKnee, label: `D7 Lutut ${zones.kneeCm} cm`, color: 'rgba(250, 204, 21, 0.9)' },
    ];

    zoneLines.forEach((zl) => {
      if (zl.y < 12 || zl.y > height - 12) return;
      ctx.strokeStyle = zl.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(0, zl.y);
      ctx.lineTo(width, zl.y);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(13, 21, 32, 0.78)';
      const tw = ctx.measureText(zl.label).width + 10;
      ctx.fillRect(8, zl.y - 16, tw, 16);
      ctx.fillStyle = zl.color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(zl.label, 13, zl.y - 8);
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
    ctx.strokeStyle = isFoot ? 'rgba(56, 189, 248, 0.95)' : 'rgba(226, 232, 240, 0.85)';
    ctx.lineWidth = isFoot ? 3.5 : 2.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Landmark dots
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
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // 3. REBA & RULA Joint Angle Arcs
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

    // Vertical reference line through hip for Trunk flexion
    const vertUp: Point2D = { x: midHip.x, y: midHip.y - 90 };
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(midHip.x, midHip.y);
    ctx.lineTo(vertUp.x, vertUp.y);
    ctx.stroke();
    ctx.restore();

    drawAngleArc(
      ctx,
      midHip,
      vertUp,
      midSh,
      36,
      angles.trunkFlexionDeg > 20 ? 'rgba(239, 68, 68, 1)' : 'rgba(34, 197, 94, 1)',
      `Trunk ${angles.trunkFlexionDeg}°`
    );

    const uaDeg = side === 'left' ? angles.leftUpperArmFlexionDeg : angles.rightUpperArmFlexionDeg;
    const laDeg = side === 'left' ? angles.leftLowerArmFlexionDeg : angles.rightLowerArmFlexionDeg;
    const kneeDeg = side === 'left' ? angles.leftKneeFlexionDeg : angles.rightKneeFlexionDeg;
    const wristDeg = side === 'left' ? angles.leftWristFlexionDeg : angles.rightWristFlexionDeg;

    drawAngleArc(ctx, sh, hip, el, 30, uaDeg > 45 ? 'rgba(251, 146, 60, 1)' : 'rgba(56, 189, 248, 1)', `UA ${uaDeg}°`);
    drawAngleArc(ctx, el, sh, wr, 26, laDeg < 60 || laDeg > 100 ? 'rgba(250, 204, 21, 1)' : 'rgba(34, 197, 94, 1)', `LA ${laDeg}°`);
    drawAngleArc(ctx, knee, hip, ankle, 26, kneeDeg > 60 ? 'rgba(239, 68, 68, 1)' : 'rgba(56, 189, 248, 1)', `Knee ${kneeDeg}°`);

    drawPill(ctx, `Neck ${angles.neckFlexionDeg}°`, midEar.x + 42, midEar.y - 12, 'rgba(13, 21, 32, 0.86)', '#E2E8F0', 11);
    drawPill(ctx, `Wrist ${wristDeg}°`, wr.x + 36, wr.y + 18, 'rgba(13, 21, 32, 0.86)', '#E2E8F0', 11);
  }

  // 4. NIOSH Dimension Lines (V cm, H cm, A ° — matching lecturer's 3-panel photo!)
  if (mode === 'combined' || mode === 'niosh') {
    const floorY = nioshGeom.floorProjectionPx.y;

    // Floor reference line
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.moveTo(Math.max(16, Math.min(nioshGeom.ankleMidPx.x, nioshGeom.handMidPx.x) - 80), floorY);
    ctx.lineTo(Math.min(width - 16, Math.max(nioshGeom.ankleMidPx.x, nioshGeom.handMidPx.x) + 80), floorY);
    ctx.stroke();
    ctx.restore();

    // Vertical height V (cm): floor projection to hand grip midpoint
    drawDimensionLine(ctx, nioshGeom.floorProjectionPx, nioshGeom.handMidPx, `V = ${nioshGeom.V_cm} cm`, '#FACC15');

    // Horizontal reach H (cm): ankle midpoint (projected on floor) to hand floor projection
    const ankleFloorPt: Point2D =
      calibration.detectedView === 'front_top'
        ? nioshGeom.ankleMidPx
        : { x: nioshGeom.ankleMidPx.x, y: floorY };
    const hTargetPt: Point2D =
      calibration.detectedView === 'front_top' ? nioshGeom.handMidPx : nioshGeom.floorProjectionPx;
    drawDimensionLine(ctx, ankleFloorPt, hTargetPt, `H = ${nioshGeom.H_cm} cm`, '#38BDF8');

    // Asymmetry angle arc A (°) from sagittal line
    ctx.save();
    ctx.strokeStyle = '#F472B6';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(nioshGeom.ankleMidPx.x, nioshGeom.ankleMidPx.y);
    ctx.lineTo(nioshGeom.sagittalDirectionPx.x, nioshGeom.sagittalDirectionPx.y);
    ctx.stroke();
    ctx.restore();

    if (nioshGeom.A_deg >= 3) {
      drawAngleArc(
        ctx,
        nioshGeom.ankleMidPx,
        nioshGeom.sagittalDirectionPx,
        nioshGeom.handMidPx,
        38,
        'rgba(244, 114, 182, 1)',
        `A = ${nioshGeom.A_deg}°`
      );
    } else {
      drawPill(ctx, `A = ${nioshGeom.A_deg}°`, nioshGeom.ankleMidPx.x, nioshGeom.ankleMidPx.y + 24, 'rgba(13, 21, 32, 0.88)', '#F472B6', 12);
    }

    // Highlight Mid-Ankle and Hand Grip control pins
    const drawPin = (pt: Point2D, fill: string, label: string) => {
      ctx.save();
      ctx.fillStyle = fill;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = interactivePins ? 3 : 2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, interactivePins ? 8 : 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      drawPill(ctx, label, pt.x, pt.y - 22, 'rgba(13, 21, 32, 0.85)', fill, 10.5);
    };

    drawPin(nioshGeom.ankleMidPx, '#38BDF8', interactivePins ? 'Mid-Ankle (geser)' : 'Mid-Ankle');
    drawPin(nioshGeom.handMidPx, '#FACC15', interactivePins ? 'Hand Grip (geser)' : 'Hand Grip');
  }

  // 5. Manual 2-Point Calibration Reference Ruler
  if (manualRef) {
    drawDimensionLine(ctx, manualRef.p1, manualRef.p2, `Kalibrasi: ${manualRef.knownCm} cm`, '#A855F7', true);
  }
  if (pendingRefPoint) {
    ctx.save();
    ctx.fillStyle = '#A855F7';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(pendingRefPoint.x, pendingRefPoint.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    drawPill(ctx, 'Klik titik ke-2...', pendingRefPoint.x, pendingRefPoint.y - 22, '#581C87', '#FFFFFF', 11);
  }

  // 6. Compact Evidence HUD Stamp (baked into snapshots)
  if (showHudBadge) {
    ctx.save();
    const boxW = Math.min(width - 24, 410);
    const boxH = 66;
    ctx.fillStyle = 'rgba(13, 21, 32, 0.84)';
    ctx.beginPath();
    ctx.roundRect(12, 12, boxW, boxH, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 12.5px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const timePart = timestampLabel ? `  |  ${timestampLabel}` : '';
    ctx.fillText(`Subjek: ${profile.name} (B2 ${profile.dimensions.B2} cm)${timePart}`, 22, 20);

    ctx.font = '600 12px "JetBrains Mono", monospace';
    ctx.fillStyle = '#FACC15';
    ctx.fillText(`V:${nioshGeom.V_cm}cm`, 22, 41);
    ctx.fillStyle = '#38BDF8';
    ctx.fillText(`H:${nioshGeom.H_cm}cm`, 112, 41);
    ctx.fillStyle = '#F472B6';
    ctx.fillText(`A:${nioshGeom.A_deg}°`, 200, 41);

    ctx.fillStyle = riskColorForScore(reba.finalScore, 15);
    ctx.fillText(`REBA:${reba.finalScore}`, 276, 41);
    ctx.fillStyle = riskColorForScore(rula.finalScore, 7);
    ctx.fillText(`RULA:${rula.finalScore}`, 346, 41);

    // Feet visibility badge top-right
    const feetColor = angles.feetVisible ? '#15803D' : '#DC2626';
    const feetText = angles.feetVisible ? 'KAKI TERLIHAT: OK' : 'PERINGATAN: KAKI TIDAK TERLIHAT';
    drawPill(ctx, feetText, width - (angles.feetVisible ? 92 : 148), 28, feetColor, '#FFFFFF', 11.5);
    ctx.restore();
  }
}

/**
 * Generates a side-by-side 2- or 3-panel PNG evidence image (matching lecturer's style)
 */
export async function buildEvidenceCollageDataUrl(
  panels: Array<{ title: string; subtitle: string; imageDataUrl: string }>
): Promise<string> {
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

  const panelW = 640;
  const panelH = 400;
  const headerH = 54;
  const gap = 16;
  const pad = 20;

  const canvas = document.createElement('canvas');
  canvas.width = pad * 2 + valid.length * panelW + (valid.length - 1) * gap;
  canvas.height = pad * 2 + headerH + panelH;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0D1520';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  valid.forEach((p, idx) => {
    const x = pad + idx * (panelW + gap);
    const y = pad;

    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.roundRect(x, y, panelW, headerH + panelH, 10);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 16px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(p.title, x + 14, y + 22);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 12px "JetBrains Mono", monospace';
    ctx.fillText(p.subtitle, x + 14, y + 42);

    // Draw image aspect-fit into panelW x panelH
    const img = imgs[idx];
    const scale = Math.min(panelW / img.width, panelH / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = x + (panelW - dw) / 2;
    const dy = y + headerH + (panelH - dh) / 2;

    ctx.fillStyle = '#020617';
    ctx.fillRect(x, y + headerH, panelW, panelH);
    ctx.drawImage(img, dx, dy, dw, dh);
  });

  return canvas.toDataURL('image/png');
}
