import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import * as state from './appstate.ts';

const token = '123:test-token';
const now = 1_800_000_000;
const user = { id: 42, first_name: 'Максим' };
function signed(values: Record<string, string> = {}) {
  const params = new URLSearchParams({ auth_date: String(now), user: JSON.stringify(user), ...values });
  const check = [...params].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}
const packet = { seq: 1, f: 0, hits: 4, coins: 12 };

test('valid Telegram signature authenticates the signed user', () => {
  assert.deepEqual(state.verifyInitData(signed(), token, { now }), user);
});
test('forged, expired, future, duplicate and malformed Telegram data are refused', () => {
  for (const initData of [signed().replace('hash=', 'hash=0'), signed({ auth_date: String(now - 86401) }),
    signed({ auth_date: String(now + 1) }), `${signed()}&auth_date=${now}`, signed({ user: '{}' }),
    signed({ user: '{bad json' }), signed({ user: JSON.stringify({ ...user, id: -1 }) }), '']) {
    assert.equal(state.verifyInitData(initData, token, { now }), null);
  }
  assert.deepEqual(state.verifyInitData('', '', { dev: true, now }), { id: 1, first_name: 'Dev' });
  assert.equal(state.verifyInitData('bad', '', { dev: true, now }), null);
});
test('delta updates coins, hits, victim and revision without mutating input', () => {
  const db = state.createAppDB();
  const { db: next, player } = state.applySync(db, user, packet);
  assert.deepEqual(player, { c: 12, w: 3, seq: 1 });
  assert.deepEqual(next.users['42'], { name: 'Максим', c: 12, w: 3, hits: 4, seq: 1 });
  assert.equal(next.victims[0], 4);
  assert.equal(next.rev, 1);
  assert.deepEqual(db, state.createAppDB());
});
test('seq zero reads state and retries or older packets never apply twice', () => {
  const db = state.createAppDB();
  assert.deepEqual(state.applySync(db, user, { ...packet, seq: 0 }).player, { c: 0, w: 3, seq: 0 });
  const first = state.applySync(db, user, packet);
  const duplicate = state.applySync(first.db, user, packet);
  assert.strictEqual(duplicate.db, first.db);
  assert.deepEqual(duplicate.player, first.player);
  assert.strictEqual(state.applySync(first.db, user, { ...packet, seq: 0 }).db, first.db);
});
test('invalid packet fields and coin inflation are refused without touching state', () => {
  const db = state.createAppDB();
  for (const invalid of [null, [], {}, { ...packet, f: -1 }, { ...packet, f: 6 }, { ...packet, hits: 2001 },
    { ...packet, hits: 1.1 }, { ...packet, hits: '2' }, { ...packet, coins: -1 }, { ...packet, coins: 1e9 },
    { ...packet, hits: 0, coins: 1 }, { ...packet, seq: -1 }, { ...packet, seq: Infinity },
    { ...packet, buy: 12 }, { ...packet, buy: null }, { ...packet, coins: NaN }]) {
    assert.throws(() => state.applySync(db, user, invalid));
  }
  assert.deepEqual(db, state.createAppDB());
});
test('coin ceiling covers x3 nuclear damage, collisions, KO and rounding', () => {
  const hits = 2000;
  const damage = hits * (300 + 15);
  const coins = damage * 3 + 50 * Math.ceil(damage / 200);
  assert.equal(state.applySync(state.createAppDB(), user, { seq: 1, f: 5, hits, coins }).player.c, coins);
});
test('purchase applies after earnings and cannot charge twice or exceed balance', () => {
  const first = state.applySync(state.createAppDB(), user, { ...packet, hits: 100, coins: 105, buy: 2 });
  assert.deepEqual(first.player, { c: 5, w: 7, seq: 1 });
  assert.deepEqual(state.applySync(first.db, user, { seq: 2, f: 0, hits: 0, coins: 0, buy: 2 }).player,
    { c: 5, w: 7, seq: 2 });
  assert.deepEqual(state.applySync(first.db, user, { seq: 2, f: 0, hits: 0, coins: 0, buy: 3 }).player,
    { c: 5, w: 7, seq: 2 });
});
test('widget migration preserves progress and resets app weapons and sequence', () => {
  const old = { rev: 8, victims: [1, 2, 3, 4, 5, 6], users: { '42': { name: 'Максим', c: 999, w: 255, hits: 21 } } };
  const migrated = state.migrateDB(old);
  assert.deepEqual(migrated, { ...old, users: { '42': { ...old.users['42'], w: 3, seq: 0 } } });
  assert.equal(old.users['42'].w, 255);
  assert.deepEqual(state.parseAppDB(migrated), migrated);
});
test('corrupt stored databases are rejected rather than silently losing progress', () => {
  for (const invalid of [null, {}, { ...state.createAppDB(), victims: [1] },
    { ...state.createAppDB(), users: { '42': { name: 'x', c: -1, w: 3, hits: 0, seq: 0 } } },
    { ...state.createAppDB(), users: Object.fromEntries([['__proto__', null]]) }]) {
    assert.throws(() => state.parseAppDB(invalid));
  }
});
test('top sorts both rankings and returns only twenty fighters with ids', () => {
  let db = state.createAppDB();
  for (let i = 1; i <= 25; i++) db = state.applySync(db, { id: i, first_name: `User ${i}` }, { seq: 1, f: i % 6, hits: i, coins: i }).db;
  const top = state.topData(db);
  assert.equal(top.fighters.length, 20);
  assert.deepEqual(top.fighters[0], { id: 25, name: 'User 25', hits: 25 });
  assert.ok(top.victims.every((v, i) => i === 0 || top.victims[i - 1].hits >= v.hits));
  assert.equal(top.victims.reduce((sum, v) => sum + v.hits, 0), 325);
});
