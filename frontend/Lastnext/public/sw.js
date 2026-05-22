/**
 * PCMS service worker.
 *
 * Strategy:
 *  - App shell: cache-first with network update for static Next.js assets.
 *  - Navigation: network-first with offline fallback (/offline) so cellular
 *    drops on the maintenance floor still render a useful screen.
 *  - API: network-only (no stale work orders) but the SW lets the page
 *    handle the failure so the UI can show its own offline banner.
 *
 * Bump CACHE_VERSION whenever you change this file so old clients refresh.
 */

const CACHE_VERSION = 'pcms-v1';
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_URL = '/offline';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isApiRequest(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.includes('/dashboard/api/')
  );
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/icon-') ||
    /\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|css|js)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const network = await fetch(request);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, network.clone()).catch(() => undefined);
          return network;
        } catch (error) {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })(),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const network = await fetch(request);
          if (network.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, network.clone()).catch(() => undefined);
          }
          return network;
        } catch (error) {
          return cached ?? Response.error();
        }
      })(),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// --- Web Push -------------------------------------------------------
// Payload is JSON sent by the backend (see myappLubd/push.py):
//   { title, body, tag?, url?, icon? }

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'PCMS', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'PCMS';
  const options = {
    body: data.body || '',
    tag: data.tag || 'pcms-default',
    icon: data.icon || '/icon-192x192.png',
    badge: '/icon-192x192.png',
    data: { url: data.url || '/dashboard' },
    renotify: !!data.renotify,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            const url = new URL(client.url);
            // Reuse an existing dashboard tab if we have one.
            if (url.pathname.startsWith('/dashboard')) {
              client.navigate(targetUrl);
              return client.focus();
            }
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return null;
      }),
  );
});
