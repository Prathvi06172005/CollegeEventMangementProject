const CACHE_NAME = 'cev-cache-v2';
const ASSETS = [
  '/public/styles.css',
  '/public/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k))))
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const isNavigation = request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    // Network-first for HTML to avoid stale redirects/pages
    event.respondWith(
      fetch(request)
        .then((resp) => {
          // Only cache successful, non-redirect responses
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return resp;
        })
        .catch(async () => (await caches.match(request)) || caches.match('/public/styles.css'))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((resp) => {
      if (resp && resp.ok) {
        const respClone = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, respClone));
      }
      return resp;
    }))
  );
});


// Push notifications
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || 'Collage Event Zone';
  const body = data.body || 'You have a new notification';
  const url = data.url || '/';
  const tag = data.tag || 'events';
  const options = {
    body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { url },
    // WhatsApp-like UX cues
    vibrate: [100, 50, 100],
    requireInteraction: true,
    renotify: true,
    tag,
    actions: [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') {
    return;
  }
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clis) => {
      for (const c of clis) {
        if ('focus' in c) {
          c.navigate(targetUrl);
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});


