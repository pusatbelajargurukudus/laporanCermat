/**
 * LAPORAN CERMAT — server Google Apps Script
 * --------------------------------------------------------------
 * Semua data disimpan di Google Drive akun pemilik skrip ini:
 *   LAPORAN CERMAT/
 *     Database CERMAT (Google Sheets) : Pengguna, Sekolah, Peserta, Program, Rekap, Berkas, Sesi, Log, Pengesahan,
 *                                       TesTautan, TesBuka
 *     <Nama Sekolah>/P01 <Judul>/laporan.json, foto, scan, PDF arsip
 *
 * Cara pasang: lihat PANDUAN-DEPLOY.md
 *   1. Script Properties: ADMIN_USERNAME & ADMIN_PASSWORD
 *   2. Jalankan setup()
 *   3. Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone)
 */

var APP_VERSION = '3.5.2';
var SCHEMA = '2.9';
var SESSION_DAYS = 30;
var MAX_FAIL = 5;          // salah sandi berturut-turut
var LOCK_SECONDS = 600;    // lama kunci setelah salah sandi (detik)
var HASH_ROUNDS = 120;
var ROLES = ['admin', 'fasilitator', 'pemantau', 'kepsek', 'guru'];
/* Akun guru (satu akun dipakai bersama per sekolah) hanya untuk masuk portal CERMAT. */
var GURU_ACTIONS = ['bootstrap', 'me', 'logout', 'tesList', 'materiList', 'materiPdf', 'bintangSekolah', 'progresSekolah', 'nilaiPerbarui', 'tesSudah'];
/* Pendampingan yang memakai pretes & postes (satu Google Form per pendampingan). */
var TES_NO = [1, 2, 3, 4, 5, 6, 7];
var REF_NO = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];   // refleksi: satu form per pendampingan
/* Kunci baris TesTautan: pretes/postes "3", refleksi "R3" */
function tesKunci_(no, ref) { return (ref ? 'R' : '') + no; }
function tesLabel_(kunci) { kunci = String(kunci); return kunci.charAt(0) === 'R' ? 'refleksi P' + kunci.slice(1) : 'P' + kunci; }
var PROGRAM_KEYS = ['program', 'programKepanjangan', 'penyelenggara', 'kota', 'kopId'];

var SHEETS = {
  Pengguna: ['username', 'nama', 'peran', 'salt', 'hash', 'aktif', 'dibuat', 'terakhirLogin', 'nip', 'sekolahId'],
  Sekolah: ['id', 'nama', 'alias', 'fasil', 'folderId', 'urutan', 'ksNama', 'ksNip'],
  Peserta: ['id', 'sekolahId', 'nama', 'jabatan', 'kelas', 'alias', 'gabungan', 'periksa'],   // alias: ejaan nama di form; gabungan: id peserta ganda yang sudah digabung ke baris ini; periksa: 'ya' = ditambahkan otomatis dari form, belum diperiksa fasil
  Program: ['kunci', 'nilai'],
  Rekap: ['key', 'sekolahId', 'sekolah', 'no', 'judul', 'status', 'tanggal', 'rataPre', 'rataPost',
    'fileId', 'folderId', 'pdfId', 'pdfAt', 'updatedAt', 'updatedBy', 'version', 'reward', 'ringkas', 'oto'],   // ringkas: nilai per peserta + capaian (kartu Progres); oto: nilai otomatis (waktu cek, jawaban tertunda)
  Berkas: ['fileId', 'key', 'jenis', 'dibuat'],
  Sesi: ['tokenHash', 'username', 'expires'],
  Log: ['waktu', 'username', 'aksi', 'detail'],
  Pengesahan: ['id', 'key', 'peran', 'username', 'nama', 'nip', 'version', 'waktu', 'aktif', 'batalAt'],
  TesTautan: ['no', 'editUrl', 'formId', 'pubUrl', 'entJenis', 'optPre', 'optPost', 'entSekolah', 'opsiSekolah', 'catatan', 'diubah', 'oleh', 'entNama', 'entJabatan', 'opsiJabatan'],   // entNama '-' = form tanpa isian nama
  TesBuka: ['sekolahId', 'no', 'jenis', 'aktif', 'sampai', 'oleh', 'waktu'],
  MateriBuka: ['sekolahId', 'no', 'aktif', 'oleh', 'waktu'],          // materi pendampingan yang ditampilkan untuk guru & kepsek
  MateriPeta: ['fileId', 'dari', 'sampai', 'oleh', 'waktu']           // rentang pendampingan yang diisi admin (mis. modul P1–P7)
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
      if (user.peran === 'guru' && GURU_ACTIONS.indexOf(req.action) < 0) throw err_('Akun guru hanya untuk membuka Pustaka CERMAT.', 'FORBIDDEN');
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
  verify: { pub: true, fn: verify_ },
  login: { pub: true, fn: login_ },
  logout: { fn: function (req, user) { removeSession_(req.token); return true; } },
  bootstrap: { fn: bootstrap_ },
  me: { fn: function (req, user) { return publicUser_(user); } },
  rekap: { fn: function (req, user) { return rekapList_(user); } },
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
  sahkan: { fn: sahkan_ },
  batalSah: { fn: batalSah_ },

  tesList: { fn: tesList_ },
  tesSet: { fn: tesSet_ },
  tesResponses: { fn: tesResponses_ },
  tesLinks: { role: 'admin', fn: tesLinks_ },
  tesSaveLinks: { role: 'admin', fn: tesSaveLinks_ },
  materiList: { fn: materiList_ },
  materiSet: { fn: materiSet_ },
  materiPeta: { role: 'admin', fn: materiPeta_ },
  materiPdf: { fn: materiPdf_ },
  bintangSekolah: { fn: bintangSekolah_ },
  progresSekolah: { fn: progresSekolah_ },
  nilaiPerbarui: { fn: nilaiPerbarui_ },
  tesSudah: { fn: tesSudah_ },
  reportVersi: { fn: reportVersi_ },

  listUsers: { role: 'admin', fn: listUsers_ },
  saveUser: { role: 'admin', fn: saveUser_ },
  resetPassword: { role: 'admin', fn: resetPassword_ },
  deleteUser: { role: 'admin', fn: deleteUser_ },
  usage: { role: 'admin', fn: function () { return { used: DriveApp.getStorageUsed(), limit: DriveApp.getStorageLimit() }; } }
};

/* =============================================================
 * PRETES & POSTES (Google Form)
 * - Admin menempelkan tautan EDIT form tiap pendampingan (P1–P7). Tautan edit hanya disimpan di server;
 *   yang dibagikan ke peserta adalah tautan isian (getPublishedUrl) + isian awal Jenis tes & Asal sekolah.
 * - Fasilitator membuka (aktifkan) pretes/postes untuk sekolahnya; otomatis tertutup pukul 23.59 hari itu.
 *   Membuka postes otomatis menutup pretes sekolah itu.
 * - Guru & kepala sekolah hanya menerima tautan isian bila tesnya sedang dibuka untuk sekolah mereka.
 * - Nilai bisa diambil langsung dari jawaban form (akun pemilik skrip harus editor form):
 *   fasilitator untuk sekolahnya, admin & pemantau untuk semua sekolah (tombol Lihat hasil di portal).
 * ============================================================= */
