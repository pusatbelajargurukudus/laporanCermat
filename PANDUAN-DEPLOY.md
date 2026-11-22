# Panduan Pemasangan LAPORAN CERMAT v3.12

Aplikasi terdiri dari dua bagian:

| Bagian | Tempat | Isi |
|---|---|---|
| **Server + semua data** | Google Apps Script + Google Drive **akun admin** | `apps-script/Code.gs` |
| **Tampilan aplikasi** | GitHub Pages | semua file lain di folder ini |

Pemasangan cukup **sekali**, sekitar 15 menit.

---

## A. Pasang server di Google Apps Script

> Gunakan akun Google yang akan menjadi **pemilik semua data**. Folder `LAPORAN CERMAT` akan dibuat di Google Drive akun ini.

1. Buka **https://script.google.com** → **New project** (Proyek baru).
2. Klik judul "Untitled project" dan ganti menjadi **LAPORAN CERMAT Server**.
3. Hapus seluruh isi `Code.gs` bawaan. Salin **seluruh isi** file `apps-script/Code.gs` dari paket ini, lalu tempel. Tekan **Ctrl+S**.
4. Klik ikon **⚙ Project Settings** (Setelan proyek) di kiri:
   - **Time zone:** pilih `(GMT+07:00) Jakarta`.
   - Gulir ke **Script Properties** → **Add script property**, lalu isi dua baris:

     | Property | Value |
     |---|---|
     | `ADMIN_USERNAME` | username admin, mis. `Cermat` |
     | `ADMIN_PASSWORD` | password admin |

   - Klik **Save script properties**.
5. Kembali ke **⟨⟩ Editor**. Di bilah atas, pilih fungsi **`setup`**, lalu klik **▶ Run**.
   - Saat muncul *Authorization required*, klik **Review permissions** dan pilih akun admin.
   - Muncul peringatan *Google hasn't verified this app*. Ini wajar karena skripnya milik Anda sendiri. Klik **Advanced** → **Go to LAPORAN CERMAT Server (unsafe)** → **Allow**.
   - Tunggu sampai *Execution log* menampilkan `Siap. Folder: … | Database: …`.
   - Folder **LAPORAN CERMAT** dan spreadsheet **Database CERMAT** sekarang ada di Google Drive. Script Property `ADMIN_PASSWORD` **otomatis terhapus**, dan yang tersimpan hanya hash-nya.
6. Klik **Deploy** → **New deployment**:
   - Klik ⚙ di samping *Select type* → **Web app**.
   - **Description:** `v2.3`
   - **Execute as:** **Me** (akun admin)
   - **Who has access:** **Anyone** (*bukan* "Anyone with Google account")
   - Klik **Deploy**, lalu salin **Web app URL** (berakhiran `/exec`).
7. Uji: buka URL tadi di browser. Harus muncul tulisan seperti
   `{"ok":true,"app":"LAPORAN CERMAT","version":"2.0.0","siap":true}`.

> **Kenapa "Anyone"?** Supaya aplikasi di GitHub Pages bisa menghubungi server. Data tetap aman: setiap permintaan wajib membawa tanda login yang sah. Tanpa username dan password yang benar, server menolak semua permintaan.

---

## B. Pasang tampilan di GitHub Pages

1. Buka file **`js/config.js`**, lalu ganti `TEMPEL_URL_WEB_APP_DI_SINI` dengan Web app URL dari langkah A.6:
   ```js
   window.CERMAT_CONFIG = {
     API_URL: 'https://script.google.com/macros/s/AKfycb..../exec'
   };
   ```
   > URL **wajib diapit petik satu** `'…'`. Tanpa petik, file tidak terbaca dan aplikasi menampilkan pesan "Belum terhubung ke server".
2. Buat repository baru di GitHub, mis. `laporan-cermat`.
3. Unggah semua file dan folder dari paket ini, termasuk `.nojekyll`. Folder `apps-script/` boleh ikut diunggah karena tidak berisi password.
4. **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, Branch **main / (root)** → **Save**.
5. Tunggu 1–2 menit, lalu buka `https://NAMA-AKUN.github.io/laporan-cermat/`.

---

## C. Penggunaan pertama

