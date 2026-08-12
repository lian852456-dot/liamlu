const CACHE_FAMILY = 'liam-supervisor-app-';
const CACHE_NAME = 'liam-supervisor-app-1-2-half-month-hwrite-predeploy-v1';
const SHELL = [
  './app.html',
  './app.css',
  './app.js',
  './app-data-contract.js',
  './app-preview-data.js',
  './patrol-read-model.js',
  './half-month-check-read-model.js',
  './half-month-check-write-prep.js',
  './manifest.webmanifest',
  './offline.html',
  './app-assets/lucide.min.js',
  './app-assets/liam-intel-icon.svg',
  './app-assets/liam-intel-icon-192.png',
  './app-assets/liam-intel-icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_FAMILY) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.endsWith('/app.html')) {
    event.respondWith(fetch(event.request, { cache:'no-store' }).catch(() => caches.match('./app.html')));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok && requestUrl.pathname.endsWith('.html')) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => event.request.mode === 'navigate' ? caches.match('./offline.html') : cached))
  );
});
