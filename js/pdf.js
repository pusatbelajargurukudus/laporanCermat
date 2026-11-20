/* Generator PDF laporan (pdf-lib, berjalan sepenuhnya di browser).
 * Dokumen disusun langsung sebagai PDF: teks tajam & bisa disalin,
 * daftar isi memakai nomor halaman yang sebenarnya.
 */
(function () {
  const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;

  const W = 595.28, H = 841.89;            // A4
  const ML = 85, MR = 57, MT = 85, MB = 64; // kiri 3 cm, kanan 2 cm, atas 3 cm, bawah ±2,25 cm
  const CW = W - ML - MR;
  const IND = 22;                          // indentasi isi di bawah judul bab
  const BLUE_L = rgb(0.078, 0.2, 0.42);        // biru tua logo CERMAT
  const GOLD = rgb(0.784, 0.588, 0.165);       // emas logo CERMAT
  const INK = rgb(0.11, 0.11, 0.13);
  const GREY = rgb(0.45, 0.45, 0.48);
  const LINE = rgb(0.55, 0.58, 0.63);
  const HEAD_FILL = rgb(0.87, 0.91, 0.97);

  const REPL = { '→': '->', '←': '<-', '≤': '<=', '≥': '>=', '−': '-', ' ': ' ', '‐': '-', '‑': '-',
    ' ': ' ', ' ': ' ', '​': '', '\t': ' ', '′': "'", '″': '"', '×': '×' };

  function dataUrlBytes(url) {
    const b64 = url.split(',')[1];
    const bin = atob(b64);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }

  class Writer {
    constructor(doc, fonts, opts) {
      this.doc = doc; this.f = fonts; this.o = opts;
      this.pages = []; this.toc = []; this.page = null; this.y = MT;
      this.charset = new Set(fonts.reg.getCharacterSet());
      this.imgCache = new Map();
    }
    clean(s) {
      s = String(s === null || s === undefined ? '' : s);
      let out = '';
      for (const ch of s) {
        if (ch === '\n') { out += ch; continue; }
        if (REPL[ch] !== undefined && !this.charset.has(ch.codePointAt(0))) { out += REPL[ch]; continue; }
        out += this.charset.has(ch.codePointAt(0)) ? ch : '?';
      }
      return out;
    }
    newPage() {
      this.page = this.doc.addPage([W, H]);
      this.pages.push(this.page);
      this.y = MT;
      if (this.o.kop) {
        const k = this.o.kop;
        const maxW = W - ML - MR + 30, maxH = 46;
        const s = Math.min(maxW / k.width, maxH / k.height);
        const w = k.width * s, h = k.height * s;
        this.page.drawImage(k, { x: (W - w) / 2, y: H - 24 - h, width: w, height: h });
      }
      return this.page;
    }
    room() { return H - MB - this.y; }
    ensure(h) { if (this.y + h > H - MB) this.newPage(); }
    width(t, font, size) { return font.widthOfTextAtSize(t, size); }

    wrap(text, font, size, maxW) {
      const words = this.clean(text).split(/ +/).filter(w => w !== '');
      const lines = []; let cur = []; let curW = 0;
      const sp = this.width(' ', font, size);
      for (let w of words) {
        let ww = this.width(w, font, size);
        while (ww > maxW) {            // kata sangat panjang: potong paksa
          let i = w.length - 1;
          while (i > 1 && this.width(w.slice(0, i), font, size) > maxW) i--;
          if (cur.length) { lines.push({ words: cur, w: curW }); cur = []; curW = 0; }
          lines.push({ words: [w.slice(0, i)], w: this.width(w.slice(0, i), font, size) });
          w = w.slice(i); ww = this.width(w, font, size);
        }
        const add = cur.length ? sp + ww : ww;
        if (cur.length && curW + add > maxW) { lines.push({ words: cur, w: curW }); cur = [w]; curW = ww; }
        else { cur.push(w); curW += add; }
      }
      if (cur.length) lines.push({ words: cur, w: curW });
      if (!lines.length) lines.push({ words: [], w: 0 });
      return lines;
    }

    drawLine(line, x, top, o, isLast) {
      const { font, size, color, align, maxW, lh } = o;
      const base = H - (top + (lh - size) / 2 + size * 0.8);
      if (align === 'justify' && !isLast && line.words.length > 1) {
        // rata kiri-kanan memakai word spacing PDF (Tw) supaya spasi tetap spasi asli saat teks disalin
        const extra = (maxW - line.w) / (line.words.length - 1);
        this.page.pushOperators(PDFLib.setWordSpacing(extra));
        this.page.drawText(line.words.join(' '), { x, y: base, size, font, color });
        this.page.pushOperators(PDFLib.setWordSpacing(0));
        return;
      }
      const t = line.words.join(' ');
      let cx = x;
      if (align === 'center') cx = x + (maxW - line.w) / 2;
      else if (align === 'right') cx = x + maxW - line.w;
      this.page.drawText(t, { x: cx, y: base, size, font, color });
    }

    /* Paragraf (\n\n = paragraf baru). */
    para(text, opt = {}) {
      const o = Object.assign({ x: IND, size: 11, font: this.f.reg, color: INK, lh: 1.5, align: 'justify', first: 0, after: 5 }, opt);
      const lhpt = o.size * o.lh;
      const blocks = String(text || '').split(/\n\s*\n|\n/).map(s => s.trim()).filter(Boolean);
      blocks.forEach(b => {
        const maxW0 = (o.w || CW - o.x) - o.first;
        const firstLines = this.wrap(b, o.font, o.size, maxW0);
        // baris pertama memakai lebar dikurangi indentasi, sisanya lebar penuh
        const rest = firstLines.length > 1 ? this.wrap(firstLines.slice(1).map(l => l.words.join(' ')).join(' '), o.font, o.size, o.w || CW - o.x) : [];
        const lines = [firstLines[0]].concat(rest);
        lines.forEach((ln, i) => {
          this.ensure(lhpt);
          const isFirst = i === 0;
          const mw = isFirst ? maxW0 : (o.w || CW - o.x);
          this.drawLine(ln, ML + o.x + (isFirst ? o.first : 0), this.y, Object.assign({}, o, { maxW: mw, lh: lhpt }), i === lines.length - 1);
          this.y += lhpt;
        });
        this.y += o.after;
      });
    }

    /* Daftar bernomor/berhuruf/centang. */
    list(items, opt = {}) {
      const o = Object.assign({ x: IND, size: 11, font: this.f.reg, color: INK, lh: 1.5, marker: 'alpha', align: 'left', after: 2, mw: 18 }, opt);
      const lhpt = o.size * o.lh;
      items.forEach((it, idx) => {
        const maxW = CW - o.x - o.mw;
        const lines = this.wrap(it, o.font, o.size, maxW);
        this.ensure(lhpt * Math.min(lines.length, 2));
        const mx = ML + o.x;
        const top = this.y;
        if (o.marker === 'check') this.check(mx + 1, top + (lhpt - 9) / 2 + 1);
        else if (o.marker !== 'none') {
          const m = o.marker === 'alpha' ? String.fromCharCode(97 + (idx % 26)) + '.' :
            o.marker === 'num' ? (idx + 1) + '.' : '•';
          this.page.drawText(m, { x: mx, y: H - (top + (lhpt - o.size) / 2 + o.size * 0.8), size: o.size, font: o.font, color: o.color });
        }
        lines.forEach((ln, i) => {
          if (i > 0) this.ensure(lhpt);
          this.drawLine(ln, mx + o.mw, this.y, Object.assign({}, o, { maxW, lh: lhpt }), i === lines.length - 1);
          this.y += lhpt;
        });
        this.y += o.after;
      });
    }

    check(x, top) {
      this.page.drawSvgPath('M 0 4.5 L 3.4 8 L 9.5 0.5', { x, y: H - top, borderColor: BLUE_L, borderWidth: 1.4 });
    }

    label(text, opt = {}) {
      this.para(text, Object.assign({ font: this.f.bold, align: 'left', after: 1 }, opt));
    }

    h1(num, title, newPage) {
      if (newPage) this.newPage();
      else { this.ensure(16 * 1 + 50); this.y += 10; }
      const size = 13.5;
      const base = H - (this.y + size);
      this.page.drawText(String(num) + '.', { x: ML, y: base, size, font: this.f.reg, color: BLUE_L });
      this.page.drawText(this.clean(title.toUpperCase()), { x: ML + IND, y: base, size, font: this.f.reg, color: BLUE_L });
      this.toc.push({ level: 1, label: num + '.', title: title.toUpperCase(), page: this.pages.length });
      this.y += size + 9;
    }

    h2(letter, title, newPage) {
      if (newPage) this.newPage();
      else { this.ensure(48); this.y += 4; }
      const size = 11.5;
      const base = H - (this.y + size);
      this.page.drawText(letter + '.', { x: ML + IND, y: base, size, font: this.f.reg, color: BLUE_L });
      this.page.drawText(this.clean(title), { x: ML + IND + 16, y: base, size, font: this.f.reg, color: BLUE_L });
      this.toc.push({ level: 2, label: letter + '.', title, page: this.pages.length });
      this.y += size + 8;
    }

    /* Tabel dengan pembungkusan teks & pengulangan header di halaman baru. */
    table(cols, rows, opt = {}) {
      const o = Object.assign({ x: IND, size: 9.5, lh: 1.3, pad: 4, header: true, after: 8, boldLastRow: false }, opt);
      const tw = (o.w || CW - o.x);
      const widths = cols.map(c => c.w * tw);
      const lhpt = o.size * o.lh;
      const cellLines = (row, font) => row.map((cell, i) => this.wrap(cell === null || cell === undefined ? '' : String(cell), font, o.size, widths[i] - o.pad * 2));
      const rowH = lines => Math.max.apply(null, lines.map(l => l.length)) * lhpt + o.pad * 2;
      const drawRow = (row, font, fill) => {
        const lines = cellLines(row, font);
        const h = rowH(lines);
        let x = ML + o.x;
        lines.forEach((ls, i) => {
          if (fill) this.page.drawRectangle({ x, y: H - this.y - h, width: widths[i], height: h, color: fill });
          this.page.drawRectangle({ x, y: H - this.y - h, width: widths[i], height: h, borderColor: LINE, borderWidth: 0.6 });
          let ty = this.y + o.pad;
          ls.forEach((ln, j) => {
            this.drawLine(ln, x + o.pad, ty, { font, size: o.size, color: INK, align: cols[i].align || 'left', maxW: widths[i] - o.pad * 2, lh: lhpt }, true);
            ty += lhpt;
          });
          x += widths[i];
        });
        this.y += h;
      };
      const header = () => { if (o.header) drawRow(cols.map(c => c.t), this.f.bold, HEAD_FILL); };
      const hh = o.header ? rowH(cellLines(cols.map(c => c.t), this.f.bold)) : 0;
      const firstH = rows.length ? rowH(cellLines(rows[0], this.f.reg)) : 0;
      this.ensure(hh + firstH);
      header();
      rows.forEach((r, idx) => {
        const bold = o.boldLastRow && idx === rows.length - 1;
        const h = rowH(cellLines(r, bold ? this.f.bold : this.f.reg));
        if (this.y + h > H - MB) { this.newPage(); header(); }
        drawRow(r, bold ? this.f.bold : this.f.reg, bold ? rgb(0.95, 0.96, 0.98) : null);
      });
      this.y += o.after;
    }

    /* Baris "Label : nilai" tanpa garis. */
    kv(pairs, opt = {}) {
      const o = Object.assign({ x: IND, size: 10.5, lw: 168 }, opt);
      const lhpt = o.size * 1.45;
      pairs.forEach(([k, v]) => {
        const maxW = CW - o.x - o.lw - 10;
        const lines = this.wrap(v, this.f.reg, o.size, maxW);
        this.ensure(lhpt * lines.length);
        const base = H - (this.y + (lhpt - o.size) / 2 + o.size * 0.8);
        this.page.drawText(this.clean(k), { x: ML + o.x, y: base, size: o.size, font: this.f.reg, color: INK });
        this.page.drawText(':', { x: ML + o.x + o.lw, y: base, size: o.size, font: this.f.reg, color: INK });
        lines.forEach(ln => {
          this.drawLine(ln, ML + o.x + o.lw + 10, this.y, { font: this.f.reg, size: o.size, color: INK, align: 'left', maxW, lh: lhpt }, true);
          this.y += lhpt;
        });
      });
      this.y += 6;
    }

    async embed(imgRec) {
      if (this.imgCache.has(imgRec.id)) return this.imgCache.get(imgRec.id);
      const bytes = dataUrlBytes(imgRec.data);
      const im = /^data:image\/png/.test(imgRec.data) ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes);
      this.imgCache.set(imgRec.id, im);
      return im;
    }

    /* Grid gambar: cols kolom, tinggi maksimum maxH per gambar. */
    async images(recs, opt = {}) {
      const o = Object.assign({ x: IND, cols: 2, gap: 10, maxH: 260, frame: true }, opt);
      const tw = CW - o.x;
      const cw = (tw - o.gap * (o.cols - 1)) / o.cols;
      const ims = [];
      for (const r of recs) if (r) ims.push(await this.embed(r));
      for (let i = 0; i < ims.length; i += o.cols) {
        const row = ims.slice(i, i + o.cols);
        const sized = row.map(im => { const s = Math.min(cw / im.width, o.maxH / im.height); return { im, w: im.width * s, h: im.height * s }; });
        const rh = Math.max.apply(null, sized.map(s => s.h));
        this.ensure(rh + o.gap);
        sized.forEach((s, j) => {
          const x = ML + o.x + j * (cw + o.gap) + (cw - s.w) / 2;
          const yb = H - this.y - s.h;
          this.page.drawImage(s.im, { x, y: yb, width: s.w, height: s.h });
          if (o.frame) this.page.drawRectangle({ x, y: yb, width: s.w, height: s.h, borderColor: LINE, borderWidth: 0.5 });
        });
        this.y += rh + o.gap;
      }
    }
  }

  async function generate(rep, school, settings, getImage, flags = {}) {
    const R = window.Report;
    const sil = R.sil(rep.no);
    const doc = await PDFDocument.create();
    const fonts = {
      reg: await doc.embedFont(StandardFonts.Helvetica),
      bold: await doc.embedFont(StandardFonts.HelveticaBold),
      ital: await doc.embedFont(StandardFonts.HelveticaOblique)
    };
    doc.setTitle('Laporan Pendampingan ' + rep.no + ' - ' + sil.judul + ' - ' + (school ? school.nama : ''));
    const fasil = settings.fasilitator || [];
    doc.setAuthor(fasil.map(f => f.nama).join(', '));
    doc.setCreator('LAPORAN CERMAT');
    doc.setProducer('LAPORAN CERMAT (pdf-lib)');
    doc.setLanguage('id-ID');

    let kop = null;
    if (settings.kop) kop = await (/^data:image\/png/.test(settings.kop) ? doc.embedPng(dataUrlBytes(settings.kop)) : doc.embedJpg(dataUrlBytes(settings.kop)));
    const w = new Writer(doc, fonts, { kop });
    const img = async ids => { const out = []; for (const id of ids || []) { const r = await getImage(id); if (r) out.push(r); } return out; };

    /* ---------- Sampul ---------- */
    w.newPage();
    const pg = w.page;
    const cover = (t, y, size, font, color) => {
      const lines = w.wrap(t, font, size, CW);
      lines.forEach((ln, i) => pg.drawText(ln.words.join(' '), { x: ML, y: H - y - size - i * size * 1.22, size, font, color }));
      return y + lines.length * size * 1.22;
    };
    let cy = 135;
    cy = cover('LAPORAN', cy, 28, fonts.bold, BLUE_L);
    pg.drawRectangle({ x: ML, y: H - cy - 6, width: 56, height: 3, color: GOLD });
    cy += 8;
    cy = cover('PENDAMPINGAN ' + rep.no, cy + 6, 21, fonts.reg, INK);
    cover(sil.judul.toUpperCase(), cy + 4, 21, fonts.reg, INK);
    cy = 390;
    cy = cover('PROGRAM ' + (settings.program || 'CERMAT').toUpperCase(), cy, 36, fonts.reg, INK);
    if (settings.programKepanjangan) cy = cover(settings.programKepanjangan.toUpperCase(), cy + 4, 13.5, fonts.reg, INK);
    cy = cover('SEKOLAH SASARAN ' + (school ? school.nama : '').toUpperCase(), cy + 8, 19, fonts.reg, INK);
    let fy = fasil.length > 1 ? 650 : 680;
    fy = cover('FASILITATOR :', fy, 16, fonts.reg, INK);
    (fasil.length ? fasil : [{ nama: '-' }]).forEach((f, i) => { fy = cover(f.nama, fy + (i ? 2 : 4), 16, fonts.reg, INK); });
    if (settings.penyelenggara) {
      const t = w.clean(settings.penyelenggara.toUpperCase() + (rep.tanggal ? ' · ' + rep.tanggal.slice(0, 4) : ''));
      pg.drawText(t, { x: ML, y: 70, size: 10, font: fonts.reg, color: GREY });
    }

    /* ---------- Halaman daftar isi (diisi di akhir) ---------- */
    w.newPage();
    const tocPage = w.page;

    /* ---------- Isi ---------- */
    let n = 0;
    w.newPage();
    w.h1(++n, 'Latar Belakang');
    w.para(R.latar(rep), { first: 28 });

    w.h1(++n, 'Tujuan');
    w.para('Setelah melaksanakan pendampingan ' + rep.no + ', peserta diharapkan mampu:', { align: 'left', after: 2 });
    w.list(sil.kompetensi, { marker: 'alpha' });

    w.h1(++n, 'Indikator Keberhasilan');
    w.label('Dimensi Pengetahuan');
    w.list(sil.indikator.pengetahuan, { marker: 'alpha' });
    w.label('Dimensi Keterampilan');
    w.list(sil.indikator.keterampilan, { marker: 'alpha' });

    w.h1(++n, 'Peserta');
    w.para(R.kalimatPeserta(rep, school), { first: 28 });

    w.h1(++n, 'Pelaksanaan Pendampingan');
    w.para(R.kalimatPelaksanaan(rep, school), { first: 28 });

    w.h1(++n, 'Kondisi Awal');
    w.para(R.kondisiAwal(rep), { first: 28 });

    w.h1(++n, 'Langkah Pelaksanaan Pendampingan');
    let lastBagian = null;
    R.kegiatan(rep).forEach(k => {
      const akt = k.aktivitas.filter(a => a.aktif && (a.teks || '').trim()).map(a => a.teks.trim());
      if (!akt.length) return;
      const bag = (k.bagian || '').replace(/^Kegiatan inti$/i, 'Kegiatan Inti');
      w.ensure(bag && bag !== lastBagian ? 72 : 52);   // judul sesi tidak boleh tertinggal sendirian di bawah halaman
      if (bag && bag !== lastBagian) { w.y += 3; w.label(bag, { size: 11 }); lastBagian = bag; }
      w.para(k.sesi + (k.waktu ? ' (' + k.waktu + ')' : ''), { align: 'left', after: 1, font: fonts.ital, size: 10.5 });
      w.list(akt, { marker: 'check', x: IND + 6, size: 10.5, lh: 1.4, after: 1 });
      w.y += 3;
    });

    if (R.isObservasi(rep.no)) {
      w.h1(++n, 'Hasil Observasi dan Coaching');
      const obs = (rep.observasi || []).filter(o => (o.guru || '').trim());
      w.table([
        { t: 'No', w: 0.06, align: 'center' }, { t: 'Guru', w: 0.2 }, { t: 'Kelas', w: 0.08, align: 'center' },
        { t: 'Kekuatan', w: 0.22 }, { t: 'Area Perbaikan', w: 0.22 }, { t: 'Tindak Lanjut', w: 0.22 }
      ], obs.map((o, i) => [i + 1, o.guru, o.kelas, o.kekuatan, o.perbaikan, o.tindakLanjut]));
    }

    w.h1(++n, 'Kondisi Akhir');
    w.para(R.kondisiAkhir(rep), { first: 28 });
    const st = R.stats(rep);
    if (R.hasTes(rep.no) && st && st.pre !== null && st.post !== null) {
      w.table([
        { t: 'Rata-rata Pretes', w: 0.25, align: 'center' }, { t: 'Rata-rata Postes', w: 0.25, align: 'center' },
        { t: 'Kenaikan (poin)', w: 0.25, align: 'center' }, { t: 'Kenaikan (%)', w: 0.25, align: 'center' }
      ], [[R.fmt(st.pre) + ' (n=' + st.preN + ')', R.fmt(st.post) + ' (n=' + st.postN + ')', R.fmt(st.selisih), st.persen === null ? '-' : R.fmt(st.persen) + '%']], { size: 10 });
    }

    w.h1(++n, 'Evaluasi');
    w.h2('a', 'Permasalahan yang ditemui');
    w.para(rep.permasalahan || '-', { x: IND + 16, first: 0 });
    w.h2('b', 'Rekomendasi Fasilitator');
    w.para(rep.rekomendasi || '-', { x: IND + 16, first: 0 });

    w.h1(++n, 'Reward Peserta');
    const rwKini = R.rewardHadir(rep), rwSebelum = settings.rewardSebelum || {};
    const rwList = R.sortPeserta(R.hadirList(rep, school));
    const rwSum = rwList.reduce((a, p) => a + (rwKini[p.id] || 0), 0);
    w.para('Pada pendampingan ' + rep.no + ' ini, ' + rwList.length + ' peserta yang hadir memperoleh total ' + rwSum +
      ' bintang. Kolom total menunjukkan akumulasi bintang setiap peserta sejak pendampingan 1 sampai pendampingan ' + rep.no + '.', { first: 28 });
    if (rwList.length) {
      const jab = p => R.jabatanLabel(p) || '-';
      const rows = rwList.map((p, i) => [i + 1, p.nama, jab(p), rwKini[p.id] === undefined ? '-' : rwKini[p.id], (rwSebelum[p.id] || 0) + (rwKini[p.id] || 0)]);
      rows.push(['', 'Jumlah', '', rwSum, rwList.reduce((a, p) => a + (rwSebelum[p.id] || 0) + (rwKini[p.id] || 0), 0)]);
      w.table([{ t: 'No', w: 0.07, align: 'center' }, { t: 'Nama', w: 0.39 }, { t: 'Jabatan/Kelas', w: 0.2 },
        { t: 'Bintang P' + rep.no, w: 0.15, align: 'center' }, { t: 'Total s.d. P' + rep.no, w: 0.19, align: 'center' }], rows, { boldLastRow: true });
    }

    w.h1(++n, 'Penutup');
    w.para(R.penutup(settings), { first: 28 });

    /* ---------- Lampiran ---------- */
    const L = rep.lampiran;
    w.h1(++n, 'Lampiran', true);
    let sub = 0;
    const letter = () => String.fromCharCode(97 + sub++);

    w.h2(letter(), 'Daftar Hadir');
    if (L.hadirAuto) {
      const hadirIds = new Set(rep.hadir || []);
      const rel = R.relevantPeserta(school, rep.no, false);
      const relIds = new Set(rel.map(p => p.id));
      const daftar = R.sortPeserta(((school && school.peserta) || []).filter(p => relIds.has(p.id) || hadirIds.has(p.id)));
      const jab = p => p.jabatan === 'Guru Kelas' && p.kelas ? 'Guru Kelas ' + p.kelas : (p.jabatan || '-');
      w.para('Pendampingan ' + rep.no + ' – ' + sil.judul + ', ' + (school ? school.nama : '') + ', ' + (R.tanggalPanjang(rep.tanggal) || ''), { align: 'left', size: 10, after: 4 });
      if (R.hasTes(rep.no)) {
        const rows = daftar.map((p, i) => {
          const sk = R.skorPeserta(rep, p.nama);
          return [i + 1, p.nama, jab(p), hadirIds.has(p.id) ? 'Hadir' : 'Tidak hadir', sk.pre === null ? '-' : R.fmt(sk.pre), sk.post === null ? '-' : R.fmt(sk.post)];
        });
        if (st) rows.push(['', 'Rata-rata', '', '', R.fmt(st.pre), R.fmt(st.post)]);
        w.table([{ t: 'No', w: 0.07, align: 'center' }, { t: 'Nama', w: 0.36 }, { t: 'Jabatan/Kelas', w: 0.2 },
          { t: 'Kehadiran', w: 0.13, align: 'center' }, { t: 'Pretes', w: 0.12, align: 'center' }, { t: 'Postes', w: 0.12, align: 'center' }], rows, { boldLastRow: !!st });
      } else {
        w.table([{ t: 'No', w: 0.08, align: 'center' }, { t: 'Nama', w: 0.44 }, { t: 'Jabatan/Kelas', w: 0.28 }, { t: 'Kehadiran', w: 0.2, align: 'center' }],
          daftar.map((p, i) => [i + 1, p.nama, jab(p), hadirIds.has(p.id) ? 'Hadir' : 'Tidak hadir']));
      }
    }
    if ((L.hadirScan || []).length) await w.images(await img(L.hadirScan), { cols: 1, maxH: H - MT - MB - 40 });

    w.h2(letter(), 'Jurnal Kegiatan', true);
    if (L.jurnalAuto) {
      w.para('JURNAL KEGIATAN FASILITATOR', { align: 'center', font: fonts.bold, size: 11.5, after: 6 });
      const hadirN = R.hadirList(rep, school).length;
      w.kv([
        ['Nama Kegiatan', 'Pendampingan ke-' + rep.no + ': ' + sil.judul],
        ['Nama Fasilitator', fasil.map(f => f.nama).join(' dan ') || '-'],
        ['Lokasi', (school ? school.nama : '') + (rep.tempat && rep.tempat !== (school && school.nama) ? ' (' + rep.tempat + ')' : '')],
        ['Waktu', (R.tanggalPanjang(rep.tanggal) || '-') + (rep.jamMulai ? ', ' + rep.jamMulai + '–' + (rep.jamSelesai || '') + ' WIB' : '')],
        ['Jumlah Peserta Pendampingan', hadirN + ' orang']
      ]);
      const rows = R.kegiatan(rep).map((k, i) => {
        const akt = k.aktivitas.filter(a => a.aktif && (a.teks || '').trim()).map(a => a.teks.trim().replace(/\s*\(.*\)$/, ''));
        return [i + 1, k.sesi + ' – ' + (k.bagian || '') + ' (' + (k.waktu || '') + '): ' + akt.join('; '), (k.catatan || '').trim() || 'Terlaksana sesuai rencana'];
      });
      w.table([{ t: 'No', w: 0.06, align: 'center' }, { t: 'Sesi / Kegiatan', w: 0.64 }, { t: 'Catatan', w: 0.30 }], rows, { size: 9, lh: 1.25 });

      // ----- tanda tangan: kepala sekolah & fasilitator yang hadir -----
      const ks = settings.kepala || {};
      const cols = [{ head: 'Mengetahui,', title: 'Kepala ' + (school ? school.nama : 'Sekolah'), nama: ks.nama || '(..................................................)', nip: ks.nip }]
        .concat(fasil.map((f, i) => ({ head: '', title: fasil.length > 1 ? 'Fasilitator ' + (i + 1) : 'Fasilitator', nama: f.nama, nip: f.nip })));
      w.ensure(130);
      w.y += 10;
      const x0 = ML + IND, tw = CW - IND;
      const cw = tw / cols.length;
      const sz = 10;
      const tgl = R.tanggalPanjang(rep.tanggal);
      if (tgl) {
        const t = w.clean((settings.kota || 'Kudus') + ', ' + tgl.split(', ')[1]);
        w.page.drawText(t, { x: x0 + cw, y: H - w.y - sz, size: sz, font: fonts.reg, color: INK });
      }
      w.y += 15;
      const top = w.y;
      let maxY = top;
      cols.forEach((c, i) => {
        const x = x0 + i * cw;
        let y = top;
        const line = (t, font) => {
          w.wrap(t, font, sz, cw - 10).forEach(ln => { w.page.drawText(ln.words.join(' '), { x, y: H - y - sz, size: sz, font, color: INK }); y += sz * 1.35; });
        };
        if (c.head) line(c.head, fonts.reg); else y += sz * 1.35;
        line(c.title, fonts.reg);
        y += 48;
        line(c.nama, fonts.bold);
        if (c.nip) line('NIP. ' + c.nip, fonts.reg);
        maxY = Math.max(maxY, y);
      });
      w.y = maxY + 6;
    }
    if ((L.jurnalScan || []).length) await w.images(await img(L.jurnalScan), { cols: 1, maxH: H - MT - MB - 40 });

    const portoKeys = sil.lk.concat(Object.keys(L.portofolio || {}).filter(k => !sil.lk.includes(k)));
    const portoFilled = portoKeys.filter(k => ((L.portofolio || {})[k] || []).length);
    if (portoFilled.length) {
      w.h2(letter(), 'Portofolio Tugas', true);
      for (const k of portoFilled) {
        w.ensure(200);
        w.para(k, { x: IND + 16, font: fonts.bold, align: 'left', size: 10.5, after: 3 });
        await w.images(await img(L.portofolio[k]), { x: IND + 16, cols: 2, maxH: 330 });
      }
    }

    w.h2(letter(), 'Foto Dokumentasi Kegiatan', true);
    await w.images(await img(L.foto), { cols: 2, maxH: 230 });

    /* ---------- Daftar isi ---------- */
    {
      const p = tocPage;
      let y = MT;
      p.drawText('Daftar Isi', { x: ML, y: H - y - 17, size: 17, font: fonts.reg, color: BLUE_L });
      y += 34;
      const size = 11;
      w.toc.forEach(e => {
        const x = ML + (e.level === 1 ? 0 : IND);
        const tx = x + (e.level === 1 ? IND : 16);
        const num = String(e.page);
        const title = w.clean(e.title);
        const base = H - y - size;
        p.drawText(e.label, { x, y: base, size, font: fonts.reg, color: INK });
        p.drawText(title, { x: tx, y: base, size, font: fonts.reg, color: INK });
        const nw = fonts.reg.widthOfTextAtSize(num, size);
        p.drawText(num, { x: ML + CW - nw, y: base, size, font: fonts.reg, color: INK });
        const start = tx + fonts.reg.widthOfTextAtSize(title, size) + 4;
        const end = ML + CW - nw - 4;
        const dw = fonts.reg.widthOfTextAtSize('.', size);
        if (end > start) p.drawText('.'.repeat(Math.floor((end - start) / dw)), { x: start, y: base, size, font: fonts.reg, color: GREY });
        y += size * 1.75;
      });
    }

    /* ---------- Nomor halaman & tanda draf ---------- */
    w.pages.forEach((p, i) => {
      if (i > 0) {
        const t = String(i + 1);
        p.drawText(t, { x: W / 2 - fonts.reg.widthOfTextAtSize(t, 9.5) / 2, y: 34, size: 9.5, font: fonts.reg, color: GREY });
      }
      if (flags.draft) {
        p.drawText('DRAF', { x: 150, y: 300, size: 130, font: fonts.bold, color: rgb(0.85, 0.2, 0.2), opacity: 0.1, rotate: degrees(40) });
      }
    });

    return doc.save();
  }

  window.PdfGen = { generate };
})();
