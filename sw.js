// Service worker: app shell works offline. Bump VERSION when you change app files.
const VERSION = 'swish-v5';
const SHELL = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'swish-icons/icon-192.png', 'swish-icons/apple-touch-icon.png',
  'js/app.js', 'js/ui.js', 'js/store.js', 'js/moves.js', 'js/pose.js', 'js/capture.js', 'js/skeleton.js', 'js/report.js', 'js/progress.js',
  'js/guide.js', 'js/analyze.js', 'js/mathutil.js', 'js/shooting.js', 'js/precheck.js', 'js/coaching.js', 'config/settings.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const url = new URL(req.url);
  const heavy = url.pathname.includes('/vendor/') || url.pathname.includes('/models/');
  if (url.pathname.endsWith('config/settings.json')) {
    // network first so edited ranges/weights take effect
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(VERSION).then((x) => x.put(req, c)); return r; }).catch(() => caches.match(req)));
  } else if (heavy) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { const c = r.clone(); caches.open(VERSION).then((x) => x.put(req, c)); return r; })));
  } else {
    // stale-while-revalidate
    e.respondWith(caches.match(req).then((hit) => {
      const net = fetch(req).then((r) => { const c = r.clone(); caches.open(VERSION).then((x) => x.put(req, c)); return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