**Admin** (menu: Kelola Pengguna · Data Sekolah · Lihat Laporan · Unduh Laporan):
1. **Lingkaran nama → Profil Saya → Ganti password.** Sangat disarankan.
2. **Kelola Pengguna → Tambah pengguna:** buat akun setiap fasilitator (username, nama lengkap bergelar, NIP opsional, peran, password awal), lalu sampaikan username dan password awal ke masing-masing.
   - Tombol **Edit** di setiap baris dipakai untuk mengubah username, nama, NIP, peran, status aktif, reset password, atau **hapus pengguna**.
   - **Ganti username** otomatis memperbarui sekolah binaan, laporan, dan sesi login orang itu. Ia tidak perlu login ulang, tetapi berikutnya harus masuk dengan username baru.
   - **Hapus pengguna** hanya bisa dilakukan kalau orang itu tidak lagi memegang sekolah. Laporan yang pernah ia isi tetap tersimpan. Kalau hanya ingin menghentikan akses sementara, pilih **Nonaktif**.
3. **Data Sekolah → Tambah sekolah:** daftarkan setiap sekolah binaan dan pilih **Fasilitator 1 & 2**.
4. **Lingkaran nama → Pengaturan Program:** unggah **kop/logo berjajar** dan periksa nama program, penyelenggara, serta kota.

**Fasilitator** (menu: Data Sekolah · Buat Laporan · Unduh Laporan):
1. **Data Sekolah:** lengkapi **kepala sekolah (nama & gelar) + NIP** dan **data guru** sekolah binaan.
2. **Profil Saya:** isi NIP bila ingin dicetak di tanda tangan jurnal.
3. **Buat Laporan:** Pelaksanaan → Pretes & Kehadiran → Postes & Capaian → Evaluasi → Lampiran → Periksa & Unduh.
   - File Google Form **pretes + postes boleh satu file**. Pretes terbaca di langkah 2, postes otomatis tampil di langkah 3.
   - Kalau file diunduh sebelum postes dikerjakan, unggah file terbaru di langkah 3.

### Peran

| Peran | Data sekolah | Laporan | Lihat & unduh | Pengguna & program |
|---|---|---|---|---|
| Admin | tambah/hapus sekolah, atur Fasil 1 & 2 (juga bisa mengisi KS & guru) | **hanya melihat** (+ hapus darurat) | semua | ✓ |
| Fasilitator | kepala sekolah + NIP & data guru sekolah binaannya | mengisi laporan sekolah binaannya | semua | – |
| Pemantau | lihat | lihat | semua | – |

---

## C2. Upgrade dari versi sebelumnya (v2 – v2.4)

1. Di Apps Script, ganti seluruh isi `Code.gs` dengan file baru → **Ctrl+S**.
2. **Deploy → Manage deployments** → ✏ → *Version*: **New version** → **Deploy**. URL tetap sama.
3. Di GitHub, unggah semua file baru **kecuali `js/config.js`**. Biarkan `config.js` lama yang sudah berisi URL Anda.
4. Buka aplikasi dan tekan **Ctrl+Shift+R** sekali.

Data lama tetap aman. Kolom baru di Sheets ditambahkan otomatis.

**Catatan v3.12 — tanpa perubahan Apps Script:**
- PDF bagian "Refleksi Peserta" diganti **Capaian Indikator (Penilaian Diri Peserta)**: paragraf bahwa capaian adalah self-assessment dari data refleksi (jumlah pengisi, pemetaan skor ke 5 tingkat), tabel No | Indikator | Pernyataan refleksi acuan | Rata-rata skor | Capaian (indikator tanpa pernyataan cocok: "ditetapkan fasilitator"), lalu indikator tertinggi/terendah dan yang perlu penguatan.
- Kesimpulan & rangkuman setiap pertanyaan refleksi pindah ke Lampiran **Rekap Refleksi Peserta** (halaman baru, setelah Jurnal Kegiatan).

**Catatan v3.11.1 — tanpa perubahan Apps Script:**
- PDF: setiap LK di Portofolio tugas dicetak mulai halaman baru, jadi judul LK tidak terpisah dari fotonya.
- Lampiran: kolom "Lembar Refleksi" tidak ditampilkan bila refleksi diambil dari Google Form (foto lama tetap tampil).
- Keterangan nilai/refleksi otomatis diperjelas: "Nilai diambil otomatis dari Google Form · terakhir masuk …", "Nilai diambil … Selanjutnya diperbarui otomatis …" (data lama dari tombol/berkas), atau "Belum ada jawaban … di Google Form …".

