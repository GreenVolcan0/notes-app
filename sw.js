

const CACHE_VERSION = 'v2';
const CACHE_NAME = `notes-cache-${CACHE_VERSION}`;



const ASSETS = [
    './',
    './index.html',
    './app.js',
    './manifest.json',
    './icons/icon-16x16.png',
    './icons/icon-32x32.png',
    './icons/icon-48x48.png',
    './icons/icon-64x64.png',
    './icons/icon-128x128.png',
    './icons/icon-152x152.png',
    './icons/icon-192x192.png',
    './icons/icon-256x256.png',
    './icons/icon-512x512.png',
];


self.addEventListener('install', (event) => {
    console.log('[sw] install:', CACHE_NAME);

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[sw] кэшируем оболочку приложения:', ASSETS);
                return cache.addAll(ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});


self.addEventListener('activate', (event) => {
    console.log('[sw] activate:', CACHE_NAME);

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log('[sw] удаляем устаревший кэш:', name);
                        return caches.delete(name);
                    })
            ))
            .then(() => self.clients.claim())
    );
});


self.addEventListener('fetch', (event) => {
    const request = event.request;

    if (request.method !== 'GET') return;

    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(request)
                .then((networkResponse) => {
                    if (
                        networkResponse &&
                        networkResponse.status === 200 &&
                        networkResponse.type === 'basic'
                    ) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    if (request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                    return new Response('Офлайн и ресурса нет в кэше', {
                        status: 503,
                        statusText: 'Service Unavailable',
                        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                    });
                });
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
