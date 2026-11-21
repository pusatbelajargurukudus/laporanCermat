# Panduan Pemasangan LAPORAN CERMAT v3.2

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
