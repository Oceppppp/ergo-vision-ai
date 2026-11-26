import { getErgonomicZones } from '../data/anthropometry';
import { formatPlacementLabel } from '../data/placement';
import type {
  CapturedMoment,
  NioshFullResult,
  NioshPointMeasurement,
  StudentProfile,
  TaskParameters,
  TimelineSample,
} from '../types/ergo';

export type RecommendationPriority = 'Kritis' | 'Tinggi' | 'Sedang' | 'Pemeliharaan';

export interface PrioritizedRecommendation {
  priority: RecommendationPriority;
  title: string;
  detail: string;
  reference: string;
  weight: number;
}

export interface ErgonomicSummaryReport {
  conclusions: string[];
  recommendations: PrioritizedRecommendation[];
}

export interface ErgonomicSummaryInput {
  profile: StudentProfile;
  params: TaskParameters;
  originPoint: NioshPointMeasurement;
  destinationPoint: NioshPointMeasurement;
  niosh: NioshFullResult;
  originCapture: CapturedMoment | null;
  destinationCapture: CapturedMoment | null;
  timelineSamples: TimelineSample[];
}

function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return 'tak terhingga';
  return n.toFixed(digits).replace('.', ',');
}

function directionVerb(dir: TaskParameters['liftDirection']): string {
  if (dir === 'lowering') return 'menurunkan';
  if (dir === 'lifting') return 'mengangkat';
  return 'memindahkan';
}

function zeroRwlReason(pt: NioshPointMeasurement, D: number, freq: number): string {
  const reasons: string[] = [];
  if (pt.H > 63) reasons.push(`jarak horizontal H = ${fmt(pt.H)} cm melebihi batas maksimum NIOSH 63 cm (HM = 0)`);
  if (pt.V > 175) reasons.push(`ketinggian tangan V = ${fmt(pt.V)} cm melebihi batas maksimum 175 cm (VM = 0)`);
  if (D > 175) reasons.push(`jarak tempuh vertikal D = ${fmt(D)} cm melebihi batas maksimum 175 cm (DM = 0)`);
  if (Math.abs(pt.A) > 135) reasons.push(`sudut asimetri A = ${fmt(pt.A)}° melebihi batas maksimum 135° (AM = 0)`);
  if (freq > 15) reasons.push(`frekuensi angkat F = ${fmt(freq)} kali/menit melebihi 15 kali/menit (FM = 0)`);
  return reasons.length > 0 ? reasons.join(' dan ') : 'salah satu faktor pengali NIOSH bernilai nol';
}

