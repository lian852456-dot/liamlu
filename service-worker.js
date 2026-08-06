const CACHE_NAME = 'liam-intel-app-shell-v1';
const SHELL = [
  './app.html',
  './app.css',
  './app.js',
  './manifest.webmanifest',
  './offline.html',
  './app-assets/liam-intel-icon.svg',
  './app-assets/liam-intel-icon-192.png',
  './app-assets/liam-intel-icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok && requestUrl.pathname.endsWith('.html')) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => event.request.mode === 'navigate' ? caches.match('./offline.html') : cached))
  );
});
