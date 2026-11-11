import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { friends, phrases, appWeapons, APP_HP, APP_KO_BONUS, APP_COIN_MULT } from './config.ts';
import { createAppDB, parseAppDB, migrateDB, verifyInitData, applySync, topData } from './appstate.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';

const root = fileURLToPath(new URL('.', import.meta.url));
const appDir = resolve(root, 'app');
const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : root; // DATA_DIR — для e2e-тестов
const dbPath = resolve(dataDir, 'appdata.json');
const oldPath = resolve(dataDir, 'data.json');
const dev = process.env.DEV === '1';
const token = process.env.BOT_TOKEN ?? '';
if (!dev && !token) throw new Error('BOT_TOKEN is required (or use DEV=1 locally)');
const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const migrating = !existsSync(dbPath) && existsSync(oldPath);
let db = existsSync(dbPath) ? parseAppDB(JSON.parse(readFileSync(dbPath, 'utf8')))
  : migrating ? migrateDB(JSON.parse(readFileSync(oldPath, 'utf8'))) : createAppDB();
let dirty = migrating;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let closing = false;

function flush() {
  if (!dirty) return;
  writeFileSync(`${dbPath}.tmp`, JSON.stringify(db), { mode: 0o600 });
  renameSync(`${dbPath}.tmp`, dbPath);
  dirty = false;
}
function scheduleSave() {
  dirty = true;
  if (saveTimer || closing) return;
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    try { flush(); } catch (error) {
      console.error('Unable to save app database:', (error as Error).message);
      scheduleSave();
    }
  }, 1000);
}
if (migrating) flush();

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
function failure(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}
function body(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    let exceeded = false;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 4096) {
        if (!exceeded) reject(failure(413, 'Body exceeds 4 KB'));
        exceeded = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', () => reject(failure(400, 'Unable to read body')));
    req.on('aborted', () => reject(failure(400, 'Request aborted')));
    req.on('end', () => {
      if (exceeded) return;
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(failure(400, 'Invalid JSON')); }
    });
  });
}
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const config = {
  friends: friends.map(({ id, name, color, outfit }) => ({ id, name, color, ...(outfit ? { outfit } : {}) })),
  weapons: appWeapons, hp: APP_HP, ko: APP_KO_BONUS, mult: APP_COIN_MULT,
  phrases: { common: phrases, ...Object.fromEntries(friends.filter(f => f.phrases).map(f => [f.id, f.phrases])) },
};

const server = createServer(async (req, res) => {
  try {
    let pathname: string;
    try { pathname = decodeURIComponent((req.url ?? '/').split('?')[0]); }
    catch { throw failure(400, 'Invalid URL'); }
    if (pathname === '/buddy' || pathname.startsWith('/buddy/')) pathname = pathname.slice(6) || '/';
    if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..')) {
      throw failure(403, 'Forbidden path');
    }
    if (pathname === '/api/config' && req.method === 'GET') return json(res, 200, config);
    if (pathname === '/api/top' && req.method === 'GET') return json(res, 200, topData(db));
    if (pathname === '/api/sync' && req.method === 'POST') {
      const data = await body(req);
      const initData = data && typeof data === 'object' && 'initData' in data ? data.initData : undefined;
      const user = verifyInitData(initData, token, { dev });
      if (!user) throw failure(401, 'Invalid Telegram authorization');
      let applied;
      try { applied = applySync(db, user, data); }
      catch (error) { throw failure(400, (error as Error).message); }
      if (applied.db !== db) {
        db = applied.db;
        scheduleSave();
      }
      return json(res, 200, applied.player);
    }
    if (pathname.startsWith('/api/')) throw failure(404, 'Unknown API route or method');
    if (req.method !== 'GET' && req.method !== 'HEAD') throw failure(405, 'Method not allowed');
    const file = resolve(appDir, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(appDir + sep)) throw failure(403, 'Forbidden path');
    let contents: Buffer;
    try {
      const actual = await realpath(file);
      if (!actual.startsWith(appDir + sep)) throw failure(403, 'Forbidden path');
      contents = await readFile(actual);
    } catch (error) {
      if ((error as { status?: number }).status) throw error;
      throw failure(404, 'File not found');
    }
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': extname(file) === '.woff2' ? 'max-age=31536000, immutable' : extname(file) === '.png' ? 'max-age=86400' : 'no-cache',
      'X-Content-Type-Options': 'nosniff', 'Content-Length': contents.length });
    res.end(req.method === 'HEAD' ? undefined : contents);
  } catch (error) {
    if (res.destroyed || res.writableEnded) return;
    const status = (error as { status?: number }).status ?? 500;
    if (status === 500) console.error('Request failed:', (error as Error).message);
    json(res, status, { error: status === 500 ? 'Internal server error' : (error as Error).message });
  }
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.on('clientError', (_error, socket) => {
  const response = JSON.stringify({ error: 'Invalid HTTP request' });
  if (socket.writable) socket.end(`HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(response)}\r\n\r\n${response}`);
});
server.on('error', error => {
  console.error('Server error:', error.message);
  process.exitCode = 1;
});
function shutdown() {
  if (closing) return;
  closing = true;
  if (saveTimer) clearTimeout(saveTimer);
  const deadline = setTimeout(() => server.closeAllConnections(), 5000);
  deadline.unref();
  server.close(() => {
    clearTimeout(deadline);
    try { flush(); } catch (error) {
      console.error('Unable to flush app database:', (error as Error).message);
      process.exitCode = 1;
    }
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
server.listen(port, '127.0.0.1', () => console.log(`Beat the Buddy listening on http://127.0.0.1:${port}`));