function tesFormId_(url) {
  var m = String(url || '').match(/\/forms\/d\/(?!e\/)([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : '';
}

function tesOpenForm_(row) {
  try { return FormApp.openById(row.formId); }
  catch (x) { throw err_('Form ' + tesLabel_(row.no) + ' tidak bisa dibuka server. Pastikan akun pemilik Apps Script adalah editor form tersebut.', 'FORM'); }
}

/* entry.N dari tautan isian-awal yang dibuat Google untuk satu jawaban item */
function tesEntry_(form, itemResp) {
  try {
    var u = form.createResponse().withItemResponse(itemResp).toPrefilledUrl();
    var m = u.match(/entry\.(\d+)=/);
    return m ? m[1] : '';
  } catch (x) { return ''; }
}

function tesChoiceItem_(item) {
  var t = item.getType();
  if (t === FormApp.ItemType.MULTIPLE_CHOICE) return item.asMultipleChoiceItem();
  if (t === FormApp.ItemType.LIST) return item.asListItem();
  return null;
}

/* Baca struktur form: tautan isian, pertanyaan Jenis tes & Asal sekolah */
function tesInspect_(no, editUrl, ref) {
  var formId = tesFormId_(editUrl);
  var kunci = tesKunci_(no, ref);
  if (!formId) throw err_(tesLabel_(kunci).replace(/^r/, 'R') + ': tempel tautan EDIT form (…/forms/d/…/edit), bukan tautan untuk peserta.', 'BAD');
  var row = { no: kunci, editUrl: String(editUrl).trim(), formId: formId };
  var form = tesOpenForm_(row);
  var cat = [];
  row.pubUrl = form.getPublishedUrl();
  var items = form.getItems();
  var jenis = null, sek = null;
  items.forEach(function (it) {
    var t = String(it.getTitle() || '').toLowerCase();
    if (!jenis && /jenis\s*tes|jenis\s*test|pilih\s*tes|^tes$|^test$/.test(t) && tesChoiceItem_(it)) jenis = it;
    if (!sek && /asal\s*sekolah|nama\s*sekolah|^sekolah|instansi|satuan pendidikan/.test(t)) sek = it;
  });
  row.entJenis = ''; row.optPre = ''; row.optPost = ''; row.entSekolah = ''; row.opsiSekolah = '';
  if (ref) { /* refleksi: tanpa pertanyaan jenis tes & tanpa kuis */ }
  else if (jenis) {
    var ci = tesChoiceItem_(jenis);
    var vals = ci.getChoices().map(function (c) { return c.getValue(); });
    var pre = vals.filter(function (v) { return /pre|pra|awal/i.test(v); })[0];
    var post = vals.filter(function (v) { return /post|akhir/i.test(v); })[0];
    if (pre && post) {
      row.entJenis = tesEntry_(form, ci.createResponse(pre));
      row.optPre = pre; row.optPost = post;
    } else cat.push('Pilihan pretes/postes di pertanyaan "' + jenis.getTitle() + '" tidak dikenali.');
  } else cat.push('Pertanyaan "Jenis tes" (pilihan Pre-tes / Post-tes) tidak ditemukan; isian otomatis jenis tes dilewati.');
  if (sek) {
    var t = sek.getType();
    if (t === FormApp.ItemType.TEXT) row.entSekolah = tesEntry_(form, sek.asTextItem().createResponse('x'));
    else {
      var cs = tesChoiceItem_(sek);
      if (cs) {
        var opsi = cs.getChoices().map(function (c) { return c.getValue(); });
        if (opsi.length) { row.entSekolah = tesEntry_(form, cs.createResponse(opsi[0])); row.opsiSekolah = opsi.join('|'); }
      }
    }
    if (!row.entSekolah) cat.push('Pertanyaan asal sekolah tidak bisa diisi otomatis.');
  } else cat.push('Pertanyaan "Asal sekolah" tidak ditemukan; isian otomatis sekolah dilewati.');
  var io = tesIsianOrang_(form, items);
  Object.keys(io).forEach(function (k) { row[k] = io[k]; });
  if (row.entNama === '-') cat.push('Pertanyaan "Nama" (jawaban singkat) tidak ditemukan; nama peserta tidak bisa diisi otomatis.');
  if (!ref && !form.isQuiz()) cat.push('Form belum diatur sebagai Kuis, jadi skor tidak terbaca otomatis.');
  if (!form.isAcceptingResponses()) cat.push('Form sedang tidak menerima respons (bisa diubah di Google Form).');
  row.catatan = cat.join(' ');
  return row;
}

/* Isian Nama (jawaban singkat) & Jabatan/Kelas: diisi otomatis dari pilihan "Pilih nama Anda" di portal */
function tesIsianOrang_(form, items) {
  var o = { entNama: '-', entJabatan: '', opsiJabatan: '' };
  var nama = null, jab = null;
  items.forEach(function (it) {
    var t = String(it.getTitle() || '').toLowerCase();
    if (!nama && /nama/.test(t) && !/sekolah|instansi|lembaga|madrasah|kepala/.test(t) && it.getType() === FormApp.ItemType.TEXT) nama = it;
    if (!jab && /jabatan|kelas|peran|tugas|mengajar/.test(t) && !/jenis|sekolah/.test(t)) jab = it;
  });
  if (nama) o.entNama = tesEntry_(form, nama.asTextItem().createResponse('x')) || '-';
  if (jab) {
    if (jab.getType() === FormApp.ItemType.TEXT) o.entJabatan = tesEntry_(form, jab.asTextItem().createResponse('x'));
    else {
      var cj = tesChoiceItem_(jab);
      if (cj) {
        var opsi = cj.getChoices().map(function (c) { return c.getValue(); });
        if (opsi.length) { o.entJabatan = tesEntry_(form, cj.createResponse(opsi[0])); o.opsiJabatan = opsi.join('|'); }
      }
    }
  }
  return o;
}

/* Tautan yang disimpan sebelum v3.3 belum punya isian nama: dibaca sekali dari form lalu disimpan */
function tesLengkapiNama_(links) {
  var perlu = Object.keys(links).filter(function (k) { var L = links[k]; return L && L.formId && !L.entNama; });
  if (!perlu.length) return links;
  var isi = {};
  perlu.forEach(function (no) {
    var L = links[no];
    try { var f = tesOpenForm_(L); isi[no] = tesIsianOrang_(f, f.getItems()); }
    catch (e) { /* form belum bisa dibuka: dicoba lagi lain kali */ }
  });
  if (!Object.keys(isi).length) return links;
  lock_(function () {
    rows_('TesTautan').forEach(function (r) { if (isi[r.no]) update_('TesTautan', r._row, isi[r.no]); });
  });
  return tesRowsByNo_();
}

/* Label jabatan seperti di daftar hadir: "Guru Kelas 2", "Guru PAI", "Kepala Sekolah" */
function tesJabatan_(p) { return p.jabatan === 'Guru Kelas' && p.kelas ? 'Guru Kelas ' + p.kelas : String(p.jabatan || ''); }

function tesRowsByNo_() {
  var m = {};
  rows_('TesTautan').forEach(function (r) { m[r.no] = r; });
  return m;
}

function tesAktif_(b) { return b && b.aktif === 'ya' && Date.now() < Date.parse(b.sampai); }

function tesSekolahFor_(user) {
  var all = rows_('Sekolah');
  if (user.peran === 'kepsek' || user.peran === 'guru') return all.filter(function (s) { return user.sekolahId && s.id === String(user.sekolahId); });
  if (user.peran === 'fasilitator') return all.filter(function (s) { return inList_(s, user); });
  return all;
}

function tesList_(req, user) {
  var links = tesLengkapiNama_(tesRowsByNo_());
  var sks = tesSekolahFor_(user);
  var ids = {};
  sks.forEach(function (s) { ids[s.id] = true; });
  var buka = rows_('TesBuka').filter(function (b) { return ids[b.sekolahId] && tesAktif_(b); });
  var staff = user.peran === 'admin' || user.peran === 'fasilitator';
  var isian = function (L) {
    return { url: L.pubUrl, entSekolah: L.entSekolah, opsiSekolah: L.opsiSekolah ? L.opsiSekolah.split('|') : [],
      entNama: L.entNama && L.entNama !== '-' ? L.entNama : '', entJabatan: L.entJabatan || '', opsiJabatan: L.opsiJabatan ? L.opsiJabatan.split('|') : [] };
  };
  var tes = REF_NO.map(function (no) {
    var L = TES_NO.indexOf(no) >= 0 ? (links[String(no)] || {}) : {};
    var R = links[tesKunci_(no, true)] || {};
    var st = {};
    buka.filter(function (b) { return String(b.no) === String(no); }).forEach(function (b) {
      st[b.sekolahId] = st[b.sekolahId] || {};
      st[b.sekolahId][b.jenis] = { sampai: b.sampai, oleh: b.oleh, waktu: b.waktu };
    });
    var bukaTes = Object.keys(st).some(function (sid) { return st[sid].pre || st[sid].post; });
    var bukaRef = Object.keys(st).some(function (sid) { return st[sid].ref; });
    var peserta = user.peran === 'guru' || user.peran === 'kepsek';
    var o = { no: no, ada: !!L.pubUrl, status: st, ref: { ada: !!R.pubUrl } };
    // tautan isian: staf selalu; guru & kepala sekolah hanya saat dibuka untuk sekolahnya
    if (L.pubUrl && (staff || (peserta && bukaTes))) {
      var a = isian(L);
      Object.keys(a).forEach(function (k) { o[k] = a[k]; });
      o.entJenis = L.entJenis; o.optPre = L.optPre; o.optPost = L.optPost;
    }
    if (R.pubUrl && (staff || (peserta && bukaRef))) { var b = isian(R); b.ada = true; o.ref = b; }
    return o;
  });
  // guru & kepala sekolah: daftar guru sekolahnya untuk "Pilih nama Anda" (nama + jabatan saja)
  var orang = [];
  if ((user.peran === 'guru' || user.peran === 'kepsek') && sks.length) {
    orang = rows_('Peserta').filter(function (p) { return p.sekolahId === sks[0].id; })
      .map(function (p) { return { id: p.id, nama: p.nama, jabatan: tesJabatan_(p), ks: p.id === 'ks_' + sks[0].id }; })
      .sort(function (a, b) { return (b.ks - a.ks) || a.nama.localeCompare(b.nama); });
  }
  var saya = null;
  if (user.peran === 'kepsek' && sks.length) {
    var ks = orang.filter(function (p) { return p.ks; })[0];
    saya = { nama: ks ? ks.nama : (sks[0].ksNama || user.nama), jabatan: 'Kepala Sekolah' };
  }
  return { tes: tes, sekolah: sks.map(function (s) { return { id: s.id, nama: s.nama, alias: s.alias ? s.alias.split('|') : [] }; }),
    orang: user.peran === 'guru' ? orang : [], saya: saya, sekarang: now_() };
}

function tesAkhirHari_() {
  var tz = Session.getScriptTimeZone();
  return Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'23:59:59XXX");
}

function tesSet_(req, user) {
  var no = parseInt(req.no, 10), jenis = ['pre', 'post', 'ref'].indexOf(req.jenis) >= 0 ? req.jenis : '';
  if (!jenis || (jenis === 'ref' ? REF_NO : TES_NO).indexOf(no) < 0) throw err_('Data tes tidak valid.', 'BAD');
  var sk = sekolahById_(String(req.sekolahId || ''));
  if (!(user.peran === 'admin' || canFill_(user, sk))) throw err_('Hanya fasilitator sekolah ini yang bisa membuka atau menutup tes.', 'FORBIDDEN');
  var links = tesRowsByNo_();
  if (req.buka && !(links[tesKunci_(no, jenis === 'ref')] || {}).pubUrl) throw err_('Tautan Google Form ' + tesLabel_(tesKunci_(no, jenis === 'ref')) + ' belum diisi admin.', 'BAD');
  return lock_(function () {
    var ada = rows_('TesBuka').filter(function (b) { return b.sekolahId === sk.id && String(b.no) === String(no) && b.jenis === jenis; })[0];
    var patch = req.buka
      ? { sekolahId: sk.id, no: String(no), jenis: jenis, aktif: 'ya', sampai: tesAkhirHari_(), oleh: user.nama, waktu: now_() }
      : { aktif: 'tidak', sampai: now_(), oleh: user.nama, waktu: now_() };
    if (ada) update_('TesBuka', ada._row, patch);
    else if (req.buka) insert_('TesBuka', patch);
    // membuka pretes otomatis menampilkan materi pendampingan itu untuk sekolah tersebut
    if (req.buka && jenis === 'pre') materiTandai_(sk.id, no, true, user);
    // membuka postes otomatis menutup pretes sekolah itu (satu form dipakai untuk keduanya)
    // dan membuka refleksi pendampingan itu (bila tautannya sudah diisi admin)
    if (req.buka && jenis === 'post') {
      var pre = rows_('TesBuka').filter(function (b) { return b.sekolahId === sk.id && String(b.no) === String(no) && b.jenis === 'pre' && tesAktif_(b); })[0];
      if (pre) update_('TesBuka', pre._row, { aktif: 'tidak', sampai: now_(), oleh: user.nama, waktu: now_() });
      if ((links[tesKunci_(no, true)] || {}).pubUrl) {
        var rf = rows_('TesBuka').filter(function (b) { return b.sekolahId === sk.id && String(b.no) === String(no) && b.jenis === 'ref'; })[0];
        var pr = { sekolahId: sk.id, no: String(no), jenis: 'ref', aktif: 'ya', sampai: tesAkhirHari_(), oleh: user.nama, waktu: now_() };
        if (rf) update_('TesBuka', rf._row, pr); else insert_('TesBuka', pr);
      }
    }
    log_(user.username, req.buka ? 'tesBuka' : 'tesTutup', sk.nama + ' P' + no + ' ' + jenis);
    return tesList_({}, user);
  });
}

function tesLinks_() {
  var links = tesRowsByNo_();
  var out = function (no, ref) {
    var L = links[tesKunci_(no, ref)] || {};
    return { no: no, ref: !!ref, editUrl: L.editUrl || '', pubUrl: L.pubUrl || '', catatan: L.catatan || '', diubah: L.diubah || '', oleh: L.oleh || '' };
  };
  return TES_NO.map(function (no) { return out(no, false); }).concat(REF_NO.map(function (no) { return out(no, true); }));
}

function tesSaveLinks_(req, user) {
  var list = Array.isArray(req.links) ? req.links : [];
  var hasil = [], gagal = [];
  var siap = {};
  var semua = tesRowsByNo_();
  list.forEach(function (x) {
    var no = parseInt(x.no, 10), ref = !!x.ref;
    if ((ref ? REF_NO : TES_NO).indexOf(no) < 0) return;
    var kunci = tesKunci_(no, ref);
    var url = String(x.editUrl || '').trim();
    var lama = semua[kunci];
    if (!url) { if (lama) siap[kunci] = null; return; }
    if (lama && lama.editUrl === url && lama.pubUrl && !x.periksa) return;   // tidak berubah
    try { siap[kunci] = tesInspect_(no, url, ref); }
    catch (e) { gagal.push(e.message); }
  });
  lock_(function () {
    Object.keys(siap).forEach(function (no) {
      var r = siap[no];
      var lama = rows_('TesTautan').filter(function (t) { return t.no === String(no); })[0];
      if (!r) { if (lama) deleteRow_('TesTautan', lama._row); return; }
      r.diubah = now_(); r.oleh = user.nama;
      if (lama) update_('TesTautan', lama._row, r); else insert_('TesTautan', r);
    });
  });
  if (Object.keys(siap).length) log_(user.username, 'tesTautan', Object.keys(siap).map(tesLabel_).join(', '));
  return { links: tesLinks_(), gagal: gagal };
}

/* Jawaban form sebagai tabel [judul kolom..., Skor] — dibaca oleh pengimpor yang sama dengan file CSV */
function tesResponses_(req, user) {
  var no = parseInt(req.no, 10);
  // admin & pemantau: semua sekolah (Lihat hasil); fasilitator: hanya sekolah binaannya
  if (user.peran !== 'admin' && user.peran !== 'pemantau') {
    var sk = sekolahById_(String(req.sekolahId || ''));
    if (!canFill_(user, sk)) throw err_('Hanya fasilitator sekolah ini yang bisa mengambil nilai.', 'FORBIDDEN');
  }
  var ref = req.jenis === 'ref';
  var L = tesRowsByNo_()[tesKunci_(no, ref)];
  if (!L || !L.formId) throw err_('Tautan Google Form ' + tesLabel_(tesKunci_(no, ref)) + ' belum diisi admin.' + (ref ? '' : ' Gunakan unggah file .csv / .xlsx.'), 'NOFORM');
  var out = tesBaca_(L, ref);
  // daftar guru sekolah yang boleh dilihat, supaya "Lihat hasil" memakai nama resmi & ejaan yang sudah diingat
  var boleh = {};
  tesSekolahFor_(user).forEach(function (s) { boleh[s.id] = true; });
  var peserta = rows_('Peserta').filter(function (p) { return boleh[p.sekolahId]; }).map(function (p) {
    return { id: p.id, sekolahId: p.sekolahId, nama: p.nama, alias: p.alias ? p.alias.split('|') : [] };
  });
  out.peserta = peserta;
  delete out.waktu;
  return out;
}

/* Semua jawaban satu form sebagai tabel [Timestamp, judul kolom..., Skor] + (refleksi) jenis pertanyaan & jawaban asli.
 * Dipakai tombol "Lihat hasil" di portal dan pengambilan nilai otomatis. */
function tesBaca_(L, ref, formObj) {
  var form = formObj || tesOpenForm_(L);
  var skip = [FormApp.ItemType.SECTION_HEADER, FormApp.ItemType.PAGE_BREAK, FormApp.ItemType.IMAGE, FormApp.ItemType.VIDEO];
  // keterangan bagian (judul/deskripsi bagian di atas pertanyaan), dipakai untuk arti angka skala
  var bagian = {}, ketBagian = '';
  form.getItems().forEach(function (it) {
    var t = it.getType();
    if (t === FormApp.ItemType.SECTION_HEADER || t === FormApp.ItemType.PAGE_BREAK) {
      var hlp = ''; try { hlp = String(it.getHelpText() || ''); } catch (e) { /* tanpa deskripsi */ }
      ketBagian = hlp;
    } else bagian[it.getId()] = ketBagian;
  });
  var items = form.getItems().filter(function (it) { return skip.indexOf(it.getType()) < 0; });
  var quiz = !ref && form.isQuiz();
  var maks = 0;
  if (quiz) items.forEach(function (it) { try { var p = tesPoints_(it); if (p) maks += p; } catch (x) { /* item tanpa poin */ } });
  var header = ['Timestamp'].concat(items.map(function (it) { return it.getTitle(); }));
  if (quiz) header.push('Skor');
  var tz = Session.getScriptTimeZone();
  var rows = [header], jawab = [], waktu = [];
  form.getResponses().forEach(function (r) {
    waktu.push(r.getTimestamp().getTime());
    var by = {}, raw = {};
    r.getItemResponses().forEach(function (ir) {
      var v = ir.getResponse();
      raw[ir.getItem().getId()] = v;
      by[ir.getItem().getId()] = Array.isArray(v) ? v.map(function (x) { return Array.isArray(x) ? x.join('/') : x; }).join(', ') : String(v === null || v === undefined ? '' : v);
    });
    if (ref) jawab.push(items.map(function (it) { var v = raw[it.getId()]; return v === undefined ? null : v; }));
    var row = [Utilities.formatDate(r.getTimestamp(), tz, 'yyyy-MM-dd HH:mm:ss')].concat(items.map(function (it) { return by[it.getId()] || ''; }));
    if (quiz) {
      var skor = 0;
      r.getGradableItemResponses().forEach(function (g) { skor += Number(g.getScore()) || 0; });
      row.push(skor + ' / ' + maks);
    }
    rows.push(row);
  });
  var out = { rows: rows, judul: form.getTitle(), jumlah: rows.length - 1, quiz: quiz, waktu: waktu };
  // refleksi: jenis tiap pertanyaan & jawaban asli (untuk rangkuman analisis di laporan)
  if (ref) {
    out.items = items.map(function (it) { var o = tesItemInfo_(it); o.ketBagian = bagian[it.getId()] || ''; return o; });
    out.jawab = jawab;
    try { out.ketForm = String(form.getDescription() || ''); } catch (e) { out.ketForm = ''; }
  }
  return out;
}

function tesItemInfo_(it) {
  var T = FormApp.ItemType, t = it.getType();
  var o = { judul: it.getTitle(), jenis: String(t), ket: '' };
  try { o.ket = String(it.getHelpText() || ''); } catch (e) { /* tanpa keterangan */ }
  try {
    if (t === T.SCALE) { var sc = it.asScaleItem(); o.jenis = 'SCALE'; o.min = sc.getLowerBound(); o.max = sc.getUpperBound(); o.minLabel = sc.getLeftLabel(); o.maxLabel = sc.getRightLabel(); }
    else if (t === T.MULTIPLE_CHOICE) { o.jenis = 'MC'; o.pilihan = it.asMultipleChoiceItem().getChoices().map(function (c) { return c.getValue(); }); }
    else if (t === T.LIST) { o.jenis = 'MC'; o.pilihan = it.asListItem().getChoices().map(function (c) { return c.getValue(); }); }
    else if (t === T.CHECKBOX) { o.jenis = 'CB'; o.pilihan = it.asCheckboxItem().getChoices().map(function (c) { return c.getValue(); }); }
    else if (t === T.GRID) { var g = it.asGridItem(); o.jenis = 'GRID'; o.baris = g.getRows(); o.kolom = g.getColumns(); }
    else if (t === T.CHECKBOX_GRID) { var cg = it.asCheckboxGridItem(); o.jenis = 'CGRID'; o.baris = cg.getRows(); o.kolom = cg.getColumns(); }
    else if (t === T.TEXT) o.jenis = 'TEXT';
    else if (t === T.PARAGRAPH_TEXT) o.jenis = 'PARA';
    else o.jenis = 'LAIN';
  } catch (e) { o.jenis = 'LAIN'; }
  return o;
}

function tesPoints_(it) {
  var T = FormApp.ItemType, t = it.getType();
  if (t === T.MULTIPLE_CHOICE) return it.asMultipleChoiceItem().getPoints();
  if (t === T.CHECKBOX) return it.asCheckboxItem().getPoints();
  if (t === T.LIST) return it.asListItem().getPoints();
  if (t === T.TEXT) return it.asTextItem().getPoints();
  if (t === T.PARAGRAPH_TEXT) return it.asParagraphTextItem().getPoints();
  if (t === T.SCALE) return it.asScaleItem().getPoints();
  if (t === T.GRID) return it.asGridItem().getPoints();
  if (t === T.CHECKBOX_GRID) return it.asCheckboxGridItem().getPoints();
  if (t === T.DATE) return it.asDateItem().getPoints();
  if (t === T.TIME) return it.asTimeItem().getPoints();
  return 0;
}

/* =============================================================
 * NILAI OTOMATIS — pretes, postes & refleksi dari Google Form langsung masuk ke laporan setiap sekolah
 * - Pemicu nilaiJadwal tiap 15 menit (pasang sekali: jalankan pasangNilai di editor). Hanya form yang
 *   dibuka fasilitator dalam 36 jam terakhir dan punya jawaban baru yang dibaca.
 * - Tombol "Perbarui data" (laporan & kartu Progres): nilaiPerbarui, paling sering 1x/menit per sekolah.
 * - Laporan yang sudah disahkan (minimal satu pengesahan aktif) tidak diubah; jumlah jawaban baru dicatat
 *   di Rekap.oto. Fasilitator bisa memasukkannya (paksa) dan pengesahan batal.
 * - Nama: sama persis / ejaan yang sudah diingat / sangat mirip -> peserta itu (ejaan diingat);
 *   lainnya -> peserta baru bertanda "periksa". Nama baru yang mirip satu sama lain = satu orang.
 * - Tidak ditimpa: centang hadir yang dicabut fasil (hadirLepas), kesimpulan refleksi yang diedit (kesEdit),
 *   arti skor ketikan fasil, dan capaian pilihan fasil untuk indikator yang tidak cocok dengan refleksi.
 *   Indikator yang cocok dengan refleksi selalu mengikuti refleksi.
 * Pengolahnya sama dengan di aplikasi: salinan js/importer.js di bagian bawah berkas ini.
 * ============================================================= */
var NILAI_OLEH = 'Otomatis (Google Form)';
var NILAI_JEDA = 60;          // detik: tombol Perbarui data per sekolah
var NILAI_AKTIF_JAM = 36;     // form yang dibuka/ditutup fasilitator dalam rentang ini ikut dibaca pemicu
var NILAI_TOMBOL_HARI = 14;   // tombol Progres (tanpa nomor pendampingan): form yang dibuka sekolah ini dalam 14 hari

/* Jalankan SEKALI di editor Apps Script: memasang pemicu 15 menit lalu langsung menjalankannya. */
function pasangNilai() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'nilaiJadwal') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('nilaiJadwal').timeBased().everyMinutes(15).create();
  var r = nilaiJadwal();
  Logger.log('Pemicu nilai otomatis terpasang (tiap 15 menit). Hasil pertama: ' + JSON.stringify(r));
}

function nilaiJadwal() {
  migrate_();
  var links = tesRowsByNo_();
  var batas = Date.now() - NILAI_AKTIF_JAM * 3600000;
  var buka = rows_('TesBuka');
  var hasil = [];
  Object.keys(links).forEach(function (kunci) {
    var L = links[kunci];
    if (!L || !L.formId) return;
    var ref = String(kunci).charAt(0) === 'R', no = Number(ref ? String(kunci).slice(1) : kunci);
    var jenis = ref ? ['ref'] : ['pre', 'post'];
    var aktif = buka.some(function (b) { return String(b.no) === String(no) && jenis.indexOf(b.jenis) >= 0 && (tesAktif_(b) || Date.parse(b.waktu) > batas); });
    if (!aktif) return;
    try { hasil.push(nilaiForm_(kunci, L, null, false)); }
    catch (e) { hasil.push({ kunci: kunci, error: e.message }); log_('server', 'nilai otomatis gagal', tesLabel_(kunci) + ': ' + e.message); }
  });
  return hasil;
}

/* Tombol "Perbarui data". req: sekolahId (admin/pemantau/fasil), no (opsional), paksa (fasil: masukkan ke laporan yang sudah disahkan). */
function nilaiPerbarui_(req, user) {
  var sendiri = user.peran === 'guru' || user.peran === 'kepsek';
  var sk = sekolahById_(sendiri ? String(user.sekolahId || '') : String(req.sekolahId || ''));
  if (!sendiri && !(user.peran === 'fasilitator' ? inList_(sk, user) : seesSekolah_(user, sk.id))) throw err_('Sekolah ini tidak tersedia untuk akun Anda.', 'FORBIDDEN');
  var no = parseInt(req.no, 10) || 0, paksa = !!req.paksa;
  if (paksa && !(no && canFill_(user, sk))) throw err_('Hanya fasilitator sekolah ini yang bisa memasukkan jawaban baru ke laporan yang sudah disahkan.', 'FORBIDDEN');
  var cache = CacheService.getScriptCache(), ck = 'nilaiP_' + sk.id + '_' + no;
  if (!paksa && cache.get(ck)) return { dilewati: true, jeda: NILAI_JEDA };
  cache.put(ck, '1', NILAI_JEDA);
  var links = tesRowsByNo_(), kunci = [];
  if (no) kunci = [String(no), tesKunci_(no, true)];
  else {
    var batas = Date.now() - NILAI_TOMBOL_HARI * 86400000, ada = {};
    rows_('TesBuka').forEach(function (b) {
      if (b.sekolahId !== sk.id || !(tesAktif_(b) || Date.parse(b.waktu) > batas)) return;
      ada[b.jenis === 'ref' ? tesKunci_(b.no, true) : String(b.no)] = 1;
    });
    kunci = Object.keys(ada);
  }
  var hasil = [];
  kunci.forEach(function (k) {
    var L = links[k];
    if (!L || !L.formId) return;
    try { hasil.push(nilaiForm_(k, L, [sk.id], paksa)); } catch (e) { hasil.push({ kunci: k, error: e.message }); }
  });
  if (paksa) log_(user.username, 'nilai dimasukkan ulang', sk.nama + ' P' + no);
  return { hasil: hasil, waktu: Date.now() };
}

/* Pretes, postes & refleksi hanya sekali: sebelum form dibuka, portal menanyakan apakah nama ini
 * sudah mengirim jawaban jenis itu untuk sekolah & pendampingan ini (dibaca langsung dari form). */
function tesSudah_(req, user) {
  var no = parseInt(req.no, 10), jenis = ['pre', 'post', 'ref'].indexOf(req.jenis) >= 0 ? req.jenis : '';
  var nama = String(req.nama || '').trim(), semua = !!req.semua;   // semua: daftar nama guru sekolah ini yang sudah mengirim
  if (!jenis || (!nama && !semua)) throw err_('Data tidak lengkap.', 'BAD');
  var sendiri = user.peran === 'guru' || user.peran === 'kepsek';
  var sk = sekolahById_(sendiri ? String(user.sekolahId || '') : String(req.sekolahId || ''));
  var L = tesRowsByNo_()[tesKunci_(no, jenis === 'ref')];
  if (!L || !L.formId) return { sudah: false, nama: [] };
  var I = Importer_, form = tesOpenForm_(L);
  var iNama = null, iSek = null, iJenis = null;
  form.getItems().forEach(function (it) {
    var t = String(it.getTitle() || '').toLowerCase();
    if (!iNama && /nama/.test(t) && !/sekolah|instansi|lembaga|madrasah|kepala/.test(t) && it.getType() === FormApp.ItemType.TEXT) iNama = it.getId();
    if (!iSek && /asal\s*sekolah|nama\s*sekolah|^sekolah|instansi|satuan pendidikan/.test(t)) iSek = it.getId();
    if (!iJenis && /jenis\s*tes|jenis\s*test|pilih\s*tes|^tes$|^test$/.test(t)) iJenis = it.getId();
  });
  if (!iNama) return { sudah: false, nama: [] };
  var ps = rows_('Peserta').filter(function (x) { return x.sekolahId === sk.id; }).map(function (x) { return { id: x.id, nama: x.nama, alias: x.alias ? String(x.alias).split('|').filter(String) : [] }; });
  var target = semua ? ps : ps.filter(function (x) { return I.normName(x.nama) === I.normName(nama); });
  if (!semua && !target.length) target = [{ id: 'x', nama: nama, alias: [] }];
  var skObj = nilaiSkObj_(sk), sudah = {}, waktu = 0;
  form.getResponses().some(function (r) {
    var a = {};
    r.getItemResponses().forEach(function (ir) { a[ir.getItem().getId()] = ir.getResponse(); });
    if (iSek && !I.schoolMatch(String(a[iSek] || '').trim(), skObj)) return false;
    if (jenis !== 'ref' && iJenis && I.parseJenis(a[iJenis]) !== jenis) return false;
    var c = I.cocokkan(String(a[iNama] || ''), target);
    var p = c.p || (c.saran[0] && c.saran[0].skor >= 0.85 && (!c.saran[1] || c.saran[0].skor - c.saran[1].skor >= 0.03) ? c.saran[0].p : null);
    if (!p) return false;
    if (!sudah[p.nama]) sudah[p.nama] = r.getTimestamp().getTime();
    return !semua;   // satu nama: berhenti di kiriman pertama yang cocok
  });
  var nm = Object.keys(sudah);
  return semua ? { nama: nm } : { sudah: nm.length > 0, waktu: nm.length ? sudah[nm[0]] : 0 };
}

/* Versi laporan terakhir (aplikasi memeriksa tiap menit selama laporan terbuka). */
function reportVersi_(req, user) {
  var k = parseKey_(req.key);
  if (!seesSekolah_(user, k.sekolahId)) throw err_('Anda hanya bisa melihat laporan sekolah Anda.', 'FORBIDDEN');
  var r = rekapRow_(req.key);
  return r ? { version: Number(r.version) || 0, updatedBy: r.updatedBy, updatedAt: Number(r.updatedAt) || 0, oto: parseReward_(r.oto) } : { version: 0 };
}

/* Satu form: baca semua jawaban, lalu olah untuk sekolah tertentu (sids) atau — dari pemicu — sekolah yang punya jawaban baru. */
function nilaiForm_(kunci, L, sids, paksa) {
  var I = Importer_;
  var ref = String(kunci).charAt(0) === 'R', no = Number(ref ? String(kunci).slice(1) : kunci);
  var props = PropertiesService.getScriptProperties(), tsKey = 'NILAI_TS_' + kunci;
  var ts = Number(props.getProperty(tsKey) || 0);
  var form = tesOpenForm_(L);
  if (!sids && ts && !form.getResponses(new Date(ts + 1)).length) return { kunci: kunci, baru: 0 };
  var d = tesBaca_(L, ref, form);
  var an = I.analyze(d.rows);
  var sekolah = rows_('Sekolah');
  var target;
  if (sids) target = sekolah.filter(function (s) { return sids.indexOf(s.id) >= 0; });
  else {
    var vals = {};
    if (an.cols.sekolah >= 0) an.body.forEach(function (row, i) { if ((d.waktu[i] || 0) > ts) vals[String(row[an.cols.sekolah] || '').trim()] = 1; });
    var v = Object.keys(vals).filter(String);
    target = sekolah.filter(function (s) { var o = nilaiSkObj_(s); return v.some(function (x) { return I.schoolMatch(x, o); }); });
  }
  var hasil = target.map(function (sk) {
    try { return nilaiSekolah_(sk, no, ref, d, an, paksa); } catch (e) { return { sekolahId: sk.id, error: e.message }; }
  });
  if (!sids && d.waktu.length) props.setProperty(tsKey, String(Math.max.apply(null, [ts].concat(d.waktu))));
  return { kunci: kunci, sekolah: hasil };
}

function nilaiSkObj_(s) { return { nama: s.nama, alias: s.alias ? String(s.alias).split('|').filter(String) : [] }; }

function indikatorList_(no) {
  var s = SILABUS_IND_[no] || { p: [], k: [] };
  return s.p.map(function (t, i) { return { id: 'p' + i, dim: 'Pengetahuan', teks: t }; })
    .concat(s.k.map(function (t, i) { return { id: 'k' + i, dim: 'Keterampilan', teks: t }; }));
}

/* sama dengan R.blank di js/report.js */
function laporanKosong_(sid, no) {
  var t = Date.now();
  return { key: sid + '_' + no, sekolahId: sid, no: no, createdAt: t, updatedAt: t, tanggal: '', jamMulai: '08.00', jamSelesai: '11.00', tempat: '',
    hadir: [], tes: null, capaian: {}, kegiatan: null, teks: { latar: '', kondisiAwal: '', kondisiAkhir: '' },
    permasalahan: '', rekomendasi: '', observasi: [], reward: {},
    lampiran: { hadirAuto: true, jurnalAuto: true, hadirScan: [], jurnalScan: [], portofolio: {}, foto: [] } };
}

/* sama dengan prettyName di js/app.js */
function namaRapi_(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  var bag = s.split(','), nm = bag[0], n = nm;
  if (nm === nm.toUpperCase() || nm === nm.toLowerCase()) n = nm.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, function (m, a, b) { return a + b.toUpperCase(); });
  return [n].concat(bag.slice(1)).join(',');
}

