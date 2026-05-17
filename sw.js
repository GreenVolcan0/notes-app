/* =====================================================================
 * sw.js — Service Worker приложения «Заметки», версия для App Shell.
 * Практическое занятие №15. App Shell + HTTPS.
 * =====================================================================
 *
 * Что нового по сравнению с практикой 13/14:
 *   1. Два РАЗНЫХ кэша вместо одного:
 *        APP_SHELL_CACHE   = 'app-shell-v3'         — статика (оболочка).
 *        DYNAMIC_CACHE     = 'dynamic-content-v1'   — фрагменты /content/*.
 *      Зачем разделять: у них РАЗНЫЕ стратегии и РАЗНЫЕ жизни.
 *      Shell обновляется только при bump-е версии разработчиком,
 *      dynamic — растёт по мере того, как пользователь открывает страницы.
 *
 *   2. Две СТРАТЕГИИ кэширования вместо одной:
 *        - Cache First для App Shell (мгновенная загрузка, идеально для статики).
 *        - Network First для /content/* (свежий контент онлайн, fallback из кэша офлайн).
 *
 *   3. Cross-origin запросы (chota CDN, иные домены) пропускаем —
 *      пусть ими занимается сам браузер. Это правило `if (url.origin !== location.origin)`.
 *
 * Стратегии кэширования (полезно знать на экзамене):
 *   - Cache First            — кэш → сеть → ошибка. Для статики (HTML/CSS/JS/иконки).
 *   - Network First          — сеть → кэш → ошибка. Для часто меняющегося контента (API, статьи).
 *   - Stale While Revalidate — отдаём из кэша, ПАРАЛЛЕЛЬНО обновляем.
 *   - Cache Only / Network Only — только кэш / только сеть.
 *
 * Почему именно App Shell:
 *   Оболочка маленькая → кэшируется быстро. Грузится из кэша мгновенно.
 *   Контент всегда свежий из сети, а если сети нет — из кэша. Пользователь
 *   видит шапку и меню сразу, контент — чуть позже. Похоже на нативное приложение.
 * ===================================================================== */


/* ---------- 1. Имена кэшей ---------- */

// Версия app-shell. Поднимаем при изменении любого файла из ASSETS,
// чтобы событие activate почистило старый shell-кэш.
//   v1 — практика 13: первая версия.
//   v2 — практика 14: добавлены manifest.json и иконки.
//   v3 — практика 15: разделили оболочку и контент, добавили content/.
//   v4 — практика 16: добавлены обработчики push и notificationclick,
//        обновлены кнопки в index.html (enable-push / disable-push).
const APP_SHELL_CACHE = 'app-shell-v4';

// Версия динамического кэша. Здесь версия отдельная, потому что
// /content/* меняется чаще, чем ASSETS, и его удобно инвалидировать
// независимо от оболочки.
const DYNAMIC_CACHE = 'dynamic-content-v1';


/* ---------- 2. Список ресурсов оболочки (App Shell) ---------- */
//
// В этот список входит ТОЛЬКО то, без чего оболочка не запустится:
// корневой документ, его JS, манифест, иконки. Контент /content/*
// сюда НЕ кладём — он попадёт в DYNAMIC_CACHE по мере посещений.

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
//
// Cache First работает только если оболочка УЖЕ в кэше. Поэтому
// при установке SW мы делаем precache: открываем кэш и addAll-им
// все статические ресурсы.
//
// addAll() атомарен: если хотя бы один файл не загрузился —
// в кэше не остаётся НИ одного. Это защищает от «полу-установленного»
// SW, у которого оболочка работает только частично.
//
// skipWaiting() — переходим в activate сразу, не ждём закрытия
// вкладок со старой версией. Подходит, если новая версия совместима.

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
//
// При активации новой версии SW мы проходим по всем кэшам
// и удаляем те, чьё имя НЕ совпадает ни с APP_SHELL_CACHE,
// ни с DYNAMIC_CACHE. Это убивает остатки прошлых версий
// (например, 'notes-cache-v1' из практики 13).
//
// clients.claim() — берём контроль над уже открытыми вкладками
// сразу, не дожидаясь перезагрузки.

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
//
// Здесь — мозг Service Worker. Для каждого запроса решаем:
//   а) Игнорировать (не наш origin или не GET) — пусть браузер сам.
//   б) Это /content/* → Network First.
//   в) Это всё остальное (наш origin) → Cache First (App Shell).

