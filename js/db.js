/* Cache lokal (IndexedDB) — salinan data supaya aplikasi cepat & tetap bisa dipakai saat offline.
 *  kv      : sesi login, cache data awal, antrean kecil
 *  reports : salinan laporan (+ penanda _dirty/_version untuk sinkronisasi)
 *  images  : foto/scan yang sudah diunduh/diunggah { id, data(dataURL) }
 *  pending : antrean unggah foto saat offline
 */
(function () {
  const DB_NAME = 'laporan-cermat-v2';
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        ['kv', 'reports'].forEach(n => { if (!db.objectStoreNames.contains(n)) db.createObjectStore(n); });
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('pending')) db.createObjectStore('pending', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  function tx(store, mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      let result;
      Promise.resolve(fn(t.objectStore(store))).then(r => { result = r; });
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transaksi dibatalkan'));
    }));
  }
  window.DB = {
    get: (s, k) => tx(s, 'readonly', st => reqP(st.get(k))),
    put: (s, v, k) => tx(s, 'readwrite', st => reqP(k === undefined ? st.put(v) : st.put(v, k))),
    del: (s, k) => tx(s, 'readwrite', st => reqP(st.delete(k))),
    all: s => tx(s, 'readonly', st => reqP(st.getAll())),
    keys: s => tx(s, 'readonly', st => reqP(st.getAllKeys())),
    clear: s => tx(s, 'readwrite', st => reqP(st.clear())),
    async wipe() { for (const s of ['kv', 'reports', 'images', 'pending']) await DB.clear(s); }
  };
})();