function nilaiUid_() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* Olah jawaban satu form untuk satu sekolah lalu simpan ke laporannya. */
function nilaiSekolah_(sk, no, ref, d, an, paksa) {
  var I = Importer_, c = an.cols, jenis = ref ? 'ref' : 'tes', ulang = 0;
  if (c.nama < 0 || c.sekolah < 0 || (!ref && (c.jenis < 0 || c.skor < 0))) return { sekolahId: sk.id, n: 0, alasan: 'kolom form tidak dikenali' };
  var skObj = nilaiSkObj_(sk);
  var vals = I.distinct(an.body, c.sekolah).filter(function (v) { return I.schoolMatch(v.value, skObj); }).map(function (v) { return v.value; });
  if (!vals.length) return { sekolahId: sk.id, n: 0 };
  var ex;
  if (ref) {
    // satu jawaban per orang: kiriman PERTAMA (refleksi tidak boleh diulang)
    var set = {}, last = {}, urut = [], ulang = 0;
    vals.forEach(function (v) { set[v] = 1; });
    an.body.forEach(function (row, i) {
      if (!set[String(row[c.sekolah] || '').trim()]) return;
      var nm = String(row[c.nama] || '').trim(); if (!nm) return;
      var k = I.normName(nm);
      if (last[k]) { ulang++; return; }
      urut.push(k);
      last[k] = { nama: nm, jabatanRaw: c.jabatan >= 0 ? String(row[c.jabatan] || '') : '', jenis: 'ref', idx: i };
    });
    ex = urut.map(function (k) { return last[k]; });
  } else { var exr = I.extract(an, c, vals, no); ex = exr.rows; ulang = exr.skipped.ulang || 0; }
  if (!ex.length) return { sekolahId: sk.id, n: 0 };
  var key = sk.id + '_' + no;
  var out = { sekolahId: sk.id, n: ex.length };
  lock_(function () {
    var rk = rekapRow_(key);
    var rep = null;
    if (rk && rk.fileId) { try { rep = JSON.parse(DriveApp.getFileById(rk.fileId).getBlob().getDataAsString('UTF-8')); } catch (x) { rep = null; } }
    var oto = parseReward_(rk && rk.oto);
    // sudah disahkan: laporan tidak diubah, catat jawaban yang belum masuk
    if (!paksa && sahAktif_(key).length) {
      var masuk = !rep ? 0 : ref ? (rep.refleksi ? Number(rep.refleksi.n) || 0 : 0) : (rep.tes && rep.tes.rows ? rep.tes.rows.length : 0);
      var tunda = Math.max(0, ex.length - masuk);
      if ((oto[jenis + 'Tunda'] || 0) !== tunda && rk) { oto[jenis + 'Tunda'] = tunda; update_('Rekap', rk._row, { oto: JSON.stringify(oto) }); }
      out.tunda = tunda;
      return;
    }
    rep = rep || laporanKosong_(sk.id, no);
    var sebelum = nilaiSidik_(rep);
    // peserta sekolah (ejaan & peserta baru ditulis setelah laporan tersimpan)
    var peserta = rows_('Peserta').filter(function (p) { return p.sekolahId === sk.id; }).map(function (p) {
      return { id: p.id, nama: p.nama, jabatan: p.jabatan, kelas: p.kelas, alias: p.alias ? String(p.alias).split('|').filter(String) : [], _row: p._row, _ubah: false };
    });
    var seen = {}, perlu = [];
    ex.forEach(function (r) {
      var k = I.normName(r.nama);
      if (seen[k]) return;
      var m = I.cocokkan(r.nama, peserta);
      seen[k] = { nama: r.nama, key: k, p: m.p, saran: m.saran || [], jab: r.jabatanRaw };
      if (!m.p) perlu.push(seen[k]);
    });
    // sangat mirip dan tidak ragu -> peserta itu, ejaannya diingat
    perlu.forEach(function (x) {
      var s0 = x.saran[0], s1 = x.saran[1];
      if (s0 && s0.skor >= 0.85 && (!s1 || s0.skor - s1.skor >= 0.03)) {
        x.p = s0.p;
        if (!x.p.alias.some(function (a) { return I.normName(a) === x.key; })) { x.p.alias.push(x.nama.trim()); x.p._ubah = true; }
      }
    });
    // sisanya peserta baru (tanda periksa); nama baru yang mirip satu sama lain = satu orang, nama terlengkap jadi patokan
    var baru = [], sisa = perlu.filter(function (x) { return !x.p; }).sort(function (a, b) { return b.key.length - a.key.length; });
    sisa.forEach(function (x) {
      var pk = baru.filter(function (y) { return I.mirip(x.key, y.key) >= 0.85; })[0];
      if (pk) { x.p = pk.p; if (!pk.p.alias.some(function (a) { return I.normName(a) === x.key; })) pk.p.alias.push(x.nama.trim()); return; }
      var pj = I.parseJabatan(x.jab);
      x.p = { id: nilaiUid_(), nama: namaRapi_(x.nama), jabatan: pj.jabatan, kelas: pj.kelas, alias: [], _baru: true };
      peserta.push(x.p); baru.push({ key: x.key, p: x.p });
    });
    var hadir = {}, lepas = {};
    (rep.hadir || []).forEach(function (id) { hadir[id] = 1; });
    (rep.hadirLepas || []).forEach(function (id) { lepas[id] = 1; });
    var rows = [];
    ex.forEach(function (r0) {
      var p = seen[I.normName(r0.nama)].p;
      if (!p) return;
      if (!p.jabatan) { var pj = I.parseJabatan(r0.jabatanRaw); if (pj.jabatan) { p.jabatan = pj.jabatan; p.kelas = pj.kelas; p._ubah = true; } }
      var r = {}; Object.keys(r0).forEach(function (k) { r[k] = r0[k]; });
      r.nama = p.nama;
      rows.push(r);
      if (!lepas[p.id]) hadir[p.id] = 1;
    });
    rep.hadir = Object.keys(hadir);
    var t = Date.now();
    if (ref) {
      var byP = {}, ord = [];
      rows.forEach(function (r) { if (byP[r.nama]) { ulang++; return; } ord.push(r.nama); byP[r.nama] = r; });   // ejaan lain orang yang sama: kiriman pertama
      var ikut = ord.map(function (n) { return byP[n]; });
      var abaikan = [c.nama, c.sekolah, c.jabatan, c.pendampingan].filter(function (x) { return x >= 1; }).map(function (x) { return x - 1; });
      var items = I.refAnalisis(d.items || [], ikut.map(function (r) { return (d.jawab || [])[r.idx] || []; }), abaikan, d.ketForm || '');
      var lama = rep.refleksi && typeof rep.refleksi === 'object' ? rep.refleksi : null;
      var arti = lama && lama.arti;
      items.filter(function (o) { return o.jenis === 'SCALE' || o.jenis === 'GSCALE'; }).forEach(function (o) {
        if (o.labManual) { o.lab = {}; delete o.labManual; }
        if (Object.keys(o.lab || {}).length || !arti) return;
        var m = I.labelAngka(arti, o.min, o.max);
        if (Object.keys(m).length) { o.lab = m; o.labManual = true; }
      });
      var auto = I.refKesimpulan(items, ikut.length, rep.hadir.length);
      rep.refleksi = { judul: d.judul || '', importedAt: (lama && lama.importedAt) || t, n: ikut.length,
        nama: ikut.map(function (r) { return r.nama; }).sort(function (a, b) { return a.localeCompare(b, 'id'); }),
        items: items, arti: (lama && lama.arti) || '', kesAuto: auto, kesimpulan: lama && lama.kesEdit ? lama.kesimpulan : auto, kesEdit: !!(lama && lama.kesEdit), otomatis: true, ulang: ulang };
      // capaian: indikator yang cocok dengan refleksi dikunci; lainnya pilihan fasil tetap
      rep.capaian = rep.capaian || {};
      if (!rep.capaianManual) { rep.capaianManual = {}; Object.keys(rep.capaian).forEach(function (k) { rep.capaianManual[k] = true; }); }
      var ind = indikatorList_(no);
      rep.capaianAuto = I.refCapaian(items, ind) || null;
      ind.forEach(function (i) {
        var a = rep.capaianAuto && rep.capaianAuto[i.id];
        if (a) { rep.capaian[i.id] = a.v; delete rep.capaianManual[i.id]; return; }
        if (!rep.capaianManual[i.id]) delete rep.capaian[i.id];
      });
    } else {
      var byKey = {}, ordK = [];
      rows.forEach(function (r) { var k = r.jenis + '|' + I.normName(r.nama); if (byKey[k]) { ulang++; return; } ordK.push(k); byKey[k] = r; });   // kiriman pertama
      rep.tes = { fileName: 'Google Form: ' + (d.judul || 'P' + no), importedAt: (rep.tes && rep.tes.importedAt) || t, rows: ordK.map(function (k) { return byKey[k]; }), otomatis: true, ulang: ulang };
    }
    var adaUbahP = baru.length || peserta.some(function (p) { return p._ubah; });
    if (nilaiSidik_(rep) === sebelum && !adaUbahP) {
      oto[jenis + 'Cek'] = t; oto[jenis + 'Tunda'] = 0;
      if (rk) update_('Rekap', rk._row, { oto: JSON.stringify(oto) });
      out.ubah = false;
      return;
    }
    // simpan: peserta dulu (supaya id di laporan sudah ada di daftar guru), lalu laporan
    peserta.forEach(function (p) {
      if (p._baru) insert_('Peserta', { id: p.id, sekolahId: sk.id, nama: p.nama, jabatan: p.jabatan, kelas: p.kelas, alias: p.alias.slice(0, 20).join('|'), gabungan: '', periksa: 'ya' });
      else if (p._ubah) update_('Peserta', p._row, { alias: p.alias.slice(0, 20).join('|'), jabatan: p.jabatan, kelas: p.kelas });
    });
    rep.otomatis = rep.otomatis || {};
    rep.otomatis[jenis] = { at: t, n: ex.length };
    if (rep.tes) rep.tes.importedAt = t;
    if (ref) rep.refleksi.importedAt = t;
    rep.updatedAt = t;
    var en = ensureReport_(key, (SILABUS_IND_[no] || {}).j || '');
    var r = en.rekap, fileId = r.fileId, json = JSON.stringify(rep);
    if (fileId) { try { DriveApp.getFileById(fileId).setContent(json); } catch (x) { fileId = ''; } }
    if (!fileId) fileId = DriveApp.getFolderById(r.folderId).createFile('laporan.json', json, 'application/json').getId();
    var avg = function (j) { var a = (rep.tes && rep.tes.rows || []).filter(function (x) { return x.jenis === j; }); return a.length ? String(Math.round(a.reduce(function (s, x) { return s + Number(x.skor); }, 0) / a.length * 100) / 100) : ''; };
    oto[jenis + 'Cek'] = t; oto[jenis + 'Tunda'] = 0;
    update_('Rekap', r._row, { judul: r.judul || (SILABUS_IND_[no] || {}).j || '', fileId: fileId, rataPre: avg('pre'), rataPost: avg('post'),
      updatedAt: String(t), updatedBy: NILAI_OLEH, version: String((Number(r.version) || 0) + 1),
      reward: JSON.stringify(rewardHadir_(rep)), ringkas: JSON.stringify(ringkas_(rep)), oto: JSON.stringify(oto) });
    if (paksa && batalkanSah_(key, t)) log_('server', 'pengesahan batal', sk.nama + ' P' + no + ' (jawaban form baru dimasukkan)');
    out.ubah = true; out.baru = baru.length;
  });
  return out;
}

