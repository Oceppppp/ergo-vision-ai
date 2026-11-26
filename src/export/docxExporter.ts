import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { formatPlacementLabel } from '../data/placement';
import type {
  CapturedMoment,
  NioshFullResult,
  NioshPointMeasurement,
  StudentProfile,
  TaskParameters,
  TimelineSample,
} from '../types/ergo';

function fmtComma(val: number, digits = 2): string {
  if (!Number.isFinite(val)) return '∞';
  return val.toFixed(digits).replace('.', ',');
}

function durationLabel(cat: TaskParameters['durationCategory']): string {
  if (cat === 'short') return '< 1';
  if (cat === 'moderate') return '≤ 2';
  return '≤ 8';
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Reads exact pixel width & height from PNG IHDR chunk (bytes 16..23) so Word images never stretch/squash.
 */
export function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width === 0 || height === 0) return null;
  return { width, height };
}

export function fitImagePreserveAspect(
  natW: number,
  natH: number,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  const scale = Math.min(maxW / natW, maxH / natH);
  return {
    width: Math.max(1, Math.round(natW * scale)),
    height: Math.max(1, Math.round(natH * scale)),
  };
}

function cell(
  text: string,
  opts?: {
    bold?: boolean;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    colSpan?: number;
    rowSpan?: number;
    fill?: string;
    size?: number;
    widthPct?: number;
  }
): TableCell {
  return new TableCell({
    columnSpan: opts?.colSpan,
    rowSpan: opts?.rowSpan,
    verticalAlign: VerticalAlign.CENTER,
    width: opts?.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
    shading: opts?.fill
      ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.fill }
      : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: opts?.align ?? AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({
            text,
            bold: opts?.bold ?? false,
            font: 'Times New Roman',
            size: (opts?.size ?? 10) * 2,
          }),
        ],
      }),
    ],
  });
}

function boxTableForRwl(
  label: string,
  vals: { LC: number; HM: number; VM: number; DM: number; AM: number; FM: number; CM: number; RWL: number }
): Table {
  const headers = ['Tahap', 'LC', 'HM', 'VM', 'DM', 'AM', 'FM', 'CM', 'RWL (kg)'];
  const values = [
    label,
    fmtComma(vals.LC, 0),
    fmtComma(vals.HM),
    fmtComma(vals.VM),
    fmtComma(vals.DM),
    fmtComma(vals.AM),
    fmtComma(vals.FM),
    fmtComma(vals.CM),
    `${fmtComma(vals.RWL)} kg`,
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: headers.map((h) => cell(h, { bold: true, fill: 'EAF1FB', size: 9.5 })),
      }),
      new TableRow({
        children: values.map((v, i) =>
          cell(v, {
            bold: i === 0 || i === values.length - 1,
            fill: i === values.length - 1 ? 'FEF9C3' : undefined,
            size: 10,
          })
        ),
      }),
    ],
  });
}

export interface DocxExportPayload {
  profile: StudentProfile;
  params: TaskParameters;
  originPoint: NioshPointMeasurement;
  destinationPoint: NioshPointMeasurement;
  niosh: NioshFullResult;
  originCapture: CapturedMoment | null;
  destinationCapture: CapturedMoment | null;
  timelineSamples: TimelineSample[];
}