**Catatan v3.11 (server 3.5.0) — Apps Script BERUBAH; deploy versi baru, lalu jalankan `pasangNilai` sekali:**
1. Ganti isi `Code.gs` → Ctrl+S → Deploy → Manage deployments → ✏ → **New version** → Deploy.
2. Di editor Apps Script, pilih fungsi **`pasangNilai`** di daftar fungsi → **Run**. Izin pemicu sudah ada sejak `pasangMateri`; bila tetap diminta, izinkan. Pemicu `nilaiJadwal` tiap 15 menit terpasang dan langsung berjalan sekali.
- **Nilai otomatis.** Pretes, postes & refleksi dari Google Form masuk sendiri ke laporan setiap sekolah (tombol Ambil nilai/Ambil refleksi dihapus). Hanya form yang dibuka fasilitator dalam 36 jam terakhir dan punya jawaban baru yang dibaca. Tombol **Perbarui data** di laporan & kartu Progres mengambil saat itu juga (paling sering 1x/menit per sekolah).
- **Nama:** sama / ejaan tercatat / sangat mirip → peserta itu (ejaan diingat); nama baru → peserta baru bertanda "periksa" di Data guru (tombol "Sudah benar" atau Gabungkan nama ganda).
- **Tidak ditimpa:** centang hadir yang dicabut fasil, kesimpulan refleksi yang diedit, arti skor ketikan fasil, capaian pilihan fasil untuk indikator yang tidak cocok refleksi.
- **Sudah disahkan:** laporan tidak diubah lagi; jawaban baru ditandai "N jawaban baru belum masuk". Fasil bisa "Masukkan sekarang" (pengesahan batal).
- **Hanya sekali:** pretes, postes, dan refleksi dihitung dari kiriman pertama; kiriman ulang diabaikan. Di portal, nama yang sudah mengirim tidak bisa dipilih (aksi `tesSudah`).
- Sheet Peserta mendapat kolom `periksa`, Rekap kolom `oto` (otomatis).
- Kode pengolah nilai (`js/importer.js`) disalin ke bagian bawah `Code.gs`; jangan diubah di sana.

**Catatan v3.10.1 (server 3.4.1) — hanya Apps Script berubah, deploy versi baru:**
- Progres Pendampingan: fasilitator hanya melihat sekolah binaannya sendiri (server menolak sekolah lain). Admin dan pemantau tetap semua sekolah.

**Catatan v3.10 (server 3.4.0) — Apps Script BERUBAH, deploy versi baru (tanpa izin baru):**
- Kartu baru **Progres Pendampingan** di Pustaka CERMAT untuk semua akun (hanya lihat), aksi server `progresSekolah`: rekap semua pendampingan (peringkat bintang, grafik rata-rata pretes → postes) dan per pendampingan tombol Pretes & Postes (nilai per peserta), Capaian (indikator 5 tingkat), Bintang. Admin, pemantau, dan fasil memilih sekolah dulu.
- Sheet Rekap mendapat kolom `ringkas` (otomatis saat server pertama berjalan). Diisi saat laporan disimpan; laporan lama dibaca sekali dari file-nya saat Progres pertama dibuka.
- Menu **Total Reward** diganti **Progres** (membuka kartu Progres di Pustaka CERMAT). Tautan lama `#/reward` dialihkan.
- Kartu Perolehan Bintang (portal) digabung ke Progres. Admin: Pantau Laporan pindah ke Folder utama.

**Catatan v3.9 (server 3.3.0) — Apps Script BERUBAH, deploy versi baru (tanpa izin baru):**
- Langkah Reward: peserta yang tidak mendapat bintang cukup dibiarkan kosong (–), otomatis dihitung 0. Langkah dan laporan tetap lengkap. Tombol "Isi 0" dihapus.
- Portal Pustaka CERMAT: akun Kepala Sekolah dan Guru mendapat kartu **Perolehan Bintang** (aksi server `bintangSekolah`). Isi: peringkat (nilai sama = peringkat sama), nama guru, total, bintang per pendampingan. "–" = tidak hadir; kolom bertanda * = laporan belum disahkan (sementara).

