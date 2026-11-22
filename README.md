# LAPORAN CERMAT v3.11.1

Aplikasi web untuk menyusun **laporan 22 pendampingan Program CERMAT** (Cerdas Numerasi dan Matematika Terapan), dipakai bersama oleh semua fasilitator.

- **Data bersama di Google Drive** akun admin, dengan Google Apps Script sebagai server. Gratis.
- **Akun masing-masing dengan peran:** Admin, Fasilitator, Kepala Sekolah, Guru (satu akun bersama per sekolah, hanya untuk portal CERMAT), dan Pemantau (hanya melihat dan mengunduh).
- **Login bersama dengan portal Pustaka CERMAT.** Login sekali di portal berlaku juga di LAPORAN CERMAT (situs yang sama).
- **Pengesahan elektronik (QR).** Fasilitator 1 & 2 mengesahkan dari akun masing-masing, lalu Kepala Sekolah. Kode QR tercetak di *Lembar Pengesahan* (setelah sampul) dan *Jurnal Kegiatan*; pindai untuk membuka halaman verifikasi. Laporan yang sudah disahkan terkunci; membuka kuncinya membatalkan semua pengesahan.
- **Pratinjau langsung untuk kepala sekolah.** Membuka laporan menampilkan kotak pengesahan dan halaman-halaman PDF di dalam aplikasi (juga di HP dan aplikasi yang diinstal), bisa diperbesar.
- **Bisa diinstal (PWA).** Android/Chrome: menu ⋮ → *Instal aplikasi*. iPhone/Safari: *Bagikan → Tambahkan ke Layar Utama*. Laptop/Chrome: ikon instal di kolom alamat.
- **Data sekolah dibagi.** Admin mendaftarkan sekolah dan memasangkan Fasilitator 1 & 2; fasilitator melengkapi nama & NIP kepala sekolah serta data guru.
- **Nilai & refleksi otomatis.** Jawaban pretes, postes, dan refleksi di Google Form masuk sendiri ke laporan setiap sekolah (atau langsung lewat tombol *Perbarui data*); setiap jenis hanya dihitung sekali (kiriman pertama).
- **Reward bintang.** Fasilitator mengisi bintang setiap peserta yang hadir di langkah *Reward*; totalnya terakumulasi dari P1–P22 dan tercetak di PDF. Kosong dihitung 0.
- **Progres Pendampingan.** Semua akun melihat nilai pretes & postes per peserta, capaian indikator, dan bintang setiap pendampingan, plus rekap peringkat bintang, di kartu *Progres Pendampingan* pada portal (menu *Progres* di aplikasi ini).
- **Jurnal kegiatan ditandatangani** kepala sekolah dan fasilitator yang hadir.
- **Isi laporan otomatis** dari *Silabus Pendampingan CERMAT (revisi 15-11-2026)*.
- **Nilai pretes/postes** diimpor dari Google Form; hanya baris sekolah yang dilaporkan yang diambil.
- **PDF** disusun di browser, lalu diarsipkan otomatis ke folder sekolah di Drive.
- **Tetap bisa dipakai saat sinyal hilang.** Perubahan dan foto masuk antrean, lalu terkirim otomatis saat online.

**Cara pasang:** lihat **[PANDUAN-DEPLOY.md](PANDUAN-DEPLOY.md)**.

## Menu

| Admin | Fasilitator | Kepala Sekolah | Pemantau |
|---|---|---|---|
| Kelola Pengguna | Data Sekolah | Pengesahan | Data Sekolah |
| Data Sekolah | Buat Laporan | Laporan Sekolah (hanya baca) | Lihat Laporan |
| Lihat Laporan (pemantauan, hanya baca) | Unduh Laporan | Unduh Laporan | Unduh Laporan |
| Unduh Laporan | Total Reward (sekolah binaan) | Total Reward (sekolahnya) | Total Reward |
| Total Reward | | | |

Langkah form laporan:
1. Pelaksanaan (fasil hadir, tanggal DD/MM/YYYY, jam, tempat)
2. Pretes & Kehadiran
3. Postes & Capaian (P17–19: Observasi & Capaian)
4. Evaluasi
5. Reward (bintang untuk peserta yang hadir; hanya fasilitator pemegang sekolah yang bisa mengisi)
6. Lampiran
7. Periksa & Unduh (daftar periksa, pengesahan, unduh PDF)

Langkah pelaksanaan kegiatan selalu persis sesuai silabus.

Lingkaran nama di kanan atas berisi Profil Saya, Ganti Password, dan Keluar, serta khusus admin **Pengaturan Program** (kop/logo dan identitas program).

## Format Google Form pretes/postes (Pendampingan 1–7)

Sarannya satu form per pendampingan, mode **Kuis**, dengan pertanyaan: **Nama Lengkap**, **Asal Sekolah** (*drop-down*), **Jabatan/Kelas**, dan **Jenis Tes** (Pre-tes / Post-tes). Unduh responsnya dari Google Sheets sebagai `.csv` atau `.xlsx`, lalu impor di langkah *Kehadiran & Nilai*. File `contoh/contoh-respons-google-form.csv` berisi **data tiruan** untuk mencoba fitur ini.

Aturan perhitungan nilai:
- Rata-rata pretes dan postes masing-masing dihitung dari semua yang mengerjakan tes itu.
- Kenaikan ditulis dalam poin dan persen.
- Jika seseorang mengirim lebih dari sekali, yang dipakai kiriman terakhir.

## Struktur file

```
index.html, css/, icons/ (logo CERMAT), manifest.webmanifest, sw.js   tampilan
js/config.js        ← URL server Apps Script (wajib diisi)
js/silabus.js       data 22 pendampingan
js/api.js           komunikasi dengan server
js/db.js            cache lokal & antrean offline
js/importer.js      baca respons Google Form
js/report.js        kalimat otomatis, nilai, daftar periksa
js/pdf.js           penyusun PDF A4
js/app.js           antarmuka
vendor/             pdf-lib 1.17.1, JSZip 3.10.1 & qrcode-generator 1.4.4 (MIT); pdfjs/ = PDF.js 4.10.38 (Apache 2.0)
verifikasi.html     halaman verifikasi kode QR pengesahan
fonts/              Plus Jakarta Sans & Cormorant Garamond (SIL OFL 1.1), dipasang lokal agar bisa offline
apps-script/Code.gs server (ditempel di Google Apps Script)
```

**Catatan silabus:** judul Pendampingan 13 di halaman isi silabus tertulis "CPA", sedangkan di daftar isinya "CVA". Aplikasi memakai "CPA". Ubah di `js/silabus.js` bila yang benar CVA.
