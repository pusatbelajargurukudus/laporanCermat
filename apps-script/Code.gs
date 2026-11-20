/**
 * LAPORAN CERMAT — server Google Apps Script
 * --------------------------------------------------------------
 * Semua data disimpan di Google Drive akun pemilik skrip ini:
 *   LAPORAN CERMAT/
 *     Database CERMAT (Google Sheets) : Pengguna, Sekolah, Peserta, Program, Rekap, Berkas, Sesi, Log
 *     <Nama Sekolah>/P01 <Judul>/laporan.json, foto, scan, PDF arsip
 *
 * Cara pasang: lihat PANDUAN-DEPLOY.md
 *   1. Script Properties: ADMIN_USERNAME & ADMIN_PASSWORD
 *   2. Jalankan setup()
 *   3. Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone)
 */

var APP_VERSION = '2.4.0';
var SCHEMA = '2.2';
var SESSION_DAYS = 30;
var MAX_FAIL = 5;          // salah sandi berturut-turut
var LOCK_SECONDS = 600;    // lama kunci setelah salah sandi (detik)
var HASH_ROUNDS = 120;
var ROLES = ['admin', 'fasilitator', 'pemantau'];
var PROGRAM_KEYS = ['program', 'programKepanjangan', 'penyelenggara', 'kota', 'kopId'];

var SHEETS = {
  Pengguna: ['username', 'nama', 'peran', 'salt', 'hash', 'aktif', 'dibuat', 'terakhirLogin', 'nip'],
  Sekolah: ['id', 'nama', 'alias', 'fasil', 'folderId', 'urutan', 'ksNama', 'ksNip'],
  Peserta: ['id', 'sekolahId', 'nama', 'jabatan', 'kelas'],
  Program: ['kunci', 'nilai'],
  Rekap: ['key', 'sekolahId', 'sekolah', 'no', 'judul', 'status', 'tanggal', 'rataPre', 'rataPost',
    'fileId', 'folderId', 'pdfId', 'pdfAt', 'updatedAt', 'updatedBy', 'version', 'reward'],
  Berkas: ['fileId', 'key', 'jenis', 'dibuat'],
  Sesi: ['tokenHash', 'username', 'expires'],
  Log: ['waktu', 'username', 'aksi', 'detail']
};

/* =============================================================
 * SETUP (dijalankan sekali dari editor Apps Script)
 * ============================================================= */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var root;
  if (props.getProperty('ROOT_ID')) root = DriveApp.getFolderById(props.getProperty('ROOT_ID'));
  else { root = DriveApp.createFolder('LAPORAN CERMAT'); props.setProperty('ROOT_ID', root.getId()); }

  var ss;
  if (props.getProperty('SS_ID')) ss = SpreadsheetApp.openById(props.getProperty('SS_ID'));
  else {
    ss = SpreadsheetApp.create('Database CERMAT');
    DriveApp.getFileById(ss.getId()).moveTo(root);
    props.setProperty('SS_ID', ss.getId());
  }
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]);
    sh.setFrozenRows(1);
  });
  props.setProperty('SCHEMA', SCHEMA);
  ['Sheet1', 'Lembar1', 'Sheet 1'].forEach(function (n) {
    var s = ss.getSheetByName(n);
    if (s && ss.getSheets().length > 1) ss.deleteSheet(s);
  });

  var prog = readProgram_();
  var defaults = { program: 'CERMAT', programKepanjangan: 'Cerdas Numerasi dan Matematika Terapan',
    penyelenggara: 'Pusat Belajar Guru Kudus', kota: 'Kudus' };
  Object.keys(defaults).forEach(function (k) { if (!prog[k]) setProgram_(k, defaults[k]); });

  var u = props.getProperty('ADMIN_USERNAME'), p = props.getProperty('ADMIN_PASSWORD');
  if (u && p) {
    var ex = findUser_(u);
    if (ex) setPassword_(ex, p);
    else insert_('Pengguna', { username: u.trim(), nama: 'Administrator', peran: 'admin', aktif: 'ya', dibuat: now_() }, function (o) {
      o.salt = newSalt_(); o.hash = hash_(o.salt, p);
    });
    var adm = findUser_(u);
    if (adm.peran !== 'admin' || adm.aktif !== 'ya') update_('Pengguna', adm._row, { peran: 'admin', aktif: 'ya' });
    props.deleteProperty('ADMIN_PASSWORD');
    log_(u, 'setup', 'Akun admin dibuat/diperbarui');
  } else if (!rows_('Pengguna').length) {
    throw new Error('Isi dulu Script Properties ADMIN_USERNAME dan ADMIN_PASSWORD, lalu jalankan setup() lagi.');
  }
  Logger.log('Siap. Folder: ' + root.getUrl() + ' | Database: ' + ss.getUrl());
}

/* =============================================================
 * ROUTER
 * ============================================================= */
function doGet() {
  return out_({ ok: true, app: 'LAPORAN CERMAT', version: APP_VERSION, siap: !!PropertiesService.getScriptProperties().getProperty('SS_ID') });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, code: 'BAD', error: 'Permintaan tidak valid.' }); }
  try {
    migrate_();
    var act = ACTIONS[req.action];
    if (!act) throw err_('Aksi tidak dikenal: ' + req.action, 'BAD');
    var user = null;
    if (!act.pub) {
      user = auth_(req.token);
      if (!user) return out_({ ok: false, code: 'AUTH', error: 'Sesi berakhir. Silakan masuk lagi.' });
      if (act.role && user.peran !== act.role) throw err_('Anda tidak berhak melakukan ini.', 'FORBIDDEN');
    }
    return out_({ ok: true, data: act.fn(req, user) });
  } catch (x) {
    var res = { ok: false, code: x.code || 'ERROR', error: x.message || String(x) };
    if (x.extra) Object.keys(x.extra).forEach(function (k) { res[k] = x.extra[k]; });
    return out_(res);
  }
}

