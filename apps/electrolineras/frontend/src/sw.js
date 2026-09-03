// Service worker de electrolineras (scope = /electrolineras/).
//   - La API va SIEMPRE a red (datos frescos); no se intercepta.
//   - Los recursos propios se cachean al vuelo (network-first) para arranque
//     rápido y soporte offline básico.
//   - NUNCA se responde `undefined`: si algo falla y no hay caché, se propaga
//     el error real de red (igual que sin SW), en vez de romper la petición.
const CACHE = 'elec-v2';

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // La API nunca se cachea ni se intercepta: siempre datos frescos.
  if (url.pathname.indexOf('/electrolineras-api') !== -1) return;
  // Solo recursos del propio origen.
  if (url.origin !== self.location.origin) return;
  e.respondWith((async function () {
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      }
      return res;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const idx = (await caches.match('./index.html')) || (await caches.match('index.html'));
        if (idx) return idx;
      }
      throw err; // propaga el error real; no devolvemos undefined
    }
  })());
});
