const form          = document.getElementById('note-form');
const input         = document.getElementById('note-input');
const list          = document.getElementById('notes-list');
const networkStatus = document.getElementById('network-status');

const STORAGE_KEY = 'notes';

function getNotes() {

    const raw = localStorage.getItem(STORAGE_KEY) || '[]';
    try {
        return JSON.parse(raw);
    } catch (e) {
        console.warn('Не удалось распарсить заметки из localStorage:', e);
        return [];
    }
}

function saveNotes(notes) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function renderNotes() {
    const notes = getNotes();

    if (notes.length === 0) {
        list.innerHTML = '<li><i>Пока нет заметок. Добавьте первую сверху ↑</i></li>';
        return;
    }

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

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('ru-RU');
}

function addNote(text) {
    const notes = getNotes();
    notes.push({
        id: Date.now(),
        text: text,
        createdAt: new Date().toISOString(),
    });
    saveNotes(notes);
    renderNotes();
}


function deleteNote(id) {
    const numericId = Number(id);
    const notes = getNotes().filter(n => n.id !== numericId);
    saveNotes(notes);
    renderNotes();
}

form.addEventListener('submit', (e) => {
    e.preventDefault();

    const text = input.value.trim();
    if (!text) return; 

    addNote(text);
    input.value = '';   
    input.focus();      
});

list.addEventListener('click', (e) => {
    const btn = e.target.closest('.delete-btn');
    if (!btn) return; 
    deleteNote(btn.dataset.id);
});

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

renderNotes();          
updateNetworkStatus();  


if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log(
                '[app] Service Worker зарегистрирован. Scope:',
                registration.scope
            );
        } catch (err) {
            console.error('[app] Ошибка регистрации Service Worker:', err);
        }
    });
} else {
    console.warn('[app] Service Worker не поддерживается этим браузером.');
}
