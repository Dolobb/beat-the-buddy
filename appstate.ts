import { createHmac, timingSafeEqual } from 'node:crypto';
import { friends, appWeapons, APP_HP, APP_KO_BONUS } from './config.ts';

export type AppUser = { name: string; c: number; w: number; hits: number; seq: number };
export type AppDB = { rev: number; victims: number[]; users: Record<string, AppUser> };
export type TelegramUser = { id: number; first_name: string };
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const cleanName = (name: string) => Array.from(name.replace(/[\u0000-\u001f\u007f]/g, '')).slice(0, 64).join('');
const maxDmg = Math.max(...appWeapons.map(w => w.dmg ?? 1));

export function createAppDB(): AppDB {
  return { rev: 0, victims: friends.map(() => 0), users: {} };
}

function readDB(data: unknown, migrate: boolean): AppDB {
  if (!record(data) || !integer(data.rev) || !Array.isArray(data.victims) ||
      data.victims.length !== friends.length || !data.victims.every(integer) || !record(data.users)) {
    throw new Error('Invalid database');
  }
  const users: Record<string, AppUser> = {};
  for (const [id, u] of Object.entries(data.users)) {
    if (!/^[1-9]\d*$/.test(id) || !integer(Number(id)) || !record(u) || typeof u.name !== 'string' ||
        !integer(u.c) || !integer(u.hits) || !integer(u.w) || (!migrate && (!integer(u.seq) || u.w >= 1 << appWeapons.length))) {
      throw new Error('Invalid database user');
    }
    users[id] = { name: cleanName(u.name), c: u.c, w: migrate ? 3 : u.w | 3, hits: u.hits, seq: migrate ? 0 : u.seq as number };
  }
  return { rev: data.rev, victims: [...data.victims], users };
}

export const parseAppDB = (data: unknown): AppDB => readDB(data, false);
export const migrateDB = (data: unknown): AppDB => readDB(data, true);

export function verifyInitData(initData: unknown, token: string,
  { dev = false, now = Math.floor(Date.now() / 1000) }: { dev?: boolean; now?: number } = {}): TelegramUser | null {
  if (dev && initData === '') return { id: 1, first_name: 'Dev' };
  if (typeof initData !== 'string' || !token) return null;
  try {
    const params = new URLSearchParams(initData);
    if (new Set(params.keys()).size !== [...params].length) return null;
    const hash = params.get('hash') ?? '';
    const date = Number(params.get('auth_date'));
    if (!/^[a-f\d]{64}$/i.test(hash) || !params.has('auth_date') || !integer(date) || date > now || now - date > 86400) return null;
    params.delete('hash');
    const check = [...params].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(token).digest();
    const expected = createHmac('sha256', secret).update(check).digest();
    if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null;
    const user = JSON.parse(params.get('user') ?? 'null');
    if (!record(user) || !integer(user.id) || user.id === 0 || typeof user.first_name !== 'string') return null;
    return { id: user.id, first_name: user.first_name };
  } catch {
    return null;
  }
}

export function applySync(db: AppDB, user: TelegramUser, data: unknown) {
  if (!record(data) || !integer(data.seq) || !integer(data.f) || data.f >= friends.length ||
      !integer(data.hits) || data.hits > 2000 || !integer(data.coins) ||
      ('buy' in data && (!integer(data.buy) || data.buy >= appWeapons.length))) throw new Error('Invalid sync packet');
  const damage = data.hits * (maxDmg + 15);
  // Covers x3 combo, up to 15 collision damage per hit, KO rewards, and 5% rounding headroom; zero hits earn zero coins.
  const ceiling = Math.ceil((damage * 3 + APP_KO_BONUS * Math.ceil(damage / APP_HP)) * 1.05);
  if (data.coins > ceiling) throw new Error('Coin limit exceeded');
  const previous = db.users[user.id] ?? { name: '', c: 0, w: 3, hits: 0, seq: 0 };
  const player = (u: AppUser) => ({ c: u.c, w: u.w, seq: u.seq });
  if (data.seq <= previous.seq) return { db, player: player(previous) };
  const next = { ...previous, name: cleanName(user.first_name), c: previous.c + data.coins,
    hits: previous.hits + data.hits, seq: data.seq };
  const victimHits = db.victims[data.f] + data.hits;
  if (![next.c, next.hits, victimHits, db.rev + 1].every(integer)) throw new Error('Progress limit exceeded');
  if (typeof data.buy === 'number' && !(next.w & 1 << data.buy) && next.c >= appWeapons[data.buy].price) {
    next.c -= appWeapons[data.buy].price;
    next.w |= 1 << data.buy;
  }
  const victims = [...db.victims];
  victims[data.f] = victimHits;
  return { db: { rev: db.rev + 1, victims, users: { ...db.users, [user.id]: next } }, player: player(next) };
}

export function topData(db: AppDB) {
  return {
    victims: friends.map((f, i) => ({ name: f.name, hits: db.victims[i] })).sort((a, b) => b.hits - a.hits),
    fighters: Object.entries(db.users).filter(([, u]) => u.hits > 0).sort(([, a], [, b]) => b.hits - a.hits).slice(0, 20)
      .map(([id, u]) => ({ id: Number(id), name: u.name, hits: u.hits })),
  };
}
