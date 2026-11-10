// E2E бэкенда: поднимает НАСТОЯЩИЙ server.ts отдельным процессом и ходит в него по HTTP.
// Запуск: npm test (или node --test e2e/)
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appWeapons, APP_HP } from '../config.ts';

const TOKEN = '123456:e2e-test-token';
const dir = mkdtempSync(join(tmpdir(), 'buddy-e2e-'));
let proc: ChildProcess, base = '';

function initData(id: number, name = 'Тестер', ageSec = 0, token = TOKEN) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000) - ageSec),
    query_id: 'AAE2E', user: JSON.stringify({ id, first_name: name }) });
  const check = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  p.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return p.toString();
}
async function start(env: Record<string, string> = {}) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  proc = spawn(process.execPath, ['server.ts'], { cwd: new URL('..', import.meta.url),
    env: { ...process.env, BOT_TOKEN: TOKEN, DEV: '', PORT: String(port), DATA_DIR: dir, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  base = `http://127.0.0.1:${port}/buddy/`;
  let err = '';
  proc.stderr!.on('data', d => { err += d; });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + 'api/top')).ok) return; } catch { /* ещё не поднялся */ }
    if (proc.exitCode !== null) throw new Error('server exited: ' + err);
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('server did not start: ' + err);
}
async function stop() {
  if (!proc || proc.exitCode !== null) return;
  const done = new Promise(r => proc.once('exit', r));
  proc.kill('SIGTERM'); await done;
}
const sync = (body: object) => fetch(base + 'api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const syncOk = async (body: object) => { const r = await sync(body); assert.equal(r.status, 200, await r.clone().text()); return r.json(); };

before(() => start());
after(async () => { await stop(); rmSync(dir, { recursive: true, force: true }); });

test('статика: страница, скрипты, картинки, 404 и защита от выхода из каталога', async () => {
  const page = await fetch(base); assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type')!, /text\/html/);
  assert.match(await page.text(), /<canvas/);
  for (const [path, type] of [['main.js', /javascript/], ['assets/manifest.json', /json/], ['assets/head-f1.png', /image\/png/], ['vendor/matter.min.js', /javascript/]] as const) {
    const r = await fetch(base + path); assert.equal(r.status, 200, path); assert.match(r.headers.get('content-type')!, type, path);
  }
  assert.equal((await fetch(base + 'nope.js')).status, 404);
  for (const evil of ['..%2fserver.ts', '%2e%2e/%2e%2e/etc/passwd', '..%2f.env', 'assets/..%2f..%2fconfig.ts']) {
    const r = await fetch(base + evil); assert.ok([400, 403, 404].includes(r.status), `${evil} -> ${r.status}`);
    assert.doesNotMatch(await r.text(), /BOT_TOKEN|createServer|root:/, evil);
  }
});

test('config отдаёт друзей, оружие и фразы и не светит секреты', async () => {
  const text = await (await fetch(base + 'api/config')).text();
  const c = JSON.parse(text);
  assert.equal(c.friends.length, 6); assert.equal(c.weapons.length, appWeapons.length); assert.equal(c.hp, APP_HP);
  assert.ok(Array.isArray(c.phrases.common)); assert.ok(c.phrases.f2.some((p: string) => p.includes('верну')));
  assert.doesNotMatch(text, new RegExp(TOKEN));
});

test('авторизация: без подписи, с чужим токеном, с подделкой и с протухшей датой — 401', async () => {
  const good = { seq: 0, f: 0, hits: 0, coins: 0 };
  assert.equal((await sync({ ...good, initData: '' })).status, 401);
  assert.equal((await sync({ ...good })).status, 401);
  assert.equal((await sync({ ...good, initData: initData(5, 'X', 0, 'other:token') })).status, 401);
  assert.equal((await sync({ ...good, initData: initData(5).replace(/hash=\w{4}/, 'hash=0000') })).status, 401);
  assert.equal((await sync({ ...good, initData: initData(5).replace('%22id%22%3A5', '%22id%22%3A6') })).status, 401, 'подмена user id ломает подпись');
  assert.equal((await sync({ ...good, initData: initData(5, 'X', 25 * 3600) })).status, 401);
  assert.equal((await sync({ ...good, initData: initData(5) })).status, 200);
});

test('игровой цикл: старт, удары, идемпотентность, покупка, рейтинг', async () => {
  const me = initData(1001, 'Боец');
  assert.deepEqual(await syncOk({ initData: me, seq: 0, f: 0, hits: 0, coins: 0 }), { c: 0, w: 3, seq: 0 });
  const a = await syncOk({ initData: me, seq: 1, f: 2, hits: 100, coins: 150 });
  assert.deepEqual(a, { c: 150, w: 3, seq: 1 });
  assert.deepEqual(await syncOk({ initData: me, seq: 1, f: 2, hits: 100, coins: 150 }), a, 'повтор пакета не начисляет дважды');
  assert.deepEqual(await syncOk({ initData: me, seq: 1, f: 3, hits: 5, coins: 5 }), a, 'старый seq с другим содержимым игнорируется');
  const price = appWeapons[2].price;
  const poor = await syncOk({ initData: me, seq: 2, f: 2, hits: 0, coins: 0, buy: 3 });
  assert.equal(poor.w, 3, 'на Биту не хватает'); assert.equal(poor.c, 150);
  const bought = await syncOk({ initData: me, seq: 3, f: 2, hits: 0, coins: 0, buy: 2 });
  assert.equal(bought.w, 3 | 1 << 2); assert.equal(bought.c, 150 - price);
  const again = await syncOk({ initData: me, seq: 4, f: 2, hits: 0, coins: 0, buy: 2 });
  assert.equal(again.c, 150 - price, 'повторная покупка не списывает');
  const top = await (await fetch(base + 'api/top')).json();
  assert.equal(top.victims[0].name, 'Боб'); assert.equal(top.victims[0].hits, 100);
  assert.deepEqual(top.fighters.find((f: { id: number }) => f.id === 1001), { id: 1001, name: 'Боец', hits: 100 });
});

test('накрутка и мусор отклоняются и не меняют состояние', async () => {
  const me = initData(1002, 'Читер');
  await syncOk({ initData: me, seq: 0, f: 0, hits: 0, coins: 0 });
  const cases: object[] = [
    { seq: 1, f: 0, hits: 1, coins: 10_000_000 }, { seq: 1, f: 0, hits: 99999, coins: 1 }, { seq: 1, f: 6, hits: 1, coins: 1 },
    { seq: 1, f: -1, hits: 1, coins: 1 }, { seq: 1, f: 0, hits: -5, coins: -5 }, { seq: 1, f: 0, hits: 1.5, coins: 1 },
    { seq: 1, f: '0', hits: '1', coins: '1' }, { seq: 1, f: 0, hits: 1, coins: 1, buy: 999 }, { seq: 'x', f: 0, hits: 1, coins: 1 },
    { seq: 1, f: 0, hits: null, coins: null }, { seq: 1 },
  ];
  for (const c of cases) {
    const r = await sync({ initData: me, ...c });
    assert.ok(r.status === 400 || r.status === 200, `${JSON.stringify(c)} -> ${r.status}`);
    const state = await syncOk({ initData: me, seq: 0, f: 0, hits: 0, coins: 0 });
    assert.equal(state.c, 0, `монеты после ${JSON.stringify(c)}`); assert.equal(state.w, 3, `оружие после ${JSON.stringify(c)}`);
  }
});

test('протокол: плохой JSON, тело больше 4 КБ, неверный метод, неизвестный API', async () => {
  const post = (body: string) => fetch(base + 'api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal((await post('{не json')).status, 400);
  assert.equal((await post('[]')).status >= 400, true);
  assert.equal((await post(JSON.stringify({ initData: 'x'.repeat(5000) }))).status, 413);
  assert.ok([404, 405].includes((await fetch(base + 'api/sync')).status));
  assert.ok([404, 405].includes((await fetch(base + 'api/top', { method: 'DELETE' })).status));
  assert.equal((await fetch(base + 'api/nope')).status, 404);
  assert.equal((await fetch(base + 'api/top')).status, 200, 'сервер жив после мусора');
});

test('параллельные игроки не портят друг другу счёт', async () => {
  const before = (await (await fetch(base + 'api/top')).json()).victims.find((v: { name: string }) => v.name === 'Дрон')?.hits ?? 0;
  await Promise.all(Array.from({ length: 30 }, async (_, i) => {
    const me = initData(2000 + i, `P${i}`);
    await syncOk({ initData: me, seq: 0, f: 5, hits: 0, coins: 0 });
    for (let s = 1; s <= 3; s++) await syncOk({ initData: me, seq: s, f: 5, hits: 10, coins: 10 });
  }));
  const top = await (await fetch(base + 'api/top')).json();
  assert.equal(top.victims.find((v: { name: string }) => v.name === 'Дрон').hits, before + 30 * 3 * 10);
  assert.ok(top.fighters.length <= 20);
});

test('данные переживают перезапуск сервера', async () => {
  const me = initData(3001, 'Живучий');
  await syncOk({ initData: me, seq: 0, f: 1, hits: 0, coins: 0 });
  await syncOk({ initData: me, seq: 1, f: 1, hits: 7, coins: 9 });
  await stop();
  assert.ok(existsSync(join(dir, 'appdata.json')), 'база сброшена на диск при SIGTERM');
  assert.equal(JSON.parse(readFileSync(join(dir, 'appdata.json'), 'utf8')).users['3001'].c, 9);
  await start();
  assert.deepEqual(await syncOk({ initData: me, seq: 0, f: 1, hits: 0, coins: 0 }), { c: 9, w: 3, seq: 1 });
});

test('перенос из базы виджета: монеты и удары сохраняются, оружие сбрасывается', async () => {
  await stop();
  rmSync(join(dir, 'appdata.json'));
  writeFileSync(join(dir, 'data.json'), JSON.stringify({ rev: 7, victims: [1, 2, 3, 4, 5, 6],
    users: { '4001': { name: 'Старый', c: 777, w: 255, hits: 21 } } }));
  await start();
  assert.deepEqual(await syncOk({ initData: initData(4001, 'Старый'), seq: 0, f: 0, hits: 0, coins: 0 }), { c: 777, w: 3, seq: 0 });
  const top = await (await fetch(base + 'api/top')).json();
  assert.equal(top.victims[0].hits, 6); assert.equal(top.fighters[0].hits, 21);
});

test('битая база не запускает сервер молча с пустыми данными', async () => {
  await stop();
  writeFileSync(join(dir, 'appdata.json'), '{broken');
  await assert.rejects(start(), /server exited|did not start/);
  rmSync(join(dir, 'appdata.json'));
  await start();
});