var ACTIONS = {
  ping: { pub: true, fn: function () { return { version: APP_VERSION }; } },
  login: { pub: true, fn: login_ },
  logout: { fn: function (req, user) { removeSession_(req.token); return true; } },
  bootstrap: { fn: bootstrap_ },
  rekap: { fn: function () { return rekapList_(); } },
  changePassword: { fn: changePassword_ },

  saveProgram: { role: 'admin', fn: saveProgram_ },
  uploadKop: { role: 'admin', fn: uploadKop_ },
  saveSekolah: { fn: saveSekolah_ },
  deleteSekolah: { fn: deleteSekolah_ },
  saveProfile: { fn: saveProfile_ },
  savePeserta: { fn: savePeserta_ },

  getReport: { fn: getReport_ },
  saveReport: { fn: saveReport_ },
  deleteReport: { fn: deleteReport_ },
  uploadImage: { fn: uploadImage_ },
  getImages: { fn: getImages_ },
  deleteImage: { fn: deleteImage_ },
  savePdf: { fn: savePdf_ },
  getPdf: { fn: getPdf_ },

  listUsers: { role: 'admin', fn: listUsers_ },
  saveUser: { role: 'admin', fn: saveUser_ },
  resetPassword: { role: 'admin', fn: resetPassword_ },
  deleteUser: { role: 'admin', fn: deleteUser_ },
  usage: { role: 'admin', fn: function () { return { used: DriveApp.getStorageUsed(), limit: DriveApp.getStorageLimit() }; } }
};

/* =============================================================
 * AUTENTIKASI
 * ============================================================= */
function login_(req) {
  var uname = String(req.username || '').trim();
  var pw = String(req.password || '');
  if (!uname || !pw) throw err_('Isi username dan password.');
  var cache = CacheService.getScriptCache();
  var fk = 'fail:' + uname.toLowerCase();
  var fails = parseInt(cache.get(fk) || '0', 10);
  if (fails >= MAX_FAIL) throw err_('Terlalu banyak percobaan gagal. Coba lagi ' + Math.round(LOCK_SECONDS / 60) + ' menit lagi.', 'LOCKED');
  var u = findUser_(uname);
  if (!u || u.aktif !== 'ya' || hash_(u.salt, pw) !== u.hash) {
    cache.put(fk, String(fails + 1), LOCK_SECONDS);
    throw err_('Username atau password salah.', 'LOGIN');
  }
  cache.remove(fk);
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var th = sha_(token);
  lock_(function () {
    // bersihkan sesi kedaluwarsa
    var t = Date.now();
    var sesi = rows_('Sesi');
    for (var i = sesi.length - 1; i >= 0; i--) if (Number(sesi[i].expires) < t) deleteRow_('Sesi', sesi[i]._row);
    insert_('Sesi', { tokenHash: th, username: u.username, expires: String(t + SESSION_DAYS * 864e5) });
    update_('Pengguna', findUser_(u.username)._row, { terakhirLogin: now_() });
  });
  cache.put('s:' + th, u.username, 21600);
  log_(u.username, 'login', '');
  return { token: token, user: publicUser_(u) };
}

function auth_(token) {
  if (!token || String(token).length < 40) return null;
  var th = sha_(String(token));
  var cache = CacheService.getScriptCache();
  var uname = cache.get('s:' + th);
  if (!uname) {
    var s = rows_('Sesi').filter(function (r) { return r.tokenHash === th && Number(r.expires) > Date.now(); })[0];
    if (!s) return null;
    uname = s.username;
    cache.put('s:' + th, uname, 21600);
  }
  var u = findUser_(uname);
  if (!u || u.aktif !== 'ya') { cache.remove('s:' + th); return null; }
  u._th = th;
  return u;
}

function removeSession_(token) {
  if (!token) return;
  var th = sha_(String(token));
  CacheService.getScriptCache().remove('s:' + th);
  lock_(function () {
    var s = rows_('Sesi').filter(function (r) { return r.tokenHash === th; })[0];
    if (s) deleteRow_('Sesi', s._row);
  });
}

function removeUserSessions_(username, exceptTh) {
  var cache = CacheService.getScriptCache();
  var sesi = rows_('Sesi');
  for (var i = sesi.length - 1; i >= 0; i--) {
    if (sesi[i].username.toLowerCase() === username.toLowerCase() && sesi[i].tokenHash !== exceptTh) {
      cache.remove('s:' + sesi[i].tokenHash);
      deleteRow_('Sesi', sesi[i]._row);
    }
  }
}

function changePassword_(req, user) {
  if (hash_(user.salt, String(req.old || '')) !== user.hash) throw err_('Password lama salah.');
  checkPw_(req.baru);
  lock_(function () { setPassword_(user, req.baru); removeUserSessions_(user.username, user._th); });
  log_(user.username, 'ganti sandi', '');
  return true;
}

function checkPw_(pw) {
  if (!pw || String(pw).length < 6) throw err_('Password minimal 6 karakter.');
}

