/* Service worker: aplikasi tetap bisa dibuka saat sinyal lemah/offline.
 * Naikkan CACHE_VERSION setiap kali ada file yang diubah. */
const CACHE_VERSION = 'laporan-cermat-v2';
const FILES = ['./', 'index.html', 'css/app.css?v=2', 'manifest.webmanifest', 'icons/icon.svg',
  'vendor/pdf-lib.min.js', 'vendor/jszip.min.js', 'js/config.js?v=2',
  'js/silabus.js?v=2', 'js/db.js?v=2', 'js/api.js?v=2', 'js/importer.js?v=2', 'js/report.js?v=2', 'js/pdf.js?v=2', 'js/app.js?v=2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // halaman utama: coba jaringan dulu supaya versi baru cepat terambil
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE_VERSION).then(c => c.put(e.request, cp)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