export async function generateWorksheetDocx(payload: DocxExportPayload): Promise<Blob> {
  const { profile, params, originPoint, destinationPoint, niosh, originCapture, destinationCapture, timelineSamples } =
    payload;
  const d = profile.dimensions;

  const heading = (text: string, size = 12, align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT) =>
    new Paragraph({
      alignment: align,
      spacing: { before: 180, after: 80 },
      children: [new TextRun({ text, bold: true, font: 'Times New Roman', size: size * 2 })],
    });

  const bodyLine = (label: string, value: string) =>
    new Paragraph({
      spacing: { before: 20, after: 20 },
      children: [
        new TextRun({ text: label, bold: true, font: 'Times New Roman', size: 21 }),
        new TextRun({ text: value, font: 'Times New Roman', size: 21 }),
      ],
    });

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 160 },
      children: [
        new TextRun({
          text: 'JOB ANALYSIS WORKSHEET',
          bold: true,
          font: 'Times New Roman',
          size: 28,
        }),
      ],
    }),
    // Header metadata matching lecturer's DOCX layout
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
      rows: [
        new TableRow({
          children: [
            cell(`DEPARTMENT: ${params.department}`, { align: AlignmentType.LEFT, bold: false, widthPct: 50 }),
            cell(`JOB DESCRIPTION: ${params.jobDescription}`, { align: AlignmentType.LEFT, bold: false, widthPct: 50 }),
          ],
        }),
        new TableRow({
          children: [
            cell(`JOB TITLE: ${params.jobTitle}`, { align: AlignmentType.LEFT, widthPct: 50 }),
            cell(
              `OBJEK: ${params.loadWeightKg} kg (P ${params.objectLengthCm} × L ${params.objectWidthCm} × T ${params.objectHeightCm} cm) | ${formatPlacementLabel(
                params.originSurface,
                params.originSurfaceCustom,
                params.originHeightCm
              )} → ${formatPlacementLabel(
                params.destinationSurface,
                params.destinationSurfaceCustom,
                params.destinationHeightCm
              )}`,
              { align: AlignmentType.LEFT, widthPct: 50 }
            ),
          ],
        }),
        new TableRow({
          children: [
            cell(`ANALYST'S NAME: ${params.analystName || profile.name}`, { align: AlignmentType.LEFT, widthPct: 50 }),
            cell(`SUBJEK ANTROPOMETRI: ${profile.name} (B2=${d.B2} cm, B10=${d.B10} cm, B13=${d.B13} cm, D7=${d.D7} cm, D21=${d.D21} cm)`, {
              align: AlignmentType.LEFT,
              widthPct: 50,
            }),
          ],
        }),
        new TableRow({
          children: [
            cell(`DATE: ${params.date}`, { align: AlignmentType.LEFT, widthPct: 50 }),
            cell(`KALIBRASI: Multi-Segmen Antropometri (${profile.name}) — T5=${d.T5} cm, D13=${d.D13} cm`, {
              align: AlignmentType.LEFT,
              widthPct: 50,
            }),
          ],
        }),
      ],
    }),

    // STEP 1 Table matching exact DOCX Worksheet columns
    heading('STEP 1. Measure and Record Task Variables', 11),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            cell('Object Weight (kg)', { bold: true, colSpan: 2, fill: 'EAF1FB', size: 9 }),
            cell('Hand Location (cm)', { bold: true, colSpan: 4, fill: 'EAF1FB', size: 9 }),
            cell('Vertical Distance (cm)', { bold: true, rowSpan: 2, fill: 'EAF1FB', size: 9 }),
            cell('Asymmetric Angle (degrees)', { bold: true, colSpan: 2, fill: 'EAF1FB', size: 9 }),
            cell('Frequency Rate (lifts/min)', { bold: true, rowSpan: 2, fill: 'EAF1FB', size: 9 }),
            cell('Duration (hrs)', { bold: true, rowSpan: 2, fill: 'EAF1FB', size: 9 }),
            cell('Object Coupling', { bold: true, rowSpan: 2, fill: 'EAF1FB', size: 9 }),
          ],
        }),
        new TableRow({
          children: [
            cell('L(avg)', { bold: true, rowSpan: 2, fill: 'F8FAFC', size: 8.5 }),
            cell('L(max)', { bold: true, rowSpan: 2, fill: 'F8FAFC', size: 8.5 }),
            cell('Origin', { bold: true, colSpan: 2, fill: 'F8FAFC', size: 8.5 }),
            cell('Destination', { bold: true, colSpan: 2, fill: 'F8FAFC', size: 8.5 }),
            cell('Origin', { bold: true, fill: 'F8FAFC', size: 8.5 }),
            cell('Dest.', { bold: true, fill: 'F8FAFC', size: 8.5 }),
          ],
        }),
        new TableRow({
          children: [
            cell('H', { bold: true, fill: 'F8FAFC', size: 8.5 }),
            cell('V', { bold: true, fill: 'F8FAFC', size: 8.5 }),
            cell('H', { bold: true, fill: 'F8FAFC', size: 8.5 }),
            cell('V', { bold: true, fill: 'F8FAFC', size: 8.5 }),
            cell('D', { bold: true, fill: 'F8FAFC', size: 8.5 }),
            cell('A', { bold: true, fill: 'F8FAFC', size: 8.5 }),
            cell('A', { bold: true, fill: 'F8FAFC', size: 8.5 }),
            cell('F', { bold: true, fill: 'F8FAFC', size: 8.5 }),
            cell('', { bold: true, fill: 'F8FAFC', size: 8.5 }),
            cell('C', { bold: true, fill: 'F8FAFC', size: 8.5 }),
          ],
        }),
        new TableRow({
          children: [
            cell(fmtComma(params.loadWeightKg), { bold: true }),
            cell(fmtComma(params.loadWeightKg), { bold: true }),
            cell(fmtComma(originPoint.H, 1), { bold: true }),
            cell(fmtComma(originPoint.V, 1), { bold: true }),
            cell(fmtComma(destinationPoint.H, 1), { bold: true }),
            cell(fmtComma(destinationPoint.V, 1), { bold: true }),
            cell(fmtComma(niosh.D, 1), { bold: true }),
            cell(`${fmtComma(originPoint.A, 1)}°`, { bold: true }),
            cell(`${fmtComma(destinationPoint.A, 1)}°`, { bold: true }),
            cell(fmtComma(params.frequencyPerMin), { bold: true }),
            cell(durationLabel(params.durationCategory), { bold: true }),
            cell(params.coupling, { bold: true }),
          ],
        }),
      ],
    }),

    // STEP 2
    heading("STEP 2. Determine the multipliers and Compute the RWL's", 11),
    new Paragraph({
      spacing: { before: 20, after: 60 },
      children: [
        new TextRun({
          text: 'Rumus: RWL = LC × HM × VM × DM × AM × FM × CM   (LC = 23 kg)',
          italics: true,
          font: 'Times New Roman',
          size: 20,
        }),
      ],
    }),
    boxTableForRwl('ORIGIN', niosh.origin),
    new Paragraph({ spacing: { before: 60, after: 40 }, children: [] }),
    boxTableForRwl('DESTINATION', niosh.destination),

    // STEP 3
    heading('STEP 3. Compute the LIFTING INDEX', 11),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            cell('Tahap', { bold: true, fill: 'EAF1FB' }),
            cell('Rumus LIFTING INDEX = Object Weight (L) / RWL', { bold: true, fill: 'EAF1FB' }),
            cell('Lifting Index (LI)', { bold: true, fill: 'EAF1FB' }),
            cell('Status Risiko NIOSH', { bold: true, fill: 'EAF1FB' }),
          ],
        }),
        new TableRow({
          children: [
            cell('ORIGIN', { bold: true }),
            cell(`${fmtComma(params.loadWeightKg)} / ${fmtComma(niosh.origin.RWL)}`),
            cell(fmtComma(niosh.origin.LI), { bold: true, fill: niosh.origin.isSafe ? 'DCFCE7' : 'FEE2E2' }),
            cell(niosh.origin.isSafe ? 'Aman (LI ≤ 1)' : 'Berisiko Cedera (LI > 1)', { bold: true }),
          ],
        }),
        new TableRow({
          children: [
            cell('DESTINATION', { bold: true }),
            cell(`${fmtComma(params.loadWeightKg)} / ${fmtComma(niosh.destination.RWL)}`),
            cell(fmtComma(niosh.destination.LI), { bold: true, fill: niosh.destination.isSafe ? 'DCFCE7' : 'FEE2E2' }),
            cell(niosh.destination.isSafe ? 'Aman (LI ≤ 1)' : 'Berisiko Cedera (LI > 1)', { bold: true }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { before: 80, after: 40 }, children: [] }),
    bodyLine(
      'Kesimpulan NIOSH: ',
      `Nilai LI penentu berada pada posisi ${niosh.governingSide.toUpperCase()} sebesar ${fmtComma(niosh.governingLI)} (${
        niosh.isSafe ? 'AMAN / LI ≤ 1' : 'BERISIKO CEDERA / LI > 1'
      }). Faktor penurun RWL terbesar: ${
        niosh.governingSide === 'destination' ? niosh.destination.limitingFactor : niosh.origin.limitingFactor
      }.`
    ),
  ];

  // Redesign suggestions
  children.push(heading('Rekomendasi Perancangan Ulang Ergonomi (Berdasarkan Materi NIOSH)', 11));
  niosh.redesignSuggestions.forEach((s, idx) => {
    children.push(
      new Paragraph({
        spacing: { before: 20, after: 30 },
        children: [new TextRun({ text: `${idx + 1}. ${s}`, font: 'Times New Roman', size: 20 })],
      })
    );
  });

  // REBA & RULA Breakdown Section
  if (originCapture || destinationCapture) {
    children.push(heading('ANALISIS POSTUR REBA & RULA (ORIGIN & DESTINATION)', 12));

    const rows: TableRow[] = [
      new TableRow({
        children: [
          cell('Momen', { bold: true, fill: 'EAF1FB' }),
          cell('Trunk / Neck / Knee (°)', { bold: true, fill: 'EAF1FB' }),
          cell('UA / LA / Wrist (°)', { bold: true, fill: 'EAF1FB' }),
          cell('REBA (A / B / Final)', { bold: true, fill: 'EAF1FB' }),
          cell('RULA (C / D / Final)', { bold: true, fill: 'EAF1FB' }),
          cell('Tindakan', { bold: true, fill: 'EAF1FB' }),
        ],
      }),
    ];

    const addMomentRow = (label: string, cap: CapturedMoment) => {
      const a = cap.angles;
      const side = cap.reba.side;
      const ua = side === 'left' ? a.leftUpperArmFlexionDeg : a.rightUpperArmFlexionDeg;
      const la = side === 'left' ? a.leftLowerArmFlexionDeg : a.rightLowerArmFlexionDeg;
      const wr = side === 'left' ? a.leftWristFlexionDeg : a.rightWristFlexionDeg;
      rows.push(
        new TableRow({
          children: [
            cell(`${label} (${cap.timestampSec.toFixed(2)}s)`, { bold: true }),
            cell(`${a.trunkFlexionDeg}° / ${a.neckFlexionDeg}° / ${a.maxKneeFlexionDeg}°`),
            cell(`${ua}° / ${la}° / ${wr}°`),
            cell(
              `A=${cap.reba.scoreA}, B=${cap.reba.scoreB} → Skor ${cap.reba.finalScore} (${cap.reba.riskLevelId})`,
              { bold: true }
            ),
            cell(
              `C=${cap.rula.scoreC}, D=${cap.rula.scoreD} → Skor ${cap.rula.finalScore} (${cap.rula.riskLevelId})`,
              { bold: true }
            ),
            cell(`REBA L${cap.reba.actionLevel}: ${cap.reba.recommendation} | RULA L${cap.rula.actionLevel}: ${cap.rula.recommendation}`, {
              align: AlignmentType.LEFT,
              size: 8.5,
            }),
          ],
        })
      );
    };

    if (originCapture) addMomentRow('ORIGIN', originCapture);
    if (destinationCapture) addMomentRow('DESTINATION', destinationCapture);

    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
  }

  // Timeline Auto-Scan summary
  if (timelineSamples.length > 0) {
    const maxReba = Math.max(...timelineSamples.map((s) => s.rebaScore));
    const maxRula = Math.max(...timelineSamples.map((s) => s.rulaScore));
    const minV = Math.min(...timelineSamples.map((s) => s.V_cm));
    const maxV = Math.max(...timelineSamples.map((s) => s.V_cm));
    const maxH = Math.max(...timelineSamples.map((s) => s.H_cm));
    const maxA = Math.max(...timelineSamples.map((s) => s.A_deg));

    children.push(heading('RINGKASAN ANALISIS PERGERAKAN VIDEO (AUTO-SCAN)', 11));
    children.push(
      bodyLine(
        `Total ${timelineSamples.length} frame teranalisis: `,
        `REBA puncak = ${maxReba}/15, RULA puncak = ${maxRula}/7, rentang V = ${fmtComma(minV, 1)}–${fmtComma(maxV, 1)} cm, H maksimum = ${fmtComma(maxH, 1)} cm, sudut asimetri A maksimum = ${fmtComma(maxA, 1)}°.`
      )
    );
  }

  // Embedded Annotated Evidence Photos (preserves exact portrait/landscape aspect ratio — never squashed!)
  if (originCapture?.annotatedImageDataUrl || destinationCapture?.annotatedImageDataUrl) {
    children.push(heading('BUKTI PENGUKURAN VISUAL BERANOTASI (GARIS UKUR V, H, A & SUDUT SENDI)', 11));

    const buildImageCell = (title: string, cap: CapturedMoment, maxW: number, maxH: number): TableCell | null => {
      try {
        const bytes = dataUrlToUint8Array(cap.annotatedImageDataUrl);
        const dims = readPngDimensions(bytes) ?? { width: cap.frameWidth ?? 760, height: cap.frameHeight ?? 1280 };
        const fitted = fitImagePreserveAspect(dims.width, dims.height, maxW, maxH);
        const side = cap.reba.side;
        const ua = side === 'left' ? cap.angles.leftUpperArmFlexionDeg : cap.angles.rightUpperArmFlexionDeg;
        const la = side === 'left' ? cap.angles.leftLowerArmFlexionDeg : cap.angles.rightLowerArmFlexionDeg;
        const wr = side === 'left' ? cap.angles.leftWristFlexionDeg : cap.angles.rightWristFlexionDeg;

        return new TableCell({
          verticalAlign: VerticalAlign.TOP,
          margins: { top: 80, bottom: 80, left: 80, right: 80 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 40 },
              children: [new TextRun({ text: title, bold: true, font: 'Times New Roman', size: 20 })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 20, after: 60 },
              children: [
                new ImageRun({
                  type: 'png',
                  data: bytes,
                  transformation: { width: fitted.width, height: fitted.height },
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 20, after: 20 },
              children: [
                new TextRun({
                  text: `t=${cap.timestampSec.toFixed(2)}s | V=${fmtComma(
                    cap.overrideMeasurements?.V ?? cap.rawMeasurements.V,
                    1
                  )} cm | H=${fmtComma(cap.overrideMeasurements?.H ?? cap.rawMeasurements.H, 1)} cm | A=${fmtComma(
                    cap.overrideMeasurements?.A ?? cap.rawMeasurements.A,
                    1
                  )}°`,
                  bold: true,
                  font: 'Times New Roman',
                  size: 18,
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 0 },
              children: [
                new TextRun({
                  text: `Trunk ${cap.angles.trunkFlexionDeg}° · Neck ${cap.angles.neckFlexionDeg}° · Knee ${cap.angles.maxKneeFlexionDeg}° · UA ${ua}° · LA ${la}° · Wrist ${wr}° | REBA=${cap.reba.finalScore} · RULA=${cap.rula.finalScore}`,
                  font: 'Times New Roman',
                  size: 17,
                }),
              ],
            }),
          ],
        });
      } catch {
        return null;
      }
    };

    const origBytes = originCapture?.annotatedImageDataUrl ? dataUrlToUint8Array(originCapture.annotatedImageDataUrl) : null;
    const origDims = origBytes ? readPngDimensions(origBytes) : null;
    const isPortraitPair =
      Boolean(originCapture?.annotatedImageDataUrl && destinationCapture?.annotatedImageDataUrl) &&
      Boolean(origDims && origDims.height > origDims.width);

    if (isPortraitPair && originCapture && destinationCapture) {
      // Side-by-side 2-column layout for portrait phone photos (natural 9:16 aspect, zero distortion!)
      const c1 = buildImageCell('Foto 1: Posisi ORIGIN', originCapture, 250, 445);
      const c2 = buildImageCell('Foto 2: Posisi DESTINATION', destinationCapture, 250, 445);
      if (c1 && c2) {
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [new TableRow({ children: [c1, c2] })],
          })
        );
      }
    } else {
      const embedSingle = (title: string, cap: CapturedMoment) => {
        const c = buildImageCell(title, cap, 500, 420);
        if (c) {
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [new TableRow({ children: [c] })],
            }),
            new Paragraph({ spacing: { before: 40, after: 40 }, children: [] })
          );
        }
      };
      if (originCapture?.annotatedImageDataUrl) embedSingle('Foto 1: Posisi ORIGIN (Mulai Mengangkat)', originCapture);
      if (destinationCapture?.annotatedImageDataUrl)
        embedSingle('Foto 2: Posisi DESTINATION (Meletakkan Beban)', destinationCapture);
    }
  }

  // Anthropometry reference table for the selected student
  children.push(heading(`DATA ANTROPOMETRI KALIBRASI — ${profile.name.toUpperCase()}`, 11));
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            cell('B2 Tegak', { bold: true, fill: 'EAF1FB', size: 8.5 }),
            cell('B10 Bahu', { bold: true, fill: 'EAF1FB', size: 8.5 }),
            cell('B13 Siku', { bold: true, fill: 'EAF1FB', size: 8.5 }),
            cell('B14 Tangan', { bold: true, fill: 'EAF1FB', size: 8.5 }),
            cell('D7 Lutut', { bold: true, fill: 'EAF1FB', size: 8.5 }),
            cell('D13 Lebar Bahu', { bold: true, fill: 'EAF1FB', size: 8.5 }),
            cell('D21 Lengan Bawah', { bold: true, fill: 'EAF1FB', size: 8.5 }),
            cell('T5 Telapak Kaki', { bold: true, fill: 'EAF1FB', size: 8.5 }),
          ],
        }),
        new TableRow({
          children: [
            cell(`${d.B2} cm`),
            cell(`${d.B10} cm`),
            cell(`${d.B13} cm`),
            cell(`${d.B14} cm`),
            cell(`${d.D7} cm`),
            cell(`${d.D13} cm`),
            cell(`${d.D21} cm`),
            cell(`${d.T5} cm`),
          ],
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}