function setPassword_(u, pw) {
  var salt = newSalt_();
  update_('Pengguna', u._row, { salt: salt, hash: hash_(salt, String(pw)) });
}

function newSalt_() { return Utilities.getUuid().replace(/-/g, ''); }

function hash_(salt, pw) {
  var h = salt + '|' + pw;
  for (var i = 0; i < HASH_ROUNDS; i++) h = sha_(h + '|' + salt);
  return h;
}

function sha_(s) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  var out = '';
  for (var i = 0; i < b.length; i++) { var v = b[i] < 0 ? b[i] + 256 : b[i]; out += (v < 16 ? '0' : '') + v.toString(16); }
  return out;
}

function publicUser_(u) {
  return { username: u.username, nama: u.nama, peran: u.peran, aktif: u.aktif === 'ya', nip: u.nip || '' };
}

function saveProfile_(req, user) {
  var nip = String(req.nip || '').replace(/[^0-9 ]/g, '').trim().slice(0, 30);
  lock_(function () { update_('Pengguna', findUser_(user.username)._row, { nip: nip }); });
  return publicUser_(findUser_(user.username));
}

/* Tambah kolom baru di header Sheets bila database dibuat oleh versi lama. */
function migrate_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SCHEMA') === SCHEMA || !props.getProperty('SS_ID')) return;
  var ss = db_();
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]);
  });
  if (!readProgram_().kota) setProgram_('kota', 'Kudus');
  props.setProperty('SCHEMA', SCHEMA);
}

function findUser_(uname) {
  var l = String(uname || '').trim().toLowerCase();
  return rows_('Pengguna').filter(function (r) { return r.username.toLowerCase() === l; })[0] || null;
}

/* =============================================================
 * DATA UMUM
 * ============================================================= */
function bootstrap_(req, user) {
  var prog = readProgram_();
  return {
    serverVersion: APP_VERSION,
    user: publicUser_(user),
    program: prog,
    sekolah: rows_('Sekolah').map(sekolahOut_).sort(function (a, b) { return (a.urutan - b.urutan) || a.nama.localeCompare(b.nama); }),
    peserta: rows_('Peserta').map(function (p) { return { id: p.id, sekolahId: p.sekolahId, nama: p.nama, jabatan: p.jabatan, kelas: p.kelas }; }),
    pengguna: rows_('Pengguna').map(publicUser_),
    rekap: rekapList_()
  };
}

function sekolahOut_(s) {
  return { id: s.id, nama: s.nama, alias: s.alias ? s.alias.split('|') : [], fasil: fasilList_(s), urutan: Number(s.urutan) || 0,
    ksNama: s.ksNama || '', ksNip: s.ksNip || '' };
}

function fasilList_(s) { return String(s.fasil || '').split('|').filter(String); }

function inList_(s, user) {
  return fasilList_(s).some(function (u) { return u.toLowerCase() === user.username.toLowerCase(); });
}

function namaFasil_(s) {
  return fasilList_(s).map(function (u) { var x = findUser_(u); return x ? x.nama : u; }).join(' dan ') || 'admin';
}

function rekapList_() {
  return rows_('Rekap').map(function (r) {
    return { key: r.key, sekolahId: r.sekolahId, no: Number(r.no), status: r.status, tanggal: r.tanggal,
      rataPre: r.rataPre, rataPost: r.rataPost, pdfId: r.pdfId, pdfAt: Number(r.pdfAt) || 0,
      updatedAt: Number(r.updatedAt) || 0, updatedBy: r.updatedBy, version: Number(r.version) || 0,
      reward: parseReward_(r.reward) };
  });
}

/* Reward (bintang) per peserta pada satu laporan: hanya peserta yang dicentang hadir, angka bulat >= 0. */
function rewardHadir_(rep) {
  var out = {};
  var src = rep && rep.reward && typeof rep.reward === 'object' ? rep.reward : {};
  (Array.isArray(rep && rep.hadir) ? rep.hadir : []).forEach(function (id) {
    var v = src[id];
    if (v === '' || v === null || v === undefined) return;
    var n = Math.floor(Number(v));
    if (isFinite(n) && n >= 0) out[String(id)] = n;
  });
  return out;
}

function parseReward_(s) {
  if (!s) return {};
  try { var o = JSON.parse(s); return o && typeof o === 'object' ? o : {}; } catch (x) { return {}; }
}

function readProgram_() {
  var o = {};
  rows_('Program').forEach(function (r) { o[r.kunci] = r.nilai; });
  return o;
}

function setProgram_(k, v) {
  var r = rows_('Program').filter(function (x) { return x.kunci === k; })[0];
  if (r) update_('Program', r._row, { nilai: v });
  else insert_('Program', { kunci: k, nilai: v });
}

function saveProgram_(req, user) {
  var p = req.program || {};
  lock_(function () {
    PROGRAM_KEYS.forEach(function (k) { if (k !== 'kopId' && p[k] !== undefined) setProgram_(k, String(p[k]).slice(0, 300)); });
  });
  return readProgram_();
}

function uploadKop_(req, user) {
  var old = readProgram_().kopId;
  if (req.hapus) {
    lock_(function () { setProgram_('kopId', ''); });
    if (old) trashFile_(old);
    return { kopId: '' };
  }
  var f = rootFolder_().createFile(blobFromReq_(req, 'kop'));
  lock_(function () {
    insert_('Berkas', { fileId: f.getId(), key: 'program', jenis: 'kop', dibuat: now_() });
    setProgram_('kopId', f.getId());
  });
  if (old) trashFile_(old);
  log_(user.username, 'ubah kop', '');
  return { kopId: f.getId() };
}

