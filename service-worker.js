const CACHE_NAME = 'pandadash-v1';
const API_CACHE_NAME = 'api-cache-v1';
const OFFLINE_PHOTOS_QUEUE = 'offline-photos-queue';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([
        '/',
        '/index.html',
        '/manifest.json',
        'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap',
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME && cache !== API_CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Cache-first strategy for static assets
  if (event.request.url.includes('/icons/') || 
      event.request.url.includes('fonts.googleapis.com') || 
      event.request.url.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.match(event.request)
        .then(response => response || fetch(event.request))
    );
    return;
  }

  // Network-first strategy for API calls
  if (event.request.url.includes(API_URL_GET) || event.request.url.includes(API_URL_POST)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clone the response to cache it
          const responseToCache = response.clone();
          caches.open(API_CACHE_NAME)
            .then(cache => cache.put(event.request, responseToCache));
          return response;
        })
        .catch(() => {
          return caches.match(event.request)
            .then(response => response || new Response(JSON.stringify({ 
              success: false, 
              message: "No connection and no cached data" 
            }), {
              headers: { 'Content-Type': 'application/json' }
            }));
        })
    );
    return;
  }

  // Default behavior
  event.respondWith(fetch(event.request));
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-photos') {
    event.waitUntil(processOfflinePhotosQueue());
  }
});

async function processOfflinePhotosQueue() {
  const photosQueue = await getPhotosQueue();
  if (photosQueue.length === 0) return;

  for (const photoData of photosQueue) {
    try {
      const response = await fetch(API_URL_POST, {
        method: 'POST',
        body: JSON.stringify(photoData),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        await removePhotoFromQueue(photoData.id);
      }
    } catch (error) {
      console.error('Error uploading photo:', error);
      break; // Stop on first error, will retry on next sync
    }
  }
}

async function getPhotosQueue() {
  const cache = await caches.open(OFFLINE_PHOTOS_QUEUE);
  const response = await cache.match('photos-queue');
  return response ? await response.json() : [];
}

async function addPhotoToQueue(photoData) {
  const queue = await getPhotosQueue();
  queue.push(photoData);
  const cache = await caches.open(OFFLINE_PHOTOS_QUEUE);
  await cache.put('photos-queue', new Response(JSON.stringify(queue)));
}

async function removePhotoFromQueue(photoId) {
  const queue = await getPhotosQueue();
  const newQueue = queue.filter(photo => photo.id !== photoId);
  const cache = await caches.open(OFFLINE_PHOTOS_QUEUE);
  await cache.put('photos-queue', new Response(JSON.stringify(newQueue)));
}
