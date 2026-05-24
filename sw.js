const CACHE_NAME = 'sharoushi-v1';
const ASSETS = [
  '/Kenpo-training/',
  '/Kenpo-training/index.html',
  '/Kenpo-training/samune.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});
