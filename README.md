# ErgoVision AI — Live Ergonomics Analysis (REBA, RULA & NIOSH 1991)

Aplikasi web analisis ergonomi berbasis **Live AI Pose Estimation** (`@mediapipe/tasks-vision`) yang mengintegrasikan **kalibrasi antropometri 15 mahasiswa** untuk mengukur dan menganalisis video pengangkatan manual secara otomatis.

## Fitur Utama
- **Database Antropometri 15 Mahasiswa (22 Dimensi):** Pilih nama subjek (`Evan`, `Keileen`, `Raden`, `Jose`, `Joseph`, `Arya`, `Derrick`, `Hansen`, `Justin`, `Callista`, `Kelly`, `Dev`, `Anugrah`, `Angel`, `Hillary`), tambah nama baru, atau import CSV. Aplikasi otomatis memakai segmen tulang kaku subjek (`B10`, `B13`, `B14`, `D7`, `D13`, `D21`, `T5`) untuk kalibrasi skala `cm/pixel` dan menampilkan zona angkat ergonomis personal.
- **Upload Video & Live Kamera:** Analisis langsung dari webcam/HP atau upload video `.mp4`/`.mov`/`.webm` dengan kontrol *frame-by-frame* (`-1f / +1f`, *slow-motion* `0.25x / 0.5x`) dan **Auto-Scan Semua Gerakan** (menghasilkan grafik pergerakan waktu REBA, RULA, dan tinggi tangan `V`).
- **Overlay Pengukuran Lengkap:** Menggambar skeleton 33 titik sendi, garis ukur vertikal `V (cm)`, jarak horizontal `H (cm)` dari titik tengah mata kaki, sudut asimetri `A (°)`, busur sudut REBA/RULA (*Trunk, Neck, Knee, Upper Arm, Lower Arm, Wrist*), indikator **Kaki Terlihat**, serta pin yang dapat digeser saat *pause* dan kalibrasi 2-titik.
- **Perhitungan Otomatis REBA, RULA & 1991 Revised NIOSH Lifting Equation:**
  - REBA (Hignett & McAtamney, 2000) — Table A, B, C, Load, Coupling, Activity, Action Level 0–4.
  - RULA (McAtamney & Corlett, 1993) — Table A, B, C, Muscle, Force/Load, Action Level 1–4.
  - NIOSH 1991 (`RWL = LC × HM × VM × DM × AM × FM × CM`, `LI = L / RWL`) terverifikasi terhadap contoh **Slide 41** materi *Design of Manual Handling Task*.
- **Export Langsung ke `.docx` (`JOB ANALYSIS WORKSHEET`):** Menghasilkan file Microsoft Word berisi **STEP 1, STEP 2, STEP 3**, tabel rincian REBA & RULA, tabel antropometri kalibrasi, rekomendasi perancangan ulang, serta **foto bukti pengukuran beranotasi** yang tertanam langsung di dokumen, ditambah export kolase foto bukti `.png`.

## Menjalankan Secara Lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:5173` di browser (Chrome/Edge).

## Pengujian & Build Produksi

```bash
npm test
npm run build
```

## Deploy ke Vercel

Proyek ini sudah dikonfigurasi dengan `vercel.json` (Vite static SPA):

1. Buka [vercel.com/new](https://vercel.com/new) dan login dengan akun GitHub Anda.
2. Pilih repositori **`Oceppppp/ergo-vision-ai`** lalu klik **Import**.
3. Biarkan pengaturan default (**Framework Preset: Vite**, **Build Command: `npm run build`**, **Output Directory: `dist`**) lalu klik **Deploy**.
4. Karena seluruh AI Pose (`@mediapipe/tasks-vision`) dan export `.docx` berjalan di browser (*client-side*), tidak perlu *environment variable* maupun server backend tambahan.

## Push Update ke GitHub

```bash
git add -A
git commit -m "update"
git push
```
