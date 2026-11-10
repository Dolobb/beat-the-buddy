// Эффекты: всё, что делает удар сочным. Рисуется на canvas поверх сцены.
const FX_INK = '#21140f', FX_PAPER = '#fff6e0', FX_YOLK = '#ffcf1f', FX_BLOOD = '#ff4530';
const FX_DISPLAY = "'Dela Gothic One', sans-serif";
const WORDS = ['БАМ!', 'ХРЯСЬ!', 'БДЫЩ!', 'ШМЯК!', 'ТЫЩ!', 'БУХ!', 'ХЛОП!', 'ДЫЩ!'];

export function createFX(reduced = false) {
  const pool = Array.from({ length: 200 }, () => ({ life: 0 }));
  const decals = [];
  let cursor = 0, shake = 0, flash = 0, white = false, bubble = null, zoom = 0, lastWord = -1, onCoin = () => {};
  function add(values) {
    const p = pool[cursor++ % pool.length];
    Object.assign(p, { x: 0, y: 0, vx: 0, vy: 0, size: 4, color: FX_YOLK, kind: 'spark', text: '', max: 600, rot: 0, spin: 0, g: 0 }, values);
    p.life = p.max;
    return p;
  }
  function outlined(ctx, text, fill, stroke = 6) {
    ctx.lineJoin = 'round'; ctx.lineWidth = stroke; ctx.strokeStyle = FX_INK; ctx.strokeText(text, 0, 0);
    ctx.fillStyle = fill; ctx.fillText(text, 0, 0);
  }
  function star(ctx, spikes, outer, inner) {
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 ? inner : outer, a = i * Math.PI / spikes;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  }
  const api = {
    count: () => pool.reduce((n, p) => n + (p.life > 0), 0),
    onCoin(fn) { onCoin = fn; },
    burst(x, y, power = 5) {
      const n = Math.min(26, 6 + power * 2);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, speed = 90 + Math.random() * 260;
        add({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 90, size: 3 + Math.random() * 6, g: 900,
          color: i % 3 ? FX_YOLK : FX_PAPER, max: 300 + Math.random() * 300, rot: Math.random() * 6, spin: (Math.random() - .5) * 20 });
      }
    },
    ring(x, y, power = 5) { add({ x, y, kind: 'ring', size: 14 + power * 2.2, max: 260 }); },
    // «+12» над ударом
    text(x, y, text, power = 1, color = FX_YOLK) {
      add({ x: x + (Math.random() - .5) * 30, y, text, kind: 'text', size: Math.min(46, 20 + power * .9), vy: -80, max: 850, color,
        rot: (Math.random() - .5) * .3 });
    },
    // Комикс-слово на звёздочке: только на заметных ударах
    word(x, y, power) {
      let i; do { i = Math.floor(Math.random() * WORDS.length); } while (i === lastWord); lastWord = i;
      add({ x, y, text: WORDS[i], kind: 'word', size: Math.min(44, 22 + power), max: 620, rot: (Math.random() - .5) * .5 });
    },
    lines(x, y) { add({ x, y, kind: 'lines', max: 150, rot: Math.random() * 6 }); },
    // Монетка вылетает из удара и летит в счётчик
    coin(x, y, tx, ty, delay = 0) {
      const a = Math.random() * Math.PI * 2, speed = 220 + Math.random() * 260;
      add({ x, y, tx, ty, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 260, kind: 'coin', size: 9, max: 5000, age: -delay });
    },
    dust(x, y, power = 3) {
      for (let i = 0; i < Math.min(8, 3 + power); i++) add({ x: x + (Math.random() - .5) * 30, y, kind: 'smoke', color: '#fff6e0cc',
        size: 5 + Math.random() * 9, vx: (Math.random() - .5) * 160, vy: -20 - Math.random() * 50, max: 420 });
    },
    crack(x, y, power = 5) {
      const rays = [];
      for (let i = 0, n = 4 + Math.floor(Math.random() * 3); i < n; i++) {
        const a = Math.random() * Math.PI * 2, len = 10 + Math.random() * (10 + power * 2), bend = (Math.random() - .5) * 1.2;
        rays.push([Math.cos(a) * len * .5, Math.sin(a) * len * .5, Math.cos(a + bend) * len, Math.sin(a + bend) * len]);
      }
      decals.push({ x, y, rays }); if (decals.length > 28) decals.shift();
    },
    hole(x, y) { decals.push({ x, y, hole: 3 + Math.random() * 2 }); if (decals.length > 28) decals.shift(); },
    shake(power) { if (!reduced) shake = Math.min(22, Math.max(shake, power)); },
    zoom(power) { if (!reduced) zoom = Math.min(.14, Math.max(zoom, power)); },
    flash(power, allWhite = false) { if (!reduced) { flash = Math.min(.9, power); white = allWhite; } },
    offset: () => ({ x: (Math.random() - .5) * shake, y: (Math.random() - .5) * shake, zoom }),
    line(x, y, x2, y2, color = FX_PAPER, max = 80) { add({ x, y, x2, y2, color, max, kind: 'line' }); },
    swing(x, y, text) { add({ x, y, text, kind: 'swing', size: 70, max: 190 }); },
    smoke(x, y, power = 5) {
      for (let i = 0; i < Math.min(26, power * 2); i++) add({ x, y, kind: 'smoke', color: i % 4 ? '#3a2a22' : FX_BLOOD,
        size: 12 + Math.random() * 26, vx: (Math.random() - .5) * 240, vy: -40 - Math.random() * 160, max: 900 });
    },
    casing(x, y) { add({ x, y, vx: 80 + Math.random() * 120, vy: -260, size: 5, g: 1100, color: '#c69536', max: 600, spin: 18 }); },
    say(text, x, y) { bubble = { text, x, y, life: 1700, max: 1700 }; },
    clear(keepDecals = false) { for (const p of pool) p.life = 0; bubble = null; shake = flash = zoom = 0; if (!keepDecals) decals.length = 0; },
    update(dt) {
      shake *= Math.exp(-dt / 90); zoom *= Math.exp(-dt / 140); flash = Math.max(0, flash - dt / 320);
      if (bubble) { bubble.life -= dt; if (bubble.life <= 0) bubble = null; }
      const s = dt / 1000;
      for (const p of pool) if (p.life > 0) {
        if (p.kind === 'coin') {
          p.age += dt;
          if (p.age < 0) continue;
          if (p.age < 260) { p.vy += 900 * s; p.x += p.vx * s; p.y += p.vy * s; p.vx *= .96; }
          else { // летит в счётчик с ускорением
            const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), speed = 500 + (p.age - 260) * 4;
            if (d < speed * s + 6) { p.life = 0; onCoin(); continue; }
            p.x += dx / d * speed * s; p.y += dy / d * speed * s;
          }
          continue;
        }
        p.life -= dt; p.vy += p.g * s; p.x += p.vx * s; p.y += p.vy * s; p.rot += p.spin * s;
        if (p.kind === 'text') p.vy *= .94;
      }
    },
    drawDecals(ctx) {
      ctx.save(); ctx.strokeStyle = '#21140f66'; ctx.fillStyle = '#21140f99'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      for (const d of decals) {
        if (d.hole) { ctx.beginPath(); ctx.arc(d.x, d.y, d.hole, 0, Math.PI * 2); ctx.fill(); continue; }
        ctx.beginPath();
        for (const [x1, y1, x2, y2] of d.rays) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + x1, d.y + y1); ctx.lineTo(d.x + x2, d.y + y2); }
        ctx.stroke();
      }
      ctx.restore();
    },
    draw(ctx, width) {
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const p of pool) if (p.life > 0) {
        const t = 1 - p.life / p.max; // 0 → 1
        if (p.kind === 'coin') {
          if (p.age < 0) continue;
          ctx.fillStyle = FX_YOLK; ctx.strokeStyle = FX_INK; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * Math.abs(Math.cos(p.age / 70)) + 2, p.size, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          continue;
        }
        ctx.globalAlpha = Math.min(1, p.life / Math.min(180, p.max));
        if (p.kind === 'text' || p.kind === 'word') {
          const pop = t < .12 ? .4 + t / .12 * .85 : t < .2 ? 1.25 - (t - .12) / .08 * .25 : 1; // влетает с перелётом
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(pop, pop);
          ctx.font = `${p.size}px ${FX_DISPLAY}`;
          if (p.kind === 'word') {
            const w = ctx.measureText(p.text).width;
            ctx.save(); ctx.scale(w / 60 + .5, 1); star(ctx, 9, p.size * 1.25, p.size * .8);
            ctx.fillStyle = FX_BLOOD; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = FX_INK; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
            outlined(ctx, p.text, FX_PAPER, 6);
          } else outlined(ctx, p.text, p.color, Math.max(5, p.size * .22));
          ctx.restore();
        } else if (p.kind === 'swing') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * 1.9 - .9); ctx.font = `${p.size}px sans-serif`; ctx.fillText(p.text, 0, -18); ctx.restore();
        } else if (p.kind === 'ring') {
          ctx.globalAlpha = 1 - t; ctx.strokeStyle = FX_PAPER; ctx.lineWidth = 7 * (1 - t) + 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (.3 + t * 1.5), 0, Math.PI * 2); ctx.stroke();
        } else if (p.kind === 'lines') {
          ctx.globalAlpha = 1 - t; ctx.strokeStyle = FX_PAPER; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath();
          for (let i = 0; i < 12; i++) { const a = p.rot + i * Math.PI / 6 + (i % 2) * .15, r1 = 46 + t * 60 + (i % 3) * 14, r2 = r1 + 40 + (i % 2) * 34;
            ctx.moveTo(p.x + Math.cos(a) * r1, p.y + Math.sin(a) * r1); ctx.lineTo(p.x + Math.cos(a) * r2, p.y + Math.sin(a) * r2); }
          ctx.stroke();
        } else if (p.kind === 'line') {
          ctx.strokeStyle = FX_INK; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke();
          ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.stroke();
        } else if (p.kind === 'smoke') {
          ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + t), 0, Math.PI * 2); ctx.fill();
        } else { // искра-осколок
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore();
        }
      }
      if (bubble) {
        const t = 1 - bubble.life / bubble.max, pop = t < .08 ? t / .08 : 1;
        ctx.globalAlpha = Math.min(1, bubble.life / 180); ctx.font = "700 15px 'Golos Text', system-ui";
        const w = Math.min(width - 28, ctx.measureText(bubble.text).width + 30), h = 42;
        const x = Math.max(14, Math.min(width - w - 14, bubble.x - w / 2)), y = Math.max(96, bubble.y - 70);
        ctx.save(); ctx.translate(x + w / 2, y + h); ctx.scale(pop, pop); ctx.translate(-w / 2, -h);
        ctx.fillStyle = FX_PAPER; ctx.strokeStyle = FX_INK; ctx.lineWidth = 3; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.roundRect(0, 0, w, h, 14); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w / 2 - 9, h - 1.5); ctx.lineTo(w / 2 + 1, h + 12); ctx.lineTo(w / 2 + 9, h - 1.5); ctx.fill();
        ctx.beginPath(); ctx.moveTo(w / 2 - 9, h); ctx.lineTo(w / 2 + 1, h + 12); ctx.lineTo(w / 2 + 9, h); ctx.stroke();
        ctx.fillStyle = FX_INK; ctx.fillText(bubble.text, w / 2, h / 2 + 1, w - 22); ctx.restore();
      }
      ctx.restore();
    },
    drawScreen(ctx, width, height) {
      if (flash <= 0) return;
      ctx.save(); ctx.globalAlpha = flash; ctx.fillStyle = white ? '#fff' : FX_PAPER; ctx.fillRect(0, 0, width, height); ctx.restore();
    },
  };
  return api;
}
