/* Membaca file respons Google Form (CSV atau XLSX) dan menyaring
 * hanya baris milik satu sekolah binaan.
 */
(function () {
  const U = {};

  /* ---------- Normalisasi ---------- */
  /* Nama orang -> bentuk baku untuk dicocokkan: tanpa gelar, sapaan, tanda baca, huruf besar. */
  const SAPAAN = /^(bu|ibu|bpk|pak|bapak|mbak|mba|mas|kak|ust|ustadz|ustadzah|ustazah|ustaz|hj|h|haji|hajjah|dra|drs|dr|ir|prof|kh|ny|nn|sdr|sdri)$/;
  const GELAR = /^(s|m|a|d)(pd|pdi|pdsd|si|ag|hum|e|h|t|sos|ak|kes|kom|sn|ip|psi|th|thi|kep|gz|ikom|ma|mapd|sy|hi|fil|ked)+$|^(spd|mpd|sag|spdi|spdsd|ssi|se|skom|sh|ss|ama|amapd|mm|msi|mag|mkes|mt|st|sip|ssos|shi|sthi|sei|lc|ma|ba|bsc|msc|phd)$/;
  U.normName = function (s) {
    s = String(s || '').replace(/ /g, ' ');
    s = s.split(',')[0];                       // buang gelar di belakang koma
    const tok = s.toLowerCase().replace(/[^a-z0-9.\s'-]/g, ' ').split(/\s+/).filter(Boolean);
    const out = [];
    tok.forEach((t, i) => {
      const bare = t.replace(/[.'-]/g, '');
      if (!bare) return;
      if (SAPAAN.test(bare) && tok.length > 1) return;                 // sapaan / gelar depan
      if (/\./.test(t) && bare.length >= 2 && GELAR.test(bare)) return; // S.Pd., M.Pd., S.Pd.SD, A.Ma.Pd
      if (i > 0 && GELAR.test(bare) && bare.length >= 3) return;        // SPd, MPd tanpa titik (bukan kata pertama)
      out.push(bare);
    });
    return out.join(' ').trim();
  };

  /* Kemiripan dua nama baku (0..1): Levenshtein ternormalisasi */
  U.lev = function (a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m || !n) return m || n;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  };
  U.mirip = function (a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const full = 1 - U.lev(a, b) / Math.max(a.length, b.length);
    // semua kata satu nama ada (persis/mirip) di nama lain: "Rina" ~ "Rina Kusuma", "Lestari W." ~ "Lestari Wulandari"
    // dicek dua arah, karena jumlah kata bisa sama ("lestari w" vs "lestari wulandari")
    const sub = (sh, lo) => {
      if (sh.length > lo.length) return 0;
      const tokSim = t => Math.max(...lo.map(u => t.length === 1 ? (u[0] === t ? 1 : 0) : 1 - U.lev(t, u) / Math.max(t.length, u.length)));   // "M." = Muhammad
      const ok = sh.every(t => tokSim(t) >= (t.length <= 3 ? 1 : 0.8)) && sh.some(t => t.length >= 3);
      return ok ? 0.9 - 0.02 * (lo.length - sh.length) : 0;
    };
    const ta = a.split(' '), tb = b.split(' ');
    return Math.max(full, sub(ta, tb), sub(tb, ta));
  };

  /* Cocokkan satu nama dari form ke daftar peserta sekolah.
   * -> { p, cara: 'persis'|'ejaan'|'mirip', skor } atau { p: null, saran: [...] } */
  U.cocokkan = function (nama, peserta) {
    const n = U.normName(nama);
    if (!n) return { p: null, saran: [] };
    for (const p of peserta) if (U.normName(p.nama) === n) return { p, cara: 'persis', skor: 1 };
    for (const p of peserta) if ((p.alias || []).some(a => U.normName(a) === n)) return { p, cara: 'ejaan', skor: 1 };
    const sk = peserta.map(p => ({ p, skor: Math.max(U.mirip(n, U.normName(p.nama)), ...(p.alias || []).map(a => U.mirip(n, U.normName(a)))) }))
      .filter(x => x.skor >= 0.78).sort((a, b) => b.skor - a.skor);
    return { p: null, saran: sk.slice(0, 3) };
  };

  U.normSchool = function (s) {
    let t = String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    t = t.replace(/\b(sekolah dasar|sd|sdn|sdit|mi|min|negeri|n|swasta|kecamatan|kec|kabupaten|kab|kudus)\b/g, ' ');
    return t.replace(/\s+/g, ' ').trim();
  };

  U.schoolMatch = function (value, school) {
    const a = U.normSchool(value);
    const names = [school.nama].concat(school.alias || []);
    return names.some(n => {
      if (String(n).trim().toLowerCase() === String(value).trim().toLowerCase()) return true;
      const b = U.normSchool(n);
      if (!a || !b) return false;
      if (a === b) return true;
      const ta = a.split(' '), tb = b.split(' ');
      return ta.length === tb.length && ta.every(x => tb.includes(x));
    });
  };

  U.parseScore = function (v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;
    const m = s.match(/^(-?\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/);
    if (m) {
      const a = parseFloat(m[1].replace(',', '.')), b = parseFloat(m[2].replace(',', '.'));
      return b > 0 ? (a / b) * 100 : null;
    }
    const n = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  };

  U.parseJabatan = function (raw) {
    const s = String(raw || '').toLowerCase();
    if (!s.trim()) return { jabatan: '', kelas: '' };
    if (/kepala/.test(s)) return { jabatan: 'Kepala Sekolah', kelas: '' };
    if (/(tendik|tenaga kependidikan|tata usaha|\btu\b|operator|administrasi|penjaga|pustakawan)/.test(s)) return { jabatan: 'Tenaga Kependidikan', kelas: '' };
    const k = s.match(/kelas\s*([1-6]|i{1,3}|iv|vi?|v)\b/) || s.match(/^\s*([1-6])\s*$/);
    if (k) {
      const roman = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
      const kv = roman[k[1]] || parseInt(k[1], 10);
      return { jabatan: 'Guru Kelas', kelas: String(kv) };
    }
    if (/(pai|agama|pjok|olahraga|penjas|inggris|bahasa|mapel|seni|sbdp|tik|mulok|jawa)/.test(s)) return { jabatan: 'Guru Mapel', kelas: '' };
    if (/guru/.test(s)) return { jabatan: 'Guru Kelas', kelas: '' };
    return { jabatan: '', kelas: '' };
  };

  /* ---------- CSV ---------- */
  U.parseCSV = function (text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/)[0] || '';
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let q = false;
    for (const ch of firstLine) { if (ch === '"') q = !q; else if (!q && ch in counts) counts[ch]++; }
    const delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const rows = []; let row = []; let cell = ''; let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
        else cell += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  };

  /* ---------- XLSX (lembar pertama) ---------- */
  U.parseXLSX = async function (arrayBuffer) {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const parser = new DOMParser();
    const xml = async p => { const f = zip.file(p); return f ? parser.parseFromString(await f.async('string'), 'application/xml') : null; };
    const byTag = (doc, tag) => Array.from(doc.getElementsByTagNameNS('*', tag));

    const shared = [];
    const ss = await xml('xl/sharedStrings.xml');
    if (ss) byTag(ss, 'si').forEach(si => shared.push(byTag(si, 't').map(t => t.textContent).join('')));

    let sheetPath = 'xl/worksheets/sheet1.xml';
    const wb = await xml('xl/workbook.xml');
    const rels = await xml('xl/_rels/workbook.xml.rels');
    if (wb && rels) {
      const first = byTag(wb, 'sheet')[0];
      if (first) {
        const rid = first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        const rel = byTag(rels, 'Relationship').find(r => r.getAttribute('Id') === rid);
        if (rel) {
          let t = rel.getAttribute('Target');
          sheetPath = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
        }
      }
    }
    const sh = await xml(sheetPath);
    if (!sh) throw new Error('Lembar kerja tidak ditemukan di file XLSX.');
    const colIdx = ref => { const m = ref.match(/^([A-Z]+)/); let n = 0; for (const c of m[1]) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };
    const rows = [];
    byTag(sh, 'row').forEach(r => {
      const arr = [];
      byTag(r, 'c').forEach(c => {
        const t = c.getAttribute('t'); const ref = c.getAttribute('r');
        let v = '';
        if (t === 's') { const vv = byTag(c, 'v')[0]; v = vv ? shared[parseInt(vv.textContent, 10)] : ''; }
        else if (t === 'inlineStr') v = byTag(c, 't').map(x => x.textContent).join('');
        else { const vv = byTag(c, 'v')[0]; v = vv ? vv.textContent : ''; }
        arr[ref ? colIdx(ref) : arr.length] = v;
      });
      for (let i = 0; i < arr.length; i++) if (arr[i] === undefined) arr[i] = '';
      rows.push(arr);
    });
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  };

  U.readFile = async function (file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx')) return U.parseXLSX(await file.arrayBuffer());
    if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) return U.parseCSV(await file.text());
    throw new Error('Format file belum didukung. Unduh respons Google Form sebagai .csv atau .xlsx.');
  };

  /* ---------- Deteksi kolom ---------- */
  U.detectColumns = function (header) {
    const h = header.map(x => String(x || '').toLowerCase());
    const find = (tests, exclude) => {
      for (const re of tests) {
        const i = h.findIndex((x, idx) => re.test(x) && !(exclude || []).includes(idx));
        if (i >= 0) return i;
      }
      return -1;
    };
    const cols = {};
    cols.skor = find([/^(total )?(skor|score|nilai)$/, /^(total )?(skor|score|nilai)\b/, /\b(skor|score|nilai)\b/]);
    cols.sekolah = find([/asal sekolah/, /nama sekolah/, /^sekolah/, /sekolah|instansi|unit kerja|satuan pendidikan/]);
    cols.nama = find([/^nama( lengkap)?( peserta)?( \(.*\))?$/, /nama lengkap/, /^nama\b/, /\bnama\b/], [cols.sekolah]);
    cols.jenis = find([/jenis tes|jenis test|pre.?tes.*post|pilih tes|^tes$|^test$|jenis/]);
    cols.jabatan = find([/jabatan|kelas|tugas|peran/], [cols.sekolah, cols.nama]);
    cols.pendampingan = find([/pendampingan/]);
    return cols;
  };

  U.parseJenis = function (v) {
    const s = String(v || '').toLowerCase().replace(/[^a-z]/g, '');
    if (/^(pre|pra)|pretes|pretest|awal/.test(s)) return 'pre';
    if (/^post|posttes|postest|posttest|akhir/.test(s)) return 'post';
    return null;
  };

  /* Ringkas isi file menjadi struktur siap dipakai UI. */
  U.analyze = function (rows) {
    if (!rows.length) throw new Error('File kosong.');
    const header = rows[0].map(x => String(x || '').trim());
    const body = rows.slice(1);
    return { header, body, cols: U.detectColumns(header) };
  };

  U.distinct = function (body, col) {
    const m = new Map();
    if (col < 0) return [];
    body.forEach(r => { const v = String(r[col] || '').trim(); if (v) m.set(v, (m.get(v) || 0) + 1); });
    return Array.from(m.entries()).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
  };

  /* Ambil baris milik sekolah terpilih -> [{nama, jabatanRaw, jenis, skor}]
   * Peserta yang mengirim lebih dari sekali untuk tes yang sama: yang dihitung kiriman PERTAMA
   * (pretes/postes tidak boleh diulang); kiriman berikutnya dihitung di skipped.ulang. */
  U.extract = function (an, cols, schoolValues, noPendampingan) {
    const set = new Set(schoolValues);
    const out = new Map();
    let skipped = { jenis: 0, skor: 0, pendampingan: 0, ulang: 0 };
    an.body.forEach(r => {
      const sv = String(r[cols.sekolah] || '').trim();
      if (!set.has(sv)) return;
      if (cols.pendampingan >= 0 && noPendampingan) {
        const pv = String(r[cols.pendampingan] || '');
        const m = pv.match(/\d+/);
        if (m && parseInt(m[0], 10) !== noPendampingan) { skipped.pendampingan++; return; }
      }
      const jenis = U.parseJenis(r[cols.jenis]);
      if (!jenis) { skipped.jenis++; return; }
      const skor = U.parseScore(r[cols.skor]);
      if (skor === null) { skipped.skor++; return; }
      const nama = String(r[cols.nama] || '').trim();
      if (!nama) return;
      const key = jenis + '|' + U.normName(nama);
      if (out.has(key)) { skipped.ulang++; return; }
      out.set(key, { nama, jabatanRaw: cols.jabatan >= 0 ? String(r[cols.jabatan] || '').trim() : '', jenis, skor });
    });
    return { rows: Array.from(out.values()), skipped };
  };

  /* =========================================================
   * REFLEKSI: rangkuman analisis otomatis dari jawaban Google Form
   * items: [{judul, jenis: SCALE|MC|CB|GRID|CGRID|TEXT|PARA|LAIN, ...}], jawab: [[jawaban per item]] (satu baris per peserta)
   * ========================================================= */
  const STOP = new Set(('yang dan di ke dari untuk dengan pada ini itu dalam adalah akan saya kami kita mereka anda ada atau juga lebih ' +
    'tidak belum sudah bisa dapat agar karena oleh sebagai secara serta para tersebut hal cara bagi jadi masih lagi saat harus perlu sehingga ' +
    'namun tetapi supaya seperti yaitu yakni bahwa setiap semua sendiri dia ia kalau jika maka pun lah kah nya dll dsb mau hari lalu kemudian ' +
    'telah sedang tentang antara banyak hanya mungkin ketika begitu sangat cukup sama apa bagaimana kenapa mengapa siapa kapan dimana tsb ' +
    'yg dgn utk tdk sy kmi akan oleh pak bu ibu bapak murid siswa anak guru kelas pembelajaran belajar membuat menjadi memakai melakukan menggunakan').split(' '));
  const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
  // satu desimal, koma Indonesia (tanpa Intl: hasilnya sama di peramban dan di server Apps Script)
  const num1 = v => { const r = Math.round(Number(v) * 10) / 10; const [a, d] = String(Math.abs(r)).split('.'); return (r < 0 ? '-' : '') + a.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + d : ''); };
  const potong = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; };
  const daftarKata = arr => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' dan ' + arr[arr.length - 1];
  const kosong = v => v === null || v === undefined || (Array.isArray(v) ? !v.filter(x => String(x || '').trim()).length : !String(v).trim());

  function kataKunci(teks, judul) {
    const diTanya = new Set(String(judul || '').toLowerCase().replace(/[^a-z0-9\u00c0-\u024f\s-]/g, ' ').split(/\s+/));   // kata dari pertanyaannya sendiri bukan temuan
    const docs = teks.map(t => String(t).toLowerCase().replace(/[^a-z0-9À-ɏ\s-]/g, ' ').split(/\s+/).filter(Boolean));
    const df = new Map(), df2 = new Map();
    docs.forEach(tk => {
      const u = new Set(), b = new Set();
      tk.forEach((w, i) => {
        if (w.length >= 3 && !STOP.has(w) && !diTanya.has(w) && !/^\d+$/.test(w)) u.add(w);
        const w2 = tk[i + 1];
        if (w2 && w.length >= 3 && w2.length >= 3 && !STOP.has(w) && !STOP.has(w2) && !(diTanya.has(w) && diTanya.has(w2))) b.add(w + ' ' + w2);
      });
      u.forEach(w => df.set(w, (df.get(w) || 0) + 1));
      b.forEach(w => df2.set(w, (df2.get(w) || 0) + 1));
    });
    const min = teks.length >= 4 ? 2 : 1;
    const bi = [...df2].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const dipakai = new Set(bi.flatMap(([w]) => w.split(' ')));
    const uni = [...df].filter(([w, n]) => n >= min && !dipakai.has(w)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return bi.concat(uni).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, n]) => ({ t, n }));
  }
  function contoh(teks, kata) {
    const k = kata.map(x => x.t);
    return teks.map(t => String(t).replace(/\s+/g, ' ').trim()).filter(t => t.split(' ').length >= 4)
      .map(t => { const l = t.toLowerCase(); return { t, s: k.reduce((a, w) => a + (l.includes(w) ? 1 : 0), 0) / Math.sqrt(Math.max(8, t.split(' ').length)) }; })
      .sort((a, b) => b.s - a.s).map(x => x.t).filter((t, i, arr) => arr.findIndex(y => U.mirip(y.toLowerCase().slice(0, 60), t.toLowerCase().slice(0, 60)) > 0.8) === i)
      .slice(0, 2).map(t => potong(t, 180));
  }

  /* Arti angka skala dari keterangan: "1 = Sangat tidak setuju, 2 = Tidak setuju", "1 = belum · 2 = kurang",
   * "1. STS", "1 (Sangat tidak setuju)", "Sangat setuju = 4", "SS (4)". Singkatan STS/TS/KS/R/N/S/SS diuraikan. */
  const SINGKAT = { sts: 'sangat tidak setuju', ts: 'tidak setuju', ks: 'kurang setuju', r: 'ragu-ragu', n: 'netral', cs: 'cukup setuju', s: 'setuju', ss: 'sangat setuju' };
  function labelAngka(ket, min, max) {
    const teks = String(ket || '');
    const m = {};
    const simpan = (n, t) => {
      t = String(t || '').replace(/^[\s:=.\-–—]+|[\s.,;:·•|\-–—]+$/g, '').trim();
      if (!t || t.length > 45 || /^\d+$/.test(t)) return;
      if (min !== undefined && (Number(n) < min || Number(n) > max)) return;
      if (m[n] === undefined) m[n] = SINGKAT[t.toLowerCase()] || t;
    };
    const PISAH = '·•|;\\n,=()';
    // angka lalu arti: 1 = …, 1: …, 1. …, 1 - …, 1) …, 1 (…)
    const re1 = new RegExp('(?:^|[\\s' + PISAH + '])(\\d{1,2})\\s*(?:=|:|\\.|-|–|—|\\)|\\()\\s*([^' + PISAH + '\\d]*[^' + PISAH + '\\d\\s])', 'g');   // tanpa spasi di ujung: spasi itu pembatas angka berikutnya
    let x;
    while ((x = re1.exec(teks))) simpan(x[1], x[2]);
    if (Object.keys(m).length < 2) {
      // arti lalu angka: Sangat setuju = 4, SS (4)
      const re2 = new RegExp('([A-Za-z][^' + PISAH + '\\d]*?)\\s*(?:=|:|\\()\\s*(\\d{1,2})\\b', 'g');
      while ((x = re2.exec(teks))) simpan(x[2], x[1].replace(/^(skala|keterangan|ket)\s*/i, ''));
    }
    return Object.keys(m).length >= 2 ? m : {};
  }
  /* Ambil dari sumber pertama yang berisi arti angka: deskripsi pertanyaan, deskripsi bagian, deskripsi form */
  function labelDari(sumber, min, max) {
    for (const t of sumber) { const m = labelAngka(t, min, max); if (Object.keys(m).length) return m; }
    return {};
  }
  U.labelAngka = labelAngka;
  const angka = v => /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(String(v));

  U.refAnalisis = function (items, jawab, abaikan, ketForm) {
    const skip = new Set(abaikan || []);
    const out = [];
    items.forEach((it, i) => {
      if (skip.has(i) || it.jenis === 'LAIN') return;
      const vals = jawab.map(r => r[i]).filter(v => !kosong(v));
      if (!vals.length) return;
      const o = { judul: it.judul, jenis: it.jenis, n: vals.length };
      if (it.jenis === 'SCALE') {
        const xs = vals.map(Number).filter(v => !isNaN(v));
        if (!xs.length) return;
        const lab = labelDari([it.ket, it.ketBagian, ketForm], it.min, it.max);
        if (it.minLabel && lab[it.min] === undefined) lab[it.min] = it.minLabel;
        if (it.maxLabel && lab[it.max] === undefined) lab[it.max] = it.maxLabel;
        Object.assign(o, skalaRingkas(xs, it.min, it.max), { lab });
      } else if (it.jenis === 'MC' || it.jenis === 'CB') {
        const c = new Map((it.pilihan || []).map(p => [p, 0]));
        vals.forEach(v => (Array.isArray(v) ? v : [v]).forEach(x => { x = String(x).trim(); if (!x) return; const k = c.has(x) ? x : 'Lainnya'; c.set(k, (c.get(k) || 0) + 1); }));
        o.opsi = [...c].filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ t, n, p: pct(n, vals.length) }));
      } else if (it.jenis === 'GRID' || it.jenis === 'CGRID') {
        const kol = it.kolom || [];
        const numerik = kol.length >= 2 && kol.every(angka);
        if (numerik) {
          // petak berkolom angka (mis. 1–4) = skala per pernyataan
          const ns = kol.map(k => Number(String(k).replace(',', '.')));
          o.jenis = 'GSCALE'; o.min = Math.min(...ns); o.max = Math.max(...ns); o.lab = labelDari([it.ket, it.ketBagian, ketForm], o.min, o.max);
          o.baris = (it.baris || []).map((b, bi) => {
            const xs = [];
            vals.forEach(v => { const x = Array.isArray(v) ? v[bi] : null; (Array.isArray(x) ? x : [x]).forEach(y => { if (y !== null && y !== undefined && angka(y)) xs.push(Number(String(y).replace(',', '.'))); }); });
            return xs.length ? Object.assign({ t: b }, skalaRingkas(xs, o.min, o.max)) : null;
          }).filter(Boolean);
        } else {
          o.baris = (it.baris || []).map((b, bi) => {
            const c = new Map(kol.map(k => [k, 0])); let tot = 0, sk = 0, ns = 0;
            vals.forEach(v => { const x = Array.isArray(v) ? v[bi] : null; (Array.isArray(x) ? x : [x]).forEach(y => { if (y === null || y === undefined || y === '') return; c.set(y, (c.get(y) || 0) + 1); tot++; const ix = kol.indexOf(y); if (ix >= 0) { sk += ix + 1; ns++; } }); });
            const urut = [...c].filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
            return { t: b, top: (urut[0] || [''])[0], p: pct((urut[0] || [0, 0])[1], tot), dua: urut[1] ? { t: urut[1][0], p: pct(urut[1][1], tot) } : null, skor: ns ? sk / ns : null, n: tot };
          }).filter(b => b.n);
          o.kolom = kol.length;
        }
        if (!o.baris.length) return;
      } else {   // TEXT / PARA: jawaban terbuka
        const teks = vals.map(v => Array.isArray(v) ? v.join(', ') : String(v));
        o.kata = kataKunci(teks, it.judul); o.contoh = contoh(teks, o.kata);
      }
      out.push(o);
    });
    return out;
  };
  function skalaRingkas(xs, min, max) {
    const batas = max - min >= 3 ? max - 1 : max;
    const nT = xs.filter(v => v >= batas).length;
    return { min, max, avg: xs.reduce((a, b) => a + b, 0) / xs.length, n: xs.length, nTinggi: nT, tinggi: pct(nT, xs.length), batas };
  }
  /* "skor 4 (memahami/setuju) atau 5 (sangat memahami/sangat setuju)"; "skor 4–5" bila arti angka tidak diketahui */
  function rentangTinggi(o, lab) {
    const batas = o.batas !== undefined ? o.batas : (o.max - o.min >= 3 ? o.max - 1 : o.max);
    const L = n => lab && lab[n] ? String(lab[n]).toLowerCase() : '';
    if (batas === o.max) return 'skor ' + o.max + (L(o.max) ? ' (' + L(o.max) + ')' : '');
    if (o.max - batas === 1 && L(batas) && L(o.max)) return 'skor ' + batas + ' (' + L(batas) + ') atau ' + o.max + ' (' + L(o.max) + ')';
    return 'skor ' + batas + '–' + o.max + (L(batas) && L(o.max) ? ' (' + L(batas) + ' sampai ' + L(o.max) + ')' : '');
  }
  const bersihJudul = t => String(t || '').replace(/^\s*\d+\s*[.)]\s*/, '').replace(/[\s.:]+$/, '');
  const kutip = (t, n) => '“' + potong(bersihJudul(t), n || 70) + '”';
  const daftarPersen = arr => {
    // "“B” dan “C” (masing-masing 20%)" bila persennya sama
    if (arr.length > 1 && arr.every(x => x.p === arr[0].p)) return daftarKata(arr.map(x => '“' + x.t + '”')) + ' (masing-masing ' + arr[0].p + '%)';
    return daftarKata(arr.map(x => '“' + x.t + '” (' + x.p + '%)'));
  };
  function kalimatSkala(x, o) {
    if (x.avg === undefined) return '';
    return 'Rata-rata ' + num1(x.avg) + ' dari ' + o.max + (o.min !== 1 ? ' (skala ' + o.min + '–' + o.max + ')' : '') + '. Sebanyak ' + x.tinggi + '% peserta memilih ' + rentangTinggi(Object.assign({ min: o.min, max: o.max }, x), o.lab) + '.';
  }

  /* Baris tabel PDF: [pertanyaan, kalimat rangkuman]. Petak (grid) dipecah satu baris per pernyataan. */
  U.refBaris = function (o) {
    if (o.jenis === 'SCALE') return [[o.judul, kalimatSkala(o, o)]];
    if (o.jenis === 'GSCALE') return o.baris.map(b => [b.t, kalimatSkala(b, o)]);
    if (o.baris) return o.baris.map(b => [b.t, b.top ? 'Paling banyak dinilai “' + b.top + '” (' + b.p + '%)' + (b.dua ? ', disusul “' + b.dua.t + '” (' + b.dua.p + '%)' : '') + '.' : '-']);
    if (o.opsi) {
      const [a, ...lain] = o.opsi;
      if (!a) return [[o.judul, '-']];
      if (o.jenis === 'CB') return [[o.judul, 'Paling banyak dipilih ' + daftarPersen(o.opsi.slice(0, 3)) + '. Peserta boleh memilih lebih dari satu.']];
      return [[o.judul, (a.p > 50 ? 'Sebagian besar peserta memilih' : 'Pilihan terbanyak adalah') + ' “' + a.t + '” (' + a.p + '%)' + (lain.length ? ', disusul ' + daftarPersen(lain.slice(0, 2)) : '') + '.']];
    }
    const k = (o.kata || []).slice(0, 3).map(x => x.t);
    return [[o.judul, (k.length ? 'Jawaban paling sering menyinggung ' + daftarKata(k) + '.' : 'Jawaban peserta beragam.') + ((o.contoh || []).length ? ' Salah satu peserta menulis: “' + o.contoh[0].replace(/[.”"]+$/, '') + '.”' : '')]];
  };
  /* Satu teks ringkasan per pertanyaan (tampilan di aplikasi) */
  U.refRingkas = function (o) {
    return U.refBaris(o).map(([q, k]) => o.baris ? bersihJudul(q) + ': ' + k : k).join(' ');
  };

  /* Paragraf kesimpulan otomatis (bisa diedit fasilitator) */
  U.refKesimpulan = function (an, nIsi, nHadir) {
    const kal = [];
    kal.push('Refleksi diisi oleh ' + nIsi + ' peserta' + (nHadir ? ' dari ' + nHadir + ' peserta yang hadir (' + pct(nIsi, nHadir) + '%)' : '') + '.');
    // semua butir berskala: pertanyaan skala + setiap pernyataan petak berangka
    const unit = [];
    an.forEach(o => {
      if (o.jenis === 'SCALE' && o.avg !== undefined) unit.push({ judul: o.judul, avg: o.avg, min: o.min, max: o.max, n: o.n, nTinggi: o.nTinggi, lab: o.lab, batas: o.batas });
      if (o.jenis === 'GSCALE') o.baris.forEach(b => unit.push({ judul: b.t, avg: b.avg, min: o.min, max: o.max, n: b.n, nTinggi: b.nTinggi, lab: o.lab, batas: b.batas }));
    });
    if (unit.length) {
      unit.forEach(u => { u.r = (u.avg - u.min) / Math.max(1, u.max - u.min); });
      const r = unit.reduce((a, u) => a + u.r, 0) / unit.length;
      const buka = r >= 0.75 ? 'Secara umum tanggapan peserta positif' : r >= 0.5 ? 'Secara umum tanggapan peserta cukup baik' : 'Tanggapan peserta masih perlu ditingkatkan';
      const satuSkala = unit.every(u => u.max === unit[0].max && u.min === unit[0].min);
      const nT = unit.reduce((a, u) => a + (u.nTinggi || 0), 0), nA = unit.reduce((a, u) => a + u.n, 0);
      if (unit.length === 1) kal.push(buka + ': pernyataan ' + kutip(unit[0].judul) + ' mendapat rata-rata ' + num1(unit[0].avg) + ' dari ' + unit[0].max + ', dan ' + pct(nT, nA) + '% peserta memilih ' + rentangTinggi(unit[0], unit[0].lab) + '.');
      else {
        // arti angka: dari butir yang artinya paling lengkap
        const labTerbaik = unit.map(u => u.lab || {}).sort((a, b) => Object.keys(b).length - Object.keys(a).length)[0];
        kal.push(buka + (satuSkala ? ': rata-rata seluruh pernyataan ' + num1(unit.reduce((a, u) => a + u.avg, 0) / unit.length) + ' dari ' + unit[0].max + ', dan ' + pct(nT, nA) + '% jawaban berada pada ' + rentangTinggi(unit[0], labTerbaik) : '') + '.');
        const urut = unit.slice().sort((a, b) => b.r - a.r), hi = urut[0], lo = urut[urut.length - 1];
        if (hi.r > lo.r) kal.push('Skor tertinggi ada pada pernyataan ' + kutip(hi.judul) + ' (' + num1(hi.avg) + '), sedangkan terendah pada ' + kutip(lo.judul) + ' (' + num1(lo.avg) + ')' + (lo.r < 0.6 || hi.avg - lo.avg >= 0.4 ? ', sehingga aspek ini perlu mendapat penguatan' : '') + '.');
      }
    }
    an.filter(o => o.jenis === 'MC' && o.opsi.length).slice(0, 2).forEach(o => {
      const t = o.opsi[0];
      kal.push('Pada pertanyaan ' + kutip(o.judul) + ', ' + (t.p > 50 ? 'sebagian besar peserta memilih' : 'pilihan terbanyak adalah') + ' “' + t.t + '” (' + t.p + '%).');
    });
    an.filter(o => o.jenis === 'CB' && o.opsi.length).slice(0, 1).forEach(o => {
      kal.push('Untuk ' + kutip(o.judul) + ', yang paling banyak dipilih adalah ' + daftarPersen(o.opsi.slice(0, 2)) + '.');
    });
    an.filter(o => o.jenis === 'GRID' && o.baris && o.baris.some(b => b.skor !== null) && o.kolom >= 3).slice(0, 1).forEach(o => {
      const bs = o.baris.filter(b => b.skor !== null).sort((a, b) => b.skor - a.skor);
      let k = 'Pada ' + kutip(o.judul) + ', aspek ' + kutip(bs[0].t) + ' paling banyak dinilai “' + bs[0].top + '”';
      if (bs.length > 1 && bs[bs.length - 1].skor < bs[0].skor) k += ', sedangkan ' + kutip(bs[bs.length - 1].t) + ' mendapat penilaian terendah';
      kal.push(k + '.');
    });
    an.filter(o => o.kata && o.kata.length).slice(0, 2).forEach(o => {
      kal.push('Jawaban tentang ' + kutip(o.judul) + ' paling sering menyinggung ' + daftarKata(o.kata.slice(0, 3).map(k => k.t)) + '.');
    });
    return kal.join(' ');
  };

  /* =========================================================
   * CAPAIAN INDIKATOR dari refleksi: setiap indikator dicocokkan dengan pernyataan refleksi berskala
   * yang paling mirip; status 5 tingkat dari rata-rata skor (dipetakan ke 1–5):
   * ≥ 4,5 sangat · 3,5–4,4 paham · 2,5–3,4 cukup · 1,5–2,4 kurang · < 1,5 belum.
   * ========================================================= */
  const KATA_ABAI = new Set(('peserta dapat saya mampu memahami paham mengerti tahu yang dan atau dengan dalam pada di ke dari untuk ini itu serta secara ' +
    'tentang terhadap sesuai lebih sangat bisa akan sudah telah adalah oleh para setiap tiga dua satu cara hal pembelajaran belajar').split(' '));
  const akar = w => {
    let x = w.replace(/(nya|lah|kah)$/, '');
    x = x.replace(/^(meng|meny|mem|men|me|peng|peny|pem|pen|per|pe|ber|be|ter|di|ke)(?=[a-z]{4,})/, '');
    x = x.replace(/(kan|an|i)$/, m => x.length - m.length >= 4 ? '' : m);
    return x.replace(/^c/, 'k').replace(/x/g, 'ks');   // contextual ~ kontekstual
  };
  const kataPokok = t => String(t || '').toLowerCase().replace(/^\s*\d+\s*[.)]\s*/, '').replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/)
    .filter(w => w.length >= 3 && !KATA_ABAI.has(w)).map(akar).filter(w => w.length >= 3);
  const kataSama = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && (a.slice(0, 5) === b.slice(0, 5)));
  // kata yang muncul di lebih dari separuh pernyataan (mis. "numerasi") diberi bobot kecil
  function kemiripan(ind, pern, bobot) {
    const A = [...new Set(kataPokok(ind))], B = [...new Set(kataPokok(pern))];
    if (!A.length || !B.length) return 0;
    const w = x => bobot(x), sum = arr => arr.reduce((a, x) => a + w(x), 0);
    const cocok = sum(A.filter(a => B.some(b => kataSama(a, b))));
    const sa = sum(A), sb = sum(B);
    return cocok / Math.min(sa, sb) * 0.7 + cocok / Math.max(sa, sb) * 0.3;
  }
  U.CAPAIAN = ['sangat', 'paham', 'cukup', 'kurang', 'belum'];
  U.CAPAIAN_NAMA = { sangat: 'Sangat memahami', paham: 'Memahami', cukup: 'Cukup', kurang: 'Kurang', belum: 'Belum memahami' };
  U.capaianDari = x => x >= 4.5 ? 'sangat' : x >= 3.5 ? 'paham' : x >= 2.5 ? 'cukup' : x >= 1.5 ? 'kurang' : 'belum';
  /* Nama status dari keterangan skala 1–5 di form ("1 = belum memahami/tidak setuju" -> "Belum memahami") */
  U.capaianNama = function (items) {
    const o = (items || []).find(x => (x.jenis === 'SCALE' || x.jenis === 'GSCALE') && x.min === 1 && x.max === 5 && x.lab && Object.keys(x.lab).length >= 4);
    const nama = Object.assign({}, U.CAPAIAN_NAMA);
    if (!o) return nama;
    const ambil = n => { const t = String(o.lab[n] || '').split('/')[0].trim(); return t ? t[0].toUpperCase() + t.slice(1).toLowerCase() : ''; };
    [['sangat', 5], ['paham', 4], ['cukup', 3], ['kurang', 2], ['belum', 1]].forEach(([k, n]) => { const t = ambil(n); if (t && t.length <= 28) nama[k] = t; });
    return nama;
  };
  U.refCapaian = function (items, indikator) {
    // butir berskala: pertanyaan skala & setiap pernyataan petak berangka
    const unit = [];
    (items || []).forEach(o => {
      if (o.jenis === 'SCALE' && o.n && o.avg !== undefined) unit.push({ teks: o.judul, avg: o.avg, min: o.min, max: o.max, n: o.n, lab: o.lab });
      if (o.jenis === 'GSCALE') o.baris.forEach(b => unit.push({ teks: b.t, avg: b.avg, min: o.min, max: o.max, n: b.n, lab: o.lab }));
    });
    const out = {};
    if (!unit.length) return null;   // refleksi tanpa butir skala
    const df = new Map();
    unit.forEach(u => new Set(kataPokok(u.teks)).forEach(k => df.set(k, (df.get(k) || 0) + 1)));
    const bobot = k => { let n = 0; df.forEach((v, kk) => { if (kataSama(k, kk)) n = Math.max(n, v); }); return unit.length >= 4 && n / unit.length > 0.5 ? 0.3 : 1; };
    indikator.forEach(i => {
      const sk = unit.map(u => ({ u, s: kemiripan(i.teks, u.teks, bobot) })).sort((a, b) => b.s - a.s);
      if (!sk.length || sk[0].s < 0.35) return;
      const pakai = sk.filter(x => x.s >= 0.5 || x.s >= sk[0].s - 0.15).filter(x => x.s >= 0.35).slice(0, 3);
      // rata-rata berbobot jumlah penjawab, dipetakan ke skala 1–5
      const nA = pakai.reduce((a, x) => a + x.u.n, 0);
      const x5 = pakai.reduce((a, x) => a + (1 + 4 * (x.u.avg - x.u.min) / Math.max(1, x.u.max - x.u.min)) * x.u.n, 0) / Math.max(1, nA);
      const avg = pakai.reduce((a, x) => a + x.u.avg * x.u.n, 0) / Math.max(1, nA);
      out[i.id] = { v: U.capaianDari(x5), avg: Math.round(avg * 10) / 10, min: pakai[0].u.min, max: pakai[0].u.max, satuSkala: pakai.every(x => x.u.max === pakai[0].u.max && x.u.min === pakai[0].u.min),
        dasar: pakai.map(x => bersihJudul(x.u.teks)) };
    });
    return out;
  };

  /* =========================================================
   * CAPAIAN DARI POSTES (pendampingan bertes, P1–P7): rata-rata nilai postes dikelompokkan ke 5 tingkat.
   * Skala nilai dikenali dari data: semua nilai <= 10 -> skala 10 (mis. nilai 1–10), selain itu skala 100.
   * BATAS_POSTES = persen dari nilai maksimum (skala 10: 9 · 7 · 5 · 3; skala 100: 90 · 70 · 50 · 30),
   * perbandingannya sama dengan batas refleksi (4,5 · 3,5 · 2,5 · 1,5 dari 5).
   * ========================================================= */
  U.BATAS_POSTES = { sangat: 90, paham: 70, cukup: 50, kurang: 30 };
  U.batasPostes = skala => { const b = U.BATAS_POSTES, k = (skala || 100) / 100, r = x => Math.round(x * k * 100) / 100; return { sangat: r(b.sangat), paham: r(b.paham), cukup: r(b.cukup), kurang: r(b.kurang) }; };
  U.capaianPostes = (x, skala) => { const b = U.batasPostes(skala); return x >= b.sangat ? 'sangat' : x >= b.paham ? 'paham' : x >= b.cukup ? 'cukup' : x >= b.kurang ? 'kurang' : 'belum'; };
  /* Rata-rata postes dari baris nilai laporan (dibulatkan 2 desimal, sama dengan yang tercetak) + skala nilainya */
  U.rataPostes = function (rows) {
    const angka = r => r && r.skor !== null && r.skor !== '' && isFinite(Number(r.skor));
    const semua = (rows || []).filter(r => angka(r) && (r.jenis === 'pre' || r.jenis === 'post')).map(r => Number(r.skor));
    const xs = (rows || []).filter(r => angka(r) && r.jenis === 'post').map(r => Number(r.skor));
    if (!xs.length) return null;
    return { avg: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 100) / 100, n: xs.length, skala: Math.max.apply(null, semua) <= 10 ? 10 : 100 };
  };
  /* Capaian otomatis satu laporan -> { idIndikator: { v, avg, min, max, sumber: 'postes'|'refleksi', ... } } atau null.
   * tesRows: baris nilai (array) bila pendampingan memakai pretes/postes, null bila tidak.
   * - Pendampingan bertes: Pengetahuan dari rata-rata postes (belum ada postes -> dipilih fasilitator).
   * - Keterampilan, dan Pengetahuan pada pendampingan tanpa tes: dari refleksi (pernyataan berskala yang paling mirip). */
  U.capaianOtomatis = function (indikator, refItems, tesRows) {
    const bertes = Array.isArray(tesRows);
    const post = bertes ? U.rataPostes(tesRows) : null;
    const ref = refItems && refItems.length ? U.refCapaian(refItems, indikator) : null;
    const out = {};
    indikator.forEach(i => {
      if (bertes && i.dim === 'Pengetahuan') {
        if (post) out[i.id] = { v: U.capaianPostes(post.avg, post.skala), avg: post.avg, min: 0, max: post.skala, n: post.n, satuSkala: true, sumber: 'postes', dasar: ['Rata-rata nilai postes'] };
        return;
      }
      if (ref && ref[i.id]) out[i.id] = Object.assign({}, ref[i.id], { sumber: 'refleksi' });
    });
    return Object.keys(out).length ? out : null;
  };

  (typeof window !== 'undefined' ? window : this).Importer = U;
})();
