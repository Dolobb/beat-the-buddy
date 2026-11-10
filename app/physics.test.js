import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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
