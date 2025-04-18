// Service Worker mejorado para PandaDash PWA
const CACHE_NAME = 'pandadash-cache-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/offline-manager.js',
  'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://raw.githubusercontent.com/iLogisticsCoordinator/o/main/icons/icon-512.png'
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
  if (event.tag === 'sync-operations') {
    console.log('Service Worker: Sincronizando operaciones pendientes');
    event.waitUntil(syncPendingOperations());
  } else if (event.tag === 'sync-photos') {
    console.log('Service Worker: Sincronizando fotos pendientes');
    event.waitUntil(syncPendingPhotos());
  } else if (event.tag === 'sync-all') {
    console.log('Service Worker: Sincronizando todo el contenido pendiente');
    event.waitUntil(Promise.all([
      syncPendingOperations(),
      syncPendingPhotos()
    ]));
  }
});

// Función para sincronizar operaciones pendientes
async function syncPendingOperations() {
  console.log('Iniciando sincronización de operaciones pendientes');
  
  try {
    // Notificar a todos los clientes que está iniciando la sincronización
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'sync-status',
        status: 'syncing',
        message: 'Sincronizando operaciones...'
      });
    });
    
    // Sincronizar desde el cliente (ya que IndexedDB no es accesible directamente desde el SW)
    // Esto usa un patrón de mensajería para comunicarse con el cliente
    if (clients.length > 0) {
      const client = clients[0];
      client.postMessage({
        type: 'start-sync',
        syncType: 'operations'
      });
      
      // El resultado será recibido por el event listener de mensaje en el cliente
      return new Promise(resolve => {
        self.addEventListener('message', function listener(event) {
          if (event.data && event.data.type === 'sync-operations-result') {
            self.removeEventListener('message', listener);
            
            // Notificar a todos los clientes que ha finalizado la sincronización
            clients.forEach(client => {
              client.postMessage({
                type: 'sync-status',
                status: event.data.success ? 'success' : 'error',
                message: event.data.message,
                details: event.data.details
              });
            });
            
            resolve();
          }
        });
      });
    } else {
      console.log('No hay clientes activos para sincronizar');
      return Promise.resolve();
    }
  } catch (error) {
    console.error('Error en sincronización de operaciones:', error);
    
    // Notificar error a todos los clientes
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'sync-status',
        status: 'error',
        message: 'Error en la sincronización: ' + (error.message || 'Error desconocido')
      });
    });
  }
}

// Función para sincronizar fotos pendientes
async function syncPendingPhotos() {
  console.log('Iniciando sincronización de fotos pendientes');
  
  try {
    // Notificar a todos los clientes que está iniciando la sincronización
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'sync-status',
        status: 'syncing',
        message: 'Sincronizando fotos...'
      });
    });
    
    // Sincronizar desde el cliente (ya que IndexedDB no es accesible directamente desde el SW)
    if (clients.length > 0) {
      const client = clients[0];
      client.postMessage({
        type: 'start-sync',
        syncType: 'photos'
      });
      
      // El resultado será recibido por el event listener de mensaje en el cliente
      return new Promise(resolve => {
        self.addEventListener('message', function listener(event) {
          if (event.data && event.data.type === 'sync-photos-result') {
            self.removeEventListener('message', listener);
            
            // Notificar a todos los clientes que ha finalizado la sincronización
            clients.forEach(client => {
              client.postMessage({
                type: 'sync-status',
                status: event.data.success ? 'success' : 'error',
                message: event.data.message,
                details: event.data.details
              });
            });
            
            resolve();
          }
        });
      });
    } else {
      console.log('No hay clientes activos para sincronizar');
      return Promise.resolve();
    }
  } catch (error) {
    console.error('Error en sincronización de fotos:', error);
    
    // Notificar error a todos los clientes
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'sync-status',
        status: 'error',
        message: 'Error en la sincronización: ' + (error.message || 'Error desconocido')
      });
    });
  }
}

// Notificaciones push
self.addEventListener('push', event => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    
    const options = {
      body: data.message || 'Actualización importante',
      icon: 'https://raw.githubusercontent.com/iLogisticsCoordinator/o/main/icons/icon-192.png',
      badge: 'https://raw.githubusercontent.com/iLogisticsCoordinator/o/main/icons/icon-192.png',
      data: {
        url: data.url || '/'
      }
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'PandaDash', options)
    );
  } catch (error) {
    console.error('Error al procesar notificación push:', error);
  }
});

// Click en notificación
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.matchAll({type: 'window'}).then(windowClients => {
        // Si ya hay una ventana abierta, enfócala
        for (const client of windowClients) {
          if (client.url === event.notification.data.url && 'focus' in client) {
            return client.focus();
          }
        }
        // Si no, abre una nueva ventana
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url);
        }
      })
    );
  }
});
