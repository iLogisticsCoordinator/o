const CACHE_NAME = 'pandadash-v2';
const PHOTO_QUEUE = 'photo-upload-queue';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([
        '/',
        '/index.html',
        '/manifest.json'
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME && cache !== PHOTO_QUEUE) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-photos') {
    event.waitUntil(processPhotoQueue());
  }
});

async function processPhotoQueue() {
  const photos = await getQueuedPhotos();
  if (photos.length === 0) return;

  for (const photo of photos) {
    try {
      const formData = new FormData();
      formData.append('factura', photo.factura);
      formData.append('fotoBase64', photo.base64Data);
      formData.append('fotoNombre', photo.nombreArchivo);

      const response = await fetch(API_URL_POST, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        await removeQueuedPhoto(photo.id);
        notifyClient('photo_uploaded', { id: photo.id });
      }
    } catch (error) {
      console.error('Error uploading photo:', error);
      break;
    }
  }
}

async function getQueuedPhotos() {
  const cache = await caches.open(PHOTO_QUEUE);
  const response = await cache.match('queue');
  return response ? await response.json() : [];
}

async function addPhotoToQueue(photo) {
  const queue = await getQueuedPhotos();
  queue.push(photo);
  const cache = await caches.open(PHOTO_QUEUE);
  await cache.put('queue', new Response(JSON.stringify(queue)));
}

async function removeQueuedPhoto(id) {
  const queue = await getQueuedPhotos();
  const newQueue = queue.filter(p => p.id !== id);
  const cache = await caches.open(PHOTO_QUEUE);
  await cache.put('queue', new Response(JSON.stringify(newQueue)));
}

function notifyClient(type, data) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({ type, data });
    });
  });
}

self.addEventListener('message', (event) => {
  if (event.data.type === 'queue_photo') {
    event.waitUntil(
      addPhotoToQueue(event.data.photo)
        .then(() => self.registration.sync.register('sync-photos'))
    );
  }
});
