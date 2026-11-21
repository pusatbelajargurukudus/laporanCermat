/* Service worker: aplikasi tetap bisa dibuka saat sinyal lemah/offline.
 * Naikkan CACHE_VERSION setiap kali ada file yang diubah. */
const CACHE_VERSION = 'laporan-cermat-v17';
const FILES = ['./', 'index.html', 'css/app.css?v=17', 'manifest.webmanifest', 'fonts/fonts.css?v=1',
  'fonts/jakarta-400.woff2', 'fonts/jakarta-500.woff2', 'fonts/jakarta-600.woff2', 'fonts/jakarta-700.woff2', 'fonts/jakarta-800.woff2',
  'fonts/cormorant-600.woff2', 'fonts/cormorant-500i.woff2', 'fonts/cormorant-600i.woff2',
  'icons/logo-mark.png', 'icons/logo-cermat.png', 'icons/favicon-64.png', 'icons/icon-192.png',
  'vendor/pdf-lib.min.js', 'vendor/jszip.min.js', 'vendor/qrcode.js',
  'js/silabus.js?v=17', 'js/db.js?v=17', 'js/api.js?v=17', 'js/importer.js?v=17', 'js/report.js?v=17', 'js/pdf.js?v=17', 'js/app.js?v=17'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // hanya cache milik LAPORAN CERMAT; cache portal CERMAT (situs yang sama) tidak disentuh
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.indexOf('laporan-cermat-') === 0 && k !== CACHE_VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const networkFirst = req => fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE_VERSION).then(c => c.put(req, cp)); } return r; })
  .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Huruf Google Fonts: simpan sekali, lalu bisa dipakai offline
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const cp = res.clone(); caches.open(CACHE_VERSION).then(c => c.put(e.request, cp)); return res; })));
    return;
  }
  if (url.origin !== location.origin) return;
  // Pustaka pratinjau PDF (PDF.js): diunduh saat pertama dipakai, lalu disimpan untuk offline
  if (url.pathname.indexOf('/vendor/pdfjs/') >= 0) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE_VERSION).then(c => c.put(e.request, cp)); } return res; })));
    return;
  }
  // Halaman & config.js selalu dicoba dari jaringan dulu supaya perubahan (mis. URL server) langsung terpakai
  if (e.request.mode === 'navigate' || url.pathname.endsWith('/js/config.js')) { e.respondWith(networkFirst(e.request)); return; }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
