/* =====================================================================
 * app.js — клиентская логика App Shell приложения «Заметки».
 * Практическое занятие №15. App Shell + HTTPS.
 * =====================================================================
 *
 * Что делает этот файл (по слоям):
 *   СЛОЙ 1. РОУТИНГ ОБОЛОЧКИ (App Shell):
 *     - Слушает клики по кнопкам в <nav class="tabs">.
 *     - По клику зовёт loadContent('home'|'about').
 *     - loadContent() делает fetch('./content/<page>.html'), вставляет
 *       полученный HTML в <main id="app-content"> и активирует кнопку.
 *
 *   СЛОЙ 2. ИНИЦИАЛИЗАЦИЯ КОНТЕНТА:
 *     - Когда подгружен фрагмент 'home', нужно «оживить» форму:
 *       найти #note-form, навесить submit-обработчик, отрисовать заметки.
 *     - Это делает initNotes() — её вызываем после каждой подстановки home.html.
 *
 *   СЛОЙ 3. ХРАНИЛИЩЕ ЗАМЕТОК (localStorage):
 *     - getNotes / saveNotes / addNote / deleteNote / renderNotes —
 *       те же, что и в практике 13, переехали внутрь initNotes().
 *
 *   СЛОЙ 4. ИНДИКАТОР СЕТИ + регистрация Service Worker.
 *
 * Архитектурный нюанс «делегирование событий»:
 *   Каждый раз при переключении вкладки innerHTML заменяется целиком —
 *   старые обработчики теряются ВМЕСТЕ с DOM-элементами. Поэтому
 *   обработчики формы и кнопок удаления вешаем не на сами элементы
 *   (которые могут не существовать), а на родителя — это называется
 *   «делегирование событий». В этом файле мы каждый раз заново вызываем
 *   initNotes(), что для учебной задачи проще и нагляднее.
 * ===================================================================== */


/* ---------- 1. Ссылки на ЭЛЕМЕНТЫ ОБОЛОЧКИ ---------- */
//
// Эти элементы живут в index.html и НЕ удаляются при смене вкладок,
// поэтому ссылки можно получить один раз на старте.
const contentDiv    = document.getElementById('app-content');
const homeBtn       = document.getElementById('home-btn');
const aboutBtn      = document.getElementById('about-btn');
const networkStatus = document.getElementById('network-status');


/* ---------- 2. РОУТИНГ оболочки ---------- */

/**
 * Делает одну кнопку активной в навигации.
 * Одно место правды — никаких «активных» классов в HTML, всё через JS.
 */
function setActiveButton(activeBtn) {
    [homeBtn, aboutBtn].forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
}

/**
 * Загружает фрагмент с сервера и подставляет его в <main>.
 *
 * Стратегия здесь — Network First НА СТОРОНЕ КЛИЕНТА: мы просто
 * вызываем fetch, а решение «брать из сети или из кэша» принимает
 * Service Worker (см. sw.js, обработчик 'fetch' для /content/*).
 *
 * Что важно для экзамена:
 *   - fetch() возвращает Promise<Response>.
 *   - response.ok === false (например, 404) НЕ кидает исключение —
 *     поэтому проверяем явно и кидаем сами, чтобы попасть в catch.
 *   - response.text() читает тело как строку (можно ещё .json(), .blob()).
 */
async function loadContent(page) {
    // Показываем «скелетон» сразу — пользователь видит реакцию на клик.
    contentDiv.innerHTML = '<p class="loading">Загрузка…</p>';

    try {
        const response = await fetch(`./content/${page}.html`);

        // Проверка статуса. Без этого 404/500 «протекут» в innerHTML
        // как HTML-страница ошибки, что некрасиво.
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        contentDiv.innerHTML = html;

        // После того как DOM фрагмента уже в документе —
        // навешиваем обработчики на ЕГО элементы.
        if (page === 'home') {
            initNotes();
        }
    } catch (err) {
        // Сюда попадаем, если: сеть упала, SW не смог достать из кэша
        // и не выполнился fallback (на /content/home.html в sw.js),
        // либо вернулся !ok статус.
        console.error('[app] Не удалось загрузить контент:', err);
        contentDiv.innerHTML =
            '<p class="loading" style="color: #c00;">Не удалось загрузить страницу.</p>';
    }
}

