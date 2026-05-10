Практическая работа №13: Service Worker и офлайн-приложение «Заметки»

Цель: Изучение технологии Service Worker для создания офлайн-функционала, кэширования статических ресурсов и перехвата сетевых запросов.

Что добавлено (отдельный модуль `notes-app/`):

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