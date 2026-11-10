import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { friends } from '../config.ts';

test('all configured heads and outfits exist; PNG dimensions match manifest',()=>{
  const manifest=JSON.parse(readFileSync(new URL('./assets/manifest.json',import.meta.url),'utf8'));
  for(const friend of friends) {
    assert.ok(manifest.heads[friend.id],friend.id);
    if(friend.outfit) assert.ok(manifest.bodies[friend.outfit],friend.outfit);
  }
  const parts=['torso','arm','hand','thigh','shin'];
  assert.ok(manifest.bodies.naked);
  for(const body of Object.values(manifest.bodies)) assert.deepEqual(Object.keys(body).sort(),[...parts].sort());
  const files=[...Object.entries(manifest.heads).map(([id,size])=>[`head-${id}`,size]),
    ...Object.entries(manifest.bodies).flatMap(([sheet,parts])=>Object.entries(parts).map(([part,size])=>[`body-${sheet}-${part}`,size]))];
  for(const [name,size] of files) {
    const png=readFileSync(new URL(`./assets/${name}.png`,import.meta.url));
    assert.equal(png.subarray(1,4).toString(),'PNG',name);
    assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],size.slice(0,2),name);
  }
});

test('authored client imports, API and markup URLs stay relative and local',()=>{
  const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
  const urls=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]);
  for(const file of ['main','net','physics','weapons','fx','sfx']) {
    const source=readFileSync(new URL(`./${file}.js`,import.meta.url),'utf8');
    assert.doesNotMatch(source,/https?:\/\/|telegram\.org/);
    urls.push(...[...source.matchAll(/(?:from\s+|fetch\(|loadJSON\()'([^']+)'/g)].map(m=>m[1]));
  }
  assert.ok(urls.length>6);
  assert.ok(urls.every(url=>url.startsWith('./')),JSON.stringify(urls));
  assert.match(html,/src="\.\/vendor\/telegram-web-app\.js"/);
});
