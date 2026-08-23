const CACHE_FAMILY = 'liam-supervisor-app-';
const CACHE_NAME = 'liam-supervisor-app-1-2-pwa-iphone-stable-20260824-v1';
const SHELL = [
  './app.html',
  './app.css',
  './app.js',
  './app-data-contract.js',
  './app-preview-data.js',
  './patrol-read-model.js',
  './half-month-check-read-model.js',
  './yesterday-follow-up-model.js',
  './half-month-check-write-prep.js',
  './manifest.webmanifest',
  './offline.html',
  './app-assets/lucide.min.js',
  './app-assets/liam-intel-icon.svg',
  './app-assets/liam-intel-icon-192.png',
  './app-assets/liam-intel-icon-512.png'
];
const SHELL_PATHS = new Set(SHELL.map(path => path.replace(/^\.\//, '')));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_FAMILY) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

function networkFirstHtml(request) {
  return fetch(request, { cache:'no-store' }).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request).then(cached => cached || caches.match('./offline.html')));
}

// iOS may preserve a versioned script URL while an updated app shell is
// installing. Prefer the deployed asset while online, and only fall back to
// the same versioned shell file when the device is offline. This cache never
// contains private API responses or credentials.
function networkFirstShellAsset(request) {
  return fetch(request, { cache:'no-store' }).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request, { ignoreSearch:true }));
}

function networkFirstKpiController(request) {
  return fetch(request, { cache:'no-store' }).then(async response => {
    if (!response.ok) return response;
    const original = await response.text();
    const oldGuard = `    const reportSource = kpiBattleReportSourceFile((snapshot || {}).report_date);\n    return Boolean(\n      snapshot && reportSource &&\n      snapshotDataAsOf === kpiData.data_as_of_date &&\n      snapshotSource && snapshotSource === reportSource &&\n      snapshotSource === kpiBattleSourceFile(kpiData.source_file)\n    );`;
    const newGuard = `    return Boolean(\n      snapshot &&\n      snapshotDataAsOf === kpiData.data_as_of_date &&\n      snapshotSource &&\n      snapshotSource === kpiBattleSourceFile(kpiData.source_file)\n    );`;
    const patched = original.includes(oldGuard) ? original.replace(oldGuard, newGuard) : original;
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/javascript; charset=utf-8');
    headers.set('Cache-Control', 'no-store');
    return new Response(patched, { status: response.status, statusText: response.statusText, headers });
  }).catch(() => caches.match(request));
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  const relativePath = requestUrl.pathname.startsWith(scopePath) ? requestUrl.pathname.slice(scopePath.length) : '';
  if (SHELL_PATHS.has(relativePath)) {
    event.respondWith(networkFirstShellAsset(event.request));
    return;
  }
  if (requestUrl.pathname.endsWith('/kpi-battle-controller.js')) {
    event.respondWith(networkFirstKpiController(event.request));
    return;
  }
  if (requestUrl.pathname.endsWith('/audit-report.html')) {
    event.respondWith(networkFirstHtml(event.request));
    return;
  }
  // All live HTML pages and top-level navigations must prefer the network.
  // Meta no-cache headers do not override an installed service worker, so a
  // cache-first route here can otherwise pin index.html / kpi.html / patrol.html
  // to an old build even after GitHub Pages has deployed a new version.
  if (event.request.mode === 'navigate' || requestUrl.pathname.endsWith('.html') || requestUrl.pathname.endsWith('/')) {
    event.respondWith(networkFirstHtml(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      return response;
    }).catch(() => event.request.mode === 'navigate' ? caches.match('./offline.html') : cached))
  );
});
