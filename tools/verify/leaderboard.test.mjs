import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const sql = await readFile(new URL('../leaderboard/supabase.sql', import.meta.url), 'utf8');
before(async () => {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await db.exec(sql);
  await db.exec(sql); // migrations must be safe to apply twice
});
beforeEach(async () => {
  await db.exec('RESET ROLE; TRUNCATE public.race_scores RESTART IDENTITY;');
  await db.query("SELECT set_config('request.headers', $1, false)", [JSON.stringify({ 'cf-connecting-ip': '192.0.2.1' })]);
  await db.exec('SET ROLE anon');
});
after(() => db.close());

const linear = (start = 0, duration = 10000, steps = 20) => Array.from({ length: steps + 1 }, (_, i) =>
  [Math.round(start + duration * i / steps), Math.round(101 + 900 * i / steps), Math.round(691 - 140 * i / steps)]);
const submit = (trace, splits = [10000], legs = [1]) => db.query(
  'SELECT public.submit_score($1,$2,$3::int[],$4::int[],$5::jsonb) AS result', ['c2', 'TST', legs, splits, JSON.stringify(trace)]);
const rejected = (trace, splits) => assert.rejects(submit(trace, splits), /implausible/);

test('接受合理路線與送達時同位置的重複樣本', async () => {
  const trace = linear(); trace.push(trace.at(-1));
  const result = await submit(trace);
  assert.equal(result.rows[0].result['1'].ms, 10000);
});
test('相容舊客戶端首個畫格的時間戳', async () => {
  const trace = linear(); trace[0][0] = 17;
  assert.equal((await submit(trace)).rows[0].result['1'].ms, 10000);
});
test('拒絕空座標、字串、布林與非陣列樣本', async () => {
  for (const sample of [[200, null, null], [200, '1001', 551], [200, true, 551], null, {}, [200]]) {
    await rejected([[0, 101, 691], sample], [200]);
  }
});
test('拒絕負數起始時間、分數時間與超出範圍座標', async () => {
  await rejected(linear(-5800, 6000, 12), [200]);
  await rejected([[0, 101, 691], [200.5, 1001, 551]], [200]);
  await rejected([[0, 101, 691], [200, 1e100, 551]], [200]);
});
test('拒絕零時間位移與密集取樣累積容差', async () => {
  await rejected([...linear(0, 0, 1000), [200, 1001, 551]], [200]);
  await rejected(linear(0, 400, 400), [400]);
});
test('拒絕瞬移、倒退時間、缺少送達點與非法分段', async () => {
  await rejected([[0, 101, 691], [200, 1001, 551]], [200]);
  const backwards = linear(); backwards[2][0] = 499;
  await rejected(backwards);
  await rejected(linear(), [9999]);
  await rejected(linear(), [null]);
});
test('拒絕匿名直接讀寫成績表', async () => {
  await assert.rejects(db.query('SELECT * FROM public.race_scores'), /permission denied/);
  await assert.rejects(db.query('DELETE FROM public.race_scores'), /permission denied/);
});
