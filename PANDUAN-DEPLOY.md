# Panduan Pemasangan LAPORAN CERMAT v2

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
   - **Description:** `v2`
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
2. Buat repository baru di GitHub, mis. `laporan-cermat`.
3. Unggah semua file dan folder dari paket ini, termasuk `.nojekyll`. Folder `apps-script/` boleh ikut diunggah karena tidak berisi password.
4. **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, Branch **main / (root)** → **Save**.
5. Tunggu 1–2 menit, lalu buka `https://NAMA-AKUN.github.io/laporan-cermat/`.

---

## C. Penggunaan pertama (oleh admin)

1. Masuk dengan username dan password admin.
2. **Akun Saya → Ganti password.** Sangat disarankan, karena akun admin bisa mengubah dan menghapus semua laporan.
3. **Kelola Pengguna:** tambahkan akun setiap fasilitator (username, nama lengkap bergelar, peran, password awal). Sampaikan username dan password awal ke masing-masing.
4. **Data Sekolah:**
   - Buka **Data program**: isi penanggung jawab jurnal dan unggah gambar **kop**.
   - **Tambah sekolah:** tempel 9 nama sekolah sekaligus.
   - Di setiap sekolah, pilih **Fasilitator pemegang**. Namanya otomatis tercetak di sampul dan jurnal laporan.

### Peran

| Peran | Lihat & unduh | Edit laporan | Sekolah & peserta | Kelola pengguna |
|---|---|---|---|---|
| Admin | semua | semua | semua | ✓ |
| Fasilitator | semua | sekolah yang dipegang | peserta sekolah yang dipegang | – |
| Pemantau | semua | – | lihat | – |

---

## D. Di mana data tersimpan?

Semua data ada di Google Drive akun admin:

```
LAPORAN CERMAT/
  Database CERMAT        ← Google Sheets
     Pengguna  (password tersimpan sebagai hash, tidak bisa dibaca)
     Sekolah · Peserta · Program
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
