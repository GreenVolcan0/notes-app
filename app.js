/* =====================================================================
 * app.js — клиентская логика приложения «Заметки»
 * Практическое занятие №13. Service Worker.
 * =====================================================================
 *
 * За что отвечает этот файл:
 *   1) Работа с DOM (форма + список заметок).
 *   2) Хранение заметок в localStorage (синхронный key/value-стор браузера,
 *      ~5 МБ, переживает закрытие вкладки и работает без сети).
 *   3) Регистрация Service Worker'а sw.js.
 *   4) Индикатор online/offline (события window.online / window.offline).
 *
 * Почему именно localStorage, а не fetch к серверу:
 *   - задание явно требует localStorage;
 *   - localStorage доступен и онлайн, и офлайн;
 *   - для более серьёзных приложений на практике используют IndexedDB
 *     (асинхронное API, поддержка структурированных данных, гораздо больший объём).
 * ===================================================================== */


/* ---------- 1. Получаем ссылки на элементы DOM ---------- */
//
// Делаем это ОДИН раз на старте, чтобы потом не дёргать getElementById
// в каждом обработчике. Так быстрее и читабельнее.
const form          = document.getElementById('note-form');
const input         = document.getElementById('note-input');
const list          = document.getElementById('notes-list');
const networkStatus = document.getElementById('network-status');


/* ---------- 2. Работа с хранилищем (localStorage) ---------- */
//
// localStorage хранит ТОЛЬКО строки. Поэтому массив заметок мы
// сериализуем через JSON.stringify, а при чтении парсим JSON.parse.
//
// Структура одной заметки:
//   { id: number, text: string, createdAt: string (ISO-дата) }
//
// id нужен, чтобы можно было удалять конкретную заметку
// (по индексу было бы хрупко: после удаления индексы съезжают).

const STORAGE_KEY = 'notes';

/**
 * Возвращает массив всех заметок из localStorage.
 * Если ключа нет (первый запуск) — вернёт [].
 */
function getNotes() {
    // localStorage.getItem возвращает либо строку, либо null.
    // '|| "[]"' — подстраховка: если null, считаем пустым массивом.
    const raw = localStorage.getItem(STORAGE_KEY) || '[]';
    try {
        return JSON.parse(raw);
    } catch (e) {
        // Если в localStorage оказался битый JSON — не валим приложение,
        // а просто считаем, что заметок нет. На экзамене такие
        // защитные ветки ценят: код устойчивее к мусорным данным.
        console.warn('Не удалось распарсить заметки из localStorage:', e);
        return [];
    }
}

/**
 * Сохраняет массив заметок в localStorage.
 * Любое изменение (добавили / удалили) проходит через эту функцию,
 * чтобы место записи было одно — проще отлаживать.
 */
function saveNotes(notes) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}


/* ---------- 3. Рендер списка заметок ---------- */
//
// Полностью перерисовываем список при каждом изменении.
// Для маленького учебного приложения это проще и надёжнее, чем
// пытаться хирургически добавлять/удалять <li> в DOM.

function renderNotes() {
    const notes = getNotes();

    // Если заметок нет, показываем подсказку, чтобы пустой экран не пугал.
    if (notes.length === 0) {
        list.innerHTML = '<li><i>Пока нет заметок. Добавьте первую сверху ↑</i></li>';
        return;
    }

    // Собираем HTML для всех заметок одной строкой и за один раз
    // присваиваем innerHTML. Это быстрее, чем appendChild в цикле.
    //
    // ВНИМАНИЕ к XSS-безопасности:
    // note.text — это пользовательский ввод. Если просто подставить его
    // в innerHTML, кто-то сможет ввести «<img src=x onerror=alert(1)>»
    // и выполнить произвольный JS. Поэтому экранируем текст функцией
    // escapeHtml ниже.
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

/**
 * Экранирует HTML-спецсимволы, чтобы текст безопасно подставлялся в innerHTML.
 * Это самая частая защита от XSS при ручной работе с DOM.
 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Превращает ISO-дату в красивую локальную строку, например «10.05.2026, 14:32».
 * Если по какой-то причине даты нет — просто вернём пустую строку.
 */
function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('ru-RU');
}