/* =============================================================
 * SEKOLAH & PESERTA
 * ============================================================= */
/* Admin: tambah sekolah, ubah nama, atur Fasilitator 1 & 2.
 * Fasilitator: hanya melengkapi kepala sekolah (nama & NIP) sekolah binaannya. */
function saveSekolah_(req, user) {
  if (user.peran === 'pemantau') throw err_('Anda tidak berhak mengubah data sekolah.', 'FORBIDDEN');
  var isAdm = user.peran === 'admin';
  var d = req.sekolah || {};
  var ksNama = String(d.ksNama || '').trim().slice(0, 120);
  var ksNip = String(d.ksNip || '').replace(/[^0-9 ]/g, '').trim().slice(0, 30);
  var alias = (d.alias || []).map(function (a) { return String(a).trim(); }).filter(String).join('|');
  var result;
  if (!isAdm) {
    if (!d.id) throw err_('Sekolah binaan didaftarkan oleh admin.', 'FORBIDDEN');
    lock_(function () {
      var ex = rows_('Sekolah').filter(function (r) { return r.id === d.id; })[0];
      if (!ex) throw err_('Sekolah tidak ditemukan.', 'NOTFOUND');
      if (!inList_(ex, user)) throw err_('Sekolah ini bukan sekolah binaan Anda.', 'FORBIDDEN');
      update_('Sekolah', ex._row, { ksNama: ksNama, ksNip: ksNip, alias: alias });
      result = ex.id;
    });
    return sekolahOut_(rows_('Sekolah').filter(function (r) { return r.id === result; })[0]);
  }
  var nama = String(d.nama || '').trim().slice(0, 120);
  if (!nama) throw err_('Nama sekolah wajib diisi.');
  var fasil = [];
  (d.fasil || []).forEach(function (u) {
    u = String(u || '').trim(); if (!u) return;
    var x = findUser_(u);
    if (!x || x.aktif !== 'ya' || x.peran !== 'fasilitator') throw err_('Fasilitator "' + u + '" tidak ditemukan atau bukan fasilitator aktif.');
    if (fasil.every(function (f) { return f.toLowerCase() !== x.username.toLowerCase(); })) fasil.push(x.username);
  });
  if (fasil.length > 2) throw err_('Satu sekolah dipegang paling banyak 2 fasilitator.');
  lock_(function () {
    var ex = d.id ? rows_('Sekolah').filter(function (r) { return r.id === d.id; })[0] : null;
    if (d.id && !ex) throw err_('Sekolah tidak ditemukan.', 'NOTFOUND');
    var dup = rows_('Sekolah').filter(function (r) { return r.nama.toLowerCase() === nama.toLowerCase() && (!ex || r.id !== ex.id); })[0];
    if (dup) throw err_('Sekolah "' + nama + '" sudah ada.', 'DUPLICATE');
    var row = { nama: nama, alias: alias, fasil: fasil.join('|'), ksNama: ksNama, ksNip: ksNip };
    if (ex) {
      update_('Sekolah', ex._row, row);
      if (ex.nama !== nama && ex.folderId) { try { DriveApp.getFolderById(ex.folderId).setName(nama); } catch (x) { /* abaikan */ } }
      if (ex.fasil !== row.fasil) log_(user.username, 'ubah fasilitator sekolah', nama + ': ' + (row.fasil.replace('|', ', ') || '-'));
      result = ex.id;
    } else {
      var id = 's' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
      var folder = rootFolder_().createFolder(nama);
      row.id = id; row.folderId = folder.getId(); row.urutan = String(rows_('Sekolah').length + 1);
      insert_('Sekolah', row);
      log_(user.username, 'tambah sekolah', nama + ' (' + (row.fasil.replace('|', ', ') || 'belum ada fasil') + ')');
      result = id;
    }
  });
  return sekolahOut_(rows_('Sekolah').filter(function (r) { return r.id === result; })[0]);
}

function deleteSekolah_(req, user) {
  if (user.peran !== 'admin') throw err_('Hanya admin yang bisa menghapus sekolah.', 'FORBIDDEN');
  var sk = sekolahById_(req.id);
  lock_(function () {
    if (sk.folderId) trashFile_(sk.folderId, true);
    var rk = rows_('Rekap');
    for (var i = rk.length - 1; i >= 0; i--) if (rk[i].sekolahId === sk.id) deleteRow_('Rekap', rk[i]._row);
    replacePeserta_(sk.id, []);
    deleteRow_('Sekolah', sekolahById_(sk.id)._row);
  });
  log_(user.username, 'hapus sekolah', sk.nama + ' (folder dipindah ke Sampah Drive)');
  return true;
}

function savePeserta_(req, user) {
  var sk = sekolahById_(req.sekolahId);
  if (!canEdit_(user, sk)) throw err_('Anda hanya bisa mengubah peserta sekolah yang Anda pegang.', 'FORBIDDEN');
  var list = (req.peserta || []).map(function (p) {
    return { id: String(p.id || ''), sekolahId: sk.id, nama: String(p.nama || '').trim().slice(0, 150), jabatan: String(p.jabatan || ''), kelas: String(p.kelas || '') };
  }).filter(function (p) { return p.id && p.nama; });
  lock_(function () { replacePeserta_(sk.id, list); });
  return list.length;
}

