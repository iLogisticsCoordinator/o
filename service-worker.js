self.addEventListener('install', (e) => {
  console.log('NebulaDash Service Worker instalado');
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  console.log('NebulaDash Service Worker activado');
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request));
});
