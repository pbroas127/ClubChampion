// Bump CACHE and the ?v= list below together with index.html's ?v= on every deploy.
const CACHE = 'cc-shell-v41';
const SHELL = [
  '/',
  '/index.html',
  '/privacy.html',
  '/terms.html',
  '/css/styles.css?v=41',
  '/css/legal.css?v=1',
  '/css/shop.css?v=41',
  '/js/config.js?v=41',
  '/js/native.js?v=41',
  '/js/supabase.js?v=41',
  '/js/data.js?v=41',
  '/js/data-nations.js?v=41',
  '/js/engine.js?v=41',
  '/js/cpu.js?v=41',
  '/js/game.js?v=41',
  '/js/matchsim.js?v=41',
  '/js/shop.js?v=41',
  '/js/locker.js?v=41',
  '/js/app.js?v=41',
  '/js/ui.js?v=41',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  const versioned = req.url.includes('?v=');
  if (versioned) {
    // Content behind a ?v= is immutable for that version, so cache-first is safe.
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      }))
    );
  } else {
    // index.html / "/" should always try the network first so deploys show up
    // immediately; only fall back to the cached shell when offline.
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('/index.html')))
    );
  }
});
