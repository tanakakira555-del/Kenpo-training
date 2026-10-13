const CACHE_NAME = 'sharoushi-v6';
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
  '/Kenpo-training/data-kokunen.js',
  '/Kenpo-training/data-kounen.js',
  '/Kenpo-training/samune.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(ASSETS.map(u => fetch(new Request(u, { cache: 'reload' })).then(r => r.ok && cache.put(u, r)).catch(() => {})))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ネットワーク優先（常に最新を取得）、オフライン時のみキャッシュを使う
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