/* Bagian laporan yang diisi otomatis, untuk tahu ada perubahan atau tidak. */
function nilaiSidik_(rep) {
  var rf = rep.refleksi && typeof rep.refleksi === 'object' ? rep.refleksi : null;
  return JSON.stringify([(rep.hadir || []).slice().sort(), rep.tes ? [rep.tes.rows, rep.tes.ulang || 0] : null, rf ? rf.ulang || 0 : 0,
    rf ? [rf.n, rf.nama, rf.items, rf.kesimpulan] : null, rep.capaian || {}, rep.capaianAuto || null]);
}

/* =============================================================
 * MATERI (Modul, Lembar Kerja, Bahan Tayang) — daftar file folder Drive di kartu portal
 * - Folder yang boleh dibaca: hanya folder di kartu data.json portal yang terlihat untuk peran itu.
 * - Nomor pendampingan dibaca dari nama subfolder/file ("P3", "Pendampingan 3", "Fase 1", "P1–P7");
 *   admin bisa mengisi rentang sendiri (MateriPeta). File tanpa nomor selalu terbuka.
 * - Guru & kepala sekolah: file pendampingan yang belum ditampilkan fasilitator dikirim tanpa id (terkunci).
 * ============================================================= */
var PORTAL_DATA = 'https://pusatbelajargurukudus.github.io/cermat/data.json';
var FASE = [[1, 7], [8, 16], [17, 22]];

