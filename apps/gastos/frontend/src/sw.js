// Service worker de la app (scope = su propia ruta). Habilita instalar como PWA
// y recibir notificaciones push (Web Push).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// ── Web Push ──
self.addEventListener('push', (e) => {
  let data = { title: 'Gastos', body: '', url: '/gastos/' };
  try { if (e.data) data = Object.assign(data, e.data.json()); } catch (_) { if (e.data) data.body = e.data.text(); }
  e.waitUntil(self.registration.showNotification(data.title || 'Gastos', {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: data.tag || 'gastos',
    data: { url: data.url || '/gastos/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/gastos/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});