function replacePeserta_(sekolahId, list) {
  var others = rows_('Peserta').filter(function (p) { return p.sekolahId !== sekolahId; });
  rewrite_('Peserta', others.concat(list));
}

/* =============================================================
 * LAPORAN
 * ============================================================= */
function parseKey_(key) {
  var m = String(key || '').match(/^([A-Za-z0-9]+)_(\d{1,2})$/);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 22) throw err_('Kunci laporan tidak valid.', 'BAD');
  return { sekolahId: m[1], no: Number(m[2]) };
}

function rekapRow_(key) {
  return rows_('Rekap').filter(function (r) { return r.key === key; })[0] || null;
}

function getReport_(req) {
  var k = parseKey_(req.key);
  var r = rekapRow_(req.key);
  if (!r || !r.fileId) return { report: null, version: r ? Number(r.version) || 0 : 0 };
  var json = DriveApp.getFileById(r.fileId).getBlob().getDataAsString('UTF-8');
  return { report: JSON.parse(json), version: Number(r.version) || 0, updatedAt: Number(r.updatedAt) || 0, updatedBy: r.updatedBy };
}

/* Pastikan folder sekolah & folder laporan ada; buat baris Rekap bila belum. */
function ensureReport_(key, judul) {
  var k = parseKey_(key);
  var sk = sekolahById_(k.sekolahId);
  var r = rekapRow_(key);
  var skFolder;
  try { skFolder = DriveApp.getFolderById(sk.folderId); } catch (x) { skFolder = null; }
  if (!skFolder) { skFolder = rootFolder_().createFolder(sk.nama); update_('Sekolah', sk._row, { folderId: skFolder.getId() }); }
  var nm = 'P' + (k.no < 10 ? '0' : '') + k.no + (judul ? ' ' + String(judul).slice(0, 90) : '');
  if (!r) {
    var f = skFolder.createFolder(nm);
    insert_('Rekap', { key: key, sekolahId: sk.id, sekolah: sk.nama, no: String(k.no), judul: judul || '', status: 'draf', folderId: f.getId(), version: '0', updatedAt: String(Date.now()) });
    r = rekapRow_(key);
  } else {
    var ok = true;
    try { DriveApp.getFolderById(r.folderId); } catch (x) { ok = false; }
    if (!r.folderId || !ok) { var f2 = skFolder.createFolder(nm); update_('Rekap', r._row, { folderId: f2.getId() }); r = rekapRow_(key); }
  }
  return { rekap: r, sekolah: sk };
}

function saveReport_(req, user) {
  var rep = req.report;
  if (!rep || !rep.key) throw err_('Data laporan kosong.', 'BAD');
  var k = parseKey_(rep.key);
  if (rep.sekolahId !== k.sekolahId || Number(rep.no) !== k.no) throw err_('Data laporan tidak cocok dengan kuncinya.', 'BAD');
  var sk = sekolahById_(k.sekolahId);
  if (!canFill_(user, sk)) throw err_(user.peran === 'admin' ? 'Admin hanya bisa melihat laporan. Pengisian oleh fasilitator pemegang sekolah.' : 'Laporan ini dipegang fasilitator lain. Anda hanya bisa melihat.', 'FORBIDDEN');
  var meta = req.meta || {};
  if (Array.isArray(rep.fasilHadir)) {
    var map = {};
    try { map = JSON.parse(PropertiesService.getScriptProperties().getProperty('RENAMES') || '{}'); } catch (x) { map = {}; }
    rep.fasilHadir = rep.fasilHadir.map(function (x) { return map[String(x).toLowerCase()] || x; });
  }
  var json = JSON.stringify(rep);
  if (json.length > 5000000) throw err_('Data laporan terlalu besar.', 'BAD');
  var res;
  lock_(function () {
    var cur = rekapRow_(rep.key);
    var curVer = cur ? Number(cur.version) || 0 : 0;
    if (cur && cur.fileId && !req.force && Number(req.baseVersion || 0) !== curVer) {
      throw err_('Laporan ini sudah diubah oleh ' + (cur.updatedBy || 'pengguna lain') + '.', 'CONFLICT',
        { version: curVer, updatedBy: cur.updatedBy, updatedAt: Number(cur.updatedAt) || 0 });
    }
    var en = ensureReport_(rep.key, meta.judul);
    var r = en.rekap;
    var fileId = r.fileId;
    if (fileId) {
      try { DriveApp.getFileById(fileId).setContent(json); } catch (x) { fileId = ''; }
    }
    if (!fileId) {
      var f = DriveApp.getFolderById(r.folderId).createFile('laporan.json', json, 'application/json');
      fileId = f.getId();
    }
    var ver = (Number(r.version) || 0) + 1;
    var t = Date.now();
    var oldStatus = r.status;
    update_('Rekap', r._row, {
      sekolah: sk.nama, judul: meta.judul || r.judul, status: meta.status === 'lengkap' ? 'lengkap' : 'draf',
      tanggal: String(meta.tanggal || ''), rataPre: meta.rataPre === null || meta.rataPre === undefined ? '' : String(meta.rataPre),
      rataPost: meta.rataPost === null || meta.rataPost === undefined ? '' : String(meta.rataPost),
      fileId: fileId, updatedAt: String(t), updatedBy: user.nama || user.username, version: String(ver),
      reward: JSON.stringify(rewardHadir_(rep))
    });
    if (!r.fileId) log_(user.username, 'buat laporan', rep.key + ' ' + sk.nama + ' P' + k.no);
    else if (oldStatus !== 'lengkap' && meta.status === 'lengkap') log_(user.username, 'laporan lengkap', sk.nama + ' P' + k.no);
    res = { version: ver, updatedAt: t, updatedBy: user.nama || user.username };
  });
  return res;
}

