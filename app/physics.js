export function createPhysics(initialBounds, onHit) {
  const { Engine, Bodies, Body, Composite, Constraint, Events, Query, Vector } = globalThis.Matter;
  const engine = Engine.create({ positionIterations: 8, constraintIterations: 5 });
  const world = engine.world;
  world.gravity.y = 1;
  let support, held = null, ko = false, pointer = null, pointerVelocity = { x: 0, y: 0 }, acc = 0, poses = [], squash = new Map();
  const lastHit = new Map();
  const api = { engine, world, parts: [], bounds: { ...initialBounds }, reset, setKO, update, nearest, grab, move, release, destroy, squash, punch };

  function reset(nextBounds = api.bounds) {
    release(false);
    Composite.clear(world, false);
    Engine.clear(engine);
    lastHit.clear(); ko = false; acc = 0; poses = []; squash.clear();
    api.bounds = { ...nextBounds };
    const { x, y, width, height } = api.bounds;
    const wall = { isStatic: true, restitution: .3, friction: .65, label: 'wall' };
    Composite.add(world, [
      Bodies.rectangle(x - 30, y + height / 2, 60, height + 120, wall),
      Bodies.rectangle(x + width + 30, y + height / 2, 60, height + 120, wall),
      Bodies.rectangle(x + width / 2, y - 30, width, 60, wall),
      Bodies.rectangle(x + width / 2, y + height + 30, width, 60, wall),
    ]);
    const scale = Math.min(height * .64 / 860, width / 560);
    const group = Body.nextGroup(true), parts = [];
    const cx = x + width / 2, top = y + height * .19;
    function part(name, side, px, py, w, h, circle = false) {
      const options = { collisionFilter: { group }, friction: .55, frictionAir: .018, restitution: .22,
        density: .002, label: name, plugin: { part: name, side, w, h } };
      const body = circle ? Bodies.circle(px, py, w / 2, options) : Bodies.rectangle(px, py, w, h, { ...options, chamfer: { radius: Math.min(w, h) * .16 } });
      parts.push(body); return body;
    }
    function joint(a, b, pointA, pointB) {
      Composite.add(world, Constraint.create({ bodyA: a, bodyB: b, pointA, pointB, length: 0, stiffness: .9, damping: .25 }));
      poses.push([b, a]);
    }
    const tw = 204 * scale, th = 268 * scale, headSize = tw * 1.3;
    const head = part('head', 0, cx, top + headSize / 2, headSize, headSize, true);
    const torso = part('torso', 0, cx, head.position.y + headSize * .37 + th / 2, tw, th);
    joint(head, torso, { x: 0, y: headSize * .35 }, { x: 0, y: -th * .5 });
    for (const side of [-1, 1]) {
      const aw = 84 * scale, ah = 198 * scale, hw = 83 * scale, hh = 233 * scale;
      const shoulder = { x: cx + side * tw * .48, y: torso.position.y - th * .34 };
      const arm = part('arm', side, shoulder.x + side * aw * .15, shoulder.y + ah * .42, aw, ah);
      const hand = part('hand', side, arm.position.x, arm.position.y + ah * .42 + hh * .42, hw, hh);
      joint(torso, arm, { x: side * tw * .48, y: -th * .34 }, { x: 0, y: -ah * .42 });
      joint(arm, hand, { x: 0, y: ah * .42 }, { x: 0, y: -hh * .42 });
      const thighH = 218 * scale, shinH = 252 * scale;
      const hipY = torso.position.y + th * .38;
      const thigh = part('thigh', side, cx + side * tw * .25, hipY + thighH * .42, 96 * scale, thighH);
      const shin = part('shin', side, thigh.position.x, thigh.position.y + thighH * .42 + shinH * .42, 131 * scale, shinH);
      joint(torso, thigh, { x: side * tw * .25, y: th * .38 }, { x: 0, y: -thighH * .42 });
      joint(thigh, shin, { x: 0, y: thighH * .42 }, { x: 0, y: -shinH * .42 });
    }
    // Ставим на пол: сдвигаем всё тело так, чтобы ступни касались пола, и вешаем «кукловода» за голову.
    const lowest = Math.max(...parts.map(b => b.bounds.max.y));
    for (const b of parts) Body.translate(b, { x: 0, y: y + height - 1 - lowest });
    support = Constraint.create({ pointA: { ...head.position }, bodyB: head, length: 0, stiffness: .03, damping: .25 });
    api.home = { ...head.position };
    Composite.add(world, [...parts, support]);
    api.parts = parts;
  }

  function setKO(value) {
    ko = value;
    support.stiffness = value ? 0 : .03;
    if (value) {
      release(false);
      // Подкашиваем колени и роняем корпус, иначе идеально ровная стойка так и стоит столбом.
      const dir = Math.random() < .5 ? -1 : 1;
      for (const b of api.parts) {
        const part = b.plugin.part;
        if (part === 'thigh') Body.setAngularVelocity(b, dir * .16);
        else if (part === 'shin') Body.setAngularVelocity(b, -dir * .2);
        else if (part === 'torso' || part === 'head') Body.setVelocity(b, { x: b.velocity.x + dir * 2.5, y: b.velocity.y });
      }
    }
  }

  function nearest(point, maxDistance = 60) {
    const inside = Query.point(api.parts, point);
    if (inside.length) return inside.find(b => b.plugin.part === 'head') ?? inside[0];
    let result = null, best = maxDistance;
    for (const body of api.parts) {
      for (let i = 0; i < body.vertices.length; i++) {
        const a = body.vertices[i], b = body.vertices[(i + 1) % body.vertices.length];
        const vx = b.x - a.x, vy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((point.x - a.x) * vx + (point.y - a.y) * vy) / (vx * vx + vy * vy)));
        const distance = Math.hypot(point.x - a.x - vx * t, point.y - a.y - vy * t);
        if (distance <= best) { best = distance; result = body; }
      }
    }
    return result;
  }

  function grab(point) {
    release(false);
    const body = nearest(point, 40);
    if (!body || ko) return null;
    pointer = { ...point }; pointerVelocity = { x: 0, y: 0 };
    held = Constraint.create({ pointA: { ...point }, bodyB: body,
      pointB: Vector.sub(point, body.position), length: 0, stiffness: .2, damping: .15 });
    Composite.add(world, held);
    support.stiffness = .0015; // в руке висит свободно, а не тянется резинкой к стойке
    return body;
  }

  function move(point) {
    if (!held) return;
    pointerVelocity = { x: point.x - pointer.x, y: point.y - pointer.y };
    pointer = { ...point };
    held.pointA = { ...point };
  }

  function release(throwIt = true) {
    if (!held) return;
    if (throwIt) {
      const body = held.bodyB;
      const vx = body.velocity.x + pointerVelocity.x * .6, vy = body.velocity.y + pointerVelocity.y * .6;
      const factor = Math.min(1, 32 / Math.max(1, Math.hypot(vx, vy)));
      Body.setVelocity(body, { x: vx * factor, y: vy * factor });
    }
    Composite.remove(world, held); held = null; pointer = null;
    if (!ko && support) support.stiffness = .03;
  }

  // Фиксированный шаг: переменный dt раскачивает интегратор Matter (тело начинает дёргаться само).
  const STEP = 1000 / 60;
  function update(dt) {
    acc += Math.min(Math.max(dt, 0), 100);
    while (acc >= STEP) { acc -= STEP; step(); }
    for (const [id, v] of squash) { const n = v * .82; if (n < .01) squash.delete(id); else squash.set(id, n); }
  }
  function step() {
    const torso = api.parts[1];
    if (!ko && !held) Body.setAngularVelocity(torso, torso.angularVelocity * .86 - Math.sin(torso.angle) * .03);
    // Поза: каждая часть мягко возвращается к углу родителя. Живой — упруго, в нокауте — тряпка.
    const k = ko ? 0 : .022, damp = ko ? .99 : .9;
    for (const [child, parent] of poses) {
      const w = child.angularVelocity * damp - Math.sin(child.angle - parent.angle) * k;
      Body.setAngularVelocity(child, Math.max(-.55, Math.min(.55, w)));
    }
    for (const body of api.parts) {
      if (body.speed > 42) Body.setVelocity(body, Vector.mult(body.velocity, 42 / body.speed));
    }
    Engine.update(engine, STEP);
  }
  function punch(body, amount = .35) { squash.set(body.id, Math.min(.6, Math.max(squash.get(body.id) ?? 0, amount))); }

  function impacts({ pairs }) {
    if (ko) return;
    for (const pair of pairs) {
      const body = pair.bodyA.label === 'wall' ? pair.bodyB : pair.bodyB.label === 'wall' ? pair.bodyA : null;
      if (!body?.plugin.part || body.speed < 5 || engine.timing.timestamp - (lastHit.get(body.id) ?? -1000) < 230) continue;
      lastHit.set(body.id, engine.timing.timestamp);
      const point = pair.collision.supports.find(Boolean) ?? body.position;
      onHit(Math.min(15, Math.max(1, Math.round((body.speed - 4) * .7))), { x: point.x, y: point.y }, body.speed / 20);
    }
  }
  function destroy() {
    release(false); Events.off(engine, 'collisionStart', impacts); Composite.clear(world, false); Engine.clear(engine);
  }
  Events.on(engine, 'collisionStart', impacts);
  reset();
  return api;
}