function materiFolderId_(url) {
  var m = String(url || '').match(/\/folders\/([A-Za-z0-9_-]{10,})/) || String(url || '').match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : '';
}
function materiKartu_(user) {
  var cache = CacheService.getScriptCache();
  var raw = cache.get('portalData');
  if (!raw) {
    var url = PropertiesService.getScriptProperties().getProperty('PORTAL_DATA') || PORTAL_DATA;
    var r = UrlFetchApp.fetch(url + '?t=' + Date.now(), { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw err_('Daftar folder portal tidak terbaca. Coba lagi sebentar.', 'MATERI');
    raw = r.getContentText();
    try { cache.put('portalData', raw, 600); } catch (e) { /* terlalu besar: tanpa cache */ }
  }
  var d = JSON.parse(raw), out = [];
  (d.groups || []).forEach(function (g) {
    (g.links || []).forEach(function (l) {
      if (l.hidden) return;
      if (user.peran === 'kepsek' && l.ks !== true) return;
      if (user.peran === 'guru' && l.guru !== true) return;
      var id = materiFolderId_(l.url);
      if (id) out.push({ id: id, judul: l.title });
    });
  });
  return out;
}

/* Nomor pendampingan dari teks (garis bawah dianggap spasi):
 * rentang "P1–P7", "Pendampingan 1-7", "Fase 1-3"; "Fase 2"; satu nomor "P3", "Pendampingan_03", "03. …" (nama folder) */
function materiNomor_(t, folder) {
  t = String(t || '').replace(/_/g, ' ');
  var ok = function (a, b) { return a >= 1 && b <= 22 && a <= b ? [a, b] : null; };
  var m = t.match(/\bP(?:D)?\s*0?(\d{1,2})\s*(?:-|–|—|s\.?\s*d\.?|sampai|hingga)\s*P?\s*0?(\d{1,2})(?!\d)/i)
    || t.match(/\b(?:pendampingan|pertemuan)\s*(?:ke\s*-?\s*)?0?(\d{1,2})\s*(?:-|–|—|s\.?\s*d\.?|sampai|hingga)\s*0?(\d{1,2})(?!\d)/i);
  if (m && ok(+m[1], +m[2])) return ok(+m[1], +m[2]);
  m = t.match(/\bfase\s*([1-3])\s*(?:-|–|—|s\.?\s*d\.?|sampai|hingga)\s*([1-3])(?!\d)/i);
  if (m && +m[1] <= +m[2]) return [FASE[+m[1] - 1][0], FASE[+m[2] - 1][1]];
  m = t.match(/\bfase\s*(1|2|3|i{1,3})\b/i);
  if (m) { var f = { '1': 0, '2': 1, '3': 2, i: 0, ii: 1, iii: 2 }[m[1].toLowerCase()]; return FASE[f].slice(); }
  m = t.match(/\b(?:pendampingan|pertemuan)\s*(?:ke\s*-?\s*)?0?(\d{1,2})(?!\d)/i) || t.match(/\bP(?:D)?\s*-?\s*0?(\d{1,2})(?!\d)/);
  if (!m && folder) m = t.match(/^\s*0?(\d{1,2})(?:\s*[.)\-]|\s+[A-Za-z])/);   // folder "03. Numerasi …"
  if (m) { var n = +m[1]; if (n >= 1 && n <= 22) return [n, n]; }
  return null;
}

/* Jenis materi dari nama kartu, file, atau folder. Urutan penting: "LK 6.1 Refleksi" = LK, "Silabus … Modul" = silabus. */
var MATERI_KAT = [['silabus', /silabus/i], ['lk', /lembar\s*kerja|(^|[^a-z])lk([^a-z]|$)/i], ['tayang', /bahan\s*tayang|tayangan|slide|(^|[^a-z])ppt|presentasi/i],
  ['refleksi', /refleksi/i], ['modul', /modul/i]];
function materiKategori_(t) {
  t = String(t || '').replace(/_/g, ' ');
  for (var i = 0; i < MATERI_KAT.length; i++) if (MATERI_KAT[i][1].test(t)) return MATERI_KAT[i][0];
  return '';
}

/* Indeks isi folder kartu: dibangun dari Drive (lambat), disimpan sebagai file JSON di folder LAPORAN CERMAT
 * dan di cache (dipecah per 90 KB). Diperbarui tiap jam oleh pemicu waktu dan saat fasilitator menekan "Perbarui daftar". */
var MATERI_MAKS = 1500;
function materiBangun_(folderId) {
  var root;
  try { root = DriveApp.getFolderById(folderId); }
  catch (e) { throw err_('Folder materi tidak bisa dibuka server. Pastikan akun pemilik Apps Script bisa membuka folder itu.', 'MATERI'); }
  var files = [], dilihat = {};
  var catat = function (x, id, mime, path) {
    var nama = x.getName();
    var r = materiNomor_(nama, false), kat = materiKategori_(nama);
    for (var i = path.length - 1; i >= 0; i--) {
      if (!r) r = materiNomor_(path[i], true);
      if (!kat) kat = materiKategori_(path[i]);
    }
    if (!kat && /presentation|powerpoint/.test(mime)) kat = 'tayang';
    files.push({ id: id, nama: nama, mime: mime, ukuran: x.getSize(), diubah: x.getLastUpdated().getTime(), folder: path.join(' / '),
      dari: r ? r[0] : null, sampai: r ? r[1] : null, kat: kat });
  };
  var walk = function (folder, path, depth) {
    if (dilihat[folder.getId()]) return;
    dilihat[folder.getId()] = true;
    var it = folder.getFiles();
    while (it.hasNext() && files.length < MATERI_MAKS) {
      var x = it.next();
      if (x.isTrashed()) continue;
      var id = x.getId(), mime = x.getMimeType();
      if (mime === 'application/vnd.google-apps.shortcut') {
        try { id = x.getTargetId(); mime = x.getTargetMimeType(); } catch (e) { continue; }
        if (mime === 'application/vnd.google-apps.folder') {   // pintasan ke folder: dibaca seperti subfolder
          if (depth < 4) { try { walk(DriveApp.getFolderById(id), path.concat([x.getName()]), depth + 1); } catch (e) { /* tanpa akses */ } }
          continue;
        }
      }
      catat(x, id, mime, path);
    }
    if (depth >= 4) return;
    var fi = folder.getFolders();
    while (fi.hasNext() && files.length < MATERI_MAKS) { var sf = fi.next(); if (!sf.isTrashed()) walk(sf, path.concat([sf.getName()]), depth + 1); }
  };
  walk(root, [], 0);
  var out = { judul: root.getName(), files: files, dibuat: Date.now() };
  var json = JSON.stringify(out), nama = 'materi-indeks-' + folderId + '.json';
  var dir = rootFolder_(), ada = dir.getFilesByName(nama);
  if (ada.hasNext()) ada.next().setContent(json); else dir.createFile(nama, json, 'application/json');
  materiCacheTaruh_(folderId, json);
  return out;
}
function materiCacheTaruh_(folderId, json) {
  var c = CacheService.getScriptCache(), UK = 90000, n = Math.ceil(json.length / UK), m = { };
  for (var i = 0; i < n; i++) m['mat:' + folderId + ':' + i] = json.slice(i * UK, (i + 1) * UK);
  m['mat:' + folderId] = String(n);
  try { c.putAll(m, 21600); } catch (e) { /* cache penuh: dibaca dari file */ }
}
function materiBaca_(folderId) {
  var c = CacheService.getScriptCache(), n = parseInt(c.get('mat:' + folderId) || '0', 10);
  if (n) {
    var keys = []; for (var i = 0; i < n; i++) keys.push('mat:' + folderId + ':' + i);
    var got = c.getAll(keys);
    if (keys.every(function (k) { return got[k] !== undefined && got[k] !== null; })) return JSON.parse(keys.map(function (k) { return got[k]; }).join(''));
  }
  var ada = rootFolder_().getFilesByName('materi-indeks-' + folderId + '.json');
  if (ada.hasNext()) { var json = ada.next().getBlob().getDataAsString(); materiCacheTaruh_(folderId, json); return JSON.parse(json); }
  return materiBangun_(folderId);
}
/* semua folder kartu (tanpa membedakan peran) */
function materiSemuaFolder_() {
  var ids = {};
  materiKartu_({ peran: 'admin' }).forEach(function (k) { ids[k.id] = true; });
  return Object.keys(ids);
}
/* dijalankan pemicu waktu tiap jam */
function materiJadwal() {
  CacheService.getScriptCache().remove('portalData');
  materiSemuaFolder_().forEach(function (id) { try { materiBangun_(id); } catch (e) { console.warn('materi ' + id + ': ' + e.message); } });
}
/* Jalankan SEKALI dari editor Apps Script: membuat indeks pertama, memasang pemicu tiap jam, dan meminta izin yang dibutuhkan */
function pasangMateri() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'materiJadwal') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('materiJadwal').timeBased().everyHours(1).create();
  CacheService.getScriptCache().remove('portalData');
  var kartu = materiKartu_({ peran: 'admin' });
  Logger.log(kartu.length + ' kartu folder: ' + kartu.map(function (k) { return k.judul; }).join(', '));
  var sudah = {};
  kartu.forEach(function (k) {
    try {
      var d = sudah[k.id] || (sudah[k.id] = materiBangun_(k.id));
      var kat = materiKategori_(k.judul), g = {};
      materiSaring_(d.files, kat).forEach(function (f) { var key = f.dari === null ? 'tanpa nomor (selalu terbuka)' : 'P' + f.dari + (f.sampai !== f.dari ? '–P' + f.sampai : ''); (g[key] = g[key] || []).push(f.nama); });
      Logger.log('== ' + k.judul + (kat ? ' [' + kat + ']' : '') + ': ' + materiSaring_(d.files, kat).length + ' dari ' + d.files.length + ' file di "' + d.judul + '"');
      Object.keys(g).forEach(function (key) { Logger.log('   ' + key + ': ' + g[key].join(', ')); });
    } catch (e) { Logger.log(k.judul + ': ' + e.message); }
  });
  Logger.log('Pemicu tiap jam terpasang (materiJadwal).');
}
/* isi kartu sesuai namanya; file tanpa jenis ikut kartu Modul; bila tidak ada yang cocok sama sekali, tampil semua */
function materiSaring_(files, kat) {
  if (!kat || !files.some(function (f) { return f.kat === kat; })) return files;
  return files.filter(function (f) { return f.kat === kat || (kat === 'modul' && !f.kat); });
}