function deleteReport_(req, user) {
  var k = parseKey_(req.key);
  var sk = sekolahById_(k.sekolahId);
  if (!canEdit_(user, sk)) throw err_('Anda tidak berhak menghapus laporan ini.', 'FORBIDDEN');
  lock_(function () {
    var r = rekapRow_(req.key);
    if (!r) return;
    if (r.folderId) trashFile_(r.folderId, true);
    deleteRow_('Rekap', r._row);
  });
  log_(user.username, 'hapus laporan', sk.nama + ' P' + k.no + ' (dipindah ke Sampah Drive)');
  return true;
}

/* ---------- Berkas (foto, scan, PDF) ---------- */
function blobFromReq_(req, defName) {
  var b64 = String(req.b64 || '');
  if (!b64) throw err_('Berkas kosong.', 'BAD');
  if (b64.length > 14000000) throw err_('Berkas terlalu besar (maks ±10 MB).', 'BAD');
  var mime = /^(image\/(jpeg|png)|application\/pdf)$/.test(req.mime) ? req.mime : 'image/jpeg';
  var name = String(req.nama || defName).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
  return Utilities.newBlob(Utilities.base64Decode(b64), mime, name);
}

function berkasById_(id) {
  return rows_('Berkas').filter(function (r) { return r.fileId === id; })[0] || null;
}

function uploadImage_(req, user) {
  var k = parseKey_(req.key);
  var sk = sekolahById_(k.sekolahId);
  if (!canFill_(user, sk)) throw err_('Anda tidak berhak menambah foto pada laporan ini.', 'FORBIDDEN');
  var blob = blobFromReq_(req, 'foto.jpg');
  var id;
  lock_(function () {
    var en = ensureReport_(req.key, req.judul);
    var f = DriveApp.getFolderById(en.rekap.folderId).createFile(blob);
    id = f.getId();
    insert_('Berkas', { fileId: id, key: req.key, jenis: String(req.jenis || 'foto'), dibuat: now_() });
  });
  return { id: id };
}

function getImages_(req) {
  var ids = (req.ids || []).slice(0, 15);
  var reg = {};
  rows_('Berkas').forEach(function (r) { reg[r.fileId] = r; });
  var out = {};
  ids.forEach(function (id) {
    if (!reg[id] || reg[id].jenis === 'pdf') return;   // hanya berkas milik aplikasi ini
    try {
      var b = DriveApp.getFileById(id).getBlob();
      out[id] = { mime: b.getContentType(), b64: Utilities.base64Encode(b.getBytes()) };
    } catch (x) { out[id] = null; }
  });
  return out;
}

function deleteImage_(req, user) {
  var b = berkasById_(req.id);
  if (!b) return true;
  if (b.key === 'program') { if (user.peran !== 'admin') throw err_('Hanya admin.', 'FORBIDDEN'); }
  else {
    var sk = sekolahById_(parseKey_(b.key).sekolahId);
    if (!canFill_(user, sk)) throw err_('Anda tidak berhak menghapus foto ini.', 'FORBIDDEN');
  }
  lock_(function () {
    trashFile_(b.fileId);
    var again = berkasById_(req.id);
    if (again) deleteRow_('Berkas', again._row);
  });
  return true;
}

function savePdf_(req, user) {
  parseKey_(req.key);
  var r = rekapRow_(req.key);
  if (!r || !r.fileId) throw err_('Laporan belum tersimpan di server.', 'BAD');
  if (r.status !== 'lengkap') throw err_('Hanya laporan lengkap yang diarsipkan.', 'BAD');
  var blob = blobFromReq_({ b64: req.b64, mime: 'application/pdf', nama: req.nama }, 'laporan.pdf');
  var id, t = Date.now();
  lock_(function () {
    var cur = rekapRow_(req.key);
    var old = cur.pdfId;
    var f = DriveApp.getFolderById(cur.folderId).createFile(blob);
    id = f.getId();
    insert_('Berkas', { fileId: id, key: req.key, jenis: 'pdf', dibuat: now_() });
    update_('Rekap', cur._row, { pdfId: id, pdfAt: String(t) });
    if (old) {
      trashFile_(old);
      var ob = berkasById_(old); if (ob) deleteRow_('Berkas', ob._row);
    }
  });
  return { pdfId: id, pdfAt: t };
}

function getPdf_(req) {
  var r = rekapRow_(String(req.key || ''));
  if (!r || !r.pdfId) throw err_('Arsip PDF belum ada.', 'BAD');
  var b = DriveApp.getFileById(r.pdfId).getBlob();
  return { b64: Utilities.base64Encode(b.getBytes()), pdfAt: Number(r.pdfAt) || 0 };
}

/* =============================================================
 * PENGGUNA (admin)
 * ============================================================= */
function listUsers_() {
  return rows_('Pengguna').map(function (u) {
    var o = publicUser_(u); o.dibuat = u.dibuat; o.terakhirLogin = u.terakhirLogin; return o;
  });
}

var USERNAME_RE = /^[A-Za-z0-9._-]{3,30}$/;
var USERNAME_MSG = 'Username 3–30 karakter: huruf, angka, titik, minus, atau garis bawah (tanpa spasi).';

