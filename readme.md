Практическая работа №13: Service Worker и офлайн-приложение «Заметки»
Цель: Изучение технологии Service Worker для создания офлайн-функционала, кэширования статических ресурсов и перехвата сетевых запросов.
Что добавлено (отдельный модуль notes-app/):
Структура проекта:
    notes-app/index.html — разметка формы и списка заметок, индикатор online/offline.
    notes-app/app.js     — логика заметок (localStorage), регистрация Service Worker.
    notes-app/sw.js      — Service Worker (install / activate / fetch / message).
    notes-app/package.json — скрипт `npm start` для запуска через `http-server`.

Регистрация Service Worker:
    После события window.load вызывается navigator.serviceWorker.register('./sw.js').
    Регистрация откладывается до load, чтобы не конкурировать с первичной отрисовкой.
    Перед регистрацией проверяется поддержка ('serviceWorker' in navigator).

Жизненный цикл SW:
    install   — открываем кэш (`notes-cache-v1`) и кладём «оболочку» приложения
                (./, ./index.html, ./app.js) методом cache.addAll. Затем
                self.skipWaiting() — не ждём закрытия старых вкладок.
    activate  — перебираем все имеющиеся кэши и удаляем версии, не совпадающие
                с текущим CACHE_NAME. self.clients.claim() даёт SW взять
                под контроль уже открытые вкладки без перезагрузки.
    fetch     — стратегия Cache First, fallback to Network: сначала ищем в кэше,
                при промахе идём в сеть, успешный ответ кладём обратно в кэш
                (через response.clone()). Если и сеть, и кэш недоступны для
                навигационного запроса — возвращаем index.html, чтобы хотя бы
                оболочка отрисовалась.
    message   — пример обработки postMessage: команда SKIP_WAITING.

Хранение данных:
    Заметки сохраняются в localStorage по ключу 'notes' в виде JSON-массива
    объектов { id, text, createdAt }. Данные доступны и онлайн, и офлайн —
    просмотр и добавление работают без сети.

UI/UX-детали:
    Делегирование клика по списку (один listener на UL) для корректной
    работы кнопки удаления после полной перерисовки списка.
    Экранирование текста заметки (escapeHtml) для защиты от XSS.
    Индикатор сети, переключающийся по событиям window 'online'/'offline'.

Запуск:
    Service Worker не работает на протоколе file://. Нужен HTTP/HTTPS.
    Из папки notes-app/: `npm start` (поднимает http-server на порту 5173,
    флаг -c-1 отключает кэш самого сервера, чтобы не мешал нашему SW).
    Проверка: DevTools → Application → Service Workers (статус «activated»),
    Cache Storage → notes-cache-v1. Затем Network → Offline → Reload —
    страница и заметки продолжают работать.


Практическая работа №14: Web App Manifest (PWA)
Цель: Превратить офлайн-приложение «Заметки» из практики 13 в полноценное Progressive Web App, которое можно установить на устройство, запустить в отдельном окне и интегрировать с операционной системой.
Что добавлено в модуль notes-app/:

Файл `notes-app/manifest.json` со следующими полями:
    name             — «Мои заметки — офлайн PWA» (полное имя в установке).
    short_name       — «Заметки» (под иконкой на главном экране).
    description      — текст для магазинов приложений и подсказок.
    start_url        — `./?utm_source=pwa` (UTM-метка отслеживает запуски через PWA).
    scope            — `./` (какие страницы считаются частью приложения).
    display          — `standalone` (запуск без UI браузера, как обычное приложение).
    orientation      — `portrait-primary` (фиксируем книжную ориентацию).
    background_color — `#ffffff` (цвет splash screen, до загрузки JS).
    theme_color      — `#4285f4` (цвет адресной строки и панели задач PWA).
    icons[]          — 9 PNG-иконок от 16x16 до 512x512.
                       У 512x512 указано `purpose: "any maskable"` —
                       значит ОС может обрезать её под форму своих иконок (круг и т.п.).
    lang/dir         — `ru` / `ltr`.

Набор иконок `notes-app/icons/`:
    Сгенерированы скриптом `notes-app/scripts/generate-icons.ps1` через
    .NET-классы System.Drawing (без сторонних зависимостей):
    16, 32, 48, 64, 128, 152, 192, 256, 512 пикселей.
    Дизайн: синий фон #4285f4 со скруглёнными углами + белая буква «Н» по центру.
    Перегенерация: `powershell -ExecutionPolicy Bypass -File .\notes-app\scripts\generate-icons.ps1`.