self.addEventListener('fetch', (event) => {
    const request = event.request;

    // 5.1. Не вмешиваемся в не-GET запросы (POST/PUT/DELETE — например, к API).
    if (request.method !== 'GET') return;

    // 5.2. Парсим URL, чтобы посмотреть на origin и pathname.
    //      `new URL(request.url)` всегда работает для абсолютного URL.
    const url = new URL(request.url);

    // 5.3. Cross-origin — не трогаем (CDN chota и т.п.).
    //      Без этой проверки могли бы сломать загрузку сторонних ресурсов
    //      или заполнить наш кэш чужим мусором.
    if (url.origin !== location.origin) return;

    // 5.4. Динамические страницы /content/* — Network First.
    if (url.pathname.includes('/content/')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // 5.5. Всё остальное — App Shell, Cache First.
    event.respondWith(cacheFirst(request));
});


/* ---------- 6. Стратегия Cache First ---------- */
//
// Алгоритм:
//   1. Ищем запрос в любом из наших кэшей (caches.match без указания имени
//      кэша смотрит во все кэши origin'а).
//   2. Если нашли — отдаём.
//   3. Если нет — идём в сеть и попутно кладём успешный ответ в APP_SHELL_CACHE.
//   4. Если и сеть упала — возвращаем 503 (для критической оболочки
//      такое почти не должно случаться, она вся precache-ится при install).

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const networkResponse = await fetch(request);

        // Кэшируем только успешные ответы того же origin'а.
        if (networkResponse.ok && networkResponse.type === 'basic') {
            const cache = await caches.open(APP_SHELL_CACHE);
            // clone() обязателен: Response — это поток, прочитать можно один раз.
            // Один экземпляр уйдёт в браузер, второй (clone) — в кэш.
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
//
// Алгоритм:
//   1. Идём в сеть. Если ответ ok — отдаём его и кладём копию в DYNAMIC_CACHE.
//   2. Если сеть упала или статус не ok — берём из DYNAMIC_CACHE.
//   3. Если и в кэше нет — возвращаем home.html как fallback.
//      Так пользователь хотя бы увидит «Главную» вместо ошибки.

async function networkFirst(request) {
    const cache = await caches.open(DYNAMIC_CACHE);

    try {
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            // Свежий контент → освежаем кэш.
            cache.put(request, networkResponse.clone());
            return networkResponse;
        }
        // Не упали, но и не успешно (например, 404). Пробуем кэш.
        const cached = await cache.match(request);
        return cached || networkResponse;
    } catch (err) {
        // Полный офлайн. Достаём из кэша последнюю удачную копию.
        const cached = await cache.match(request);
        if (cached) return cached;

        // Совсем нет в кэше — отдадим home.html (он живёт в APP_SHELL_CACHE).
        // Это и есть «фолбек на home», упомянутый в методичке.
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
//
// Полезно, когда новая версия SW «висит» в waiting и нужно её
// активировать без перезагрузки всех вкладок.

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});


/* ---------- 9. push: входящие push-уведомления (практика 16) ---------- */
//
// Что происходит, когда сервер шлёт push:
//   1) Сервер шифрует payload и шлёт POST на endpoint push-сервиса
//      (FCM/Mozilla AutoPush) с подписью VAPID.
//   2) Push-сервис передаёт зашифрованное сообщение браузеру по
//      постоянному соединению (даже если вкладка/браузер закрыты).
//   3) Браузер ПРОБУЖДАЕТ Service Worker (если он спал) и шлёт ему
//      событие 'push' со свежей расшифрованной нагрузкой.
//   4) В обработчике мы ОБЯЗАНЫ показать уведомление через
//      self.registration.showNotification() — это требование браузеров
//      (см. флаг userVisibleOnly: true при subscribe в app.js).
//      Если уведомление не показать, браузер может в будущем отозвать
//      подписку или начать показывать generic-уведомление сам.

self.addEventListener('push', (event) => {
    // event.data может быть null (например, тестовый push без payload).
    // event.data.json() — удобный шорткат: парсит тело как JSON.
    let data = { title: 'Новое уведомление', body: '' };
    if (event.data) {
        try {
            data = event.data.json();
        } catch {
            // Если payload — не JSON, попробуем text().
            data = { title: 'Новое уведомление', body: event.data.text() };
        }
    }

    const options = {
        body:  data.body  || '',
        // icon — большая иконка, отображается слева в уведомлении.
        // badge — маленькая монохромная иконка в статус-баре Android.
        icon:  './icons/icon-192x192.png',
        badge: './icons/icon-48x48.png',
        // data — произвольный объект, доступный потом в notificationclick.
        // Сюда можно положить URL, на который нужно перейти по клику.
        data:  { url: './', original: data },
        // tag — позволяет «схлопывать» уведомления в одно: если с тем же
        // тегом придёт ещё одно уведомление, старое заменится новым,
        // а не добавится рядом. Удобно для счётчиков, статусов и т.п.
        tag:   'notes-task',
        // renotify: true — даже если тег совпал, заставит браузер
        // вибрировать/пиликать снова (а не молча обновить старое).
        renotify: true,
    };

    // event.waitUntil — продлевает жизнь события, пока промис не завершится.
    // Без него браузер может «уснуть» SW в середине показа уведомления.
    event.waitUntil(
        self.registration.showNotification(
            data.title || 'Новое уведомление',
            options
        )
    );
});


/* ---------- 10. notificationclick: клик по push (практика 16) ---------- */
//
// Когда пользователь кликает по уведомлению, браузер шлёт SW событие
// 'notificationclick'. Хорошая практика — сфокусировать уже открытую
// вкладку приложения или открыть новую, если ни одной нет.

self.addEventListener('notificationclick', (event) => {
    // Закрываем уведомление вручную (по умолчанию оно остаётся в шторке).
    event.notification.close();

    const targetUrl = (event.notification.data && event.notification.data.url) || './';

    event.waitUntil(
        // clients.matchAll возвращает все вкладки, контролируемые этим SW.
        // Ищем уже открытую и фокусируем её — иначе открываем новое окно.
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    // Если такая вкладка уже есть — фокус на неё.
                    if ('focus' in client) {
                        return client.focus();
                    }
                }
                // Иначе открываем новое окно.
                if (self.clients.openWindow) {
                    return self.clients.openWindow(targetUrl);
                }
            })
    );
});
