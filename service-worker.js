const CACHE_NAME = 'pandadash-cache-v4';
const API_CACHE_NAME = 'pandadash-api-cache-v2';
const PHOTO_QUEUE_DB = 'photo-upload-queue';
const API_URL_GET = "https://script.google.com/macros/s/AKfycbwz6LT-e4m3R74wRvC5h4isRE4wmSnzpa-MJtYnAg56PCWbrwI3rdwbekWxauVPGrsmLw/exec";
const API_URL_POST = "https://script.google.com/macros/s/AKfycbwgnkjVCMWlWuXnVaxSBD18CGN3rXGZtQZIvX9QlBXSgbQndWC4uqQ2sc00DuNH6yrb/exec";

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll([
          '/',
          '/index.html',
          '/manifest.json',
          'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap',
          'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
          'https://raw.githubusercontent.com/iLogisticsCoordinator/o/main/icons/icon-192.png',
          'https://raw.githubusercontent.com/iLogisticsCoordinator/o/main/icons/icon-512.png'
        ]);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME && cache !== API_CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Estrategia Cache First para assets estáticos
  if (event.request.url.includes('/icons/') || 
      event.request.url.includes('fonts.googleapis.com') || 
      event.request.url.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => response || fetch(event.request))
    );
    return;
  }

  // Estrategia Network First para API calls
  if (event.request.url.includes(API_URL_GET) || event.request.url.includes(API_URL_POST)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cachear respuestas exitosas de la API
          if (response.ok) {
            const responseToCache = response.clone();
            caches.open(API_CACHE_NAME)
              .then((cache) => cache.put(event.request, responseToCache));
          }
          return response;
        })
        .catch(() => {
          // Fallback a caché cuando hay error de red
          return caches.match(event.request)
            .then((response) => {
              return response || new Response(JSON.stringify({
                success: false,
                message: "No connection and no cached data"
              }), {
                headers: { 'Content-Type': 'application/json' }
              });
            });
        })
    );
    return;
  }

  // Estrategia por defecto (Network First)
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Sync event:', event.tag);
  if (event.tag === 'sync-photos') {
    event.waitUntil(
      processPhotoUploadQueue()
        .catch(error => {
          console.error('[Service Worker] Sync error:', error);
          return Promise.reject(error); // Esto hará que se reintente
        })
    );
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'retry-failed-uploads') {
    console.log('[Service Worker] Periodic sync for failed uploads');
    event.waitUntil(retryFailedUploads());
  }
});

// Procesar la cola de subida de fotos
async function processPhotoUploadQueue() {
  console.log('[Service Worker] Processing photo upload queue...');
  const photos = await getPhotoQueue();
  if (photos.length === 0) {
    console.log('[Service Worker] No photos in queue');
    return;
  }

  const db = await openPhotoQueueDB();
  const tx = db.transaction('photos', 'readwrite');
  const store = tx.objectStore('photos');

  for (const photo of photos) {
    try {
      console.log(`[Service Worker] Uploading photo ${photo.id}...`);
      
      const formData = new FormData();
      formData.append('factura', photo.factura);
      formData.append('fotoBase64', photo.base64Data);
      formData.append('fotoNombre', photo.nombreArchivo);
      formData.append('documento', photo.documento || '');
      formData.append('lote', photo.lote || '');
      formData.append('referencia', photo.referencia || '');
      formData.append('cantidad', photo.cantidad || 0);
      formData.append('nit', photo.nit || '');

      const response = await fetch(API_URL_POST, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Server returned error');
      }

      // Eliminar foto exitosamente subida
      await new Promise((resolve, reject) => {
        const request = store.delete(photo.id);
        request.onsuccess = () => {
          console.log(`[Service Worker] Photo ${photo.id} uploaded successfully`);
          resolve();
        };
        request.onerror = () => reject(new Error('Error deleting photo from queue'));
      });

      // Notificar al cliente sobre el éxito
      notifyClient('photo-upload-success', { id: photo.id, factura: photo.factura });

    } catch (error) {
      console.error(`[Service Worker] Error uploading photo ${photo.id}:`, error);
      
      // Actualizar contador de intentos
      photo.attempts = (photo.attempts || 0) + 1;
      photo.lastError = error.message;
      photo.lastAttempt = new Date().toISOString();

      if (photo.attempts >= 3) {
        // Eliminar después de 3 intentos fallidos
        await new Promise((resolve, reject) => {
          const request = store.delete(photo.id);
          request.onsuccess = () => {
            console.log(`[Service Worker] Removing photo ${photo.id} after 3 failed attempts`);
            notifyClient('photo-upload-failed', { 
              id: photo.id, 
              factura: photo.factura,
              error: error.message 
            });
            resolve();
          };
          request.onerror = () => reject(new Error('Error removing failed photo'));
        });
      } else {
        // Actualizar registro con nuevo intento
        await new Promise((resolve, reject) => {
          const request = store.put(photo);
          request.onsuccess = resolve;
          request.onerror = () => reject(new Error('Error updating photo attempts'));
        });
      }

      // Detener en el primer error para reintentar luego
      return Promise.reject(error);
    }
  }
}

// Reintentar subidas fallidas
async function retryFailedUploads() {
  const photos = await getPhotoQueue();
  if (photos.length === 0) return;

  // Filtrar fotos con intentos fallidos previos
  const failedPhotos = photos.filter(photo => photo.attempts > 0);
  if (failedPhotos.length === 0) return;

  console.log(`[Service Worker] Retrying ${failedPhotos.length} failed uploads...`);
  return processPhotoUploadQueue();
}

// Notificar al cliente (ventana/pestaña abierta)
function notifyClient(type, data) {
  self.clients.matchAll({
    includeUncontrolled: true,
    type: 'window'
  }).then((clients) => {
    if (clients && clients.length) {
      clients.forEach(client => {
        client.postMessage({
          type: type,
          data: data
        });
      });
    }
  });
}

// Funciones para manejar IndexedDB
function openPhotoQueueDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PHOTO_QUEUE_DB, 1);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('photos')) {
        const store = db.createObjectStore('photos', { keyPath: 'id' });
        store.createIndex('by_attempts', 'attempts');
        store.createIndex('by_timestamp', 'timestamp');
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Error opening IndexedDB'));
  });
}

async function getPhotoQueue() {
  const db = await openPhotoQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readonly');
    const store = tx.objectStore('photos');
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(new Error('Error reading photo queue'));
  });
}

// Escuchar mensajes del cliente
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message from client:', event.data);
  
  if (event.data.type === 'get-queue-status') {
    getPhotoQueue()
      .then(photos => {
        event.ports[0].postMessage({ count: photos.length });
      })
      .catch(error => {
        event.ports[0].postMessage({ error: error.message });
      });
  }
  
  if (event.data.type === 'trigger-sync') {
    self.registration.sync.register('sync-photos')
      .then(() => {
        event.ports[0].postMessage({ success: true });
      })
      .catch(error => {
        event.ports[0].postMessage({ error: error.message });
      });
  }
});

// Background sync para cuando el dispositivo se conecta
self.addEventListener('online', () => {
  console.log('[Service Worker] Device is online, checking photo queue...');
  getPhotoQueue()
    .then(photos => {
      if (photos.length > 0) {
        console.log(`[Service Worker] ${photos.length} photos in queue, triggering sync...`);
        return self.registration.sync.register('sync-photos');
      }
    })
    .catch(error => {
      console.error('[Service Worker] Error checking photo queue:', error);
    });
});
