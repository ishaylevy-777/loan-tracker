const CACHE_NAME = 'loan-tracker-v3';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    if (e.request.url.includes('supabase') || e.request.url.includes('googleapis') || e.request.url.includes('cdn.jsdelivr.net')) {
        return;
    }
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});
