export function createWeapons(physics, onDamage, fx, sfx) {
  const { Bodies, Body, Composite, Events, Query } = globalThis.Matter;
  const projectiles = [];
  let active = null, pointer = null, start = null, dragged = false, grabbed = null, elapsed = 0;

  function push(body, point, force, direction) {
    const length = Math.hypot(direction.x, direction.y) || 1;
    physics.impulse(body, point, { x: direction.x / length * force * 100,
      y: direction.y / length * force * 100 });
  }
  function impact(body, point, damage, force, direction, sound = 'punch') {
    push(body, point, force, direction);
    const power = Math.min(1.5, .18 + damage / 35);
    onDamage(damage, point, power);
    fx.burst(point.x, point.y, power * 10); fx.shake(power * 10); sfx.play(sound);
  }
  function origin(point) {
    const b = physics.bounds;
    return { x: point.x < b.x + b.width / 2 ? b.x + 12 : b.x + b.width - 12, y: b.y + b.height * .58 };
  }
  function radial(point, radius) {
    return physics.parts.filter(body => {
      if (Query.point([body], point).length) return true;
      return body.vertices.some(v => Math.hypot(v.x - point.x, v.y - point.y) <= radius)
        || Math.hypot(body.position.x - point.x, body.position.y - point.y) <= radius;
    });
  }
  function melee(point, weapon) {
    fx.swing(point.x, point.y, weapon.icon);
    const bodies = radial(point, weapon.radius ?? 60);
    if (!bodies.length) { sfx.play('slap'); return; }
    const direction = { x: point.x < physics.bounds.x + physics.bounds.width / 2 ? 1 : -1, y: -.35 };
    for (const body of bodies) push(body, body.position, weapon.force, direction);
    const body = physics.nearest(point, weapon.radius ?? 60) ?? bodies[0];
    impact(body, point, weapon.dmg, weapon.force * .25, direction);
  }
  function shoot(point, weapon) {
    const from = origin(start), b = physics.bounds;
    const aimX = point.x - from.x, aimY = point.y - from.y;
    // Луч проходит сквозь точку прицеливания до стены; сторона стрельбы постоянна всю очередь.
    const reach = Math.min(aimX ? ((aimX > 0 ? b.x + b.width : b.x) - from.x) / aimX : Infinity,
      aimY ? ((aimY > 0 ? b.y + b.height : b.y) - from.y) / aimY : Infinity);
    const dx = aimX * (Number.isFinite(reach) ? reach : 1), dy = aimY * (Number.isFinite(reach) ? reach : 1);
    let hit = null, best = 1;
    for (const body of physics.parts) {
      for (let i = 0; i < body.vertices.length; i++) {
        const a = body.vertices[i], b = body.vertices[(i + 1) % body.vertices.length];
        const ex = b.x - a.x, ey = b.y - a.y;
        const divisor = dx * ey - dy * ex;
        if (Math.abs(divisor) < 1e-8) continue;
        const ax = a.x - from.x, ay = a.y - from.y;
        const t = (ax * ey - ay * ex) / divisor, u = (ax * dy - ay * dx) / divisor;
        if (t >= 0 && t <= best && u >= 0 && u <= 1) { best = t; hit = body; }
      }
    }
    const end = hit ? { x: from.x + dx * best, y: from.y + dy * best } : point;
    if (!hit) fx.hole?.(point.x, point.y);
    const laser = weapon.icon === '⚡';
    fx.line(from.x, from.y, end.x, end.y, laser ? '#7df9ff' : '#fff6e0', laser ? 120 : 80);
    fx.burst(from.x, from.y, 2); fx.casing?.(from.x, from.y);
    sfx.play(laser ? 'laser' : 'shot');
    if (hit) {
      push(hit, end, weapon.force, { x: dx, y: dy });
      onDamage(weapon.dmg, end, .2 + weapon.dmg / 35);
      fx.burst(end.x, end.y, 4); fx.shake(2);
    }
  }
  function launch(point, weapon) {
    const b = physics.bounds, drop = weapon.kind === 'drop';
    const from = drop ? { x: Math.max(b.x + 25, Math.min(b.x + b.width - 25, point.x)), y: b.y + 28 } : origin(point);
    const radius = drop ? 25 : weapon.kind === 'bomb' ? 16 : 12;
    const body = drop ? Bodies.rectangle(from.x, from.y, 52, 38, { restitution: .1, density: .035 })
      : Bodies.circle(from.x + (point.x >= from.x ? radius : -radius), from.y, radius,
        { restitution: .35, friction: .4, frictionAir: .002, density: .006 });
    body.label = 'projectile';
    const dx = point.x - body.position.x, dy = point.y - body.position.y, distance = Math.hypot(dx, dy) || 1;
    if (drop) Body.setVelocity(body, { x: 0, y: 3 });
    else {
      const speed = weapon.icon === '🚀' ? 19 : 15, frames = distance / speed;
      Body.setVelocity(body, { x: dx / distance * speed, y: dy / distance * speed - frames * .14 });
      Body.setAngularVelocity(body, .15);
    }
    Composite.add(physics.world, body);
    projectiles.push({ body, weapon, age: 0, spent: false, radius });
    sfx.play(drop ? 'ui-click' : 'slap');
  }
  function remove(projectile) {
    projectile.spent = true;
    Composite.remove(physics.world, projectile.body);
  }
  function explode(projectile) {
    if (projectile.spent) return;
    const { body, weapon } = projectile, point = { ...body.position };
    remove(projectile);
    let damage = 0;
    for (const part of physics.parts) {
      const distance = Math.max(0, Math.hypot(part.position.x - point.x, part.position.y - point.y) - Math.min(part.plugin.w, part.plugin.h) / 2);
      const falloff = Math.max(0, 1 - distance / weapon.radius);
      if (!falloff) continue;
      damage = Math.max(damage, Math.round(weapon.dmg * falloff));
      push(part, part.position, weapon.force * Math.sqrt(falloff), { x: part.position.x - point.x || 1, y: part.position.y - point.y - Math.min(weapon.radius, 350) * .6 });
    }
    const power = Math.min(1.8, .5 + weapon.dmg / 65);
    if (damage > 0) onDamage(damage, point, power);
    fx.burst(point.x, point.y, power * 10); fx.smoke(point.x, point.y, power * 10);
    fx.flash(Math.min(1, power), weapon.icon === '☢️'); fx.shake(power * 10); sfx.play('boom');
  }
  function contacts({ pairs }) {
    for (const pair of pairs) {
      const projectile = projectiles.find(p => !p.spent && (p.body === pair.bodyA || p.body === pair.bodyB));
      if (!projectile) continue;
      const other = projectile.body === pair.bodyA ? pair.bodyB : pair.bodyA;
      if (other.label === 'projectile') continue;
      const { weapon, body } = projectile;
      if (weapon.kind === 'bomb') {
        if (!weapon.fuse) explode(projectile);
      } else if (other.plugin.part) {
        const point = pair.collision.supports.find(Boolean) ?? other.position;
        // Тяжёлый снаряд передаёт толчок всей связанной кукле; груз раздвигает опорные ноги.
        for (const part of physics.parts) {
          if (part === other) continue;
          push(part, part.position, weapon.force * .25, weapon.kind === 'drop'
            ? { x: (part.position.x - point.x) / 40, y: 1 } : body.velocity);
        }
        impact(other, { x: point.x, y: point.y }, weapon.dmg, weapon.force,
          weapon.kind === 'drop' ? { x: .25, y: 1 } : body.velocity);
        remove(projectile);
      }
    }
  }
  Events.on(physics.engine, 'collisionStart', contacts);

  function down(point, weapon) {
    up(true);
    if (!weapon) return;
    active = weapon; pointer = { ...point }; start = { ...point }; dragged = false; elapsed = 0;
    if (weapon.kind === 'hand') grabbed = physics.grab(point);
    else if (weapon.kind === 'melee') melee(point, weapon);
    else if (weapon.kind === 'gun') shoot(point, weapon);
    else launch(point, weapon);
  }
  function move(point) {
    if (!active) return;
    pointer = { ...point };
    if (active.kind === 'hand' && Math.hypot(point.x - start.x, point.y - start.y) > 8) dragged = true;
    if (active.kind === 'hand' && dragged) physics.move(point);
  }
  function up(cancel = false) {
    if (active?.kind === 'hand') {
      physics.release(dragged && !cancel);
      if (!cancel && !dragged && grabbed) impact(grabbed, pointer, 1, .015, { x: grabbed.position.x - pointer.x || 1, y: -25 }, 'slap');
    }
    active = null; grabbed = null;
  }
  function update(dt) {
    if (active?.kind === 'gun') {
      elapsed += Math.max(0, dt);
      const rate = Math.max(30, active.rate ?? 280);
      while (elapsed >= rate) { elapsed -= rate; shoot(pointer, active); }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      projectile.age += Math.max(0, dt);
      if (!projectile.spent && projectile.weapon.kind === 'bomb' && projectile.weapon.fuse > 0 && projectile.age >= projectile.weapon.fuse) explode(projectile);
      if (!projectile.spent && projectile.age > 3000) remove(projectile);
      if (projectile.spent) projectiles.splice(i, 1);
    }
  }
  function draw(ctx) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const projectile of projectiles) {
      if (projectile.spent) continue;
      const { body, weapon, radius } = projectile;
      ctx.save(); ctx.translate(body.position.x, body.position.y); ctx.rotate(body.angle);
      ctx.font = `${radius * 2.4}px sans-serif`; ctx.fillText(weapon.icon, 0, 0);
      if (weapon.kind === 'bomb' && weapon.fuse > 0) {
        ctx.strokeStyle = '#ffce64'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.arc(0, 0, radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - projectile.age / weapon.fuse)); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }
  function clear() {
    physics.release(false); active = null; grabbed = null;
    for (const projectile of projectiles) remove(projectile);
    projectiles.length = 0;
  }
  return { down, move, up, update, draw, clear };
}
