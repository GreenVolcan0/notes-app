const SERVER_URL = (location.port === '3001' || location.hostname === '')
    ? ''                              
    : 'http://localhost:3001';       


/* ---------- 2. DOM-элементы оболочки ---------- */

const contentDiv    = document.getElementById('app-content');
const homeBtn       = document.getElementById('home-btn');
const aboutBtn      = document.getElementById('about-btn');
const networkStatus = document.getElementById('network-status');
const enablePushBtn  = document.getElementById('enable-push');
const disablePushBtn = document.getElementById('disable-push');


/* ---------- 3. РОУТИНГ оболочки (как в практике 15) ---------- */

function setActiveButton(activeBtn) {
    [homeBtn, aboutBtn].forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
}

async function loadContent(page) {
    contentDiv.innerHTML = '<p class="loading">Загрузка…</p>';
    try {
        const response = await fetch(`./content/${page}.html`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        contentDiv.innerHTML = await response.text();
        if (page === 'home') initNotes();
    } catch (err) {
        console.error('[app] Не удалось загрузить контент:', err);
        contentDiv.innerHTML =
            '<p class="loading" style="color: #c00;">Не удалось загрузить страницу.</p>';
    }
}

homeBtn.addEventListener('click', () => {
    setActiveButton(homeBtn);
    loadContent('home');
});
aboutBtn.addEventListener('click', () => {
    setActiveButton(aboutBtn);
    loadContent('about');
});


/* ---------- 4. ЗАМЕТКИ (localStorage) ---------- */

const STORAGE_KEY = 'notes';

function initNotes() {
    const form  = document.getElementById('note-form');
    const input = document.getElementById('note-input');

    const reminderForm = document.getElementById('reminder-form');
    const reminderText = document.getElementById('reminder-text');
    const reminderTime = document.getElementById('reminder-time');

    const list = document.getElementById('notes-list');
    if (!form || !input || !list) return;

    const getNotes  = () => {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
        catch { return []; }
    };
    const saveNotes = (n) => localStorage.setItem(STORAGE_KEY, JSON.stringify(n));

    function render() {
        const notes = getNotes();
        if (notes.length === 0) {
            list.innerHTML = '<li><i>Пока нет заметок. Добавьте первую сверху ↑</i></li>';
            return;
        }
        list.innerHTML = notes.map(note => {
            const reminderInfo = note.reminder
                ? `<span class="reminder-badge">🔔 ${new Date(note.reminder).toLocaleString('ru-RU')}</span>`
                : '';
            return `
                <li data-id="${note.id}">
                    <span>
                        ${escapeHtml(note.text)}
                        <span class="meta"> — ${formatDate(note.createdAt)}</span>
                        ${reminderInfo}
                    </span>
                    <button class="delete-btn" data-id="${note.id}">Удалить</button>
                </li>
            `;
        }).join('');
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function formatDate(iso) {
        return iso ? new Date(iso).toLocaleString('ru-RU') : '';
    }

    /**
     * Универсальное добавление заметки.
     * @param {string} text Содержимое заметки.
     * @param {number|null} reminderTimestamp UNIX-ms или null, если без напоминания.
     */
    function addNote(text, reminderTimestamp = null) {
        const note = {
            id: Date.now(),                       // используем как уникальный id
            text,
            createdAt: new Date().toISOString(),
            reminder: reminderTimestamp || null,  // null = обычная заметка
        };

        const notes = getNotes();
        notes.push(note);
        saveNotes(notes);
        render();

        if (socket && socket.connected) {
            if (reminderTimestamp) {
                socket.emit('newReminder', {
                    id: note.id,
                    text,
                    reminderTime: reminderTimestamp,
                });
            } else {
                socket.emit('newTask', { text, timestamp: note.id });
            }
        }
    }

    // ---- Обычная заметка ----
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;

        addNote(text);
        input.value = '';
        input.focus();
    });

    // ---- Заметка с напоминанием (практика 17) ----
    reminderForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = reminderText.value.trim();
        const datetime = reminderTime.value;          // строка типа '2026-05-10T17:30'
        if (!text || !datetime) return;

        const timestamp = new Date(datetime).getTime();

        if (timestamp <= Date.now()) {
            alert('Дата напоминания должна быть в будущем.');
            return;
        }

        addNote(text, timestamp);
        reminderText.value = '';
        reminderTime.value = '';
    });

    list.addEventListener('click', (e) => {
        const btn = e.target.closest('.delete-btn');
        if (!btn) return;
        const id = Number(btn.dataset.id);
        saveNotes(getNotes().filter(n => n.id !== id));
        render();
    });

    render();
}


