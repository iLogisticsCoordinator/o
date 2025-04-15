// Service Worker para Lector PDA PWA
const CACHE_NAME = 'pda-reader-cache-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://i.ibb.co/LC188Vm/Remove-bg-ai-1712427251285.png'
];

// Instalación del Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker instalándose');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto');
        return cache.addAll(URLS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activación del Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker activándose');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Eliminando cache anterior:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Interceptación de las solicitudes fetch
self.addEventListener('fetch', event => {
  // Ignorar solicitudes a la API para permitir siempre datos frescos
  if (event.request.url.includes('?action=') || 
      event.request.url.includes('script.google.com')) {
    // Para solicitudes API, intentar red primero y caer en cache como respaldo
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // Si estamos offline, intentamos responder desde cache
          return caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // Si no hay cache para la API, devolver respuesta genérica
              return new Response(
                JSON.stringify({
                  success: false,
                  error: 'Sin conexión. Usando modo offline.',
                  offline: true
                }),
                { 
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            });
        })
    );
  } else {
    // Para recursos estáticos, usamos estrategia Cache First
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Si no está en cache, buscamos en la red
          return fetch(event.request)
            .then(response => {
              // Verificar si la respuesta es válida
              if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
              }
              
              // Clonar respuesta para poder usarla y guardarla
              const responseToCache = response.clone();
              
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
                
              return response;
            });
        })
    );
  }
});

// Sincronización en segundo plano para enviar datos pendientes cuando vuelva la conexión
self.addEventListener('sync', event => {
  if (event.tag === 'sync-guardados-pendientes') {
    console.log('Sincronizando registros pendientes');
    event.waitUntil(syncPendingData());
  }
});

// Función para sincronizar datos pendientes
async function syncPendingData() {
  try {
    // Obtener datos pendientes del IndexedDB
    const pendingData = await getPendingData();
    
    if (pendingData && pendingData.length > 0) {
      for (const item of pendingData) {
        try {
          // Intentar enviar cada registro pendiente
          await fetch(item.url, {
            method: item.method,
            headers: item.headers,
            body: item.body
          });
          
          // Eliminar el registro sincronizado
          await removePendingData(item.id);
        } catch (error) {
          console.error('Error al sincronizar item pendiente:', error);
        }
      }
    }
  } catch (error) {
    console.error('Error en sincronización:', error);
  }
}

// Estas funciones deberán implementarse en el IndexedDB del cliente
function getPendingData() {
  // Implementación para obtener datos pendientes del IndexedDB
  return Promise.resolve([]);
}

function removePendingData(id) {
  // Implementación para eliminar datos pendientes del IndexedDB
  return Promise.resolve();
}