// Кликам по вкладкам соответствует переключение фрагмента.
homeBtn.addEventListener('click', () => {
    setActiveButton(homeBtn);
    loadContent('home');
});
aboutBtn.addEventListener('click', () => {
    setActiveButton(aboutBtn);
    loadContent('about');
});


/* ---------- 3. ЗАМЕТКИ (localStorage + работа с DOM фрагмента) ---------- */
//
// Все функции работы с заметками сидят ВНУТРИ initNotes(): так они
// получают свежие ссылки на DOM-элементы, которые только что появились
// в документе после fetch. Если бы мы взяли getElementById на верхнем
// уровне модуля — там бы было null до первой загрузки home.html.

const STORAGE_KEY = 'notes';

/**
 * Инициализация формы и списка заметок.
 * Вызывается каждый раз после loadContent('home').
 */
function initNotes() {
    const form  = document.getElementById('note-form');
    const input = document.getElementById('note-input');
    const list  = document.getElementById('notes-list');

    // Если по какой-то причине разметки нет (например, фрагмент не загрузился) —
    // тихо выходим, чтобы не упасть с TypeError.
    if (!form || !input || !list) return;

    // ---- Чтение / запись заметок в localStorage ----
    function getNotes() {
        const raw = localStorage.getItem(STORAGE_KEY) || '[]';
        try { return JSON.parse(raw); }
        catch { return []; }   // битый JSON — считаем, что список пуст
    }
    function saveNotes(notes) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    }

    // ---- Рендер списка ----
    function render() {
        const notes = getNotes();
        if (notes.length === 0) {
            list.innerHTML = '<li><i>Пока нет заметок. Добавьте первую сверху ↑</i></li>';
            return;
        }
        // Полная перерисовка проще, чем точечные правки DOM.
        list.innerHTML = notes
            .map(note => `
                <li data-id="${note.id}">
                    <span>
                        ${escapeHtml(note.text)}
                        <span class="meta"> — ${formatDate(note.createdAt)}</span>
                    </span>
                    <button class="delete-btn" data-id="${note.id}">Удалить</button>
                </li>
            `)
            .join('');
    }

    // ---- Защита от XSS: экранируем текст пользователя перед innerHTML ----
    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function formatDate(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleString('ru-RU');
    }

    // ---- Submit формы — добавление заметки ----
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;

        const notes = getNotes();
        notes.push({
            id: Date.now(),                       // простой уникальный id
            text,
            createdAt: new Date().toISOString(),
        });
        saveNotes(notes);
        input.value = '';
        input.focus();
        render();
    });

    // ---- Делегирование клика по списку — кнопка «Удалить» ----
    list.addEventListener('click', (e) => {
        const btn = e.target.closest('.delete-btn');
        if (!btn) return;
        const id = Number(btn.dataset.id);
        saveNotes(getNotes().filter(n => n.id !== id));
        render();
    });

    // Первая отрисовка — чтобы сразу показать сохранённые заметки.
    render();
}


/* ---------- 4. Индикатор online / offline ---------- */

function updateNetworkStatus() {
    if (!networkStatus) return;
    if (navigator.onLine) {
        networkStatus.textContent = 'онлайн';
        networkStatus.className   = 'online';
    } else {
        networkStatus.textContent = 'офлайн (контент из кэша)';
        networkStatus.className   = 'offline';
    }
}
window.addEventListener('online',  updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);


/* ---------- 5. Инициализация при старте ---------- */

updateNetworkStatus();
loadContent('home');   // первой загружаем «Главную»


/* ---------- 6. Регистрация Service Worker ---------- */
//
// Service Worker регистрируется только по HTTPS (или localhost).
// Для практики 15 это особенно важно — методичка просит запускать
// приложение по https://localhost:3000 через mkcert + http-server --ssl.

if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log('[app] Service Worker зарегистрирован. Scope:', registration.scope);
        } catch (err) {
            console.error('[app] Ошибка регистрации Service Worker:', err);
        }
    });
} else {
    console.warn('[app] Service Worker не поддерживается этим браузером.');
}
