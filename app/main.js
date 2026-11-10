import { createPhysics } from './physics.js';
import { createWeapons } from './weapons.js';
import { createFX } from './fx.js';
import { createSFX } from './sfx.js';
import { createNet, storage } from './net.js';

const $ = id => document.getElementById(id);
const canvas=$('scene'), ctx=canvas.getContext('2d'), tg=globalThis.Telegram?.WebApp;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const fx=createFX(reduced), sfx=createSFX(storage.get('mute',false));
let config, manifest, physics, weapons, net, width=0, height=0, hp=200, koAt=null, clock=0, freeze=0;
let friend=storage.get('friend',0), selected=storage.get('weapon',0), outfits=storage.get('outfits',{});
let muted=storage.get('mute',false), confirmed=-1, confirmUntil=0, shownCoins=0;
let combo=0, lastHit=-2000, lastCoinSound=0, lastFrame=0, frame=0, pointer=null, drawOrder=[], redUntil=0;
const images=new Map(), weaponButtons=[];
let account={c:0,w:3,buying:false,offline:false,persisted:true}, myId=1;
try { myId=JSON.parse(new URLSearchParams(tg?.initData ?? '').get('user')).id; } catch {}

function haptic(method,value) {
  if (!tg?.initData) return;
  try { tg.HapticFeedback?.[method]?.(value); } catch {}
}
function setupTelegram() {
  if (!tg) return;
  tg.ready();tg.expand();tg.disableVerticalSwipes?.();
  function theme() {
    const bg=tg.themeParams?.bg_color ?? '#faf7ef';
    try { tg.setHeaderColor(bg);tg.setBackgroundColor(bg); } catch {}
  }
  theme();tg.onEvent?.('themeChanged',theme);
  if (tg.initData && tg.isVersionAtLeast?.('8.0')) { tg.requestFullscreen?.();tg.lockOrientation?.(); }
}
function sheet() { return outfits[config.friends[friend].id] ? config.friends[friend].outfit ?? 'naked' : 'naked'; }
function bounds() {
  const top=$('hud').getBoundingClientRect().bottom+8, bottom=$('shelf').getBoundingClientRect().top-8;
  return { x:10,y:top,width:Math.max(100,width-20),height:Math.max(120,bottom-top) };
}
function sortedParts() {
  const layer=b=>b.plugin.part==='head'?4:b.plugin.part==='torso'?2:
    ['arm','hand'].includes(b.plugin.part)?(b.plugin.side<0?0:5):(b.plugin.side<0?1:3);
  drawOrder=[...physics.parts].sort((a,b)=>layer(a)-layer(b));
}
function resize() {
  width=innerWidth;height=innerHeight;
  const dpr=devicePixelRatio || 1;
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  if (physics) {
    weapons.clear();physics.reset(bounds());physics.setKO(hp<=0);sortedParts();pointer=null;
  }
}
function resetFriend(index=friend) {
  friend=index;hp=config.hp;koAt=null;combo=0;lastHit=-2000;freeze=0;redUntil=0;
  storage.set('friend',friend);weapons.clear();physics.reset(bounds());sortedParts();fx.clear();pointer=null;
  $('friend-name').textContent=config.friends[friend].name;
  $('outfit-button').disabled=!config.friends[friend].outfit;
  $('outfit-button').setAttribute('aria-pressed',String(sheet()!=='naked'));
  health();
}
function health() {
  $('hp-fill').style.transform=`scaleX(${hp/config.hp})`;
  $('hp-fill').style.background=hp<config.hp*.25?'#a53c2e':hp<config.hp*.5?'#ad7b2c':'#71845a';
  $('hp-label').textContent=hp<=0?'НОКАУТ':`${hp} / ${config.hp}`;
  $('health').setAttribute('aria-valuenow',hp);$('health').setAttribute('aria-valuemax',config.hp);
}
function phrase(point,knockedOut=false) {
  const list=config.phrases[config.friends[friend].id] ?? config.phrases.common;
  if (list?.length) fx.say(knockedOut?'Всё, я сдаюсь!':list[Math.floor(Math.random()*list.length)],point.x,point.y);
}
function damage(amount,point,strength=.3) {
  if (hp<=0 || $('panel').open || document.hidden) return;
  const dealt=Math.min(hp,Math.max(1,Math.round(amount)));
  combo=clock-lastHit<1500?combo+1:1;lastHit=clock;
  const multiplier=Math.min(3,1+Math.floor((combo-1)/5));
  hp-=dealt;redUntil=clock+160;
  const knockedOut=hp<=0, coins=dealt*multiplier+(knockedOut?config.ko:0);
  net.earn(friend,coins);fx.text(point.x,point.y-20,`+${coins}`,dealt);fx.burst(point.x,point.y,dealt*.6);
  fx.shake(Math.min(13,dealt*.6));haptic('impactOccurred',dealt>=15?'heavy':dealt>=5?'medium':'light');
  sfx.play(dealt>=5?'punch':'slap');
  if (clock-lastCoinSound>130) { sfx.play('coin');lastCoinSound=clock; }
  if (dealt>=15) freeze=50;
  if (knockedOut) {
    physics.setKO(true);koAt=clock;sfx.play('ko');phrase(point,true);
    fx.text(width/2,physics.bounds.y+50,`НОКАУТ +${config.ko}`,30);
    $('announcement').textContent=`Нокаут. Бонус ${config.ko} монет.`;
  } else if (dealt>=10 || Math.random()<.18) phrase(point);
  health();
}
function updateAccount(value) {
  const old=account.w;account=value;
  if ((account.w&1<<selected)===0) { selected=0;storage.set('weapon',0); }
  if (old!==account.w) { sfx.play('buy');haptic('notificationOccurred','success');confirmed=-1; }
  $('connection').hidden=!value.offline && value.persisted;
  $('connection').textContent=value.error || (!value.persisted?'Не удалось сохранить прогресс на устройстве': 'Нет связи · прогресс сохранён');
  updateShop();
}
function updateShop() {
  if (!config) return;
  const confirming=confirmed>=0 && performance.now()<confirmUntil;
  for (let i=0;i<weaponButtons.length;i++) {
    const button=weaponButtons[i], weapon=config.weapons[i],owned=!!(account.w&1<<i);
    button.classList.toggle('selected',selected===i);button.classList.toggle('confirm',confirming&&confirmed===i);
    button.classList.toggle('unaffordable',!owned&&weapon.price>account.c);
    button.setAttribute('aria-pressed',String(selected===i));
    button.disabled=!owned&&(weapon.price>account.c||account.buying);
    button.querySelector('.price').textContent=owned?'куплено':confirming&&confirmed===i?'Купить?':`${weapon.price.toLocaleString('ru-RU')} 🪙`;
  }
  $('shop-hint').textContent=account.buying?'Покупаем…':confirming?'Ещё раз коснись оружия для покупки':'Листай, чтобы выбрать оружие →';
  $('hint').textContent=selected===0?'Коснись — тычок. Потяни — бросок.':config.weapons[selected].kind==='gun'?'Удерживай, чтобы стрелять.':'Коснись комнаты, чтобы применить оружие.';
}
function buildShop() {
  for (const [i,w] of config.weapons.entries()) {
    const button=document.createElement('button');button.className='weapon';
    for(const [cls,text] of [['icon',w.icon],['label',w.name],['price','']]) {
      const span=document.createElement('span');span.className=cls;span.textContent=text;button.append(span);
    }
    button.setAttribute('aria-label',`${w.name}, ${w.price} монет`);
    button.onclick=async()=>{
      sfx.play('ui-click');
      if (account.w&1<<i) { weapons.up(true);selected=i;confirmed=-1;storage.set('weapon',i);updateShop();return; }
      if (account.c<w.price || account.buying) return;
      if (confirmed!==i || performance.now()>confirmUntil) {
        confirmed=i;confirmUntil=performance.now()+3500;updateShop();return;
      }
      confirmed=-1;await net.buy(i);
      if(account.w&1<<i) { selected=i;storage.set('weapon',i); }
      updateShop();
    };
    weaponButtons.push(button);$('weapons').append(button);
  }
  updateShop();
}
function openPanel(title) {
  weapons.up(true);pointer=null;$('panel-title').textContent=title;$('panel-content').replaceChildren();$('panel-content').className='';
  if (!$('panel').open) $('panel').showModal();sfx.play('ui-click');
}
async function showFriends() {
  openPanel('Кого потреплем?');
  const grid=document.createElement('div');grid.className='friends';$('panel-content').append(grid);
  const counters=[];
  config.friends.forEach((f,i)=>{
    const button=document.createElement('button');button.className='friend';button.setAttribute('aria-pressed',String(i===friend));
    const img=document.createElement('img');img.src=`./assets/head-${f.id}.png`;img.alt='';
    const name=document.createElement('strong');name.textContent=f.name;
    const count=document.createElement('small');count.textContent='Огрёб —';counters.push(count);
    button.append(img,name,count);button.onclick=()=>{resetFriend(i);$('panel').close();sfx.play('ui-click');};grid.append(button);
  });
  try {
    const top=await net.top();
    config.friends.forEach((f,i)=>{counters[i].textContent=`Огрёб ${(top.victims.find(v=>v.name===f.name)?.hits??0).toLocaleString('ru-RU')}`;});
  } catch { for(const count of counters) count.textContent='Огрёб — нет связи'; }
}
async function showTop() {
  openPanel('Кто кого');
  const content=$('panel-content'),message=document.createElement('p');message.className='notice';message.textContent='Загружаем рейтинг…';content.append(message);
  try {
    const top=await net.top();if (!message.isConnected) return;content.replaceChildren();content.className='ranking';
    for(const [title,rows] of [['Кто огрёб',top.victims],['Кто бил',top.fighters]]) {
      const h=document.createElement('h3');h.textContent=title;content.append(h);
      const list=document.createElement('ol');content.append(list);
      for(const [i,row] of rows.entries()) {
        const li=document.createElement('li');if(row.id===myId) li.className='me';
        for(const [cls,text] of [['rank-number',`${i+1}.`],['rank-name',row.name+(row.id===myId?' · это ты':'')],['rank-hits',row.hits.toLocaleString('ru-RU')]]) {
          const span=document.createElement('span');span.className=cls;span.textContent=text;li.append(span);
        }
        list.append(li);
      }
      if(!rows.length) { const p=document.createElement('p');p.className='notice';p.textContent='Пока никто. Первый удар за тобой.';content.append(p); }
    }
  } catch {
    if(!message.isConnected) return;
    message.textContent='Рейтинг не загрузился. Проверь соединение и повтори.';
    const button=document.createElement('button');button.className='retry';button.textContent='Повторить';button.onclick=showTop;content.append(button);
  }
}
function room() {
  const b=physics.bounds,floor=b.y+b.height;
  ctx.fillStyle='#e8e2d6';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#d3c6ac';ctx.fillRect(0,floor,width,height-floor);
  ctx.fillStyle='#b8aa91';ctx.fillRect(0,floor-9,width,9);
  ctx.fillStyle='#f1ebde';ctx.fillRect(0,b.y,7,b.height-9);ctx.fillRect(width-7,b.y,7,b.height-9);
  ctx.strokeStyle='#d0c8b8';ctx.lineWidth=2;ctx.beginPath();
  const cx=width/2;
  ctx.moveTo(cx-100,b.y+35);ctx.lineTo(cx-91,b.y+48);ctx.lineTo(cx-96,b.y+62);ctx.lineTo(cx-86,b.y+70);
  ctx.moveTo(cx+113,b.y+b.height*.5);ctx.lineTo(cx+101,b.y+b.height*.5+6);ctx.lineTo(cx+108,b.y+b.height*.5+19);ctx.stroke();
  ctx.fillStyle='#b3a68d';ctx.fillRect(width-48,floor-50,20,25);ctx.fillStyle='#756c5b';ctx.fillRect(width-43,floor-44,3,9);ctx.fillRect(width-35,floor-44,3,9);
  ctx.save();ctx.globalAlpha=.13;ctx.fillStyle='#51432e';ctx.beginPath();ctx.ellipse(cx,floor-2,Math.min(85,b.height*.15),10,0,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawPart(body) {
  const p=body.plugin,head=p.part==='head',f=config.friends[friend];
  const variant=hp<=0&&manifest.heads[`${f.id}-ko`]?`${f.id}-ko`:hp<config.hp*.5&&manifest.heads[`${f.id}-hurt`]?`${f.id}-hurt`:f.id;
  const key=head?`head-${variant}`:`body-${sheet()}-${p.part}`,img=images.get(key);
  if(!img) return;
  const w=p.w,h=head?w*manifest.heads[variant][1]/manifest.heads[variant][0]:p.h;
  const top=head?-h+w*.48:-h/2;
  ctx.save();ctx.translate(body.position.x,body.position.y);ctx.rotate(body.angle);
  if(p.side<0) ctx.scale(-1,1);
  ctx.drawImage(img,-w/2,top,w,h);
  if(head) {
    if(clock<redUntil) {
      ctx.fillStyle=`rgba(196,56,38,${(redUntil-clock)/160*.22})`;
      ctx.beginPath();ctx.ellipse(0,-w*.08,w*.35,w*.38,0,0,Math.PI*2);ctx.fill();
    }
    const hurt=1-hp/config.hp;
    if(hurt>0 && variant===f.id) {
      ctx.fillStyle=`rgba(130,41,76,${Math.min(.48,hurt*.6)})`;
      ctx.beginPath();ctx.ellipse(-w*.22,-w*.01,w*(.07+hurt*.12),w*.09,-.3,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(w*.2,-w*.18,w*.1,w*(.04+hurt*.08),.3,0,Math.PI*2);ctx.fill();
      if(hurt>.35) {
        ctx.save();ctx.translate(w*.23,w*.15);ctx.rotate(-.3);ctx.fillStyle='#edc992';ctx.fillRect(-w*.15,-w*.045,w*.3,w*.09);
        ctx.strokeStyle='#b78958';ctx.lineWidth=1;ctx.strokeRect(-w*.045,-w*.04,w*.09,w*.08);ctx.restore();
      }
    }
    if(hp<=0 && variant===f.id) {
      ctx.strokeStyle='#3b2824';ctx.lineWidth=Math.max(2,w*.035);ctx.lineCap='round';
      for(const eye of [-1,1]) { const x=eye*w*.18,y=-w*.2,d=w*.055;
        ctx.beginPath();ctx.moveTo(x-d,y-d);ctx.lineTo(x+d,y+d);ctx.moveTo(x+d,y-d);ctx.lineTo(x-d,y+d);ctx.stroke(); }
    }
  }
  ctx.restore();
}
function render(dt) {
  room();const offset=fx.offset();ctx.save();ctx.translate(offset.x,offset.y);
  for(const part of drawOrder) drawPart(part);
  weapons.draw(ctx);
  if(hp<=0) {
    const head=physics.parts[0];ctx.font='22px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
    for(let i=0;i<4;i++) {const a=clock/350+i*Math.PI/2;ctx.fillText('⭐',head.position.x+Math.cos(a)*head.plugin.w*.8,head.position.y-head.plugin.w*.6+Math.sin(a)*12);}
  }
  fx.draw(ctx,width);ctx.restore();fx.drawScreen(ctx,width,height);
  shownCoins+=(account.c-shownCoins)*Math.min(1,dt/120);
  if(Math.abs(shownCoins-account.c)<.5) shownCoins=account.c;
  $('coins').querySelector('span').textContent=Math.round(shownCoins).toLocaleString('ru-RU');
  $('combo').hidden=combo<2||clock-lastHit>1500;
  $('combo').textContent=`${combo} комбо ×${Math.min(3,1+Math.floor((combo-1)/5))}`;
}
function tick(time) {
  const dt=Math.min(32,Math.max(0,time-lastFrame||16));lastFrame=time;
  if(!$('panel').open) {
    clock+=dt;
    if(freeze>0) freeze-=dt;
    else {physics.update(dt);weapons.update(dt);}
    fx.update(dt);
    if(koAt!==null && clock-koAt>=2500) {weapons.clear();hp=config.hp;koAt=null;physics.reset();sortedParts();health();}
  }
  if(confirmed>=0&&time>confirmUntil) {confirmed=-1;updateShop();}
  render(dt);frame=requestAnimationFrame(tick);
}
function bind() {
  $('friends-button').onclick=showFriends;$('top-button').onclick=showTop;
  $('close-panel').onclick=()=>$('panel').close();
  $('panel').addEventListener('click',e=>{if(e.target===$('panel')) {const r=$('panel').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) $('panel').close();}});
  $('outfit-button').onclick=()=>{const f=config.friends[friend];outfits[f.id]=!outfits[f.id];storage.set('outfits',outfits);$('outfit-button').setAttribute('aria-pressed',String(sheet()!=='naked'));sfx.play('ui-click');};
  $('mute-button').onclick=()=>{muted=!muted;sfx.setMuted(muted);storage.set('mute',muted);muteUI();};
  function muteUI() { $('mute-button').textContent=muted?'🔇':'🔊';$('mute-button').setAttribute('aria-pressed',String(muted));$('mute-button').setAttribute('aria-label',muted?'Включить звук':'Выключить звук'); }
  muteUI();
  canvas.addEventListener('pointerdown',e=>{
    if(pointer!==null||!e.isPrimary||$('panel').open) return;
    const b=physics.bounds;if(e.clientY<b.y||e.clientY>b.y+b.height) return;
    e.preventDefault();pointer=e.pointerId;canvas.setPointerCapture(pointer);weapons.down({x:e.clientX,y:e.clientY},config.weapons[selected]);
  });
  canvas.addEventListener('pointermove',e=>{if(pointer===e.pointerId) weapons.move({x:e.clientX,y:e.clientY});});
  const release=e=>{if(pointer===e.pointerId) {weapons.up(e.type!=='pointerup');pointer=null;}};
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
  addEventListener('blur',()=>{weapons.up(true);pointer=null;});
  addEventListener('resize',resize);tg?.onEvent?.('viewportChanged',resize);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) {cancelAnimationFrame(frame);frame=0;weapons.up(true);pointer=null;net.flush(true);}
    else {lastFrame=performance.now();if(!frame) frame=requestAnimationFrame(tick);net.flush();}
  });
  setInterval(()=>net.flush(),5000);addEventListener('online',()=>net.flush());
}
async function loadJSON(path) {
  const response=await fetch(path,{signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error(`Не удалось загрузить ${path}`);
  return response.json();
}
async function boot() {
  setupTelegram();document.addEventListener('pointerdown',()=>sfx.unlock(),{capture:true});
  [config,manifest]=await Promise.all([loadJSON('./api/config'),loadJSON('./assets/manifest.json')]);
  if(!Number.isInteger(friend)||!config.friends[friend]) friend=0;
  if(!Number.isInteger(selected)||!config.weapons[selected]) selected=0;
  const names=[...Object.keys(manifest.heads).map(id=>`head-${id}`),...Object.entries(manifest.bodies).flatMap(([sheet,parts])=>Object.keys(parts).map(part=>`body-${sheet}-${part}`))];
  let loaded=0;
  await Promise.all(names.map(async name=>{
    const img=new Image();img.src=`./assets/${name}.png`;await img.decode();images.set(name,img);
    $('load-progress').value=++loaded/names.length*100;
  }));
  net=createNet(tg?.initData??'',updateAccount);account=net.view();shownCoins=account.c;
  if(!(account.w&1<<selected)) selected=0;
  resize();physics=createPhysics(bounds(),damage);weapons=createWeapons(physics,damage,fx,sfx);
  buildShop();resetFriend();bind();$('loading').hidden=true;
  lastFrame=performance.now();frame=requestAnimationFrame(tick);net.start();
}
$('reload').onclick=()=>location.reload();
boot().catch(error=>{$('load-text').textContent=`${error.message}. Проверь соединение и попробуй снова.`;$('reload').hidden=false;$('load-progress').hidden=true;});
