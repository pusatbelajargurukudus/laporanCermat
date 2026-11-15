/* LAPORAN CERMAT v2 — antarmuka (multi-pengguna, data di Google Drive lewat Apps Script). */
(function () {
  const R = window.Report, I = window.Importer;
  const app = document.getElementById('app');
  const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const JABATAN = ['', 'Kepala Sekolah', 'Guru Kelas', 'Guru Mapel', 'Tenaga Kependidikan'];
  const KELAS = ['', '1', '2', '3', '4', '5', '6'];
  const PERAN = { admin: 'Admin', fasilitator: 'Fasilitator', pemantau: 'Pemantau' };
  const eqU = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

  const S = {
    user: null, program: {}, sekolah: [], pengguna: [], rekap: new Map(),
    local: new Map(),            // key -> { status, dirty } dari salinan lokal
    pesertaDirty: new Set(), delQueue: [],
    cur: null, step: 1, imp: null, showAll: false, openPeserta: null,
    imgCache: new Map(), kopData: null, lastRekap: 0
  };

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
  const fasilNama = s => { const u = s && userBy(s.fasil); return u ? u.nama : ''; };
  const isAdmin = () => S.user && S.user.peran === 'admin';
  const canEdit = s => !!(S.user && s && (S.user.peran === 'admin' || (S.user.peran === 'fasilitator' && eqU(s.fasil, S.user.username))));
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
    kvSet('boot', { user: S.user, program: S.program, sekolah: S.sekolah.map(s => { const o = Object.assign({}, s); delete o.peserta; return o; }), peserta, pengguna: S.pengguna, rekap: [...S.rekap.values()] });
  }, 500);

  function applyBoot(b) {
    const prev = new Map(S.sekolah.map(s => [s.id, s.peserta]));
    S.user = b.user; S.program = b.program || {}; S.pengguna = b.pengguna || [];
    S.sekolah = (b.sekolah || []).map(s => Object.assign({}, s, {
      peserta: S.pesertaDirty.has(s.id) && prev.get(s.id) ? prev.get(s.id) : (b.peserta || []).filter(p => p.sekolahId === s.id).map(p => ({ id: p.id, nama: p.nama, jabatan: p.jabatan, kelas: p.kelas }))
    }));
    S.rekap = new Map((b.rekap || []).map(r => [r.key, r]));
  }

  async function loadLocalStatus() {
    S.local = new Map();
    for (const r of await DB.all('reports')) {
      const s = school(r.sekolahId);
      if (s && r._dirty) S.local.set(r.key, { status: R.status(normalize(r), s), dirty: true });
    }
  }
  function statusOf(sid, no) {
    const key = R.key(sid, no);
    const l = S.local.get(key);
    if (l && l.dirty) return l.status;
    const r = S.rekap.get(key);
    return r ? (r.status === 'lengkap' ? 'lengkap' : 'draf') : 'kosong';
  }

  async function refreshRekap(force) {
    if (!force && Date.now() - S.lastRekap < 20000) return false;
    try {
      const list = await API.call('rekap');
      S.rekap = new Map(list.map(r => [r.key, r])); S.lastRekap = Date.now(); cacheBoot();
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
  function pdfSettings(s) { return Object.assign({}, S.program, { fasilitator: fasilNama(s), kop: S.kopData }); }

  /* =========================================================
   * SINKRONISASI
   * ========================================================= */
  const persistCur = debounce(() => { if (S.cur && S.cur._dirty) DB.put('reports', clone(S.cur), S.cur.key); }, 300);
  async function flushCur() { if (S.cur && S.cur._dirty) await DB.put('reports', clone(S.cur), S.cur.key); }

  function touch() {
    const r = S.cur; if (!r) return;
    r._rev = (r._rev || 0) + 1; r._dirty = true; r.updatedAt = Date.now();
    S.local.set(r.key, { status: R.status(r, school(r.sekolahId)), dirty: true });
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
      updatedAt: res.updatedAt, updatedBy: res.updatedBy, version: res.version }));
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
    const el = document.getElementById('syncind'); if (!el) return;
    const n = await Sync.count();
    let t, c;
    if (state === 'busy') { t = '⟳ Menyimpan ke Drive…'; c = 'busy'; }
    else if (state === 'wait' || (state === 'ok' && n)) { t = n ? '● ' + n + ' perubahan menunggu' : '● Akan disimpan…'; c = 'wait'; }
    else if (state === 'offline') { t = '⚠ Offline' + (n ? ' · ' + n + ' menunggu' : ''); c = 'bad'; }
    else if (state === 'error') { t = '⚠ Gagal sinkron'; c = 'bad'; }
    else { t = '✓ Tersinkron'; c = 'ok'; }
    el.textContent = t; el.className = 'sync ' + c; el.title = msg || '';
  }

  /* =========================================================
   * LOGIN / BOOT
   * ========================================================= */
  function renderConfigMissing() {
    app.innerHTML = `<div class="card login"><h2>Aplikasi belum terhubung ke server</h2>
      <p>Isi <code>API_URL</code> di file <code>js/config.js</code> dengan URL Web App Apps Script (berakhiran <code>/exec</code>), lalu unggah ulang ke GitHub.</p>
      <p class="small muted">Panduan lengkap ada di <b>PANDUAN-DEPLOY.md</b>.</p></div>`;
  }

  function renderLogin(msg) {
    setNav();
    app.innerHTML = `<div class="card login"><div class="login-logo">📊</div><h2>Masuk LAPORAN CERMAT</h2>
      <p class="muted small">Gunakan username dan password yang diberikan admin.</p>
      <form id="loginForm"><label class="f">Username</label><input type="text" id="lu" autocomplete="username" required>
      <label class="f" style="margin-top:10px">Password</label><input type="password" id="lp" autocomplete="current-password" required>
      ${msg ? `<div class="banner bad small" style="margin-top:10px">${esc(msg)}</div>` : ''}
      <button class="btn pri" style="width:100%;margin-top:14px" id="lb">Masuk</button></form></div>`;
    document.getElementById('lu').focus();
    document.getElementById('loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const b = document.getElementById('lb'); b.disabled = true; b.textContent = 'Memeriksa…';
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
    if (cached) { applyBoot(cached); await loadLocalStatus(); setNav(); }
    try {
      const b = await API.call('bootstrap');
      if (cached && !eqU(cached.user.username, b.user.username)) { await DB.wipe(); S.pesertaDirty = new Set(); S.delQueue = []; }
      applyBoot(b); S.lastRekap = Date.now();
      await kvSet('boot', b);
      cacheBoot();
    } catch (e) {
      if (e.code === 'AUTH') return;
      if (!cached) { app.innerHTML = `<div class="card login"><h2>Tidak bisa terhubung</h2><p>${esc(e.message)}</p><button class="btn pri" onclick="location.reload()">Coba lagi</button></div>`; return; }
      toast('Offline — menampilkan data tersimpan di perangkat ini.', true, 5000);
      setSync('offline');
    }
    await loadLocalStatus();
    setNav();
    if (!location.hash || location.hash === '#/' || location.hash === '#/login') location.hash = S.user.peran === 'pemantau' ? '#/unduh' : '#/buat';
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
  function setNav() {
    const nav = document.getElementById('nav');
    const u = S.user;
    if (!u) { nav.innerHTML = ''; return; }
    const items = [['sekolah', 'Data Sekolah', 'Sekolah']];
    if (u.peran !== 'pemantau') items.push(['buat', 'Buat Laporan', 'Buat']);
    items.push(['unduh', 'Unduh Laporan', 'Unduh']);
    if (u.peran === 'admin') items.push(['pengguna', 'Kelola Pengguna', 'Pengguna']);
    nav.innerHTML = items.map(([k, l, s]) => `<a href="#/${k}" data-nav="${k}"><span class="lg">${l}</span><span class="sm">${s}</span></a>`).join('') +
      `<span class="sync ok" id="syncind">✓ Tersinkron</span><a href="#/akun" data-nav="akun" class="me" title="Akun saya">${esc(u.nama.split(',')[0])} · ${PERAN[u.peran]}</a>`;
    setSync(Sync.state);
  }

  async function route() {
    if (!API.configured()) return renderConfigMissing();
    if (!S.user) return renderLogin();
    const h = location.hash.replace(/^#\/?/, '');
    const parts = h.split('/');
    const top = parts[0] === 'laporan' ? 'buat' : parts[0];
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === top));
    window.scrollTo(0, 0);
    if (parts[0] !== 'laporan') { await flushCur(); S.cur = null; }
    switch (parts[0]) {
      case 'sekolah': return renderSekolah();
      case 'buat': return parts[1] ? renderPilihP(parts[1]) : renderBuat();
      case 'laporan': return openReport(parts[1], parseInt(parts[2], 10), parseInt(parts[3] || '1', 10));
      case 'unduh': return renderUnduh();
      case 'pengguna': return isAdmin() ? renderPengguna() : (location.hash = '#/buat');
      case 'akun': return renderAkun();
      default: location.hash = S.user.peran === 'pemantau' ? '#/unduh' : '#/buat';
    }
  }

  /* =========================================================
   * MENU 1 — DATA SEKOLAH BINAAN
   * ========================================================= */
  function renderSekolah() {
    const adm = isAdmin();
    const P = S.program;
    const f = (k, label, ph) => `<div><label class="f">${label}</label><input type="text" data-prog="${k}" value="${esc(P[k])}" placeholder="${esc(ph || '')}"${adm ? '' : ' disabled'}></div>`;
    const fasilOpts = [''].concat(S.pengguna.filter(u => u.aktif && u.peran !== 'pemantau').map(u => u.username));
    const fasilLbl = ['— belum ditentukan —'].concat(S.pengguna.filter(u => u.aktif && u.peran !== 'pemantau').map(u => u.nama + ' (' + u.username + ')'));
    app.innerHTML = `
      <h1 class="pg">Data Sekolah Binaan</h1>
      <details class="card adv0"${adm && !S.sekolah.length ? ' open' : ''}><summary><b>Data program</b> <span class="small muted">— sampul, jurnal, kop</span></summary>
        <div class="grid2" style="margin-top:10px">
          ${f('program', 'Nama program (sampul)', 'CERMAT')}
          ${f('programKepanjangan', 'Kepanjangan program')}
          ${f('penyelenggara', 'Penyelenggara')}
          ${f('pjJabatan', 'Jabatan penanggung jawab (jurnal)')}
          ${f('pjNama', 'Nama penanggung jawab (jurnal)')}
          ${f('pjNip', 'NIP penanggung jawab (opsional)')}
        </div>
        <label class="f" style="margin-top:12px">Kop / logo di atas setiap halaman PDF</label>
        <div id="kopPrev" class="small muted">${P.kopId ? 'Memuat kop…' : 'Belum ada kop.'}</div>
        ${adm ? `<div class="row" style="margin-top:8px"><label class="btn upl">Pilih gambar kop<input type="file" accept="image/*" data-act="kop"></label>${P.kopId ? '<button class="btn danger" data-act="kop-del">Hapus kop</button>' : ''}</div>` : ''}
        ${adm ? '' : '<p class="small muted">Hanya admin yang dapat mengubah data program.</p>'}
      </details>
      ${S.sekolah.length ? '' : `<div class="banner info">Belum ada sekolah binaan.${adm ? ' Tambahkan di bagian bawah.' : ' Hubungi admin untuk menambahkan.'}</div>`}
      ${S.sekolah.map(s => sekolahCard(s, adm, fasilOpts, fasilLbl)).join('')}
      ${adm ? `<div class="card"><h3>Tambah sekolah</h3><label class="f">Satu nama per baris (bisa sekaligus 9)</label>
        <textarea id="newSchools" placeholder="SD 3 Terban&#10;SD 1 Jati Kulon&#10;…" style="min-height:70px"></textarea>
        <button class="btn pri" data-act="add-schools" style="margin-top:6px">Tambah sekolah</button></div>` : ''}`;
    if (P.kopId) ensureKop().then(() => { const el = document.getElementById('kopPrev'); if (el) el.innerHTML = S.kopData ? `<img class="kop-prev" src="${S.kopData}" alt="Kop">` : 'Kop tidak bisa dimuat.'; });
  }

  function sekolahCard(s, adm, fasilOpts, fasilLbl) {
    const open = S.openPeserta === s.id;
    const ed = canEdit(s);
    const ps = R.sortPeserta(s.peserta || []);
    const lengkap = window.SILABUS.filter(p => statusOf(s.id, p.no) === 'lengkap').length;
    const mine = S.user.peran === 'fasilitator' && eqU(s.fasil, S.user.username);
    return `<div class="card sk-card${mine ? ' mine' : ''}">
      <div class="row"><h3 style="margin:0">${esc(s.nama)}</h3>${mine ? '<span class="pill lengkap">Sekolah Anda</span>' : ''}<span class="spacer"></span>
        <span class="small muted">${lengkap}/22 lengkap · ${ps.length} peserta</span></div>
      ${adm ? `<div class="grid2" style="margin-top:10px">
        <div><label class="f">Nama sekolah</label><input type="text" data-sk="nama" data-sid="${s.id}" value="${esc(s.nama)}"></div>
        <div><label class="f">Fasilitator pemegang</label><select data-sk="fasil" data-sid="${s.id}">${opts(fasilOpts, s.fasil, fasilLbl)}</select></div>
        <div><label class="f">Nama lain di Google Form (pisahkan koma)</label><input type="text" data-sk="alias" data-sid="${s.id}" value="${esc((s.alias || []).join(', '))}" placeholder="mis. SDN 3 Terban"></div></div>`
        : `<p class="small" style="margin:6px 0 0">Fasilitator: <b>${esc(fasilNama(s) || '— belum ditentukan —')}</b></p>`}
      <div class="row" style="margin-top:10px"><button class="btn sm" data-act="toggle-peserta" data-sid="${s.id}">${open ? 'Tutup' : (ed ? 'Kelola' : 'Lihat')} peserta (${ps.length})</button>
      ${S.user.peran !== 'pemantau' ? `<a class="btn sm" href="#/buat/${s.id}">Laporan →</a>` : ''}
      <span class="spacer"></span>${adm ? `<button class="btn sm danger" data-act="del-school" data-sid="${s.id}">Hapus sekolah</button>` : ''}</div>
      ${open ? `<div style="margin-top:10px">
        ${ed ? '<p class="small muted">Daftar juga terbentuk otomatis saat mengimpor nilai pretes/postes. Jabatan & kelas dipakai menyaring peserta di pendampingan per kelompok kelas.</p>' : ''}
        ${ps.length ? `<div class="peserta-list">${ps.map(p => pesertaRow(s, p, false, null, null, ed)).join('')}</div>` : '<p class="small muted">Belum ada peserta.</p>'}
        ${ed ? `<label class="f" style="margin-top:10px">Tempel daftar peserta (satu per baris: <i>Nama, Jabatan/Kelas</i>)</label>
        <textarea data-paste="${s.id}" placeholder="Siti Aminah, Kepala Sekolah&#10;Budi Santoso, Guru Kelas 3&#10;Rina, Guru PAI" style="min-height:70px"></textarea>
        <button class="btn sm pri" data-act="paste-peserta" data-sid="${s.id}" style="margin-top:6px">Tambahkan ke daftar</button>` : ''}</div>` : ''}
    </div>`;
  }

  function pesertaRow(s, p, withCheck, hadirSet, rep, ed) {
    let extra = '';
    if (rep && R.hasTes(rep.no) && rep.tes) {
      const sk = R.skorPeserta(rep, p.nama);
      extra = `<small>Pretes ${sk.pre === null ? '–' : R.fmt(sk.pre)} · Postes ${sk.post === null ? '–' : R.fmt(sk.post)}</small>`;
    }
    const dis = ed ? '' : ' disabled';
    return `<div class="pr">
      ${withCheck ? `<input type="checkbox" data-act="hadir" data-id="${p.id}"${hadirSet.has(p.id) ? ' checked' : ''}${dis}>` : '<span></span>'}
      <div class="nm">${esc(p.nama)}${extra}</div>
      <select class="pj" data-pj="${s.id}|${p.id}|jabatan"${dis}>${opts(JABATAN, p.jabatan, ['— jabatan —'].concat(JABATAN.slice(1)))}</select>
      <select class="pk" data-pj="${s.id}|${p.id}|kelas"${p.jabatan === 'Guru Kelas' && ed ? '' : ' disabled'}>${opts(KELAS, p.kelas, ['kelas', '1', '2', '3', '4', '5', '6'])}</select>
      ${withCheck || !ed ? '<span></span>' : `<button class="btn sm danger" data-act="del-peserta" data-sid="${s.id}" data-id="${p.id}" title="Hapus">×</button>`}
    </div>`;
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
      const exist = s.peserta.find(p => I.normName(p.nama) === I.normName(nama));
      if (exist) { if (!exist.jabatan && pj.jabatan) Object.assign(exist, pj); return; }
      s.peserta.push({ id: R.uid(), nama: prettyName(nama), jabatan: pj.jabatan, kelas: pj.kelas });
      n++;
    });
    return n;
  }

  const saveSekolahDeb = debounceBy(async sid => {
    const s = school(sid); if (!s) return;
    try { await API.call('saveSekolah', { sekolah: { id: s.id, nama: s.nama, alias: s.alias, fasil: s.fasil, urutan: s.urutan } }); cacheBoot(); }
    catch (e) { toast(e.message, true, 5000); }
  }, 700);
  const saveProgramDeb = debounce(async () => {
    try { S.program = await API.call('saveProgram', { program: S.program }); cacheBoot(); }
    catch (e) { toast(e.message, true, 5000); }
  }, 800);

  /* =========================================================
   * MENU 2 — BUAT LAPORAN
   * ========================================================= */
  async function renderBuat() {
    const draw = () => {
      const mine = S.sekolah.filter(s => canEdit(s));
      const other = S.sekolah.filter(s => !canEdit(s));
      const card = s => {
        const st = window.SILABUS.map(p => statusOf(s.id, p.no));
        const l = st.filter(x => x === 'lengkap').length, d = st.filter(x => x === 'draf').length;
        return `<a class="card pick" href="#/buat/${s.id}"><div class="row"><b>${esc(s.nama)}</b><span class="spacer"></span><span class="pill ${l === 22 ? 'lengkap' : d || l ? 'draf' : 'kosong'}">${l}/22</span></div>
          <div class="small muted">${esc(fasilNama(s) || 'Fasilitator belum ditentukan')}</div>
          <div class="bar"><i style="width:${l / 22 * 100}%"></i><i class="d" style="width:${d / 22 * 100}%"></i></div></a>`;
      };
      app.innerHTML = `<h1 class="pg">Buat Laporan</h1>
        ${S.sekolah.length ? '' : '<div class="banner info">Belum ada sekolah binaan. Admin perlu menambahkannya di menu Data Sekolah.</div>'}
        ${mine.length ? `<h3>${isAdmin() ? 'Semua sekolah' : 'Sekolah yang Anda pegang'}</h3><div class="picks">${mine.map(card).join('')}</div>` :
          (S.user.peran === 'fasilitator' ? '<div class="banner warn">Anda belum ditugaskan ke sekolah mana pun. Hubungi admin.</div>' : '')}
        ${other.length ? `<h3 style="margin-top:18px">Sekolah lain <span class="small muted">(hanya baca)</span></h3><div class="picks">${other.map(card).join('')}</div>` : ''}`;
    };
    draw();
    if (await refreshRekap()) { if (location.hash === '#/buat') draw(); }
  }

  async function renderPilihP(sid) {
    const s = school(sid);
    if (!s) { app.innerHTML = '<div class="card">Sekolah tidak ditemukan. <a href="#/buat">Kembali</a></div>'; return; }
    const draw = () => {
      const fase = [['Fase 1 · Memahami & Menguasai', 1, 7], ['Fase 2 · Merencanakan, Menilai & Mempraktikkan', 8, 16], ['Fase 3 · Mempraktikkan & Menumbuhkan Budaya', 17, 22]];
      app.innerHTML = `<a href="#/buat" class="small">← Pilih sekolah</a><h1 class="pg">${esc(s.nama)}</h1>
        <p class="muted small" style="margin-top:-6px">Fasilitator: ${esc(fasilNama(s) || '-')}${canEdit(s) ? '' : ' · <b>hanya baca</b>'}</p>
        ${fase.map(([t, a, b]) => `<h3>${t}</h3><div class="pcards">${window.SILABUS.filter(p => p.no >= a && p.no <= b).map(p => {
          const st = statusOf(s.id, p.no); const rk = S.rekap.get(R.key(s.id, p.no));
          return `<a class="pcard ${st}" href="#/laporan/${s.id}/${p.no}/1"><span class="no">${p.no}</span><span class="tt">${esc(p.judul)}</span>
            <span class="meta"><span class="pill ${st}">${st === 'kosong' ? 'belum' : st}</span>${rk && rk.tanggal ? ' ' + esc(R.tanggalPanjang(rk.tanggal).split(', ')[1]) : ''}</span></a>`;
        }).join('')}</div>`).join('')}`;
    };
    draw();
    if (await refreshRekap()) { if (location.hash === '#/buat/' + sid) draw(); }
  }

  /* ---------- Editor ---------- */
  const STEPS = no => ['Pelaksanaan', R.hasTes(no) ? 'Kehadiran & Nilai' : 'Kehadiran', R.isObservasi(no) ? 'Kegiatan & Observasi' : 'Kegiatan & Capaian', 'Evaluasi', 'Lampiran', 'Periksa & Pratinjau'];
  let readOnly = false;

  async function openReport(sid, no, step) {
    const s = school(sid);
    if (!s || !(no >= 1 && no <= 22)) { app.innerHTML = '<div class="card">Laporan tidak ditemukan. <a href="#/buat">Kembali</a></div>'; return; }
    const key = R.key(sid, no);
    S.step = Math.min(6, Math.max(1, step || 1));
    if (!S.cur || S.cur.key !== key) {
      S.imp = null; S.showAll = false;
      app.innerHTML = '<p class="muted">Memuat laporan…</p>';
      const local = await DB.get('reports', key);
      const rk = S.rekap.get(key);
      if (local) {
        S.cur = normalize(local);
        if (rk || local._version > 0) refreshFromServer(key);   // cek versi terbaru di Drive (di belakang layar)
      } else if (navigator.onLine !== false) {
        // selalu cek Drive: daftar status di perangkat ini bisa saja belum terbarui
        try {
          const g = await API.call('getReport', { key });
          S.cur = g.report ? normalize(Object.assign(g.report, { _version: g.version })) : normalize(Object.assign(R.blank(sid, no), { _version: g.version || 0 }));
          if (g.report) await DB.put('reports', clone(S.cur), key);
        } catch (e) {
          if (!e.offline || (rk && rk.version > 0)) { app.innerHTML = `<div class="card">Laporan belum bisa dimuat: ${esc(e.message)} <a href="#/buat/${sid}">Kembali</a></div>`; return; }
          S.cur = normalize(Object.assign(R.blank(sid, no), { _version: 0 }));
        }
      } else S.cur = normalize(Object.assign(R.blank(sid, no), { _version: 0 }));
    }
    renderEditor();
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
    return [1, 2, 3, 4, 5, 6].map(i => {
      if (i === 6) return R.isComplete(rep, s) ? 'ok' : 'no';
      const items = ck.filter(c => c.step === i && c.wajib);
      if (!items.length) return '';
      return items.every(c => c.ok) ? 'ok' : 'no';
    });
  }
  function curStatus() { const r = S.cur; if (!r) return 'kosong'; if (!r._dirty && !(r._version > 0)) return 'kosong'; return R.status(r, school(r.sekolahId)); }
  function refreshStepDots() {
    if (!S.cur) return;
    const s = school(S.cur.sekolahId);
    const d = stepDots(S.cur, s);
    document.querySelectorAll('.steps a').forEach((a, i) => { const dot = a.querySelector('.dot'); if (dot) dot.className = 'dot ' + d[i]; });
    const pill = document.getElementById('statpill');
    if (pill) { const st = curStatus(); pill.className = 'pill ' + st; pill.textContent = st === 'kosong' ? 'baru' : st; }
  }

  function renderEditor() {
    const rep = S.cur, s = school(rep.sekolahId), sil = R.sil(rep.no);
    readOnly = !canEdit(s);
    const names = STEPS(rep.no);
    const dots = stepDots(rep, s);
    const st = curStatus();
    const rk = S.rekap.get(rep.key);
    app.innerHTML = `
      <div class="ed-head"><div><a href="#/buat/${s.id}" class="small">← ${esc(s.nama)}</a>
        <h1>P${rep.no} · ${esc(sil.judul)}</h1>
        <div class="muted small">${esc(s.nama)} · ${esc(sil.tahap)} · ${esc(sil.fase)} <span id="statpill" class="pill ${st}">${st === 'kosong' ? 'baru' : st}</span>
        ${rk && rk.updatedBy ? ` · terakhir diubah ${esc(rk.updatedBy)}, ${fmtWaktu(rk.updatedAt)}` : ''}</div></div></div>
      ${readOnly ? `<div class="banner info small">Mode baca — laporan ini dipegang <b>${esc(fasilNama(s) || 'fasilitator lain')}</b>; Anda bisa melihat isinya dan pratinjau PDF.</div>` : ''}
      <nav class="steps">${names.map((n, i) => `<a href="#/laporan/${s.id}/${rep.no}/${i + 1}" class="${S.step === i + 1 ? 'on' : ''}">${i + 1}. ${n}<span class="dot ${dots[i]}"></span></a>`).join('')}</nav>
      <div id="stepbody"></div>
      <div class="navbtm"><div class="in">
        ${S.step > 1 ? `<a class="btn" href="#/laporan/${s.id}/${rep.no}/${S.step - 1}">← Sebelumnya</a>` : ''}
        <span class="spacer"></span>
        ${S.step < 6 ? `<a class="btn pri" href="#/laporan/${s.id}/${rep.no}/${S.step + 1}">Berikutnya →</a>` : `<button class="btn ok" data-act="download"${R.isComplete(rep, s) ? '' : ' disabled'}>Unduh PDF</button>`}
      </div></div>`;
    rerenderStep(true);
  }

  function conflictBanner(rep) {
    if (!rep._conflict || readOnly) return '';
    return `<div class="banner bad"><b>Bentrok versi.</b> Laporan ini sudah diubah oleh ${esc(rep._conflict.by || 'pengguna lain')} (${fmtWaktu(rep._conflict.at)}) sementara perubahan Anda belum terkirim.
      <div class="row" style="margin-top:8px"><button class="btn sm" data-act="conf-server">Pakai versi server (buang perubahan saya)</button><button class="btn sm danger" data-act="conf-mine">Timpa dengan versi saya</button></div></div>`;
  }

  function rerenderStep(noScroll) {
    const rep = S.cur, s = school(rep.sekolahId);
    const y = window.scrollY;
    const body = document.getElementById('stepbody'); if (!body) return;
    body.innerHTML = conflictBanner(rep) + [null, step1, step2, step3, step4, step5, step6][S.step](rep, s, R.sil(rep.no));
    if (readOnly) {
      body.querySelectorAll('input, select, textarea').forEach(e => { if (e.dataset.act !== 'showall') e.disabled = true; });
      body.querySelectorAll('[data-act]').forEach(b => { if (!['preview', 'download'].includes(b.dataset.act) && b.tagName !== 'INPUT') b.style.display = 'none'; });
      body.querySelectorAll('label.upl, .chips, .ro-hide').forEach(e => { e.style.display = 'none'; });
    }
    fillThumbs();
    if (!noScroll) window.scrollTo(0, y);
    refreshStepDots();
  }

  /* ---- Langkah 1 ---- */
  function step1(rep, s, sil) {
    return `<div class="card"><h2>Waktu & tempat</h2>
      <div class="grid2">
        <div><label class="f">Tanggal pelaksanaan</label><input type="date" data-r="tanggal" value="${esc(rep.tanggal)}"></div>
        <div class="row" style="align-items:flex-end"><div style="flex:1"><label class="f">Jam mulai</label><input type="text" data-r="jamMulai" value="${esc(rep.jamMulai)}" placeholder="08.00"></div>
        <div style="flex:1"><label class="f">Jam selesai</label><input type="text" data-r="jamSelesai" value="${esc(rep.jamSelesai)}" placeholder="11.00"></div></div>
        <div><label class="f">Tempat</label><input type="text" data-r="tempat" value="${esc(rep.tempat)}" placeholder="mis. Ruang kelas 6 ${esc(s.nama)}">
        <button class="btn sm" data-act="tempat-sekolah" style="margin-top:6px">Isi: ${esc(s.nama)}</button></div>
      </div>
      <label class="f" style="margin-top:12px">Kalimat di laporan</label><div class="preview" id="pv-pel">${esc(R.kalimatPelaksanaan(rep, s))}</div></div>
      <div class="card"><h3>Ringkasan dari silabus</h3>
        <table class="simple"><tbody>
        <tr><th style="width:170px">Tahap</th><td>${esc(sil.tahap)}</td></tr>
        <tr><th>Buku modul</th><td>${esc(sil.fase)}</td></tr>
        <tr><th>Alokasi waktu</th><td>${esc(sil.alokasi)} · ${sil.kegiatan.length} sesi</td></tr>
        <tr><th>Metode</th><td>${esc(sil.metode)}</td></tr>
        <tr><th>Penilaian</th><td>${sil.penilaian.map(esc).join('<br>')}</td></tr>
        <tr><th>Lembar kerja</th><td>${sil.lk.map(esc).join('<br>')}</td></tr>
        <tr><th>Sumber bahan</th><td>${esc(sil.sumber)}</td></tr>
        </tbody></table>
        <p class="small muted">Latar belakang, tujuan, indikator, dan langkah kegiatan otomatis diambil dari silabus.</p></div>`;
  }

  /* ---- Langkah 2 ---- */
  function step2(rep, s) {
    let html = '';
    if (R.hasTes(rep.no)) html += tesCard(rep, s);
    const g = R.groupKelas(rep.no);
    const hadir = new Set(rep.hadir || []);
    const rel = R.relevantPeserta(s, rep.no, S.showAll);
    const list = R.sortPeserta(rel.concat((s.peserta || []).filter(p => hadir.has(p.id) && !rel.includes(p))));
    html += `<div class="card"><div class="row"><h2 style="margin:0">Kehadiran peserta</h2><span class="spacer"></span>
        <span class="small muted">Hadir: <b id="hadirN">${R.hadirList(rep, s).length}</b> orang</span></div>
      ${g ? `<div class="banner info small" style="margin:10px 0">Pendampingan ini untuk <b>Kepala Sekolah dan guru kelas ${g[0]} dan ${g[1]}</b>. Daftar disaring dari jabatan/kelas peserta.
        <label style="margin-left:6px"><input type="checkbox" data-act="showall"${S.showAll ? ' checked' : ''} style="vertical-align:-4px"> tampilkan semua peserta sekolah</label></div>` : ''}
      ${R.hasTes(rep.no) ? '<p class="small muted ro-hide">Peserta yang mengerjakan pretes/postes otomatis dicentang hadir saat nilai diambil.</p>' : ''}
      <div class="row" style="margin:8px 0"><button class="btn sm" data-act="hadir-all">Centang semua</button><button class="btn sm" data-act="hadir-none">Kosongkan</button></div>
      ${list.length ? `<div class="peserta-list">${list.map(p => pesertaRow(s, p, true, hadir, rep, !readOnly)).join('')}</div>` :
        `<div class="banner warn small">Belum ada peserta${g && !S.showAll ? ' untuk kelompok kelas ini (cek jabatan/kelas peserta, atau centang “tampilkan semua”)' : ''}.${R.hasTes(rep.no) ? ' Impor nilai — daftar terbentuk otomatis — atau tambahkan di bawah.' : ' Tambahkan di bawah.'}</div>`}
      <div class="row ro-hide" style="margin-top:10px">
        <input type="text" id="np-nama" placeholder="Nama peserta baru" style="flex:2;min-width:180px">
        <select id="np-jab" style="flex:1;min-width:140px">${opts(JABATAN, g ? 'Guru Kelas' : '', ['— jabatan —'].concat(JABATAN.slice(1)))}</select>
        <select id="np-kel" style="width:90px">${opts(KELAS, g ? g[0] : '', ['kelas', '1', '2', '3', '4', '5', '6'])}</select>
        <button class="btn" data-act="add-peserta">Tambah</button></div>
      <label class="f" style="margin-top:12px">Kalimat di laporan</label><div class="preview" id="pv-pes">${esc(R.kalimatPeserta(rep, s))}</div></div>`;
    return html;
  }

  function tesCard(rep, s) {
    let h = `<div class="card"><h2>Nilai pretes & postes</h2>`;
    const st = R.stats(rep);
    if (st && !S.imp) {
      h += `<div class="stats"><div class="stat"><b>${R.fmt(st.pre)}</b>rata-rata pretes (${st.preN} org)</div>
        <div class="stat"><b>${R.fmt(st.post)}</b>rata-rata postes (${st.postN} org)</div>
        <div class="stat"><b>${st.selisih === null ? '-' : (st.selisih >= 0 ? '+' : '−') + R.fmt(Math.abs(st.selisih))}</b>poin ${st.persen === null ? '' : '(' + R.fmt(st.persen) + '%)'}</div></div>
        <p class="small muted">Sumber: ${esc(rep.tes.fileName)} · diambil ${new Date(rep.tes.importedAt).toLocaleString('id-ID')}</p>`;
      if (st.onlyPre.length || st.onlyPost.length) {
        h += `<div class="banner warn small">${st.onlyPre.length ? `<b>Hanya ikut pretes:</b> ${esc(st.onlyPre.join(', '))}. ` : ''}${st.onlyPost.length ? `<b>Hanya ikut postes:</b> ${esc(st.onlyPost.join(', '))}.` : ''}
          Rata-rata tiap tes tetap dihitung dari semua yang mengerjakannya. Catatan ini tidak masuk ke PDF.</div>`;
      }
      h += `<details class="adv"><summary>Lihat data nilai (${rep.tes.rows.length} baris)</summary>
        <table class="simple"><thead><tr><th>Nama</th><th>Tes</th><th>Skor (0–100)</th></tr></thead><tbody>
        ${rep.tes.rows.slice().sort((a, b) => a.nama.localeCompare(b.nama) || b.jenis.localeCompare(a.jenis)).map(r => `<tr><td>${esc(r.nama)}</td><td>${r.jenis === 'pre' ? 'Pretes' : 'Postes'}</td><td>${R.fmt(r.skor)}</td></tr>`).join('')}
        </tbody></table></details>
        <div class="row ro-hide" style="margin-top:10px"><label class="btn upl">Impor ulang file<input type="file" accept=".csv,.xlsx,.tsv" data-act="imp-file"></label>
        <button class="btn danger" data-act="tes-del">Hapus data nilai</button></div>`;
      return h + '</div>';
    }
    if (!S.imp) {
      if (readOnly) return h + '<p class="muted">Nilai belum diimpor.</p></div>';
      h += `<p>Unggah file respons Google Form (pretes & postes) — <b>boleh berisi semua sekolah sekaligus</b>; aplikasi hanya mengambil baris <b>${esc(s.nama)}</b>.</p>
        <p class="small muted">Di Google Form: tab <i>Respons</i> → ikon Spreadsheet → di Google Sheets pilih <i>File → Download → .csv atau .xlsx</i>.</p>
        <label class="btn pri upl">Pilih file .csv / .xlsx<input type="file" accept=".csv,.xlsx,.tsv" data-act="imp-file"></label>
        <details class="adv"><summary>Kolom yang dibutuhkan di Google Form</summary>
        <ul class="small"><li><b>Nama</b> peserta</li><li><b>Asal Sekolah</b> — sebaiknya pilihan dropdown</li>
        <li><b>Jenis Tes</b> — pilihan “Pre-tes” / “Post-tes”</li><li><b>Skor</b> — otomatis bila form diatur sebagai Kuis (mis. “8 / 11” → 72,73)</li>
        <li>Opsional: <b>Jabatan/Kelas</b>, dan <b>Pendampingan ke-</b> bila satu form dipakai untuk beberapa pendampingan</li></ul></details>`;
      return h + '</div>';
    }
    const imp = S.imp, an = imp.an, c = imp.cols;
    const colSel = (k, label, wajib) => `<div><label class="f">${label}${wajib ? ' *' : ''}</label><select data-imp-col="${k}">
      <option value="-1">${wajib ? '— pilih kolom —' : '— tidak ada —'}</option>${an.header.map((hh, i) => `<option value="${i}"${c[k] === i ? ' selected' : ''}>${esc(hh || 'Kolom ' + (i + 1))}</option>`).join('')}</select></div>`;
    h += `<p class="small"><b>${esc(imp.fileName)}</b> · ${an.body.length} baris respons</p>
      <h3>1. Cocokkan kolom</h3><div class="grid2">${colSel('nama', 'Nama', 1)}${colSel('sekolah', 'Asal sekolah', 1)}${colSel('jenis', 'Jenis tes (pre/post)', 1)}${colSel('skor', 'Skor', 1)}${colSel('jabatan', 'Jabatan/Kelas', 0)}${colSel('pendampingan', 'Pendampingan ke-', 0)}</div>`;
    if (c.sekolah >= 0) {
      const vals = I.distinct(an.body, c.sekolah).sort((a, b) => (imp.schools.has(b.value) - imp.schools.has(a.value)) || b.count - a.count);
      h += `<h3 style="margin-top:14px">2. Pilih nama sekolah yang berarti <u>${esc(s.nama)}</u></h3>
        <p class="small muted">Yang tercentang otomatis dikenali dari nama sekolah. Centang juga ejaan lain milik sekolah ini.</p>
        <div class="peserta-list" style="max-height:240px">${vals.map(v => `<label class="pr" style="grid-template-columns:26px 1fr 80px"><input type="checkbox" data-imp-school="${esc(v.value)}"${imp.schools.has(v.value) ? ' checked' : ''}><span>${esc(v.value)}</span><span class="small muted">${v.count} baris</span></label>`).join('')}</div>`;
    }
    if (c.jenis >= 0) {
      const jv = I.distinct(an.body, c.jenis);
      h += `<p class="small" style="margin-top:10px">Isi kolom jenis tes: ${jv.map(v => { const p = I.parseJenis(v.value); return `<span class="pill ${p ? 'lengkap' : 'draf'}">${esc(v.value)} → ${p === 'pre' ? 'Pretes' : p === 'post' ? 'Postes' : 'tidak dikenali'}</span>`; }).join(' ')}</p>`;
    }
    const ready = c.nama >= 0 && c.sekolah >= 0 && c.jenis >= 0 && c.skor >= 0 && imp.schools.size;
    let info = '';
    if (ready) {
      const ex = I.extract(an, c, [...imp.schools], rep.no);
      const pre = ex.rows.filter(r => r.jenis === 'pre').length, post = ex.rows.filter(r => r.jenis === 'post').length;
      info = `<div class="banner ${pre + post ? 'info' : 'bad'} small" style="margin-top:10px">Akan diambil: <b>${pre}</b> pretes dan <b>${post}</b> postes untuk ${esc(s.nama)}.
        ${ex.skipped.jenis ? ex.skipped.jenis + ' baris jenis tes tidak dikenali. ' : ''}${ex.skipped.skor ? ex.skipped.skor + ' baris tanpa skor. ' : ''}${ex.skipped.pendampingan ? ex.skipped.pendampingan + ' baris milik pendampingan lain dilewati.' : ''}</div>`;
    }
    h += `${info}<div class="row" style="margin-top:12px"><button class="btn pri" data-act="imp-apply"${ready ? '' : ' disabled'}>Ambil nilai ${esc(s.nama)}</button>
      <button class="btn" data-act="imp-cancel">Batal</button></div>`;
    return h + '</div>';
  }

  /* ---- Langkah 3 ---- */
  function step3(rep, s) {
    const keg = R.kegiatan(rep);
    let h = `<div class="card"><div class="row"><h2 style="margin:0">Langkah pelaksanaan</h2><span class="spacer"></span>
      ${rep.kegiatan ? '<button class="btn sm" data-act="keg-reset">Kembalikan sesuai silabus</button>' : ''}</div>
      <p class="small muted ro-hide">Diambil dari silabus. Hilangkan centang kegiatan yang tidak terlaksana, ubah teksnya (mis. nama ice breaking), atau tambah kegiatan. Catatan sesi masuk ke jurnal kegiatan.</p>
      ${keg.map((k, si) => `<div class="sesi"><div class="sesi-h">${esc(k.sesi)} · ${esc(k.bagian)} <span class="pill kosong">${esc(k.waktu)}</span></div>
        ${k.aktivitas.map((a, ai) => `<div class="akt ${a.aktif ? '' : 'off'}"><input type="checkbox" data-act="akt-toggle" data-si="${si}" data-ai="${ai}"${a.aktif ? ' checked' : ''}>
          <input type="text" data-akt="${si}|${ai}" value="${esc(a.teks)}"><button class="btn sm" data-act="akt-del" data-si="${si}" data-ai="${ai}" title="Hapus">×</button></div>`).join('')}
        <div class="row" style="margin-top:6px"><button class="btn sm" data-act="akt-add" data-si="${si}">+ Tambah kegiatan</button>
        <input type="text" data-cat="${si}" value="${esc(k.catatan)}" placeholder="Catatan sesi untuk jurnal (opsional) — default: Terlaksana sesuai rencana" style="flex:1;min-width:220px;padding:5px 8px;font-size:.88rem"></div></div>`).join('')}</div>`;

    h += `<div class="card"><h2>Capaian indikator</h2><p class="small muted">Menentukan kalimat Kondisi Akhir. Bawaan: tercapai.</p>
      ${R.indikatorList(rep.no).map(i => { const v = rep.capaian[i.id] || 'tercapai'; return `<div class="ind"><div><span class="pill kosong">${i.dim}</span> ${esc(i.teks)}</div>
        <div class="seg">${['tercapai', 'sebagian', 'belum'].map(x => `<button data-act="cap" data-id="${i.id}" data-v="${x}" class="${v === x ? 'on' : ''}"${readOnly ? ' disabled' : ''}>${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</div></div>`; }).join('')}</div>`;

    if (R.isObservasi(rep.no)) {
      const names = R.relevantPeserta(s, rep.no, false).map(p => p.nama);
      h += `<div class="card"><h2>Hasil observasi & coaching</h2>
        <datalist id="dl-guru">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        ${(rep.observasi || []).length ? '' : '<p class="small muted">Belum ada data observasi.</p>'}
        ${(rep.observasi || []).map((o, i) => `<div class="sesi"><div class="grid2">
          <div><label class="f">Guru yang diobservasi</label><input type="text" list="dl-guru" data-obs="${i}|guru" value="${esc(o.guru)}"></div>
          <div><label class="f">Kelas</label><input type="text" data-obs="${i}|kelas" value="${esc(o.kelas)}"></div></div>
          <div class="grid2" style="margin-top:8px">
          <div><label class="f">Kekuatan</label><textarea data-obs="${i}|kekuatan">${esc(o.kekuatan)}</textarea></div>
          <div><label class="f">Area perbaikan</label><textarea data-obs="${i}|perbaikan">${esc(o.perbaikan)}</textarea></div>
          <div><label class="f">Tindak lanjut (hasil coaching)</label><textarea data-obs="${i}|tindakLanjut">${esc(o.tindakLanjut)}</textarea></div></div>
          <button class="btn sm danger" data-act="obs-del" data-i="${i}" style="margin-top:6px">Hapus guru ini</button></div>`).join('')}
        <button class="btn" data-act="obs-add">+ Tambah guru yang diobservasi</button></div>`;
    }

    const tf = (k, label, auto) => `<div style="margin-top:10px"><div class="row"><label class="f" style="margin:0">${label}</label><span class="spacer"></span>
      <span class="small muted" id="tm-${k}">${rep.teks[k] ? 'diedit manual' : 'otomatis'}</span>
      <button class="btn sm" data-act="teks-reset" data-k="${k}">Kembalikan otomatis</button></div>
      <textarea data-teks="${k}" style="min-height:${k === 'latar' ? 170 : 120}px">${esc(rep.teks[k] || auto)}</textarea></div>`;
    h += `<div class="card"><h2>Teks laporan</h2><p class="small muted ro-hide">Disusun otomatis. Ubah bila perlu — begitu diedit, teks tidak lagi mengikuti perubahan nilai/capaian sampai dikembalikan otomatis.</p>
      ${tf('kondisiAwal', 'Kondisi awal', autoTeks(rep, 'kondisiAwal'))}
      ${tf('kondisiAkhir', 'Kondisi akhir', autoTeks(rep, 'kondisiAkhir'))}
      <details class="adv"><summary>Latar belakang (dari deskripsi silabus)</summary>${tf('latar', 'Latar belakang', autoTeks(rep, 'latar'))}</details></div>`;
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

  /* ---- Langkah 5 ---- */
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

  /* ---- Langkah 6 ---- */
  function step6(rep, s) {
    const ck = R.checklist(rep, s);
    const done = R.isComplete(rep, s);
    return `<div class="card"><h2>Daftar periksa</h2><ul class="ck">${ck.map(c => `<li><span class="ic ${c.ok ? 'ok' : c.wajib ? 'no' : 'opt'}">${c.ok ? '✓' : c.wajib ? '!' : '–'}</span>
      <span>${esc(c.label)}</span><span class="spacer"></span>${c.ok ? '' : `<a class="small" href="#/laporan/${s.id}/${rep.no}/${c.step}">${readOnly ? 'Lihat' : 'Lengkapi'} →</a>`}</li>`).join('')}</ul></div>
      <div class="card"><h2>PDF laporan</h2>
      ${done ? `<p>Semua bagian wajib sudah lengkap. File: <b>${esc(R.fileName(rep, s))}</b></p><p class="small muted">Saat diunduh, salinan PDF juga diarsipkan otomatis ke folder sekolah di Google Drive.</p>` : '<div class="banner warn small">Masih ada bagian wajib yang belum lengkap. Pratinjau tetap bisa dilihat dengan tanda <b>DRAF</b>; tombol unduh aktif setelah semua lengkap.</div>'}
      <div class="row"><button class="btn" data-act="preview">Pratinjau</button><button class="btn ok" data-act="download"${done ? '' : ' disabled'}>Unduh PDF</button></div></div>
      ${!readOnly && (rep._version > 0 || rep._dirty) ? `<div class="card"><h3>Hapus laporan</h3><p class="small muted">Folder laporan ini (isian, foto, PDF) dipindah ke Sampah Google Drive dan masih bisa dipulihkan admin selama 30 hari.</p><button class="btn danger" data-act="del-report">Hapus laporan ini</button></div>` : ''}`;
  }

  async function makePdfBytes(rep, s, draft) {
    await fetchImages(allImageIds(rep).concat(S.program.kopId ? [S.program.kopId] : []));
    await ensureKop();
    return PdfGen.generate(rep, s, pdfSettings(s), getImageRec, { draft });
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
    const bytes = await makePdfBytes(rep, s, !R.isComplete(rep, s));
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
    toast('Menyusun PDF…', false, 1500);
    const bytes = await makePdfBytes(rep, s, false);
    const name = R.fileName(rep, s);
    saveBlob(new Blob([bytes], { type: 'application/pdf' }), name);
    if (rep._dirty) await Sync.run();
    if (!rep._dirty && !rep._conflict && rep._version > 0) archivePdf(rep.key, bytes, name);
  }

  /* ---------- Impor nilai ---------- */
  async function importFile(file) {
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
    if (newAlias.length && isAdmin()) { s.alias = (s.alias || []).concat(newAlias); saveSekolahDeb(s.id); }
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
    toast(`Nilai diambil: ${st.preN} pretes, ${st.postN} postes${baru ? ' · ' + baru + ' peserta baru ditambahkan' : ''}.`, false, 4500);
  }

  /* =========================================================
   * MENU 3 — UNDUH LAPORAN
   * ========================================================= */
  async function renderUnduh() {
    const draw = () => {
      const sk = S.sekolah;
      let lengkap = 0, draf = 0, total = 0;
      const rows = sk.map(s => {
        const cells = window.SILABUS.map(p => {
          const st = statusOf(s.id, p.no); total++;
          if (st === 'lengkap') lengkap++; else if (st === 'draf') draf++;
          return `<td><button class="cell ${st}" data-cell="${s.id}|${p.no}" title="P${p.no} · ${esc(p.judul)} — ${st}${st === 'lengkap' ? ' (klik untuk unduh PDF)' : ''}">${p.no}</button></td>`;
        }).join('');
        const l = window.SILABUS.filter(p => statusOf(s.id, p.no) === 'lengkap').length;
        return `<tr><td class="sk"><b>${esc(s.nama)}</b><div class="small muted">${esc((fasilNama(s) || '-').split(',')[0])} · ${l}/22</div></td>${cells}</tr>`;
      }).join('');
      app.innerHTML = `<h1 class="pg">Unduh Laporan</h1>
        <div class="card"><div class="row"><h2 style="margin:0">Ringkasan</h2><span class="spacer"></span>
          <div class="legend"><span><i style="background:#f1f3f7"></i>Belum</span><span><i style="background:#fde7b0"></i>Draf</span><span><i style="background:#bfe8cf"></i>Lengkap — klik untuk unduh</span></div></div>
          <div class="stats" style="margin-top:10px"><div class="stat"><b>${lengkap}</b>lengkap</div><div class="stat"><b>${draf}</b>draf</div><div class="stat"><b>${total - lengkap - draf}</b>belum</div><div class="stat"><b>${total ? Math.round(lengkap / total * 100) : 0}%</b>progres</div></div></div>
        ${sk.length ? `<div class="matrix-wrap"><table class="matrix"><thead><tr class="fase"><th class="sk"></th><th colspan="7">FASE 1 · 1–7</th><th colspan="9">FASE 2 · 8–16</th><th colspan="6">FASE 3 · 17–22</th></tr>
          <tr><th class="sk">Sekolah</th>${window.SILABUS.map(p => `<th title="${esc(p.judul)}">${p.no}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="banner info">Belum ada sekolah.</div>'}
        <div class="grid2" style="margin-top:16px">
          <div class="card"><h3>ZIP per pendampingan</h3><p class="small muted">Semua laporan lengkap satu pendampingan dari seluruh sekolah.</p>
            <select id="bulkNo">${window.SILABUS.map(p => `<option value="${p.no}">P${p.no} · ${esc(p.judul)}</option>`).join('')}</select>
            <div id="bulkNoInfo" class="small muted" style="margin:6px 0"></div><button class="btn pri" data-act="bulk-no">Unduh ZIP</button></div>
          <div class="card"><h3>ZIP per sekolah</h3><p class="small muted">Semua laporan lengkap (P1–P22) satu sekolah.</p>
            <select id="bulkSk">${sk.map(s => `<option value="${s.id}">${esc(s.nama)}</option>`).join('')}</select>
            <div id="bulkSkInfo" class="small muted" style="margin:6px 0"></div><button class="btn pri" data-act="bulk-sk">Unduh ZIP</button></div>
        </div>
        <p class="small muted">PDF yang sudah diarsipkan di Google Drive diambil langsung; yang belum, disusun di perangkat ini lalu diarsipkan.</p>`;
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
    if (rk && rk.pdfId && rk.pdfAt >= rk.updatedAt && !(local && local._dirty)) {
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
   * MENU 4 — KELOLA PENGGUNA (admin)
   * ========================================================= */
  async function renderPengguna() {
    app.innerHTML = '<h1 class="pg">Kelola Pengguna</h1><p class="muted">Memuat…</p>';
    let users, usage = null;
    try { users = await API.call('listUsers'); } catch (e) { app.innerHTML = `<div class="card">${esc(e.message)}</div>`; return; }
    try { usage = await API.call('usage'); } catch (e) { /* abaikan */ }
    S.pengguna = users.map(u => ({ username: u.username, nama: u.nama, peran: u.peran, aktif: u.aktif })); cacheBoot();
    const skOf = u => S.sekolah.filter(s => eqU(s.fasil, u.username)).map(s => s.nama);
    const pct = usage ? Math.round(usage.used / usage.limit * 1000) / 10 : 0;
    app.innerHTML = `<h1 class="pg">Kelola Pengguna</h1>
      <div class="card"><h3>Peran</h3><ul class="small" style="margin:0">
        <li><b>Admin</b> — mengelola pengguna, sekolah, data program; mengedit & menghapus semua laporan.</li>
        <li><b>Fasilitator</b> — mengedit laporan & peserta sekolah yang dipegangnya; melihat & mengunduh semua laporan.</li>
        <li><b>Pemantau</b> — hanya melihat & mengunduh laporan.</li></ul>
        <p class="small muted">Sekolah dipegang fasilitator diatur di menu Data Sekolah (kolom “Fasilitator pemegang”).</p></div>
      <div class="card"><h2>Daftar pengguna (${users.length})</h2><div style="overflow-x:auto"><table class="simple users"><thead><tr><th>Username</th><th>Nama lengkap (dengan gelar)</th><th>Peran</th><th>Aktif</th><th>Sekolah dipegang</th><th>Login terakhir</th><th></th></tr></thead><tbody>
        ${users.map(u => `<tr data-user="${esc(u.username)}"><td><b>${esc(u.username)}</b></td>
          <td><input type="text" data-uf="nama" value="${esc(u.nama)}"></td>
          <td><select data-uf="peran">${opts(['admin', 'fasilitator', 'pemantau'], u.peran, ['Admin', 'Fasilitator', 'Pemantau'])}</select></td>
          <td><input type="checkbox" data-uf="aktif"${u.aktif ? ' checked' : ''}></td>
          <td class="small">${esc(skOf(u).join(', ') || '-')}</td><td class="small muted">${u.terakhirLogin ? fmtWaktu(Date.parse(u.terakhirLogin)) : '-'}</td>
          <td style="white-space:nowrap"><button class="btn sm pri" data-act="user-save">Simpan</button> <button class="btn sm" data-act="user-reset">Reset sandi</button></td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="card"><h2>Tambah pengguna</h2><div class="grid2">
        <div><label class="f">Username</label><input type="text" id="nu-user" placeholder="mis. anton"></div>
        <div><label class="f">Nama lengkap dengan gelar</label><input type="text" id="nu-nama" placeholder="Anton Widiyatmoko, S.Pd., M.Pd."></div>
        <div><label class="f">Peran</label><select id="nu-peran">${opts(['fasilitator', 'pemantau', 'admin'], 'fasilitator', ['Fasilitator', 'Pemantau', 'Admin'])}</select></div>
        <div><label class="f">Password awal (min. 6 karakter)</label><input type="text" id="nu-pass" autocomplete="off"></div></div>
        <button class="btn pri" data-act="user-add" style="margin-top:10px">Tambah pengguna</button>
        <p class="small muted">Sampaikan username & password awal ke yang bersangkutan; ia bisa menggantinya sendiri di menu akun.</p></div>
      ${usage ? `<div class="card"><h3>Penyimpanan Google Drive admin</h3><div class="bar big"><i style="width:${Math.min(100, pct)}%"></i></div>
        <p class="small">${(usage.used / 1073741824).toFixed(2)} GB dari ${(usage.limit / 1073741824).toFixed(0)} GB terpakai (${pct}%) — termasuk Gmail & Google Photos akun admin.</p></div>` : ''}`;
  }

  /* =========================================================
   * AKUN SAYA
   * ========================================================= */
  async function renderAkun() {
    const n = await Sync.count();
    app.innerHTML = `<h1 class="pg">Akun Saya</h1>
      <div class="card"><table class="simple"><tbody><tr><th style="width:140px">Nama</th><td>${esc(S.user.nama)}</td></tr>
        <tr><th>Username</th><td>${esc(S.user.username)}</td></tr><tr><th>Peran</th><td>${PERAN[S.user.peran]}</td></tr>
        <tr><th>Sinkronisasi</th><td>${n ? n + ' perubahan menunggu terkirim' : 'Semua perubahan sudah tersimpan di Drive'}</td></tr></tbody></table>
        ${S.user.peran === 'admin' ? '' : '<p class="small muted">Nama lengkap & gelar diubah oleh admin.</p>'}</div>
      <div class="card"><h2>Ganti password</h2><div class="grid2">
        <div><label class="f">Password lama</label><input type="password" id="pw-old" autocomplete="current-password"></div>
        <div><label class="f">Password baru (min. 6 karakter)</label><input type="password" id="pw-new" autocomplete="new-password"></div>
        <div><label class="f">Ulangi password baru</label><input type="password" id="pw-new2" autocomplete="new-password"></div></div>
        <button class="btn pri" data-act="pw-change" style="margin-top:10px">Simpan password</button>
        <p class="small muted">Perangkat lain yang memakai akun ini akan otomatis keluar.</p></div>
      <div class="card"><button class="btn danger" data-act="logout">Keluar</button>
        <p class="small muted">Keluar juga menghapus salinan data di perangkat ini.</p></div>`;
  }

  /* =========================================================
   * EVENT
   * ========================================================= */
  const EDIT_ACTS = new Set(['tempat-sekolah', 'hadir', 'hadir-all', 'hadir-none', 'add-peserta', 'imp-cancel', 'imp-apply', 'tes-del', 'akt-toggle', 'akt-del', 'akt-add', 'keg-reset', 'cap', 'obs-add', 'obs-del', 'teks-reset', 'chip', 'lamp-toggle', 'img-del', 'del-report', 'conf-server', 'conf-mine']);

  app.addEventListener('click', async e => {
    const cell = e.target.closest('[data-cell]');
    if (cell) {
      const [sid, no] = cell.dataset.cell.split('|');
      const st = statusOf(sid, +no);
      if (st === 'lengkap') return downloadOne(sid, +no);
      if (S.user.peran === 'pemantau') return toast(st === 'kosong' ? 'Laporan belum dibuat.' : 'Laporan masih draf.', true);
      location.hash = `#/laporan/${sid}/${no}/1`; return;
    }
    const b = e.target.closest('[data-act]');
    if (!b || (b.tagName === 'INPUT' && b.type !== 'checkbox')) return;
    const act = b.dataset.act, rep = S.cur, s = rep ? school(rep.sekolahId) : null;
    if (rep && readOnly && EDIT_ACTS.has(act)) { e.preventDefault(); return; }
    const editKeg = () => { if (!rep.kegiatan) rep.kegiatan = clone(R.kegiatan(rep)); return rep.kegiatan; };
    switch (act) {
      /* ---- data sekolah ---- */
      case 'kop-del':
        try { await API.call('uploadKop', { hapus: true }); S.program.kopId = ''; S.kopData = null; cacheBoot(); renderSekolah(); } catch (er) { toast(er.message, true); }
        break;
      case 'add-schools': {
        const lines = document.getElementById('newSchools').value.split('\n').map(x => x.trim()).filter(Boolean);
        b.disabled = true;
        for (const n of lines) {
          try { const r = await API.call('saveSekolah', { sekolah: { nama: n } }); S.sekolah.push(Object.assign(r, { peserta: [] })); }
          catch (er) { toast(er.message, true, 4000); }
        }
        cacheBoot(); renderSekolah(); break;
      }
      case 'del-school': {
        const sk = school(b.dataset.sid);
        const n = window.SILABUS.filter(p => statusOf(sk.id, p.no) !== 'kosong').length;
        if (!confirm(`Hapus ${sk.nama}${n ? ' beserta ' + n + ' laporannya' : ''}? Folder sekolah dipindah ke Sampah Google Drive.`)) return;
        try { await API.call('deleteSekolah', { id: sk.id }); S.sekolah = S.sekolah.filter(x => x.id !== sk.id); cacheBoot(); renderSekolah(); } catch (er) { toast(er.message, true); }
        break;
      }
      case 'toggle-peserta': S.openPeserta = S.openPeserta === b.dataset.sid ? null : b.dataset.sid; renderSekolah(); break;
      case 'paste-peserta': {
        const sk = school(b.dataset.sid);
        const n = addPesertaLines(sk, document.querySelector(`[data-paste="${sk.id}"]`).value);
        markPeserta(sk.id); renderSekolah(); toast(n + ' peserta ditambahkan.'); break;
      }
      case 'del-peserta': {
        const sk = school(b.dataset.sid);
        sk.peserta = sk.peserta.filter(p => p.id !== b.dataset.id);
        markPeserta(sk.id); renderSekolah(); break;
      }
      /* ---- editor ---- */
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
      case 'download': b.disabled = true; try { await downloadCur(); } catch (er) { console.error(er); toast('Gagal menyusun PDF: ' + er.message, true, 6000); } b.disabled = !R.isComplete(rep, s); break;
      case 'del-report':
        if (!confirm('Hapus laporan ini? Folder laporan (isian, foto, PDF) dipindah ke Sampah Google Drive.')) return;
        try {
          if (rep._version > 0) await API.call('deleteReport', { key: rep.key });
          await DB.del('reports', rep.key); S.rekap.delete(rep.key); S.local.delete(rep.key); cacheBoot();
          S.cur = null; location.hash = '#/buat/' + s.id; toast('Laporan dihapus.');
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
      case 'user-save': {
        const tr = b.closest('tr');
        const d = { username: tr.dataset.user, nama: tr.querySelector('[data-uf=nama]').value, peran: tr.querySelector('[data-uf=peran]').value, aktif: tr.querySelector('[data-uf=aktif]').checked };
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
      const sk = school(t.dataset.sid);
      if (t.dataset.sk === 'nama') sk.nama = t.value; else sk.alias = t.value.split(',').map(x => x.trim()).filter(Boolean);
      if (sk.nama.trim()) saveSekolahDeb(sk.id); return;
    }
    if (!rep || readOnly) return;
    if (t.dataset.r) { rep[t.dataset.r] = t.value; touch(); updatePreviews(); return; }
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
    if (t.dataset.sk === 'fasil') { const sk = school(t.dataset.sid); sk.fasil = t.value; saveSekolahDeb(sk.id); return; }
    if (t.dataset.act === 'kop' && t.files[0]) {
      try {
        toast('Mengunggah kop…', false, 1500);
        const data = await compressImage(t.files[0], 2400, 0.9, true);
        const r = await API.call('uploadKop', { b64: data.split(',')[1], mime: mimeOf(data), nama: 'kop' });
        S.program.kopId = r.kopId; const rec = { id: r.kopId, data }; S.imgCache.set(r.kopId, rec); await DB.put('images', rec);
        cacheBoot(); renderSekolah();
      } catch (er) { toast(er.message, true, 5000); }
      return;
    }
    if (t.dataset.pj) {
      const [sid, pid, f] = t.dataset.pj.split('|');
      const sk = school(sid); if (!canEdit(sk)) return;
      const p = sk.peserta.find(x => x.id === pid);
      p[f] = t.value; if (f === 'jabatan' && t.value !== 'Guru Kelas') p.kelas = '';
      markPeserta(sid);
      if (rep) { if (rep.no && R.groupKelas(rep.no)) touch(); rerenderStep(); } else renderSekolah();
      return;
    }
    if (!rep || readOnly) return;
    if (t.dataset.act === 'imp-file' && t.files[0]) return importFile(t.files[0]);
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
