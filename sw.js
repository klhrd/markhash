const CACHE_NAME = 'markhash-v6.14.16';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/file.js',
  './manifest.json',
  './images/icons/icon-192.png',
  './images/icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.4.16/purify.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.4.4/lz-string.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
  'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
  'https://cdn.jsdelivr.net/npm/marked-katex-extension@5.1.13/lib/index.umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.2.0/github-markdown.min.css',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0',
  'https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;700&display=swap'
];

// 逐檔快取：單一資源失敗（如 CDN 不穩）不讓整個 SW 安裝失敗
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

// 清理舊版快取，避免跨版本累積
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() =>
        // 離線時導頁請求 fallback 到首頁（hash 內容不會丟失）；
        // 其餘請求一律回傳 Response.error()，避免 respondWith 收到 undefined
        event.request.mode === 'navigate'
          ? caches.match('./index.html').then((r) => r || Response.error())
          : Response.error()
      );
    })
  );
});
