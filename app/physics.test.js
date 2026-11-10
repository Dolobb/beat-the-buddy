import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { appWeapons } from '../config.ts';
const require = createRequire(import.meta.url);
const VendorModule = require('node:module');
const vendor = new VendorModule('matter.cjs');
vendor._compile(readFileSync(new URL('./vendor/matter.min.js', import.meta.url), 'utf8'), 'matter.cjs');
globalThis.Matter = vendor.exports;
const { createPhysics } = await import('./physics.js');
const { createWeapons } = await import('./weapons.js');
const M = globalThis.Matter;
const bounds = { x: 0, y: 80, width: 390, height: 580 };
const step = (physics, count = 120) => { for (let i = 0; i < count; i++) physics.update(1000 / 60); };
const effects = () => ({ burst() {}, shake() {}, flash() {}, line() {}, swing() {}, smoke() {} });

test('ragdoll has ten constrained parts, stable alive pose and replaces parts on reset', () => {
  const p = createPhysics(bounds, () => {});
  assert.equal(p.parts.length, 10);
  assert.ok(p.parts.every(b => b.collisionFilter.group < 0 && b.plugin.w > 0 && b.plugin.h > 0));
  const head = p.parts.find(b => b.plugin.part === 'head');
  const original = { ...head.position };
  step(p, 360);
  assert.ok(Math.abs(head.position.x - original.x) < 20);
  assert.ok(Math.abs(head.position.y - original.y) < 35);
  assert.ok(p.parts.every(b => Number.isFinite(b.position.x) && Number.isFinite(b.angle)));
  const oldParts = p.parts;
  p.reset({ ...bounds, width: 500 });
  assert.notEqual(p.parts, oldParts);
  assert.equal(p.bounds.width, 500);
  assert.equal(p.parts[0].position.x, 250);
  p.destroy();
  assert.equal(M.Composite.allBodies(p.world).length, 0);
});

test('grab follows a body, release throws, KO removes the standing support', () => {
  const p = createPhysics(bounds, () => {});
  const head = p.parts[0];
  assert.equal(p.nearest(head.position, 0), head);
  assert.equal(p.nearest({ x: -1000, y: -1000 }, 40), null);
  assert.equal(p.grab(head.position), head);
  p.move({ x: head.position.x + 60, y: head.position.y - 50 });
  step(p, 15);
  assert.ok(head.position.x > bounds.width / 2 + 20);
  p.release();
  assert.ok(head.speed > 0);
  p.reset();
  const y = p.parts[0].position.y;
  p.setKO(true);
  step(p, 120);
  assert.ok(p.parts[0].position.y > y + 80);
  p.destroy();
});

test('wall impacts damage once per part cooldown, are capped and ignore KO', () => {
  const hits = [];
  const p = createPhysics(bounds, (...args) => hits.push(args));
  p.setKO(true);
  const head = p.parts[0];
  M.Body.setPosition(head, { x: 40, y: 160 });
  M.Body.setVelocity(head, { x: -28, y: 0 });
  step(p, 5);
  assert.equal(hits.length, 0);
  p.reset();
  for (const body of p.parts) {
    M.Body.translate(body, { x: -140, y: 0 });
    M.Body.setVelocity(body, { x: -28, y: 0 });
  }
  step(p, 3);
  assert.ok(hits.length > 0);
  assert.ok(hits.every(([damage]) => damage > 0 && damage <= 15));
  assert.ok(hits.filter(([, point]) => point.y < 300).length <= 1);
  p.destroy();
});