function materiTandai_(sid, no, tampil, user) {
  var ada = rows_('MateriBuka').filter(function (b) { return b.sekolahId === sid && String(b.no) === String(no); })[0];
  var patch = { sekolahId: sid, no: String(no), aktif: tampil ? 'ya' : 'tidak', oleh: user.nama, waktu: now_() };
  if (ada) update_('MateriBuka', ada._row, patch); else if (tampil) insert_('MateriBuka', patch);
}
function materiBukaMap_(sids) {
  var ok = {}; sids.forEach(function (s) { ok[s] = true; });
  var m = {};
  rows_('MateriBuka').forEach(function (b) { if (ok[b.sekolahId] && b.aktif === 'ya') (m[b.sekolahId] = m[b.sekolahId] || []).push(Number(b.no)); });
  return m;
}
function materiTerbuka_(f, nos) {
  if (f.dari === null || f.dari === undefined || f.dari === '') return true;
  for (var n = Number(f.dari); n <= Number(f.sampai); n++) if (nos.indexOf(n) >= 0) return true;
  return false;
}
/* daftar file folder kartu, sudah memakai rentang dari admin & status kunci untuk guru/kepsek */
function materiSiapkan_(folderId, user, judulKartu) {
  // beberapa kartu boleh menautkan folder yang sama (mis. PUSTAKA CERMAT): kartu dikenali dari judulnya
  var cocok = materiKartu_(user).filter(function (k) { return k.id === folderId; });
  var kartu = cocok.filter(function (k) { return judulKartu && k.judul === judulKartu; })[0] || cocok[0];
  if (!kartu) throw err_('Folder ini tidak tersedia untuk akun Anda.', 'FORBIDDEN');
  var data = materiBaca_(folderId);
  var saring = materiSaring_(data.files, materiKategori_(kartu.judul));
  var peta = {};
  rows_('MateriPeta').forEach(function (p) { peta[p.fileId] = p; });
  var sks = tesSekolahFor_(user);
  var buka = materiBukaMap_(sks.map(function (s) { return s.id; }));
  var peserta = user.peran === 'guru' || user.peran === 'kepsek';
  var nos = peserta && sks.length ? (buka[sks[0].id] || []) : [];
  var files = saring.map(function (f) {
    var o = {}; Object.keys(f).forEach(function (k) { o[k] = f[k]; });
    var pt = peta[f.id];
    if (pt) { o.dari = pt.dari === '' ? null : Number(pt.dari); o.sampai = pt.sampai === '' ? null : Number(pt.sampai); o.admin = true; }
    if (peserta && !materiTerbuka_(o, nos)) { o.id = ''; o.kunci = true; }
    return o;
  });
  return { kartu: kartu.judul, judul: data.judul, files: files, buka: buka, dibuat: data.dibuat || 0,
    sekolah: sks.map(function (s) { return { id: s.id, nama: s.nama }; }) };
}
function materiList_(req, user) {
  var id = String(req.folderId || '');
  if (req.segar && user.peran !== 'guru' && user.peran !== 'kepsek') {
    materiSiapkan_(id, user, req.kartu);   // memastikan folder ini memang boleh dibuka akun ini
    CacheService.getScriptCache().remove('portalData');
    materiBangun_(id);
  }
  return materiSiapkan_(id, user, req.kartu);
}
function materiSet_(req, user) {
  var no = parseInt(req.no, 10);
  if (REF_NO.indexOf(no) < 0) throw err_('Nomor pendampingan tidak valid.', 'BAD');
  var sk = sekolahById_(String(req.sekolahId || ''));
  if (!(user.peran === 'admin' || canFill_(user, sk))) throw err_('Hanya fasilitator sekolah ini yang bisa menampilkan materi.', 'FORBIDDEN');
  lock_(function () { materiTandai_(sk.id, no, !!req.tampil, user); });
  log_(user.username, req.tampil ? 'materiTampil' : 'materiSembunyi', sk.nama + ' P' + no);
  return { buka: materiBukaMap_([sk.id]) };
}
function materiPeta_(req, user) {
  var fid = String(req.fileId || ''); if (!fid) throw err_('File tidak valid.', 'BAD');
  var dari = req.dari ? parseInt(req.dari, 10) : '', sampai = req.sampai ? parseInt(req.sampai, 10) : dari;
  if (dari !== '' && !(dari >= 1 && sampai <= 22 && dari <= sampai)) throw err_('Rentang pendampingan tidak valid.', 'BAD');
  lock_(function () {
    var ada = rows_('MateriPeta').filter(function (p) { return p.fileId === fid; })[0];
    var patch = { fileId: fid, dari: dari === '' ? '' : String(dari), sampai: dari === '' ? '' : String(sampai), oleh: user.nama, waktu: now_() };
    if (req.hapus) { if (ada) deleteRow_('MateriPeta', ada._row); }
    else if (ada) update_('MateriPeta', ada._row, patch); else insert_('MateriPeta', patch);
  });
  return true;
}
/* Isi PDF untuk dibaca offline, dikirim per bagian (3 MB) supaya tidak melebihi batas jawaban Apps Script */
function materiPdf_(req, user) {
  var fid = String(req.fileId || ''), part = parseInt(req.part, 10) || 0;
  var ketemu = null;
  materiKartu_(user).some(function (k) {
    var d = materiSiapkan_(k.id, user, k.judul);
    ketemu = d.files.filter(function (f) { return f.id && f.id === fid; })[0] || null;
    return !!ketemu;
  });
  if (!ketemu) throw err_('File ini tidak tersedia untuk akun Anda.', 'FORBIDDEN');
  if (ketemu.mime !== 'application/pdf') throw err_('Hanya PDF yang bisa disimpan untuk dibaca offline.', 'BAD');
  var bytes = DriveApp.getFileById(fid).getBlob().getBytes();
  var UK = 3 * 1024 * 1024, parts = Math.max(1, Math.ceil(bytes.length / UK));
  if (part < 0 || part >= parts) throw err_('Bagian file tidak valid.', 'BAD');
  return { part: part, parts: parts, ukuran: bytes.length, b64: Utilities.base64Encode(bytes.slice(part * UK, (part + 1) * UK)) };
}

/* Nama lama: tetap bisa dijalankan dari editor */
function cekMateri() { pasangMateri(); }

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
  if (user.peran === 'guru') throw err_('Password akun guru dipakai bersama dan hanya bisa diganti admin.', 'FORBIDDEN');
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
  return { username: u.username, nama: u.nama, peran: u.peran, aktif: u.aktif === 'ya', nip: u.nip || '', sekolahId: u.sekolahId || '' };
}

function saveProfile_(req, user) {
  if (user.peran === 'guru') throw err_('Profil akun guru diatur oleh admin.', 'FORBIDDEN');
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
  if (user.peran === 'guru') {
    return { serverVersion: APP_VERSION, user: publicUser_(user), program: prog, sekolah: [], peserta: [], pengguna: [], rekap: [], pengesahan: [] };
  }
  var ok = function (sid) { return seesSekolah_(user, sid); };
  return {
    serverVersion: APP_VERSION,
    user: publicUser_(user),
    program: prog,
    sekolah: rows_('Sekolah').filter(function (s) { return ok(s.id); }).map(sekolahOut_).sort(function (a, b) { return (a.urutan - b.urutan) || a.nama.localeCompare(b.nama); }),
    peserta: rows_('Peserta').filter(function (p) { return ok(p.sekolahId); }).map(function (p) {
      return { id: p.id, sekolahId: p.sekolahId, nama: p.nama, jabatan: p.jabatan, kelas: p.kelas,
        alias: p.alias ? p.alias.split('|') : [], gabungan: p.gabungan ? p.gabungan.split('|') : [], periksa: p.periksa === 'ya' };
    }),
    pengguna: rows_('Pengguna').map(publicUser_),
    // pendampingan yang sudah punya tautan Google Form (tombol unggah CSV jadi cadangan)
    tesForm: (function () { var L = tesRowsByNo_(); return TES_NO.filter(function (no) { return L[String(no)] && L[String(no)].formId; }); })(),
    refForm: (function () { var L = tesRowsByNo_(); return REF_NO.filter(function (no) { return L[tesKunci_(no, true)] && L[tesKunci_(no, true)].formId; }); })(),
    rekap: rekapList_(user),
    pengesahan: sahList_(user)
  };
}