/* Tambah (mode "create") atau ubah (mode "edit") pengguna. Ubah username ikut memperbarui sekolah, sesi & laporan. */
function saveUser_(req, user) {
  var d = req.user || {};
  var mode = d.mode === 'create' ? 'create' : 'edit';
  var uname = String(d.username || '').trim();
  if (!USERNAME_RE.test(uname)) throw err_(USERNAME_MSG);
  var peran = ROLES.indexOf(d.peran) >= 0 ? d.peran : 'fasilitator';
  var nama = String(d.nama || '').trim().slice(0, 120);
  if (!nama) throw err_('Nama lengkap wajib diisi.');
  var aktif = d.aktif === false ? 'tidak' : 'ya';
  var nip = String(d.nip || '').replace(/[^0-9 ]/g, '').trim().slice(0, 30);
  var info = {};
  lock_(function () {
    var ex = findUser_(uname);
    if (mode === 'create') {
      if (ex) throw err_('Username "' + uname + '" sudah dipakai.');
      checkPw_(d.password);
      insert_('Pengguna', { username: uname, nama: nama, peran: peran, aktif: aktif, dibuat: now_(), nip: nip }, function (o) {
        o.salt = newSalt_(); o.hash = hash_(o.salt, String(d.password));
      });
      log_(user.username, 'tambah pengguna', uname + ' (' + peran + ')');
      return;
    }
    if (!ex) throw err_('Pengguna tidak ditemukan.', 'NOTFOUND');
    var self = ex.username.toLowerCase() === user.username.toLowerCase();
    if (self && (peran !== 'admin' || aktif !== 'ya')) throw err_('Anda tidak bisa menurunkan peran atau menonaktifkan akun Anda sendiri.');
    var baru = String(d.newUsername || '').trim();
    if (baru && baru !== ex.username) {
      if (!USERNAME_RE.test(baru)) throw err_(USERNAME_MSG);
      var lain = findUser_(baru);
      if (lain && lain.username.toLowerCase() !== ex.username.toLowerCase()) throw err_('Username "' + baru + '" sudah dipakai pengguna lain.');
      info.reportsUpdated = renameUser_(ex.username, baru);
      info.renamed = { from: ex.username, to: baru };
      log_(user.username, 'ganti username', ex.username + ' → ' + baru);
      ex = findUser_(baru);
    }
    update_('Pengguna', ex._row, { nama: nama, peran: peran, aktif: aktif, nip: nip });
    if (aktif !== 'ya') removeUserSessions_(ex.username, '');
    if (d.password) { checkPw_(d.password); setPassword_(findUser_(ex.username), d.password); }
  });
  return { users: listUsers_(), info: info };
}

/* Ganti username di semua tempat yang menyimpannya. Dipanggil di dalam lock_. */
function renameUser_(lama, baru) {
  var low = lama.toLowerCase();
  var u = findUser_(lama);
  update_('Pengguna', u._row, { username: baru });
  // catat pemetaan username lama -> baru (untuk data yang masih terkirim dari perangkat dengan nama lama)
  var props = PropertiesService.getScriptProperties();
  var map = {};
  try { map = JSON.parse(props.getProperty('RENAMES') || '{}'); } catch (x) { map = {}; }
  Object.keys(map).forEach(function (k) { if (String(map[k]).toLowerCase() === low) map[k] = baru; });
  map[low] = baru;
  delete map[baru.toLowerCase()];
  props.setProperty('RENAMES', JSON.stringify(map));
  // sekolah binaan (Fasilitator 1/2)
  var sekolahIds = [];
  rows_('Sekolah').forEach(function (sk) {
    var f = fasilList_(sk);
    if (f.some(function (x) { return x.toLowerCase() === low; })) {
      sekolahIds.push(sk.id);
      update_('Sekolah', sk._row, { fasil: f.map(function (x) { return x.toLowerCase() === low ? baru : x; }).join('|') });
    }
  });
  // sesi login tetap berlaku dengan username baru
  var cache = CacheService.getScriptCache();
  rows_('Sesi').forEach(function (r) {
    if (r.username.toLowerCase() === low) { update_('Sesi', r._row, { username: baru }); cache.remove('s:' + r.tokenHash); }
  });
  // "fasilitator yang hadir" di laporan sekolah binaannya
  var n = 0;
  rows_('Rekap').forEach(function (r) {
    if (sekolahIds.indexOf(r.sekolahId) < 0 || !r.fileId) return;
    try {
      var f = DriveApp.getFileById(r.fileId);
      var rep = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
      if (!Array.isArray(rep.fasilHadir) || !rep.fasilHadir.some(function (x) { return String(x).toLowerCase() === low; })) return;
      rep.fasilHadir = rep.fasilHadir.map(function (x) { return String(x).toLowerCase() === low ? baru : x; });
      f.setContent(JSON.stringify(rep));
      update_('Rekap', r._row, { version: String((Number(r.version) || 0) + 1) });
      n++;
    } catch (x) { /* lewati berkas yang tidak terbaca */ }
  });
  return n;
}