Подключение в `index.html` (блок PWA в `<head>`):
    <link rel="manifest" href="./manifest.json">     — главная связь с манифестом.
    <meta name="theme-color">                         — синхронизирован с манифестом.
    <meta name="mobile-web-app-capable" content="yes"> — Android: запуск без UI браузера.
    <meta name="apple-mobile-web-app-capable">         — iOS: то же, но Safari читает только этот тег.
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Заметки"> — имя под иконкой на iOS.
    <link rel="apple-touch-icon" href="./icons/icon-152x152.png"> — iOS не читает icons[] из манифеста.
    <link rel="icon" sizes="32x32" /> и <link rel="icon" sizes="16x16" /> — favicon для вкладки.

Service Worker `sw.js` (обновлён до v2):
    CACHE_VERSION поднят с `v1` до `v2` — это триггер для события `activate`,
    в котором старый кэш `notes-cache-v1` будет удалён, а новый собран заново
    с уже расширенным набором ресурсов.
    В ASSETS добавлены: `./manifest.json` и все 9 файлов из `./icons/`.
    Это гарантирует, что установленное PWA, запущенное офлайн,
    получит и манифест, и все иконки из кэша.

Тестирование (DevTools → Application):
    - Manifest: видны все поля и иконки 16-512 без ошибок.
    - Service Workers: статус «activated and is running», версия v2.
    - Cache Storage → notes-cache-v2: 13 файлов (HTML/JS/manifest + 9 иконок).
    - Network → Offline → Reload: приложение запускается из кэша.
    - В адресной строке Chrome появляется значок «Установить приложение».
    - После установки PWA открывается в отдельном окне без UI браузера,
      ярлык с иконкой попадает в меню «Пуск» / на рабочий стол.



Практическая работа №15: HTTPS + App Shell
Цель: Перевести приложение «Заметки» на локальный HTTPS (как в реальном продакшене) и применить архитектуру App Shell — мгновенная загрузка каркаса + динамическая подгрузка контента.
Что добавлено и изменено в notes-app/:
Архитектура App Shell:
    index.html стал «оболочкой» — содержит ТОЛЬКО шапку, навигацию (две кнопки)
    и пустой контейнер <main id="app-content">. Никакой логики страниц внутри.
    Папка `content/` — динамические фрагменты, подгружаемые через fetch:
        content/home.html  — форма + список заметок (то, что раньше было в index.html).
        content/about.html — страница «О приложении» с описанием версий и стратегий.
    Каждый фрагмент — это «кусок» HTML без <html>/<head>/<body>, который JS
    вставляет в #app-content через innerHTML.

Клиентский роутинг (`app.js`):
    Кнопки «Главная» / «О приложении» имеют data-page; клик вызывает
    loadContent(page), которая делает fetch('./content/<page>.html'),
    вставляет полученный HTML в #app-content и переключает active-класс.
    После загрузки 'home' дополнительно вызывается initNotes() — инициализация
    формы и списка. Это важно: при каждом innerHTML обработчики теряются
    вместе со старыми DOM-узлами, поэтому навешиваем их заново.