/* Kepala sekolah hanya melihat sekolahnya sendiri; peran lain melihat semua. */
function seesSekolah_(user, sid) {
  if (user && user.peran === 'guru') return false;
  if (!user || user.peran !== 'kepsek') return true;
  return !!user.sekolahId && String(user.sekolahId) === String(sid);
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

/* Ringkasan laporan (kartu Progres & status): laporan lama yang belum punya ringkasan dibaca sekali dari file-nya. */
function ringkasBaris_(r, batas) {
  if (!r.ringkas && r.fileId && (!batas || batas.n-- > 0)) {
    try {
      var rep = JSON.parse(DriveApp.getFileById(r.fileId).getBlob().getDataAsString('UTF-8'));
      r.ringkas = JSON.stringify(ringkas_(rep));
      update_('Rekap', r._row, { ringkas: r.ringkas });
    } catch (x) { /* dicoba lagi lain kali */ }
  }
  try { return JSON.parse(r.ringkas || '{}') || {}; } catch (x) { return {}; }
}

/* Pendampingan dianggap sudah berlangsung bila sudah ada pretes (P1–P7) atau jawaban refleksi (P8–P22),
 * atau laporannya sudah lengkap / mulai disahkan. Isian coba-coba fasil tidak dihitung. */
function laporanMulai_(r, g, sahKeys) {
  if (!r.fileId) return false;
  if (r.status === 'lengkap' || (sahKeys && sahKeys[r.key])) return true;
  if (TES_NO.indexOf(Number(r.no)) >= 0) return (r.rataPre !== '' && r.rataPre !== undefined && r.rataPre !== null) || (g.tes || []).some(function (t) { return t.pre !== null && t.pre !== undefined; });
  return (Number(g.ref) || 0) > 0;
}

function sahKeys_() {
  var o = {};
  rows_('Pengesahan').forEach(function (r) { if (r.aktif === 'ya') o[r.key] = 1; });
  return o;
}

function rekapList_(user) {
  var sk = sahKeys_(), batas = { n: 25 };
  return rows_('Rekap').filter(function (r) { return seesSekolah_(user, r.sekolahId); }).map(function (r) {
    var mulai = laporanMulai_(r, r.rataPre !== '' && r.status !== 'lengkap' && !sk[r.key] && TES_NO.indexOf(Number(r.no)) >= 0 ? {} : ringkasBaris_(r, batas), sk);
    return { key: r.key, sekolahId: r.sekolahId, no: Number(r.no), status: r.status, tanggal: r.tanggal,
      rataPre: r.rataPre, rataPost: r.rataPost, pdfId: r.pdfId, pdfAt: Number(r.pdfAt) || 0,
      updatedAt: Number(r.updatedAt) || 0, updatedBy: r.updatedBy, version: Number(r.version) || 0,
      reward: parseReward_(r.reward), oto: parseReward_(r.oto), mulai: mulai };
  });
}

/* Reward (bintang) per peserta pada satu laporan: hanya peserta yang dicentang hadir, angka bulat >= 0.
 * Peserta hadir yang belum diisi dihitung 0 (sejak v3.9). */
function rewardHadir_(rep) {
  var out = {};
  var src = rep && rep.reward && typeof rep.reward === 'object' ? rep.reward : {};
  (Array.isArray(rep && rep.hadir) ? rep.hadir : []).forEach(function (id) {
    var v = src[id];
    var n = v === '' || v === null || v === undefined ? 0 : Math.floor(Number(v));
    out[String(id)] = isFinite(n) && n >= 0 ? n : 0;
  });
  return out;
}

/* Perolehan bintang satu sekolah (kartu "Perolehan Bintang" untuk guru & kepala sekolah).
 * Per peserta: bintang tiap pendampingan (hanya yang hadir) + total; laporan yang belum disahkan lengkap ditandai sementara. */
function bintangSekolah_(req, user) {
  var sid = user.peran === 'guru' || user.peran === 'kepsek' ? String(user.sekolahId || '') : String(req.sekolahId || '');
  var sk = sekolahById_(sid);
  var sendiri = user.peran === 'guru' || user.peran === 'kepsek';   // guru & kepsek: hanya sekolahnya sendiri
  if (!sendiri && !seesSekolah_(user, sk.id)) throw err_('Sekolah ini tidak tersedia untuk akun Anda.', 'FORBIDDEN');
  var sahkah = sahCek_(sk);
  var lap = rows_('Rekap').filter(function (r) { return r.sekolahId === sk.id && r.fileId; }).map(function (r) {
    return { no: Number(r.no), sah: sahkah(r), reward: parseReward_(r.reward) };
  }).filter(function (l) { return Object.keys(l.reward).length; }).sort(function (a, b) { return a.no - b.no; });
  var peserta = rows_('Peserta').filter(function (p) { return p.sekolahId === sk.id; });
  // nama ganda yang sudah digabung: bintangnya ikut nama yang dipertahankan
  var ke = {};
  peserta.forEach(function (p) { ke[p.id] = p.id; String(p.gabungan || '').split('|').filter(String).forEach(function (g) { ke[g] = p.id; }); });
  var orang = peserta.map(function (p) {
    var per = {}, total = 0;
    lap.forEach(function (l) {
      Object.keys(l.reward).forEach(function (id) {
        if (ke[id] !== p.id) return;
        per[l.no] = Math.max(per[l.no] || 0, Number(l.reward[id]) || 0);
      });
    });
    Object.keys(per).forEach(function (n) { total += per[n]; });
    return { nama: p.nama, jabatan: p.jabatan === 'Guru Kelas' && p.kelas ? 'Guru Kelas ' + p.kelas : String(p.jabatan || ''), per: per, total: total };
  }).filter(function (o) { return Object.keys(o.per).length; });
  return { sekolah: sk.nama, pendampingan: lap.map(function (l) { return { no: l.no, sah: l.sah }; }), orang: orang };
}

/* Laporan sah = lengkap + disahkan semua fasilitator sekolah + kepala sekolah. */
function sahCek_(sk) {
  var sah = {};
  rows_('Pengesahan').forEach(function (r) { if (r.aktif === 'ya' && String(r.key).split('_')[0] === sk.id) (sah[r.key] = sah[r.key] || []).push(r); });
  var fasil = fasilList_(sk).map(function (u) { return u.toLowerCase(); });
  return function (r) {
    var list = sah[r.key] || [];
    var allFasil = fasil.length > 0 && fasil.every(function (u) { return list.some(function (x) { return x.peran === 'fasil' && String(x.username).toLowerCase() === u; }); });
    return r.status === 'lengkap' && allFasil && list.some(function (x) { return x.peran === 'ks'; });
  };
}

/* Ringkasan satu laporan untuk kartu Progres: hadir, nilai pretes/postes per nama, capaian indikator. */
function ringkas_(rep) {
  var tes = {}, urut = [];
  ((rep && rep.tes && Array.isArray(rep.tes.rows)) ? rep.tes.rows : []).forEach(function (r) {
    var nama = String(r.nama || '').trim();
    var sk = Number(r.skor);
    if (!nama || !isFinite(sk) || (r.jenis !== 'pre' && r.jenis !== 'post')) return;
    var k = nama.toLowerCase().replace(/\s+/g, ' ');
    if (!tes[k]) { tes[k] = { nama: nama, pre: null, post: null }; urut.push(k); }
    tes[k][r.jenis] = sk;
  });
  var cap = {}, auto = [];
  var c0 = rep && rep.capaian && typeof rep.capaian === 'object' ? rep.capaian : {};
  Object.keys(c0).forEach(function (id) { if (c0[id]) cap[id] = String(c0[id]); });
  var a0 = rep && rep.capaianAuto && typeof rep.capaianAuto === 'object' ? rep.capaianAuto : {};
  Object.keys(a0).forEach(function (id) { if (a0[id]) auto.push(id); });
  return { v: 1, hadir: (Array.isArray(rep && rep.hadir) ? rep.hadir : []).map(String),
    tes: urut.map(function (k) { return tes[k]; }), cap: cap, auto: auto,
    ref: rep && rep.refleksi ? Number(rep.refleksi.n) || 0 : 0 };
}

/* Kartu "Progres Pendampingan" (semua peran, hanya lihat).
 * Tanpa sekolahId (admin/pemantau/fasil): daftar sekolah untuk dipilih.
 * Dengan sekolah: per laporan -> status, sah, rata-rata, hadir, nilai per peserta, capaian, bintang.
 * Laporan lama yang belum punya ringkasan dibaca sekali dari file-nya lalu disimpan. */
function progresSekolah_(req, user) {
  var sendiri = user.peran === 'guru' || user.peran === 'kepsek';
  var me = String(user.username || '').toLowerCase();
  // fasilitator hanya sekolah binaannya; admin & pemantau semua sekolah
  var boleh = function (s) { return user.peran === 'fasilitator' ? fasilList_(s).some(function (u) { return u.toLowerCase() === me; }) : seesSekolah_(user, s.id); };
  if (!sendiri && !req.sekolahId) {
    // jumlah laporan per status (sama dengan Lihat Laporan): disahkan, menunggu pengesahan, draf
    var jml = {}, skp = sahKeys_(), bts = { n: 25 }, cek = {};
    rows_('Sekolah').forEach(function (s) { cek[s.id] = sahCek_(s); });
    rows_('Rekap').forEach(function (r) {
      if (!r.fileId || !laporanMulai_(r, ringkasBaris_(r, bts), skp)) return;
      var o = jml[r.sekolahId] = jml[r.sekolahId] || { sah: 0, tunggu: 0, draf: 0 };
      o[cek[r.sekolahId] && cek[r.sekolahId](r) ? 'sah' : r.status === 'lengkap' ? 'tunggu' : 'draf']++;
    });
    return { pilih: rows_('Sekolah').filter(boleh).map(function (s) {
      var j = jml[s.id] || { sah: 0, tunggu: 0, draf: 0 };
      return { id: s.id, nama: s.nama, urutan: Number(s.urutan) || 0, laporan: j.sah + j.tunggu + j.draf, status: j,
        saya: fasilList_(s).some(function (u) { return u.toLowerCase() === me; }) };
    }).sort(function (a, b) { return (b.saya - a.saya) || (a.urutan - b.urutan) || a.nama.localeCompare(b.nama); }) };
  }
  var sk = sekolahById_(sendiri ? String(user.sekolahId || '') : String(req.sekolahId || ''));
  if (!sendiri && !boleh(sk)) throw err_('Sekolah ini tidak tersedia untuk akun Anda.', 'FORBIDDEN');
  var sahkah = sahCek_(sk);
  var peserta = rows_('Peserta').filter(function (p) { return p.sekolahId === sk.id; });
  var ke = {}, namaKe = {};
  var kunci = function (t) { return String(t || '').trim().toLowerCase().replace(/\s+/g, ' '); };
  peserta.forEach(function (p) {
    ke[p.id] = p.id;
    String(p.gabungan || '').split('|').filter(String).forEach(function (g) { ke[g] = p.id; });
    namaKe[kunci(p.nama)] = p.id;
    String(p.alias || '').split('|').filter(String).forEach(function (a) { if (!namaKe[kunci(a)]) namaKe[kunci(a)] = p.id; });
  });
  var skk = sahKeys_();
  // hanya pendampingan yang sudah berlangsung (ada pretes / refleksi); isian coba-coba fasil tidak ditampilkan
  var lap = rows_('Rekap').filter(function (r) { return r.sekolahId === sk.id && r.fileId; })
    .map(function (r) { return { r: r, g: ringkasBaris_(r) }; }).filter(function (x) { return laporanMulai_(x.r, x.g, skk); });
  var laporan = lap.map(function (x) {
    var r = x.r, g = x.g;
    var hadir = {};
    (g.hadir || []).forEach(function (id) { if (ke[id]) hadir[ke[id]] = 1; });
    var rw = {}, r0 = parseReward_(r.reward);
    Object.keys(r0).forEach(function (id) { if (ke[id]) rw[ke[id]] = Math.max(rw[ke[id]] || 0, Number(r0[id]) || 0); });
    return { no: Number(r.no), judul: r.judul, tanggal: r.tanggal, status: r.status === 'lengkap' ? 'lengkap' : 'draf', sah: sahkah(r),
      rataPre: r.rataPre === '' ? null : Number(r.rataPre), rataPost: r.rataPost === '' ? null : Number(r.rataPost),
      ada: !!r.ringkas, hadir: Object.keys(hadir),
      tes: (g.tes || []).map(function (t) { return { id: namaKe[kunci(t.nama)] || '', nama: t.nama, pre: t.pre, post: t.post }; }),
      cap: g.cap || {}, auto: g.auto || [], ref: g.ref || 0, reward: rw };
  }).sort(function (a, b) { return a.no - b.no; });
  return { sekolah: { id: sk.id, nama: sk.nama }, sendiri: sendiri,
    peserta: peserta.map(function (p) { return { id: p.id, nama: p.nama, jabatan: p.jabatan === 'Guru Kelas' && p.kelas ? 'Guru Kelas ' + p.kelas : String(p.jabatan || '') }; }),
    laporan: laporan };
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
    var daftar = function (v, max) { return (Array.isArray(v) ? v : String(v || '').split('|')).map(function (x) { return String(x).replace(/\|/g, ' ').trim(); }).filter(String).slice(0, max).join('|'); };
    return { id: String(p.id || ''), sekolahId: sk.id, nama: String(p.nama || '').trim().slice(0, 150), jabatan: String(p.jabatan || ''), kelas: String(p.kelas || ''),
      alias: daftar(p.alias, 20), gabungan: daftar(p.gabungan, 50), periksa: p.periksa ? 'ya' : '' };
  }).filter(function (p) { return p.id && p.nama; });
  var hapus = {};
  (Array.isArray(req.hapus) ? req.hapus : []).forEach(function (id) { hapus[String(id)] = 1; });
  list.forEach(function (p) { p.gabungan.split('|').filter(String).forEach(function (g) { hapus[g] = 1; }); });
  lock_(function () {
    // peserta yang baru ditambahkan server dari form (belum sampai ke perangkat fasil) tetap disimpan
    var ada = {}; list.forEach(function (p) { ada[p.id] = 1; });
    rows_('Peserta').forEach(function (p) {
      if (p.sekolahId === sk.id && p.periksa === 'ya' && !ada[p.id] && !hapus[p.id]) list.push(stripRow_(p));
    });
    replacePeserta_(sk.id, list);
  });
  return list.length;
}

function stripRow_(r) { var o = {}; Object.keys(r).forEach(function (k) { if (k !== '_row') o[k] = r[k]; }); return o; }

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

function getReport_(req, user) {
  var k = parseKey_(req.key);
  if (!seesSekolah_(user, k.sekolahId)) throw err_('Anda hanya bisa melihat laporan sekolah Anda.', 'FORBIDDEN');
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
      reward: JSON.stringify(rewardHadir_(rep)), ringkas: JSON.stringify(ringkas_(rep))
    });
    if (batalkanSah_(rep.key, t)) log_(user.username, 'pengesahan batal', sk.nama + ' P' + k.no + ' (isi laporan diubah)');
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
    batalkanSah_(req.key, Date.now());
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

