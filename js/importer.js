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
   * Peserta yang mengirim lebih dari sekali untuk tes yang sama: diambil kiriman terakhir. */
  U.extract = function (an, cols, schoolValues, noPendampingan) {
    const set = new Set(schoolValues);
    const out = new Map();
    let skipped = { jenis: 0, skor: 0, pendampingan: 0 };
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
  const num1 = v => Number(v).toLocaleString('id-ID', { maximumFractionDigits: 1 });
  const potong = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; };
  const daftarKata = arr => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' dan ' + arr[arr.length - 1];
  const kosong = v => v === null || v === undefined || (Array.isArray(v) ? !v.filter(x => String(x || '').trim()).length : !String(v).trim());

  function kataKunci(teks) {
    const docs = teks.map(t => String(t).toLowerCase().replace(/[^a-z0-9À-ɏ\s-]/g, ' ').split(/\s+/).filter(Boolean));
    const df = new Map(), df2 = new Map();
    docs.forEach(tk => {
      const u = new Set(), b = new Set();
      tk.forEach((w, i) => {
        if (w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)) u.add(w);
        const w2 = tk[i + 1];
        if (w2 && w.length >= 3 && w2.length >= 3 && !STOP.has(w) && !STOP.has(w2)) b.add(w + ' ' + w2);
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

  U.refAnalisis = function (items, jawab, abaikan) {
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
        o.min = it.min; o.max = it.max; o.avg = xs.reduce((a, b) => a + b, 0) / xs.length;
        const batas = it.max - it.min >= 3 ? it.max - 1 : it.max;
        o.tinggi = pct(xs.filter(v => v >= batas).length, xs.length);
        o.labelTinggi = batas === it.max ? String(it.max) : batas + '–' + it.max;
        o.maxLabel = it.maxLabel || ''; o.n = xs.length;
      } else if (it.jenis === 'MC' || it.jenis === 'CB') {
        const c = new Map((it.pilihan || []).map(p => [p, 0]));
        vals.forEach(v => (Array.isArray(v) ? v : [v]).forEach(x => { x = String(x).trim(); if (!x) return; const k = c.has(x) ? x : 'Lainnya'; c.set(k, (c.get(k) || 0) + 1); }));
        o.opsi = [...c].filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ t, n, p: pct(n, vals.length) }));
      } else if (it.jenis === 'GRID' || it.jenis === 'CGRID') {
        const kol = it.kolom || [];
        o.baris = (it.baris || []).map((b, bi) => {
          const c = new Map(kol.map(k => [k, 0])); let tot = 0, sk = 0, ns = 0;
          vals.forEach(v => { const x = Array.isArray(v) ? v[bi] : null; (Array.isArray(x) ? x : [x]).forEach(y => { if (y === null || y === undefined || y === '') return; c.set(y, (c.get(y) || 0) + 1); tot++; const ix = kol.indexOf(y); if (ix >= 0) { sk += ix + 1; ns++; } }); });
          const top = [...c].sort((a, b) => b[1] - a[1])[0] || ['', 0];
          return { t: b, top: top[0], p: pct(top[1], tot), skor: ns ? sk / ns : null, n: tot };
        }).filter(b => b.n);
        o.kolom = kol.length;
        if (!o.baris.length) return;
      } else {   // TEXT / PARA: jawaban terbuka
        const teks = vals.map(v => Array.isArray(v) ? v.join(', ') : String(v));
        o.kata = kataKunci(teks); o.contoh = contoh(teks, o.kata);
      }
      out.push(o);
    });
    return out;
  };

  /* Satu baris ringkasan per pertanyaan (layar & PDF) */
  U.refRingkas = function (o) {
    if (o.jenis === 'SCALE') return 'Rata-rata ' + num1(o.avg) + ' dari ' + o.max + ' · ' + o.tinggi + '% memilih ' + o.labelTinggi + ' (n=' + o.n + ')';
    if (o.opsi) return o.opsi.slice(0, 3).map(x => x.t + ' ' + x.p + '%').join(' · ') + (o.jenis === 'CB' ? ' (boleh lebih dari satu)' : '') + ' (n=' + o.n + ')';
    if (o.baris) return o.baris.map(b => b.t + ': ' + b.top + ' ' + b.p + '%').join(' · ');
    return (o.kata.length ? 'Sering muncul: ' + o.kata.map(k => k.t).join(', ') + '.' : 'Jawaban beragam.') + (o.contoh.length ? ' Contoh: “' + o.contoh[0] + '”' : '') + ' (n=' + o.n + ')';
  };

  /* Paragraf kesimpulan otomatis (bisa diedit fasilitator) */
  U.refKesimpulan = function (an, nIsi, nHadir) {
    const q = t => '“' + potong(t, 70) + '”';
    const kal = [];
    kal.push('Refleksi diisi oleh ' + nIsi + ' peserta' + (nHadir ? ' dari ' + nHadir + ' peserta yang hadir (' + pct(nIsi, nHadir) + '%)' : '') + '.');
    const sc = an.filter(o => o.jenis === 'SCALE').map(o => Object.assign({ r: (o.avg - o.min) / Math.max(1, o.max - o.min) }, o)).sort((a, b) => b.r - a.r);
    if (sc.length) {
      const r = sc.reduce((a, o) => a + o.r, 0) / sc.length;
      const buka = r >= 0.75 ? 'Secara umum tanggapan peserta positif' : r >= 0.5 ? 'Secara umum tanggapan peserta cukup baik' : 'Tanggapan peserta masih perlu ditingkatkan';
      let k = buka + ': pernyataan ' + q(sc[0].judul) + ' mendapat rata-rata ' + (sc.length > 1 ? 'tertinggi ' : '') + num1(sc[0].avg) + ' dari ' + sc[0].max + ' (' + sc[0].tinggi + '% memilih ' + sc[0].labelTinggi + ')';
      if (sc.length > 1) k += ', sedangkan ' + q(sc[sc.length - 1].judul) + ' paling rendah (' + num1(sc[sc.length - 1].avg) + ')' + (sc[sc.length - 1].r < 0.6 ? ' dan perlu mendapat perhatian' : '');
      kal.push(k + '.');
    }
    an.filter(o => o.jenis === 'MC' && o.opsi.length).slice(0, 2).forEach(o => {
      const t = o.opsi[0];
      kal.push('Pada pertanyaan ' + q(o.judul) + ', ' + (t.p >= 50 ? 'sebagian besar peserta memilih' : 'pilihan terbanyak adalah') + ' “' + t.t + '” (' + t.p + '%).');
    });
    an.filter(o => o.jenis === 'CB' && o.opsi.length).slice(0, 1).forEach(o => {
      const a = o.opsi.slice(0, 2).map(x => '“' + x.t + '” (' + x.p + '%)');
      kal.push('Untuk ' + q(o.judul) + ', yang paling banyak dipilih adalah ' + daftarKata(a) + '.');
    });
    an.filter(o => o.baris && o.baris.some(b => b.skor !== null) && o.kolom >= 3).slice(0, 1).forEach(o => {
      const bs = o.baris.filter(b => b.skor !== null).sort((a, b) => b.skor - a.skor);
      let k = 'Pada ' + q(o.judul) + ', aspek “' + bs[0].t + '” paling banyak dinilai “' + bs[0].top + '”';
      if (bs.length > 1 && bs[bs.length - 1].skor < bs[0].skor) k += ', sedangkan “' + bs[bs.length - 1].t + '” mendapat penilaian terendah';
      kal.push(k + '.');
    });
    an.filter(o => o.kata && o.kata.length).slice(0, 2).forEach(o => {
      kal.push('Jawaban tentang ' + q(o.judul) + ' paling sering menyebut ' + daftarKata(o.kata.slice(0, 3).map(k => k.t)) + '.');
    });
    return kal.join(' ');
  };

  window.Importer = U;
})();
