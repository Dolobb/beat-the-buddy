import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { friends } from './config.ts';
import { applyQuery, createDB, playerData, publicData, topText, phrasesData } from './state.ts';
import type { Database } from './state.ts';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('Задайте BOT_TOKEN в .env (токен от @BotFather).');
let html: string;
try { html = readFileSync(new URL('./dist/widget.html', import.meta.url), 'utf8'); }
catch { throw new Error('Нет dist/widget.html: сначала npm run build'); }
const htmlHash = createHash('sha1').update(html).digest('hex');
const HEIGHT = 490; // Та же фиксированная высота, что в widget/widget.html.
const dbPath = new URL('./data.json', import.meta.url);
const tmpPath = new URL('./data.json.tmp', import.meta.url);
let db: Database;
try {
  db = JSON.parse(readFileSync(dbPath, 'utf8'));
  if (!Array.isArray(db.victims) || db.victims.length !== 6 || !db.users || !Number.isSafeInteger(db.rev))
    throw new Error('Неверный формат data.json');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  db = createDB();
}

const controller = new AbortController();
let stopping = false, saveTimer, editTimer, publishing = false, publicDirty = false;
function save() {
  clearTimeout(saveTimer);
  writeFileSync(tmpPath, JSON.stringify(db));
  renameSync(tmpPath, dbPath);
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { save(); } catch (error) { console.error('Запись data.json:', error.message); scheduleSave(); }
  }, 1000);
}
async function api(method: string, body: object) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(method === 'getUpdates' ? 40000 : 10000)]),
  });
  const result = await response.json();
  if (!result.ok) throw new Error(`${method}: ${result.description}`);
  return result.result;
}
async function editShared() {
  if (!db.widget) return;
  db.rev++;
  scheduleSave();
  await api('editSharedWidgetData', { widget_id: db.widget.id, public_data: publicData(db), cache_time: 5 });
}
function scheduleEdit() {
  publicDirty = true;
  if (editTimer || publishing || stopping) return;
  editTimer = setTimeout(async () => {
    editTimer = undefined;
    publicDirty = false;
    publishing = true;
    try { await editShared(); }
    catch (error) { console.error('Общие данные:', error.message); publicDirty = true; }
    finally { publishing = false; if (publicDirty) scheduleEdit(); }
  }, 2000);
}
function face(index: number): string | undefined {
  for (const [ext, mime] of [['webp', 'webp'], ['png', 'png'], ['jpg', 'jpeg']]) {
    try {
      const bytes = readFileSync(new URL(`./faces/${friends[index].id}.${ext}`, import.meta.url));
      const data = `data:image/${mime};base64,${bytes.toString('base64')}`;
      if (Buffer.byteLength(data) <= 1024) return data;
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Лицо:', error.message);
    }
  }
}
async function handle(update) {
  const query = update.widget_query ?? update.shared_widget_query;
  if (query) {
    let data: string | undefined;
    try {
      if (/^[fp]:/.test(query.data)) {
        const match = /^([fp]):(\d+)$/.exec(query.data), i = Number(match?.[2]);
        if (Number.isSafeInteger(i) && i < friends.length)
          data = match![1] === 'f' ? face(i) : phrasesData(i);
      }
      else {
        const before = publicData(db);
        data = applyQuery(db, query.from.id, query.from.first_name, query.data);
        scheduleSave();
        if (publicData(db) !== before) scheduleEdit();
      }
    } catch (error) { console.error('Запрос:', error.message); }
    // Любой запрос получает ответ, в том числе неизвестный или ошибочный.
    await api('answerWidgetQuery', { widget_query_id: query.id, ...(data === undefined ? {} : { data }) });
  }
  const message = update.message;
  const command = /^\/(start|top)(?:@\w+)?(?:\s|$)/.exec(message?.text ?? '')?.[1];
  if (command === 'top' || (command && message.chat.type !== 'private')) {
    // Виджеты в продакшене шлются только в личку, в группе отвечаем текстом.
    const hint = command === 'start' ? `Играть в личке: https://t.me/${me.username}\n\n` : '';
    await api('sendMessage', { chat_id: message.chat.id, text: hint + topText(db) });
  } else if (command && message.from) {
    applyQuery(db, message.from.id, message.from.first_name, 'h:0:0:0');
    scheduleSave();
    const chat_data = playerData(db, message.from.id);
    if (!db.widget || db.widget.htmlHash !== htmlHash) {
      const sent = await api('sendWidget', {
        chat_id: message.chat.id, html, is_shared: true, allow_queries: true,
        height: HEIGHT, public_data: publicData(db), chat_data,
      });
      db.widget = { id: sent.widget.id, htmlHash };
      save();
      clearTimeout(editTimer);
      editTimer = undefined;
      try { await editShared(); }
      catch (error) { scheduleEdit(); throw error; }
    } else await api('sendSharedWidget', { chat_id: message.chat.id, widget_id: db.widget.id, chat_data });
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  stopping = true;
  controller.abort();
  clearTimeout(editTimer);
  try { save(); } catch (error) { console.error('Сохранение при выходе:', error.message); process.exitCode = 1; }
});

const me = await api('getMe', {});
console.log(`Бот @${me.username} запущен`);
let offset = 0;
while (!stopping) {
  try {
    const updates = await api('getUpdates', {
      offset, timeout: 30, allowed_updates: ['message', 'widget_query', 'shared_widget_query'],
    });
    for (const update of updates) {
      if (stopping) break;
      try { await handle(update); }
      catch (error) {
        console.error('Обработка update:', error.message);
        await pause(3000, undefined, { signal: controller.signal }).catch(() => {});
      }
      offset = update.update_id + 1;
    }
  } catch (error) {
    if (!stopping) {
      console.error('Long polling:', error.message);
      await pause(3000, undefined, { signal: controller.signal }).catch(() => {});
    }
  }
}
