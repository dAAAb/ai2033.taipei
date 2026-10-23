import { RACE } from './race-config.js';
// What a share link points at, looked up from the public leaderboard, plus the wording around it.
// The Supabase URL and publishable key are public (the same ones the game uses in 3d/js/board.js).
export const SITE = 'https://ai2033.taipei';
const DB = {
  url: process.env.SUPABASE_URL || 'https://ogvqrfdgflxhfdqwtrxq.supabase.co',
  key: process.env.SUPABASE_KEY || 'sb_publishable_Fe_h6sRUasUjh3jCuXkgKA_qtCRfwpM',
};
export const COURSE = RACE.id;
export const ORDERS = RACE.stops.map(({ item, to }) => ({ item, to }));

export const fmtTime = (ms) => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(2).padStart(5, '0')}`;
export const fmtSec = (ms) => `${(ms / 1000).toFixed(2)} 秒`;
export const fmtAny = (ms) => (ms >= 60000 ? fmtTime(ms) : fmtSec(ms));
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function rpc(fn, body) {
  const res = await fetch(`${DB.url}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: DB.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`${fn}: HTTP ${res.status}`);
  return res.json();
}

// The thing being shared, from the request's query:
//   ?id=123                  a registered entry (live place on its board)
//   ?n=ABC&ms=83450&k=0      a run that wasn't registered (no place); k = 0 for all five orders, 1-5 for one order
//   ?board=1                 the boards themselves (top three of the total board)
// -> { kind: 'run' | 'board' | 'site', initials, ms, leg, rank, total, rows }
export async function lookup(q) {
  try {
    if (q.get('board')) {
      const b = await rpc('race_boards', { p_course: COURSE, p_limit: 3 });
      return { kind: 'board', rows: (b.total || []).filter(r => /^[A-Z]{3}$/.test(r.i)).slice(0, 3) };
    }
    const id = q.get('id');
    if (id && /^\d{1,12}$/.test(id)) {
      const e = await rpc('race_entry', { p_id: +id });
      if (e && e.course === COURSE && /^[A-Z]{3}$/.test(e.initials) && e.leg >= 0 && e.leg <= ORDERS.length) {
        return { kind: 'run', id: e.id, initials: e.initials, ms: e.ms, leg: e.leg, rank: e.rank, total: e.total };
      }
    }
  } catch { /* fall through to the request's own numbers, or the plain site card */ }
  const n = q.get('n') || '', ms = +q.get('ms'), k = +(q.get('k') || 0);
  if (/^[A-Z]{3}$/.test(n) && Number.isInteger(ms) && ms >= 200 && ms <= 900000 && Number.isInteger(k) && k >= 0 && k <= ORDERS.length) {
    return { kind: 'run', initials: n, ms, leg: k };
  }
  if (q.get('board')) return { kind: 'board', rows: [] };
  return { kind: 'site' };
}

// headline, description and where a person (not a crawler) ends up
export function words(x) {
  if (x.kind === 'board') {
    const top = x.rows[0];
    return {
      title: '臺北 2033 外送王・全台排行榜',
      desc: top ? `目前第一名 ${top.i}：${fmtAny(top.ms)}。開小黃在 2033 年的臺北AI園區送 5 單，你上得了榜嗎？` : '開小黃在 2033 年的臺北AI園區送 5 單，搶下第一個上榜的位置！',
      go: `${SITE}/rank/`,
    };
  }
  if (x.kind === 'run') {
    const place = x.rank ? `，全台${x.leg ? '任務榜' : '總榜'}第 ${x.rank} 名` : '';
    if (x.leg === 0) {
      return {
        title: `${x.initials} 送完 5 單只花 ${fmtTime(x.ms)}${place}｜臺北 2033 外送王`,
        desc: `你能比 ${x.initials} 快嗎？點開直接挑戰：開小黃在 2033 年的臺北AI園區送 5 單 🛵`,
        go: `${SITE}/3d/?race&vs=${x.initials}.${x.ms}`,
      };
    }
    const o = ORDERS[x.leg - 1];
    return {
      title: `${x.initials} 第 ${x.leg} 單送${o.item}只花 ${fmtSec(x.ms)}${place}｜臺北 2033 外送王`,
      desc: `${o.item} → ${o.to}。你送得比 ${x.initials} 快嗎？點開直接挑戰 🛵`,
      go: `${SITE}/3d/?race`,
    };
  }
  return { title: '臺北 2033 外送王', desc: '開小黃在 2033 年的臺北AI園區送 5 單，挑戰全台排行榜 🛵', go: `${SITE}/3d/?race` };
}

// the card image URL for the same thing
export function cardQuery(q) {
  const out = new URLSearchParams();
  for (const k of ['id', 'n', 'ms', 'k', 'board']) if (q.get(k)) out.set(k, q.get(k));
  return out.toString();
}