function deleteUser_(req, user) {
  var u = findUser_(req.username);
  if (!u) throw err_('Pengguna tidak ditemukan.', 'NOTFOUND');
  if (u.username.toLowerCase() === user.username.toLowerCase()) throw err_('Anda tidak bisa menghapus akun Anda sendiri.');
  var sks = rows_('Sekolah').filter(function (sk) { return inList_(sk, u); }).map(function (sk) { return sk.nama; });
  if (sks.length) throw err_(u.nama + ' masih memegang ' + sks.join(', ') + '. Lepaskan dulu di menu Data Sekolah.', 'INUSE', { sekolah: sks });
  if (u.peran === 'admin' && rows_('Pengguna').filter(function (x) { return x.peran === 'admin' && x.aktif === 'ya'; }).length <= 1) throw err_('Admin terakhir tidak bisa dihapus.');
  lock_(function () {
    removeUserSessions_(u.username, '');
    deleteRow_('Pengguna', findUser_(u.username)._row);
  });
  log_(user.username, 'hapus pengguna', u.username + ' (' + u.nama + ')');
  return listUsers_();
}

function resetPassword_(req, user) {
  var u = findUser_(req.username);
  if (!u) throw err_('Pengguna tidak ditemukan.');
  checkPw_(req.password);
  lock_(function () { setPassword_(u, req.password); removeUserSessions_(u.username, ''); });
  log_(user.username, 'reset sandi', u.username);
  return true;
}

/* =============================================================
 * UTILITAS
 * ============================================================= */
/* Data sekolah (kepala sekolah, guru): admin atau fasil pemegang. */
function canEdit_(user, sk) {
  if (user.peran === 'admin') return true;
  return canFill_(user, sk);
}

/* Isi laporan: hanya fasilitator pemegang sekolah. Admin hanya melihat. */
function canFill_(user, sk) {
  return user.peran === 'fasilitator' && sk && inList_(sk, user);
}

function sekolahById_(id) {
  var s = rows_('Sekolah').filter(function (r) { return r.id === id; })[0];
  if (!s) throw err_('Sekolah tidak ditemukan.', 'NOTFOUND');
  return s;
}

function rootFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty('ROOT_ID');
  if (!id) throw err_('Server belum disiapkan. Jalankan setup() di Apps Script.', 'SETUP');
  return DriveApp.getFolderById(id);
}

function trashFile_(id, isFolder) {
  try { (isFolder ? DriveApp.getFolderById(id) : DriveApp.getFileById(id)).setTrashed(true); } catch (x) { /* abaikan */ }
}

function err_(msg, code, extra) { var e = new Error(msg); e.code = code; e.extra = extra; return e; }

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function now_() { return new Date().toISOString(); }

function lock_(fn) {
  var l = LockService.getScriptLock();
  if (!l.tryLock(25000)) throw err_('Server sedang sibuk, coba lagi sebentar.', 'BUSY');
  try { return fn(); } finally { _memo = {}; l.releaseLock(); }
}

function log_(username, aksi, detail) {
  try { db_().getSheetByName('Log').appendRow([now_(), username, aksi, String(detail || '').slice(0, 300)]); }
  catch (x) { /* log tidak boleh menggagalkan aksi */ }
}

/* ---------- Akses Sheets (semua nilai disimpan sebagai teks) ---------- */
var _ss = null;
var _memo = {};

function db_() {
  if (_ss) return _ss;
  var id = PropertiesService.getScriptProperties().getProperty('SS_ID');
  if (!id) throw err_('Server belum disiapkan. Jalankan setup() di Apps Script.', 'SETUP');
  _ss = SpreadsheetApp.openById(id);
  return _ss;
}

function rows_(name) {
  if (_memo[name]) return _memo[name];
  var sh = db_().getSheetByName(name);
  var cols = SHEETS[name];
  var last = sh.getLastRow();
  var vals = last > 1 ? sh.getRange(2, 1, last - 1, cols.length).getValues() : [];
  var tz = Session.getScriptTimeZone();
  var out = [];
  vals.forEach(function (v, i) {
    if (v.every(function (c) { return c === '' || c === null; })) return;
    var o = { _row: i + 2 };
    cols.forEach(function (c, j) {
      var x = v[j];
      if (x instanceof Date) x = Utilities.formatDate(x, tz, 'yyyy-MM-dd');
      o[c] = x === null || x === undefined ? '' : String(x);
    });
    out.push(o);
  });
  _memo[name] = out;
  return out;
}

function insert_(name, obj, mutate) {
  if (mutate) mutate(obj);
  var sh = db_().getSheetByName(name);
  var cols = SHEETS[name];
  var row = sh.getLastRow() + 1;
  var rg = sh.getRange(row, 1, 1, cols.length);
  rg.setNumberFormat('@');
  rg.setValues([cols.map(function (c) { return obj[c] === undefined || obj[c] === null ? '' : String(obj[c]); })]);
  delete _memo[name];
}

function update_(name, rowNum, patch) {
  var sh = db_().getSheetByName(name);
  var cols = SHEETS[name];
  var rg = sh.getRange(rowNum, 1, 1, cols.length);
  var cur = rg.getValues()[0];
  var nv = cols.map(function (c, j) { return patch[c] !== undefined ? (patch[c] === null ? '' : String(patch[c])) : cur[j]; });
  rg.setNumberFormat('@');
  rg.setValues([nv]);
  delete _memo[name];
}

function deleteRow_(name, rowNum) {
  db_().getSheetByName(name).deleteRow(rowNum);
  delete _memo[name];
}

function rewrite_(name, list) {
  var sh = db_().getSheetByName(name);
  var cols = SHEETS[name];
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, cols.length).clearContent();
  if (list.length) {
    var rg = sh.getRange(2, 1, list.length, cols.length);
    rg.setNumberFormat('@');
    rg.setValues(list.map(function (o) { return cols.map(function (c) { return o[c] === undefined ? '' : String(o[c]); }); }));
  }
  delete _memo[name];
}
