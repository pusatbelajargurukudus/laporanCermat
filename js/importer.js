/* Membaca file respons Google Form (CSV atau XLSX) dan menyaring
 * hanya baris milik satu sekolah binaan.
 */
(function () {
  const U = {};

  /* ---------- Normalisasi ---------- */
  U.normName = function (s) {
    s = String(s || '').replace(/ /g, ' ');
    s = s.split(',')[0];                       // buang gelar di belakang koma
    s = s.replace(/\b(drs?|dra|hj?|ir|prof)\.\s*/gi, ' '); // gelar depan
    s = s.replace(/\b(s|m|a)\.\s?(pd|si|kom|ag|hum|e|h|t|sos|ak|kes|sn|ip)\b\.?/gi, ' ');
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
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

  window.Importer = U;
})();
