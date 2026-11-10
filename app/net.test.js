import test from 'node:test';
import assert from 'node:assert/strict';

test('очередь сохраняет пакет при потерянном ответе и отделяет новые дельты', async () => {
  const { createNet } = await import('./net.js');
  const data = new Map();
  globalThis.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) };
  const calls = [];
  let fail = true;
  globalThis.fetch = async (_, options) => {
    const p = JSON.parse(options.body); calls.push(p);
    if (p.seq && fail) throw new Error('lost reply');
    return { ok: true, json: async () => ({ c: p.seq ? 11 : 0, w: 3, seq: p.seq }) };
  };
  const net = createNet('', () => {});
  await net.start();
  net.earn(2, 7);
  await net.flush();
  net.earn(3, 4);
  assert.equal(net.view().c, 11);
  const retry = calls.at(-1);
  assert.equal(retry.seq, 1);
  fail = false;
  await net.flush();
  assert.deepEqual(calls[2], retry);
  assert.equal(calls[3].f, 3);
  assert.equal(calls[3].seq, 2);
  assert.equal(net.view().offline, false);
});

test('перезагрузка сверяет seq с сервером, покупка следует за дельтами и не дублируется', async () => {
  const { createNet } = await import('./net.js');
  const data = new Map();
  globalThis.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) };
  let coins = 0, seq = 0, w = 3, lose = true;
  const calls = [];
  globalThis.fetch = async (_, options) => {
    const p = JSON.parse(options.body); calls.push(p);
    if (p.seq > seq) { coins += p.coins; seq = p.seq; if (p.buy === 2) { coins -= 100; w |= 4; } }
    if (p.seq && lose) throw new Error('reply lost after commit');
    return { ok: true, json: async () => ({ c: coins, seq, w }) };
  };
  const one = createNet('', () => {}); await one.start();
  one.earn(0, 150); await one.flush();
  assert.equal(coins, 150);
  lose = false;
  const two = createNet('', () => {}); await two.start();
  assert.equal(two.view().c, 150);
  two.earn(1, 10); await two.buy(2);
  assert.equal(coins, 60);
  assert.ok(two.view().w & 4);
  assert.equal(seq, 3);
  assert.equal(calls.at(-1).buy, 2);
});

test('крупный офлайн прогресс разбивается на пакеты <= 2000 ударов', async () => {
  const { createNet } = await import('./net.js');
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  const calls = [];
  globalThis.fetch = async (_, options) => {
    const p = JSON.parse(options.body); calls.push(p);
    return { ok: true, json: async () => ({ c: 0, seq: p.seq, w: 3 }) };
  };
  const net = createNet('', () => {}); await net.start();
  for (let i=0; i<4001; i++) net.earn(i % 2, 1);
  await net.flush(true);
  assert.equal(calls.slice(1).reduce((n,p) => n+p.hits,0), 4001);
  assert.ok(calls.slice(1).every(p => p.hits <= 2000));
});