Service Worker — две стратегии и два кэша (`sw.js`):
    APP_SHELL_CACHE = 'app-shell-v3'    — версия поднята с v2 на v3
                                          (структура изменилась — добавили content/).
    DYNAMIC_CACHE  = 'dynamic-content-v1' — отдельный кэш для фрагментов /content/*.

    Cache First для всего, что НЕ /content/* (HTML/JS/иконки/манифест):
        1. Ищем в кэше → отдаём.
        2. Иначе fetch и попутное кэширование успешного ответа.
        3. На ошибке — Response 503.
    Применима для статики, потому что она редко меняется и кэшировать её —
    самый быстрый способ получить мгновенную загрузку.

    Network First для /content/*:
        1. fetch → если ok, отдаём и обновляем DYNAMIC_CACHE (clone()).
        2. На ошибке/офлайне — берём из DYNAMIC_CACHE.
        3. Если и там нет — fallback на ./content/home.html (или index.html).
    Подходит для динамики: пользователь видит свежую версию, а офлайн —
    последнюю успешно загруженную копию.

    Cross-origin запросы (chota CDN и т.п.) пропускаются через
    `if (url.origin !== location.origin) return` — не вмешиваемся в чужие домены.

Локальный HTTPS:
    Скрипт `notes-app/scripts/generate-cert.sh` генерирует пару ключей
    в корне репозитория (`localhost.pem`, `localhost-key.pem`):
        - Если установлен **mkcert** — выпускает доверенный сертификат
          (без жёлтого предупреждения в браузере).
        - Иначе fallback на **openssl**: самоподписанный, нужен «Перейти на сайт».
    В `.gitignore` добавлены `*.pem`, `*.key`, `*.crt` — ключи в репозиторий не идут.
    Subject Alternative Name включает `DNS:localhost`, `IP:127.0.0.1`, `IP:::1`.

npm-скрипты в `notes-app/package.json`:
    npm start          — обычный HTTP на 5173 (для быстрой проверки).
    npm run cert       — сгенерировать TLS-ключи в корне репо.
    npm run start:https — HTTPS на 3000 с ключами `../localhost*.pem` (как в методичке).

Тестирование (DevTools → Application):
    - Запустить: `cd notes-app && npm run cert && npm run start:https`,
      открыть https://localhost:3000.
    - Service Workers: статус «activated», версия app-shell-v3.
    - Cache Storage: видны ДВА кэша — `app-shell-v3` и `dynamic-content-v1`.
    - Network → Slow 3G → Reload: каркас (шапка + меню) появляется мгновенно
      из app-shell-кэша, контент подтягивается через мгновение.
    - Network → Offline → Reload: приложение полностью работает из кэшей,
      можно переключать вкладки и добавлять заметки.
    - Изменить текст в content/about.html, обновить страницу онлайн —
      увидеть свежую версию (Network First). Уйти в офлайн — увидеть
      последнюю кэшированную копию.




Практическая работа №16: WebSocket (Socket.IO) + Web Push
Цель: Добавить в приложение «Заметки» серверную часть с двусторонним обменом в реальном времени (через WebSocket / Socket.IO) и доставкой push-уведомлений браузеру даже когда вкладка закрыта.
Что добавлено:

Серверная часть `notes-server/` (новый модуль):
    server.js     — Express + Socket.IO + web-push.
        * Раздаёт статику клиента из ../notes-app.
        * Эндпоинт GET /vapidPublicKey  — возвращает публичный VAPID-ключ.
        * Эндпоинт POST /subscribe      — сохраняет push-подписку (Map по endpoint).
        * Эндпоинт POST /unsubscribe    — удаляет подписку по endpoint.
        * WebSocket: при событии `newTask` от клиента
            a) рассылает `taskAdded` всем клиентам через io.emit;
            b) шлёт push всем подписчикам через webpush.sendNotification.
        * Удаляет «протухшие» подписки при ответе 404/410 от push-сервиса.

    scripts/generate-vapid.js — генератор пары VAPID-ключей.
        Запускается командой `npm run vapid`. Если .env уже существует,
        кладёт новые ключи в .env.new (чтобы случайно не потерять рабочие).

    package.json — зависимости (express, socket.io, web-push, body-parser, cors, dotenv).
        Скрипты: `npm start`, `npm run dev` (Node 24 --watch), `npm run vapid`.

    .env.example — шаблон переменных. Реальный .env в .gitignore.

Изменения в клиенте `notes-app/`:
    index.html
        * Кнопки <button id="enable-push"> / <button id="disable-push">
          добавлены в каркас (footer.push-controls), чтобы быть видны
          на всех вкладках App Shell.
        * Подключена клиентская библиотека Socket.IO с CDN
          (`https://cdn.socket.io/4.7.5/socket.io.min.js`) с проверкой
          SRI integrity. Версия совпадает с серверной (4.7.x).

    app.js
        * Автоопределение SERVER_URL: пустая строка, если страница
          открыта самим notes-server (порт 3001), иначе явный URL.
        * Подключение WebSocket: `socket = io(SERVER_URL || undefined)`,
          обработчики connect/disconnect/connect_error.
        * Обработчик `socket.on('taskAdded')` показывает кратковременный
          toast в правом верхнем углу.
        * В обработчике form.submit: после сохранения в localStorage
          вызывается `socket.emit('newTask', { text, timestamp })`.
        * urlBase64ToUint8Array — конвертер VAPID base64-url → Uint8Array
          (формат, требуемый PushManager.subscribe).
        * fetchVapidPublicKey — получает публичный ключ от сервера,
          чтобы клиенту не приходилось его хардкодить.
        * subscribeToPush:
            - проверяет support (serviceWorker, PushManager);
            - получает publicKey;
            - registration.pushManager.subscribe({ userVisibleOnly: true,
              applicationServerKey });
            - POST /subscribe с подпиской.
        * unsubscribeFromPush — POST /unsubscribe + subscription.unsubscribe().
        * Логика кнопок: проверка Notification.permission, запрос
          разрешения через requestPermission(), переключение видимости.

    sw.js (поднята версия app-shell с v3 на v4)
        * Обработчик 'push':
            - читает event.data через .json() (с fallback на text());
            - showNotification(title, { body, icon, badge, tag, renotify, data }).
        * Обработчик 'notificationclick':
            - notification.close();
            - clients.matchAll → focus или openWindow на ./

Безопасность и секреты:
    - .env с приватным VAPID-ключом исключён из репозитория (.gitignore).
    - В клиенте используется только ПУБЛИЧНЫЙ ключ, полученный
      через GET /vapidPublicKey. Приватный никогда не покидает сервер.

Запуск и тестирование:
    cd notes-server
    npm install
    npm run vapid      # один раз — создаёт .env с VAPID-ключами
    npm start          # запускает сервер на http://localhost:3001
    # затем в браузере: http://localhost:3001/

    Проверка:
    1. Открыть приложение в двух вкладках браузера.
    2. В первой вкладке нажать «Включить уведомления», разрешить.
    3. Добавить задачу в первой вкладке.
       — Во второй вкладке появится toast (через WebSocket).
       — Если первую вкладку свернуть/закрыть — придёт системное push.
    4. «Отключить уведомления» — push перестают приходить, toast (WebSocket)
       продолжает работать.


Практическая работа №17: Детализация Push (напоминания + snooze)
Цель: Расширить push-функционал — заметки с конкретным временем напоминания, запланированные на сервере, и возможность отложить уведомление на 5 минут прямо из шторки уведомлений (action-кнопка).

Что добавлено:
Клиент `notes-app/`:
    content/home.html
        * Вторая форма #reminder-form: текстовое поле + <input type="datetime-local">.
        * datetime-local — нативный пикер даты/времени, возвращает строку
          в локальном времени без зоны (например '2026-05-10T17:30').
        * Конвертация в UNIX-ms: `new Date(value).getTime()`.

    app.js
        * Структура заметки расширена полем reminder (UNIX-ms или null).
        * Универсальная addNote(text, reminderTimestamp = null):
            - сохраняет в localStorage с уникальным id (Date.now);
            - если reminderTimestamp есть → socket.emit('newReminder', {id,text,reminderTime});
            - иначе → socket.emit('newTask', ...) как раньше.
        * Валидация: reminder в прошлом — alert и отказ.
        * В render() заметки с reminder подсвечены бейджем «🔔 <дата>».

    index.html
        * Добавлен стиль .reminder-badge (жёлтая «таблетка» рядом с текстом).

    sw.js (версия app-shell поднята v4 → v5)
        * Обработчик 'push':
            - извлекает reminderId из payload;
            - tag индивидуальный (`reminder-${reminderId}`), чтобы разные
              напоминания не схлопывались в одно;
            - actions: [{ action: 'snooze', title: 'Отложить на 5 минут' }]
              добавляются ТОЛЬКО для уведомлений с reminderId;
            - reminderId сохранён в notification.data.
        * Обработчик 'notificationclick':
            - if (event.action === 'snooze') → POST /snooze?reminderId=...;
            - иначе — закрыть уведомление и сфокусировать вкладку приложения.

Сервер `notes-server/`:
    server.js
        * Map<reminderId, { timeoutId, text, reminderTime }> — хранилище
          запланированных напоминаний.
        * scheduleReminder({id, text, reminderTime}):
            - проверяет delay > 0 и delay ≤ 2^31-1 ms (~24.85 суток —
              ограничение setTimeout);
            - clearTimeout если по этому id уже был таймер;
            - setTimeout с колбэком, который шлёт push всем подписчикам
              с payload { title:'🔔 Напоминание', body:text, reminderId };
            - после срабатывания удаляет запись из Map.
        * Обработчик socket.on('newReminder') — валидирует поля и зовёт
          scheduleReminder.
        * POST /snooze?reminderId=...:
            - находит запись, делает clearTimeout старого таймера;
            - вызывает scheduleReminder с reminderTime = Date.now() + 5*60*1000.

