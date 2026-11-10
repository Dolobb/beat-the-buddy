import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { applyQuery, createDB, playerData, publicData } from './state.ts';
import * as state from './state.ts';
import { weapons, phrases } from './config.ts';

test('дельта начисляется нужному игроку и другу', () => {
  const db = createDB();
  assert.deepEqual(JSON.parse(applyQuery(db, 1, 'Макс', 'h:2:20:120')!), { c: 120, w: 1 });
  assert.equal(db.victims[2], 20);
  assert.equal(db.users[1].hits, 20);
});

test('накрутка, границы и мусор не изменяют базу', () => {
  const db = createDB();
  for (const data of ['h:0:301:0', 'h:0:1:51', 'h:6:1:1', `b:${weapons.length}:0:0:0`, 'h:0:0:1',
    'h:-1:1:1', 'h:0:1:-1', 'h:0:1:1:1', 'b:0:1:1', '', 'wat', null, 'h:0:1:NaN',
    'h:0:9007199254740992:0', 'h:' + '0'.repeat(64), 'h:0:1:1\n']) {
    const before = structuredClone(db);
    assert.equal(applyQuery(db, 1, 'Новое имя', data), '{"c":0,"w":1}');
    assert.deepEqual(db, before);
  }
});

test('потолок учитывает самое сильное оружие и HP, покупка последнего оружия доступна', () => {
  const db = createDB();
  assert.equal(applyQuery(db, 1, 'Макс', 'h:0:4:160'), '{"c":160,"w":1}');
  const before = structuredClone(db);
  assert.equal(applyQuery(db, 1, 'Макс', 'h:0:4:161'), '{"c":160,"w":1}');
  assert.deepEqual(db, before);
  db.users[1].c = weapons.at(-1)!.price;
  assert.equal(applyQuery(db, 1, 'Макс', `b:${weapons.length - 1}:0:0:0`), '{"c":0,"w":129}');
});

test('фразы и лица обрабатываются ботом без изменения базы, включая неверные индексы', () => {
  const db = createDB(), before = structuredClone(db);
  for (const data of ['p:0', 'p:1', 'p:6', 'p:-1', 'p:wat', 'f:0', 'f:6']) {
    assert.equal(applyQuery(db, 1, 'Макс', data), undefined);
    assert.deepEqual(db, before);
  }
});

test('phrasesData возвращает фразы друга или запасной набор', () => {
  assert.equal(typeof state.phrasesData, 'function');
  assert.deepEqual(JSON.parse(state.phrasesData(0)), phrases);
  assert.deepEqual(JSON.parse(state.phrasesData(1)), [
    'Да я верну, клянусь!', 'Бля, скоро верну, Дрон', 'Завтра точно отдам', 'С зарплаты верну',
    'Ну подожди до пятницы', 'Я же сказал, верну!', 'Дай ещё неделю', 'Карта не работает, бля',
    'Да там копейки вообще', 'Не бей, я ищу деньги!',
  ]);
});

test('phrasesData обрезает хвост по байтам UTF-8, не меняет конфиг и допускает пустой ответ', () => {
  assert.equal(typeof state.phrasesData, 'function');
  const original = [...phrases];
  try {
    phrases.splice(0, phrases.length, 'Я'.repeat(500), '😀'.repeat(10), 'Хвост');
    const data = state.phrasesData(0);
    assert.ok(Buffer.byteLength(data) <= 1024);
    assert.deepEqual(JSON.parse(data), ['Я'.repeat(500)]);
    assert.equal(phrases.length, 3);
    phrases[0] = 'Я'.repeat(600);
    assert.equal(state.phrasesData(0), '[]');
  } finally { phrases.splice(0, phrases.length, ...original); }
});

test('собранный preview отвечает на фразы, проверяет потолок и продаёт последнее оружие', async () => {
  execFileSync(process.execPath, ['scripts/build.ts'], { cwd: import.meta.dirname });
  const html = readFileSync(new URL('./dist/preview.html', import.meta.url), 'utf8');
  const window: { TelegramWidget?: { request(data: string): Promise<{ result: string | null }> } } = {};
  runInNewContext(/<script>([\s\S]*?)<\/script>/.exec(html)![1], { window });
  const request = window.TelegramWidget!.request;
  for (const f of [0, 1]) assert.equal((await request(`p:${f}`)).result, state.phrasesData(f));
  for (const q of ['p:6', 'p:-1', 'p:wat', 'f:0']) assert.equal((await request(q)).result, null);
  assert.equal((await request('h:0:4:160')).result, '{"c":160,"w":1}');
  assert.equal((await request('h:0:4:161')).result, '{"c":160,"w":1}');
  for (let i = 0; i < 4; i++) await request('h:0:300:10800');
  assert.equal((await request('b:7:0:0:0')).result, '{"c":3360,"w":129}');
});

test('покупка без денег не проходит; дельта применяется перед покупкой', () => {
  const db = createDB();
  assert.equal(applyQuery(db, 1, 'Макс', 'b:1:0:1:1'), '{"c":1,"w":1}');
  assert.equal(applyQuery(db, 1, 'Макс', 'b:1:0:10:50'), '{"c":1,"w":3}');
  assert.equal(applyQuery(db, 1, 'Макс', 'b:1:0:0:0'), '{"c":1,"w":3}');
  assert.equal(db.users[1].hits, 11);
});

test('нулевая синхронизация, лицо и изоляция пользователей', () => {
  const db = createDB();
  assert.equal(applyQuery(db, 1, 'Макс', 'h:0:0:0'), '{"c":0,"w":1}');
  const before = structuredClone(db);
  assert.equal(applyQuery(db, 2, 'Аня', 'f:0'), undefined);
  assert.deepEqual(db, before);
  applyQuery(db, 2, 'Аня', 'h:5:300:1800');
  assert.equal(playerData(db, 1), '{"c":0,"w":1}');
  assert.equal(db.victims[5], 300);
});

test('publicData: ревизия, топ-3, длинные имена и лимит UTF-8', () => {
  const db = createDB();
  for (let i = 1; i <= 5; i++) applyQuery(db, i, '\0😀'.repeat(100), `h:0:${i}:0`);
  db.rev = 7;
  const data = publicData(db), parsed = JSON.parse(data);
  assert.ok(Buffer.byteLength(data) <= 1024);
  assert.equal(parsed.r, 7);
  assert.deepEqual(parsed.t.map(t => t[1]), [5, 4, 3]);
  assert.equal(Array.from(parsed.t[0][0]).length, 12);
  assert.ok(!data.includes('\0'));
});

test('topText сортирует жертв и бойцов', async () => {
  const { topText } = await import('./state.ts');
  const db = createDB();
  applyQuery(db, 1, 'А', 'h:2:20:20');
  applyQuery(db, 2, 'Б', 'h:5:30:30');
  const text = topText(db);
  assert.match(text, /1\. Дрон: 30\n2\. Боб: 20/);
  assert.match(text, /1\. Б: 30\n2\. А: 20/);
});
