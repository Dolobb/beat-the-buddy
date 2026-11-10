import test from 'node:test';
import assert from 'node:assert/strict';
import { applyQuery, createDB, playerData, publicData } from './state.ts';

test('дельта начисляется нужному игроку и другу', () => {
  const db = createDB();
  assert.deepEqual(JSON.parse(applyQuery(db, 1, 'Макс', 'h:2:20:120')!), { c: 120, w: 1 });
  assert.equal(db.victims[2], 20);
  assert.equal(db.users[1].hits, 20);
});

test('накрутка, границы и мусор не изменяют базу', () => {
  const db = createDB();
  for (const data of ['h:0:301:0', 'h:0:1:26', 'h:6:1:1', 'b:4:0:0:0', 'h:0:0:1',
    'h:-1:1:1', 'h:0:1:-1', 'h:0:1:1:1', 'b:0:1:1', '', 'wat', null, 'h:0:1:NaN',
    'h:0:9007199254740992:0', 'h:' + '0'.repeat(64), 'h:0:1:1\n']) {
    const before = structuredClone(db);
    assert.equal(applyQuery(db, 1, 'Новое имя', data), '{"c":0,"w":1}');
    assert.deepEqual(db, before);
  }
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
