// Service worker: permite abrir la app sin internet.
// Estrategia "red primero": si hay conexión siempre carga la última versión publicada en GitHub,
// y si no hay conexión usa la copia guardada. Así no hace falta cambiar versiones al modificar el código.
const CACHE = 'finanzas-v1';
const ARCHIVOS = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/app.js', './js/store.js', './js/stats.js', './js/charts.js', './js/util.js', './js/importar.js',
  './vendor/chart.umd.min.js', './icons/icon-192.png', './icons/icon-512.png', './icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Solo archivos de la propia app; las llamadas a Google (sincronización) pasan directo.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
