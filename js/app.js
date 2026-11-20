/* LAPORAN CERMAT v2.7 — antarmuka (multi-pengguna, data di Google Drive lewat Apps Script). */
(function () {
  const R = window.Report, I = window.Importer;
  const app = document.getElementById('app');
  const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const JABATAN = ['', 'Kepala Sekolah', 'Guru Kelas', 'Guru Mapel', 'Tenaga Kependidikan'];
  const JABATAN_GURU = ['Guru Kelas', 'Guru Mapel', 'Tenaga Kependidikan', 'Kepala Sekolah'];
  const KELAS = ['', '1', '2', '3', '4', '5', '6'];
  const PERAN = { admin: 'Admin', fasilitator: 'Fasilitator', pemantau: 'Pemantau', kepsek: 'Kepala Sekolah' };
  const eqU = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

  const S = {
    user: null, program: {}, sekolah: [], pengguna: [], rekap: new Map(), sah: new Map(),
    local: new Map(),            // key -> { status, dirty } dari salinan lokal
    pesertaDirty: new Set(), skDirty: new Set(), delQueue: [],
    cur: null, step: 1, imp: null, impMode: 'pre', showAll: false, cal: null, open: new Set(), adding: false,
    imgCache: new Map(), kopData: null, lastRekap: 0
  };

  /* ---------- Ikon (garis, tanpa memuat dari internet) ---------- */
  const ICONS = {
    school: '<path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M10 21v-5h4v5"/><path d="M12 10h.01"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.6a6.5 6.5 0 0 1 3.5 5.4"/>',
    settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowL: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    zip: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    cloud: '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>',
    minus: '<path d="M5 12h14"/>'
  };
  const ic = (n, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
  function ring(done, total, size) {
    size = size || 54; const r = (size - 8) / 2, c = 2 * Math.PI * r, p = total ? done / total : 0;
    return `<div class="ring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#edf0f5" stroke-width="6"/>` +
      `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${p >= 1 ? '#1d8a57' : '#c8962a'}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}"/></svg><span class="t">${done}/${total}</span></div>`;
  }
  const initials = n => String(n || '?').split(',')[0].trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const emptyState = (icon, title, text, action) => `<div class="card empty">${ic(icon)}<b>${title}</b><div class="small">${text || ''}</div>${action ? '<div style="margin-top:14px">' + action + '</div>' : ''}</div>`;
  const pageHead = (title, sub, actions, crumb) => `${crumb || ''}<div class="ph"><div><h1>${title}</h1>${sub ? '<p>' + sub + '</p>' : ''}</div>${actions ? '<div class="act">' + actions + '</div>' : ''}</div>`;

  /* =========================================================
   * UTIL
   * ========================================================= */
  function toast(msg, bad, ms) {
    const d = document.createElement('div');
    d.textContent = msg; if (bad) d.className = 'bad';
    document.getElementById('toast').appendChild(d);
    setTimeout(() => d.remove(), ms || 3200);
  }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function debounceBy(fn, ms) { const t = new Map(); return (k, ...a) => { clearTimeout(t.get(k)); t.set(k, setTimeout(() => { t.delete(k); fn(k, ...a); }, ms)); }; }
  function opts(list, val, labels) { return list.map((v, i) => `<option value="${esc(v)}"${String(v) === String(val) ? ' selected' : ''}>${esc(labels ? labels[i] : (v || '—'))}</option>`).join(''); }
  const school = id => S.sekolah.find(s => s.id === id);
  const userBy = u => S.pengguna.find(x => eqU(x.username, u));
  const fasilOf = s => (s && Array.isArray(s.fasil) ? s.fasil : (s && s.fasil ? String(s.fasil).split('|').filter(Boolean) : []));
  const namaUser = u => { const x = userBy(u); return x ? x.nama : u; };
  const fasilNama = s => fasilOf(s).map(namaUser).join(' & ');
  const inFasil = (s, u) => fasilOf(s).some(x => eqU(x, u));
  const isAdmin = () => S.user && S.user.peran === 'admin';
  const isKepsek = () => S.user && S.user.peran === 'kepsek';
  const canEdit = s => !!(S.user && s && (S.user.peran === 'admin' || (S.user.peran === 'fasilitator' && inFasil(s, S.user.username))));   // data sekolah
  const canFill = s => !!(S.user && s && S.user.peran === 'fasilitator' && inFasil(s, S.user.username));   // isi laporan
  const homeHash = () => S.user && S.user.peran === 'fasilitator' ? '#/buat' : isKepsek() ? '#/pengesahan' : '#/lihat';
  const listHash = sid => (S.user && S.user.peran === 'fasilitator' ? '#/buat/' : '#/lihat/') + sid;
  const fasilUsers = () => S.pengguna.filter(u => u.aktif && u.peran === 'fasilitator');
  const clone = o => JSON.parse(JSON.stringify(o));
  const mimeOf = d => (d.match(/^data:([^;]+);/) || [])[1] || 'image/jpeg';
  function saveBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  function bytesToB64(bytes) {
    let s = ''; const ch = 0x8000;
    for (let i = 0; i < bytes.length; i += ch) s += String.fromCharCode.apply(null, bytes.subarray(i, i + ch));
    return btoa(s);
  }
  function b64ToBytes(b64) { const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  function prettyName(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    const [nm, ...rest] = s.split(',');
    let n = nm;
    if (nm === nm.toUpperCase() || nm === nm.toLowerCase()) n = nm.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    return [n].concat(rest).join(',');
  }
  function fmtWaktu(ms) { return ms ? new Date(Number(ms)).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'; }
  function compressImage(file, maxSide, quality, keepPng) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        const s = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
        const w = Math.round(im.naturalWidth * s), h = Math.round(im.naturalHeight * s);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        const png = keepPng && /png/.test(file.type);
        if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(im, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', quality));
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gambar tidak bisa dibaca: ' + file.name)); };
      im.src = url;
    });
  }
  function normalize(rep) {
    rep.lampiran = Object.assign({ hadirAuto: true, jurnalAuto: true, hadirScan: [], jurnalScan: [], portofolio: {}, foto: [] }, rep.lampiran);
    rep.teks = Object.assign({ latar: '', kondisiAwal: '', kondisiAkhir: '' }, rep.teks);
    rep.capaian = rep.capaian || {}; rep.hadir = rep.hadir || []; rep.observasi = rep.observasi || [];
    if (!rep.reward || typeof rep.reward !== 'object') rep.reward = {};
    return rep;
  }
  const stripLocal = rep => { const o = {}; Object.keys(rep).forEach(k => { if (k[0] !== '_') o[k] = rep[k]; }); return o; };
  const allImageIds = rep => { const L = rep.lampiran || {}; return [].concat(L.hadirScan || [], L.jurnalScan || [], L.foto || [], ...Object.values(L.portofolio || {})); };
  const hasTmp = rep => allImageIds(rep).some(id => String(id).startsWith('tmp_'));

  /* =========================================================
   * CACHE LOKAL & STATUS
   * ========================================================= */
  const kvSet = (k, v) => DB.put('kv', v, k);
  const cacheBoot = debounce(() => {
    if (!S.user) return;
    const peserta = [];
    S.sekolah.forEach(s => (s.peserta || []).forEach(p => peserta.push(Object.assign({ sekolahId: s.id }, p))));
    kvSet('boot', { user: S.user, program: S.program, sekolah: S.sekolah.map(s => { const o = Object.assign({}, s); delete o.peserta; return o; }), peserta, pengguna: S.pengguna, rekap: [...S.rekap.values()], pengesahan: [].concat(...S.sah.values()) });
  }, 500);

  /* Kepala sekolah otomatis tercatat sebagai peserta (untuk daftar hadir). */
  function syncKs(s) {
    s.peserta = s.peserta || [];
    const id = 'ks_' + s.id;
    const i = s.peserta.findIndex(p => p.id === id);
    const nm = String(s.ksNama || '').trim();
    if (nm) {
      if (i < 0) { s.peserta.unshift({ id, nama: nm, jabatan: 'Kepala Sekolah', kelas: '' }); return true; }
      if (s.peserta[i].nama !== nm || s.peserta[i].jabatan !== 'Kepala Sekolah') { s.peserta[i].nama = nm; s.peserta[i].jabatan = 'Kepala Sekolah'; s.peserta[i].kelas = ''; return true; }
    } else if (i >= 0) { s.peserta.splice(i, 1); return true; }
    return false;
  }

  function applyBoot(b) {
    const prev = new Map(S.sekolah.map(s => [s.id, s.peserta]));
    const prevSk = new Map(S.sekolah.map(s => [s.id, s]));
    S.user = b.user; S.program = b.program || {}; S.pengguna = b.pengguna || [];
    S.sekolah = (b.sekolah || []).map(s => Object.assign({}, s, {
      fasil: fasilOf(s),
      peserta: S.pesertaDirty.has(s.id) && prev.get(s.id) ? prev.get(s.id) : (b.peserta || []).filter(p => p.sekolahId === s.id).map(p => ({ id: p.id, nama: p.nama, jabatan: p.jabatan, kelas: p.kelas }))
    }));
    S.sekolah.forEach(s => {
      const old = prevSk.get(s.id);   // isian yang belum sempat tersimpan tidak boleh tertimpa
      if (old && S.skDirty.has(s.id)) ['nama', 'ksNama', 'ksNip', 'fasil', 'alias'].forEach(k => { s[k] = old[k]; });
      if (syncKs(s) && canEdit(s)) S.pesertaDirty.add(s.id);
    });
    S.rekap = new Map((b.rekap || []).map(r => [r.key, r]));
    S.sah = new Map();
    (b.pengesahan || []).forEach(r => { if (!S.sah.has(r.key)) S.sah.set(r.key, []); S.sah.get(r.key).push(r); });
  }

  async function loadLocalStatus() {
    S.local = new Map();
    for (const r of await DB.all('reports')) {
      const s = school(r.sekolahId);
      if (s && r._dirty) S.local.set(r.key, { status: R.status(normalize(r), s), dirty: true, reward: R.rewardHadir(r) });
    }
  }
  /* Status isi laporan (semua bagian wajib terisi atau belum). */
  function contentOf(sid, no) {
    const key = R.key(sid, no);
    const l = S.local.get(key);
    if (l && l.dirty) return l.status;
    const r = S.rekap.get(key);
    return r ? (r.status === 'lengkap' ? 'lengkap' : 'draf') : 'kosong';
  }
  /* Pengesahan: Fasilitator 1 & 2 (masing-masing) lalu Kepala Sekolah. */
  function sahState(sid, no) {
    const s = school(sid), key = R.key(sid, no);
    const list = S.sah.get(key) || [];
    const fasil = fasilOf(s).map((u, i) => ({ u, i, rec: list.find(r => r.peran === 'fasil' && eqU(r.username, u)) || null }));
    const ks = list.find(r => r.peran === 'ks') || null;
    const allFasil = fasil.length > 0 && fasil.every(f => f.rec);
    return { list, fasil, ks, allFasil, done: allFasil && !!ks, any: list.length > 0 };
  }
  /* Status akhir: kosong | draf | tunggu (isi lengkap, menunggu pengesahan) | lengkap (isi lengkap & sudah disahkan). */
  function statusOf(sid, no) {
    const c = contentOf(sid, no);
    if (c !== 'lengkap') return c;
    const l = S.local.get(R.key(sid, no));
    if (l && l.dirty) return 'tunggu';
    return sahState(sid, no).done ? 'lengkap' : 'tunggu';
  }
  const stLabel = st => ({ kosong: 'belum', draf: 'draf', tunggu: 'menunggu pengesahan', lengkap: 'lengkap' }[st] || st);
  const kepsekOf = s => S.pengguna.filter(u => u.peran === 'kepsek' && u.aktif && s && u.sekolahId === s.id);
  const lastSahAt = key => (S.sah.get(key) || []).reduce((a, r) => Math.max(a, r.waktu || 0), 0);
  const doneOf = sid => window.SILABUS.filter(p => statusOf(sid, p.no) === 'lengkap').length;
  /* Bintang per peserta (hanya yang hadir) pada satu laporan: salinan lokal yang belum terkirim didahulukan. */
  function rewardOf(sid, no) {
    const key = R.key(sid, no);
    if (S.cur && S.cur.key === key) return R.rewardHadir(S.cur);
    const l = S.local.get(key);
    if (l && l.dirty && l.reward) return l.reward;
    const r = S.rekap.get(key);
    return (r && r.reward) || {};
  }
  /* Total bintang per peserta dari P1 sampai P(upto). */
  function rewardTotals(sid, upto) {
    const tot = {};
    for (let no = 1; no <= (upto === undefined ? 22 : upto); no++) {
      const r = rewardOf(sid, no);
      Object.keys(r).forEach(id => { tot[id] = (tot[id] || 0) + (Number(r[id]) || 0); });
    }
    return tot;
  }
  const hasReports = sid => window.SILABUS.some(p => statusOf(sid, p.no) !== 'kosong');

  /* Perbarui data dari Drive (sekolah, kepala sekolah, guru, pengguna, status laporan) — satu panggilan. */
  async function refreshRekap(force) {
    if (Date.now() - S.lastRekap < (force ? 5000 : 20000)) return false;
    try {
      S.lastRekap = Date.now();
      const b = await API.call('bootstrap');
      applyBoot(b); await kvSet('boot', b); cacheBoot();
      return true;
    } catch (e) { return false; }
  }

  /* =========================================================
   * GAMBAR
   * ========================================================= */
  async function fetchImages(ids) {
    const need = [];
    for (const id of ids) {
      if (S.imgCache.has(id)) continue;
      const r = await DB.get('images', id);
      if (r) S.imgCache.set(id, r); else if (!String(id).startsWith('tmp_')) need.push(id);
    }
    for (let i = 0; i < need.length; i += 8) {
      const res = await API.call('getImages', { ids: need.slice(i, i + 8) });
      for (const id of Object.keys(res)) {
        if (!res[id]) continue;
        const rec = { id, data: 'data:' + res[id].mime + ';base64,' + res[id].b64 };
        S.imgCache.set(id, rec); await DB.put('images', rec);
      }
    }
  }
  async function getImageRec(id) {
    if (S.imgCache.has(id)) return S.imgCache.get(id);
    await fetchImages([id]);
    return S.imgCache.get(id) || null;
  }
  async function ensureKop() {
    S.kopData = null;
    if (!S.program.kopId) return;
    try { const r = await getImageRec(S.program.kopId); S.kopData = r ? r.data : null; } catch (e) { /* tanpa kop */ }
  }
  function pdfSettings(s, rep) {
    const fasil = R.fasilHadir(rep, s).map(u => { const x = userBy(u); return { username: u, nama: x ? x.nama : u, nip: x ? x.nip : '' }; });
    const st = sahState(s.id, rep.no);
    const fs = st.fasil.length > 1;
    const ksAcc = kepsekOf(s)[0];
    const sah = {
      verifyBase: new URL('verifikasi.html', location.href.split('#')[0]).href,
      fasil: st.fasil.map(f => { const x = userBy(f.u); return { title: fs ? 'Fasilitator ' + (f.i + 1) : 'Fasilitator', username: f.u,
        nama: f.rec ? f.rec.nama : (x ? x.nama : f.u), nip: f.rec ? f.rec.nip : (x ? x.nip : ''), rec: f.rec }; }),
      ks: { title: 'Kepala ' + s.nama, nama: st.ks ? st.ks.nama : (ksAcc ? ksAcc.nama : s.ksNama), nip: st.ks ? st.ks.nip : (ksAcc ? ksAcc.nip : s.ksNip), rec: st.ks }
    };
    return Object.assign({}, S.program, { fasilitator: fasil, kepala: { nama: s.ksNama, nip: s.ksNip }, kop: S.kopData, rewardSebelum: rewardTotals(s.id, rep.no - 1), sah });
  }

  /* =========================================================
   * SINKRONISASI
   * ========================================================= */
  const persistCur = debounce(() => { if (S.cur && S.cur._dirty) DB.put('reports', clone(S.cur), S.cur.key); }, 300);
  async function flushCur() { if (S.cur && S.cur._dirty) await DB.put('reports', clone(S.cur), S.cur.key); }

  function touch() {
    const r = S.cur; if (!r) return;
    r._rev = (r._rev || 0) + 1; r._dirty = true; r.updatedAt = Date.now();
    S.local.set(r.key, { status: R.status(r, school(r.sekolahId)), dirty: true, reward: R.rewardHadir(r) });
    persistCur(); Sync.schedule(); refreshStepDots();
  }

  const Sync = {
    busy: false, again: false, state: 'ok', msg: '', timer: null,
    schedule(ms) { clearTimeout(this.timer); this.timer = setTimeout(() => this.run(), ms === undefined ? 2500 : ms); setSync(this.busy ? 'busy' : 'wait'); },
    async count() {
      const p = (await DB.all('pending')).length;
      const reps = (await DB.all('reports')).filter(r => r._dirty).length;
      return p + reps + S.pesertaDirty.size + S.delQueue.length;
    },
    async run() {
      if (!S.user) return;
      if (this.busy) { this.again = true; return; }
      this.busy = true; setSync('busy');
      try {
        await flushCur();
        for (const p of await DB.all('pending')) {
          const img = await DB.get('images', p.tmpId);
          if (!img) { await DB.del('pending', p.id); continue; }
          const r = await API.call('uploadImage', { key: p.key, b64: img.data.split(',')[1], mime: mimeOf(img.data), nama: p.nama, jenis: p.jenis, judul: p.judul });
          const rec = { id: r.id, data: img.data };
          await DB.put('images', rec); S.imgCache.set(r.id, rec);
          await replaceTmp(p.key, p.tmpId, r.id);
          await DB.del('images', p.tmpId); S.imgCache.delete(p.tmpId);
          await DB.del('pending', p.id);
        }
        while (S.delQueue.length) {
          try { await API.call('deleteImage', { id: S.delQueue[0] }); } catch (e) { if (e.offline) throw e; }
          S.delQueue.shift(); await kvSet('delQueue', S.delQueue);
        }
        for (const sid of [...S.pesertaDirty]) {
          const s = school(sid);
          try { if (s) await API.call('savePeserta', { sekolahId: sid, peserta: s.peserta || [] }); }
          catch (e) { if (e.offline || e.code === 'AUTH') throw e; toast('Peserta ' + (s ? s.nama : '') + ': ' + e.message, true, 5000); }
          S.pesertaDirty.delete(sid); await kvSet('pesertaDirty', [...S.pesertaDirty]);
        }
        for (const rep of (await DB.all('reports')).filter(r => r._dirty && !r._conflict)) {
          if (hasTmp(rep)) continue;
          await pushReport(rep);
        }
        setSync('ok');
      } catch (e) {
        if (e.offline) setSync('offline');
        else if (e.code !== 'AUTH') { setSync('error', e.message); console.error(e); }
      }
      this.busy = false;
      if (this.again) { this.again = false; this.schedule(300); }
      else if (this.state === 'offline' || this.state === 'error') { clearTimeout(this.timer); this.timer = setTimeout(() => this.run(), 30000); }
    }
  };

  async function pushReport(rep) {
    const s = school(rep.sekolahId);
    if (!s) return;
    normalize(rep);
    const sentRev = rep._rev;
    const st = R.stats(rep);
    const meta = { status: R.status(rep, s), judul: R.sil(rep.no).judul, tanggal: rep.tanggal,
      rataPre: st && st.pre !== null ? Math.round(st.pre * 100) / 100 : null, rataPost: st && st.post !== null ? Math.round(st.post * 100) / 100 : null };
    let res;
    try {
      res = await API.call('saveReport', { report: stripLocal(rep), baseVersion: rep._version || 0, force: !!rep._force, meta });
    } catch (e) {
      if (e.code === 'CONFLICT') {
        const c = { by: e.extra.updatedBy, at: e.extra.updatedAt, version: e.extra.version };
        const latest = await DB.get('reports', rep.key) || rep; latest._conflict = c; await DB.put('reports', latest, rep.key);
        if (S.cur && S.cur.key === rep.key) { S.cur._conflict = c; if (location.hash.startsWith('#/laporan/')) rerenderStep(); }
        toast('Laporan ' + s.nama + ' P' + rep.no + ' bentrok dengan perubahan ' + (c.by || 'pengguna lain') + '. Buka laporannya untuk memilih versi.', true, 7000);
        return;
      }
      if (e.code === 'FORBIDDEN' || e.code === 'NOTFOUND' || e.code === 'BAD') {
        const latest = await DB.get('reports', rep.key) || rep; latest._dirty = false; await DB.put('reports', latest, rep.key);
        if (S.cur && S.cur.key === rep.key) S.cur._dirty = false;
        S.local.delete(rep.key);
        toast(e.message, true, 6000);
        return;
      }
      throw e;
    }
    const apply = r => { r._version = res.version; r._force = false; r._conflict = null; if (r._rev === sentRev) r._dirty = false; };
    const latest = await DB.get('reports', rep.key);
    if (latest) { apply(latest); await DB.put('reports', latest, rep.key); }
    if (S.cur && S.cur.key === rep.key) apply(S.cur);
    const prev = S.rekap.get(rep.key) || {};
    S.rekap.set(rep.key, Object.assign({}, prev, { key: rep.key, sekolahId: rep.sekolahId, no: rep.no, status: meta.status, tanggal: meta.tanggal,
      updatedAt: res.updatedAt, updatedBy: res.updatedBy, version: res.version, reward: R.rewardHadir(rep) }));
    if (!(latest && latest._dirty)) S.local.delete(rep.key);
    cacheBoot();
  }

  async function replaceTmp(key, tmp, real) {
    const fix = rep => {
      if (!rep) return false;
      let ch = false;
      const L = rep.lampiran || {};
      const swap = a => { if (!a) return; const i = a.indexOf(tmp); if (i >= 0) { a[i] = real; ch = true; } };
      swap(L.hadirScan); swap(L.jurnalScan); swap(L.foto);
      Object.values(L.portofolio || {}).forEach(swap);
      return ch;
    };
    if (S.cur && S.cur.key === key && fix(S.cur)) { S.cur._dirty = true; S.cur._rev = (S.cur._rev || 0) + 1; await DB.put('reports', clone(S.cur), key); }
    else {
      const r = await DB.get('reports', key);
      if (fix(r)) { r._dirty = true; r._rev = (r._rev || 0) + 1; await DB.put('reports', r, key); }
    }
    document.querySelectorAll(`img[data-img="${tmp}"]`).forEach(im => { im.dataset.img = real; });
    document.querySelectorAll(`[data-act="img-del"][data-id="${tmp}"]`).forEach(b => { b.dataset.id = real; });
  }

  async function setSync(state, msg) {
    if (state !== 'wait') { Sync.state = state; Sync.msg = msg || ''; }
    const el = document.getElementById('syncind');
    const dots = document.querySelectorAll('.sd');
    if (!el && !dots.length) return;
    const n = await Sync.count();
    let t, c;
    if (state === 'busy') { t = 'Menyimpan ke Google Drive…'; c = 'busy'; }
    else if (state === 'wait' || (state === 'ok' && n)) { t = n ? n + ' perubahan menunggu dikirim' : 'Akan disimpan…'; c = 'wait'; }
    else if (state === 'offline') { t = 'Offline' + (n ? ' · ' + n + ' perubahan menunggu' : ''); c = 'bad'; }
    else if (state === 'error') { t = 'Gagal sinkron' + (msg ? ': ' + msg : ''); c = 'bad'; }
    else { t = 'Tersinkron dengan Google Drive'; c = 'ok'; }
    if (el) el.textContent = t;
    dots.forEach(d => { d.className = 'sd ' + c; });
    const av = document.getElementById('avbtn'); if (av) av.title = t;
  }

  /* =========================================================
   * LOGIN / BOOT
   * ========================================================= */
  function renderConfigMissing() {
    document.body.classList.add('auth');
    const cfg = window.CERMAT_CONFIG;
    const why = !cfg
      ? '<b>File <code>js/config.js</code> tidak terbaca karena ada salah tulis.</b> Paling sering: URL tidak diapit petik satu. Contoh yang benar:<br><code>API_URL: \'https://script.google.com/macros/s/AKfy…/exec\'</code>'
      : !/^https?:\/\//.test(String(cfg.API_URL || '').trim())
        ? `<b>API_URL belum diisi dengan benar.</b> Terbaca: <code>${esc(cfg.API_URL || '(kosong)')}</code>. Harus diawali <code>https://</code> dan berakhiran <code>/exec</code>.`
        : '';
    app.innerHTML = `<div class="auth-wrap"><div class="auth-side"><div><div class="logo-card"><img src="icons/logo-cermat.png" alt="Logo CERMAT"></div></div></div>
      <div class="auth-main"><div class="auth-form"><img class="mlogo" src="icons/logo-cermat.png" alt="Logo CERMAT">
      <h1>Belum terhubung ke server</h1><div class="banner warn small">${ic('alert')}<div>${why}</div></div>
      <p class="small muted">Perbaiki <code>js/config.js</code> di GitHub, tunggu build selesai, lalu muat ulang halaman ini. Panduan: <b>PANDUAN-DEPLOY.md</b>.</p></div></div></div>`;
  }

  function renderLogin(msg) {
    document.body.classList.add('auth');
    setNav();
    app.innerHTML = `<div class="auth-wrap">
      <div class="auth-side">
        <div><div class="logo-card"><img src="icons/logo-cermat.png" alt="Logo CERMAT"></div>
          <h2>Pelaporan Pendampingan CERMAT</h2>
          <p>Susun laporan 22 pendampingan Cerdas Numerasi dan Matematika Terapan secara rapi, cepat, dan seragam — langsung jadi PDF.</p>
          <p class="motto">“Bernalar Tepat, Melangkah Hebat.”</p></div>
        <div class="foot">${esc(S.program.penyelenggara || 'Pusat Belajar Guru Kudus')}</div>
      </div>
      <div class="auth-main"><form class="auth-form" id="loginForm">
        <img class="mlogo" src="icons/logo-cermat.png" alt="Logo CERMAT">
        <h1>Selamat datang</h1><p class="muted" style="margin:0 0 22px">Masuk dengan akun yang diberikan admin.</p>
        <label class="f" for="lu">Username</label><div class="field-ic">${ic('user')}<input type="text" id="lu" autocomplete="username" required></div>
        <label class="f" for="lp" style="margin-top:14px">Password</label><div class="field-ic">${ic('lock')}<input type="password" id="lp" autocomplete="current-password" required></div>
        ${msg ? `<div class="banner bad small" style="margin:14px 0 0">${ic('alert')}<div>${esc(msg)}</div></div>` : ''}
        <button class="btn pri block" style="margin-top:20px;height:46px" id="lb">Masuk</button>
        <p class="tiny muted" style="margin-top:18px;text-align:center">Lupa password? Hubungi admin program.</p>
        <p class="small" style="margin-top:6px;text-align:center"><a href="../cermat/">${ic('arrowL')} Kembali ke Pustaka CERMAT</a></p>
      </form></div></div>`;
    document.getElementById('lu').focus();
    document.getElementById('loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const b = document.getElementById('lb'); b.disabled = true; b.innerHTML = '<span class="spin"></span> Memeriksa…';
      try {
        const r = await API.call('login', { username: document.getElementById('lu').value, password: document.getElementById('lp').value });
        API.token = r.token; localStorage.setItem('cermat_token', r.token);
        S.user = r.user;
        await boot(true);
      } catch (er) { renderLogin(er.message); }
    });
  }

  async function boot(fresh) {
    S.pesertaDirty = new Set((await DB.get('kv', 'pesertaDirty')) || []);
    S.delQueue = (await DB.get('kv', 'delQueue')) || [];
    const prevBoot = await DB.get('kv', 'boot');
    if (fresh && prevBoot && S.user && !eqU(prevBoot.user.username, S.user.username)) { await DB.wipe(); S.pesertaDirty = new Set(); S.delQueue = []; }
    const cached = fresh ? null : prevBoot;
    if (cached) { applyBoot(cached); await loadLocalStatus(); document.body.classList.remove('auth'); setNav(); }
    else app.innerHTML = '<div class="loading"><span class="spin"></span> Memuat data…</div>';
    try {
      const b = await API.call('bootstrap');
      if (cached && !eqU(cached.user.username, b.user.username)) { await DB.wipe(); S.pesertaDirty = new Set(); S.delQueue = []; }
      applyBoot(b); S.lastRekap = Date.now();
      await kvSet('boot', b);
      cacheBoot();
    } catch (e) {
      if (e.code === 'AUTH') return;
      if (!cached) { app.innerHTML = `<div class="card empty" style="margin-top:40px">${ic('cloud')}<b>Tidak bisa terhubung</b><div class="small">${esc(e.message)}</div><div style="margin-top:14px"><button class="btn pri" onclick="location.reload()">Coba lagi</button></div></div>`; return; }
      toast('Offline — menampilkan data tersimpan di perangkat ini.', true, 5000);
      setSync('offline');
    }
    await loadLocalStatus();
    document.body.classList.remove('auth');
    setNav();
    if (!location.hash || location.hash === '#/' || location.hash === '#/login') location.hash = homeHash();
    route();
    Sync.run();
  }

  API.onAuthLost = () => {
    if (!S.user && !API.token) return;
    API.token = null; localStorage.removeItem('cermat_token'); S.user = null;
    renderLogin('Sesi berakhir. Silakan masuk lagi.');
  };

  async function logout() {
    const n = await Sync.count();
    if (n && !confirm(`Masih ada ${n} perubahan yang belum terkirim ke Drive dan akan hilang. Tetap keluar?`)) return;
    try { await API.call('logout'); } catch (e) { /* abaikan */ }
    API.token = null; localStorage.removeItem('cermat_token');
    await DB.wipe(); S.user = null; S.cur = null; S.imgCache.clear();
    location.hash = '#/';
    renderLogin();
  }

  /* =========================================================
   * NAVIGASI
   * ========================================================= */
  function navItems() {
    const u = S.user; if (!u) return [];
    const rw = ['reward', 'Total Reward', 'star'];
    if (u.peran === 'admin') return [['pengguna', 'Kelola Pengguna', 'users'], ['sekolah', 'Data Sekolah', 'school'], ['lihat', 'Lihat Laporan', 'eye'], ['unduh', 'Unduh Laporan', 'download'], rw];
    if (u.peran === 'fasilitator') return [['sekolah', 'Data Sekolah', 'school'], ['buat', 'Buat Laporan', 'edit'], ['unduh', 'Unduh Laporan', 'download'], rw];
    if (u.peran === 'kepsek') return [['pengesahan', 'Pengesahan', 'check'], ['lihat', 'Laporan Sekolah', 'file', 'Laporan'], ['unduh', 'Unduh Laporan', 'download'], rw];
    return [['sekolah', 'Data Sekolah', 'school'], ['lihat', 'Lihat Laporan', 'eye'], ['unduh', 'Unduh Laporan', 'download'], rw];
  }
  function setNav() {
    const nav = document.getElementById('nav'), usr = document.getElementById('usr'), tab = document.getElementById('tabbar');
    const u = S.user;
    if (!u) { nav.innerHTML = ''; usr.innerHTML = ''; tab.innerHTML = ''; return; }
    const items = navItems();
    nav.innerHTML = items.map(([k, l, i]) => `<a href="#/${k}" data-nav="${k}">${ic(i)}<span>${l}</span></a>`).join('');
    tab.innerHTML = items.map(([k, l, i, sh]) => `<a href="#/${k}" data-nav="${k}">${ic(i, 'lg')}<span>${sh || l.replace(' Laporan', '').replace('Kelola ', '').replace('Total ', '')}</span></a>`).join('');
    usr.innerHTML = `<button class="avatar" id="avbtn" data-menu="1" aria-haspopup="true">
        <span class="nm"><b>${esc(u.nama.split(',')[0])}</b><span>${PERAN[u.peran]}</span></span>
        <span class="bubble">${esc(initials(u.nama))}<span class="sd ok"></span></span></button>
      <div class="menu" id="umenu">
        <div class="mhd"><b>${esc(u.nama)}</b><span>${esc(u.username)} · ${PERAN[u.peran]}</span></div>
        <div class="sync"><span class="sd ok"></span><span id="syncind">Tersinkron dengan Google Drive</span></div>
        <div class="sep"></div>
        ${u.peran === 'admin' ? `<a href="#/program">${ic('settings')}Pengaturan Program</a><div class="sep"></div>` : ''}
        <a href="#/akun">${ic('user')}Profil Saya</a>
        <a href="#/akun#pw">${ic('lock')}Ganti Password</a>
        <div class="sep"></div>
        <button data-act="logout">${ic('logout')}Keluar</button>
      </div>`;
    setSync(Sync.state);
  }
  document.addEventListener('click', e => {
    const m = document.getElementById('umenu'); if (!m) return;
    if (e.target.closest('[data-menu]')) { m.classList.toggle('open'); return; }
    if (e.target.closest('#umenu [data-act="logout"]')) { m.classList.remove('open'); logout(); return; }
    if (!e.target.closest('#umenu') || e.target.closest('#umenu a')) m.classList.remove('open');
  });

  async function route() {
    if (!API.configured()) return renderConfigMissing();
    if (!S.user) return renderLogin();
    document.body.classList.remove('auth');
    const h = location.hash.replace(/^#\/?/, '');
    const parts = h.split(/[/#]/);
    const top = parts[0] === 'laporan' ? (S.user.peran === 'fasilitator' ? 'buat' : 'lihat') : parts[0];
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === top));
    document.body.classList.toggle('editing', parts[0] === 'laporan');
    window.scrollTo(0, 0);
    if (parts[0] !== 'laporan') { await flushCur(); S.cur = null; }
    switch (parts[0]) {
      case 'sekolah': if (isKepsek()) { location.hash = homeHash(); return; } renderSekolah(); if (await refreshRekap()) { if (location.hash === '#/sekolah' && !document.activeElement.matches('input,textarea,select')) renderSekolah(); } return;
      case 'buat': return S.user.peran !== 'fasilitator' ? (location.hash = '#/lihat') : parts[1] ? renderPilihP(parts[1]) : renderBuat();
      case 'lihat': if (isKepsek() && !parts[1]) { location.hash = '#/lihat/' + (S.user.sekolahId || ''); return; } return parts[1] ? renderPilihP(parts[1]) : renderLihat();
      case 'pengesahan': return isKepsek() ? renderPengesahan() : (location.hash = homeHash());
      case 'laporan': return openReport(parts[1], parseInt(parts[2], 10), parseInt(parts[3] || '1', 10));
      case 'unduh': return renderUnduh();
      case 'reward': return renderReward();
      case 'pengguna': return isAdmin() ? renderPengguna() : (location.hash = homeHash());
      case 'program': return isAdmin() ? renderProgram() : (location.hash = homeHash());
      case 'akun': return renderAkun();
      default: location.hash = homeHash();
    }
  }

  /* =========================================================
   * MENU 1 — DATA SEKOLAH
   * ========================================================= */
  function fasilChips(s) {
    const f = fasilOf(s);
    if (!f.length) return '<span class="muted">Fasilitator belum ditentukan</span>';
    return f.map(u => `<span class="fasil-chip"><i>${esc(initials(namaUser(u)))}</i>${esc(namaUser(u).split(',')[0])}</span>`).join(' ');
  }

  function renderSekolah() {
    const u = S.user, adm = isAdmin();
    const mine = adm ? S.sekolah : S.sekolah.filter(s => canEdit(s));
    const other = adm ? [] : S.sekolah.filter(s => !canEdit(s));
    const sub = adm ? 'Daftarkan sekolah binaan dan pasangkan Fasilitator 1 & 2. Kepala sekolah & data guru dilengkapi oleh fasilitator.'
      : u.peran === 'fasilitator' ? 'Lengkapi kepala sekolah dan data guru sekolah binaan Anda. Data ini dipakai otomatis di laporan.' : 'Daftar sekolah binaan program.';
    let h = pageHead('Data Sekolah', sub, adm ? `<button class="btn pri" data-act="sk-new">${ic('plus')}Tambah sekolah</button>` : '');
    if (adm && S.adding) h += addSchoolForm();
    if (u.peran !== 'pemantau') {
      if (!adm) h += `<div class="sec"><h2>Sekolah binaan saya</h2></div>`;
      h += mine.length ? mine.map(s => sekolahCard(s)).join('') :
        adm ? (S.adding ? '' : emptyState('school', 'Belum ada sekolah binaan', 'Tambahkan sekolah binaan program, lalu pasangkan fasilitatornya.', `<button class="btn pri" data-act="sk-new">${ic('plus')}Tambah sekolah pertama</button>`))
          : emptyState('school', 'Anda belum ditugaskan ke sekolah', 'Admin mendaftarkan sekolah binaan dan memasangkan fasilitatornya. Hubungi admin program.');
    }
    const list = u.peran === 'pemantau' ? S.sekolah : other;
    if (list.length) {
      h += `<div class="sec"><h2>${u.peran === 'pemantau' ? 'Sekolah binaan' : 'Sekolah fasilitator lain'}</h2></div>
        <div class="card" style="padding:0;overflow:hidden"><div style="overflow-x:auto"><table class="tb"><thead><tr><th>Sekolah</th><th>Kepala sekolah</th><th>Fasilitator</th><th>Guru</th><th>Laporan</th></tr></thead><tbody>
        ${list.map(s => `<tr><td><b>${esc(s.nama)}</b></td><td>${esc(s.ksNama || '-')}</td><td>${esc(fasilNama(s) || '-')}</td>
          <td>${(s.peserta || []).filter(p => p.id !== 'ks_' + s.id).length}</td><td><span class="pill ${doneOf(s.id) === 22 ? 'lengkap' : doneOf(s.id) ? 'draf' : 'kosong'}">${doneOf(s.id)}/22</span></td></tr>`).join('')}
        </tbody></table></div></div>`;
    }
    app.innerHTML = h;
    const nm = document.getElementById('ns-nama'); if (nm) nm.focus();
  }

  function addSchoolForm() {
    const cand = fasilUsers();
    const lbl = u => u.nama + ' (' + u.username + ')';
    const sel = (id, empty) => `<select id="${id}">${opts([''].concat(cand.map(u => u.username)), '', [empty].concat(cand.map(lbl)))}</select>`;
    return `<div class="card" style="border-color:var(--navy-line)"><div class="card-h">${ic('plus')}<h3>Tambah sekolah binaan</h3><span class="spacer"></span><button class="btn sm ghost" data-act="sk-cancel">${ic('x')}Batal</button></div>
      <div class="fields">
        <div><label class="f">Nama sekolah *</label><input type="text" id="ns-nama" placeholder="mis. SD 3 Terban"></div>
        <div><label class="f">Fasilitator 1</label>${sel('ns-f1', '— pilih —')}</div>
        <div><label class="f">Fasilitator 2</label>${sel('ns-f2', '— belum ada —')}</div>
      </div>
      ${cand.length ? '' : `<p class="small muted">Belum ada akun fasilitator. Tambahkan dulu di <a href="#/pengguna">Kelola Pengguna</a>.</p>`}
      <div class="row" style="margin-top:14px"><button class="btn pri" data-act="sk-add">${ic('check')}Simpan sekolah</button></div></div>`;
  }

  function sekolahCard(s) {
    const adm = isAdmin();
    const isMine = inFasil(s, S.user.username);
    const guru = R.sortPeserta((s.peserta || []).filter(p => p.id !== 'ks_' + s.id));
    const done = doneOf(s.id);
    const open = S.open.has(s.id) || (!adm && S.sekolah.filter(x => canEdit(x)).length <= 2);
    const f = fasilOf(s);
    const cand = fasilUsers();
    const lbl = u => u.nama + ' (' + u.username + ')';
    const fasilField = adm
      ? [0, 1].map(i => `<div><label class="f">Fasilitator ${i + 1}</label><select data-fs="${i}" data-sid="${s.id}">${opts([''].concat(cand.map(u => u.username)), f[i] || '', [i ? '— belum ada —' : '— pilih —'].concat(cand.map(lbl)))}</select></div>`).join('')
      : [0, 1].map(i => `<div><label class="f">Fasilitator ${i + 1}</label><div class="ro-val">${esc(f[i] ? namaUser(f[i]) : '—')}${f[i] && eqU(f[i], S.user.username) ? ' <span class="pill gold">Anda</span>' : ''}</div></div>`).join('');
    return `<details class="card skc${isMine ? ' mine' : ''}" data-sk-card="${s.id}"${open ? ' open' : ''}>
      <summary>${ring(done, 22, 54)}
        <div class="ttl"><h3>${esc(s.nama)}</h3><div class="meta"><span>${ic('user')} ${esc(s.ksNama || 'Kepala sekolah belum diisi')}</span><span>${ic('users')} ${guru.length} guru</span></div>
        <div style="margin-top:6px">${fasilChips(s)}</div></div>
        ${!s.ksNama ? '<span class="pill draf">Lengkapi data</span>' : ''}${ic('chevron', 'lg chev')}</summary>
      <div class="body">
        <div class="fields">
          ${adm ? `<div><label class="f">Nama sekolah</label><input type="text" data-sk="nama" data-sid="${s.id}" value="${esc(s.nama)}"></div>`
                : `<div><label class="f">Nama sekolah</label><div class="ro-val">${esc(s.nama)}</div></div>`}
          ${fasilField}
        </div>
        <div class="fields two" style="margin-top:14px">
          <div><label class="f">Kepala sekolah (nama & gelar)</label><input type="text" data-sk="ksNama" data-sid="${s.id}" value="${esc(s.ksNama)}" placeholder="mis. Siti Aminah, S.Pd."></div>
          <div><label class="f">NIP kepala sekolah</label><input type="text" data-sk="ksNip" data-sid="${s.id}" value="${esc(s.ksNip)}" placeholder="mis. 19750312 200012 2 003" inputmode="numeric"></div>
        </div>
        <div class="subhead">${ic('users')}<h4>Data guru (${guru.length})</h4><span class="spacer"></span>
          <button class="btn sm ghost" data-act="paste-toggle" data-sid="${s.id}">Tempel daftar sekaligus</button></div>
        ${guru.length ? `<div class="tbwrap"><table class="tb"><thead><tr><th style="width:46%">Nama (dengan gelar)</th><th>Jabatan</th><th style="width:96px">Kelas</th><th style="width:44px"></th></tr></thead><tbody>
          ${guru.map(p => `<tr><td><input type="text" data-pn="${s.id}|${p.id}" value="${esc(p.nama)}"></td>
            <td><select data-pj="${s.id}|${p.id}|jabatan">${opts(JABATAN, p.jabatan, ['— jabatan —'].concat(JABATAN.slice(1)))}</select></td>
            <td><select data-pj="${s.id}|${p.id}|kelas"${p.jabatan === 'Guru Kelas' ? '' : ' disabled'}>${opts(KELAS, p.kelas, ['–', '1', '2', '3', '4', '5', '6'])}</select></td>
            <td><button class="iconbtn" data-act="del-peserta" data-sid="${s.id}" data-id="${p.id}" title="Hapus">${ic('trash')}</button></td></tr>`).join('')}
          </tbody></table></div>` : '<p class="small muted" style="margin:0 0 6px">Belum ada guru. Tambahkan di bawah, tempel daftar, atau unggah pretes — nama guru terbentuk otomatis.</p>'}
        <div class="addrow"><input type="text" id="ng-nama-${s.id}" placeholder="Nama guru (dengan gelar)">
          <select id="ng-jab-${s.id}">${opts(JABATAN_GURU, 'Guru Kelas')}</select>
          <select id="ng-kel-${s.id}">${opts(KELAS, '', ['kelas', '1', '2', '3', '4', '5', '6'])}</select>
          <button class="btn" data-act="guru-add" data-sid="${s.id}">${ic('plus')}Tambah</button></div>
        <div id="paste-${s.id}" style="display:none;margin-top:12px"><label class="f">Satu guru per baris: <i>Nama, Jabatan/Kelas</i></label>
          <textarea data-paste="${s.id}" placeholder="Budi Santoso, S.Pd., Guru Kelas 3&#10;Rina Wati, Guru PAI&#10;Agus, Tenaga Kependidikan" style="min-height:90px"></textarea>
          <button class="btn sm pri" data-act="paste-peserta" data-sid="${s.id}" style="margin-top:8px">Tambahkan ke daftar</button></div>
        <div class="row" style="margin-top:20px"><a class="btn" href="${listHash(s.id)}">${ic('file')}${canFill(s) ? 'Buka 22 laporan' : 'Lihat 22 laporan'}</a><span class="spacer"></span>
          ${adm ? `<button class="btn danger" data-act="sk-del" data-sid="${s.id}">${ic('trash')}Hapus sekolah</button>` : ''}</div>
      </div></details>`;
  }

  function markPeserta(sid) {
    S.pesertaDirty.add(sid); kvSet('pesertaDirty', [...S.pesertaDirty]); cacheBoot(); Sync.schedule();
  }

  function addPesertaLines(s, text) {
    let n = 0;
    s.peserta = s.peserta || [];
    text.split(/\n/).map(l => l.trim()).filter(Boolean).forEach(line => {
      const m = line.split(/[,;\t]/);
      let nama = m[0].trim();
      const last = m.length > 1 ? m[m.length - 1] : '';
      const pj = I.parseJabatan(last);
      if (m.length > 2) nama = pj.jabatan ? m.slice(0, -1).join(',').trim() : line;
      else if (m.length === 2 && !pj.jabatan) nama = line;
      const exist = s.peserta.find(p => I.normName(p.nama) === I.normName(nama));
      if (exist) { if (!exist.jabatan && pj.jabatan) Object.assign(exist, pj); return; }
      s.peserta.push({ id: R.uid(), nama: prettyName(nama), jabatan: pj.jabatan || 'Guru Kelas', kelas: pj.kelas });
      n++;
    });
    return n;
  }

  const saveSekolahNow = debounceBy(async sid => {
    const s = school(sid); if (!s || !s.nama.trim()) { S.skDirty.delete(sid); return; }
    try {
      const r = await API.call('saveSekolah', { sekolah: { id: s.id, nama: s.nama, alias: s.alias, fasil: fasilOf(s), ksNama: s.ksNama, ksNip: s.ksNip, urutan: s.urutan } });
      Object.assign(s, { fasil: r.fasil, alias: r.alias }); cacheBoot();
    } catch (e) { toast(e.message, true, 6000); }
    S.skDirty.delete(sid);
  }, 700);
  const saveSekolahDeb = sid => { S.skDirty.add(sid); saveSekolahNow(sid); };

  /* =========================================================
   * PENGATURAN PROGRAM (admin)
   * ========================================================= */
  const saveProgramDeb = debounce(async () => {
    try { S.program = await API.call('saveProgram', { program: S.program }); cacheBoot(); }
    catch (e) { toast(e.message, true, 5000); }
  }, 800);

  function renderProgram() {
    const P = S.program;
    const f = (k, label, ph, hint) => `<div><label class="f">${label}</label><input type="text" data-prog="${k}" value="${esc(P[k])}" placeholder="${esc(ph || '')}">${hint ? '<div class="tiny muted" style="margin-top:4px">' + hint + '</div>' : ''}</div>`;
    app.innerHTML = pageHead('Pengaturan Program', 'Berlaku untuk semua laporan dari semua fasilitator.') + `
      <div class="card"><div class="card-h">${ic('image')}<h2>Kop / logo berjajar</h2></div>
        <p class="small muted" style="margin-top:-6px">Tercetak di bagian atas <b>setiap halaman</b> PDF, termasuk sampul. Gunakan satu gambar PNG memanjang (mis. 2000 × 230 piksel) berisi deretan logo.</p>
        <div id="kopPrev" class="small muted" style="margin:10px 0">${P.kopId ? '<span class="spin"></span>' : 'Belum ada kop.'}</div>
        <div class="row"><label class="btn pri upl">${ic('upload')}${P.kopId ? 'Ganti' : 'Unggah'} gambar kop<input type="file" accept="image/*" data-act="kop"></label>
        ${P.kopId ? `<button class="btn danger" data-act="kop-del">${ic('trash')}Hapus kop</button>` : ''}</div></div>
      <div class="card"><div class="card-h">${ic('file')}<h2>Identitas program</h2></div>
        <div class="grid2">
          ${f('program', 'Nama program', 'CERMAT', 'Sampul: “PROGRAM CERMAT” dan kalimat penutup.')}
          ${f('programKepanjangan', 'Kepanjangan program', 'Cerdas Numerasi dan Matematika Terapan', 'Sampul, di bawah nama program.')}
          ${f('penyelenggara', 'Penyelenggara', 'Pusat Belajar Guru Kudus', 'Baris kecil di bagian bawah sampul.')}
          ${f('kota', 'Kota (tanggal tanda tangan jurnal)', 'Kudus', 'Contoh: “Kudus, 20 November 2026”.')}
        </div><p class="tiny muted" style="margin:12px 0 0">Perubahan tersimpan otomatis.</p></div>`;
    if (P.kopId) ensureKop().then(() => { const el = document.getElementById('kopPrev'); if (el) el.innerHTML = S.kopData ? `<img class="kop-prev" src="${S.kopData}" alt="Kop">` : 'Kop tidak bisa dimuat.'; });
  }

  /* =========================================================
   * MENU 2 — BUAT LAPORAN
   * ========================================================= */
  async function renderBuat() {
    const draw = () => {
      const mine = S.sekolah.filter(s => canFill(s));
      const other = S.sekolah.filter(s => !canFill(s));
      const card = s => {
        const st = window.SILABUS.map(p => statusOf(s.id, p.no));
        const l = st.filter(x => x === 'lengkap').length, d = st.filter(x => x === 'draf').length, tg = st.filter(x => x === 'tunggu').length;
        return `<a class="pick${canFill(s) ? '' : ' ro'}" href="#/buat/${s.id}">${ring(l, 22, 58)}
          <div style="min-width:0;flex:1"><h3>${esc(s.nama)}</h3><div class="meta">${esc(fasilNama(s) || 'Fasilitator belum ditentukan')}</div>
          <div class="meta" style="margin-top:6px">${tg ? `<span class="pill tunggu">${tg} menunggu pengesahan</span> ` : ''}${d ? `<span class="pill draf">${d} draf</span> ` : ''}${canFill(s) ? '' : '<span class="pill kosong">hanya baca</span>'}</div></div>${ic('arrowR')}</a>`;
      };
      let h = pageHead('Buat Laporan', 'Pilih sekolah, lalu pendampingan yang akan dilaporkan.');
      if (!S.sekolah.length) h += emptyState('school', 'Belum ada sekolah binaan', 'Admin belum mendaftarkan sekolah binaan.');
      if (mine.length) h += `<div class="sec"><h2>Sekolah binaan saya</h2></div><div class="picks">${mine.map(card).join('')}</div>`;
      else if (S.sekolah.length) h += emptyState('school', 'Anda belum ditugaskan ke sekolah', 'Admin mendaftarkan sekolah binaan dan memasangkan fasilitatornya. Hubungi admin program.');
      if (other.length) h += `<div class="sec"><h2>Sekolah lain · hanya baca</h2></div><div class="picks">${other.map(card).join('')}</div>`;
      app.innerHTML = h;
    };
    draw();
    if (await refreshRekap()) { if (location.hash === '#/buat') draw(); }
  }

  async function renderPilihP(sid) {
    const s = school(sid);
    if (!s) { app.innerHTML = emptyState('alert', 'Sekolah tidak ditemukan', '', `<a class="btn" href="${homeHash()}">Kembali</a>`); return; }
    const draw = () => {
      const fase = [['f1', 'Fase 1', 'Memahami & Menguasai', 1, 7], ['f2', 'Fase 2', 'Merencanakan, Menilai & Mempraktikkan', 8, 16], ['f3', 'Fase 3', 'Mempraktikkan & Menumbuhkan Budaya', 17, 22]];
      const done = doneOf(s.id);
      app.innerHTML = pageHead(esc(s.nama), `${esc(fasilNama(s) || '-')}${s.ksNama ? ' · Kepala sekolah: ' + esc(s.ksNama) : ''}${canFill(s) ? '' : ' · <b>hanya baca</b>'}`,
        ring(done, 22, 58), isKepsek() ? '' : `<a class="crumb" href="${S.user.peran === 'fasilitator' ? '#/buat' : '#/lihat'}">${ic('arrowL')}Semua sekolah</a>`) +
        (!s.ksNama && canFill(s) ? `<div class="banner warn small">${ic('alert')}<div>Nama kepala sekolah belum diisi — diperlukan untuk tanda tangan jurnal. <a href="#/sekolah">Lengkapi di Data Sekolah →</a></div></div>` : '') +
        fase.map(([c, t, d, a, b]) => `<div class="phase ${c}"><b>${t}</b><span>${d}</span></div><div class="pcards">${window.SILABUS.filter(p => p.no >= a && p.no <= b).map(p => {
          const st = statusOf(s.id, p.no); const rk = S.rekap.get(R.key(s.id, p.no));
          const tag = isKepsek() && st === 'kosong' ? 'div' : 'a';
          return `<${tag} class="pcard ${c} ${st}${tag === 'div' ? ' off' : ''}"${tag === 'a' ? ` href="#/laporan/${s.id}/${p.no}/${isKepsek() ? NSTEP : 1}"` : ''}><span class="no">${p.no}</span><div><div class="tt">${esc(p.judul)}</div>
            <div class="meta"><span class="pill ${st}">${stLabel(st)}</span>${rk && rk.tanggal ? esc(R.tanggalPanjang(rk.tanggal).split(', ')[1]) : ''}</div></div></${tag}>`;
        }).join('')}</div>`).join('');
    };
    draw();
    if (await refreshRekap()) { if (location.hash === listHash(sid)) draw(); }
  }

  /* ---------- Editor ---------- */
  const STEPS = no => ['Pelaksanaan', R.hasTes(no) ? 'Pretes & Kehadiran' : 'Kehadiran', R.hasTes(no) ? 'Postes & Capaian' : R.isObservasi(no) ? 'Observasi & Capaian' : 'Capaian', 'Evaluasi', 'Reward', 'Lampiran', 'Periksa & Unduh'];
  const NSTEP = 7;
  let readOnly = false;

  async function openReport(sid, no, step) {
    const s = school(sid);
    if (!s || !(no >= 1 && no <= 22)) { app.innerHTML = emptyState('alert', 'Laporan tidak ditemukan', '', `<a class="btn" href="${homeHash()}">Kembali</a>`); return; }
    const key = R.key(sid, no);
    S.step = Math.min(NSTEP, Math.max(1, step || 1));
    if (!S.cur || S.cur.key !== key) {
      S.imp = null; S.showAll = false;
      app.innerHTML = '<div class="loading"><span class="spin"></span> Memuat laporan…</div>';
      const local = await DB.get('reports', key);
      const rk = S.rekap.get(key);
      if (local) {
        S.cur = normalize(local);
        if (rk || local._version > 0) refreshFromServer(key);
      } else if (navigator.onLine !== false) {
        try {
          const g = await API.call('getReport', { key });
          S.cur = g.report ? normalize(Object.assign(g.report, { _version: g.version })) : normalize(Object.assign(R.blank(sid, no), { _version: g.version || 0 }));
          if (g.report) await DB.put('reports', clone(S.cur), key);
        } catch (e) {
          if (!e.offline || (rk && rk.version > 0)) { app.innerHTML = emptyState('alert', 'Laporan belum bisa dimuat', esc(e.message), `<a class="btn" href="${listHash(sid)}">Kembali</a>`); return; }
          S.cur = normalize(Object.assign(R.blank(sid, no), { _version: 0 }));
        }
      } else S.cur = normalize(Object.assign(R.blank(sid, no), { _version: 0 }));
    }
    renderEditor();
    const k0 = key, before = JSON.stringify(S.sah.get(key) || []);
    if (await refreshRekap(true)) { if (S.cur && S.cur.key === k0 && location.hash.startsWith('#/laporan/') && JSON.stringify(S.sah.get(k0) || []) !== before && !document.activeElement.matches('input,textarea,select')) renderEditor(); }
  }

  async function refreshFromServer(key) {
    try {
      const g = await API.call('getReport', { key });
      if (!S.cur || S.cur.key !== key || !g.report) return;
      if (g.version > (S.cur._version || 0)) {
        if (!S.cur._dirty) { S.cur = normalize(Object.assign(g.report, { _version: g.version })); await DB.put('reports', clone(S.cur), key); }
        else S.cur._conflict = { by: g.updatedBy, at: g.updatedAt, version: g.version };
        if (location.hash.startsWith('#/laporan/')) renderEditor();
      }
    } catch (e) { /* tetap pakai salinan lokal */ }
  }

  function stepDots(rep, s) {
    const ck = R.checklist(rep, s);
    return [1, 2, 3, 4, 5, 6, 7].map(i => {
      if (i === NSTEP) return R.isComplete(rep, s) && sahState(s.id, rep.no).done && !rep._dirty ? 'ok' : 'no';
      const items = ck.filter(c => c.step === i && c.wajib);
      if (!items.length) return '';
      return items.every(c => c.ok) ? 'ok' : 'no';
    });
  }
  function curStatus() {
    const r = S.cur; if (!r) return 'kosong'; if (!r._dirty && !(r._version > 0)) return 'kosong';
    const c = R.status(r, school(r.sekolahId));
    if (c !== 'lengkap') return c;
    return !r._dirty && sahState(r.sekolahId, r.no).done ? 'lengkap' : 'tunggu';
  }
  /* Unduh PDF final: isi lengkap, tersinkron, dan sudah disahkan ketiganya. */
  const isFinal = (rep, s) => R.isComplete(rep, s) && !rep._dirty && sahState(s.id, rep.no).done;
  function refreshStepDots() {
    if (!S.cur) return;
    const s = school(S.cur.sekolahId);
    const d = stepDots(S.cur, s);
    document.querySelectorAll('.stepper a .n').forEach((n, i) => { n.className = 'n ' + d[i]; n.innerHTML = d[i] === 'ok' ? ic('check') : String(i + 1); });
    const pill = document.getElementById('statpill');
    if (pill) { const st = curStatus(); pill.className = 'pill ' + st; pill.textContent = st === 'kosong' ? 'baru' : stLabel(st); }
    const sf = document.getElementById('sfoot');
    if (sf) { const ck = R.checklist(S.cur, s).filter(c => c.wajib); sf.textContent = ck.filter(c => c.ok).length + ' dari ' + ck.length + ' bagian wajib lengkap'; }
  }

  function renderEditor() {
    if (isKepsek()) return renderKsView();
    const rep = S.cur, s = school(rep.sekolahId), sil = R.sil(rep.no);
    const sst = sahState(s.id, rep.no);
    const locked = canFill(s) && sst.any;
    readOnly = !canFill(s) || locked;
    const names = STEPS(rep.no);
    const dots = stepDots(rep, s);
    const st = curStatus();
    const rk = S.rekap.get(rep.key);
    const fase = rep.no <= 7 ? 'f1' : rep.no <= 16 ? 'f2' : 'f3';
    app.innerHTML = `
      <div class="ed-head"><a class="crumb" href="${listHash(s.id)}">${ic('arrowL')}${esc(s.nama)}</a>
        <h1>P${rep.no} · ${esc(sil.judul)}</h1>
        <div class="meta"><span class="phase ${fase}" style="margin:0"><b>${esc(sil.fase)}</b></span><span>${esc(sil.tahap)}</span>
          <span id="statpill" class="pill ${st}">${st === 'kosong' ? 'baru' : stLabel(st)}</span>
          ${rk && rk.updatedBy ? `<span>Terakhir diubah ${esc(rk.updatedBy.split(',')[0])}, ${fmtWaktu(rk.updatedAt)}</span>` : ''}</div></div>
      ${locked ? `<div class="banner ok small" style="margin-top:14px">${ic('lock')}<div><b>Laporan ini sudah disahkan${sst.done ? ' lengkap' : ' sebagian'}</b> (${esc(sst.list.map(r => r.nama.split(',')[0]).join(', '))}), sehingga isinya terkunci.
          Untuk mengubah isi, buka kunci terlebih dahulu — <b>semua pengesahan laporan ini dibatalkan</b> dan perlu disahkan ulang.
          <div class="row" style="margin-top:8px"><button class="btn sm" data-act="unlock">${ic('edit')}Buka kunci untuk mengubah</button></div></div></div>`
        : readOnly ? `<div class="banner info small" style="margin-top:14px">${ic('eye')}<div>${isKepsek() ? 'Mode baca — periksa isi laporan dan pratinjau PDF-nya, lalu sahkan di langkah <b>Periksa &amp; Unduh</b>.' : `Mode baca — laporan ini diisi oleh <b>${esc(fasilNama(s) || 'fasilitator pemegang')}</b>; Anda bisa melihat isinya dan pratinjau PDF.`}</div></div>` : ''}
      <div class="ed" style="margin-top:18px">
        <nav class="stepper">${names.map((n, i) => `<a href="#/laporan/${s.id}/${rep.no}/${i + 1}" class="${S.step === i + 1 ? 'on' : ''}"><span class="n ${dots[i]}">${dots[i] === 'ok' ? ic('check') : i + 1}</span><span class="lbl">${n}</span></a>`).join('')}
          <div class="sfoot" id="sfoot"></div></nav>
        <div id="stepbody"></div>
      </div>
      <div class="navbtm"><div class="in">
        ${S.step > 1 ? `<a class="btn" href="#/laporan/${s.id}/${rep.no}/${S.step - 1}">${ic('arrowL')}Sebelumnya</a>` : `<a class="btn ghost" href="${listHash(s.id)}">${ic('arrowL')}Daftar laporan</a>`}
        <span class="spacer"></span>
        ${S.step < NSTEP ? `<a class="btn pri" href="#/laporan/${s.id}/${rep.no}/${S.step + 1}">Berikutnya${ic('arrowR')}</a>` : `<button class="btn ok" data-act="download"${isFinal(rep, s) ? '' : ' disabled'}>${ic('download')}Unduh PDF</button>`}
      </div></div>`;
    rerenderStep(true);
  }

  /* ---------- Tampilan kepala sekolah: pengesahan + pratinjau PDF ---------- */
  let pdfjsP = null;
  function loadPdfJs() {
    if (!pdfjsP) {
      const base = document.baseURI;
      pdfjsP = import(new URL('vendor/pdfjs/pdf.min.mjs', base).href).then(m => {
        m.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', base).href;
        return m;
      }).catch(e => { pdfjsP = null; throw e; });
    }
    return pdfjsP;
  }
  const PV = { token: 0, zoom: 1, doc: null };
  function renderKsView() {
    const rep = S.cur, s = school(rep.sekolahId), sil = R.sil(rep.no);
    readOnly = true;
    const st = curStatus();
    const fase = rep.no <= 7 ? 'f1' : rep.no <= 16 ? 'f2' : 'f3';
    const final = isFinal(rep, s);
    app.innerHTML = `
      <div class="ed-head"><a class="crumb" href="#/lihat/${s.id}">${ic('arrowL')}${esc(s.nama)}</a>
        <h1>P${rep.no} · ${esc(sil.judul)}</h1>
        <div class="meta"><span class="phase ${fase}" style="margin:0"><b>${esc(sil.fase)}</b></span><span>${rep.tanggal ? esc(R.tanggalPanjang(rep.tanggal)) : 'tanggal belum diisi'}</span>
          <span id="statpill" class="pill ${st}">${st === 'kosong' ? 'baru' : stLabel(st)}</span></div></div>
      <div class="ksv" style="margin-top:18px">
        <div id="kssah">${sahCard(rep, s)}
          ${final ? `<div class="card"><button class="btn ok" data-act="download">${ic('download')}Unduh PDF</button><span class="small muted fname">${esc(R.fileName(rep, s))}</span></div>` : ''}</div>
        <div class="card pv-card"><div class="card-h">${ic('file')}<h2>Pratinjau laporan</h2><span class="spacer"></span>
          <span class="pv-zoom"><button class="iconbtn" data-pvz="-1" title="Perkecil">${ic('minus')}</button><span id="pvzl">100%</span><button class="iconbtn" data-pvz="1" title="Perbesar">${ic('plus')}</button></span></div>
          ${!R.isComplete(rep, s) ? `<div class="banner warn small">${ic('alert')}<div>Laporan ini masih <b>draf</b> — fasilitator belum melengkapi semua bagian.</div></div>` : ''}
          <div class="pv" id="pv"><div class="loading"><span class="spin"></span> Menyusun pratinjau…</div></div></div>
      </div>`;
    PV.zoom = 1;
    showPreview();
  }
  async function showPreview() {
    const rep = S.cur, s = school(rep.sekolahId);
    const tok = ++PV.token;
    const box = document.getElementById('pv'); if (!box) return;
    try {
      const label = !R.isComplete(rep, s) ? 'DRAF' : !isFinal(rep, s) ? 'BELUM DISAHKAN' : false;
      const [bytes, lib] = await Promise.all([makePdfBytes(rep, s, label), loadPdfJs()]);
      if (tok !== PV.token) return;
      PV.doc = await lib.getDocument({ data: bytes, isEvalSupported: false, standardFontDataUrl: new URL('vendor/pdfjs/standard_fonts/', document.baseURI).href }).promise;
      await drawPages(tok);
    } catch (e) {
      console.error(e);
      if (tok === PV.token && box.isConnected) box.innerHTML = `<div class="banner bad small">${ic('alert')}<div>Pratinjau gagal dimuat: ${esc(e.message || e)}. Periksa koneksi, lalu muat ulang halaman.</div></div>`;
    }
  }
  async function drawPages(tok) {
    const box = document.getElementById('pv'); if (!box || !PV.doc) return;
    const zl = document.getElementById('pvzl'); if (zl) zl.textContent = Math.round(PV.zoom * 100) + '%';
    box.style.minHeight = box.clientHeight + 'px';
    box.innerHTML = '';
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    pvW = box.clientWidth;
    const avail = Math.max(260, box.clientWidth - 26);
    for (let i = 1; i <= PV.doc.numPages; i++) {
      if (tok !== PV.token) return;
      const page = await PV.doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: avail / base.width * PV.zoom });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr);
      c.style.width = Math.floor(vp.width) + 'px'; c.style.height = Math.floor(vp.height) + 'px';
      c.setAttribute('aria-label', 'Halaman ' + i);
      box.appendChild(c);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
    }
    box.style.minHeight = '';
    const n = document.createElement('div'); n.className = 'tiny muted'; n.style.textAlign = 'center';
    n.textContent = PV.doc.numPages + ' halaman'; box.appendChild(n);
  }
  let pvW = 0;
  window.addEventListener('resize', debounce(() => {
    const box = document.getElementById('pv'); if (!box || !PV.doc) return;
    if (Math.abs(box.clientWidth - pvW) > 40) drawPages(++PV.token);
  }, 300));
  document.addEventListener('click', e => {
    const z = e.target.closest('[data-pvz]'); if (!z || !PV.doc) return;
    const next = Math.max(1, Math.min(3, PV.zoom + (+z.dataset.pvz) * 0.5));
    if (next === PV.zoom) return;
    PV.zoom = next; drawPages(++PV.token);
  });

  function conflictBanner(rep) {
    if (!rep._conflict || readOnly) return '';
    return `<div class="banner bad">${ic('alert')}<div><b>Bentrok versi.</b> Laporan ini sudah diubah oleh ${esc(rep._conflict.by || 'pengguna lain')} (${fmtWaktu(rep._conflict.at)}) sementara perubahan Anda belum terkirim.
      <div class="row" style="margin-top:10px"><button class="btn sm" data-act="conf-server">Pakai versi server (buang perubahan saya)</button><button class="btn sm danger" data-act="conf-mine">Timpa dengan versi saya</button></div></div></div>`;
  }

  function rerenderStep(noScroll) {
    const rep = S.cur, s = school(rep.sekolahId);
    const y = window.scrollY;
    const body = document.getElementById('stepbody'); if (!body) return;
    body.innerHTML = conflictBanner(rep) + [null, step1, step2, step3, step4, stepReward, step5, step6][S.step](rep, s, R.sil(rep.no));
    if (readOnly) {
      body.querySelectorAll('input, select, textarea').forEach(e => { if (e.dataset.act !== 'showall') e.disabled = true; });
      const keep = ['preview', 'download', 'sahkan', 'unlock'].concat(isAdmin() ? ['del-report'] : []);
      body.querySelectorAll('[data-act]').forEach(b => { if (!keep.includes(b.dataset.act) && b.tagName !== 'INPUT') b.style.display = 'none'; });
      body.querySelectorAll('label.upl, .chips, .ro-hide').forEach(e => { e.style.display = 'none'; });
    }
    fillThumbs();
    if (!noScroll) window.scrollTo(0, y);
    refreshStepDots();
  }

  /* ---- Langkah 1 ---- */
  const isoToDmy = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return d + '/' + m + '/' + y; };
  function dmyToIso(v) {
    const m = String(v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (!m) return null;
    const d = +m[1], mo = +m[2], y = +m[3];
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function step1(rep, s, sil) {
    const f = fasilOf(s);
    const hadir = R.fasilHadir(rep, s);
    return `<div class="card"><div class="card-h">${ic('users')}<h2>Fasilitator yang hadir</h2></div>
      ${f.length ? `<div class="fh">${f.map(u => `<label><input type="checkbox" data-act="fh" data-u="${esc(u)}"${hadir.some(x => eqU(x, u)) ? ' checked' : ''}>
        <span><b>${esc(namaUser(u))}</b><br><span class="tiny muted">${esc(u)}</span></span></label>`).join('')}</div>
        <p class="tiny muted" style="margin:10px 0 0">Nama yang dicentang tercetak di sampul dan menandatangani jurnal kegiatan.</p>`
      : `<div class="banner warn small">${ic('alert')}<div>Sekolah ini belum punya fasilitator. Hubungi admin.</div></div>`}</div>
      <div class="card"><div class="card-h">${ic('calendar')}<h2>Waktu & tempat</h2></div>
      <div class="when">
        <div><label class="f">Tanggal pelaksanaan</label>
          <div class="datef"><input type="text" id="tgl" data-date="1" value="${esc(isoToDmy(rep.tanggal))}" placeholder="DD/MM/YYYY" inputmode="numeric" maxlength="10" autocomplete="off">
          <button type="button" class="calbtn" data-act="cal" title="Pilih dari kalender">${ic('calendar')}</button><div class="cal" id="calpop"></div></div></div>
        <div><label class="f">Jam mulai</label><input type="text" data-r="jamMulai" value="${esc(rep.jamMulai)}" placeholder="08.00"></div>
        <div><label class="f">Jam selesai</label><input type="text" data-r="jamSelesai" value="${esc(rep.jamSelesai)}" placeholder="11.00"></div>
        <div><label class="f">Tempat</label><input type="text" data-r="tempat" value="${esc(rep.tempat || s.nama)}" placeholder="${esc(s.nama)}"></div>
      </div>
      <div class="tiny muted" id="tgl-hari" style="margin-top:6px;min-height:1.2em">${rep.tanggal ? esc(R.tanggalPanjang(rep.tanggal)) : 'Ketik tanggal, mis. 20112026 → 20/11/2026'}</div>
      <label class="f" style="margin-top:12px">Kalimat di laporan</label><div class="preview" id="pv-pel">${esc(R.kalimatPelaksanaan(rep, s))}</div></div>
      <div class="card"><div class="card-h">${ic('file')}<h2>Ringkasan dari silabus</h2></div>
        <table class="simple"><tbody>
        <tr><th>Tahap</th><td>${esc(sil.tahap)}</td></tr>
        <tr><th>Buku modul</th><td>${esc(sil.fase)}</td></tr>
        <tr><th>Alokasi waktu</th><td>${esc(sil.alokasi)} · ${sil.kegiatan.length} sesi</td></tr>
        <tr><th>Metode</th><td>${esc(sil.metode)}</td></tr>
        <tr><th>Penilaian</th><td>${sil.penilaian.map(esc).join('<br>')}</td></tr>
        <tr><th>Lembar kerja</th><td>${sil.lk.map(esc).join('<br>')}</td></tr>
        </tbody></table>
        <p class="tiny muted" style="margin:10px 0 0">Latar belakang, tujuan, indikator, dan langkah pelaksanaan otomatis diambil dari silabus.</p></div>`;
  }

  /* Kalender kecil berbahasa Indonesia */
  const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  function drawCal() {
    const el = document.getElementById('calpop'); if (!el || !S.cal) return;
    const { y, m } = S.cal;
    const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
    const off = (first.getDay() + 6) % 7;   // Senin = 0
    const sel = S.cur && S.cur.tanggal;
    const today = new Date(); const tIso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    let cells = '';
    for (let i = 0; i < off; i++) cells += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const iso = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      cells += `<button type="button" data-act="cal-day" data-iso="${iso}" class="${iso === sel ? 'sel' : ''}${iso === tIso ? ' today' : ''}">${d}</button>`;
    }
    el.innerHTML = `<div class="cal-h"><button type="button" data-act="cal-nav" data-d="-1">‹</button><b>${BLN[m]} ${y}</b><button type="button" data-act="cal-nav" data-d="1">›</button></div>
      <div class="cal-g">${['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(x => `<i>${x}</i>`).join('')}${cells}</div>`;
    el.classList.add('open');
  }
  function setTanggal(iso) {
    const rep = S.cur; if (!rep) return;
    rep.tanggal = iso || ''; touch(); updatePreviews();
    const h = document.getElementById('tgl-hari'); if (h) h.textContent = iso ? R.tanggalPanjang(iso) : 'Tanggal tidak valid — gunakan format DD/MM/YYYY';
  }

  function pesertaRow(s, p, withCheck, hadirSet, rep, ed) {
    let extra = '';
    if (rep && R.hasTes(rep.no) && rep.tes) {
      const sk = R.skorPeserta(rep, p.nama);
      extra = `<small>Pretes ${sk.pre === null ? '–' : R.fmt(sk.pre)} · Postes ${sk.post === null ? '–' : R.fmt(sk.post)}</small>`;
    }
    const isKs = p.id === 'ks_' + s.id;
    const dis = ed && !isKs ? '' : ' disabled';
    return `<div class="pr">
      ${withCheck ? `<input type="checkbox" data-act="hadir" data-id="${p.id}"${hadirSet.has(p.id) ? ' checked' : ''}${ed ? '' : ' disabled'}>` : '<span></span>'}
      <div class="nm">${esc(p.nama)}${extra}</div>
      <select class="pj" data-pj="${s.id}|${p.id}|jabatan"${dis}>${opts(JABATAN, p.jabatan, ['— jabatan —'].concat(JABATAN.slice(1)))}</select>
      <select class="pk" data-pj="${s.id}|${p.id}|kelas"${p.jabatan === 'Guru Kelas' && ed ? '' : ' disabled'}>${opts(KELAS, p.kelas, ['kelas', '1', '2', '3', '4', '5', '6'])}</select>
      <span></span>
    </div>`;
  }

  /* ---- Langkah 2: Pretes & Kehadiran ---- */
  function step2(rep, s) {
    let html = '';
    if (R.hasTes(rep.no)) html += tesCard(rep, s, 'pre');
    const g = R.groupKelas(rep.no);
    const hadir = new Set(rep.hadir || []);
    const rel = R.relevantPeserta(s, rep.no, S.showAll);
    const list = R.sortPeserta(rel.concat((s.peserta || []).filter(p => hadir.has(p.id) && !rel.includes(p))));
    html += `<div class="card"><div class="card-h">${ic('users')}<h2>Kehadiran peserta</h2><span class="spacer"></span>
        <span class="pill navy">Hadir: <b id="hadirN" style="margin-left:4px">${R.hadirList(rep, s).length}</b>&nbsp;orang</span></div>
      ${g ? `<div class="banner info small">${ic('info')}<div>Pendampingan ini untuk <b>Kepala Sekolah dan guru kelas ${g[0]} dan ${g[1]}</b>.
        <label style="margin-left:6px;white-space:nowrap"><input type="checkbox" data-act="showall"${S.showAll ? ' checked' : ''} style="vertical-align:-4px"> tampilkan semua peserta sekolah</label></div></div>` : ''}
      ${R.hasTes(rep.no) ? `<p class="small muted ro-hide" style="margin-top:-4px">Peserta yang mengerjakan pretes otomatis tercentang hadir. Centang juga yang hadir tetapi tidak ikut pretes.</p>` : ''}
      <div class="row ro-hide" style="margin:4px 0 10px"><button class="btn sm" data-act="hadir-all">${ic('check')}Centang semua</button><button class="btn sm ghost" data-act="hadir-none">Kosongkan</button></div>
      ${list.length ? `<div class="peserta-list">${list.map(p => pesertaRow(s, p, true, hadir, rep, !readOnly)).join('')}</div>` :
        `<div class="banner warn small">${ic('alert')}<div>Belum ada peserta${g && !S.showAll ? ' untuk kelompok kelas ini (cek jabatan/kelas guru, atau centang “tampilkan semua”)' : ''}.${R.hasTes(rep.no) ? ' Unggah file pretes di atas — daftar terbentuk otomatis — atau tambahkan di bawah.' : ' Lengkapi data guru di menu Data Sekolah atau tambahkan di bawah.'}</div></div>`}
      <div class="addrow ro-hide" style="grid-template-columns:2fr 1.2fr .6fr auto">
        <input type="text" id="np-nama" placeholder="Nama peserta lain yang hadir">
        <select id="np-jab">${opts(JABATAN, g ? 'Guru Kelas' : 'Guru Kelas', ['— jabatan —'].concat(JABATAN.slice(1)))}</select>
        <select id="np-kel">${opts(KELAS, g ? g[0] : '', ['kelas', '1', '2', '3', '4', '5', '6'])}</select>
        <button class="btn" data-act="add-peserta">${ic('plus')}Tambah</button></div>
      <label class="f" style="margin-top:16px">Kalimat di laporan</label><div class="preview" id="pv-pes">${esc(R.kalimatPeserta(rep, s))}</div></div>`;
    return html;
  }

  /* Kartu nilai: mode 'pre' (langkah 2) atau 'post' (langkah 3). Satu file Google Form berisi pretes + postes. */
  function tesCard(rep, s, mode) {
    const judul = mode === 'pre' ? 'Pretes' : 'Postes';
    let h = `<div class="card"><div class="card-h">${ic('file')}<h2>${judul}</h2><span class="spacer"></span>${rep.tes ? `<span class="tiny muted">${esc(rep.tes.fileName)}</span>` : ''}</div>`;
    if (S.imp && S.impMode === mode) return h + impMapping(rep, s) + '</div>';
    const st = R.stats(rep);
    const uploadBtn = (label, pri) => `<label class="btn ${pri ? 'pri ' : ''}upl">${ic('upload')}${label}<input type="file" accept=".csv,.xlsx,.tsv" data-act="imp-file" data-mode="${mode}"></label>`;
    const rowsTable = jenis => `<details class="adv"><summary>Lihat nilai ${jenis === 'pre' ? 'pretes' : 'postes'} per peserta</summary>
      <table class="simple"><tbody>${rep.tes.rows.filter(r => r.jenis === jenis).sort((a, b) => a.nama.localeCompare(b.nama)).map(r => `<tr><td>${esc(r.nama)}</td><td style="width:90px;text-align:right">${R.fmt(r.skor)}</td></tr>`).join('')}</tbody></table></details>`;
    if (mode === 'pre') {
      if (st && st.preN) {
        h += `<div class="stats"><div class="stat"><b>${R.fmt(st.pre)}</b><span>rata-rata pretes · ${st.preN} peserta</span></div></div>
          <div class="banner ${st.postN ? 'ok' : 'info'} small" style="margin-top:12px">${ic(st.postN ? 'check' : 'info')}<div>${st.postN ? `Postes juga sudah terbaca dari file yang sama (<b>${st.postN}</b> peserta) — tampil di langkah 3.` : 'Postes belum ada di file ini. Di langkah 3 Anda bisa mengunggah file terbaru setelah postes dikerjakan.'}</div></div>
          ${rowsTable('pre')}
          <div class="row ro-hide" style="margin-top:12px">${uploadBtn('Unggah ulang file')}<button class="btn danger" data-act="tes-del">${ic('trash')}Hapus data nilai</button></div>`;
        return h + '</div>';
      }
      if (readOnly) return h + '<p class="muted" style="margin:0">Pretes belum diunggah.</p></div>';
      h += `<p style="margin-top:-4px">Unggah file respons Google Form — <b>pretes dan postes boleh dalam satu file</b>, berisi semua sekolah. Aplikasi otomatis menyaring baris <b>${esc(s.nama)}</b> dan memisahkan pretes & postes.</p>
        <div class="row">${uploadBtn('Pilih file .csv / .xlsx', true)}<span class="small muted">Google Form → Respons → Lihat di Spreadsheet → File → Download</span></div>
        <details class="adv"><summary>Kolom yang dibutuhkan di Google Form</summary>
        <ul class="small"><li><b>Nama</b> peserta</li><li><b>Asal Sekolah</b> — sebaiknya pilihan dropdown</li>
        <li><b>Jenis Tes</b> — pilihan “Pre-tes” / “Post-tes”</li><li><b>Skor</b> — otomatis bila form diatur sebagai Kuis (mis. “8 / 11” → 72,73)</li>
        <li>Opsional: <b>Jabatan/Kelas</b>, dan <b>Pendampingan ke-</b> bila satu form dipakai untuk beberapa pendampingan</li></ul></details>`;
      return h + '</div>';
    }
    // mode postes
    if (st && st.postN) {
      h += `<div class="stats"><div class="stat"><b>${R.fmt(st.pre)}</b><span>rata-rata pretes · ${st.preN} org</span></div>
        <div class="stat ok"><b>${R.fmt(st.post)}</b><span>rata-rata postes · ${st.postN} org</span></div>
        <div class="stat gold"><b>${st.selisih === null ? '-' : (st.selisih >= 0 ? '+' : '−') + R.fmt(Math.abs(st.selisih))}</b><span>poin ${st.persen === null ? '' : '(' + R.fmt(st.persen) + '%)'}</span></div></div>`;
      if (st.onlyPre.length || st.onlyPost.length) {
        h += `<div class="banner warn small" style="margin-top:12px">${ic('alert')}<div>${st.onlyPre.length ? `<b>Hanya ikut pretes:</b> ${esc(st.onlyPre.join(', '))}. ` : ''}${st.onlyPost.length ? `<b>Hanya ikut postes:</b> ${esc(st.onlyPost.join(', '))}.` : ''}
          Rata-rata tiap tes dihitung dari semua yang mengerjakannya. Catatan ini tidak masuk ke PDF.</div></div>`;
      }
      h += rowsTable('post') + `<div class="row ro-hide" style="margin-top:12px">${uploadBtn('Unggah file terbaru')}</div>`;
      return h + '</div>';
    }
    if (readOnly) return h + '<p class="muted" style="margin:0">Postes belum ada.</p></div>';
    h += st && st.preN
      ? `<div class="banner warn small">${ic('alert')}<div>Postes belum ada di file yang diunggah di langkah 2. Setelah peserta mengerjakan postes, unduh ulang respons Google Form lalu unggah di sini — pretes yang sudah ada ikut diperbarui.</div></div>`
      : `<div class="banner info small">${ic('info')}<div>Belum ada file nilai. Unggah file Google Form (pretes + postes) di sini atau di langkah 2.</div></div>`;
    return h + `<div class="row">${uploadBtn('Pilih file .csv / .xlsx', true)}</div></div>`;
  }

  function impMapping(rep, s) {
    const imp = S.imp, an = imp.an, c = imp.cols;
    const colSel = (k, label, wajib) => `<div><label class="f">${label}${wajib ? ' *' : ''}</label><select data-imp-col="${k}">
      <option value="-1">${wajib ? '— pilih kolom —' : '— tidak ada —'}</option>${an.header.map((hh, i) => `<option value="${i}"${c[k] === i ? ' selected' : ''}>${esc(hh || 'Kolom ' + (i + 1))}</option>`).join('')}</select></div>`;
    let h = `<p class="small" style="margin-top:-4px"><b>${esc(imp.fileName)}</b> · ${an.body.length} baris respons</p>
      <h3>1. Cocokkan kolom</h3><div class="grid3">${colSel('nama', 'Nama', 1)}${colSel('sekolah', 'Asal sekolah', 1)}${colSel('jenis', 'Jenis tes', 1)}${colSel('skor', 'Skor', 1)}${colSel('jabatan', 'Jabatan/Kelas', 0)}${colSel('pendampingan', 'Pendampingan ke-', 0)}</div>`;
    if (c.sekolah >= 0) {
      const vals = I.distinct(an.body, c.sekolah).sort((a, b) => (imp.schools.has(b.value) - imp.schools.has(a.value)) || b.count - a.count);
      h += `<h3 style="margin-top:18px">2. Pilih nama sekolah yang berarti <u>${esc(s.nama)}</u></h3>
        <p class="small muted">Yang tercentang otomatis dikenali dari nama sekolah. Centang juga ejaan lain milik sekolah ini.</p>
        <div class="peserta-list" style="max-height:240px">${vals.map(v => `<label class="pr" style="grid-template-columns:26px 1fr 80px"><input type="checkbox" data-imp-school="${esc(v.value)}"${imp.schools.has(v.value) ? ' checked' : ''}><span>${esc(v.value)}</span><span class="small muted">${v.count} baris</span></label>`).join('')}</div>`;
    }
    if (c.jenis >= 0) {
      const jv = I.distinct(an.body, c.jenis);
      h += `<p class="small" style="margin-top:12px">Isi kolom jenis tes: ${jv.map(v => { const p = I.parseJenis(v.value); return `<span class="pill ${p ? 'lengkap' : 'draf'}">${esc(v.value)} → ${p === 'pre' ? 'Pretes' : p === 'post' ? 'Postes' : 'tidak dikenali'}</span>`; }).join(' ')}</p>`;
    }
    const ready = c.nama >= 0 && c.sekolah >= 0 && c.jenis >= 0 && c.skor >= 0 && imp.schools.size;
    if (ready) {
      const ex = I.extract(an, c, [...imp.schools], rep.no);
      const pre = ex.rows.filter(r => r.jenis === 'pre').length, post = ex.rows.filter(r => r.jenis === 'post').length;
      h += `<div class="banner ${pre + post ? 'info' : 'bad'} small" style="margin-top:12px">${ic('info')}<div>Ditemukan <b>${pre}</b> pretes dan <b>${post}</b> postes untuk ${esc(s.nama)}.
        ${ex.skipped.jenis ? ex.skipped.jenis + ' baris jenis tes tidak dikenali. ' : ''}${ex.skipped.skor ? ex.skipped.skor + ' baris tanpa skor. ' : ''}${ex.skipped.pendampingan ? ex.skipped.pendampingan + ' baris milik pendampingan lain dilewati.' : ''}</div></div>`;
    }
    return h + `<div class="row" style="margin-top:14px"><button class="btn pri" data-act="imp-apply"${ready ? '' : ' disabled'}>${ic('check')}Ambil nilai ${esc(s.nama)}</button>
      <button class="btn ghost" data-act="imp-cancel">Batal</button></div>`;
  }

  /* ---- Langkah 3: Postes / Observasi & Capaian ---- */
  function step3(rep, s) {
    let h = '';
    if (R.hasTes(rep.no)) h += tesCard(rep, s, 'post');
    if (R.isObservasi(rep.no)) {
      const names = R.relevantPeserta(s, rep.no, false).map(p => p.nama);
      h += `<div class="card"><div class="card-h">${ic('eye')}<h2>Hasil observasi & coaching</h2></div>
        <datalist id="dl-guru">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        ${(rep.observasi || []).length ? '' : '<p class="small muted" style="margin-top:-4px">Belum ada data observasi.</p>'}
        ${(rep.observasi || []).map((o, i) => `<div class="sesi"><div class="grid2">
          <div><label class="f">Guru yang diobservasi</label><input type="text" list="dl-guru" data-obs="${i}|guru" value="${esc(o.guru)}"></div>
          <div><label class="f">Kelas</label><input type="text" data-obs="${i}|kelas" value="${esc(o.kelas)}"></div></div>
          <div class="grid3" style="margin-top:10px">
          <div><label class="f">Kekuatan</label><textarea data-obs="${i}|kekuatan">${esc(o.kekuatan)}</textarea></div>
          <div><label class="f">Area perbaikan</label><textarea data-obs="${i}|perbaikan">${esc(o.perbaikan)}</textarea></div>
          <div><label class="f">Tindak lanjut (hasil coaching)</label><textarea data-obs="${i}|tindakLanjut">${esc(o.tindakLanjut)}</textarea></div></div>
          <button class="btn sm danger" data-act="obs-del" data-i="${i}" style="margin-top:8px">${ic('trash')}Hapus guru ini</button></div>`).join('')}
        <button class="btn" data-act="obs-add">${ic('plus')}Tambah guru yang diobservasi</button></div>`;
    }
    h += `<div class="card"><div class="card-h">${ic('check')}<h2>Capaian indikator</h2></div><p class="small muted" style="margin-top:-6px">Menentukan kalimat Kondisi Akhir. Bawaan: tercapai.</p>
      ${R.indikatorList(rep.no).map(i => { const v = rep.capaian[i.id] || 'tercapai'; return `<div class="ind"><div><span class="pill navy">${i.dim}</span> ${esc(i.teks)}</div>
        <div class="seg">${['tercapai', 'sebagian', 'belum'].map(x => `<button data-act="cap" data-id="${i.id}" data-v="${x}" class="${v === x ? 'on' : ''}"${readOnly ? ' disabled' : ''}>${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</div></div>`; }).join('')}</div>`;
    const tf = (k, label, auto) => `<div style="margin-top:12px"><div class="row"><label class="f" style="margin:0">${label}</label><span class="spacer"></span>
      <span class="tiny muted" id="tm-${k}">${rep.teks[k] ? 'diedit manual' : 'otomatis'}</span>
      <button class="btn sm ghost" data-act="teks-reset" data-k="${k}">Kembalikan otomatis</button></div>
      <textarea data-teks="${k}" style="min-height:${k === 'latar' ? 170 : 120}px">${esc(rep.teks[k] || auto)}</textarea></div>`;
    h += `<details class="card adv0"><summary><b>Teks laporan</b> <span class="small muted">— kondisi awal, kondisi akhir, latar belakang (otomatis, bisa diedit)</span></summary>
      ${tf('kondisiAwal', 'Kondisi awal', autoTeks(rep, 'kondisiAwal'))}
      ${tf('kondisiAkhir', 'Kondisi akhir', autoTeks(rep, 'kondisiAkhir'))}
      ${tf('latar', 'Latar belakang', autoTeks(rep, 'latar'))}</details>`;
    return h;
  }
  function autoTeks(rep, k) {
    const tmp = Object.assign({}, rep, { teks: { latar: '', kondisiAwal: '', kondisiAkhir: '' } });
    return k === 'latar' ? R.latar(tmp) : k === 'kondisiAwal' ? R.kondisiAwal(tmp) : R.kondisiAkhir(tmp);
  }

  /* ---- Langkah 4 ---- */
  const CHIP_MASALAH = [
    'Sebagian peserta datang terlambat sehingga sesi pembukaan mundur.',
    'Waktu pendampingan terbatas sehingga diskusi kelompok belum maksimal.',
    'Terdapat kendala sarana (LCD, listrik, atau jaringan internet).',
    'Masih terdapat miskonsepsi peserta terhadap materi yang dibahas.',
    'Beberapa peserta belum menyelesaikan LK sesuai waktu yang ditentukan.',
    'Tidak ada permasalahan berarti; kegiatan berjalan lancar.'
  ];
  function chipRekom(no) {
    const a = [
      'Guru menerapkan hasil pendampingan dalam pembelajaran matematika di kelas.',
      'Kepala sekolah melakukan supervisi dan pendampingan lanjutan secara berkala.',
      'Guru menyelesaikan LK atau tugas yang belum tuntas sebelum pendampingan berikutnya.',
      'Guru berbagi praktik baik melalui KKG atau komunitas belajar sekolah.'
    ];
    if (no < 22) a.push('Peserta mempersiapkan diri untuk pendampingan ke-' + (no + 1) + ' (' + R.sil(no + 1).judul + ').');
    return a;
  }
  function step4(rep) {
    const chips = (k, list) => `<div class="chips">${list.map(t => `<button class="chip" data-act="chip" data-k="${k}" data-t="${esc(t)}">+ ${esc(t)}</button>`).join('')}</div>`;
    return `<div class="card"><h2>a. Permasalahan yang ditemui</h2>${chips('permasalahan', CHIP_MASALAH)}
      <textarea data-r="permasalahan" placeholder="Tulis permasalahan yang ditemui selama pendampingan…">${esc(rep.permasalahan)}</textarea></div>
      <div class="card"><h2>b. Rekomendasi fasilitator</h2>${chips('rekomendasi', chipRekom(rep.no))}
      <textarea data-r="rekomendasi" placeholder="Tulis rekomendasi tindak lanjut…">${esc(rep.rekomendasi)}</textarea></div>
      <p class="small muted ro-hide">Klik tombol saran untuk menambahkan kalimat, lalu sesuaikan. Baris baru menjadi paragraf baru di laporan.</p>`;
  }

  /* ---- Langkah 5: Reward (bintang) ---- */
  function stepReward(rep, s) {
    const hadir = R.sortPeserta(R.hadirList(rep, s));
    const rw = rep.reward || {};
    const sebelum = rewardTotals(s.id, rep.no - 1);
    const kini = R.rewardHadir(rep);
    const jumlah = Object.values(kini).reduce((a, b) => a + b, 0);
    const kosong = hadir.filter(p => kini[p.id] === undefined).length;
    if (!hadir.length) return `<div class="card"><div class="card-h">${ic('star')}<h2>Reward peserta</h2></div>
      <div class="banner warn small">${ic('alert')}<div>Belum ada peserta yang dicentang hadir. Reward hanya diberikan kepada peserta yang hadir. <a href="#/laporan/${s.id}/${rep.no}/2">Isi kehadiran →</a></div></div></div>`;
    return `<div class="card"><div class="card-h">${ic('star')}<h2>Reward peserta · Pendampingan ${rep.no}</h2><span class="spacer"></span>
        <span class="pill gold">Jumlah: <b id="rwSum" style="margin-left:4px">${jumlah}</b>&nbsp;bintang</span></div>
      <p class="small muted ro-hide" style="margin-top:-4px">Isi jumlah bintang yang diperoleh setiap peserta yang hadir pada pendampingan ini. Isi <b>0</b> bila peserta tidak mendapat bintang. Total bertambah otomatis dari P1 sampai pendampingan ini.</p>
      <div class="row ro-hide" style="margin:4px 0 10px"><button class="btn sm" data-act="rw-fill0"${kosong ? '' : ' disabled'}>Isi 0 untuk yang masih kosong${kosong ? ' (' + kosong + ')' : ''}</button></div>
      <div class="rw-list">
        <div class="rw rw-h"><span>Peserta hadir (${hadir.length})</span><span>Bintang P${rep.no}</span><span>Total s.d. P${rep.no}</span></div>
        ${hadir.map(p => {
          const v = rw[p.id] === undefined || rw[p.id] === null ? '' : rw[p.id];
          const tot = (sebelum[p.id] || 0) + (kini[p.id] || 0);
          return `<div class="rw${kini[p.id] === undefined ? ' blank' : ''}" data-rwrow="${p.id}">
            <div class="nm">${esc(p.nama)}<small>${esc(R.jabatanLabel(p) || '-')}</small></div>
            <div class="rw-in"><button type="button" class="iconbtn" data-act="rw-dec" data-id="${p.id}" title="Kurangi">${ic('minus')}</button>
              <input type="text" inputmode="numeric" maxlength="3" data-rw="${p.id}" value="${esc(v)}" placeholder="–" aria-label="Bintang ${esc(p.nama)}">
              <button type="button" class="iconbtn" data-act="rw-inc" data-id="${p.id}" title="Tambah">${ic('plus')}</button></div>
            <div class="rw-tot"><span class="lbl-m">Total s.d. P${rep.no}: </span><b data-rwtot="${p.id}">${tot}</b> ${ic('star', 'st')}</div>
          </div>`;
        }).join('')}
      </div>
      <p class="tiny muted" style="margin:10px 0 0">Tabel reward ikut tercetak di PDF setelah bagian Evaluasi. Rekap semua pendampingan ada di menu <a href="#/reward">Total Reward</a>.</p></div>`;
  }
  function setReward(id, val) {
    const rep = S.cur; if (!rep || readOnly) return;
    rep.reward = rep.reward || {};
    if (val === '' || val === null || val === undefined) delete rep.reward[id];
    else rep.reward[id] = Math.max(0, Math.min(999, Math.floor(Number(val)) || 0));
    touch(); updateRewardView();
  }
  function updateRewardView() {
    const rep = S.cur; if (!rep) return; const s = school(rep.sekolahId);
    const sebelum = rewardTotals(s.id, rep.no - 1), kini = R.rewardHadir(rep);
    document.querySelectorAll('[data-rwtot]').forEach(el => { const id = el.dataset.rwtot; el.textContent = (sebelum[id] || 0) + (kini[id] || 0); });
    document.querySelectorAll('[data-rwrow]').forEach(el => el.classList.toggle('blank', kini[el.dataset.rwrow] === undefined));
    const sum = document.getElementById('rwSum'); if (sum) sum.textContent = Object.values(kini).reduce((a, b) => a + b, 0);
    const f0 = document.querySelector('[data-act="rw-fill0"]');
    if (f0) { const k = R.hadirList(rep, s).filter(p => kini[p.id] === undefined).length; f0.disabled = !k; f0.textContent = 'Isi 0 untuk yang masih kosong' + (k ? ' (' + k + ')' : ''); }
  }

  /* ---- Langkah 6: Lampiran ---- */
  function thumbs(list, key) {
    return `<div class="thumbs">${(list || []).map(id => `<div class="thumb${String(id).startsWith('tmp_') ? ' pend' : ''}"><img data-img="${esc(id)}" alt=""><button data-act="img-del" data-list="${esc(key)}" data-id="${esc(id)}" title="Hapus">×</button></div>`).join('')}</div>`;
  }
  function uploadBtn(key, label) { return `<label class="btn upl">${label}<input type="file" accept="image/*" multiple data-up="${esc(key)}"></label>`; }
  function step5(rep, s, sil) {
    const L = rep.lampiran;
    const lkKeys = sil.lk.concat(Object.keys(L.portofolio).filter(k => !sil.lk.includes(k)));
    if (!lkKeys.includes('Lainnya')) lkKeys.push('Lainnya');
    return `<div class="card"><h2>a. Daftar hadir</h2>
      <label><input type="checkbox" data-act="lamp-toggle" data-k="hadirAuto"${L.hadirAuto ? ' checked' : ''} style="vertical-align:-4px"> Buat tabel daftar hadir otomatis (dari langkah Kehadiran${R.hasTes(rep.no) ? ', lengkap dengan nilai pretes/postes' : ''})</label>
      <p class="small muted">Foto/scan daftar hadir bertanda tangan (opsional).</p>${uploadBtn('hadirScan', '+ Foto/scan daftar hadir')}${thumbs(L.hadirScan, 'hadirScan')}</div>
      <div class="card"><h2>b. Jurnal kegiatan</h2>
      <label><input type="checkbox" data-act="lamp-toggle" data-k="jurnalAuto"${L.jurnalAuto ? ' checked' : ''} style="vertical-align:-4px"> Buat jurnal kegiatan fasilitator otomatis (sesi, kegiatan, catatan, kolom paraf, tanda tangan penanggung jawab)</label>
      <p class="small muted">Catatan per sesi diisi di langkah 3. Scan jurnal bertanda tangan bisa ditambahkan.</p>${uploadBtn('jurnalScan', '+ Foto/scan jurnal')}${thumbs(L.jurnalScan, 'jurnalScan')}</div>
      <div class="card"><h2>c. Portofolio tugas <span class="small muted">(opsional)</span></h2>
      <p class="small muted">Foto hasil LK peserta. Bagian yang kosong tidak dicetak.</p>
      ${lkKeys.map(k => `<div class="sesi"><div class="sesi-h">${esc(k)} <span class="spacer"></span>${uploadBtn('porto:' + k, '+ Foto')}</div>${thumbs(L.portofolio[k], 'porto:' + k)}</div>`).join('')}</div>
      <div class="card"><h2>d. Foto dokumentasi kegiatan *</h2>${uploadBtn('foto', '+ Tambah foto')}${thumbs(L.foto, 'foto')}
      <p class="small muted">Foto dikompres otomatis lalu disimpan ke folder sekolah di Google Drive. Bingkai kuning = menunggu terunggah.</p></div>`;
  }
  function listByKey(L, key) {
    if (key.startsWith('porto:')) { const k = key.slice(6); L.portofolio[k] = L.portofolio[k] || []; return L.portofolio[k]; }
    L[key] = L[key] || []; return L[key];
  }
  async function fillThumbs() {
    const imgs = [...document.querySelectorAll('img[data-img]')];
    if (!imgs.length) return;
    const ids = imgs.map(i => i.dataset.img);
    try { await fetchImages(ids); } catch (e) { /* tampilkan yang ada */ }
    imgs.forEach(img => { const r = S.imgCache.get(img.dataset.img); if (r) img.src = r.data; });
  }

  /* ---- Langkah 7 ---- */
  function sahCard(rep, s) {
    const st = sahState(s.id, rep.no);
    const isi = R.isComplete(rep, s);
    const rk = S.rekap.get(rep.key);
    const synced = !rep._dirty && !hasTmp(rep) && !rep._conflict && rep._version > 0 && rk && rk.version === rep._version && rk.status === 'lengkap';
    const me = S.user;
    const myFasil = st.fasil.find(f => eqU(f.u, me.username));
    const ksAcc = kepsekOf(s);
    const row = (label, nama, rec, wait) => `<li><span class="ici ${rec ? 'ok' : 'no'}">${rec ? '✓' : '!'}</span>
      <span><b>${esc(label)}</b> · ${esc(rec ? rec.nama : nama)}${rec ? `<div class="tiny muted">Disahkan ${fmtWaktu(rec.waktu)}</div>` : wait ? `<div class="tiny muted">${wait}</div>` : ''}</span></li>`;
    let act = '';
    if (myFasil && !myFasil.rec) {
      const why = !isi ? 'Lengkapi dulu semua bagian wajib di daftar periksa.' : !synced ? 'Tunggu sampai semua perubahan tersimpan ke Google Drive (indikator sinkron hijau).' : '';
      act = `<div class="row" style="margin-top:12px"><button class="btn pri" data-act="sahkan"${why ? ' disabled' : ''}>${ic('check')}Sahkan sebagai Fasilitator</button></div>${why ? `<p class="tiny muted" style="margin:6px 0 0">${why}</p>` : ''}`;
    } else if (isKepsek() && !st.ks) {
      const why = !isi || !synced ? 'Laporan belum lengkap atau masih diperbarui fasilitator.' : !st.allFasil ? 'Menunggu pengesahan kedua fasilitator.' : '';
      act = `<div class="row" style="margin-top:12px"><button class="btn pri" data-act="sahkan"${why ? ' disabled' : ''}>${ic('check')}Sahkan sebagai Kepala Sekolah</button></div>${why ? `<p class="tiny muted" style="margin:6px 0 0">${why}</p>` : '<p class="tiny muted" style="margin:6px 0 0">Periksa dulu isi laporan dan pratinjau PDF-nya. Pengesahan tidak bisa ditarik oleh kepala sekolah.</p>'}`;
    }
    return `<div class="card"><div class="card-h">${ic('lock')}<h2>Pengesahan</h2><span class="spacer"></span><span class="pill ${st.done ? 'lengkap' : 'tunggu'}">${st.done ? 'disahkan' : (st.list.length + ' dari ' + (st.fasil.length + 1))}</span></div>
      <p class="small muted" style="margin-top:-6px">Wajib. Fasilitator 1 &amp; 2 mengesahkan dari akun masing-masing, lalu kepala sekolah. Kode QR pengesahan tercetak di Lembar Pengesahan dan Jurnal Kegiatan.</p>
      <ul class="ck">${st.fasil.map(f => row(st.fasil.length > 1 ? 'Fasilitator ' + (f.i + 1) : 'Fasilitator', namaUser(f.u), f.rec, eqU(f.u, me.username) ? '' : 'belum mengesahkan')).join('') || row('Fasilitator', 'belum ditentukan admin', null, '')}
        ${row('Kepala Sekolah', ksAcc.length ? ksAcc[0].nama : (s.ksNama || '-'), st.ks, ksAcc.length ? (st.allFasil ? 'menunggu pengesahan kepala sekolah' : 'disahkan setelah kedua fasilitator') : 'akun kepala sekolah belum dibuat admin')}</ul>${act}</div>`;
  }
  function step6(rep, s) {
    const ck = R.checklist(rep, s);
    const done = isFinal(rep, s);
    const link = c => c.step === 0 ? '#/sekolah' : `#/laporan/${s.id}/${rep.no}/${c.step}`;
    return `<div class="card"><div class="card-h">${ic('check')}<h2>Daftar periksa</h2></div><ul class="ck">${ck.map(c => `<li><span class="ici ${c.ok ? 'ok' : c.wajib ? 'no' : 'opt'}">${c.ok ? '✓' : c.wajib ? '!' : '–'}</span>
      <span>${esc(c.label)}</span><span class="spacer"></span>${c.ok ? '' : `<a class="small" href="${link(c)}">${readOnly ? 'Lihat' : 'Lengkapi'} →</a>`}</li>`).join('')}</ul></div>
      <div class="card"><div class="card-h">${ic('file')}<h2>PDF laporan</h2></div>
      ${done ? `<div class="banner ok small">${ic('check')}<div>Laporan lengkap dan sudah disahkan. File: <b>${esc(R.fileName(rep, s))}</b><br>Saat diunduh, salinan PDF juga diarsipkan otomatis ke folder sekolah di Google Drive.</div></div>`
        : R.isComplete(rep, s) ? `<div class="banner warn small">${ic('alert')}<div>Isi laporan sudah lengkap, tetapi <b>belum disahkan</b> lengkap. Pratinjau bisa dilihat dengan tanda <b>BELUM DISAHKAN</b>; tombol unduh aktif setelah fasilitator dan kepala sekolah mengesahkan.</div></div>`
        : `<div class="banner warn small">${ic('alert')}<div>Masih ada bagian wajib yang belum lengkap. Pratinjau tetap bisa dilihat dengan tanda <b>DRAF</b>; tombol unduh aktif setelah semua lengkap dan disahkan.</div></div>`}
      <div class="row"><button class="btn" data-act="preview">${ic('eye')}Pratinjau</button><button class="btn ok" data-act="download"${done ? '' : ' disabled'}>${ic('download')}Unduh PDF</button></div></div>
      ${sahCard(rep, s)}
      ${(!readOnly || isAdmin()) && (rep._version > 0 || rep._dirty) ? `<div class="card"><div class="card-h">${ic('trash')}<h3>Hapus laporan${isAdmin() ? ' (darurat, admin)' : ''}</h3></div><p class="small muted" style="margin-top:-6px">Folder laporan ini (isian, foto, PDF) dipindah ke Sampah Google Drive dan masih bisa dipulihkan admin selama 30 hari.</p><button class="btn danger" data-act="del-report">${ic('trash')}Hapus laporan ini</button></div>` : ''}`;
  }

  async function makePdfBytes(rep, s, draft) {
    await fetchImages(allImageIds(rep).concat(S.program.kopId ? [S.program.kopId] : []));
    await ensureKop();
    return PdfGen.generate(rep, s, pdfSettings(s, rep), getImageRec, { draft });
  }
  async function archivePdf(key, bytes, name) {
    try {
      const r = await API.call('savePdf', { key, b64: bytesToB64(bytes), nama: name });
      const rk = S.rekap.get(key); if (rk) Object.assign(rk, { pdfId: r.pdfId, pdfAt: r.pdfAt });
      cacheBoot();
    } catch (e) { /* arsip gagal tidak menghalangi unduhan */ }
  }
  async function previewPdf() {
    const rep = S.cur, s = school(rep.sekolahId);
    toast('Menyusun pratinjau…', false, 1500);
    const bytes = await makePdfBytes(rep, s, !R.isComplete(rep, s) ? 'DRAF' : !isFinal(rep, s) ? 'BELUM DISAHKAN' : false);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal"><div class="mh"><b>Pratinjau</b><span class="spacer"></span><a class="btn sm" href="${url}" target="_blank" rel="noopener">Buka di tab baru</a><button class="btn sm" data-close>Tutup</button></div>
      <iframe src="${url}" title="Pratinjau PDF"></iframe></div>`;
    bg.addEventListener('click', e => { if (e.target === bg || e.target.hasAttribute('data-close')) { bg.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); } });
    document.body.appendChild(bg);
  }
  async function downloadCur() {
    const rep = S.cur, s = school(rep.sekolahId);
    if (!R.isComplete(rep, s)) return toast('Lengkapi dulu bagian wajib di daftar periksa.', true);
    if (!isFinal(rep, s)) return toast('Laporan belum disahkan fasilitator dan kepala sekolah.', true);
    toast('Menyusun PDF…', false, 1500);
    const bytes = await makePdfBytes(rep, s, false);
    const name = R.fileName(rep, s);
    saveBlob(new Blob([bytes], { type: 'application/pdf' }), name);
    if (rep._dirty) await Sync.run();
    if (!rep._dirty && !rep._conflict && rep._version > 0) archivePdf(rep.key, bytes, name);
  }

  /* ---------- Impor nilai ---------- */
  async function importFile(file, mode) {
    S.impMode = mode || 'pre';
    try {
      const rows = await I.readFile(file);
      const an = I.analyze(rows);
      const s = school(S.cur.sekolahId);
      const imp = { an, fileName: file.name, cols: Object.assign({}, an.cols), schools: new Set() };
      autoSchools(imp, s);
      S.imp = imp;
      rerenderStep();
    } catch (e) { console.error(e); toast(e.message || 'File tidak bisa dibaca.', true, 5000); }
  }
  function autoSchools(imp, s) {
    imp.schools = new Set();
    if (imp.cols.sekolah >= 0) I.distinct(imp.an.body, imp.cols.sekolah).forEach(v => { if (I.schoolMatch(v.value, s)) imp.schools.add(v.value); });
  }
  function applyImport() {
    const rep = S.cur, s = school(rep.sekolahId), imp = S.imp;
    const ex = I.extract(imp.an, imp.cols, [...imp.schools], rep.no);
    if (!ex.rows.length) return toast('Tidak ada baris yang bisa diambil. Periksa pilihan kolom dan sekolah.', true, 5000);
    rep.tes = { fileName: imp.fileName, importedAt: Date.now(), rows: ex.rows.map(r => Object.assign({}, r, { nama: prettyName(r.nama) })) };
    const newAlias = [...imp.schools].filter(v => v.trim().toLowerCase() !== s.nama.trim().toLowerCase() && !(s.alias || []).includes(v));
    if (newAlias.length && canEdit(s)) { s.alias = (s.alias || []).concat(newAlias); saveSekolahDeb(s.id); }
    s.peserta = s.peserta || [];
    const hadir = new Set(rep.hadir || []);
    let baru = 0;
    rep.tes.rows.forEach(r => {
      let p = s.peserta.find(x => I.normName(x.nama) === I.normName(r.nama));
      const pj = I.parseJabatan(r.jabatanRaw);
      if (!p) { p = { id: R.uid(), nama: r.nama, jabatan: pj.jabatan, kelas: pj.kelas }; s.peserta.push(p); baru++; }
      else if (!p.jabatan && pj.jabatan) Object.assign(p, pj);
      hadir.add(p.id);
    });
    rep.hadir = [...hadir];
    S.imp = null;
    markPeserta(s.id);
    touch(); rerenderStep();
    const st = R.stats(rep);
    toast(`Nilai diambil: ${st.preN} pretes, ${st.postN} postes${baru ? ' · ' + baru + ' peserta baru ditambahkan' : ''}. Kehadiran dicentang otomatis.`, false, 5000);
  }

  /* =========================================================
   * LIHAT LAPORAN (admin & pemantau) — pemantauan
   * ========================================================= */
  async function renderLihat() {
    const draw = () => {
      const sk = S.sekolah;
      const tot = sk.length * 22;
      let lengkap = 0, draf = 0, tunggu = 0;
      sk.forEach(s => window.SILABUS.forEach(p => { const st = statusOf(s.id, p.no); if (st === 'lengkap') lengkap++; else if (st === 'draf') draf++; else if (st === 'tunggu') tunggu++; }));
      const last = sid => { let b = null; S.rekap.forEach(r => { if (r.sekolahId === sid && (!b || r.updatedAt > b.updatedAt)) b = r; }); return b; };
      const rows = sk.map(s => {
        const l = doneOf(s.id), d = window.SILABUS.filter(p => statusOf(s.id, p.no) === 'draf').length, tg = window.SILABUS.filter(p => statusOf(s.id, p.no) === 'tunggu').length, lr = last(s.id);
        return `<tr data-href="#/lihat/${s.id}" class="clickrow"><td><div class="row" style="flex-wrap:nowrap;gap:12px">${ring(l, 22, 44)}<div><b>${esc(s.nama)}</b><div class="tiny muted">${esc(s.ksNama || 'Kepala sekolah belum diisi')}</div></div></div></td>
          <td>${fasilChips(s)}</td><td><span class="pill lengkap">${l} lengkap</span> ${tg ? `<span class="pill tunggu">${tg} menunggu pengesahan</span> ` : ''}${d ? `<span class="pill draf">${d} draf</span>` : ''}</td>
          <td class="small">${lr ? `P${lr.no} · ${esc(String(lr.updatedBy || '').split(',')[0])}<div class="tiny muted">${fmtWaktu(lr.updatedAt)}</div>` : '<span class="muted">—</span>'}</td>
          <td>${ic('arrowR')}</td></tr>`;
      }).join('');
      const fas = fasilUsers().map(u => {
        const sks = sk.filter(s => inFasil(s, u.username));
        const l = sks.reduce((a, s) => a + doneOf(s.id), 0), t = sks.length * 22;
        return { u, sks, l, t };
      });
      app.innerHTML = pageHead('Lihat Laporan', 'Pantau perkembangan laporan setiap sekolah dan fasilitator. Klik sekolah untuk melihat laporannya.') + `
        <div class="stats" style="margin-bottom:18px"><div class="stat"><b>${sk.length}</b><span>sekolah binaan</span></div><div class="stat ok"><b>${lengkap}</b><span>laporan lengkap</span></div>
          <div class="stat warn"><b>${draf}</b><span>masih draf</span></div><div class="stat"><b>${tunggu}</b><span>menunggu pengesahan</span></div><div class="stat gold"><b>${tot ? Math.round(lengkap / tot * 100) : 0}%</b><span>progres program (${lengkap}/${tot})</span></div></div>
        ${sk.length ? `<div class="card" style="padding:0;overflow:hidden"><div style="overflow-x:auto"><table class="tb"><thead><tr><th>Sekolah</th><th>Fasilitator</th><th>Status</th><th>Terakhir diperbarui</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`
          : emptyState('school', 'Belum ada sekolah binaan', isAdmin() ? 'Tambahkan di menu Data Sekolah.' : '')}
        ${fas.length ? `<div class="sec"><h2>Per fasilitator</h2></div><div class="card" style="padding:0;overflow:hidden"><div style="overflow-x:auto"><table class="tb"><thead><tr><th>Fasilitator</th><th>Sekolah binaan</th><th style="width:30%">Progres</th></tr></thead><tbody>
          ${fas.map(x => `<tr><td><b>${esc(x.u.nama)}</b></td><td class="small">${esc(x.sks.map(s => s.nama).join(', ') || '—')}</td>
            <td>${x.t ? `<div class="row" style="flex-wrap:nowrap"><div class="bar" style="flex:1"><i style="width:${x.l / x.t * 100}%"></i></div><span class="small"><b>${x.l}</b>/${x.t}</span></div>` : '<span class="muted small">belum ditugaskan</span>'}</td></tr>`).join('')}
          </tbody></table></div></div>` : ''}`;
    };
    draw();
    if (await refreshRekap(true)) { if (location.hash === '#/lihat') draw(); }
  }

  /* =========================================================
   * MENU 3 — UNDUH LAPORAN
   * ========================================================= */
  async function renderUnduh() {
    const draw = () => {
      const sk = S.sekolah;
      let lengkap = 0, draf = 0, tunggu = 0, total = 0;
      const rows = sk.map(s => {
        const cells = window.SILABUS.map(p => {
          const st = statusOf(s.id, p.no); total++;
          if (st === 'lengkap') lengkap++; else if (st === 'draf') draf++; else if (st === 'tunggu') tunggu++;
          return `<td><button class="cell ${st}" data-cell="${s.id}|${p.no}" title="P${p.no} · ${esc(p.judul)} — ${stLabel(st)}${st === 'lengkap' ? ' (klik untuk unduh PDF)' : ''}">${p.no}</button></td>`;
        }).join('');
        return `<tr><td class="sk"><b>${esc(s.nama)}</b><div class="tiny muted">${esc(fasilOf(s).map(u => namaUser(u).split(',')[0]).join(' & ') || '-')} · ${doneOf(s.id)}/22</div></td>${cells}</tr>`;
      }).join('');
      app.innerHTML = pageHead('Unduh Laporan', 'Klik kotak hijau untuk mengunduh PDF laporan yang sudah lengkap.') + `
        <div class="stats" style="margin-bottom:18px"><div class="stat ok"><b>${lengkap}</b><span>laporan lengkap & disahkan</span></div><div class="stat"><b>${tunggu}</b><span>menunggu pengesahan</span></div><div class="stat warn"><b>${draf}</b><span>masih draf</span></div>
          <div class="stat"><b>${total - lengkap - draf - tunggu}</b><span>belum dibuat</span></div><div class="stat gold"><b>${total ? Math.round(lengkap / total * 100) : 0}%</b><span>progres program</span></div></div>
        ${sk.length ? `<div class="matrix-wrap"><table class="matrix"><thead><tr class="fase"><th class="sk"></th><th colspan="7" class="f1">FASE 1</th><th colspan="9" class="f2">FASE 2</th><th colspan="6" class="f3">FASE 3</th></tr>
          <tr><th class="sk">Sekolah</th>${window.SILABUS.map(p => `<th title="${esc(p.judul)}">${p.no}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
          <div class="legend" style="margin:10px 2px 0"><span><i style="background:#f2f4f8"></i>Belum</span><span><i style="background:#fdebc0"></i>Draf</span><span><i style="background:#dbe6fb"></i>Menunggu pengesahan</span><span><i style="background:#c9ecd8"></i>Lengkap & disahkan — klik untuk unduh</span></div>`
        : emptyState('school', 'Belum ada sekolah', '')}
        <div class="sec"><h2>Unduh sekaligus (ZIP)</h2></div>
        <div class="grid2">
          <div class="card"><div class="card-h">${ic('zip')}<h3>Per pendampingan</h3></div><p class="small muted" style="margin-top:-6px">Semua laporan lengkap satu pendampingan dari seluruh sekolah.</p>
            <select id="bulkNo">${window.SILABUS.map(p => `<option value="${p.no}">P${p.no} · ${esc(p.judul)}</option>`).join('')}</select>
            <div id="bulkNoInfo" class="small muted" style="margin:8px 0 12px"></div><button class="btn pri" data-act="bulk-no">${ic('download')}Unduh ZIP</button></div>
          <div class="card"><div class="card-h">${ic('zip')}<h3>Per sekolah</h3></div><p class="small muted" style="margin-top:-6px">Semua laporan lengkap (P1–P22) satu sekolah.</p>
            <select id="bulkSk">${sk.map(s => `<option value="${s.id}">${esc(s.nama)}</option>`).join('')}</select>
            <div id="bulkSkInfo" class="small muted" style="margin:8px 0 12px"></div><button class="btn pri" data-act="bulk-sk">${ic('download')}Unduh ZIP</button></div>
        </div>
        <p class="tiny muted">PDF yang sudah diarsipkan di Google Drive diambil langsung; yang belum, disusun di perangkat ini lalu diarsipkan.</p>`;
      updateBulkInfo();
    };
    draw();
    if (await refreshRekap(true)) { if (location.hash === '#/unduh') draw(); }
  }
  function updateBulkInfo() {
    const a = document.getElementById('bulkNo'), b = document.getElementById('bulkSk');
    if (a) { const no = +a.value; const n = S.sekolah.filter(s => statusOf(s.id, no) === 'lengkap').length; document.getElementById('bulkNoInfo').textContent = n + ' dari ' + S.sekolah.length + ' sekolah lengkap.'; }
    if (b && b.value) { const n = window.SILABUS.filter(p => statusOf(b.value, p.no) === 'lengkap').length; document.getElementById('bulkSkInfo').textContent = n + ' dari 22 pendampingan lengkap.'; }
  }

  async function pdfBytesFor(s, no) {
    const key = R.key(s.id, no);
    const rk = S.rekap.get(key);
    let local = await DB.get('reports', key);
    if (rk && rk.pdfId && rk.pdfAt >= rk.updatedAt && rk.pdfAt >= lastSahAt(key) && !(local && local._dirty)) {
      const g = await API.call('getPdf', { key });
      return b64ToBytes(g.b64);
    }
    let rep = local && (local._dirty || (local._version || 0) >= (rk ? rk.version : 0)) ? local : null;
    if (!rep) {
      const g = await API.call('getReport', { key });
      if (!g.report) throw new Error('Laporan belum ada di server.');
      rep = Object.assign(g.report, { _version: g.version });
      await DB.put('reports', rep, key);
    }
    normalize(rep);
    if (!R.isComplete(rep, s)) throw new Error(s.nama + ' P' + no + ' belum lengkap.');
    if (!sahState(s.id, no).done) throw new Error(s.nama + ' P' + no + ' belum disahkan.');
    const bytes = await makePdfBytes(rep, s, false);
    if (!rep._dirty) await archivePdf(key, bytes, R.fileName(rep, s));
    return bytes;
  }

  async function downloadOne(sid, no) {
    const s = school(sid);
    toast('Menyiapkan PDF ' + s.nama + ' P' + no + '…', false, 2000);
    try {
      const bytes = await pdfBytesFor(s, no);
      saveBlob(new Blob([bytes], { type: 'application/pdf' }), R.fileName({ no }, s));
    } catch (e) { toast(e.message, true, 5000); }
  }

  async function bulkZip(list, zipName) {
    if (!list.length) return toast('Belum ada laporan lengkap.', true);
    const zip = new JSZip();
    const gagal = [];
    for (let i = 0; i < list.length; i++) {
      const { s, no } = list[i];
      toast('PDF ' + (i + 1) + '/' + list.length + ': ' + s.nama + ' P' + no, false, 1800);
      try { zip.file(R.fileName({ no }, s), await pdfBytesFor(s, no)); }
      catch (e) { if (e.offline) throw e; gagal.push(s.nama + ' P' + no); }
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    saveBlob(blob, zipName);
    toast('ZIP berisi ' + (list.length - gagal.length) + ' laporan siap.' + (gagal.length ? ' Gagal: ' + gagal.join(', ') : ''), !!gagal.length, 6000);
  }

  /* =========================================================
   * PENGESAHAN (kepala sekolah)
   * ========================================================= */
  /* Petunjuk memasang aplikasi (PWA) di HP — tidak tampil bila sudah terpasang atau sudah ditutup. */
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; const b = document.getElementById('instNow'); if (b) b.hidden = false; });
  window.addEventListener('appinstalled', () => { installEvt = null; const c = document.getElementById('instCard'); if (c) c.remove(); });
  const isInstalled = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  function installHint() {
    let tutup = false; try { tutup = localStorage.getItem('cermat_install_tutup') === '1'; } catch (e) { /* abaikan */ }
    if (isInstalled() || tutup) return '';
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return `<div class="banner info small" id="instCard" style="margin-bottom:18px">${ic('download')}<div><b>Pasang aplikasi ini di HP Anda</b> supaya bisa dibuka langsung dari layar utama, seperti aplikasi biasa.
      <div style="margin-top:6px">${ios ? 'Di Safari: ketuk tombol <b>Bagikan</b> lalu pilih <b>Tambahkan ke Layar Utama</b>.'
        : 'Di Chrome HP: ketuk menu <b>⋮</b> lalu pilih <b>Instal aplikasi</b> (atau <b>Tambahkan ke layar utama</b>). Di laptop: klik ikon instal di ujung kanan kolom alamat.'}</div>
      <div class="row" style="margin-top:10px"><button class="btn sm pri" id="instNow" data-inst="now"${installEvt ? '' : ' hidden'}>${ic('download')}Pasang sekarang</button><button class="btn sm ghost" data-inst="tutup">Tutup petunjuk</button></div></div></div>`;
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-inst]'); if (!b) return;
    if (b.dataset.inst === 'tutup') { try { localStorage.setItem('cermat_install_tutup', '1'); } catch (er) { /* abaikan */ } const c = document.getElementById('instCard'); if (c) c.remove(); return; }
    if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch (er) { /* abaikan */ } installEvt = null; b.hidden = true; }
  });
  async function renderPengesahan() {
    const draw = () => {
      const sk = S.sekolah.find(x => x.id === S.user.sekolahId) || S.sekolah[0];
      const head = pageHead('Pengesahan', 'Periksa laporan pendampingan yang sudah disahkan fasilitator, lalu sahkan sebagai kepala sekolah.');
      if (!sk) { app.innerHTML = head + emptyState('school', 'Akun belum terhubung ke sekolah', 'Hubungi admin program untuk memilih sekolah akun Anda.'); return; }
      const items = window.SILABUS.map(p => ({ p, st: sahState(sk.id, p.no), c: contentOf(sk.id, p.no), rk: S.rekap.get(R.key(sk.id, p.no)) }));
      const menunggu = items.filter(x => x.c === 'lengkap' && x.st.allFasil && !x.st.ks);
      const fasilBelum = items.filter(x => x.c === 'lengkap' && !x.st.allFasil);
      const sudah = items.filter(x => x.st.ks);
      const tgl = x => x.rk && x.rk.tanggal ? esc(R.tanggalPanjang(x.rk.tanggal)) : '-';
      const card = (x, btn) => `<a class="pick" href="#/laporan/${sk.id}/${x.p.no}/${NSTEP}"><span class="pno">P${x.p.no}</span>
        <div style="min-width:0;flex:1"><h3>${esc(x.p.judul)}</h3><div class="meta">${tgl(x)}</div>
        <div class="meta" style="margin-top:6px">${x.st.fasil.map(f => `<span class="pill ${f.rec ? 'lengkap' : 'kosong'}">${f.rec ? '✓' : '…'} ${esc(namaUser(f.u).split(',')[0])}</span>`).join(' ')}
          ${x.st.ks ? `<span class="pill lengkap">✓ Disahkan ${fmtWaktu(x.st.ks.waktu)}</span>` : ''}${btn ? `<span class="pill navy">${btn}</span>` : ''}</div></div>${ic('arrowR')}</a>`;
      app.innerHTML = head + installHint() + `
        <div class="stats" style="margin-bottom:18px"><div class="stat gold"><b>${menunggu.length}</b><span>menunggu pengesahan Anda</span></div>
          <div class="stat"><b>${fasilBelum.length}</b><span>menunggu fasilitator</span></div>
          <div class="stat ok"><b>${sudah.length}</b><span>sudah Anda sahkan</span></div>
          <div class="stat"><b>${doneOf(sk.id)}/22</b><span>laporan ${esc(sk.nama)} lengkap</span></div></div>
        <div class="sec"><h2>Menunggu pengesahan Anda</h2></div>
        ${menunggu.length ? `<div class="picks">${menunggu.map(x => card(x, 'Perlu diperiksa &amp; disahkan')).join('')}</div>` : emptyState('check', 'Tidak ada laporan yang menunggu', 'Laporan muncul di sini setelah kedua fasilitator mengesahkannya.')}
        ${fasilBelum.length ? `<div class="sec"><h2>Menunggu pengesahan fasilitator</h2></div><div class="picks">${fasilBelum.map(x => card(x, '')).join('')}</div>` : ''}
        ${sudah.length ? `<div class="sec"><h2>Sudah disahkan</h2></div><div class="picks">${sudah.map(x => card(x, '')).join('')}</div>` : ''}`;
    };
    draw();
    if (await refreshRekap(true)) { if (location.hash === '#/pengesahan') draw(); }
  }

  /* =========================================================
   * TOTAL REWARD — rekap bintang per peserta, per pendampingan
   * ========================================================= */
  const rewardSchools = () => S.user && S.user.peran === 'fasilitator' ? S.sekolah.filter(s => canFill(s)) : S.sekolah;
  function rewardMatrix(s) {
    const per = window.SILABUS.map(p => rewardOf(s.id, p.no));
    const rows = (s.peserta || []).map(p => {
      const cells = per.map(r => r[p.id]);
      const total = cells.reduce((a, v) => a + (Number(v) || 0), 0);
      return { p, cells, total, ikut: cells.filter(v => v !== undefined).length };
    });
    rows.sort((a, b) => (b.total - a.total) || a.p.nama.localeCompare(b.p.nama, 'id'));
    const colSum = per.map(r => Object.keys(r).reduce((a, id) => a + ((s.peserta || []).some(p => p.id === id) ? Number(r[id]) || 0 : 0), 0));
    return { rows, colSum, total: colSum.reduce((a, b) => a + b, 0) };
  }
  async function renderReward() {
    const draw = () => {
      const list = rewardSchools();
      const fas = S.user.peran === 'fasilitator' || isKepsek();
      const sub = fas ? 'Rekap bintang peserta di sekolah ' + (isKepsek() ? 'Anda' : 'binaan Anda') + '. Bintang diisi di langkah Reward pada setiap laporan pendampingan.'
        : 'Rekap bintang peserta setiap sekolah. Bintang diisi fasilitator di langkah Reward pada setiap laporan pendampingan.';
      if (!list.length) { app.innerHTML = pageHead('Total Reward', sub) + emptyState('star', fas ? 'Anda belum ditugaskan ke sekolah' : 'Belum ada sekolah binaan', fas ? 'Hubungi admin program.' : ''); return; }
      if (!S.rwSk || !list.some(s => s.id === S.rwSk)) S.rwSk = list[0].id;
      const sums = list.map(s => { const m = rewardMatrix(s); return { s, m, top: m.rows.find(r => r.total > 0) }; });
      const cur = sums.find(x => x.s.id === S.rwSk);
      const m = cur.m;
      const penerima = m.rows.filter(r => r.total > 0).length;
      const ranks = []; m.rows.forEach((r, i) => { ranks[i] = i && r.total === m.rows[i - 1].total ? ranks[i - 1] : i + 1; });
      let h = pageHead('Total Reward', sub);
      h += `<div class="stats" style="margin-bottom:18px">
          ${list.length > 1 ? `<div class="stat gold"><b>${sums.reduce((a, x) => a + x.m.total, 0)}</b><span>total bintang · ${list.length} sekolah</span></div>`
            : `<div class="stat gold"><b>${window.SILABUS.filter(p => Object.keys(rewardOf(cur.s.id, p.no)).length).length}</b><span>pendampingan sudah diberi bintang</span></div>`}
          <div class="stat"><b>${m.total}</b><span>bintang ${esc(cur.s.nama)}</span></div>
          <div class="stat ok"><b>${penerima}</b><span>peserta sudah mendapat bintang</span></div>
          <div class="stat"><b>${cur.top ? cur.top.total : 0}</b><span>${cur.top ? 'tertinggi: ' + esc(cur.top.p.nama.split(',')[0]) : 'belum ada bintang'}</span></div></div>`;
      if (list.length > 1) h += `<div class="card" style="padding:0;overflow:hidden"><div style="overflow-x:auto"><table class="tb"><thead><tr><th>Sekolah</th><th style="width:120px">Total bintang</th><th>Peserta teratas</th><th style="width:40px"></th></tr></thead><tbody>
          ${sums.map(x => `<tr class="clickrow${x.s.id === S.rwSk ? ' on' : ''}" data-act="rw-sk" data-sid="${x.s.id}"><td><b>${esc(x.s.nama)}</b><div class="tiny muted">${esc(fasilNama(x.s) || '-')}</div></td>
            <td><span class="pill gold">${ic('star', 'st')} ${x.m.total}</span></td><td class="small">${x.top ? esc(x.top.p.nama) + ' · <b>' + x.top.total + '</b>' : '<span class="muted">—</span>'}</td><td>${ic('arrowR')}</td></tr>`).join('')}
          </tbody></table></div></div>`;
      h += `<div class="sec"><h2>Per pendampingan · ${esc(cur.s.nama)}</h2></div>
        ${list.length > 1 ? `<div style="max-width:420px;margin-bottom:12px"><select id="rwSk">${list.map(s => `<option value="${s.id}"${s.id === S.rwSk ? ' selected' : ''}>${esc(s.nama)}</option>`).join('')}</select></div>` : ''}`;
      if (!m.rows.length) h += emptyState('users', 'Belum ada data peserta', 'Data guru dan kepala sekolah dilengkapi di menu Data Sekolah.');
      else h += `<div class="matrix-wrap"><table class="matrix rwm"><thead><tr class="fase"><th class="sk"></th><th colspan="7" class="f1">FASE 1</th><th colspan="9" class="f2">FASE 2</th><th colspan="6" class="f3">FASE 3</th><th class="tot"></th></tr>
          <tr><th class="sk">Peringkat · Peserta</th>${window.SILABUS.map(p => `<th title="${esc(p.judul)}">P${p.no}</th>`).join('')}<th class="tot">Total</th></tr></thead><tbody>
          ${m.rows.map((r, i) => `<tr><td class="sk"><div class="row" style="flex-wrap:nowrap;gap:10px"><span class="rk${r.total && ranks[i] <= 3 ? ' r' + ranks[i] : ''}">${ranks[i]}</span><div style="min-width:0"><b>${esc(r.p.nama)}</b><div class="tiny muted">${esc(R.jabatanLabel(r.p) || '-')} · hadir ${r.ikut} kali</div></div></div></td>
            ${r.cells.map((v, j) => `<td class="${v === undefined ? 'na' : v > 0 ? 'has' : 'zero'}" title="P${j + 1}${v === undefined ? ': tidak hadir / belum diisi' : ': ' + v + ' bintang'}">${v === undefined ? '·' : v}</td>`).join('')}
            <td class="tot"><b>${r.total}</b></td></tr>`).join('')}
          <tr class="sum"><td class="sk"><b>Jumlah per pendampingan</b></td>${m.colSum.map(v => `<td>${v || '·'}</td>`).join('')}<td class="tot"><b>${m.total}</b></td></tr>
          </tbody></table></div>
          <div class="legend" style="margin:10px 2px 0"><span><i style="background:#fbf3e0"></i>Mendapat bintang</span><span><i style="background:#fff;border:1px solid #d3d9e4"></i>0 bintang</span><span><i style="background:#f2f4f8"></i>· tidak hadir / belum diisi</span></div>`;
      app.innerHTML = h;
    };
    draw();
    if (await refreshRekap(true)) { if (location.hash === '#/reward') draw(); }
  }

  /* =========================================================
   * KELOLA PENGGUNA (admin)
   * ========================================================= */
  const skOfUser = u => S.sekolah.filter(s => inFasil(s, u.username)).map(s => s.nama);
  async function renderPengguna() {
    const head = pageHead('Kelola Pengguna', 'Akun admin, fasilitator, kepala sekolah, dan pemantau.', `<button class="btn pri" data-act="user-new">${ic('plus')}Tambah pengguna</button>`);
    app.innerHTML = head + '<div class="loading"><span class="spin"></span> Memuat…</div>';
    let users, usage = null;
    try { users = await API.call('listUsers'); } catch (e) { app.innerHTML = head + emptyState('alert', 'Gagal memuat', esc(e.message)); return; }
    try { usage = await API.call('usage'); } catch (e) { /* abaikan */ }
    S.users = users;
    S.pengguna = users.map(u => ({ username: u.username, nama: u.nama, peran: u.peran, aktif: u.aktif, nip: u.nip, sekolahId: u.sekolahId || '' })); cacheBoot();
    const pct = usage ? Math.round(usage.used / usage.limit * 1000) / 10 : 0;
    const order = { admin: 0, fasilitator: 1, kepsek: 2, pemantau: 3 };
    const list = users.slice().sort((a, b) => (order[a.peran] - order[b.peran]) || a.nama.localeCompare(b.nama, 'id'));
    app.innerHTML = head + `
      <div class="card" style="padding:0;overflow:hidden"><div class="ulist">
        ${list.map(u => {
          const sks = skOfUser(u);
          const salah = sks.length && u.peran !== 'fasilitator';
          return `<div class="urow${u.aktif ? '' : ' off'}">
            <span class="bubble">${esc(initials(u.nama))}</span>
            <div class="um"><b>${esc(u.nama)}</b><span>${esc(u.username)}${u.nip ? ' · NIP ' + esc(u.nip) : ''}${eqU(u.username, S.user.username) ? ' · <i>Anda</i>' : ''}</span></div>
            <div class="ur"><span class="pill ${u.peran === 'admin' ? 'navy' : u.peran === 'fasilitator' ? 'gold' : u.peran === 'kepsek' ? 'tunggu' : 'kosong'}">${PERAN[u.peran]}</span>${u.aktif ? '' : ' <span class="pill draf">nonaktif</span>'}</div>
            <div class="us small">${u.peran === 'kepsek' ? (school(u.sekolahId) ? 'Kepala ' + esc(school(u.sekolahId).nama) : '<span class="muted">sekolah belum dipilih</span>') : sks.length ? esc(sks.join(', ')) : '<span class="muted">—</span>'}
              ${salah ? `<div class="warnline">${ic('alert')} Peran ${PERAN[u.peran]} tidak bisa mengisi laporan sekolah ini</div>` : ''}</div>
            <div class="ul tiny muted">${u.terakhirLogin ? 'Login ' + fmtWaktu(Date.parse(u.terakhirLogin)) : 'Belum pernah login'}</div>
            <button class="btn sm" data-act="user-edit" data-u="${esc(u.username)}">${ic('edit')}Edit</button>
          </div>`;
        }).join('')}
      </div></div>
      <div class="grid2">
        <div class="card"><div class="card-h">${ic('info')}<h3>Peran</h3></div><ul class="small" style="margin:0;padding-left:18px">
          <li><b>Admin</b> — mengelola pengguna, pengaturan program, sekolah binaan & pasangan fasilitator; melihat semua laporan.</li>
          <li><b>Fasilitator</b> — melengkapi data sekolah binaannya & mengisi laporannya; melihat & mengunduh semua laporan.</li>
          <li><b>Kepala Sekolah</b> — melihat laporan sekolahnya sendiri dan mengesahkannya setelah kedua fasilitator mengesahkan.</li>
          <li><b>Pemantau</b> — hanya melihat & mengunduh.</li></ul></div>
        ${usage ? `<div class="card"><div class="card-h">${ic('cloud')}<h3>Penyimpanan Google Drive admin</h3></div><div class="bar big"><i style="width:${Math.min(100, pct)}%"></i></div>
          <p class="small" style="margin:10px 0 0">${(usage.used / 1073741824).toFixed(2)} GB dari ${(usage.limit / 1073741824).toFixed(0)} GB terpakai (${pct}%) — termasuk Gmail & Google Photos akun admin.</p></div>` : ''}
      </div>`;
  }

  function openUserModal(uname) {
    const u = uname ? (S.users || []).find(x => eqU(x.username, uname)) : null;
    const create = !u;
    const sks = u ? skOfUser(u) : [];
    const self = u && eqU(u.username, S.user.username);
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" style="width:min(620px,100%)"><div class="mh"><b>${create ? 'Tambah pengguna' : 'Edit pengguna'}</b><span class="spacer"></span><button class="iconbtn" data-um="close" title="Tutup">${ic('x')}</button></div>
      <div class="mb" style="padding:20px 22px">
        <div class="grid2">
          <div><label class="f">Username</label><input type="text" id="um-user" value="${esc(u ? u.username : '')}" placeholder="mis. anton" autocomplete="off">
            <div class="tiny muted" style="margin-top:4px">3–30 karakter, tanpa spasi</div></div>
          <div><label class="f">Peran</label><select id="um-peran"${self ? ' disabled' : ''}>${opts(['fasilitator', 'kepsek', 'pemantau', 'admin'], u ? u.peran : 'fasilitator', ['Fasilitator', 'Kepala Sekolah', 'Pemantau', 'Admin'])}</select></div>
        </div>
        <div id="um-skwrap" style="margin-top:14px;display:none"><label class="f">Sekolah yang dipimpin</label>
          <select id="um-sk"><option value="">— pilih sekolah —</option>${S.sekolah.map(x => `<option value="${x.id}"${u && u.sekolahId === x.id ? ' selected' : ''}>${esc(x.nama)}${x.ksNama ? ' · KS: ' + esc(x.ksNama) : ''}</option>`).join('')}</select>
          <div class="tiny muted" style="margin-top:4px">Kepala sekolah hanya melihat laporan sekolah ini dan mengesahkannya. Nama & NIP akun ini yang tercetak di Lembar Pengesahan.</div></div>
        <div style="margin-top:14px"><label class="f">Nama lengkap (dengan gelar)</label><input type="text" id="um-nama" value="${esc(u ? u.nama : '')}" placeholder="Anton Widiyatmoko, S.Pd., M.Pd."></div>
        <div class="grid2" style="margin-top:14px">
          <div><label class="f">NIP (opsional)</label><input type="text" id="um-nip" value="${esc(u ? u.nip : '')}" inputmode="numeric"></div>
          ${create ? `<div><label class="f">Password awal (min. 6 karakter)</label><input type="text" id="um-pass" autocomplete="off"></div>`
            : `<div><label class="f">Status</label><div class="fh" style="gap:8px"><label style="padding:9px 12px"><input type="radio" name="um-aktif" value="1"${u.aktif ? ' checked' : ''}${self ? ' disabled' : ''}> Aktif</label><label style="padding:9px 12px"><input type="radio" name="um-aktif" value="0"${u.aktif ? '' : ' checked'}${self ? ' disabled' : ''}> Nonaktif</label></div></div>`}
        </div>
        ${u ? `<div style="margin-top:14px"><label class="f">Sekolah binaan</label><div class="ro-val">${sks.length ? esc(sks.join(', ')) : '—'} <span class="tiny muted" style="margin-left:auto">diatur di Data Sekolah</span></div></div>` : ''}
        <div id="um-warn"></div>
        <div class="row" style="margin-top:20px">
          <button class="btn pri" data-um="save">${ic('check')}Simpan</button>
          ${u ? `<button class="btn" data-um="reset">${ic('lock')}Reset password</button><span class="spacer"></span>${self ? '' : `<button class="btn danger" data-um="delete">${ic('trash')}Hapus pengguna</button>`}` : ''}
        </div>
      </div></div>`;
    document.body.appendChild(bg);
    const $ = id => bg.querySelector('#' + id);
    const warn = () => {
      $('um-skwrap').style.display = $('um-peran').value === 'kepsek' ? 'block' : 'none';
      const w = $('um-warn'); const msgs = [];
      const nu = $('um-user').value.trim();
      if (u && nu && nu !== u.username) msgs.push(`Username <b>${esc(u.username)}</b> akan diganti menjadi <b>${esc(nu)}</b>. Sekolah, laporan, dan sesi login ikut diperbarui otomatis. Sampaikan username baru ke yang bersangkutan.`);
      if (sks.length && $('um-peran').value !== 'fasilitator') msgs.push(`Pengguna ini memegang <b>${esc(sks.join(', '))}</b>. Dengan peran ${PERAN[$('um-peran').value]}, ia tidak bisa mengisi laporan sekolah tersebut.`);
      w.innerHTML = msgs.map(m => `<div class="banner warn small" style="margin:14px 0 0">${ic('alert')}<div>${m}</div></div>`).join('');
    };
    bg.addEventListener('input', warn); bg.addEventListener('change', warn); warn();
    const close = () => bg.remove();
    bg.addEventListener('click', async e => {
      if (e.target === bg) return close();
      const b = e.target.closest('[data-um]'); if (!b) return;
      const act = b.dataset.um;
      if (act === 'close') return close();
      if (act === 'save') {
        const d = { mode: create ? 'create' : 'edit', username: create ? $('um-user').value.trim() : u.username, nama: $('um-nama').value.trim(),
          nip: $('um-nip').value, peran: $('um-peran').value, sekolahId: $('um-sk').value };
        if (d.peran === 'kepsek' && !d.sekolahId) return toast('Pilih sekolah untuk akun Kepala Sekolah.', true);
        if (create) { d.password = $('um-pass').value; d.aktif = true; }
        else { d.aktif = (bg.querySelector('input[name="um-aktif"]:checked') || {}).value !== '0'; const nu = $('um-user').value.trim(); if (nu !== u.username) d.newUsername = nu; }
        if (!d.username || !d.nama) return toast('Isi username dan nama lengkap.', true);
        b.disabled = true;
        try {
          const r = await API.call('saveUser', { user: d });
          close();
          if (r.info && r.info.renamed) {
            if (eqU(r.info.renamed.from, S.user.username)) S.user.username = r.info.renamed.to;
            toast(`Username diganti menjadi ${r.info.renamed.to}${r.info.reportsUpdated ? ' · ' + r.info.reportsUpdated + ' laporan diperbarui' : ''}.`, false, 5000);
          } else toast(create ? 'Pengguna ' + d.username + ' ditambahkan.' : 'Perubahan tersimpan.');
          await refreshRekap(true); setNav(); renderPengguna();
        } catch (er) { toast(er.message, true, 6000); b.disabled = false; }
      }
      if (act === 'reset') {
        const pw = prompt('Password baru untuk ' + u.username + ' (min. 6 karakter):');
        if (!pw) return;
        try { await API.call('resetPassword', { username: u.username, password: pw }); toast('Password ' + u.username + ' diganti. Sampaikan ke yang bersangkutan.', false, 5000); }
        catch (er) { toast(er.message, true, 5000); }
      }
      if (act === 'delete') {
        if (sks.length) return toast(u.nama + ' masih memegang ' + sks.join(', ') + '. Lepaskan dulu di menu Data Sekolah.', true, 6000);
        if (!confirm('Hapus akun ' + u.username + ' (' + u.nama + ')? Laporan yang pernah diisinya tetap tersimpan.')) return;
        try { await API.call('deleteUser', { username: u.username }); close(); toast('Pengguna ' + u.username + ' dihapus.'); await refreshRekap(true); renderPengguna(); }
        catch (er) { toast(er.message, true, 6000); }
      }
    });
    setTimeout(() => (create ? $('um-user') : $('um-nama')).focus(), 50);
  }

  /* =========================================================
   * PROFIL SAYA
   * ========================================================= */
  async function renderAkun() {
    const n = await Sync.count();
    const u = S.user;
    const mine = S.sekolah.filter(s => inFasil(s, u.username));
    app.innerHTML = pageHead('Profil Saya') + `
      <div class="grid2">
        <div class="card"><div class="row" style="gap:16px;margin-bottom:16px"><span class="avatar" style="padding:0"><span class="bubble" style="width:56px;height:56px;font-size:1.1rem">${esc(initials(u.nama))}</span></span>
          <div><h2 style="margin:0">${esc(u.nama)}</h2><div class="small muted">${esc(u.username)} · ${PERAN[u.peran]}</div></div></div>
          <label class="f">NIP (opsional — dicetak di bawah nama pada tanda tangan jurnal)</label>
          <div class="row" style="flex-wrap:nowrap"><input type="text" id="pf-nip" value="${esc(u.nip)}" placeholder="mis. 19800101 200501 1 001" inputmode="numeric"><button class="btn pri" data-act="profil-save">Simpan</button></div>
          <p class="tiny muted" style="margin:10px 0 0">Nama lengkap & gelar diubah oleh admin.</p>
          ${mine.length ? `<div class="subhead">${ic('school')}<h4>Sekolah binaan</h4></div><div class="small">${mine.map(s => esc(s.nama)).join(' · ')}</div>` : ''}
          <div class="subhead">${ic('cloud')}<h4>Sinkronisasi</h4></div><div class="small">${n ? n + ' perubahan menunggu terkirim ke Google Drive' : 'Semua perubahan sudah tersimpan di Google Drive.'}</div></div>
        <div class="card" id="pw"><div class="card-h">${ic('lock')}<h2>Ganti password</h2></div>
          <label class="f">Password lama</label><input type="password" id="pw-old" autocomplete="current-password">
          <label class="f" style="margin-top:12px">Password baru (min. 6 karakter)</label><input type="password" id="pw-new" autocomplete="new-password">
          <label class="f" style="margin-top:12px">Ulangi password baru</label><input type="password" id="pw-new2" autocomplete="new-password">
          <button class="btn pri" data-act="pw-change" style="margin-top:16px">Simpan password</button>
          <p class="tiny muted" style="margin:10px 0 0">Perangkat lain yang memakai akun ini akan otomatis keluar.</p></div>
      </div>
      <div class="card"><div class="row"><div><b>Keluar dari aplikasi</b><div class="small muted">Salinan data di perangkat ini juga dihapus.</div></div><span class="spacer"></span>
        <button class="btn danger" data-act="logout">${ic('logout')}Keluar</button></div></div>`;
    if (location.hash.endsWith('#pw')) { const el = document.getElementById('pw-old'); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } }
  }

  /* =========================================================
   * EVENT
   * ========================================================= */
  const EDIT_ACTS = new Set(['tempat-sekolah', 'hadir', 'hadir-all', 'hadir-none', 'add-peserta', 'imp-cancel', 'imp-apply', 'tes-del', 'akt-toggle', 'akt-del', 'akt-add', 'keg-reset', 'cap', 'obs-add', 'obs-del', 'teks-reset', 'chip', 'lamp-toggle', 'img-del', 'del-report', 'conf-server', 'conf-mine', 'fh', 'cal', 'cal-nav', 'cal-day', 'rw-inc', 'rw-dec', 'rw-fill0']);

  app.addEventListener('click', async e => {
    const row = e.target.closest('tr[data-href]');
    if (row) { location.hash = row.dataset.href; return; }
    if (!e.target.closest('.datef')) { const cp = document.getElementById('calpop'); if (cp) cp.classList.remove('open'); }
    const cell = e.target.closest('[data-cell]');
    if (cell) {
      const [sid, no] = cell.dataset.cell.split('|');
      const st = statusOf(sid, +no);
      if (st === 'lengkap') return downloadOne(sid, +no);
      if (S.user.peran === 'pemantau') return toast(st === 'kosong' ? 'Laporan belum dibuat.' : st === 'tunggu' ? 'Laporan menunggu pengesahan.' : 'Laporan masih draf.', true);
      location.hash = `#/laporan/${sid}/${no}/1`; return;
    }
    const b = e.target.closest('[data-act]');
    if (!b || (b.tagName === 'INPUT' && b.type !== 'checkbox')) return;
    const act = b.dataset.act, rep = S.cur, s = rep ? school(rep.sekolahId) : null;
    if (rep && readOnly && EDIT_ACTS.has(act) && !(act === 'del-report' && isAdmin())) { e.preventDefault(); return; }
    const editKeg = () => { if (!rep.kegiatan) rep.kegiatan = clone(R.kegiatan(rep)); return rep.kegiatan; };
    switch (act) {
      /* ---- data sekolah ---- */
      case 'sk-new': S.adding = true; renderSekolah(); break;
      case 'sk-cancel': S.adding = false; renderSekolah(); break;
      case 'sk-add': {
        const nama = document.getElementById('ns-nama').value.trim();
        if (!nama) return toast('Isi nama sekolah.', true);
        const f1 = document.getElementById('ns-f1'), f2 = document.getElementById('ns-f2').value;
        const fasil = isAdmin() ? [f1 ? f1.value : '', f2].filter(Boolean) : [S.user.username, f2].filter(Boolean);
        b.disabled = true;
        try {
          const r = await API.call('saveSekolah', { sekolah: { nama, fasil } });
          S.sekolah.push(Object.assign(r, { peserta: [] })); S.adding = false; S.open.add(r.id); cacheBoot();
          renderSekolah(); toast('Sekolah ' + r.nama + ' ditambahkan. Lengkapi kepala sekolah & data guru.', false, 4500);
          const el = document.querySelector(`[data-sk-card="${r.id}"] [data-sk=ksNama]`); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); }
        } catch (er) { toast(er.message, true, 7000); b.disabled = false; }
        break;
      }
      case 'sk-del': {
        const sk = school(b.dataset.sid);
        const n = window.SILABUS.filter(p => statusOf(sk.id, p.no) !== 'kosong').length;
        if (!confirm(`Hapus ${sk.nama}${n ? ' beserta ' + n + ' laporannya' : ''}? Folder sekolah dipindah ke Sampah Google Drive.`)) return;
        try { await API.call('deleteSekolah', { id: sk.id }); S.sekolah = S.sekolah.filter(x => x.id !== sk.id); cacheBoot(); renderSekolah(); toast('Sekolah dihapus.'); } catch (er) { toast(er.message, true, 6000); }
        break;
      }
      case 'kop-del':
        if (!confirm('Hapus gambar kop?')) return;
        try { await API.call('uploadKop', { hapus: true }); S.program.kopId = ''; S.kopData = null; cacheBoot(); renderProgram(); } catch (er) { toast(er.message, true); }
        break;
      case 'paste-toggle': { const el = document.getElementById('paste-' + b.dataset.sid); el.style.display = el.style.display === 'none' ? 'block' : 'none'; break; }
      case 'paste-peserta': {
        const sk = school(b.dataset.sid);
        const n = addPesertaLines(sk, document.querySelector(`[data-paste="${sk.id}"]`).value);
        S.open.add(sk.id); markPeserta(sk.id); renderSekolah(); toast(n + ' guru ditambahkan.'); break;
      }
      case 'guru-add': {
        const sk = school(b.dataset.sid);
        const nm = document.getElementById('ng-nama-' + sk.id).value.trim();
        if (!nm) return toast('Isi nama guru.', true);
        const jab = document.getElementById('ng-jab-' + sk.id).value;
        const kel = jab === 'Guru Kelas' ? document.getElementById('ng-kel-' + sk.id).value : '';
        if ((sk.peserta || []).some(p => I.normName(p.nama) === I.normName(nm))) return toast('Nama ini sudah ada di daftar.', true);
        sk.peserta = sk.peserta || []; sk.peserta.push({ id: R.uid(), nama: prettyName(nm), jabatan: jab, kelas: kel });
        S.open.add(sk.id); markPeserta(sk.id); renderSekolah();
        const el = document.getElementById('ng-nama-' + sk.id); if (el) el.focus();
        break;
      }
      case 'del-peserta': {
        const sk = school(b.dataset.sid);
        sk.peserta = sk.peserta.filter(p => p.id !== b.dataset.id);
        S.open.add(sk.id); markPeserta(sk.id); renderSekolah(); break;
      }
      case 'cal': {
        const pop = document.getElementById('calpop');
        if (pop.classList.contains('open')) { pop.classList.remove('open'); break; }
        const base = rep.tanggal ? new Date(rep.tanggal + 'T00:00:00') : new Date();
        S.cal = { y: base.getFullYear(), m: base.getMonth() }; drawCal(); break;
      }
      case 'cal-nav': { let m = S.cal.m + (+b.dataset.d), y = S.cal.y; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } S.cal = { y, m }; drawCal(); break; }
      case 'cal-day': {
        setTanggal(b.dataset.iso);
        const inp = document.getElementById('tgl'); if (inp) inp.value = isoToDmy(b.dataset.iso);
        document.getElementById('calpop').classList.remove('open'); break;
      }
      case 'fh': {
        const set = R.fasilHadir(rep, s);
        const u = b.dataset.u;
        const next = b.checked ? set.concat(set.some(x => eqU(x, u)) ? [] : [u]) : set.filter(x => !eqU(x, u));
        rep.fasilHadir = fasilOf(s).filter(x => next.some(y => eqU(x, y)));
        touch(); break;
      }
      case 'profil-save': {
        try { const r = await API.call('saveProfile', { nip: document.getElementById('pf-nip').value }); S.user.nip = r.nip; const me = userBy(S.user.username); if (me) me.nip = r.nip; cacheBoot(); toast('Profil tersimpan.'); }
        catch (er) { toast(er.message, true); }
        break;
      }
      /* ---- editor ---- */
      case 'rw-inc': case 'rw-dec': {
        const id = b.dataset.id, cur = Number((rep.reward || {})[id]) || 0;
        const v = act === 'rw-inc' ? cur + 1 : Math.max(0, cur - 1);
        setReward(id, v);
        const inp = document.querySelector(`[data-rw="${id}"]`); if (inp) inp.value = v;
        break;
      }
      case 'rw-fill0': {
        rep.reward = rep.reward || {};
        R.hadirList(rep, s).forEach(p => { if (R.rewardHadir(rep)[p.id] === undefined) rep.reward[p.id] = 0; });
        touch(); rerenderStep(); break;
      }
      case 'rw-sk': S.rwSk = b.dataset.sid; renderReward(); break;
      case 'sahkan': {
        const sebagai = isKepsek() ? 'Kepala Sekolah' : 'Fasilitator';
        if (!confirm(`Sahkan laporan ${s.nama} P${rep.no} sebagai ${sebagai}?\n\nDengan mengesahkan, Anda menyatakan sudah memeriksa isi laporan ini. Kode QR atas nama Anda akan tercetak di PDF.`)) return;
        b.disabled = true;
        try {
          const list = await API.call('sahkan', { key: rep.key, baseVersion: rep._version || 0 });
          S.sah.set(rep.key, list); cacheBoot(); renderEditor(); toast('Laporan disahkan sebagai ' + sebagai + '.');
        } catch (er) {
          toast(er.offline ? 'Pengesahan perlu koneksi internet.' : er.message, true, 6000); b.disabled = false;
          if (er.code === 'CONFLICT') { refreshFromServer(rep.key); refreshRekap(true); }
        }
        break;
      }
      case 'unlock': {
        const n = (S.sah.get(rep.key) || []).length;
        if (!confirm(`Buka kunci laporan ini?\n\n${n} pengesahan akan dibatalkan. Setelah selesai mengubah, fasilitator dan kepala sekolah perlu mengesahkan ulang.`)) return;
        b.disabled = true;
        try { await API.call('batalSah', { key: rep.key }); S.sah.delete(rep.key); cacheBoot(); renderEditor(); toast('Kunci dibuka. Pengesahan sebelumnya dibatalkan.'); }
        catch (er) { toast(er.offline ? 'Membuka kunci perlu koneksi internet.' : er.message, true, 6000); b.disabled = false; }
        break;
      }
      case 'tempat-sekolah': rep.tempat = s.nama; document.querySelector('[data-r=tempat]').value = s.nama; touch(); updatePreviews(); break;
      case 'hadir': {
        const set = new Set(rep.hadir || []);
        b.checked ? set.add(b.dataset.id) : set.delete(b.dataset.id);
        rep.hadir = [...set]; touch(); updatePreviews(); break;
      }
      case 'hadir-all': case 'hadir-none': {
        const set = new Set(rep.hadir || []);
        R.relevantPeserta(s, rep.no, S.showAll).forEach(p => act === 'hadir-all' ? set.add(p.id) : set.delete(p.id));
        rep.hadir = [...set]; touch(); rerenderStep(); break;
      }
      case 'showall': S.showAll = b.checked; rerenderStep(); break;
      case 'add-peserta': {
        const nama = document.getElementById('np-nama').value.trim();
        if (!nama) return toast('Isi nama peserta.', true);
        const jab = document.getElementById('np-jab').value, kel = jab === 'Guru Kelas' ? document.getElementById('np-kel').value : '';
        const p = { id: R.uid(), nama: prettyName(nama), jabatan: jab, kelas: kel };
        s.peserta = s.peserta || []; s.peserta.push(p);
        rep.hadir = (rep.hadir || []).concat(p.id);
        markPeserta(s.id); touch(); rerenderStep(); break;
      }
      case 'imp-cancel': S.imp = null; rerenderStep(); break;
      case 'imp-apply': applyImport(); break;
      case 'tes-del': if (confirm('Hapus data nilai pretes/postes laporan ini?')) { rep.tes = null; touch(); rerenderStep(); } break;
      case 'akt-toggle': { const k = editKeg(); k[b.dataset.si].aktivitas[b.dataset.ai].aktif = b.checked; b.closest('.akt').classList.toggle('off', !b.checked); touch(); break; }
      case 'akt-del': { const k = editKeg(); k[b.dataset.si].aktivitas.splice(b.dataset.ai, 1); touch(); rerenderStep(); break; }
      case 'akt-add': { const k = editKeg(); k[b.dataset.si].aktivitas.push({ teks: '', aktif: true }); touch(); rerenderStep();
        const ins = document.querySelectorAll(`[data-akt^="${b.dataset.si}|"]`); if (ins.length) ins[ins.length - 1].focus(); break; }
      case 'keg-reset': if (confirm('Kembalikan langkah kegiatan sesuai silabus? Perubahan teks & catatan sesi akan hilang.')) { rep.kegiatan = null; touch(); rerenderStep(); } break;
      case 'cap': rep.capaian[b.dataset.id] = b.dataset.v; touch(); rerenderStep(); break;
      case 'obs-add': rep.observasi = (rep.observasi || []).concat({ guru: '', kelas: '', kekuatan: '', perbaikan: '', tindakLanjut: '' }); touch(); rerenderStep(); break;
      case 'obs-del': rep.observasi.splice(+b.dataset.i, 1); touch(); rerenderStep(); break;
      case 'teks-reset': rep.teks[b.dataset.k] = ''; touch(); rerenderStep(); break;
      case 'chip': {
        const k = b.dataset.k; const cur = (rep[k] || '').trim();
        rep[k] = cur ? cur + '\n' + b.dataset.t : b.dataset.t;
        document.querySelector(`[data-r="${k}"]`).value = rep[k]; touch(); break;
      }
      case 'lamp-toggle': rep.lampiran[b.dataset.k] = b.checked; touch(); break;
      case 'img-del': {
        const list = listByKey(rep.lampiran, b.dataset.list);
        const id = b.dataset.id;
        const i = list.indexOf(id); if (i >= 0) list.splice(i, 1);
        if (id.startsWith('tmp_')) { for (const p of await DB.all('pending')) if (p.tmpId === id) await DB.del('pending', p.id); await DB.del('images', id); }
        else { S.delQueue.push(id); await kvSet('delQueue', S.delQueue); }
        touch(); rerenderStep(); break;
      }
      case 'conf-server': {
        try {
          const g = await API.call('getReport', { key: rep.key });
          S.cur = normalize(Object.assign(g.report || R.blank(rep.sekolahId, rep.no), { _version: g.version }));
          await DB.put('reports', clone(S.cur), rep.key); S.local.delete(rep.key);
          renderEditor(); toast('Versi server dimuat.');
        } catch (er) { toast(er.message, true); }
        break;
      }
      case 'conf-mine': rep._conflict = null; rep._force = true; touch(); await flushCur(); Sync.run(); rerenderStep(); break;
      case 'preview': b.disabled = true; try { await previewPdf(); } catch (er) { console.error(er); toast('Gagal menyusun PDF: ' + er.message, true, 6000); } b.disabled = false; break;
      case 'download': b.disabled = true; try { await downloadCur(); } catch (er) { console.error(er); toast('Gagal menyusun PDF: ' + er.message, true, 6000); } b.disabled = !isFinal(rep, s); break;
      case 'del-report':
        if (!confirm('Hapus laporan ini? Folder laporan (isian, foto, PDF) dipindah ke Sampah Google Drive.')) return;
        try {
          if (rep._version > 0) await API.call('deleteReport', { key: rep.key });
          await DB.del('reports', rep.key); S.rekap.delete(rep.key); S.local.delete(rep.key); cacheBoot();
          S.cur = null; location.hash = listHash(s.id); toast('Laporan dihapus.');
        } catch (er) { toast(er.message, true); }
        break;
      /* ---- unduh ---- */
      case 'bulk-no': {
        const no = +document.getElementById('bulkNo').value;
        b.disabled = true;
        try { await bulkZip(S.sekolah.filter(x => statusOf(x.id, no) === 'lengkap').map(x => ({ s: x, no })), 'Laporan_CERMAT_P' + String(no).padStart(2, '0') + '_semua_sekolah.zip'); }
        catch (er) { toast(er.message, true, 5000); }
        b.disabled = false; break;
      }
      case 'bulk-sk': {
        const sk = school(document.getElementById('bulkSk').value);
        b.disabled = true;
        try { await bulkZip(window.SILABUS.filter(p => statusOf(sk.id, p.no) === 'lengkap').map(p => ({ s: sk, no: p.no })), 'Laporan_CERMAT_' + sk.nama.replace(/[^A-Za-z0-9]+/g, '_') + '_P01-P22.zip'); }
        catch (er) { toast(er.message, true, 5000); }
        b.disabled = false; break;
      }
      /* ---- pengguna ---- */
      case 'user-new': openUserModal(null); break;
      case 'user-edit': openUserModal(b.dataset.u); break;
      case 'user-save': {
        const tr = b.closest('tr');
        const d = { username: tr.dataset.user, nama: tr.querySelector('[data-uf=nama]').value, nip: tr.querySelector('[data-uf=nip]').value, peran: tr.querySelector('[data-uf=peran]').value, aktif: tr.querySelector('[data-uf=aktif]').checked };
        try { await API.call('saveUser', { user: d }); toast('Tersimpan.'); renderPengguna(); } catch (er) { toast(er.message, true, 5000); }
        break;
      }
      case 'user-reset': {
        const u = b.closest('tr').dataset.user;
        const pw = prompt('Password baru untuk ' + u + ' (min. 6 karakter):');
        if (!pw) return;
        try { await API.call('resetPassword', { username: u, password: pw }); toast('Password ' + u + ' diganti. Sampaikan ke yang bersangkutan.', false, 5000); } catch (er) { toast(er.message, true, 5000); }
        break;
      }
      case 'user-add': {
        const d = { username: document.getElementById('nu-user').value.trim(), nama: document.getElementById('nu-nama').value.trim(), peran: document.getElementById('nu-peran').value, password: document.getElementById('nu-pass').value, aktif: true };
        if (S.pengguna.some(u => eqU(u.username, d.username))) return toast('Username sudah dipakai.', true);
        try { await API.call('saveUser', { user: d }); toast('Pengguna ' + d.username + ' ditambahkan.'); renderPengguna(); } catch (er) { toast(er.message, true, 5000); }
        break;
      }
      /* ---- akun ---- */
      case 'pw-change': {
        const o = document.getElementById('pw-old').value, n1 = document.getElementById('pw-new').value, n2 = document.getElementById('pw-new2').value;
        if (n1 !== n2) return toast('Password baru tidak sama.', true);
        try { await API.call('changePassword', { old: o, baru: n1 }); toast('Password diganti.'); renderAkun(); } catch (er) { toast(er.message, true, 5000); }
        break;
      }
      case 'logout': await logout(); break;
    }
  });

  app.addEventListener('input', e => {
    const t = e.target, rep = S.cur;
    if (t.dataset.prog) { S.program[t.dataset.prog] = t.value; saveProgramDeb(); return; }
    if (t.dataset.sk && t.tagName === 'INPUT') {
      const sk = school(t.dataset.sid); if (!canEdit(sk)) return;
      sk[t.dataset.sk] = t.value;
      if (t.dataset.sk === 'ksNama' && syncKs(sk)) markPeserta(sk.id);
      saveSekolahDeb(sk.id); return;
    }
    if (t.dataset.pn) {
      const [sid, pid] = t.dataset.pn.split('|'); const sk = school(sid); if (!canEdit(sk)) return;
      const p = sk.peserta.find(x => x.id === pid); if (p) { p.nama = t.value; markPeserta(sid); }
      return;
    }
    if (!rep || readOnly) return;
    if (t.dataset.date) {
      let d = t.value.replace(/\D/g, '').slice(0, 8);
      if (d.length > 4) d = d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4); else if (d.length > 2) d = d.slice(0, 2) + '/' + d.slice(2);
      if (t.value !== d) t.value = d;
      if (!d) setTanggal('');
      else if (d.length === 10) setTanggal(dmyToIso(d));
      else { const h = document.getElementById('tgl-hari'); if (h) h.textContent = 'Format DD/MM/YYYY'; }
      return;
    }
    if (t.dataset.r) { rep[t.dataset.r] = t.value; touch(); updatePreviews(); return; }
    if (t.dataset.rw) {
      const d = t.value.replace(/\D/g, '').slice(0, 3);
      if (t.value !== d) t.value = d;
      setReward(t.dataset.rw, d === '' ? '' : +d); return;
    }
    if (t.dataset.akt) { if (!rep.kegiatan) rep.kegiatan = clone(R.kegiatan(rep)); const [si, ai] = t.dataset.akt.split('|'); rep.kegiatan[si].aktivitas[ai].teks = t.value; touch(); return; }
    if (t.dataset.cat !== undefined) { if (!rep.kegiatan) rep.kegiatan = clone(R.kegiatan(rep)); rep.kegiatan[t.dataset.cat].catatan = t.value; touch(); return; }
    if (t.dataset.obs) { const [i, f] = t.dataset.obs.split('|'); rep.observasi[i][f] = t.value; touch(); return; }
    if (t.dataset.teks) {
      const k = t.dataset.teks;
      rep.teks[k] = t.value.trim() === autoTeks(rep, k).trim() ? '' : t.value;
      const m = document.getElementById('tm-' + k); if (m) m.textContent = rep.teks[k] ? 'diedit manual' : 'otomatis';
      touch();
    }
  });

  app.addEventListener('change', async e => {
    const t = e.target, rep = S.cur;
    if (t.id === 'bulkNo' || t.id === 'bulkSk') return updateBulkInfo();
    if (t.id === 'rwSk') { S.rwSk = t.value; return renderReward(); }
    if (t.dataset.fs) {
      const sk = school(t.dataset.sid); if (!canEdit(sk)) return;
      let f = fasilOf(sk).slice();
      if (t.dataset.fs === 'partner') f = [S.user.username].concat(t.value ? [t.value] : []);
      else { f[+t.dataset.fs] = t.value; f = f.filter(Boolean); }
      sk.fasil = f.filter((x, i) => f.findIndex(y => eqU(x, y)) === i);
      saveSekolahDeb(sk.id); cacheBoot(); return;
    }
    if (t.dataset.act === 'kop' && t.files[0]) {
      try {
        toast('Mengunggah kop…', false, 1500);
        const data = await compressImage(t.files[0], 2400, 0.9, true);
        const r = await API.call('uploadKop', { b64: data.split(',')[1], mime: mimeOf(data), nama: 'kop' });
        S.program.kopId = r.kopId; const rec = { id: r.kopId, data }; S.imgCache.set(r.kopId, rec); await DB.put('images', rec);
        cacheBoot(); renderProgram(); toast('Kop tersimpan.');
      } catch (er) { toast(er.message, true, 5000); }
      return;
    }
    if (t.dataset.pj) {
      const [sid, pid, f] = t.dataset.pj.split('|');
      const sk = school(sid); if (!canEdit(sk)) return;
      const p = sk.peserta.find(x => x.id === pid);
      p[f] = t.value; if (f === 'jabatan' && t.value !== 'Guru Kelas') p.kelas = '';
      markPeserta(sid);
      if (rep) { if (rep.no && R.groupKelas(rep.no)) touch(); rerenderStep(); } else { S.open.add(sid); renderSekolah(); }
      return;
    }
    if (!rep || readOnly) return;
    if (t.dataset.act === 'imp-file' && t.files[0]) return importFile(t.files[0], t.dataset.mode);
    if (t.dataset.impCol) { S.imp.cols[t.dataset.impCol] = parseInt(t.value, 10); if (t.dataset.impCol === 'sekolah') autoSchools(S.imp, school(rep.sekolahId)); rerenderStep(); return; }
    if (t.dataset.impSchool !== undefined) { t.checked ? S.imp.schools.add(t.dataset.impSchool) : S.imp.schools.delete(t.dataset.impSchool); rerenderStep(); return; }
    if (t.dataset.up && t.files.length) {
      const list = listByKey(rep.lampiran, t.dataset.up);
      const scan = t.dataset.up !== 'foto';
      const files = [...t.files];
      const jenis = t.dataset.up.startsWith('porto:') ? 'portofolio' : t.dataset.up;
      for (let i = 0; i < files.length; i++) {
        try {
          const data = await compressImage(files[i], scan ? 1800 : 1400, scan ? 0.8 : 0.74);
          const tmpId = 'tmp_' + R.uid();
          const rec = { id: tmpId, data };
          await DB.put('images', rec); S.imgCache.set(tmpId, rec);
          const nama = (jenis === 'portofolio' ? t.dataset.up.slice(6).replace(/[^\w.-]+/g, '_').slice(0, 40) : jenis) + '-' + Date.now().toString(36) + '.jpg';
          await DB.put('pending', { id: tmpId, tmpId, key: rep.key, jenis, nama, judul: R.sil(rep.no).judul });
          list.push(tmpId);
        } catch (er) { toast(er.message, true); }
      }
      touch(); await flushCur(); rerenderStep(); Sync.run();
    }
  });

  function updatePreviews() {
    const rep = S.cur; if (!rep) return; const s = school(rep.sekolahId);
    const a = document.getElementById('pv-pel'); if (a) a.textContent = R.kalimatPelaksanaan(rep, s);
    const b = document.getElementById('pv-pes'); if (b) b.textContent = R.kalimatPeserta(rep, s);
    const hn = document.getElementById('hadirN'); if (hn) hn.textContent = R.hadirList(rep, s).length;
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => Sync.run());
  window.addEventListener('beforeunload', e => {
    if (S.cur && S.cur._dirty) DB.put('reports', clone(S.cur), S.cur.key);
    if (Sync.state !== 'ok' || (S.cur && S.cur._dirty) || S.pesertaDirty.size) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- Mulai ---------- */
  (async function init() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/[?&]nosw/.test(location.search)) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (!API.configured()) return renderConfigMissing();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* abaikan */ }
    API.token = localStorage.getItem('cermat_token');
    if (!API.token) return renderLogin();
    await boot(false);
  })();
})();
