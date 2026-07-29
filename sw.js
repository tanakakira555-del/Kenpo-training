const CACHE_NAME = 'sharoushi-v3';
const ASSETS = [
  '/Kenpo-training/',
  '/Kenpo-training/index.html',
  '/Kenpo-training/style.css',
  '/Kenpo-training/app.js',
  '/Kenpo-training/data-roki.js',
  '/Kenpo-training/data-roan.js',
  '/Kenpo-training/data-rosai.js',
  '/Kenpo-training/data-koyoho.js',
  '/Kenpo-training/data-choshu.js',
  '/Kenpo-training/data-kenpo.js',
  '/Kenpo-training/data-kounen.js',
  '/Kenpo-training/samune.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});
