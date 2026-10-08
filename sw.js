// Service worker: the app works offline after the first visit. Bump VERSION when you add, rename or remove app files.
const VERSION = 'swish-v21';
// The pose model and MediaPipe runtime (~20 MB) live in their own cache that survives version bumps: their paths change
// whenever their content does, so keeping them is safe, and deleting them on every deploy broke offline analysis.
const HEAVY = 'swish-heavy-1';
// Core app files: cached all or nothing, so a new version only takes over once it is complete.
const CORE = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'config/settings.json',
  'js/app.js', 'js/ui.js', 'js/store.js', 'js/moves.js', 'js/pose.js', 'js/skeleton.js', 'js/report.js', 'js/progress.js',
  'js/guide.js', 'js/icons.js', 'js/motion.js', 'js/tokens.js', 'js/crop.js', 'js/analyze.js', 'js/mathutil.js', 'js/shooting.js', 'js/precheck.js', 'js/coaching.js'];
// Nice to have offline; a missing one must not block an update.
const EXTRAS = ['swish-icons/icon-192.png', 'swish-icons/apple-touch-icon.png', 'swish-icons/court.jpg', 'swish-icons/court-soft.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(CORE).then(() => Promise.allSettled(EXTRAS.map((u) => c.add(u)))))
    .then(() => self.skipWaiting())); // if a core file fails, install fails and the previous complete version keeps serving
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== HEAVY).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const put = (cacheName, req, r) => { if (r.ok) { const c = r.clone(); caches.open(cacheName).then((x) => x.put(req, c)); } return r; }; // never cache a 404 or error page

/** Network first; the cache is only used when the network actually fails. No timeout: a timeout per file could mix
 *  new and old modules on a slow connection, and a half-updated module graph does not start at all. */
const networkFirst = (req) => fetch(req).then((r) => put(VERSION, req, r)).catch(() => caches.match(req).then((hit) => hit || Response.error()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const path = new URL(req.url).pathname;
  if (path.includes('/vendor/') || path.includes('/models/')) {
    // large, path-versioned files: cache first, kept across deploys
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => put(HEAVY, req, r))));
  } else if (path.includes('/swish-icons/')) {
    // images: show the cached copy instantly and refresh it in the background
    e.respondWith(caches.match(req).then((hit) => { const net = fetch(req).then((r) => put(VERSION, req, r)).catch(() => hit); return hit || net; }));
  } else {
    // app code and settings: always the newest when online, the offline copy otherwise
    e.respondWith(networkFirst(req));
  }
});