**Catatan v3.8.1 — tanpa perubahan Apps Script:**
- Kartu Refleksi peserta pindah ke langkah 3 ("Postes, Refleksi & Capaian"), tepat di atas Capaian indikator. Lampiran tidak lagi memuat refleksi.
- Capaian indikator yang cocok dengan pernyataan refleksi **dikunci** mengikuti refleksi (tidak bisa diubah fasil). Indikator tanpa pernyataan cocok, atau laporan tanpa refleksi, tetap dipilih fasil.

**Catatan v3.8 (Capaian 5 tingkat; menggabungkan v3.7.1) — tanpa perubahan Apps Script:**
- Capaian indikator 5 tingkat dari rata-rata skor refleksi (dipetakan ke skala 1–5): ≥ 4,5 Sangat memahami · 3,5–4,4 Memahami · 2,5–3,4 Cukup · 1,5–2,4 Kurang · < 1,5 Belum memahami. Nama status diambil dari keterangan skala di form bila ada.
- Kalimat Kondisi Akhir menyesuaikan ("… dengan sangat baik", "… dengan cukup baik", "masih kurang mampu …", "belum …").
- Laporan lama: Tercapai → Memahami, Sebagian → Cukup, Belum → Belum memahami; hasil otomatis versi 3.7 dihitung ulang saat dibuka.

**Catatan v3.7.1 — tanpa perubahan Apps Script:**
- Capaian indikator dihitung saat laporan dibuka bila refleksinya diambil sebelum v3.7; rangkuman refleksi versi lama diminta diambil ulang.
- Lampiran daftar hadir & jurnal kegiatan selalu dibuat otomatis (tanpa unggah scan; scan lama tetap tampil dan bisa dihapus).
- Portofolio tugas & foto dokumentasi menerima gambar atau PDF; setiap halaman PDF (maks. 20, berkas maks. 30 MB) diubah menjadi gambar di perangkat sebelum diunggah.

**Catatan v3.7 (Capaian indikator otomatis dari refleksi) — tanpa perubahan Apps Script:**
- Setelah refleksi diambil, setiap indikator dicocokkan dengan pernyataan refleksi berskala yang paling mirip. Status: ≥ 75% peserta memilih skor tinggi = Tercapai, 50–74% = Sebagian, < 50% = Belum; dasarnya tampil di bawah indikator.
- Fasil tetap bisa mengubah; pilihan fasil tidak ditimpa saat refleksi diperbarui ("Kembalikan otomatis" membatalkannya). Capaian yang sudah dipilih di laporan lama dianggap pilihan fasil.

**Catatan v3.6 (Indeks materi & satu folder PUSTAKA CERMAT, server 3.2.0) — WAJIB deploy ulang + izin:**
1. Ganti seluruh isi `Code.gs`, **Simpan**.
2. Di Pustaka CERMAT → Atur Folder, tautan kartu **Modul, Bahan Tayang, Lembar Kerja, Silabus** boleh diarahkan ke folder yang sama (mis. **PUSTAKA CERMAT**). Simpan ke GitHub dan tunggu 1–2 menit.
3. Di editor Apps Script pilih fungsi **`pasangMateri`** → **Jalankan** → izinkan (pemicu terjadwal & layanan eksternal). Fungsi ini membuat indeks materi (file `materi-indeks-….json` di folder LAPORAN CERMAT) dan memasang pemicu `materiJadwal` tiap jam. Periksa log: isi setiap kartu dan nomor pendampingan yang terbaca.
4. **Deploy → Kelola deployment → pensil → Versi baru → Deploy.**
5. Setiap kartu menyaring isi folder sesuai namanya (bahan tayang/PPT/slide, LK/lembar kerja, modul, silabus; file tanpa jenis ikut Modul; refleksi tidak tampil). Nama dengan garis bawah (`Pendampingan_01`, `Fase_1`) dikenali, `Fase 1-3` = P1–P22, kedalaman 4 tingkat, pintasan folder ikut dibaca. Fasil/admin bisa menekan **Perbarui daftar** setelah mengunggah file baru.

