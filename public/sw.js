const CACHE_NAME = 'nexchat-v2';
const ASSETS = [
  '/',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'NexChat', body: 'Você tem uma nova notificação', icon: '/icon.svg', badge: '/icon.svg', tag: 'nexchat-notification' };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      console.error('Erro ao parsear push data:', e);
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    data: data.data || {},
    requireInteraction: true,
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'close', title: 'Fechar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';
  const isNewSession = event.notification.data?.isNewSession;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existingClient = clientList.find((client) => client.url.includes(self.location.origin));

      if (existingClient && !isNewSession) {
        return existingClient.focus().then(() => {
          existingClient.postMessage({ type: 'OPEN_CHAT', targetId: event.notification.data?.targetId, callRoomId: event.notification.data?.callRoomId });
        });
      } else {
        return self.clients.openWindow(url).then((windowClient) => {
          if (windowClient && isNewSession) {
            windowClient.postMessage({ type: 'OPEN_CHAT', targetId: event.notification.data?.targetId, callRoomId: event.notification.data?.callRoomId });
          }
        });
      }
    })
  );
});