test('hand tap damages once; dragging and missed melee do not award damage', () => {
  const p = createPhysics(bounds, () => {}), hits = [];
  const w = createWeapons(p, (...args) => hits.push(args), effects(), { play() {} });
  const point = { ...p.parts[0].position };
  w.down(point, { kind: 'hand', icon: '✋' }); w.up();
  assert.equal(hits.length, 1); assert.equal(hits[0][0], 1);
  w.down(point, { kind: 'hand' }); w.move({ x: point.x + 40, y: point.y }); w.up();
  assert.equal(hits.length, 1);
  w.down({ x: -500, y: -500 }, { kind: 'melee', dmg: 8, radius: 100, force: .12 }); w.up();
  assert.equal(hits.length, 1);
  w.down(point, { kind: 'melee', dmg: 8, radius: 100, force: .12, icon: '🏏' }); w.up();
  assert.equal(hits.at(-1)[0], 8);
  w.clear(); p.destroy();
});

test('guns hit the nearest polygon and sustain their configured fire rate', () => {
  const p = createPhysics(bounds, () => {}), hits = [];
  const w = createWeapons(p, (...args) => hits.push(args), effects(), { play() {} });
  const point = { ...p.parts[0].position };
  w.down(point, { kind: 'gun', dmg: 5, force: .03, rate: 100 });
  w.update(250);
  assert.equal(hits.length, 3);
  w.up(); w.update(500);
  assert.equal(hits.length, 3);
  w.down({ x: 0, y: 80 }, { kind: 'gun', dmg: 5, force: .03, rate: 100 }); w.up();
  assert.equal(hits.length, 3);
  w.clear(); p.destroy();
});

test('projectile contact deals damage only once, bombs detonate once and clear removes bodies', () => {
  const p = createPhysics(bounds, () => {}), hits = [];
  const w = createWeapons(p, (...args) => hits.push(args), effects(), { play() {} });
  const base = M.Composite.allBodies(p.world).length;
  const point = { ...p.parts[0].position };
  w.down(point, { kind: 'throw', dmg: 3, force: .03, icon: '🩴' }); w.up();
  for (let i = 0; i < 60; i++) { p.update(1000 / 60); w.update(1000 / 60); }
  assert.equal(hits.length, 1);
  assert.equal(hits[0][0], 3);
  p.reset(); hits.length = 0;
  w.down(point, { kind: 'bomb', dmg: 300, force: 1.2, radius: 2000, fuse: 100, icon: '☢️' }); w.up();
  w.update(120); w.update(120);
  assert.equal(hits.length, 1);
  assert.ok(hits[0][0] > 200 && hits[0][0] <= 300);
  w.down(point, { kind: 'drop', dmg: 40, force: .3, icon: '⚓' }); w.up();
  assert.ok(M.Composite.allBodies(p.world).length > base);
  w.clear();
  assert.equal(M.Composite.allBodies(p.world).length, base);
  p.destroy();
});

test('grabbing a rotated part anchors exactly under the finger', () => {
  const p = createPhysics(bounds, () => {});
  const body = p.parts.find(b => b.plugin.part === 'hand');
  M.Body.setAngle(body, Math.PI / 3);
  const point = { x: body.position.x + 8, y: body.position.y + 4 };
  assert.equal(p.grab(point), body);
  const grab = M.Composite.allConstraints(p.world).find(c => c.bodyB === body && !c.bodyA);
  assert.ok(grab);
  assert.ok(Math.abs(grab.pointB.x - (point.x - body.position.x)) < .01);
  assert.ok(Math.abs(grab.pointB.y - (point.y - body.position.y)) < .01);
  p.destroy();
});

test('contact rockets and falling heavy objects each damage once', () => {
  for (const weapon of [
    { kind: 'bomb', dmg: 60, force: .5, radius: 240, fuse: 0, icon: '🚀' },
    { kind: 'drop', dmg: 40, force: .3, icon: '⚓' },
  ]) {
    const p = createPhysics(bounds, () => {}), hits = [];
    const w = createWeapons(p, (...args) => hits.push(args), effects(), { play() {} });
    w.down({ ...p.parts[0].position }, weapon); w.up();
    for (let i = 0; i < 150; i++) { p.update(1000 / 60); w.update(1000 / 60); }
    assert.equal(hits.length, 1, weapon.kind);
    assert.ok(hits[0][0] > 0 && hits[0][0] <= weapon.dmg);
    w.clear(); p.destroy();
  }
});