**Catatan v3.5 (Materi tampil di dalam CERMAT, server 3.1.0) — WAJIB deploy ulang + izin baru:**
1. Ganti seluruh isi `Code.gs`, **Simpan**.
2. Di editor Apps Script pilih fungsi **`cekMateri`** lalu **Jalankan**. Google meminta izin baru (**menghubungkan ke layanan eksternal**, untuk membaca daftar folder `data.json` portal): Lanjutan → Buka (tidak aman) → Izinkan. Log menampilkan file setiap folder kartu beserta nomor pendampingan yang terbaca; periksa apakah pengelompokannya benar.
3. **Deploy → Kelola deployment → pensil → Versi baru → Deploy.**
4. Lembar `MateriBuka` (materi yang ditampilkan per sekolah & pendampingan) dan `MateriPeta` (rentang modul dari admin) dibuat otomatis.
5. Kartu berisi tautan **folder** Google Drive membuka daftar file di dalam CERMAT. Guru & kepsek hanya bisa membuka materi pendampingan yang sudah ditampilkan fasilitator; mengaktifkan pretes ikut menampilkan materi pendampingan itu. File tanpa nomor pendampingan selalu terbuka. Alamat `data.json` portal bisa diganti lewat Script Property `PORTAL_DATA`.

**Catatan v3.4.2 (Arti skor refleksi, server 3.0.2) — deploy ulang Apps Script (Versi baru):**
- Arti angka skala dicari di deskripsi pertanyaan, lalu deskripsi **bagian** di atasnya (mis. "A. Refleksi Tertutup"), lalu deskripsi form. Format `1 = …`, `1: …`, `1. …`, `1 (…)`, `… = 1`, pemisah `·` `|` `;` koma/baris baru, dan singkatan STS/TS/S/SS dikenali.
- Bila tidak ditemukan, kartu Refleksi peserta menampilkan isian **Arti skor** untuk diketik fasil.
- Laporan yang sudah mengambil refleksi: ketuk **Perbarui dari Google Form**.

**Catatan v3.4.1 (Rangkuman refleksi lebih jelas, server 3.0.1) — deploy ulang Apps Script (Versi baru):**
- Petak (grid) berkolom angka, mis. 1–4, dibaca sebagai skala: rata-rata per pernyataan dan persentase skor tinggi. Arti angka diambil dari **keterangan pertanyaan** di Google Form (mis. "1 = Sangat tidak setuju, 2 = Tidak setuju, 3 = Setuju, 4 = Sangat setuju").
- Tabel rangkuman di PDF berupa kalimat, satu baris per pernyataan. Daftar bernomor/berhuruf di isi laporan rata kiri-kanan.
- Laporan yang refleksinya sudah diambil sebelumnya: ketuk **Perbarui dari Google Form** (atau **Susun ulang kesimpulan**) agar memakai format baru.

**Catatan v3.4 (Refleksi lewat Google Form, server 3.0.0) — WAJIB deploy ulang Apps Script:**
1. Ganti seluruh isi `Code.gs`, **Simpan**, lalu **Deploy → Kelola deployment → pensil → Versi baru → Deploy**. Tidak ada izin baru.
2. Siapkan satu Google Form refleksi per pendampingan, berisi pertanyaan **Nama** (jawaban singkat) dan **Asal sekolah**. Tidak perlu Kuis. Jadikan akun pemilik Apps Script editor form, lalu tempel tautan edit di Pustaka CERMAT → Pretes, Postes & Refleksi → Atur tautan → bagian Refleksi.
3. Tautan refleksi disimpan di lembar `TesTautan` dengan nomor `R1`–`R22`; status buka di `TesBuka` dengan jenis `ref`. Tidak ada kolom baru.
4. Fasilitator: membuka postes ikut membuka refleksi; P8–P22 membuka refleksi sendiri. Guru: tombol Isi Refleksi, dan tawaran "Isi refleksi sekarang" setelah kembali dari form postes.
5. Laporan → langkah Lampiran → **Ambil refleksi dari Google Form**: rangkuman analisis otomatis (skala, pilihan, kotak centang, petak, jawaban terbuka) dan kesimpulan yang bisa diedit, tercetak di bagian *Refleksi Peserta*. Pengisi refleksi dicentang hadir.

