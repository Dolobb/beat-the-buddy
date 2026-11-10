import { friends, weapons, KO_BONUS } from './config.ts';

export type User = { name: string; c: number; w: number; hits: number };
export type Database = {
  widget?: { id: string; htmlHash: string };
  rev: number;
  victims: number[];
  users: Record<string, User>;
};

export function createDB(): Database {
  return { rev: 0, victims: friends.map(() => 0), users: {} };
}

export function playerData(db: Database, userId: string | number): string {
  const u = db.users[userId];
  return JSON.stringify({ c: u?.c ?? 0, w: (u?.w ?? 1) | 1 });
}

export function applyQuery(db: Database, userId: string | number, name: string, data: unknown): string | undefined {
  if (typeof data !== 'string' || Buffer.byteLength(data) > 64) return playerData(db, userId);
  if (/^f:[0-5]$/.test(data)) return undefined;
  const match = /^(h|b):(\d+):(\d+):(\d+)(?::(\d+))?$/.exec(data);
  if (!match) return playerData(db, userId);
  const buy = match[1] === 'b';
  if (buy !== (match[5] !== undefined)) return playerData(db, userId);
  const values = match.slice(2).filter(v => v !== undefined).map(Number);
  const [w, f, hits, coins] = buy ? values : [0, ...values];
  if (!values.every(Number.isSafeInteger) || f >= friends.length || w >= weapons.length ||
      hits > 300 || coins > hits * 5 + KO_BONUS * Math.ceil(hits / 20)) return playerData(db, userId);
  const u = db.users[userId] ??= { name: '', c: 0, w: 1, hits: 0 };
  u.name = Array.from(name.replace(/\0/g, '')).slice(0, 12).join('');
  u.w |= 1;
  u.c += coins;
  u.hits += hits;
  db.victims[f] += hits;
  if (buy && !(u.w & (1 << w)) && u.c >= weapons[w].price) {
    u.c -= weapons[w].price;
    u.w |= 1 << w;
  }
  return playerData(db, userId);
}

export function publicData(db: Database): string {
  return JSON.stringify({
    r: db.rev,
    v: db.victims,
    t: Object.values(db.users).sort((a, b) => b.hits - a.hits).slice(0, 3)
      .map(u => [Array.from(u.name.replace(/\0/g, '')).slice(0, 12).join(''), u.hits]),
  });
}

export function topText(db: Database): string {
  const victims = friends.map((f, i) => [f.name, db.victims[i]] as const).sort((a, b) => b[1] - a[1]);
  const fighters = Object.values(db.users).filter(u => u.hits).sort((a, b) => b.hits - a.hits).slice(0, 10);
  const lines = (rows: (readonly [string, number])[]) => rows.map(([n, v], i) => `${i + 1}. ${n}: ${v}`).join('\n');
  return `Кто огрёб\n${lines(victims)}\n\nКто бил\n${fighters.length ? lines(fighters.map(u => [u.name, u.hits] as const)) : 'пока никто'}`;
}
