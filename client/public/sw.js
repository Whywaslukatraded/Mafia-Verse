const CACHE_NAME = 'mafia-game-v4';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
];

self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Caching app shell');
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {
        console.log('[ServiceWorker] Some assets not cached (may be offline)');
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[ServiceWorker] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

function buildValidatedUrl(baseUrl) {
  try {
    const url = new URL(baseUrl);
    
    // Only allow same-origin requests to prevent SSRF
    if (url.origin !== self.location.origin) {
      throw new Error('Invalid host');
    }
    
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Invalid protocol');
    }
    
    return url.href;
  } catch {
    throw new Error('Invalid URL');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  // Skip unsupported schemes (e.g. chrome-extension://) to avoid cache.put() errors
  if (!request.url.startsWith('http')) {
    return;
  }

  // Security fix (#3/#7): this used to cache every successful GET
  // indiscriminately, including authenticated API responses like
  // /api/account/credits, /api/rewards/referral, /api/auth/2fa/status, and
  // /api/rooms/:code. Those responses persisted in Cache Storage even after
  // sign-out and could be replayed to a later user of the same browser
  // profile via the offline fallback below. Only the app shell (static
  // assets, not API responses) should ever be cached.
  const url = new URL(request.url);
  const isApiRequest = url.pathname.startsWith('/api/');

  if (isApiRequest) {
    // Network-only for API calls — never cache, never serve stale/offline
    // data for authenticated or account-scoped endpoints.
    //
    // Bug fix: this used to call fetch(validatedUrl) — a bare string —
    // which builds a brand-new request from scratch and silently drops
    // every header the original request had, including Authorization.
    // That meant any GET API call intercepted by this service worker
    // reached the server with no bearer token at all, even though the
    // page genuinely sent one, and the server correctly (from its point of
    // view) responded 401. This looked exactly like "I'm signed in but
    // the server says I'm not" — intermittent, GET-only (POST requests
    // are ignored above and go straight to network untouched), and
    // dependent on whether this service worker happened to be controlling
    // the page. buildValidatedUrl is kept as a same-origin/protocol check
    // (defense in depth), but the actual fetch now uses the real `request`
    // object so headers, credentials, and everything else survive intact.
    try {
      buildValidatedUrl(request.url);
      event.respondWith(fetch(request));
    } catch {
      event.respondWith(new Response('Invalid URL', { status: 400 }));
    }
    return;
  }

  // Network-first: always try to get the latest file from the server.
  // Only fall back to cache if the network request fails (e.g. offline).
  try {
    buildValidatedUrl(request.url);
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || caches.match('/');
          });
        })
    );
  } catch {
    event.respondWith(new Response('Invalid URL', { status: 400 }));
  }
});