const roomBounds = { x: 0, y: 0, width: 390, height: 716 };
const frameTime = 1000 / 60;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const maxSpeed = p => Math.max(...p.parts.map(b => b.speed));

function weaponSimulation(t, name, { burst = false, besideTorso = false } = {}) {
  let frame = 0, lastDamageFrame = null, wallReached = false;
  const hits = [];
  const p = createPhysics(roomBounds, () => {});
  const w = createWeapons(p, (...args) => { hits.push(args); lastDamageFrame = frame; }, effects(), { play() {} });
  t.after(() => { w.clear(); p.destroy(); });
  step(p, 180);
  const torso = p.parts[1], head = p.parts[0];
  const start = { ...torso.position }, headStart = { ...head.position };
  const weapon = appWeapons.find(w => w.name === name);
  assert.ok(weapon, name);
  M.Events.on(p.engine, 'collisionStart', ({ pairs }) => {
    for (const pair of pairs) {
      const wall = [pair.bodyA, pair.bodyB].find(b => b.label === 'wall');
      if (wall && (wall.position.x < 0 || wall.position.x > roomBounds.width)
        && [pair.bodyA, pair.bodyB].some(b => b.plugin.part)) wallReached = true;
    }
  });
  const point = { ...start };
  if (besideTorso) point.x -= 40;
  w.down(point, weapon);
  if (!burst) w.up();
  if (besideTorso) {
    // Контролируем место взрыва, сохраняя настоящий fuse/контакт и импульсы createWeapons.
    const projectile = M.Composite.allBodies(p.world).find(b => b.label === 'projectile');
    assert.ok(projectile);
    M.Body.setPosition(projectile, point);
    M.Body.setVelocity(projectile, { x: 0, y: 0 });
    if (weapon.fuse) w.update(weapon.fuse);
    else { p.update(frameTime); w.update(frameTime); }
    assert.equal(hits.length, 1, `${name}: detonation`);
    assert.ok(distance(hits[0][1], point) < 1, `${name}: blast must be 40 px beside torso`);
  }
  let torsoX = 0, torsoDistance = 0, headDistance = 0, headDown = 0, torsoDown = 0, first30X = 0;
  const frames = new Map();
  for (frame = 1; frame <= 420; frame++) {
    p.update(frameTime); w.update(frameTime);
    if (burst && frame === 60) w.up();
    const dx = Math.abs(torso.position.x - start.x);
    torsoX = Math.max(torsoX, dx);
    torsoDistance = Math.max(torsoDistance, distance(torso.position, start));
    headDistance = Math.max(headDistance, distance(head.position, headStart));
    headDown = Math.max(headDown, head.position.y - headStart.y);
    torsoDown = Math.max(torsoDown, torso.position.y - start.y);
    if (frame <= 30) first30X = Math.max(first30X, dx);
    frames.set(frame, { torsoX: dx, headHome: distance(head.position, p.home), speed: maxSpeed(p),
      angularSpeed: Math.max(...p.parts.map(b => Math.abs(b.angularVelocity))) });
    assert.ok(p.parts.every(b => Number.isFinite(b.position.x) && Number.isFinite(b.position.y) && Number.isFinite(b.angle)));
  }
  assert.ok(hits.length > 0, `${name}: actual weapon must hit`);
  const recovered = frames.get(lastDamageFrame + 150);
  assert.ok(recovered.headHome < 25, `${name}: home at 2.5 s: ${recovered.headHome}`);
  assert.ok(recovered.speed < .1, `${name}: speed at 2.5 s: ${recovered.speed}`);
  for (let i = lastDamageFrame + 150; i <= 420; i++) {
    assert.ok(frames.get(i).speed < .1, `${name}: must stay still after recovery, frame ${i}`);
    assert.ok(frames.get(i).angularSpeed < .002, `${name}: must stop spinning, frame ${i}`);
  }
  t.diagnostic(JSON.stringify({ name, torsoX, torsoDistance, headDistance, headDown, torsoDown, wallReached,
    recoverySpeed: recovered.speed }));
  return { torsoX, torsoDistance, headDistance, headDown, torsoDown, first30X, frames, wallReached, hits };
}

