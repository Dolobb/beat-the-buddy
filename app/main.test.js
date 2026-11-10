import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext, createContext, runInContext } from 'node:vm';
import { friends, appWeapons, phrases, APP_HP, APP_KO_BONUS } from '../config.ts';
import { createAppDB, applySync } from '../appstate.ts';

class Node {
  constructor() { this.children=[];this.style={};this.attrs={};this.events={};this.hidden=false;this.open=false;this.textContent='';
    const classes=new Set();this.classList={toggle:(s,on)=>on?classes.add(s):classes.delete(s),contains:s=>classes.has(s)}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children=nodes; }
  setAttribute(key,value) { this.attrs[key]=value; }
  addEventListener(event,fn) { this.events[event]=fn; }
  querySelector(selector) { return this.children.find(n=>n.className===selector.slice(1)) ?? new Node(); }
  getBoundingClientRect() { return {bottom:144,top:714,left:0,right:390}; }
  setPointerCapture() {}
  showModal() { this.open=true; }
  close() { this.open=false; }
}
async function game(savedWeapon=0) {
  const nodes=new Map(),store=new Map([['buddy:weapon',JSON.stringify(savedWeapon)]]),events={};
  const get=id=>{if(!nodes.has(id)) nodes.set(id,new Node());return nodes.get(id);};
  const drawing=new Proxy({measureText:s=>({width:s.length*8})},{get:(o,k)=>o[k]??(()=>{})});
  get('scene').getContext=()=>drawing;
  let db=createAppDB(), raf;
  const document={getElementById:get,createElement:()=>new Node(),hidden:false,addEventListener:(name,fn)=>{events[name]=fn;}};
  const telegram={initData:'',ready(){},expand(){},disableVerticalSwipes(){},themeParams:{},setHeaderColor(){},setBackgroundColor(){},onEvent(){},
    isVersionAtLeast:()=>false,requestFullscreen(){throw new Error('WebAppMethodUnsupported');}};
  const vendor={exports:{}};runInNewContext(readFileSync(new URL('./vendor/matter.min.js',import.meta.url),'utf8'),{module:vendor,exports:vendor.exports});
  const context=createContext({console,Matter:vendor.exports,URLSearchParams,AbortSignal,Map,Image:class{async decode(){}},
    document,Telegram:{WebApp:telegram},innerWidth:390,innerHeight:844,devicePixelRatio:2,matchMedia:()=>({matches:false}),
    performance:{now:()=>100},requestAnimationFrame:fn=>{raf=fn;return 1;},cancelAnimationFrame(){},setInterval(){},
    addEventListener:(name,fn)=>{events[name]=fn;},location:{reload(){}},
    localStorage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)},
    fetch:async(path,options)=>{
      let result;
      if(path==='./api/config') result={friends,weapons:appWeapons,hp:APP_HP,ko:APP_KO_BONUS,phrases:{common:phrases}};
      else if(path==='./assets/manifest.json') result=JSON.parse(readFileSync(new URL('./assets/manifest.json',import.meta.url),'utf8'));
      else if(path==='./api/sync') { const r=applySync(db,{id:1,first_name:'Dev'},JSON.parse(options.body));db=r.db;result=r.player; }
      else throw new Error(`Unexpected request ${path}`);
      return {ok:true,json:async()=>result};
    },
  });
  for(const file of ['physics','weapons','fx','sfx','net','main']) {
    const source=readFileSync(new URL(`./${file}.js`,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
    runInContext(source,context,{filename:`${file}.js`});
  }
  for(let i=0;i<15;i++) await new Promise(resolve=>setImmediate(resolve));
  return {get,events,document,context,store,frame:()=>raf?.(116),read:code=>runInContext(code,context)};
}

test('DEV boot works with the real SDK version-6 unsupported-fullscreen behavior',async()=>{
  const g=await game();
  assert.equal(g.get('loading').hidden,true,g.get('load-text').textContent);
  assert.equal(g.get('weapons').children.length,12);
  assert.equal(g.read('physics.parts.length'),10);
  g.frame();
  assert.equal(g.read('canvas.width'),780);
});

test('saved locked weapon is reset before input; cancelled hand gesture earns no coins',async()=>{
  const g=await game(11);
  assert.equal(g.get('loading').hidden,true,g.get('load-text').textContent);
  assert.equal(g.read('selected'),0);
  g.read('weapons.down({...physics.parts[0].position},config.weapons[0])');
  g.events.blur();
  assert.equal(g.read('net.view().c'),0);
  g.read('weapons.down({...physics.parts[0].position},config.weapons[0]);weapons.up()');
  assert.equal(g.read('net.view().c'),1);
});

test('KO awards damage plus bonus once, ragdoll respawns and friend/outfit controls work',async()=>{
  const g=await game();
  g.read('damage(300,{...physics.parts[0].position},1)');
  assert.equal(g.read('hp'),0);
  assert.equal(g.read('net.view().c'),250);
  g.read('damage(300,{...physics.parts[0].position},1)');
  assert.equal(g.read('net.view().c'),250);
  g.read('clock+=2501');g.frame();
  assert.equal(g.read('hp'),200);
  g.get('outfit-button').onclick();
  assert.equal(g.read('sheet()'),'f1');
  g.read('resetFriend(1)');
  assert.equal(g.get('friend-name').textContent,'Бло');
  assert.equal(g.get('outfit-button').disabled,true);
  assert.equal(g.read('sheet()'),'naked');
  assert.equal(g.read('hp'),200);
});
