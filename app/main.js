import { createPhysics } from './physics.js';
import { createWeapons } from './weapons.js';
import { createFX } from './fx.js';
import { createSFX } from './sfx.js';
import { createNet, storage } from './net.js';

const INK='#21140f', PAPER='#fff6e0', YOLK='#ffcf1f', BLOOD='#ff4530', MINT='#2fd39c';
const DISPLAY="'Dela Gothic One', sans-serif";
const $ = id => document.getElementById(id);
const canvas=$('scene'), ctx=canvas.getContext('2d'), tg=globalThis.Telegram?.WebApp;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const fx=createFX(reduced), sfx=createSFX(storage.get('mute',false));
let config, manifest, physics, weapons, net, width=0, height=0, hp=200, koAt=null, clock=0, freeze=0;
let friend=storage.get('friend',0), selected=storage.get('weapon',0), outfits=storage.get('outfits',{});
let muted=storage.get('mute',false), confirmed=-1, confirmUntil=0, shownCoins=0;
let combo=0, lastHit=-2000, lastCoinSound=0, lastFrame=0, frame=0, pointer=null, drawOrder=[];
let roomCanvas=null, coinTarget={x:0,y:0}, slowUntil=0, koZoom=0, hintTimer=0, shownCombo=0, headState='';
const images=new Map(), whites=new Map(), flashUntil=new Map(), weaponButtons=[];
let account={c:0,w:3,buying:false,offline:false,persisted:true}, myId=1;
try { myId=JSON.parse(new URLSearchParams(tg?.initData ?? '').get('user')).id; } catch {}