test('acceptance: 600 idle frames stay still throughout the final 300', t => {
  const p = createPhysics(roomBounds, () => {});
  t.after(() => p.destroy());
  let speed = 0, angularSpeed = 0;
  for (let i = 0; i < 600; i++) {
    step(p, 1);
    if (i < 300) continue;
    speed = Math.max(speed, maxSpeed(p));
    angularSpeed = Math.max(angularSpeed, ...p.parts.map(b => Math.abs(b.angularVelocity)));
  }
  assert.ok(speed < .1, `idle speed: ${speed}`);
  assert.ok(angularSpeed < .002, `idle angular speed: ${angularSpeed}`);
  t.diagnostic(JSON.stringify({ speed, angularSpeed }));
});

test('acceptance: configured fist moves the chest >=25 px in 30 frames and returns by 180', t => {
  const result = weaponSimulation(t, 'Кулак');
  assert.ok(result.first30X >= 25, `${result.first30X} px`);
  assert.ok(result.frames.get(180).torsoX < 12);
  assert.ok(result.frames.get(180).speed < .3);
  t.diagnostic(JSON.stringify({ fistAt180: result.frames.get(180) }));
});

test('acceptance: configured bat throws the torso >=90 px to a wall', t => {
  const result = weaponSimulation(t, 'Бита');
  assert.ok(result.torsoX >= 90, `${result.torsoX} px`);
  assert.ok(result.wallReached);
});

test('acceptance: configured pistol shot moves the torso >=8 px', t => {
  const result = weaponSimulation(t, 'Пистолет');
  assert.equal(result.hits.length, 1);
  assert.ok(result.torsoX >= 8, `${result.torsoX} px`);
});

test('gun ray reaches beyond the aim point and keeps its side while aiming across the centre', t => {
  const p = createPhysics(roomBounds, () => {}), hits = [], origins = [];
  const fx = { ...effects(), line(x) { origins.push(x); } };
  const w = createWeapons(p, (...args) => hits.push(args), fx, { play() {} });
  t.after(() => { w.clear(); p.destroy(); });
  step(p, 180);
  const aim = { x: roomBounds.width / 2 + 1, y: p.parts[1].position.y };
  for (const part of p.parts) M.Body.translate(part, { x: -90, y: 0 });
  const weapon = appWeapons.find(w => w.name === 'Пистолет');
  w.down(aim, weapon);
  assert.equal(hits.length, 1);
  assert.ok(hits[0][1].x < aim.x - 8);
  w.move({ x: aim.x - 90, y: aim.y }); w.update(weapon.rate); w.up();
  assert.equal(hits.length, 2);
  assert.deepEqual(origins, [roomBounds.width - 12, roomBounds.width - 12]);
});

for (const name of ['Пулемёт', 'Лазер']) {
  test(`acceptance: ${name} burst for one second drives the body >=60 px to a wall`, t => {
    const result = weaponSimulation(t, name, { burst: true });
    assert.ok(result.torsoX >= 60, `${result.torsoX} px`);
    assert.ok(result.wallReached);
    assert.ok(result.hits.length >= 10);
  });
}

