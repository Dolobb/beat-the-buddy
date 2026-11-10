export function createFX(reduced = false) {
  const pool = Array.from({ length: 200 }, () => ({ life: 0 }));
  let cursor = 0, shake = 0, flash = 0, white = false, bubble = null;
  function add(values) {
    const p = pool[cursor++ % pool.length];
    Object.assign(p, { x: 0, y: 0, vx: 0, vy: 0, size: 4, color: '#e3ae30', kind: 'spark', text: '', max: 600 }, values);
    p.life = p.max;
  }
  const api = {
    count: () => pool.reduce((n,p) => n + (p.life > 0),0),
    burst(x,y,power = 5) {
      const n = Math.min(35, 8 + power * 2);
      for (let i=0;i<n;i++) {
        const a = Math.random()*Math.PI*2, speed = 60+Math.random()*160;
        add({ x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed-70,size:2+Math.random()*5,
          color:i%3 ? '#efb73b' : '#fff7d4',max:350+Math.random()*350 });
      }
    },
    text(x,y,text,power = 1,color = '#9b3e18') {
      add({ x,y,text,kind:'text',size:Math.min(42,22+power*.5),vy:-65,max:900,color });
    },
    shake(power) { if (!reduced) shake = Math.min(18, Math.max(shake,power)); },
    flash(power,allWhite = false) { if (!reduced) { flash = Math.min(.85,power); white = allWhite; } },
    offset: () => ({ x: (Math.random()-.5)*shake, y:(Math.random()-.5)*shake }),
    line(x,y,x2,y2,color = '#ffd85c',max = 80) { add({ x,y,x2,y2,color,max,kind:'line' }); },
    swing(x,y,text) { add({ x,y,text,kind:'swing',size:64,max:180 }); },
    smoke(x,y,power = 5) {
      for (let i=0;i<Math.min(30,power*2);i++) add({ x,y,kind:'smoke',color:'#65635b',
        size:12+Math.random()*24,vx:(Math.random()-.5)*120,vy:-30-Math.random()*60,max:1000 });
    },
    casing(x,y) { add({ x,y,vx:80+Math.random()*80,vy:-120,size:4,color:'#c69536',max:550 }); },
    say(text,x,y) { bubble = { text,x,y,life:1600 }; },
    clear() { for (const p of pool) p.life = 0; bubble = null; shake = flash = 0; },
    update(dt) {
      shake *= Math.exp(-dt/90); flash = Math.max(0,flash-dt/300);
      if (bubble) { bubble.life -= dt; if (bubble.life <= 0) bubble = null; }
      for (const p of pool) if (p.life > 0) {
        p.life -= dt; p.x += p.vx*dt/1000; p.y += p.vy*dt/1000;
        if (p.kind === 'spark') p.vy += dt*.35;
      }
    },
    draw(ctx,width) {
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const p of pool) if (p.life > 0) {
        ctx.globalAlpha = Math.min(1,p.life/Math.min(220,p.max)); ctx.fillStyle = p.color;
        if (p.kind === 'text' || p.kind === 'swing') {
          ctx.save(); ctx.translate(p.x,p.y);
          if (p.kind === 'swing') ctx.rotate((1-p.life/p.max)*1.5-.8);
          ctx.font = `800 ${p.size}px system-ui`; ctx.fillText(p.text,0,0); ctx.restore();
        } else if (p.kind === 'line') {
          ctx.strokeStyle=p.color; ctx.lineWidth=3; ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x2,p.y2);ctx.stroke();
        } else {
          ctx.beginPath();ctx.arc(p.x,p.y,p.size*(p.kind==='smoke'?1+(1-p.life/p.max):1),0,Math.PI*2);ctx.fill();
        }
      }
      if (bubble) {
        ctx.globalAlpha=Math.min(1,bubble.life/200);ctx.font='600 15px system-ui';
        const w = Math.min(width-32,ctx.measureText(bubble.text).width+28);
        const x = Math.max(16,Math.min(width-w-16,bubble.x-w/2)), y=Math.max(130,bubble.y-55);
        ctx.fillStyle='#fffdf5';ctx.beginPath();ctx.roundRect(x,y,w,38,12);ctx.fill();
        ctx.beginPath();ctx.moveTo(x+w/2-6,y+37);ctx.lineTo(x+w/2+4,y+47);ctx.lineTo(x+w/2+8,y+37);ctx.fill();
        ctx.fillStyle='#332e25';ctx.fillText(bubble.text,x+w/2,y+19,w-20);
      }
      ctx.restore();
    },
    drawScreen(ctx,width,height) {
      if (flash<=0) return;
      ctx.save();ctx.globalAlpha=flash;ctx.fillStyle=white?'#fff':'#ffce74';ctx.fillRect(0,0,width,height);ctx.restore();
    },
  };
  return api;
}
