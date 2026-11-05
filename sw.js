const CACHE_NAME = 'shelldojo-cache-v21.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/main.css',
  './css/crt-effects.css',
  './js/main.js',
  './js/data/curriculum.js',
  './js/core/state.js',
  './js/core/security.js',
  './js/core/sync.js',
  './js/core/feedback.js',
  './js/core/confetti.js',
  './js/core/validator.js',
  './js/core/audio.js',
  './js/core/payments.js',
  './js/core/certificates.js',
  './js/ui/renderer.js',
  './js/ui/dojoController.js',
  './js/ui/arenaController.js',
  './assets/favicon.svg',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) return;
  if (event.request.url.includes('/api/') || event.request.url.includes('/admin/')) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