test('acceptance: grenade and rocket free the head, rocket throws at least as far; recover by 240', t => {
  const grenade = weaponSimulation(t, 'Граната', { besideTorso: true });
  const rocket = weaponSimulation(t, 'Базука', { besideTorso: true });
  assert.ok(grenade.torsoDistance >= 150 || grenade.wallReached);
  assert.ok(grenade.headDistance >= 100, `${grenade.headDistance} px`);
  assert.ok(rocket.torsoDistance >= grenade.torsoDistance, `${rocket.torsoDistance} < ${grenade.torsoDistance}`);
  assert.ok(grenade.frames.get(240).headHome < 25);
  assert.ok(grenade.frames.get(240).speed < .5);
  t.diagnostic(JSON.stringify({ grenadeAt240: grenade.frames.get(240) }));
});

test('acceptance: brick reaches a wall, slipper nudges and falling anvil crushes down', t => {
  assert.ok(weaponSimulation(t, 'Тапок').torsoX > 8);
  const brick = weaponSimulation(t, 'Кирпич');
  assert.ok(brick.torsoX >= 90 && brick.wallReached);
  const anvil = weaponSimulation(t, 'Наковальня');
  assert.ok(anvil.headDown >= 80 && anvil.torsoDown >= 40);
});

test('acceptance: nuclear blast has the greatest throw', t => {
  const rocket = weaponSimulation(t, 'Базука', { besideTorso: true });
  const nuclear = weaponSimulation(t, 'Ядерка', { besideTorso: true });
  assert.ok(nuclear.torsoDistance >= rocket.torsoDistance);
});

test('configured grenade and rocket also throw the head when launched normally', t => {
  for (const name of ['Граната', 'Базука']) {
    const result = weaponSimulation(t, name);
    assert.ok(result.headDistance >= 100, `${name}: ${result.headDistance} px`);
    assert.ok(result.wallReached);
  }
});

test('acceptance: KO still drops the head >=80 px in 120 frames in the full room', t => {
  const p = createPhysics(roomBounds, () => {});
  t.after(() => p.destroy());
  step(p, 180);
  const y = p.parts[0].position.y;
  p.setKO(true); step(p, 120);
  const headDrop = p.parts[0].position.y - y;
  assert.ok(headDrop >= 80);
  t.diagnostic(JSON.stringify({ headDrop }));
});

test('configured hand still drags and throws without dealing damage', t => {
  const p = createPhysics(roomBounds, () => {}), hits = [];
  const w = createWeapons(p, (...args) => hits.push(args), effects(), { play() {} });
  t.after(() => { w.clear(); p.destroy(); });
  step(p, 180);
  const head = p.parts[0], start = { ...head.position };
  w.down(start, appWeapons.find(w => w.kind === 'hand'));
  w.move({ x: start.x + 60, y: start.y - 50 }); step(p, 15);
  assert.ok(head.position.x > start.x + 20);
  w.move({ x: start.x + 90, y: start.y - 50 }); step(p, 1);
  w.up();
  const thrownX = head.position.x;
  assert.ok(head.speed > 0);
  step(p, 5);
  assert.ok(head.position.x > thrownX + 5);
  assert.equal(hits.length, 0);
});

test('configured hand tap nudges the body and deals one damage', t => {
  const result = weaponSimulation(t, 'Рука');
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0][0], 1);
  assert.ok(result.torsoDistance > 0);
});

test('weapon impulses survive frames smaller than the fixed physics step', t => {
  const scenes = [1, 2].map(() => {
    const p = createPhysics(roomBounds, () => {});
    const w = createWeapons(p, () => {}, effects(), { play() {} });
    t.after(() => { w.clear(); p.destroy(); });
    step(p, 180);
    w.down({ ...p.parts[1].position }, appWeapons.find(w => w.name === 'Кулак')); w.up();
    return p;
  });
  for (let i = 0; i < 240; i++) {
    scenes[0].update(frameTime);
    scenes[1].update(frameTime / 2); scenes[1].update(frameTime / 2);
  }
  for (let i = 0; i < scenes[0].parts.length; i++) {
    assert.ok(distance(scenes[0].parts[i].position, scenes[1].parts[i].position) < 1e-8);
  }
});