const fmt=n=>Math.round(n).toLocaleString('ru-RU');
const short=n=>n>=10000?`${n/1000}к`:fmt(n);
function mix(a,b,t) { // смешение двух #rrggbb
  const p=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)), x=p(a), y=p(b);
  return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('');
}
function retrigger(el,cls) { el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls); }
function haptic(method,value) {
  if (!tg?.initData) return;
  try { tg.HapticFeedback?.[method]?.(value); } catch {}
}
function setupTelegram() {
  if (!tg) return;
  tg.ready();tg.expand();tg.disableVerticalSwipes?.();
  if (tg.initData && tg.isVersionAtLeast?.('8.0')) { tg.requestFullscreen?.();tg.lockOrientation?.(); }
}
function sheet() { return outfits[config.friends[friend].id] ? config.friends[friend].outfit ?? 'naked' : 'naked'; }
function bounds() {
  const bottom=$('shelf').getBoundingClientRect().top+12;
  return { x:0,y:0,width:Math.max(100,width),height:Math.max(160,bottom) };
}
function sortedParts() {
  const layer=b=>b.plugin.part==='head'?4:b.plugin.part==='torso'?2:
    ['arm','hand'].includes(b.plugin.part)?(b.plugin.side<0?0:5):(b.plugin.side<0?1:3);
  drawOrder=[...physics.parts].sort((a,b)=>layer(a)-layer(b));
}
// Комната рисуется один раз в отдельный холст: стена в цвете друга, растр, его имя во всю стену, пол.
function buildRoom() {
  if (!config || !physics) return;
  const f=config.friends[friend], b=physics.bounds, floor=b.y+b.height, M=28, dpr=devicePixelRatio||1;
  const wall=mix(f.color,'#ffffff',.14), dot=mix(wall,INK,.13), ground=mix(f.color,INK,.52);
  roomCanvas=document.createElement('canvas');roomCanvas.width=(width+M*2)*dpr;roomCanvas.height=(height+M*2)*dpr;
  const c=roomCanvas.getContext('2d');c.setTransform(dpr,0,0,dpr,M*dpr,M*dpr);
  c.fillStyle=wall;c.fillRect(-M,-M,width+M*2,height+M*2);
  c.fillStyle=dot;
  for (let y=-M,row=0;y<floor;y+=15,row++) {
    const r=5.2*Math.max(0,1-(y+M)/(floor*.72));if (r<.4) break;
    for (let x=-M+(row%2)*7.5;x<width+M;x+=15) { c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill(); }
  }
  const name=f.name.toUpperCase();
  c.save();c.translate(width/2,floor*.5);c.rotate(-.12);c.textAlign='center';c.textBaseline='middle';
  c.font=`100px ${DISPLAY}`;const size=Math.min(300,100*width*1.12/c.measureText(name).width);
  c.font=`${size}px ${DISPLAY}`;c.fillStyle=mix(wall,INK,.17);c.fillText(name,0,0);c.restore();
  c.fillStyle=ground;c.fillRect(-M,floor,width+M*2,height-floor+M);
  c.fillStyle=mix(ground,'#ffffff',.1);c.fillRect(-M,floor+4,width+M*2,7);
  c.fillStyle=INK;c.fillRect(-M,floor-2,width+M*2,5);
  document.documentElement.style.setProperty('--wall',wall);
  try { tg?.setHeaderColor?.(wall);tg?.setBackgroundColor?.(ground);tg?.setBottomBarColor?.(ground); } catch {}
}
function resize() {
  width=innerWidth;height=innerHeight;
  const dpr=devicePixelRatio || 1;
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  const r=$('coins').getBoundingClientRect();coinTarget={x:r.left+20,y:r.top+r.height/2};
  if (physics) {
    weapons.clear();physics.reset(bounds());physics.setKO(hp<=0);sortedParts();pointer=null;fx.clear();buildRoom();
  }
}
function resetFriend(index=friend) {
  friend=index;hp=config.hp;koAt=null;combo=0;lastHit=-2000;freeze=0;slowUntil=0;flashUntil.clear();
  storage.set('friend',friend);weapons.clear();physics.reset(bounds());sortedParts();fx.clear();pointer=null;
  $('friend-name').textContent=config.friends[friend].name;$('ko').hidden=true;
  $('outfit-button').disabled=!config.friends[friend].outfit;
  $('outfit-button').setAttribute('aria-pressed',String(sheet()!=='naked'));
  buildRoom();health();
}
function variant() {
  const id=config.friends[friend].id;
  return hp<=0&&manifest.heads[`${id}-ko`]?`${id}-ko`:hp<config.hp*.5&&manifest.heads[`${id}-hurt`]?`${id}-hurt`:id;
}
function health() {
  const ratio=Math.max(0,hp/config.hp);
  $('hp-fill').style.transform=$('hp-ghost').style.transform=`scaleX(${ratio})`;
  $('hp-fill').style.background=ratio<.25?BLOOD:ratio<.5?YOLK:MINT;
  $('hp-label').textContent=hp<=0?'':hp;
  $('health').setAttribute('aria-valuenow',hp);$('health').setAttribute('aria-valuemax',config.hp);
  const v=variant();if (v!==headState) { headState=v;$('portrait-img').src=`./assets/head-${v}.png`; }
}
function phrase(point,knockedOut=false) {
  const list=config.phrases[config.friends[friend].id] ?? config.phrases.common;
  const head=physics.parts[0].position;
  if (list?.length) fx.say(knockedOut?'Всё, я сдаюсь!':list[Math.floor(Math.random()*list.length)],head.x,head.y-physics.parts[0].plugin.w*.5);
}
function wallHit(amount,point,strength) {
  const b=physics.bounds;
  if (point.y>b.y+b.height-24) fx.dust(point.x,b.y+b.height-4,amount*.4);
  else if (amount>=5) fx.crack(point.x,point.y,amount);
  damage(amount,point,strength);
}
function damage(amount,point,strength=.3) {
  if (hp<=0 || $('panel').open || document.hidden) return;
  const dealt=Math.min(hp,Math.max(1,Math.round(amount)));
  combo=clock-lastHit<1500?combo+1:1;lastHit=clock;
  const multiplier=Math.min(3,1+Math.floor((combo-1)/5));
  hp-=dealt;
  const knockedOut=hp<=0, coins=dealt*multiplier+(knockedOut?config.ko:0);
  net.earn(friend,coins);
  // Отдача: вспышка и «пружинка» на задетой части, кольцо, искры, цифра, слово, монеты в счётчик.
  const body=physics.nearest(point,120);
  if (body) { physics.punch(body,Math.min(.6,.18+dealt*.03));flashUntil.set(body.id,clock+90); }
  fx.text(point.x,point.y-26,`+${coins}`,dealt);fx.burst(point.x,point.y,dealt*.6);fx.ring(point.x,point.y,dealt);
  if (dealt>=12 || (dealt>=4&&Math.random()<.45)) fx.word(point.x+(Math.random()-.5)*60,point.y-70,dealt);
  if (dealt>=15) fx.lines(point.x,point.y);
  for (let i=0,n=Math.min(9,1+Math.floor(coins/5));i<n;i++) fx.coin(point.x,point.y,coinTarget.x,coinTarget.y,i*28);
  fx.shake(Math.min(16,3+dealt*.7));fx.zoom(dealt>=15?.07:dealt>=5?.03:.008);
  haptic('impactOccurred',dealt>=15?'heavy':dealt>=5?'medium':'light');
  sfx.play(dealt>=5?'punch':'slap');
  if (dealt>=15) freeze=60; else if (dealt>=6) freeze=28;
  retrigger($('portrait'),'hit');$('hint').classList.add('gone');
  if (knockedOut) {
    physics.setKO(true);koAt=clock;slowUntil=performance.now()+750;sfx.play('ko');phrase(point,true);
    fx.flash(.55);fx.shake(20);haptic('notificationOccurred','success');
    for (let i=0;i<16;i++) fx.coin(point.x,point.y,coinTarget.x,coinTarget.y,120+i*38);
    $('ko').querySelector('small').textContent=`+${config.ko}`;$('ko').hidden=false;retrigger($('ko').firstElementChild,'x');
    $('announcement').textContent=`Нокаут. Бонус ${config.ko} монет.`;
  } else if (dealt>=10 || Math.random()<.16) phrase(point);
  health();
}
function updateAccount(value) {
  const old=account.w;account=value;
  if ((account.w&1<<selected)===0) { selected=0;storage.set('weapon',0); }
  if (old!==account.w) {
    sfx.play('buy');haptic('notificationOccurred','success');confirmed=-1;
    weaponButtons.forEach((b,i)=>{ if ((account.w&1<<i)&&!(old&1<<i)) retrigger(b,'just'); });
  }
  $('connection').hidden=!value.offline && value.persisted;
  $('connection').textContent=value.error || (!value.persisted?'Не удалось сохранить прогресс на устройстве':'Нет связи, прогресс сохранён');
  updateShop();
}
function hint(text) {
  $('hint').textContent=text;$('hint').classList.remove('gone');
  clearTimeout(hintTimer);hintTimer=setTimeout(()=>$('hint').classList.add('gone'),2600);
}
function updateShop() {
  if (!config) return;
  const confirming=confirmed>=0 && performance.now()<confirmUntil;
  for (let i=0;i<weaponButtons.length;i++) {
    const button=weaponButtons[i], weapon=config.weapons[i],owned=!!(account.w&1<<i);
    button.classList.toggle('selected',selected===i);button.classList.toggle('confirm',confirming&&confirmed===i);
    button.classList.toggle('owned',owned);button.classList.toggle('locked',!owned);
    button.classList.toggle('unaffordable',!owned&&weapon.price>account.c);
    button.setAttribute('aria-pressed',String(selected===i));
    button.disabled=!owned&&(weapon.price>account.c||account.buying);
    const price=button.querySelector('.price');
    if (confirming&&confirmed===i) price.textContent='КУПИТЬ?';
    else { price.replaceChildren(document.createElement('i'),short(weapon.price)); }
  }
  $('shop-hint').textContent=account.buying?'Покупаем':confirming?'Ещё раз коснись оружия для покупки':'';
}
function weaponHint() {
  const kind=config.weapons[selected].kind;
  hint(kind==='hand'?'Ткни, чтобы стукнуть. Зажми и тяни, чтобы швырнуть.':kind==='gun'?'Зажми и води пальцем: стреляет очередью.':
    kind==='drop'?'Ткни над головой: упадёт сверху.':kind==='bomb'?'Ткни, куда кинуть. Рванёт само.':'Ткни в друга, чтобы врезать.');
}
function buildShop() {
  for (const [i,w] of config.weapons.entries()) {
    const button=document.createElement('button');button.className='weapon';
    for(const [cls,text] of [['icon',w.icon],['label',w.name],['price','']]) {
      const span=document.createElement('span');span.className=cls;span.textContent=text;button.append(span);
    }
    button.setAttribute('aria-label',`${w.name}, ${w.price} монет`);
    button.onclick=async()=>{
      sfx.play('ui-click');haptic('selectionChanged');
      if (account.w&1<<i) { weapons.up(true);selected=i;confirmed=-1;storage.set('weapon',i);updateShop();weaponHint();return; }
      if (account.c<w.price || account.buying) return;
      if (confirmed!==i || performance.now()>confirmUntil) {
        confirmed=i;confirmUntil=performance.now()+3500;updateShop();return;
      }
      confirmed=-1;await net.buy(i);
      if(account.w&1<<i) { selected=i;storage.set('weapon',i);weaponHint(); }
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
function el(tag,cls,text) { const e=document.createElement(tag);if(cls) e.className=cls;if(text!==undefined) e.textContent=text;return e; }
function headImg(id) { const img=el('img');img.src=`./assets/head-${id}.png`;img.alt='';return img; }
async function showFriends() {
  openPanel('Кого бьём?');
  const grid=el('div','friends');$('panel-content').append(grid);
  const counters=[];
  config.friends.forEach((f,i)=>{
    const button=el('button','friend');button.setAttribute('aria-pressed',String(i===friend));button.style.setProperty('--c',mix(f.color,'#ffffff',.14));
    const count=el('small','','огрёб …');counters.push(count);
    button.append(headImg(f.id),el('strong','',f.name),count);
    button.onclick=()=>{resetFriend(i);$('panel').close();sfx.play('ui-click');weaponHint();};grid.append(button);
  });
  try {
    const top=await net.top();
    config.friends.forEach((f,i)=>{counters[i].textContent=`огрёб ${fmt(top.victims.find(v=>v.name===f.name)?.hits??0)}`;});
  } catch { for(const count of counters) count.textContent='нет связи'; }
}
async function showTop() {
  openPanel('Кто кого');
  const content=$('panel-content'),message=el('p','notice','Считаем синяки');content.append(message);
  try {
    const top=await net.top();if (!message.isConnected) return;content.replaceChildren();content.className='ranking';
    const idOf=name=>config.friends.find(f=>f.name===name)?.id;
    const [worst,...rest]=top.victims;
    if (worst?.hits>0) {
      const champ=el('div','champ'),info=el('div');
      const id=idOf(worst.name);if(id) champ.append(headImg(manifest.heads[`${id}-hurt`]?`${id}-hurt`:id));
      info.append(el('small','','Больше всех огрёб'),el('b','',worst.name),el('span','num',fmt(worst.hits)));champ.append(info);content.append(champ);
    }
    const list=(title,rows,offset,avatar)=>{
      content.append(el('h3','',title));
      if(!rows.length) { content.append(el('p','notice','Пока пусто. Первый удар за тобой.'));return; }
      const ol=el('ol');content.append(ol);
      rows.forEach((row,i)=>{
        const li=el('li',row.id===myId?'me':'');li.append(el('span','rank-number',String(i+offset)));
        const id=avatar&&idOf(row.name);if(id) li.append(headImg(id));
        li.append(el('span','rank-name',row.name+(row.id===myId?' (ты)':'')),el('span','rank-hits',fmt(row.hits)));ol.append(li);
      });
    };
    if (worst?.hits>0) list('Остальные пострадавшие',rest,2,true); else list('Пострадавшие',top.victims,1,true);
    list('Лучшие бойцы',top.fighters,1,false);
  } catch {
    if(!message.isConnected) return;
    message.textContent='Рейтинг не загрузился. Проверь связь и повтори.';
    const button=el('button','retry','Повторить');button.onclick=showTop;content.append(button);
  }
}
function whiteOf(key,img) { // белый силуэт спрайта для вспышки при попадании
  let w=whites.get(key);
  if (!w) {
    w=document.createElement('canvas');w.width=img.naturalWidth;w.height=img.naturalHeight;
    const c=w.getContext('2d');c.drawImage(img,0,0);c.globalCompositeOperation='source-in';c.fillStyle='#fff';c.fillRect(0,0,w.width,w.height);
    whites.set(key,w);
  }
  return w;
}
function drawPart(body) {
  const p=body.plugin,head=p.part==='head',f=config.friends[friend],v=variant();
  const key=head?`head-${v}`:`body-${sheet()}-${p.part}`,img=images.get(key);
  if(!img) return;
  const w=head?p.w*(manifest.heads[v][2]||1):p.w,h=head?w*manifest.heads[v][1]/manifest.heads[v][0]:p.h;
  const top=head?-h+p.w*.48:-h/2, s=physics.squash.get(body.id)??0;
  ctx.save();ctx.translate(body.position.x,body.position.y);ctx.rotate(body.angle);
  if(p.side<0) ctx.scale(-1,1);
  if(s) ctx.scale(1+s*.32,1-s*.22);
  ctx.drawImage(img,-w/2,top,w,h);
  if(clock<(flashUntil.get(body.id)??0)) { ctx.globalAlpha=.85;ctx.drawImage(whiteOf(key,img),-w/2,top,w,h);ctx.globalAlpha=1; }
  if(head && v===f.id) { // запасной вариант, если у друга нет побитых голов
    const hurt=1-hp/config.hp;
    if(hurt>0) {
      ctx.fillStyle=`rgba(130,41,76,${Math.min(.48,hurt*.6)})`;
      ctx.beginPath();ctx.ellipse(-w*.22,-w*.01,w*(.07+hurt*.12),w*.09,-.3,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(w*.2,-w*.18,w*.1,w*(.04+hurt*.08),.3,0,Math.PI*2);ctx.fill();
    }
    if(hp<=0) {
      ctx.strokeStyle=INK;ctx.lineWidth=Math.max(2,w*.035);ctx.lineCap='round';
      for(const eye of [-1,1]) { const x=eye*w*.18,y=-w*.2,d=w*.055;
        ctx.beginPath();ctx.moveTo(x-d,y-d);ctx.lineTo(x+d,y+d);ctx.moveTo(x+d,y-d);ctx.lineTo(x-d,y+d);ctx.stroke(); }
    }
  }
  ctx.restore();
}
function star(x,y,r,rot) {
  ctx.beginPath();
  for(let i=0;i<10;i++) { const a=rot+i*Math.PI/5,q=i%2?r*.45:r;ctx.lineTo(x+Math.cos(a)*q,y+Math.sin(a)*q); }
  ctx.closePath();ctx.fillStyle=YOLK;ctx.fill();ctx.strokeStyle=INK;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.stroke();
}
function render(dt) {
  const o=fx.offset(), b=physics.bounds, floor=b.y+b.height, head=physics.parts[0], torso=physics.parts[1];
  koZoom+=((performance.now()<slowUntil?.16:0)-koZoom)*Math.min(1,dt/90);
  const z=1+o.zoom+koZoom, fxp=koZoom>.01?head.position.x:width/2, fyp=koZoom>.01?head.position.y:floor*.55;
  ctx.fillStyle=INK;ctx.fillRect(0,0,width,height);
  ctx.save();ctx.translate(fxp+o.x,fyp+o.y);ctx.scale(z,z);ctx.translate(-fxp,-fyp);
  if(roomCanvas) ctx.drawImage(roomCanvas,-28,-28,width+56,height+56);
  fx.drawDecals(ctx);
  // Тень: чем выше тело над полом, тем она меньше и бледнее
  const lift=Math.max(0,Math.min(1,(floor-torso.position.y)/(b.height*.75)));
  ctx.fillStyle=`rgba(33,20,15,${.34-lift*.2})`;ctx.beginPath();
  ctx.ellipse(torso.position.x,floor+9,torso.plugin.w*(.95-lift*.4),9-lift*4,0,0,Math.PI*2);ctx.fill();
  for(const part of drawOrder) drawPart(part);
  weapons.draw(ctx);
  if(hp<=0) for(let i=0;i<4;i++) {
    const a=clock/260+i*Math.PI/2;
    star(head.position.x+Math.cos(a)*head.plugin.w*.75,head.position.y-head.plugin.w*.72+Math.sin(a)*10,9+2*Math.sin(a),a);
  }
  fx.draw(ctx,width);ctx.restore();fx.drawScreen(ctx,width,height);
  shownCoins+=(account.c-shownCoins)*Math.min(1,dt/160);
  if(Math.abs(shownCoins-account.c)<.5) shownCoins=account.c;
  $('coins').lastElementChild.textContent=fmt(shownCoins);
  const live=combo>=3&&clock-lastHit<=1500, mult=Math.min(3,1+Math.floor((combo-1)/5));
  $('combo').hidden=!live;
  if(live&&combo!==shownCombo) {
    shownCombo=combo;$('combo').firstElementChild.textContent=mult>1?`×${mult}`:combo;
    $('combo').lastElementChild.textContent=mult>1?`${combo} подряд`:'подряд';
    $('combo').classList.toggle('hot',mult>=3);retrigger($('combo'),'pop');
  }
}
function tick(time) {
  const dt=Math.min(32,Math.max(0,time-lastFrame||16));lastFrame=time;
  if(!$('panel').open) {
    const game=dt*(time<slowUntil?.2:1); // замедление на нокауте
    clock+=dt;
    if(freeze>0) freeze-=dt;
    else {physics.update(game);weapons.update(game);}
    fx.update(dt);
    if(koAt!==null && clock-koAt>=2700) {weapons.clear();hp=config.hp;koAt=null;physics.reset();sortedParts();flashUntil.clear();$('ko').hidden=true;health();}
  }
  if(confirmed>=0&&time>confirmUntil) {confirmed=-1;updateShop();}
  render(dt);frame=requestAnimationFrame(tick);
}
function bind() {
  $('friends-button').onclick=showFriends;$('top-button').onclick=showTop;
  $('close-panel').onclick=()=>$('panel').close();
  $('panel').addEventListener('click',e=>{if(e.target===$('panel')) {const r=$('panel').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) $('panel').close();}});
  $('outfit-button').onclick=()=>{const f=config.friends[friend];outfits[f.id]=!outfits[f.id];storage.set('outfits',outfits);$('outfit-button').setAttribute('aria-pressed',String(sheet()!=='naked'));sfx.play('ui-click');fx.dust(physics.parts[1].position.x,physics.parts[1].position.y,6);};
  $('mute-button').onclick=()=>{muted=!muted;sfx.setMuted(muted);storage.set('mute',muted);muteUI();};
  function muteUI() { $('mute-button').setAttribute('aria-pressed',String(muted));$('mute-button').setAttribute('aria-label',muted?'Включить звук':'Выключить звук'); }
  muteUI();
  fx.onCoin(()=>{
    retrigger($('coins'),'bump');
    if(clock-lastCoinSound>55) { sfx.play('coin');lastCoinSound=clock; }
  });
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
  tg?.onEvent?.('safeAreaChanged',resize);tg?.onEvent?.('contentSafeAreaChanged',resize);tg?.onEvent?.('fullscreenChanged',resize);
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
  await Promise.all([
    Promise.race([Promise.all([document.fonts?.load(`20px ${DISPLAY}`,'БЕЙ'),document.fonts?.load("700 15px 'Golos Text'",'Ай')]),new Promise(r=>setTimeout(r,2500))]).catch(()=>{}),
    ...names.map(async name=>{
      const img=new Image();img.src=`./assets/${name}.png`;await img.decode();images.set(name,img);
      $('load-progress').value=++loaded/names.length*100;
    })]);
  net=createNet(tg?.initData??'',updateAccount);account=net.view();shownCoins=account.c;
  if(!(account.w&1<<selected)) selected=0;
  resize();physics=createPhysics(bounds(),wallHit);weapons=createWeapons(physics,damage,fx,sfx);
  buildShop();resetFriend();bind();$('loading').hidden=true;weaponHint();
  lastFrame=performance.now();frame=requestAnimationFrame(tick);net.start();
  demo();
}
// Для скриншотов при разработке: #hit, #ko, #friends, #top, #gun в адресе.
function demo() {
  const mode=location.hash.slice(1);if(!mode) return;
  const at=part=>({...physics.parts[part].position});
  if(mode==='friends') return void showFriends();
  if(mode==='top') return void showTop();
  if(mode==='hit'||mode==='gun') { account.w=4095;account.c=13370;selected=mode==='gun'?7:3;updateShop();
    let n=0;setInterval(()=>{ if(n++<40) damage(mode==='gun'?4:[3,8,16][n%3],at(n%3),.5); },160); }
  if(mode==='ko') setTimeout(()=>damage(999,at(0),1),300);
}
$('reload').onclick=()=>location.reload();
boot().catch(error=>{$('load-text').textContent=`${error.message}. Проверь связь и попробуй снова.`;$('reload').hidden=false;$('load-progress').hidden=true;});
