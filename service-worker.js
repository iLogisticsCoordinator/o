self.addEventListener('install', e => {
  console.log('Service Worker instalado');
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', e => {
  console.log('Service Worker activado');
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request));
});


// service-worker.js

// Nombre de la caché
const CACHE_NAME = 'pandadash-cache-v4.1.0';

// Archivos a cachear (agrega aquí todos los recursos que necesitas offline)
const CACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://raw.githubusercontent.com/iLogisticsCoordinator/o/main/icons/icon-512.png'
];

// Instalar Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker instalándose...');
  
  // Esperar hasta que la caché esté lista
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierta');
        return cache.addAll(CACHE_URLS);
      })
      .then(() => {
        // Activar inmediatamente sin esperar a que las pestañas existentes se cierren
        return self.skipWaiting();
      })
  );
});

// Activar Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker activándose...');
  
  // Limpiar cachés anteriores
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Eliminando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Tomar control de las páginas abiertas sin recargar
      return self.clients.claim();
    })
  );
});

// Interceptar peticiones de red
self.addEventListener('fetch', event => {
  // Solo interesar por peticiones GET (las POST de subida de archivos pasarán directo)
  if (event.request.method !== 'GET') return;
  
  // Ignorar las peticiones a las APIs
  if (event.request.url.includes('script.google.com')) return;
  
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Si está en caché, devolver la respuesta cacheada
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Si no está en caché, obtener de la red
        return fetch(event.request)
          .then(response => {
            // Si la respuesta es válida, clonarla y guardarla en caché
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          })
          .catch(error => {
            console.log('Error en fetch:', error);
            // Para peticiones de páginas HTML, devolver la página offline
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/');
            }
            
            // Para otras peticiones que fallan, retornar un error vacío
            return new Response(null, {status: 504});
          });
      })
  );
});

// Manejar sincronización en segundo plano
self.addEventListener('sync', event => {
  console.log('Evento de sincronización detectado:', event.tag);
  
  if (event.tag === 'sync-guardados-pendientes') {
    console.log('Intentando sincronizar datos pendientes...');
    
    event.waitUntil(syncPendingData()
      .then(() => {
        // Notificar a todas las ventanas abiertas que la sincronización está completa
        return self.clients.matchAll()
          .then(clients => {
            clients.forEach(client => {
              client.postMessage({
                type: 'sync-complete'
              });
            });
          });
      })
    );
  }
});

// Función para sincronizar datos pendientes
async function syncPendingData() {
  try {
    // Intentar obtener datos de localStorage (mediante un cliente)
    const clients = await self.clients.matchAll();
    if (clients.length === 0) return;
    
    // Podemos enviar mensaje al cliente para que inicie la sincronización
    clients.forEach(client => {
      client.postMessage({
        type: 'start-sync'
      });
    });
    
    return true;
  } catch (error) {
    console.error('Error al sincronizar datos pendientes:', error);
    return false;
  }
}

// Escuchar mensajes desde el cliente
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'check-updates') {
    // Podemos verificar actualizaciones si lo necesitamos
  }
});
