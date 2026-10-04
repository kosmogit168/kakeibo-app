const CACHE_NAME = 'kakeibo-cache-v5';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './icon-180.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // ネット優先（更新がすぐ反映される）、オフライン時はキャッシュを使う
  event.respondWith(
    // cache:'no-cache' = ブラウザのHTTPキャッシュ（GitHub Pagesは最大10分）を使わず毎回最新版か確認する
    fetch(event.request, { cache: 'no-cache' })
      .then((networkResponse) => {
        if (networkResponse.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
