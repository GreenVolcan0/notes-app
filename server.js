require('dotenv').config();

const path       = require('path');
const http       = require('http');
const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const webpush    = require('web-push');
const { Server: SocketIOServer } = require('socket.io');


/* ---------- 1. Конфигурация (порт, VAPID) ---------- */

const PORT          = Number(process.env.PORT) || 3001;
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT     || 'mailto:dev@notes-app.local';

const PUSH_ENABLED = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);

if (PUSH_ENABLED) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    console.log('[server] VAPID настроен. Push-уведомления включены.');
} else {
    console.warn('[server] VAPID-ключи отсутствуют. Запустите `npm run vapid`.');
    console.warn('[server] WebSocket работает, но push отправляться НЕ будет.');
}


/* ---------- 2. Express: статика + push-эндпоинты ---------- */

const app = express();
app.use(cors());
app.use(bodyParser.json());
const STATIC_DIR = path.join(__dirname, '..', 'notes-app');
app.use(express.static(STATIC_DIR));
console.log('[server] Раздаём статику из:', STATIC_DIR);
app.get('/vapidPublicKey', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC || null });
});


/* ---------- 3. Хранилище push-подписок ---------- */
const subscriptions = new Map(); 

// POST /subscribe — клиент шлёт сюда свою подписку после
// pushManager.subscribe().
app.post('/subscribe', (req, res) => {
    const sub = req.body;

    if (!sub || !sub.endpoint) {
        return res.status(400).json({ error: 'subscription.endpoint required' });
    }

    subscriptions.set(sub.endpoint, sub);
    console.log(`[server] +subscription (всего: ${subscriptions.size})`);
    res.status(201).json({ message: 'Подписка сохранена' });
});

// POST /unsubscribe — клиент шлёт endpoint, который нужно забыть.
app.post('/unsubscribe', (req, res) => {
    const { endpoint } = req.body || {};
    if (!endpoint) {
        return res.status(400).json({ error: 'endpoint required' });
    }

    subscriptions.delete(endpoint);
    console.log(`[server] -subscription (всего: ${subscriptions.size})`);
    res.status(200).json({ message: 'Подписка удалена' });
});


/* ---------- 3.5. Хранилище запланированных НАПОМИНАНИЙ (практика 17) ---------- */
const reminders   = new Map();
const MAX_TIMEOUT = 2_147_483_647; // 2^31 - 1 миллисекунд ≈ 24.85 суток

/**
 * Запланировать push-уведомление на момент времени.
 * @param {object} params { id, text, reminderTime } — id и время в UNIX-ms
 * @returns {boolean} false если задача уже в прошлом или слишком далеко в будущем
 */
function scheduleReminder({ id, text, reminderTime }) {
    const delay = reminderTime - Date.now();
    if (delay <= 0) {
        console.warn(`[reminder] reminder ${id}: время уже прошло, пропускаем`);
        return false;
    }
    if (delay > MAX_TIMEOUT) {
        console.warn(`[reminder] reminder ${id}: задержка > 24.8 дней, не поддерживается`);
        return false;
    }
    if (reminders.has(id)) {
        const prev = reminders.get(id);
        clearTimeout(prev.timeoutId);
        if (prev.cleanupId) clearTimeout(prev.cleanupId);
    }

    const timeoutId = setTimeout(() => {
        console.log(`[reminder] срабатывает ${id}: «${text}»`);
        sendPushToAll({
            title: '🔔 Напоминание',
            body:  text,
            reminderId: id,
        });

        const cleanupId = setTimeout(() => {
            const cur = reminders.get(id);
            if (cur && cur.timeoutId === timeoutId) {
                reminders.delete(id);
                console.log(`[reminder] очищена устаревшая запись ${id}`);
            }
        }, SNOOZE_GRACE_MS);

        const cur = reminders.get(id);
        if (cur) {
            cur.cleanupId = cleanupId;
        }
    }, delay);

    reminders.set(id, { timeoutId, text, reminderTime, cleanupId: null });
    console.log(`[reminder] запланирован ${id} на ${new Date(reminderTime).toLocaleString()}`);
    return true;
}


