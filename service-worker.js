const CACHE_NAME = 'pandadash-cache-v4';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://raw.githubusercontent.com/iLogisticsCoordinator/o/main/icons/icon-192.png',
  'https://raw.githubusercontent.com/iLogisticsCoordinator/o/main/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache abierto');
        return cache.addAll(URLS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Estrategia Cache First con fallback a red
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Devuelve la respuesta en caché si existe
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Para solicitudes de API, siempre intenta la red primero
        if (event.request.url.includes('script.google.com')) {
          return fetch(event.request)
            .catch(() => {
              // Si falla y es una API, devuelve una respuesta genérica
              if (event.request.headers.get('accept').includes('application/json')) {
                return new Response(
                  JSON.stringify({ error: 'No connection', offline: true }), 
                  { headers: { 'Content-Type': 'application/json' } }
                );
              }
            });
        }
        
        // Para otros recursos, intenta la red
        return fetch(event.request);
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
