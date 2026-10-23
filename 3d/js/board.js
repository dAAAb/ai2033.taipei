import { MIN_BOARD_REVISION } from './race-config.js';
// Leaderboards for 2033 外送王: one for the whole run and one for each order. With the Supabase project
// below, everyone shares the same boards (runs are checked server-side by tools/leaderboard/supabase.sql);
// if it can't be reached, scores stay on this device.
export const BOARD = {
  url: 'https://ogvqrfdgflxhfdqwtrxq.supabase.co',
  key: 'sb_publishable_Fe_h6sRUasUjh3jCuXkgKA_qtCRfwpM',   // publishable (public) key: the database only accepts runs through submit_score()
};
// share links: per-run pages with their own preview image (og/, deployed on Vercel); empty = link straight to the game
export const SHARE = 'https://go.ai2033.taipei';
export const TOP = 10;   // places shown on each board, and what counts as "making the board"
const REV = MIN_BOARD_REVISION;           // oldest race_boards() 'rev' the game works with (rev 1 rejected today's top speed; rev 3 adds entry ids for share cards)

// three-letter names the boards refuse (also enforced in the database)
const BLOCK = new Set(('ASS CUM COK CNT DIC DIK FAG FCK FUC FUK FUQ FKU JIZ KKK KYS NGR NIG SEX SHT TIT VAG XXX ' +
  'CNM NMB TMD MLB GAN').split(' '));
export const refused = (s) => BLOCK.has(s);
export const isShared = () => !!(BOARD.url && BOARD.key);

let sharedOk = false;   // the shared boards answered with the right version this session
const lsKey = (course) => `ai2033.race.${course}`;
const clean = (rows) => (Array.isArray(rows) ? rows : []).filter(r => r && /^[A-Z]{3}$/.test(r.i) && Number.isFinite(r.ms));
// this device's boards: { total: [{ i, ms }], legs: [[{ i, ms }] × stops] }
function readLocal(course, nLegs) {
  let b = null;
  try { b = JSON.parse(localStorage.getItem(lsKey(course) + '.v2') || 'null'); } catch { /* storage off */ }
  if (!b) {   // first version kept whole runs only
    let old = []; try { old = JSON.parse(localStorage.getItem(lsKey(course)) || '[]'); } catch { /* storage off */ }
    b = { total: clean(old), legs: [] };
  }
  b.total = clean(b.total); b.legs = Array.from({ length: nLegs }, (_, k) => clean((b.legs || [])[k]));
  return b;
}
function writeLocal(course, b) { try { localStorage.setItem(lsKey(course) + '.v2', JSON.stringify(b)); } catch { /* storage off */ } }
const insertRow = (rows, row) => { rows.push(row); rows.sort((a, b) => a.ms - b.ms); rows.splice(50); return rows.indexOf(row) + 1; };

async function rpc(fn, body) {
  const headers = { apikey: BOARD.key, 'Content-Type': 'application/json' };
  if (BOARD.key.startsWith('eyJ')) headers.Authorization = `Bearer ${BOARD.key}`;   // legacy anon JWT keys
  const res = await fetch(`${BOARD.url.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok) { const e = new Error((data && data.message) || `HTTP ${res.status}`); e.reason = data && data.message; e.detail = data && data.details; throw e; }
  return data;
}

// place a time would take on a board (1 = fastest), and whether that is within the top TOP
export const placeOf = (rows, ms) => rows.filter(r => r.ms <= ms).length + 1;
export const makesBoard = (rows, ms) => placeOf(rows, ms) <= TOP;

// all boards of a course, fastest first: { shared, total, legs }
export async function boards(course, nLegs, n = TOP) {
  if (isShared()) {
    try {
      const b = await rpc('race_boards', { p_course: course, p_limit: n });
      if (!(b.rev >= REV)) throw new Error('database needs the current supabase.sql');
      sharedOk = true;
      return { shared: true, total: clean(b.total), legs: Array.from({ length: nLegs }, (_, k) => clean((b.legs || [])[k])) };
    } catch { /* fall back to this device */ }
  }
  const b = readLocal(course, nLegs);
  return { shared: false, total: b.total.slice(0, n), legs: b.legs.map(r => r.slice(0, n)) };
}

// run: { initials, legs: [0 = whole run, k = order k], splits: [ms at each delivery so far], trace: [[ms, x, z], …] }
// -> { shared, ranks: { [leg]: { id?, ms, rank, total } }, reason?, detail? }
export async function submit(course, nLegs, run) {
  const b = readLocal(course, nLegs), ranks = {};
  for (const leg of run.legs) {
    const ms = leg === 0 ? run.splits[run.splits.length - 1] : run.splits[leg - 1] - (leg > 1 ? run.splits[leg - 2] : 0);
    const rows = leg === 0 ? b.total : b.legs[leg - 1];
    ranks[leg] = { ms, rank: insertRow(rows, { i: run.initials, ms }), total: rows.length };
  }
  writeLocal(course, b);
  const local = { shared: false, ranks };
  if (!isShared() || !sharedOk) return local;
  try {
    const r = await rpc('submit_score', { p_course: course, p_initials: run.initials, p_legs: run.legs, p_splits: run.splits, p_trace: run.trace });
    return { shared: true, ranks: r };
  } catch (e) {
    return { ...local, reason: e.reason || 'offline', detail: e.detail };
  }
}

export function personalBest(course) { try { return +localStorage.getItem(lsKey(course) + '.pb') || null; } catch { return null; } }
export function savePersonalBest(course, ms) { try { localStorage.setItem(lsKey(course) + '.pb', String(ms)); } catch { /* storage off */ } }
export function lastInitials() { try { const s = localStorage.getItem('ai2033.initials') || ''; return /^[A-Z]{3}$/.test(s) ? s : 'AAA'; } catch { return 'AAA'; } }
export function saveInitials(s) { try { localStorage.setItem('ai2033.initials', s); } catch { /* storage off */ } }

// the link to share for one entry: its own page when the share service is set up, else the game itself
export function shareLink({ id, initials, ms, leg }) {
  if (SHARE) return id ? `${SHARE}/r/${id}` : `${SHARE}/r?n=${initials}&ms=${ms}&k=${leg}`;
  return leg === 0 ? `https://ai2033.taipei/3d/?race&vs=${initials}.${ms}` : 'https://ai2033.taipei/3d/?race';
}
export const boardLink = () => (SHARE ? `${SHARE}/b` : 'https://ai2033.taipei/rank/');