export function buildErgonomicSummary(input: ErgonomicSummaryInput): ErgonomicSummaryReport {
  const {
    profile,
    params,
    originPoint,
    destinationPoint,
    niosh,
    originCapture,
    destinationCapture,
    timelineSamples,
  } = input;

  const zones = getErgonomicZones(profile);
  const originLabel = formatPlacementLabel(params.originSurface, params.originSurfaceCustom, params.originHeightCm);
  const destLabel = formatPlacementLabel(
    params.destinationSurface,
    params.destinationSurfaceCustom,
    params.destinationHeightCm
  );
  const actionVerb = directionVerb(params.liftDirection);

  const conclusions: string[] = [];

  // 1. Task & Input Context Conclusion
  conclusions.push(
    `Subjek ${profile.name} (tinggi badan tegak B2 = ${fmt(zones.statureCm)} cm) ${actionVerb} beban ${fmt(
      params.loadWeightKg
    )} kg (ukuran ${params.objectLengthCm} × ${params.objectWidthCm} × ${
      params.objectHeightCm
    } cm) dari ${originLabel} menuju ${destLabel} dengan jarak vertikal D = ${fmt(niosh.D)} cm, frekuensi ${fmt(
      params.frequencyPerMin,
      2
    )} kali/menit, dan kualitas pegangan ${params.coupling}.`
  );

  // 2. NIOSH RWL & LI Conclusion (compares Origin & Destination specifically, never prints raw "Infinity")
  const govSideLabel = niosh.governingSide === 'destination' ? `DESTINATION (${destLabel})` : `ORIGIN (${originLabel})`;
  const govPt = niosh.governingSide === 'destination' ? destinationPoint : originPoint;
  const govRes = niosh.governingSide === 'destination' ? niosh.destination : niosh.origin;

  if (!Number.isFinite(niosh.governingLI) || govRes.RWL <= 0) {
    const reason = zeroRwlReason(govPt, niosh.D, params.frequencyPerMin);
    const otherLabel = niosh.governingSide === 'destination' ? 'Origin' : 'Destination';
    const otherRes = niosh.governingSide === 'destination' ? niosh.origin : niosh.destination;
    const otherText = Number.isFinite(otherRes.LI)
      ? `Sementara pada posisi ${otherLabel}, RWL = ${fmt(otherRes.RWL, 2)} kg (LI = ${fmt(otherRes.LI, 2)}).`
      : `Posisi ${otherLabel} juga menghasilkan RWL = 0 kg.`;
    conclusions.push(
      `Evaluasi NIOSH: Risiko sangat kritis pada posisi ${govSideLabel} karena RWL = 0,00 kg (batas beban aman tidak terpenuhi) akibat ${reason}. ${otherText}`
    );
  } else {
    const statusText = niosh.isSafe
      ? 'AMAN (LI ≤ 1,00)'
      : niosh.governingLI > 3
        ? 'RISIKO SANGAT TINGGI (LI > 3,00)'
        : 'BERISIKO CEDERA PUNGGUNG (LI > 1,00)';
    conclusions.push(
      `Evaluasi NIOSH: Posisi Origin menghasilkan RWL = ${fmt(niosh.origin.RWL, 2)} kg (LI = ${fmt(
        niosh.origin.LI,
        2
      )}) dan Destination menghasilkan RWL = ${fmt(niosh.destination.RWL, 2)} kg (LI = ${fmt(
        niosh.destination.LI,
        2
      )}). Nilai penentu berada di ${govSideLabel} dengan LI = ${fmt(
        niosh.governingLI,
        2
      )} — kategori ${statusText}, dengan faktor pembatas terbesar pada ${govRes.limitingFactor}.`
    );
  }

  // 3. Video Posture Conclusion (REBA & RULA from actual captured frames & Auto-Scan)
  if (originCapture || destinationCapture) {
    const parts: string[] = [];
    if (originCapture) {
      parts.push(
        `Origin (t=${originCapture.timestampSec.toFixed(2)}s): REBA ${originCapture.reba.finalScore}/15 (${
          originCapture.reba.riskLevelId
        }) & RULA ${originCapture.rula.finalScore}/7 dengan sudut Trunk ${originCapture.angles.trunkFlexionDeg}° dan Knee ${
          originCapture.angles.maxKneeFlexionDeg
        }°`
      );
    }
    if (destinationCapture) {
      const side = destinationCapture.reba.side;
      const ua =
        side === 'left'
          ? destinationCapture.angles.leftUpperArmFlexionDeg
          : destinationCapture.angles.rightUpperArmFlexionDeg;
      parts.push(
        `Destination (t=${destinationCapture.timestampSec.toFixed(2)}s): REBA ${destinationCapture.reba.finalScore}/15 (${
          destinationCapture.reba.riskLevelId
        }) & RULA ${destinationCapture.rula.finalScore}/7 dengan Trunk ${
          destinationCapture.angles.trunkFlexionDeg
        }° dan Upper Arm ${ua}°`
      );
    }
    let peakNote = '';
    if (timelineSamples.length >= 2) {
      const peak = timelineSamples.reduce((m, s) => (s.rebaScore > m.rebaScore ? s : m), timelineSamples[0]);
      peakNote = ` Sepanjang rekaman video (${timelineSamples.length} frame), beban postur puncak mencapai REBA ${peak.rebaScore}/15 pada detik ${peak.timeSec}s (Trunk ${peak.trunkFlexionDeg}°).`;
    }
    conclusions.push(`Evaluasi Postur Video (REBA & RULA): ${parts.join('; ')}.${peakNote}`);
  } else {
    conclusions.push(
      `Evaluasi Postur Video (REBA & RULA): Belum ada frame video yang di-capture. Capture posisi Origin & Destination (atau jalankan Auto-Scan) agar sudut sendi aktual dan skor REBA/RULA ikut terangkum.`
    );
  }

  // 4. Personal Anthropometry Fit Conclusion
  const describeVZone = (vCm: number) => {
    if (vCm < zones.kneeCm) return `di bawah tinggi lutut (D7 = ${fmt(zones.kneeCm)} cm — zona Poor)`;
    if (vCm < zones.knuckleCm) return `antara lutut–tangan (zona Fair)`;
    if (vCm <= zones.elbowCm) return `dalam zona ideal tangan–siku (B14–B13 = ${fmt(zones.knuckleCm)}–${fmt(zones.elbowCm)} cm — Preferred)`;
    if (vCm <= zones.shoulderCm) return `antara siku–bahu (zona Fair)`;
    return `di atas tinggi bahu (B10 = ${fmt(zones.shoulderCm)} cm — zona Poor)`;
  };
  conclusions.push(
    `Kesesuaian Antropometri ${profile.name}: Zona kerja optimal ${profile.name} berada pada ketinggian ${fmt(
      zones.knuckleCm
    )}–${fmt(zones.elbowCm)} cm (B14–B13). Saat ini Origin (V = ${fmt(originPoint.V)} cm) berada ${describeVZone(
      originPoint.V
    )}, sedangkan Destination (V = ${fmt(destinationPoint.V)} cm) berada ${describeVZone(destinationPoint.V)}.`
  );

  // === DYNAMIC PRIORITIZED RECOMMENDATIONS ===
  const recs: PrioritizedRecommendation[] = [];

  // A. Horizontal Reach H (check worst side between origin & destination)
  const worstHSide = destinationPoint.H >= originPoint.H ? 'destination' : 'origin';
  const worstH = worstHSide === 'destination' ? destinationPoint.H : originPoint.H;
  const worstHLabel = worstHSide === 'destination' ? `Destination (${destLabel})` : `Origin (${originLabel})`;

  if (worstH > 63) {
    const reduceNeeded = fmt(worstH - 35);
    recs.push({
      priority: 'Kritis',
      title: `Perpendek Jarak Horizontal H pada ${worstHLabel} (Melewati Batas 63 cm)`,
      detail: `Pada ${worstHLabel}, jarak horizontal mencapai H = ${fmt(
        worstH
      )} cm sehingga HM bernilai 0 dan RWL jatuh ke 0 kg. Dekatkan tubuh ke beban minimal sekitar ${reduceNeeded} cm dengan menyediakan ruang kaki di bawah ${
        worstHSide === 'destination' ? destLabel : originLabel
      } dan melangkah maju sebelum mengangkat/meletakkan agar H ≤ 35 cm (ideal 25 cm).`,
      reference: 'Slide 11, 14 & 22',
      weight: 100,
    });
  } else if (worstH > 30) {
    const worstHM = worstHSide === 'destination' ? niosh.destination.HM : niosh.origin.HM;
    recs.push({
      priority: worstH > 45 ? 'Tinggi' : 'Sedang',
      title: `Dekatkan Beban ke Tubuh pada ${worstHLabel} (H = ${fmt(worstH)} cm)`,
      detail: `Jarak horizontal H = ${fmt(worstH)} cm menurunkan HM menjadi ${fmt(
        worstHM,
        2
      )}. Pastikan tidak ada halangan di depan kaki saat berhadapan dengan ${
        worstHSide === 'destination' ? destLabel : originLabel
      } dan pegang benda sedekat mungkin ke pusat tubuh (target H ≈ 25 cm).`,
      reference: 'Slide 11 & 14',
      weight: worstH > 45 ? 82 : 58,
    });
  }

  // B. Severe Trunk Flexion / REBA Risk from Video
  const captures = [
    originCapture ? { label: `Origin (${originLabel})`, cap: originCapture } : null,
    destinationCapture ? { label: `Destination (${destLabel})`, cap: destinationCapture } : null,
  ].filter(Boolean) as Array<{ label: string; cap: CapturedMoment }>;

  const worstTrunkCap =
    captures.length > 0
      ? captures.reduce((m, c) => (c.cap.angles.trunkFlexionDeg > m.cap.angles.trunkFlexionDeg ? c : m), captures[0])
      : null;

  if (worstTrunkCap && (worstTrunkCap.cap.angles.trunkFlexionDeg > 35 || worstTrunkCap.cap.reba.finalScore >= 8)) {
    const a = worstTrunkCap.cap.angles;
    const isCritical = worstTrunkCap.cap.reba.finalScore >= 11 || a.trunkFlexionDeg > 60;
    recs.push({
      priority: isCritical ? 'Kritis' : 'Tinggi',
      title: `Kurangi Sudut Membungkuk Punggung pada ${worstTrunkCap.label} (Trunk ${a.trunkFlexionDeg}°, REBA ${worstTrunkCap.cap.reba.finalScore})`,
      detail: `Pada detik ${worstTrunkCap.cap.timestampSec.toFixed(2)}s, punggung ${profile.name} membungkuk hingga ${
        a.trunkFlexionDeg
      }° dengan skor REBA ${worstTrunkCap.cap.reba.finalScore}/15 (${
        worstTrunkCap.cap.reba.riskLevelId
      }). Gunakan teknik angkat dengan menekuk lutut (squat lift) sambil menjaga punggung lebih tegak, serta tambahkan alas peninggi pada ${
        worstTrunkCap.cap.kind === 'origin' ? originLabel : destLabel
      } minimal setinggi lutut ${profile.name} (D7 = ${fmt(zones.kneeCm)} cm).`,
      reference: 'Slide 3–6 & REBA',
      weight: isCritical ? 95 : 84,
    });
  }

  // C. Vertical Height V vs Personal Anthropometry Zones (D7, B14, B13, B10)
  const lowV = originPoint.V <= destinationPoint.V ? { side: 'origin', v: originPoint.V, label: originLabel } : { side: 'destination', v: destinationPoint.V, label: destLabel };
  const highV = originPoint.V >= destinationPoint.V ? { side: 'origin', v: originPoint.V, label: originLabel } : { side: 'destination', v: destinationPoint.V, label: destLabel };

  if (lowV.v < zones.kneeCm) {
    recs.push({
      priority: lowV.v < 25 ? 'Tinggi' : 'Sedang',
      title: `Naikkan Ketinggian Alas ${lowV.label} (V = ${fmt(lowV.v)} cm < Lutut ${fmt(zones.kneeCm)} cm)`,
      detail: `Ketinggian tangan di ${lowV.label} (${fmt(lowV.v)} cm) masih di bawah tinggi lutut ${
        profile.name
      } (D7 = ${fmt(zones.kneeCm)} cm). Letakkan palet, meja bantu, atau alas penyangga agar ketinggian ambil/taruh naik mendekati rentang ideal ${
        profile.name
      } yaitu ${fmt(zones.knuckleCm)}–${fmt(zones.elbowCm)} cm (tinggi tangan B14 hingga siku B13).`,
      reference: 'Slide 11 & 14',
      weight: lowV.v < 25 ? 80 : 62,
    });
  }
  if (highV.v > zones.shoulderCm) {
    recs.push({
      priority: 'Tinggi',
      title: `Turunkan Ketinggian Penempatan di ${highV.label} (V = ${fmt(highV.v)} cm > Bahu ${fmt(zones.shoulderCm)} cm)`,
      detail: `Ketinggian tangan di ${highV.label} (${fmt(highV.v)} cm) melampaui tinggi bahu ${
        profile.name
      } (B10 = ${fmt(zones.shoulderCm)} cm). Pindahkan area penempatan barang ke tingkat yang lebih rendah (maksimal setinggi siku–bahu: ${fmt(
        zones.elbowCm
      )}–${fmt(zones.shoulderCm)} cm) untuk mengurangi beban bahu dan punggung.`,
      reference: 'Slide 8 & 14',
      weight: 81,
    });
  }

  // D. Asymmetry / Trunk Twist A
  const worstASide = Math.abs(destinationPoint.A) >= Math.abs(originPoint.A) ? 'destination' : 'origin';
  const worstA = worstASide === 'destination' ? Math.abs(destinationPoint.A) : Math.abs(originPoint.A);
  const worstAM = worstASide === 'destination' ? niosh.destination.AM : niosh.origin.AM;
  if (worstA >= 20) {
    recs.push({
      priority: worstA >= 45 ? 'Tinggi' : 'Sedang',
      title: `Hilangkan Gerakan Memutar Pinggang pada ${worstASide === 'destination' ? destLabel : originLabel} (A = ${fmt(worstA)}°)`,
      detail: `Terdeteksi sudut asimetri A = ${fmt(worstA)}° (AM = ${fmt(
        worstAM,
        2
      )}). Atur posisi ${originLabel} dan ${destLabel} lebih sejajar atau beri ruang lantai agar ${
        profile.name
      } memindahkan arah kedua kaki saat berputar, bukan memelintir tulang belakang.`,
      reference: 'Slide 8 & 24–25',
      weight: worstA >= 45 ? 78 : 55,
    });
  }

  // E. Upper Limb / RULA Posture Risk from Video
  const worstRulaCap =
    captures.length > 0
      ? captures.reduce((m, c) => (c.cap.rula.finalScore > m.cap.rula.finalScore ? c : m), captures[0])
      : null;
  if (worstRulaCap && worstRulaCap.cap.rula.finalScore >= 5) {
    const side = worstRulaCap.cap.rula.side;
    const ua =
      side === 'left'
        ? worstRulaCap.cap.angles.leftUpperArmFlexionDeg
        : worstRulaCap.cap.angles.rightUpperArmFlexionDeg;
    const la =
      side === 'left'
        ? worstRulaCap.cap.angles.leftLowerArmFlexionDeg
        : worstRulaCap.cap.angles.rightLowerArmFlexionDeg;
    recs.push({
      priority: worstRulaCap.cap.rula.finalScore >= 7 ? 'Tinggi' : 'Sedang',
      title: `Perbaiki Postur Lengan & Bahu pada ${worstRulaCap.label} (RULA ${worstRulaCap.cap.rula.finalScore}/7)`,
      detail: `Pada detik ${worstRulaCap.cap.timestampSec.toFixed(
        2
      )}s, sudut lengan atas mencapai ${ua}° dan lengan bawah ${la}° sehingga RULA bernilai ${
        worstRulaCap.cap.rula.finalScore
      }/7 (${worstRulaCap.cap.rula.riskLevelId}). Hindari menjulurkan lengan jauh ke depan (>45°); jaga siku dekat dengan badan pada rentang tekukan ideal 60°–100°.`,
      reference: 'RULA & Slide 9',
      weight: worstRulaCap.cap.rula.finalScore >= 7 ? 76 : 52,
    });
  }

  // F. Coupling & Object Dimensions (only if not good)
  if (params.coupling !== 'good') {
    const dimNote =
      params.objectLengthCm > 40 || params.objectHeightCm > 30
        ? ` Selain itu, dimensi benda (${params.objectLengthCm} × ${params.objectWidthCm} × ${params.objectHeightCm} cm) melebihi batas wadah optimal NIOSH (panjang frontal ≤ 40 cm, tinggi ≤ 30 cm).`
        : '';
    recs.push({
      priority: params.coupling === 'poor' ? 'Sedang' : 'Pemeliharaan',
      title: `Tingkatkan Kualitas Pegangan Benda (Saat Ini: ${params.coupling.toUpperCase()}, CM = ${fmt(govRes.CM, 2)})`,
      detail: `Pegangan kategori ${params.coupling} menurunkan batas berat aman. Tambahkan tali/handle ergonomis, lubang pegangan (cut-out tinggi ≥ 3,8 cm & panjang ≥ 11,5 cm), atau gunakan keranjang bantu berpegangan kaku saat memindahkan beban ${fmt(
        params.loadWeightKg
      )} kg.${dimNote}`,
      reference: 'Slide 13 & 28–30',
      weight: params.coupling === 'poor' ? 50 : 30,
    });
  }

  // G. Vertical Travel Distance D
  if (niosh.D > 65) {
    recs.push({
      priority: 'Sedang',
      title: `Perkecil Jarak Perpindahan Vertikal (D = ${fmt(niosh.D)} cm, DM = ${fmt(govRes.DM, 2)})`,
      detail: `Perbedaan ketinggian antara ${originLabel} dan ${destLabel} cukup besar (${fmt(
        niosh.D
      )} cm). Samakan atau dekatkan ketinggian kedua permukaan agar mendekati tinggi kerja optimal ${fmt(
        zones.knuckleCm
      )}–${fmt(zones.elbowCm)} cm.`,
      reference: 'Slide 14 & 24',
      weight: 46,
    });
  }

  // H. Heavy Load or High Frequency / Long Duration
  if ((Number.isFinite(niosh.governingLI) && niosh.governingLI > 1) || params.frequencyPerMin >= 4) {
    const loadExceeds = Number.isFinite(govRes.RWL) && govRes.RWL > 0 && params.loadWeightKg > govRes.RWL;
    recs.push({
      priority: niosh.governingLI > 2 ? 'Tinggi' : 'Sedang',
      title: loadExceeds
        ? `Beban (${fmt(params.loadWeightKg)} kg) Melebihi RWL (${fmt(govRes.RWL, 2)} kg) — Pertimbangkan Alat Bantu`
        : `Atur Frekuensi & Siklus Kerja–Istirahat (F = ${fmt(params.frequencyPerMin, 2)}/menit)`,
      detail: loadExceeds
        ? `Berat aktual ${fmt(params.loadWeightKg)} kg melampaui batas aman RWL ${fmt(
            govRes.RWL,
            2
          )} kg. Jika tata letak ${originLabel} → ${destLabel} sulit diubah, bagi berat kemasan, kerjakan oleh 2 orang, atau gunakan troli/lift table untuk meminimalkan beban angkat manual.`
        : `Frekuensi ${fmt(
            params.frequencyPerMin,
            2
          )} angkat/menit meningkatkan kelelahan otot. Terapkan rotasi kerja atau sisipkan jeda kerja ringan (work–rest cycle) agar rasio pemulihan tetap aman.`,
      reference: 'Slide 12, 15 & 34–35',
      weight: loadExceeds ? 74 : 48,
    });
  }

  // I. Slide 32 / Video Recording Warnings (if detected in captured frames)
  const feetMissingCap = captures.find((c) => !c.cap.angles.feetVisible);
  if (feetMissingCap) {
    recs.push({
      priority: 'Tinggi',
      title: `Perbaiki Framing Kamera pada ${feetMissingCap.label} (Kaki Terpotong)`,
      detail: `Pada detik ${feetMissingCap.cap.timestampSec.toFixed(
        2
      )}s, mata kaki tidak terlihat penuh di kamera. Mundurkan kamera agar kedua telapak kaki tampak utuh sesuai syarat dosen untuk keabsahan pengukuran H dan A.`,
      reference: 'Syarat Dosen & Slide 23',
      weight: 72,
    });
  }

  // Sort by impact weight descending and keep top 5 sharpest recommendations
  recs.sort((a, b) => b.weight - a.weight);
  const topRecs = recs.slice(0, 5);

  if (topRecs.length === 0) {
    topRecs.push({
      priority: 'Pemeliharaan',
      title: 'Aktivitas Pengangkatan Sudah Berada pada Kategori Aman',
      detail: `Pengangkatan ${fmt(params.loadWeightKg)} kg dari ${originLabel} ke ${destLabel} oleh ${
        profile.name
      } memenuhi batas aman NIOSH (LI = ${fmt(
        niosh.governingLI,
        2
      )} ≤ 1,00) serta postur dalam batas wajar. Pertahankan posisi berdiri stabil dengan dua tangan dan hindari memutar pinggang.`,
      reference: 'Slide 33',
      weight: 10,
    });
  }

  return {
    conclusions,
    recommendations: topRecs,
  };
}
