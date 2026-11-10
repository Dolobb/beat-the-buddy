import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { minify } from 'terser';
import { friends, weapons, HP, KO_BONUS } from '../config.ts';
import { phrasesData } from '../state.ts';

const root = new URL('../', import.meta.url);
const config = { f: friends.map(f => [f.name, f.color]), w: weapons.map(w => [w.icon, w.price, w.dmg, w.radius, w.force, w.mode, w.auto]), hp: HP, ko: KO_BONUS };
let html = readFileSync(new URL('widget/widget.html', root), 'utf8').replace('__CFG__', JSON.stringify(config).replace(/</g, '\\u003c'));
const script = /<script>([\s\S]*?)<\/script>/.exec(html)!;
const result = await minify(script[1], { toplevel: true, compress: { passes: 3, unsafe: true }, mangle: true });
html = html.replace(script[0], `<script>${result.code}</script>`)
  .replace(/<style>([\s\S]*?)<\/style>/, (_, css) => `<style>${css.replace(/\s+/g, ' ').replace(/\s*([{}:;,])\s*/g, '$1').trim()}</style>`)
  .replace(/>\s+</g, '><').trim();
mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL('dist/widget.html', root), html);

const preview = `<style>
:root{--tg-theme-bg-color:#fff;--tg-theme-text-color:#000;--tg-theme-hint-color:#707579;--tg-theme-link-color:#3390ec;--tg-theme-button-color:#3390ec;--tg-theme-button-text-color:#fff;--tg-theme-secondary-bg-color:#f4f4f5;--tg-theme-destructive-text-color:#df3f40}
body{background:#dce4eb;padding:24px!important}#bubble{width:360px;background:var(--tg-theme-bg-color);border-radius:12px;overflow:hidden}
@media(prefers-color-scheme:dark){:root{--tg-theme-bg-color:#212121;--tg-theme-text-color:#fff;--tg-theme-hint-color:#aaa;--tg-theme-button-color:#8774e1;--tg-theme-secondary-bg-color:#181818}}
</style><script>
const prices=${JSON.stringify(weapons.map(w => w.price))};
const speech=${JSON.stringify(friends.map((_, i) => JSON.parse(phrasesData(i)))).replace(/</g, '\\u003c')};
let coins=0,mask=1;
window.TelegramWidget={isActive:true,chatData:'{"c":0,"w":1}',publicData:'{"r":1,"v":[148,63,82,40,91,27],"t":[["Макс",232],["Аня",188],["Саша",31]]}',
onEvent(){},offEvent(){},ready(){},watchPublicData(){},unwatchPublicData(){},HapticFeedback:{impactOccurred(){}},
request:async data=>{
if(/^[fp]:/.test(data)){
const m=/^([fp]):(\\d+)$/.exec(data),i=Number(m?.[2]);
return {result:m&&i<speech.length&&m[1]==='p'?JSON.stringify(speech[i]):null};}
const m=/^(h|b):(\\d+):(\\d+):(\\d+)(?::(\\d+))?$/.exec(data);
if(m&&(m[1]==='b')===(m[5]!==undefined)){
const a=m.slice(2).filter(v=>v!==undefined).map(Number),[w,f,h,c]=m[1]==='b'?a:[0,...a];
if(a.every(Number.isSafeInteger)&&f<speech.length&&w<prices.length&&h<=300&&c<=h*${Math.max(...weapons.map(w => w.dmg))}+${KO_BONUS}*Math.ceil(h*${Math.max(...weapons.map(w => w.dmg))}/${HP})){
coins+=c;if(m[1]==='b'&&!(mask&1<<w)&&coins>=prices[w]){coins-=prices[w];mask|=1<<w;}}}
return {result:JSON.stringify({c:coins,w:mask})};}};
</script><div id="bubble">${html}</div>`;
writeFileSync(new URL('dist/preview.html', root), preview);
console.log('Собраны dist/widget.html и dist/preview.html');
