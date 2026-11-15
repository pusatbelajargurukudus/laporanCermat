/* Logika laporan: susun kalimat otomatis dari silabus + isian fasilitator.
 * Dipakai bersama oleh form (pratinjau teks), daftar periksa, dan generator PDF.
 */
(function () {
  const R = {};
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  R.sil = no => window.SILABUS[no - 1];
  R.hasTes = no => no >= 1 && no <= 7;
  R.isObservasi = no => no >= 17 && no <= 19;
  R.key = (sekolahId, no) => sekolahId + '_' + no;
  R.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  R.fmt = (n, d = 2) => (n === null || n === undefined || isNaN(n)) ? '-' :
    Number(n).toFixed(d).replace('.', ',');

  R.tanggalPanjang = function (iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return HARI[dt.getDay()] + ', ' + d + ' ' + BULAN[m - 1] + ' ' + y;
  };

  R.groupKelas = function (no) {
    const m = R.sil(no).judul.match(/Kelas (\d) dan (\d)/);
    return m ? [m[1], m[2]] : null;
  };

  R.blank = function (sekolahId, no) {
    return {
      key: R.key(sekolahId, no), sekolahId, no, createdAt: Date.now(), updatedAt: Date.now(),
      tanggal: '', jamMulai: '08.00', jamSelesai: '11.00', tempat: '',
      hadir: [], tes: null, capaian: {}, kegiatan: null,
      teks: { latar: '', kondisiAwal: '', kondisiAkhir: '' },
      permasalahan: '', rekomendasi: '', observasi: [],
      lampiran: { hadirAuto: true, jurnalAuto: true, hadirScan: [], jurnalScan: [], portofolio: {}, foto: [] }
    };
  };

  /* Peserta yang relevan untuk pendampingan ini (disaring per kelompok kelas bila perlu). */
  R.relevantPeserta = function (school, no, showAll) {
    const list = (school && school.peserta) || [];
    const g = R.groupKelas(no);
    if (!g || showAll) return list;
    return list.filter(p => p.jabatan === 'Kepala Sekolah' || (p.jabatan === 'Guru Kelas' && g.includes(String(p.kelas))) || p.forceGroup === no);
  };

  const RANK = { 'Kepala Sekolah': 0, 'Guru Kelas': 1, 'Guru Mapel': 2, 'Tenaga Kependidikan': 3 };
  R.sortPeserta = function (list) {
    return list.slice().sort((a, b) => {
      const ra = RANK[a.jabatan] ?? 4, rb = RANK[b.jabatan] ?? 4;
      if (ra !== rb) return ra - rb;
      const ka = parseInt(a.kelas, 10) || 9, kb = parseInt(b.kelas, 10) || 9;
      if (ka !== kb) return ka - kb;
      return a.nama.localeCompare(b.nama, 'id');
    });
  };

  R.jabatanLabel = p => p.jabatan === 'Guru Kelas' && p.kelas ? 'Guru Kelas ' + p.kelas : (p.jabatan || '');

  R.kegiatan = function (rep) {
    if (rep.kegiatan) return rep.kegiatan;
    return R.sil(rep.no).kegiatan.map(k => ({
      sesi: k.sesi, bagian: k.bagian, waktu: k.waktu, catatan: '',
      aktivitas: k.aktivitas.map(t => ({ teks: t, aktif: true }))
    }));
  };

  R.indikatorList = function (no) {
    const s = R.sil(no);
    return s.indikator.pengetahuan.map((t, i) => ({ id: 'p' + i, dim: 'Pengetahuan', teks: t }))
      .concat(s.indikator.keterampilan.map((t, i) => ({ id: 'k' + i, dim: 'Keterampilan', teks: t })));
  };

  const klausa = t => t.replace(/^Peserta\s+/i, '').replace(/\.$/, '');

  /* ---------- Nilai pretes/postes ---------- */
  R.stats = function (rep) {
    if (!rep.tes || !rep.tes.rows || !rep.tes.rows.length) return null;
    const pre = rep.tes.rows.filter(r => r.jenis === 'pre');
    const post = rep.tes.rows.filter(r => r.jenis === 'post');
    const avg = a => a.length ? a.reduce((s, r) => s + r.skor, 0) / a.length : null;
    const st = { preN: pre.length, postN: post.length, pre: avg(pre), post: avg(post) };
    st.selisih = (st.pre !== null && st.post !== null) ? st.post - st.pre : null;
    st.persen = (st.selisih !== null && st.pre > 0) ? st.selisih / st.pre * 100 : null;
    const np = new Set(pre.map(r => Importer.normName(r.nama)));
    const nq = new Set(post.map(r => Importer.normName(r.nama)));
    st.onlyPre = pre.filter(r => !nq.has(Importer.normName(r.nama))).map(r => r.nama);
    st.onlyPost = post.filter(r => !np.has(Importer.normName(r.nama))).map(r => r.nama);
    return st;
  };

  R.skorPeserta = function (rep, nama) {
    const out = { pre: null, post: null };
    if (!rep.tes) return out;
    const n = Importer.normName(nama);
    rep.tes.rows.forEach(r => { if (Importer.normName(r.nama) === n) out[r.jenis] = r.skor; });
    return out;
  };

  /* ---------- Kalimat otomatis ---------- */
  R.latar = rep => (rep.teks.latar || '').trim() || R.sil(rep.no).deskripsi.join('\n\n');

  R.hadirList = function (rep, school) {
    const ids = new Set(rep.hadir || []);
    return ((school && school.peserta) || []).filter(p => ids.has(p.id));
  };

  R.kalimatPeserta = function (rep, school) {
    const h = R.hadirList(rep, school);
    const c = { ks: 0, guru: 0, tendik: 0, lain: 0 };
    h.forEach(p => {
      if (p.jabatan === 'Kepala Sekolah') c.ks++;
      else if (p.jabatan === 'Guru Kelas' || p.jabatan === 'Guru Mapel') c.guru++;
      else if (p.jabatan === 'Tenaga Kependidikan') c.tendik++;
      else c.lain++;
    });
    const g = R.groupKelas(rep.no);
    const sasaran = g ? 'Kepala Sekolah dan guru kelas ' + g[0] + ' dan ' + g[1] : 'Kepala Sekolah dan guru';
    const parts = [];
    if (c.ks) parts.push(c.ks + ' kepala sekolah');
    if (c.guru) parts.push(c.guru + ' guru');
    if (c.tendik) parts.push(c.tendik + ' tenaga kependidikan');
    if (c.lain) parts.push(c.lain + ' peserta lainnya');
    let s = 'Peserta dalam pendampingan ' + rep.no + ' ini adalah ' + sasaran + ' ' + (school ? school.nama : '') +
      ' yang berjumlah ' + h.length + ' orang';
    if (parts.length > 1) s += ', terdiri atas ' + gabung(parts);
    return s + '.';
  };

  function gabung(a) {
    if (a.length <= 1) return a.join('');
    if (a.length === 2) return a[0] + ' dan ' + a[1];
    return a.slice(0, -1).join(', ') + ', dan ' + a[a.length - 1];
  }
  R.gabung = gabung;

  R.kalimatPelaksanaan = function (rep, school) {
    const s = R.sil(rep.no);
    let t = 'Pendampingan ' + rep.no + ' dengan materi “' + s.judul + '” dilaksanakan pada hari ' +
      (R.tanggalPanjang(rep.tanggal) || '...');
    if (rep.jamMulai || rep.jamSelesai) t += ' pukul ' + (rep.jamMulai || '...') + '–' + (rep.jamSelesai || '...') + ' WIB';
    t += ' bertempat di ' + (rep.tempat || (school ? school.nama : '...')) + '. ';
    t += 'Kegiatan berlangsung selama ' + (s.alokasi || '3 JP (180 menit)') + ' yang terbagi dalam ' +
      R.kegiatan(rep).length + ' sesi.';
    return t;
  };

  R.kondisiAwal = function (rep) {
    if ((rep.teks.kondisiAwal || '').trim()) return rep.teks.kondisiAwal.trim();
    const items = R.indikatorList(rep.no).map(i => 'peserta belum ' + klausa(i.teks));
    const st = R.stats(rep);
    if (R.hasTes(rep.no) && st && st.pre !== null) items.push('skor rata-rata pretes peserta adalah ' + R.fmt(st.pre));
    return 'Kondisi awal pada peserta pendampingan antara lain: ' + nomori(items) + '.';
  };

  R.kondisiAkhir = function (rep) {
    if ((rep.teks.kondisiAkhir || '').trim()) return rep.teks.kondisiAkhir.trim();
    const s = R.sil(rep.no);
    const items = R.indikatorList(rep.no).map(i => {
      const c = rep.capaian[i.id] || 'tercapai';
      const k = klausa(i.teks);
      if (c === 'sebagian') return 'sebagian peserta ' + k;
      if (c === 'belum') return 'peserta belum ' + k;
      return 'peserta ' + k;
    });
    const st = R.stats(rep);
    if (R.hasTes(rep.no) && st && st.post !== null) {
      let t = 'skor rata-rata postes peserta adalah ' + R.fmt(st.post);
      if (st.selisih !== null) {
        const naik = st.selisih >= 0;
        t += ', ' + (naik ? 'naik ' : 'turun ') + R.fmt(Math.abs(st.selisih)) + ' poin';
        if (st.persen !== null) t += ' (' + R.fmt(Math.abs(st.persen)) + '%)';
        t += ' dari skor rata-rata pretes ' + R.fmt(st.pre);
      }
      items.push(t);
    }
    return 'Kondisi akhir pada peserta setelah mengikuti pendampingan dengan materi “' + s.judul +
      '” antara lain: ' + nomori(items) + '.';
  };

  function nomori(items) {
    const a = items.map((t, i) => '(' + (i + 1) + ') ' + t);
    return gabung(a);
  }

  R.penutup = (settings) => 'Laporan pelaksanaan pendampingan ini diharapkan menjadi bahan informasi untuk evaluasi dan kontrol pelaksanaan pendampingan Program ' +
    (settings.program || 'CERMAT') + '. Informasi yang didapatkan merupakan bahan tindak lanjut bagi pemangku kebijakan, penyelenggara, serta pihak-pihak lain untuk tercapainya tujuan dari program.';

  /* ---------- Daftar periksa ---------- */
  R.checklist = function (rep, school) {
    const L = rep.lampiran;
    const c = [];
    const add = (label, ok, wajib = true, step = 1) => c.push({ label, ok: !!ok, wajib, step });
    add('Tanggal pelaksanaan', rep.tanggal, true, 1);
    add('Tempat pelaksanaan', (rep.tempat || '').trim(), true, 1);
    add('Peserta hadir dicentang', (rep.hadir || []).length > 0, true, 2);
    if (R.hasTes(rep.no)) {
      const st = R.stats(rep);
      add('Nilai pretes diimpor', st && st.preN > 0, true, 2);
      add('Nilai postes diimpor', st && st.postN > 0, true, 2);
    }
    if (R.isObservasi(rep.no)) add('Hasil observasi & coaching (minimal 1 guru)', (rep.observasi || []).some(o => (o.guru || '').trim()), true, 3);
    add('Permasalahan yang ditemui', (rep.permasalahan || '').trim(), true, 4);
    add('Rekomendasi fasilitator', (rep.rekomendasi || '').trim(), true, 4);
    add('Foto dokumentasi (minimal 1)', (L.foto || []).length > 0, true, 5);
    if (!L.hadirAuto) add('Scan daftar hadir', (L.hadirScan || []).length > 0, true, 5);
    if (!L.jurnalAuto) add('Scan jurnal kegiatan', (L.jurnalScan || []).length > 0, true, 5);
    const porto = Object.values(L.portofolio || {}).reduce((s, a) => s + a.length, 0);
    add('Portofolio tugas (opsional)', porto > 0, false, 5);
    return c;
  };

  R.isComplete = (rep, school) => R.checklist(rep, school).every(x => x.ok || !x.wajib);
  R.status = (rep, school) => !rep ? 'kosong' : (R.isComplete(rep, school) ? 'lengkap' : 'draf');

  R.fileName = function (rep, school) {
    const slug = s => String(s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return 'Laporan_CERMAT_P' + String(rep.no).padStart(2, '0') + '_' + slug(school ? school.nama : 'Sekolah') + '.pdf';
  };

  window.Report = R;
})();