/* ---------- 5. Индикатор online/offline ---------- */

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


/* ---------- 6. WebSocket / Socket.IO (практика 16) ---------- */
let socket = null;

if (typeof io === 'function') {
    socket = io(SERVER_URL || undefined);

    socket.on('connect', () => {
        console.log('[ws] connected, id =', socket.id);
    });
    socket.on('disconnect', (reason) => {
        console.log('[ws] disconnected:', reason);
    });
    socket.on('connect_error', (err) => {
        console.warn('[ws] connect_error:', err.message);
    });

    socket.on('taskAdded', (task) => {
        console.log('[ws] taskAdded:', task);
        showToast(`Новая задача: ${task && task.text ? task.text : '...'}`);
    });
} else {
    console.warn('[app] Socket.IO library not loaded — real-time disabled.');
}


/* ---------- 7. Toast — кратковременное всплывающее сообщение ---------- */

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}


/* ---------- 8. PUSH: вспомогательная функция кодирования ключа ---------- */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}


/* ---------- 9. PUSH: получение публичного ключа от сервера ---------- */

async function fetchVapidPublicKey() {
    try {
        const res = await fetch(`${SERVER_URL}/vapidPublicKey`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data.publicKey || null;
    } catch (err) {
        console.warn('[push] Не удалось получить VAPID public key:', err.message);
        return null;
    }
}


/* ---------- 10. PUSH: подписка / отписка через PushManager ---------- */

async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('Push API не поддерживается этим браузером.');
        return;
    }

    const publicKey = await fetchVapidPublicKey();
    if (!publicKey) {
        alert('Сервер не вернул VAPID public key. Запустили ли вы notes-server?');
        return;
    }

    const registration = await navigator.serviceWorker.ready;

    const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await fetch(`${SERVER_URL}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
    });

    console.log('[push] Подписка оформлена и отправлена на сервер.');
}

async function unsubscribeFromPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    try {
        await fetch(`${SERVER_URL}/unsubscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
    } catch (err) {
        console.warn('[push] Сервер недоступен, отписываемся локально:', err.message);
    }

    await subscription.unsubscribe();
    console.log('[push] Отписка выполнена.');
}


/* ---------- 11. PUSH: кнопки enable/disable + регистрация SW ---------- */

if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log('[app] Service Worker зарегистрирован. Scope:', registration.scope);

            await navigator.serviceWorker.ready;
            const existing = await registration.pushManager.getSubscription();
            updatePushButtonsState(Boolean(existing));
        } catch (err) {
            console.error('[app] Ошибка регистрации Service Worker:', err);
        }
    });
} else {
    console.warn('[app] Service Worker не поддерживается этим браузером.');
}

function updatePushButtonsState(isSubscribed) {
    if (!enablePushBtn || !disablePushBtn) return;
    enablePushBtn.style.display  = isSubscribed ? 'none' : 'inline-block';
    disablePushBtn.style.display = isSubscribed ? 'inline-block' : 'none';
}

if (enablePushBtn) {
    enablePushBtn.addEventListener('click', async () => {
        if (Notification.permission === 'denied') {
            alert('Уведомления запрещены в настройках браузера. Разрешите их вручную.');
            return;
        }
        if (Notification.permission === 'default') {
            const result = await Notification.requestPermission();
            if (result !== 'granted') {
                alert('Без разрешения push-уведомления невозможны.');
                return;
            }
        }
        try {
            await subscribeToPush();
            updatePushButtonsState(true);
        } catch (err) {
            console.error('[push] subscribe error:', err);
            alert('Не удалось подписаться: ' + err.message);
        }
    });
}

if (disablePushBtn) {
    disablePushBtn.addEventListener('click', async () => {
        try {
            await unsubscribeFromPush();
            updatePushButtonsState(false);
        } catch (err) {
            console.error('[push] unsubscribe error:', err);
        }
    });
}


/* ---------- 12. Старт ---------- */

updateNetworkStatus();
loadContent('home');
