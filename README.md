# LAPORAN CERMAT v2.1

Aplikasi web untuk menyusun **laporan 22 pendampingan Program CERMAT** (Cerdas Numerasi dan Matematika Terapan), dipakai bersama oleh semua fasilitator.

- **Data bersama di Google Drive** akun admin, dengan Google Apps Script sebagai server. Gratis.
- **Akun masing-masing dengan peran:** Admin, Fasilitator, dan Pemantau (hanya melihat dan mengunduh).
- **Data sekolah diisi fasilitator.** Setiap sekolah dipegang 2 fasil dengan hak setara; datanya berisi nama sekolah, nama & NIP kepala sekolah, dan data guru.
- **Jurnal kegiatan ditandatangani** kepala sekolah dan fasilitator yang hadir.
- **Isi laporan otomatis** dari *Silabus Pendampingan CERMAT (revisi 15-11-2026)*.
- **Nilai pretes/postes** diimpor dari Google Form; hanya baris sekolah yang dilaporkan yang diambil.
- **PDF** disusun di browser, lalu diarsipkan otomatis ke folder sekolah di Drive.
- **Tetap bisa dipakai saat sinyal hilang.** Perubahan dan foto masuk antrean, lalu terkirim otomatis saat online.

**Cara pasang:** lihat **[PANDUAN-DEPLOY.md](PANDUAN-DEPLOY.md)**.

## Menu

1. **Data Sekolah:** sekolah binaan, Fasilitator 1 & 2, kepala sekolah + NIP, dan data guru.
2. **Buat Laporan:** pilih sekolah, lalu pendampingan 1–22, lalu isi langkah Pelaksanaan (termasuk fasil yang hadir) → Kehadiran & Nilai → Kegiatan & Capaian → Evaluasi → Lampiran, kemudian Periksa & Unduh.
3. **Unduh Laporan:** matriks status semua sekolah, PDF per laporan, ZIP per pendampingan, dan ZIP per sekolah.

Melalui lingkaran nama di kanan atas: **Profil Saya** (NIP, ganti password), **Keluar**, serta khusus admin **Kelola Pengguna** dan **Pengaturan Program** (kop/logo, identitas program).

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
vendor/             pdf-lib 1.17.1 & JSZip 3.10.1 (MIT)
apps-script/Code.gs server (ditempel di Google Apps Script)
```

**Catatan silabus:** judul Pendampingan 13 di halaman isi silabus tertulis "CPA", sedangkan di daftar isinya "CVA". Aplikasi memakai "CPA". Ubah di `js/silabus.js` bila yang benar CVA.