**Catatan v3.3 (Nama terisi otomatis di form, server 2.9.3) — WAJIB deploy ulang Apps Script:**
1. Ganti seluruh isi `Code.gs`, **Simpan**, lalu **Deploy → Kelola deployment → pensil → Versi baru → Deploy**. Tidak ada izin baru.
2. Lembar `TesTautan` mendapat kolom `entNama`, `entJabatan`, `opsiJabatan`. Untuk tautan yang sudah tersimpan, isian Nama dan Jabatan/Kelas dibaca otomatis dari form saat halaman Pretes & Postes pertama kali dibuka; tidak perlu menyimpan ulang tautan.
3. Form perlu pertanyaan **Nama** berjenis *Jawaban singkat*. Pertanyaan Jabatan/Kelas boleh jawaban singkat atau pilihan.
4. Akun guru: tombol Kerjakan membuka **Pilih nama Anda** (dari Data guru sekolah itu), lalu form terbuka dengan nama dan jabatan terisi. Akun kepala sekolah langsung terisi namanya.
5. **Lihat hasil** di portal memakai daftar guru dan ejaan yang diingat, jadi pretes & postes orang yang sama berpasangan. Di *Periksa nama*, nama baru yang mirip satu sama lain diarahkan ke satu orang.

**Catatan v3.2 (Ambil nilai otomatis & nama ganda, server 2.9.2) — WAJIB deploy ulang Apps Script:**
1. Ganti seluruh isi `Code.gs` dengan versi ini, **Simpan**, lalu **Deploy → Kelola deployment → pensil → Versi baru → Deploy**. URL tetap sama, tidak ada izin baru.
2. Lembar `Peserta` mendapat kolom `alias` (ejaan lain nama) dan `gabungan` (id nama ganda yang sudah digabung) secara otomatis.
3. **Ambil nilai dari Google Form** langsung jalan: kolom dan sekolah dikenali otomatis. Hanya nama yang berbeda dari daftar guru yang ditanyakan (*Periksa nama*); pilihan diingat untuk pendampingan berikutnya.
4. Bila tautan form pendampingan sudah diatur admin, tombol unggah CSV/Excel diganti tautan kecil *pakai file CSV/Excel* (cadangan).
5. Data Sekolah → Data guru → **Gabungkan nama ganda** untuk merapikan nama dobel yang sudah terlanjur tercatat.

**Catatan v3.1 (Pretes & Postes, server 2.9.0) — WAJIB deploy ulang Apps Script:**
1. Ganti seluruh isi `Code.gs` di editor Apps Script dengan `apps-script/Code.gs` versi ini, lalu **Simpan**.
2. **Deploy → Kelola deployment → ikon pensil → Versi: Versi baru → Deploy.** URL web app tetap sama.
3. Google meminta izin baru (**melihat & mengelola Google Formulir**). Pilih akun pemilik → Lanjutan → Buka (tidak aman) → **Izinkan**. Ini wajar karena skrip milik Anda sendiri.
4. Jadikan akun pemilik Apps Script **editor** setiap Google Form pretes/postes P1–P7, lalu tempel tautan edit form di Pustaka CERMAT → Pretes & Postes → Atur tautan.
Lembar `TesTautan` dan `TesBuka` dibuat otomatis di Database CERMAT saat permintaan pertama.

**Catatan v3.0.1:** admin dan pemantau membuka laporan sebagai pratinjau PDF (seperti kepala sekolah). Admin tetap punya tombol *Buka isian laporan (darurat)*. `Code.gs` tidak berubah.

**Catatan v3.0 (Tampilan baru & Unduh daftar akun):** `Code.gs` tidak berubah, tidak perlu deploy ulang Apps Script. Unggah folder `fonts/` baru beserta file yang berubah. Di Kelola Pengguna ada tombol **Unduh daftar akun** (PDF per jenis akun, berkop).

**Catatan v2.8 (Login di portal & peran Guru):** `Code.gs` **berubah** — tempel ulang lalu Deploy → New version **sebelum** mengunggah file ke GitHub. Buat akun Guru (satu per sekolah) di Kelola Pengguna.

**Catatan v2.7 (Satu aplikasi dengan portal CERMAT):** `Code.gs` tidak berubah. Ada tombol ← kembali ke Pustaka CERMAT dan petunjuk memasang aplikasi untuk kepala sekolah.

**Catatan v2.6 (Pratinjau kepala sekolah):** `Code.gs` tidak berubah dari v2.5, cukup unggah file ke GitHub. Pastikan folder baru `vendor/pdfjs/` ikut terunggah.

