import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

// Run against a disposable local PostgreSQL database, never the production Supabase project.
const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url);
let admin;
before(async () => {
  if (!enabled) return;
  assert.ok(['localhost','127.0.0.1','::1','[::1]'].includes(new URL(url).hostname));
  admin = new pg.Client({connectionString:url}); await admin.connect();
  await admin.query("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;");
  await admin.query(await readFile(new URL('../leaderboard/supabase.sql',import.meta.url),'utf8'));
  // Widen the check/insert race so the old implementation fails deterministically.
  await admin.query("CREATE OR REPLACE FUNCTION public.test_slow_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.15); RETURN NEW; END $$; DROP TRIGGER IF EXISTS test_delay ON public.race_scores; CREATE TRIGGER test_delay BEFORE INSERT ON public.race_scores FOR EACH ROW EXECUTE FUNCTION public.test_slow_insert();");
});
beforeEach(async () => { if (enabled) await admin.query('TRUNCATE public.race_scores, public.race_submissions'); });
after(async () => { if (admin) await admin.end(); });
async function submit(ip,initials,duration) {
  const client = new pg.Client({connectionString:url}); await client.connect();
  try {
    await client.query("SELECT set_config('request.headers',$1,false)",[JSON.stringify({'cf-connecting-ip':ip})]);
    await client.query('SET ROLE anon');
    const trace=Array.from({length:23},(_,i)=>[Math.round(duration*i/22),Math.round(101+900*i/22),Math.round(691-140*i/22)]);
    return (await client.query('SELECT public.submit_score($1,$2,$3::int[],$4::int[],$5::jsonb) AS result',['c2',initials,[1],[duration],JSON.stringify(trace)])).rows[0].result;
  } finally {await client.end();}
}
for (const scenario of [
  {name:'相同請求並行重試僅寫入一次',calls:[['192.0.2.1','TST',10000],['192.0.2.1','TST',10000]],error:null},
  {name:'同一連線並行登錄仍受限流保護',calls:[['192.0.2.1','TST',10000],['192.0.2.1','ABC',11000]],error:'rate_limited'},
  {name:'不同連線並行重播同一路線只接受一次',calls:[['192.0.2.1','TST',10000],['192.0.2.2','ABC',10000]],error:'duplicate'},
]) {
  test(scenario.name,{skip:!enabled},async()=>{
    const results=await Promise.allSettled(scenario.calls.map(args=>submit(...args)));
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM public.race_scores')).rows[0].n,1);
    if(scenario.error){
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.match(results.find(r=>r.status==='rejected').reason.message,new RegExp(scenario.error));
    } else {assert.deepEqual(results[0],results[1]); assert.equal(results[0].status,'fulfilled');}
  });
}