/* ---------- 3.6. POST /snooze — отложить напоминание на 5 минут ---------- */
const SNOOZE_MS        = 5  * 60 * 1000; // на сколько откладывает кнопка «Отложить»
const SNOOZE_GRACE_MS  = 30 * 60 * 1000; // окно после срабатывания, в течение которого ещё можно отложить

app.post('/snooze', (req, res) => {
    const reminderId = parseInt(req.query.reminderId, 10);
    if (!reminderId || !reminders.has(reminderId)) {
        console.warn(`[snooze] reminder ${reminderId} не найден`);
        return res.status(404).json({ error: 'Reminder not found' });
    }

    const old = reminders.get(reminderId);
    clearTimeout(old.timeoutId);

    const newReminderTime = Date.now() + SNOOZE_MS;
    const ok = scheduleReminder({
        id: reminderId,
        text: old.text,
        reminderTime: newReminderTime,
    });
    if (!ok) {
        return res.status(500).json({ error: 'Failed to schedule snooze' });
    }

    console.log(`[snooze] reminder ${reminderId} → +5 минут`);
    res.status(200).json({
        message: 'Reminder snoozed for 5 minutes',
        reminderTime: newReminderTime,
    });
});


/* ---------- 4. Socket.IO: WebSocket-обмен в реальном времени ---------- */
const httpServer = http.createServer(app);

const io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
});

io.on('connection', (socket) => {
    console.log('[ws] connect:', socket.id);

    socket.on('newTask', async (task) => {
        console.log('[ws] newTask from', socket.id, '·', task && task.text);
        io.emit('taskAdded', task);

        if (PUSH_ENABLED && subscriptions.size > 0) {
            await sendPushToAll({
                title: 'Новая задача',
                body:  task && task.text ? String(task.text) : 'Без текста',
            });
        }
    });

    // ===== Практика 17: планирование напоминания на конкретное время =====
    socket.on('newReminder', (reminder) => {
        console.log('[ws] newReminder from', socket.id, '·', reminder);
        if (!reminder || !reminder.id || !reminder.text || !reminder.reminderTime) {
            console.warn('[ws] newReminder: некорректные поля');
            return;
        }
        if (!PUSH_ENABLED) {
            console.warn('[ws] newReminder: push не настроен — напоминание не сработает');
            return;
        }
        scheduleReminder({
            id:           Number(reminder.id),
            text:         String(reminder.text),
            reminderTime: Number(reminder.reminderTime),
        });
    });

    socket.on('disconnect', (reason) => {
        console.log('[ws] disconnect:', socket.id, '·', reason);
    });
});


/* ---------- 5. Рассылка push всем подписчикам ---------- */
async function sendPushToAll(payloadObj) {
    const payload = JSON.stringify(payloadObj);
    const dead = []; 

    await Promise.all(
        Array.from(subscriptions.entries()).map(async ([endpoint, sub]) => {
            try {
                await webpush.sendNotification(sub, payload);
            } catch (err) {
                if (err.statusCode === 404 || err.statusCode === 410) {
                    dead.push(endpoint); // протухло
                } else {
                    console.error('[push] error', err.statusCode, err.body || err.message);
                }
            }
        })
    );

    if (dead.length) {
        dead.forEach((e) => subscriptions.delete(e));
        console.log(`[push] удалено протухших подписок: ${dead.length}`);
    }
    console.log(`[push] отправлено уведомлений: ${subscriptions.size}`);
}


/* ---------- 6. Запуск ---------- */

httpServer.listen(PORT, () => {
    console.log(`[server] Слушаем http://localhost:${PORT}`);
    console.log('[server] Откройте в браузере: http://localhost:' + PORT + '/');
});