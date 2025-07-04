const CACHE_NAME = 'timetracker-v1';
const urlsToCache = [
  '/o/beta/',
  '/o/beta/index.html',
  '/o/beta/icons/icon-192.png',
  '/o/beta/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
