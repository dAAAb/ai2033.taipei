import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
after(() => db.close());
const trace = Array.from({length:21}, (_,i) => [i*500,101+45*i,691-7*i]);
const call = (initials='TST', samples=trace) => db.query('SELECT public.submit_score($1,$2,$3::int[],$4::int[],$5::jsonb) AS result', ['c2',initials,[1],[10000],JSON.stringify(samples)]);
test('成功請求重送回傳原始結果，修改內容則仍檢查限流與重播', async () => {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  const sql = await readFile(new URL('../leaderboard/supabase.sql', import.meta.url),'utf8');
  await db.exec(sql); await db.exec(sql);
  await db.query("SELECT set_config('request.headers', $1, false)", [JSON.stringify({'cf-connecting-ip':'192.0.2.1'})]);
  await db.exec('SET ROLE anon');
  const first = await call();
  assert.deepEqual((await call()).rows,first.rows);
  await assert.rejects(call('ABC'),/rate_limited/);
  await assert.rejects(db.query('SELECT * FROM public.race_submissions'),/permission denied/);
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.race_scores')).rows[0].n,1);
  await db.query("SELECT set_config('request.headers', $1, false)", [JSON.stringify({'cf-connecting-ip':'192.0.2.2'})]);
  await db.exec('SET ROLE anon');
  await assert.rejects(call('ABC'),/duplicate/);
});
test('登錄重試只保留同一趟的單筆本機成績', async () => {
  const data = new Map();
  globalThis.localStorage = {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v))};
  const original = globalThis.fetch;
  globalThis.fetch = async url => String(url).endsWith('race_boards')
    ? new Response(JSON.stringify({rev:3,total:[],legs:[[],[],[],[],[]]}))
    : new Response(JSON.stringify({message:'rate_limited'}),{status:400});
  try {
    const board = await import('../../3d/js/board.js');
    await board.boards('c2',5);
    const run = {id:'same-run',initials:'TST',legs:[1],splits:[10000],trace};
    assert.equal((await board.submit('c2',5,run)).reason,'rate_limited');
    await board.submit('c2',5,{...run,initials:'ABC'});
    const rows = JSON.parse(data.get('ai2033.race.c2.v2')).legs[0];
    assert.equal(rows.length,1); assert.equal(rows[0].i,'ABC');
  } finally {globalThis.fetch=original; delete globalThis.localStorage;}
});