**Catatan v2.5 (Pengesahan QR):** kerjakan langkah 1–2 (server) **sebelum** langkah 3. Sheet `Pengesahan` dan kolom `sekolahId` di sheet `Pengguna` dibuat otomatis. Setelah itu, admin membuat akun **Kepala Sekolah** untuk setiap sekolah di *Kelola Pengguna* (peran *Kepala Sekolah*, pilih sekolahnya, isi nama & NIP). Laporan yang sebelumnya lengkap berstatus *menunggu pengesahan* sampai fasilitator 1 & 2 dan kepala sekolah mengesahkannya; arsip PDF lama di Drive tetap ada.

**Catatan v2.4 (Reward):** kerjakan langkah 1–2 (server) **sebelum** langkah 3 (GitHub), supaya bintang yang diisi langsung tercatat di kolom `reward` sheet `Rekap`. Langkah **Reward** sekarang wajib. Laporan lama yang sudah lengkap tetap tercatat lengkap dan PDF arsipnya tetap bisa diunduh, tetapi begitu dibuka dan diubah lagi, laporan itu menjadi draf sampai bintang semua peserta hadir diisi.

---

## D. Di mana data tersimpan?

Semua data ada di Google Drive akun admin:

```
LAPORAN CERMAT/
  Database CERMAT        ← Google Sheets
     Pengguna  (password tersimpan sebagai hash, tidak bisa dibaca)
     Sekolah (nama, fasilitator 1 & 2, kepala sekolah + NIP) · Peserta (guru) · Program
     Rekap     (status semua laporan: tanggal, rata-rata pre/post, siapa mengubah)
     Berkas · Sesi · Log (riwayat aktivitas)
  kop
  SD 3 Terban/
     P01 Numerasi dalam Konteks Sehari-hari/
        laporan.json                        ← isian laporan
        foto-….jpg, LK_….jpg                ← foto & scan
        Laporan_CERMAT_P01_SD_3_Terban.pdf  ← arsip PDF
```

- **Jangan mengubah isi sheet `Pengguna`, `Sesi`, dan `Berkas` secara manual.** Sheet `Rekap` dan `Log` aman untuk dibaca dan difilter.
- Laporan atau sekolah yang dihapus dari aplikasi masuk ke **Sampah Google Drive** dan bisa dipulihkan selama 30 hari.
- Isian yang tertimpa bisa dikembalikan lewat **riwayat versi** `laporan.json` (klik kanan file → *Manage versions*).

---

## E. Memperbarui aplikasi

**Kalau `Code.gs` berubah:** tempel kode baru di Apps Script → **Deploy → Manage deployments** → ikon ✏ → *Version*: **New version** → **Deploy**. URL tetap sama, jadi `config.js` tidak perlu diubah.

> Jangan memilih *New deployment* lagi, karena itu membuat URL baru.

**Kalau tampilan berubah:** naikkan `CACHE_VERSION` di `sw.js` dan angka `?v=` di `index.html`, lalu push ke GitHub.

---

## F. Bila ada masalah

| Gejala | Penyebab & solusi |
|---|---|
| "Aplikasi belum terhubung ke server" | `API_URL` di `js/config.js` belum diisi |
| "Tidak bisa terhubung ke server" | Internet putus, atau URL salah. Perubahan tetap tersimpan di perangkat dan terkirim otomatis saat online |
| "Jawaban server tidak terbaca" | Deployment belum diset **Who has access: Anyone**, atau URL bukan yang berakhiran `/exec` |
| "Server belum disiapkan" | Fungsi `setup()` belum dijalankan |
| "Terlalu banyak percobaan gagal" | 5× salah password. Tunggu 10 menit, atau minta admin mereset password |
| Lupa password admin | Di Apps Script, isi lagi Script Properties `ADMIN_USERNAME` + `ADMIN_PASSWORD`, lalu jalankan `setup()` |
| Indikator **"Bentrok versi"** di laporan | Laporan diubah di dua perangkat sekaligus. Pilih *Pakai versi server* atau *Timpa dengan versi saya* |

**Batas akun Google gratis:** Drive 15 GB (dipakai bersama Gmail/Photos akun admin) dan maksimal 30 proses Apps Script bersamaan. Untuk belasan fasilitator, batas ini lebih dari cukup. Pemakaian Drive bisa dipantau di menu **Kelola Pengguna**.
