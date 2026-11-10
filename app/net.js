export const storage = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(`buddy:${key}`)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`buddy:${key}`, JSON.stringify(value)); return true; } catch { return false; }
  },
};

export function createNet(initData, onChange) {
  let id = 'dev';
  try { id = JSON.parse(new URLSearchParams(initData).get('user')).id; } catch { /* DEV outside Telegram. */ }
  const key = `net:${id}`;
  const saved = storage.get(key, {});
  let server = saved.server ?? { c: 0, w: 3, seq: 0 };
  let seq = saved.seq ?? 0, packet = saved.packet ?? null, pending = saved.pending ?? [];
  let purchase = saved.purchase ?? null, active = false, ready = false, offline = false, error = '', persisted = true;
  function view() {
    return { c: server.c + (packet?.coins ?? 0) + pending.reduce((n,p) => n+p.coins, 0),
      w: server.w, seq: server.seq, offline, error, persisted, buying: purchase !== null || packet?.buy !== undefined };
  }
  function changed() {
    persisted = storage.set(key, { server, seq, packet, pending, purchase });
    onChange(view());
  }
  async function send(p, keepalive) {
    const response = await fetch('./api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, ...p }), keepalive, signal: AbortSignal.timeout(12000) });
    const result = await response.json();
    if (!response.ok) {
      const e = new Error(response.status === 401 ? 'Открой игру заново из Telegram' : result.error || 'Ошибка синхронизации');
      e.status = response.status; throw e;
    }
    return result;
  }
  async function flush(keepalive = false) {
    if (active) return;
    active = true;
    try {
      if (!ready) {
        server = await send({ seq: 0, f: 0, hits: 0, coins: 0 }, keepalive);
        seq = Math.max(seq, server.seq);
        if (packet && packet.seq <= server.seq) packet = null;
        ready = true; changed();
      }
      // At most one immutable packet is in flight; new hits stay in pending until acknowledgement.
      while (packet || pending.length || purchase !== null) {
        if (!packet) {
          packet = { ...(pending.shift() ?? { f: 0, hits: 0, coins: 0, buy: purchase }), seq: ++seq };
          if (packet.buy !== undefined) purchase = null;
          changed();
        }
        server = await send(packet, keepalive);
        seq = Math.max(seq, server.seq);
        packet = null; offline = false; error = ''; changed();
      }
      offline = false; error = '';
    } catch (e) {
      offline = true; error = e.status ? e.message : '';
    } finally { active = false; changed(); }
  }
  return {
    view, start: () => flush(), flush,
    earn(f, coins) {
      let p = pending.findLast(p => p.f === f && p.hits < 2000);
      if (!p) pending.push(p = { f, hits: 0, coins: 0 });
      p.hits++; p.coins += Math.round(coins); changed();
    },
    buy(index) {
      if (view().buying) return Promise.resolve();
      purchase = index; changed(); return flush();
    },
    async top() {
      const response = await fetch('./api/top', { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Не удалось загрузить рейтинг');
      return response.json();
    },
  };
}