function getPdf_(req, user) {
  if (!seesSekolah_(user, parseKey_(req.key).sekolahId)) throw err_('Anda hanya bisa melihat laporan sekolah Anda.', 'FORBIDDEN');
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
  var sekolahId = '';
  if (peran === 'kepsek' || peran === 'guru') {
    sekolahId = String(d.sekolahId || '');
    if (!sekolahId) throw err_('Pilih sekolah untuk akun ' + (peran === 'guru' ? 'Guru' : 'Kepala Sekolah') + '.');
    sekolahById_(sekolahId);
  }
  var info = {};
  lock_(function () {
    var ex = findUser_(uname);
    if (mode === 'create') {
      if (ex) throw err_('Username "' + uname + '" sudah dipakai.');
      checkPw_(d.password);
      insert_('Pengguna', { username: uname, nama: nama, peran: peran, aktif: aktif, dibuat: now_(), nip: nip, sekolahId: sekolahId }, function (o) {
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
    update_('Pengguna', ex._row, { nama: nama, peran: peran, aktif: aktif, nip: nip, sekolahId: sekolahId });
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
  // pengesahan yang pernah diberikan
  rows_('Pengesahan').forEach(function (r) {
    if (r.username.toLowerCase() === low) update_('Pengesahan', r._row, { username: baru });
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
 * PENGESAHAN ELEKTRONIK (QR)
 *   Fasilitator 1 & 2 mengesahkan masing-masing, lalu Kepala Sekolah.
 *   Setiap perubahan isi laporan membatalkan semua pengesahannya.
 * ============================================================= */
function sahOut_(r) {
  return { id: r.id, key: r.key, peran: r.peran, username: r.username, nama: r.nama, nip: r.nip,
    version: Number(r.version) || 0, waktu: Number(r.waktu) || 0 };
}

function sahList_(user) {
  return rows_('Pengesahan').filter(function (r) {
    return r.aktif === 'ya' && seesSekolah_(user, String(r.key).split('_')[0]);
  }).map(sahOut_);
}

function sahAktif_(key) {
  return rows_('Pengesahan').filter(function (r) { return r.key === key && r.aktif === 'ya'; });
}

/* Dipanggil di dalam lock_. Mengembalikan jumlah pengesahan yang dibatalkan. */
function batalkanSah_(key, t) {
  var a = sahAktif_(key);
  a.forEach(function (r) { update_('Pengesahan', r._row, { aktif: 'tidak', batalAt: String(t) }); });
  return a.length;
}

function sahkan_(req, user) {
  var k = parseKey_(req.key);
  var sk = sekolahById_(k.sekolahId);
  var peran;
  if (user.peran === 'fasilitator' && inList_(sk, user)) peran = 'fasil';
  else if (user.peran === 'kepsek' && String(user.sekolahId) === sk.id) peran = 'ks';
  else throw err_('Anda tidak berhak mengesahkan laporan ini.', 'FORBIDDEN');
  var out;
  lock_(function () {
    var r = rekapRow_(req.key);
    if (!r || !r.fileId) throw err_('Laporan belum tersimpan di server.', 'BAD');
    if (Number(req.baseVersion || 0) !== (Number(r.version) || 0)) {
      throw err_('Laporan sudah diubah oleh ' + (r.updatedBy || 'pengguna lain') + '. Muat ulang laporan, lalu sahkan lagi.', 'CONFLICT',
        { version: Number(r.version) || 0, updatedBy: r.updatedBy, updatedAt: Number(r.updatedAt) || 0 });
    }
    if (r.status !== 'lengkap') throw err_('Lengkapi dulu semua bagian wajib laporan sebelum disahkan.', 'BAD');
    var aktif = sahAktif_(req.key);
    var mine = aktif.filter(function (x) { return x.username.toLowerCase() === user.username.toLowerCase(); })[0];
    if (mine) { out = aktif.map(sahOut_); return; }
    if (peran === 'ks') {
      var belum = fasilList_(sk).filter(function (u) {
        return !aktif.some(function (x) { return x.peran === 'fasil' && x.username.toLowerCase() === u.toLowerCase(); });
      });
      if (belum.length) throw err_('Laporan belum disahkan oleh fasilitator: ' + belum.map(function (u) { var x = findUser_(u); return x ? x.nama : u; }).join(', ') + '.', 'BAD');
    }
    var id = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    insert_('Pengesahan', { id: id, key: req.key, peran: peran, username: user.username, nama: user.nama, nip: user.nip || '',
      version: r.version, waktu: String(Date.now()), aktif: 'ya', batalAt: '' });
    log_(user.username, 'sahkan', sk.nama + ' P' + k.no + ' sebagai ' + (peran === 'ks' ? 'kepala sekolah' : 'fasilitator'));
    out = sahAktif_(req.key).map(sahOut_);
  });
  return out;
}

/* Fasilitator membuka kunci laporan yang sudah disahkan agar bisa diubah. */
function batalSah_(req, user) {
  var k = parseKey_(req.key);
  var sk = sekolahById_(k.sekolahId);
  if (!canFill_(user, sk)) throw err_('Hanya fasilitator pemegang sekolah yang bisa membuka kunci laporan.', 'FORBIDDEN');
  var n = 0;
  lock_(function () { n = batalkanSah_(req.key, Date.now()); });
  if (n) log_(user.username, 'pengesahan batal', sk.nama + ' P' + k.no + ' (dibuka untuk diubah)');
  return true;
}

/* Halaman verifikasi QR (publik): hanya data yang tercetak di lembar pengesahan. */
function verify_(req) {
  var id = String(req.id || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
  var r = id ? rows_('Pengesahan').filter(function (x) { return x.id === id; })[0] : null;
  if (!r) return { status: 'tidak-ditemukan' };
  var k = parseKey_(r.key);
  var sk = rows_('Sekolah').filter(function (s) { return s.id === k.sekolahId; })[0];
  var rk = rekapRow_(r.key);
  return {
    status: r.aktif === 'ya' ? 'sah' : 'batal',
    peran: r.peran === 'ks' ? 'Kepala Sekolah' : 'Fasilitator',
    nama: r.nama, nip: r.nip, waktu: Number(r.waktu) || 0, batalAt: Number(r.batalAt) || 0,
    sekolah: sk ? sk.nama : '', no: k.no, judul: rk ? rk.judul : '', tanggal: rk ? rk.tanggal : '',
    program: readProgram_().program || 'CERMAT'
  };
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

/* ===== SALINAN js/importer.js — disisipkan otomatis, ubah di js/importer.js ===== */
var Importer_ = (function () { var window = {};
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
      out[i.id] = { v: U.capaianDari(x5), avg: Math.round(avg * 10) / 10, max: pakai[0].u.max, satuSkala: pakai.every(x => x.u.max === pakai[0].u.max && x.u.min === pakai[0].u.min),
        dasar: pakai.map(x => bersihJudul(x.u.teks)) };
    });
    return out;
  };

  (typeof window !== 'undefined' ? window : this).Importer = U;
})();
return window.Importer; })();
/* ===== AKHIR SALINAN importer.js ===== */

/* Indikator setiap pendampingan (dari js/silabus.js), untuk capaian otomatis dari refleksi. */
var SILABUS_IND_ = {"1":{"j":"Numerasi dalam Konteks Sehari-hari","p":["Peserta dapat menjelaskan konsep dan pentingnya numerasi","Peserta dapat membedakan berhitung dan numerasi serta menjelaskan tiga kompetensi numerasi (formulate, employ, interpret)","Peserta dapat menjelaskan karakteristik pembelajaran kontekstual dan tujuh prinsip CTL"],"k":["Peserta dapat mengidentifikasi kompetensi numerasi dan prinsip CTL pada contoh pembelajaran","Peserta dapat memilih konteks yang dekat dengan murid sesuai jenjang","Peserta dapat mengembangkan soal rutin menjadi soal numerasi"]},"2":{"j":"Deep Learning dalam Matematika","p":["Peserta dapat menjelaskan konsep dan karakteristik pembelajaran mendalam","Peserta dapat mendeskripsikan tiga prinsip dan tiga pengalaman belajar pembelajaran mendalam","Peserta dapat menjelaskan tingkat Taksonomi SOLO"],"k":["Peserta dapat menganalisis respons murid berdasarkan Taksonomi SOLO pada contoh pembelajaran matematik","Peserta dapat menyusun pertanyaan penalaran dan umpan balik bermakna","Peserta dapat memodifikasi satu topik matematika menjadi aktivitas pembelajaran mendalam sederhana"]},"3":{"j":"Mengenal Pendekatan Concrete–Visual–Abstract (CVA)","p":["Peserta dapat menjelaskan konsep dan pentingnya pendekatan CVA","Peserta dapat menjelaskan landasan teori CVA (Bruner, CPA, concreteness fading, pemahaman relasional)","Peserta dapat menjelaskan ciri tahap konkret, visual, dan abstrak"],"k":["Peserta dapat mengidentifikasi tahap CVA pada aktivitas pembelajaran","Peserta dapat menghadirkan satu konsep dalam tiga tahap CVA","Peserta dapat membandingkan pembelajaran CVA dan konvensional"]},"4":{"j":"Pembelajaran Matematika dari Konteks Menuju Abstrak","p":["Peserta dapat menjelaskan alasan dan langkah alur pembelajaran CVA","Peserta dapat menjelaskan strategi menjembatani antartahap dan prinsip memilih alat peraga","Peserta dapat mengidentifikasi kesalahan umum penerapan CVA"],"k":["Peserta dapat menyusun alur pembelajaran CVA untuk satu topik matematika","Peserta dapat menyusun pertanyaan pemantik pada tiap posisi alur","Peserta dapat mensimulasikan satu tahapan pembelajaran CVA"]},"5":{"j":"Berpikir Komputasional (Bagian 1): Memahami dan Menumbuhkan","p":["Peserta dapat menjelaskan alasan pentingnya dan definisi CT","Peserta dapat menjelaskan empat keterampilan cornerstone CT (abstraksi, algoritma, dekomposisi, rekognisi pola)"],"k":["Peserta dapat mengenali keterampilan cornerstone dalam kegiatan sehari-hari dan soal numerasi","Peserta dapat mempraktikkan ice breaking CT dan menyusun versi numerasinya","Peserta dapat merancang ice breaking CT untuk kelasnya"]},"6":{"j":"Berpikir Komputasional (Bagian 2): Menerapkan dalam Pembelajaran","p":["Peserta dapat menjelaskan tiga poin pembelajaran berbasis CT","Peserta dapat menjelaskan keterkaitan keterampilan cornerstone dengan langkah pemecahan masalah dan debugging"],"k":["Peserta dapat merefleksikan praktik baik role play untuk kelasnya","Peserta dapat menemukan bug pada hasil kerja murid dan merancang tindak lanjut","Peserta dapat menyusun rencana pembelajaran terintegrasi CT"]},"7":{"j":"Manajemen Kelas yang Efektif dalam Pembelajaran Matematika","p":["Peserta dapat menjelaskan konsep dan pentingnya manajemen kelas dalam pembelajaran matematika","Peserta dapat menjelaskan strategi menciptakan lingkungan belajar yang positif (ruang kelas, pengelompokan, aturan kelas)","Peserta dapat menjelaskan strategi mengelola pembelajaran dan keberagaman murid"],"k":["Peserta dapat mengidentifikasi tantangan pengelolaan kelas dan dampaknya","Peserta dapat memilih penataan ruang kelas dan pengelompokan serta menyusun aturan kelas","Peserta dapat merancang tindak lanjut pembelajaran berdasarkan hasil asesmen"]},"8":{"j":"Penyusunan Asesmen HOTS","p":["Peserta dapat menjelaskan konsep, karakteristik, dan pentingnya HOTS","Peserta dapat membedakan soal LOTS dan HOTS berdasarkan level kognitif (C1–C6)"],"k":["Peserta dapat mengklasifikasikan soal LOTS/HOTS dan level kognitifnya","Peserta dapat mengidentifikasi stimulus, pokok soal, dan tuntutan berpikir","Peserta dapat mengubah soal rutin menjadi soal HOTS dan memperkirakan jawaban keliru murid"]},"9":{"j":"Menyusun RPM (Rencana Pembelajaran Mendalam) yang Berkualitas","p":["Peserta dapat menjelaskan komponen RPM","Peserta dapat menjelaskan kriteria RPM yang berkualitas"],"k":["Peserta dapat menganalisis contoh RPM menggunakan daftar periksa","Peserta dapat menyusun draf RPM matematika yang mengintegrasikan CVA dan CT"]},"10":{"j":"Review RPM Kelas 1 dan 2","p":["Peserta memahami kriteria RPM matematika yang berkualitas"],"k":["Peserta dapat mereview RPM sejawat menggunakan lembar review dan memberikan umpan balik yang konstruktif","Peserta dapat merevisi RPM sesuai masukan yang diterima"]},"11":{"j":"Review RPM Kelas 3 dan 4","p":["Peserta memahami kriteria RPM matematika yang berkualitas"],"k":["Peserta dapat mereview RPM sejawat menggunakan lembar review dan memberikan umpan balik yang konstruktif","Peserta dapat merevisi RPM sesuai masukan yang diterima"]},"12":{"j":"Review RPM Kelas 5 dan 6","p":["Peserta memahami kriteria RPM matematika yang berkualitas"],"k":["Peserta dapat mereview RPM sejawat menggunakan lembar review dan memberikan umpan balik yang konstruktif","Peserta dapat merevisi RPM sesuai masukan yang diterima"]},"13":{"j":"Pembuatan Alat Peraga CPA berbasis CT","p":["Peserta dapat menjelaskan fungsi alat peraga dalam tahap CPA","Peserta dapat menjelaskan keterkaitan alat peraga dengan keterampilan cornerstone CT"],"k":["Peserta dapat membuat alat peraga CPA berbasis CT untuk satu topik matematika","Peserta dapat menyusun petunjuk penggunaan alat peraga"]},"14":{"j":"Micro Teaching Kelas 1 dan 2","p":["Peserta memahami langkah pelaksanaan pembelajaran matematika mendalam dengan pendekatan CVA dan CT"],"k":["Peserta dapat melakukan micro teaching pembelajaran matematika mendalam dengan pendekatan CVA dan CT dengan baik","Peserta dapat memberikan umpan balik sebagai observer"]},"15":{"j":"Micro Teaching Kelas 3 dan 4","p":["Peserta memahami langkah pelaksanaan pembelajaran matematika mendalam dengan pendekatan CVA dan CT"],"k":["Peserta dapat melakukan micro teaching pembelajaran matematika mendalam dengan pendekatan CVA dan CT dengan baik","Peserta dapat memberikan umpan balik sebagai observer"]},"16":{"j":"Micro Teaching Kelas 5 dan 6","p":["Peserta memahami langkah pelaksanaan pembelajaran matematika mendalam dengan pendekatan CVA dan CT"],"k":["Peserta dapat melakukan micro teaching pembelajaran matematika mendalam dengan pendekatan CVA dan CT dengan baik","Peserta dapat memberikan umpan balik sebagai observer"]},"17":{"j":"Observasi Pembelajaran dan Coaching Kelas 1 dan 2","p":["Peserta memahami pelaksanaan pembelajaran matematika mendalam dengan pendekatan CVA dan CT"],"k":["Peserta dapat melaksanakan pembelajaran matematika mendalam dengan pendekatan CVA dan CT dengan baik","Peserta dapat melakukan refleksi dan menyusun tindak lanjut berdasarkan hasil coaching"]},"18":{"j":"Observasi Pembelajaran dan Coaching Kelas 3 dan 4","p":["Peserta memahami pelaksanaan pembelajaran matematika mendalam dengan pendekatan CVA dan CT"],"k":["Peserta dapat melaksanakan pembelajaran matematika mendalam dengan pendekatan CVA dan CT dengan baik","Peserta dapat melakukan refleksi dan menyusun tindak lanjut berdasarkan hasil coaching"]},"19":{"j":"Observasi Pembelajaran dan Coaching Kelas 5 dan 6","p":["Peserta memahami pelaksanaan pembelajaran matematika mendalam dengan pendekatan CVA dan CT"],"k":["Peserta dapat melaksanakan pembelajaran matematika mendalam dengan pendekatan CVA dan CT dengan baik","Peserta dapat melakukan refleksi dan menyusun tindak lanjut berdasarkan hasil coaching"]},"20":{"j":"Sekolah Ramah Numerasi","p":["Peserta dapat menjelaskan konsep dan ciri sekolah ramah numerasi"],"k":["Peserta dapat memetakan kondisi dan kebutuhan numerasi sekolah","Peserta dapat merancang rencana sekolah ramah numerasi"]},"21":{"j":"Konsep Festival Numerasi","p":["Peserta dapat menjelaskan konsep dan tujuan festival numerasi"],"k":["Peserta dapat merancang bentuk kegiatan festival numerasi","Peserta dapat menyusun rencana pelaksanaan festival (panitia, jadwal, kebutuhan, dan indikator keberhasilan)"]},"22":{"j":"Festival Numerasi","p":["Peserta dapat menjelaskan manfaat festival numerasi bagi budaya numerasi sekolah"],"k":["Peserta dapat melaksanakan festival numerasi sesuai rencana","Peserta dapat mengevaluasi pelaksanaan festival dan menyusun tindak lanjut"]}};