/* ---------- 4. CRUD-операции над заметками ---------- */

/**
 * Добавляет новую заметку и сразу обновляет UI.
 */
function addNote(text) {
    const notes = getNotes();
    notes.push({
        // Date.now() в качестве id даёт уникальное число (миллисекунды
        // с 1970 года). Для учебного проекта этого достаточно;
        // в проде взяли бы UUID.
        id: Date.now(),
        text: text,
        createdAt: new Date().toISOString(),
    });
    saveNotes(notes);
    renderNotes();
}

/**
 * Удаляет заметку по id.
 */
function deleteNote(id) {
    // id из data-атрибута приходит строкой, поэтому приводим к Number,
    // иначе строгое сравнение не сработает.
    const numericId = Number(id);
    const notes = getNotes().filter(n => n.id !== numericId);
    saveNotes(notes);
    renderNotes();
}


/* ---------- 5. Обработчики событий формы и списка ---------- */

// Отправка формы — добавление новой заметки.
form.addEventListener('submit', (e) => {
    // preventDefault, потому что <form> по умолчанию перезагружает страницу.
    e.preventDefault();

    const text = input.value.trim();
    if (!text) return; // на всякий случай (на input стоит required, но всё же)

    addNote(text);
    input.value = '';   // очищаем поле, чтобы можно было сразу ввести следующее
    input.focus();      // и возвращаем фокус — мелочь, а UX заметно лучше
});

// Делегирование событий: один слушатель на весь список,
// вместо персонального обработчика на каждую кнопку.
// Это особенно важно, потому что список перерисовывается целиком —
// иначе пришлось бы навешивать обработчики заново после каждого render.
list.addEventListener('click', (e) => {
    const btn = e.target.closest('.delete-btn');
    if (!btn) return; // клик не по кнопке удаления — игнорируем
    deleteNote(btn.dataset.id);
});


/* ---------- 6. Индикатор online / offline ---------- */
//
// Браузер сам стреляет события 'online' и 'offline' на window,
// когда меняется состояние сети. Также есть navigator.onLine
// (свойство, которое можно прочитать в любой момент).

function updateNetworkStatus() {
    if (navigator.onLine) {
        networkStatus.textContent = 'онлайн';
        networkStatus.className   = 'online';
    } else {
        networkStatus.textContent = 'офлайн (страница из кэша)';
        networkStatus.className   = 'offline';
    }
}

window.addEventListener('online',  updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);


/* ---------- 7. Инициализация при загрузке ---------- */

renderNotes();          // сразу нарисуем сохранённые ранее заметки
updateNetworkStatus();  // и поставим правильный индикатор сети


/* ---------- 8. Регистрация Service Worker ---------- */
//
// Регистрация — это «знакомство» страницы с воркером.
// Шаги:
//   1) Проверяем поддержку — старые браузеры не знают про serviceWorker.
//   2) Регистрируем после события 'load': SW и его внутренние fetch'и
//      не должны конкурировать с первичной загрузкой ресурсов страницы.
//   3) navigator.serviceWorker.register(url, options) возвращает
//      Promise<ServiceWorkerRegistration>.
//
// Параметр { scope: '/' } говорит, какие URL воркер сможет контролировать.
// По умолчанию scope = директория, в которой лежит файл sw.js.
// Если положить sw.js в корень и не задавать scope — он будет управлять
// всем сайтом, что нам и нужно.

if ('serviceWorker' in navigator) {
    // Ждём 'load', чтобы регистрация SW не тормозила первый показ страницы.
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log(
                '[app] Service Worker зарегистрирован. Scope:',
                registration.scope
            );
        } catch (err) {
            // Самые частые причины ошибки:
            //   - открыли страницу через file:// (нужен http/https);
            //   - неправильный путь до sw.js;
            //   - синтаксическая ошибка внутри sw.js — он не парсится.
            console.error('[app] Ошибка регистрации Service Worker:', err);
        }
    });
} else {
    console.warn('[app] Service Worker не поддерживается этим браузером.');
}
