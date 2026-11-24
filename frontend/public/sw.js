// VeneTurco Fiscal OS v3.4 - Service Worker PWA (Network-First Navigation + Offline Resilient + Local OCR)
const CACHE_NAME = 'veneturco-cache-v3.4.0';
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

  // Network-First para navegación HTML: garantiza cargar siempre el último bundle tras despliegues
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      fetch(req)
        .then(networkResp => {
          if (networkResp && networkResp.status === 200) {
            const respClone = networkResp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('/index.html', respClone));
          }
          return networkResp;
        })
        .catch(() => caches.match('/index.html') || caches.match(req))
    );
    return;
  }

  // Stale-While-Revalidate para recursos estáticos versionados, iconos y WASM Tesseract
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
      }).catch(() => cachedResp);

      return cachedResp || fetchPromise;
    })
  );
});
