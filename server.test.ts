import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { mkdtemp, cp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('HTTP handler: prefix/static/auth/body/idempotency and atomic shutdown save', async t => {
  const dir=await mkdtemp(join(tmpdir(),'buddy-http-'));
  const originalCreate=http.createServer, originalDev=process.env.DEV, originalPort=process.env.PORT;
  const oldSignals=new Set([...process.listeners('SIGTERM'),...process.listeners('SIGINT')]);
  const old={rev:1,victims:[0,0,0,0,0,0],users:{'1':{name:'Dev',c:42,w:255,hits:0}}};
  let handler: (req: unknown,res: unknown) => Promise<void>,closed=false;
  const fakeServer=Object.assign(new EventEmitter(),{
    listen() {}, // Exercise the HTTP handler without binding a socket.
    close(cb: ()=>void) { closed=true;cb(); },closeAllConnections() {},
  });
  try {
    for(const file of ['server.ts','appstate.ts','config.ts']) await cp(new URL(file,import.meta.url),join(dir,file));
    await writeFile(join(dir,'package.json'),'{"type":"module"}');
    await mkdir(join(dir,'app','assets'),{recursive:true});
    await writeFile(join(dir,'app','index.html'),'<html>Buddy</html>');
    await writeFile(join(dir,'app','main.js'),'export const ready=true;');
    await writeFile(join(dir,'app','assets','head-f1.png'),'png');
    await writeFile(join(dir,'data.json'),JSON.stringify(old));
    process.env.DEV='1';process.env.PORT='8791';
    http.createServer=((fn: typeof handler)=>{handler=fn;return fakeServer;}) as typeof http.createServer;
    syncBuiltinESMExports();
    await import(pathToFileURL(join(dir,'server.ts')).href);
    async function request(url: string,method='GET',data?: unknown,raw=false) {
      const req=Object.assign(new EventEmitter(),{url,method});
      const result={status:0,headers:{} as Record<string,string|number>,body:''};
      const res={destroyed:false,writableEnded:false,
        writeHead(status: number,headers: Record<string,string|number>){result.status=status;result.headers=headers;},
        end(contents?: Buffer|string){res.writableEnded=true;result.body=contents?.toString()??'';},
      };
      const done=handler(req,res);
      if(method==='POST') { req.emit('data',Buffer.from(raw?String(data):JSON.stringify(data)));req.emit('end'); }
      await done;
      return result;
    }
    await t.test('serves prefixed and root static with MIME/cache and HEAD',async()=>{
      for(const url of ['/','/buddy/']) {
        const r=await request(url);assert.equal(r.status,200);assert.match(r.body,/Buddy/);assert.equal(r.headers['Cache-Control'],'no-cache');
      }
      const js=await request('/buddy/main.js');assert.match(String(js.headers['Content-Type']),/javascript/);
      const png=await request('/buddy/assets/head-f1.png');assert.equal(png.headers['Cache-Control'],'max-age=86400');
      const head=await request('/buddy/','HEAD');assert.equal(head.status,200);assert.equal(head.body,'');
    });
    await t.test('rejects traversal, broken JSON, auth, oversized body; keeps serving',async()=>{
      for(const url of ['/buddy/../config.ts','/buddy/%2e%2e/config.ts','/buddy/%5cconfig.ts']) assert.equal((await request(url)).status,403);
      assert.equal((await request('/buddy/%zz')).status,400);
      assert.equal((await request('/buddy/api/sync','POST','{',true)).status,400);
      assert.equal((await request('/buddy/api/sync','POST',{initData:'bad'})).status,401);
      assert.equal((await request('/buddy/api/sync','POST','x'.repeat(4097),true)).status,413);
      assert.equal((await request('/buddy/api/config')).status,200);
    });
    await t.test('config, migration, zero read, sync duplicate and top',async()=>{
      const config=JSON.parse((await request('/buddy/api/config')).body);assert.equal(config.weapons.length,12);assert.equal(config.friends[0].outfit,'f1');
      const zero={initData:'',seq:0,f:0,hits:0,coins:0};
      assert.deepEqual(JSON.parse((await request('/buddy/api/sync','POST',zero)).body),{c:42,w:3,seq:0});
      const p={...zero,seq:1,hits:3,coins:6};
      const a=await request('/buddy/api/sync','POST',p),b=await request('/api/sync','POST',p);
      assert.deepEqual(a,b);assert.deepEqual(JSON.parse(a.body),{c:48,w:3,seq:1});
      const top=JSON.parse((await request('/buddy/api/top')).body);assert.equal(top.victims[0].hits,3);assert.equal(top.fighters[0].hits,3);
    });
    const stop=process.listeners('SIGTERM').find(fn=>!oldSignals.has(fn));assert.ok(stop);stop();assert.equal(closed,true);
    const saved=JSON.parse(await readFile(join(dir,'appdata.json'),'utf8'));
    assert.equal(saved.users['1'].c,48);assert.equal(saved.users['1'].seq,1);
    assert.deepEqual(JSON.parse(await readFile(join(dir,'data.json'),'utf8')),old);
    await assert.rejects(readFile(join(dir,'appdata.json.tmp')));
  } finally {
    http.createServer=originalCreate;syncBuiltinESMExports();
    if(originalDev===undefined) delete process.env.DEV;else process.env.DEV=originalDev;
    if(originalPort===undefined) delete process.env.PORT;else process.env.PORT=originalPort;
    for(const signal of ['SIGTERM','SIGINT'] as const) for(const fn of process.listeners(signal)) if(!oldSignals.has(fn)) process.removeListener(signal,fn);
    await rm(dir,{recursive:true,force:true});
  }
});
