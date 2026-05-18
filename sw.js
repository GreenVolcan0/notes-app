const APP_SHELL_CACHE = 'app-shell-v5';

const DYNAMIC_CACHE = 'dynamic-content-v1';

/* ---------- 2. Список ресурсов оболочки (App Shell) ---------- */
const APP_SHELL_ASSETS = [
    './',
    './index.html',
    './app.js',
    './manifest.json',

    // Иконки (практика 14):
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


/* ---------- 3. install: заполняем APP_SHELL_CACHE ---------- */
self.addEventListener('install', (event) => {
    console.log('[sw] install:', APP_SHELL_CACHE);
    event.waitUntil(
        caches.open(APP_SHELL_CACHE)
            .then((cache) => {
                console.log('[sw] precache app-shell:', APP_SHELL_ASSETS);
                return cache.addAll(APP_SHELL_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});


/* ---------- 4. activate: убираем старые кэши ---------- */
self.addEventListener('activate', (event) => {
    console.log('[sw] activate:', APP_SHELL_CACHE, '+', DYNAMIC_CACHE);

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => Promise.all(
                cacheNames
                    .filter((name) => name !== APP_SHELL_CACHE && name !== DYNAMIC_CACHE)
                    .map((name) => {
                        console.log('[sw] удаляем старый кэш:', name);
                        return caches.delete(name);
                    })
            ))
            .then(() => self.clients.claim())
    );
});


/* ---------- 5. fetch: маршрутизируем запросы ---------- */
self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== location.origin) return;
    if (url.pathname.includes('/content/')) {
        event.respondWith(networkFirst(request));
        return;
    }
    event.respondWith(cacheFirst(request));
});


/* ---------- 6. Стратегия Cache First ---------- */
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok && networkResponse.type === 'basic') {
            const cache = await caches.open(APP_SHELL_CACHE);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (err) {
        console.warn('[sw] cacheFirst failed:', request.url, err);
        return new Response('Офлайн и ресурса нет в кэше', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }
}


/* ---------- 7. Стратегия Network First ---------- */
async function networkFirst(request) {
    const cache = await caches.open(DYNAMIC_CACHE);

    try {
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
            return networkResponse;
        }
        const cached = await cache.match(request);
        return cached || networkResponse;
    } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;
        const homeFallback = await caches.match('./content/home.html')
                          ?? await caches.match('./index.html');
        if (homeFallback) return homeFallback;

        return new Response('Контент недоступен офлайн', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    }
}


/* ---------- 8. message: на случай ручного skipWaiting ---------- */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

/* ---------- 9. push: входящие push-уведомления (практика 16) ---------- */
self.addEventListener('push', (event) => {
    let data = { title: 'Новое уведомление', body: '', reminderId: null };
    if (event.data) {
        try {
            data = event.data.json();
        } catch {
            data = { title: 'Новое уведомление', body: event.data.text(), reminderId: null };
        }
    }

    const options = {
        body:  data.body  || '',
        icon:  './icons/icon-192x192.png',
        badge: './icons/icon-48x48.png',
        data:  {
            url: './',
            reminderId: data.reminderId || null,
            original: data,
        },
        tag:   data.reminderId ? `reminder-${data.reminderId}` : 'notes-task',
        renotify: true,
    };

    // ===== Практика 17: action-кнопка «Отложить на 5 минут» =====
    if (data.reminderId) {
        options.actions = [
            { action: 'snooze', title: 'Отложить на 5 минут' },
        ];
        options.body = data.body || 'Пора заняться задачей!';
    }

    event.waitUntil(
        self.registration.showNotification(
            data.title || 'Новое уведомление',
            options
        )
    );
});


/* ---------- 10. notificationclick: клик по push (практика 16) ---------- */
self.addEventListener('notificationclick', (event) => {
    const action       = event.action;
    const notification = event.notification;
    const data         = notification.data || {};

    // ===== Практика 17: «Отложить на 5 минут» =====
    if (action === 'snooze') {
        const reminderId = data.reminderId;
        if (!reminderId) {
            console.warn('[sw] snooze: нет reminderId в notification.data');
            notification.close();
            return;
        }

        notification.close();
        event.waitUntil(
            fetch(`/snooze?reminderId=${encodeURIComponent(reminderId)}`, {
                method: 'POST',
            })
            .then((res) => {
                if (!res.ok) {
                    console.warn('[sw] snooze HTTP', res.status);
                }
            })
            .catch((err) => {
                console.error('[sw] snooze failed:', err);
            })
        );
        return;
    }

    notification.close();

    const targetUrl = data.url || './';

    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if ('focus' in client) {
                        return client.focus();
                    }
                }
                if (self.clients.openWindow) {
                    return self.clients.openWindow(targetUrl);
                }
            })
    );
});
