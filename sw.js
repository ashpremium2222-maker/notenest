const CACHE_NAME = 'notenest-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './logo.jpg',
  './icon-192.png',
  './icon-512.png',
  './screenshot-mobile.png',
  './screenshot-desktop.png',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  // Network-first strategy: always try to fetch latest from network first
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // If successful, dynamically update the cache with the fresh file
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        // If network fails (offline), fallback to the cached version
        return caches.match(event.request).then(cached => {
          return cached || caches.match('./index.html');
        });
      })
  );
});
