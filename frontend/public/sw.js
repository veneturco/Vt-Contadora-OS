// VeneTurco Fiscal OS v3.3 - Service Worker PWA (Offline Resilient + Local OCR)
const CACHE_NAME = 'veneturco-cache-v3.3.3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Precaching essential assets for offline operation');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => {
          console.log('[SW] Eliminando cache anterior:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorar peticiones no-GET y esquemas externos (ej. chrome-extension://) para evitar errores en cache.put
  if (req.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // Bypass API calls from cache, let apiClient handle timeouts/offline
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/webhooks')) {
    return;
  }

  // Stale-While-Revalidate for static assets, scripts and styles
  event.respondWith(
    caches.match(req).then(cachedResp => {
      const fetchPromise = fetch(req).then(networkResp => {
        if (networkResp && networkResp.status === 200) {
          const respClone = networkResp.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(req, respClone);
          });
        }
        return networkResp;
      }).catch(() => {
        // Fallback for navigation requests when offline
        if (req.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return cachedResp;
      });

      return cachedResp || fetchPromise;
    })
  );
});
