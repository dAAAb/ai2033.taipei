-- 臺北 2033 外送王 — public leaderboards on Supabase (Postgres).
-- Run this whole file in the Supabase SQL editor. It is safe to run again, and it upgrades the first
-- version (one board per course) to one board per order plus the whole-run board.
-- Browsers can only call race_boards() and submit_score(); the table itself stays closed to the public.
-- submit_score() replays the run's route samples: it starts on the start line, never goes faster than the
-- taxi can, and reaches each stop in order at its split time. Remove a bad entry with:
--   delete from public.race_scores where id = …;

create table if not exists public.race_scores (
  id bigint generated always as identity primary key,
  course text not null,
  leg smallint not null default 0,   -- 0 = all five orders, 1-5 = that order on its own
  initials text not null check (initials ~ '^[A-Z]{3}$'),
  ms integer not null check (ms between 200 and 900000),
  splits integer[] not null,
  created_at timestamptz not null default now(),
  client text   -- hashed client address, used only for the rate limit
);
alter table public.race_scores add column if not exists leg smallint not null default 0;
-- an order can take just over a second with the 1:6 taxi (course c2)
alter table public.race_scores drop constraint if exists race_scores_ms_check;
alter table public.race_scores add constraint race_scores_ms_check check (ms between 200 and 900000);
drop index if exists public.race_scores_rank;
create index if not exists race_scores_board on public.race_scores (course, leg, ms, created_at);
create index if not exists race_scores_client on public.race_scores (client, created_at desc);
create index if not exists race_scores_splits on public.race_scores (course, splits);   -- replay check in submit_score
alter table public.race_scores enable row level security;   -- no policies: no direct reads or writes
revoke all on public.race_scores from public;

-- A successful request can be retried after a lost response without registering it twice.
-- Only a SHA-256 digest and its response are retained, never the full trace.
create table if not exists public.race_submissions (
  fingerprint text primary key,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.race_submissions enable row level security;
revoke all on public.race_submissions from public, anon, authenticated;

-- courses the game ships (3d/js/content.js RACE): start, delivery radius and stops in world metres, and the
-- fastest the taxi can go there in world m/s plus a little slack (c1: 58 m/s taxi; c2: the 1:6 taxi, 167 m/s)
create or replace function public.race_course(p_course text)
returns jsonb language sql immutable set search_path = public as $$
  select case p_course
    when 'c1' then '{"start":[101,691],"radius":30,"vmax":60.5,"stops":[[1001,551],[-129,471],[91,-69],[61,-249],[231,-529]]}'::jsonb
    when 'c2' then '{"start":[101,691],"radius":30,"vmax":172,"stops":[[1001,551],[-129,471],[91,-69],[61,-249],[231,-529]]}'::jsonb
  end
$$;

-- the first version's functions
drop function if exists public.race_top(text, int);
drop function if exists public.submit_score(text, text, int, int[], jsonb);

-- every board of a course: {"total": [{i, ms}, …], "legs": [[{i, ms}, …] × stops]}, fastest first
create or replace function public.race_boards(p_course text, p_limit int default 10)
returns jsonb language sql stable security definer set search_path = public as $$
  with n as (select least(greatest(coalesce(p_limit, 10), 1), 50) as lim,
                    coalesce(jsonb_array_length(public.race_course(p_course)->'stops'), 0) as stops),
  boards as (
    select g.leg, coalesce(jsonb_agg(jsonb_build_object('i', t.initials, 'ms', t.ms) order by t.ms, t.created_at)
                           filter (where t.ms is not null), '[]'::jsonb) as rows
    from n cross join generate_series(0, n.stops) as g(leg)
    left join lateral (
      select s.initials, s.ms, s.created_at from public.race_scores s
      where s.course = p_course and s.leg = g.leg
      order by s.ms, s.created_at limit n.lim
    ) t on true
    group by g.leg
  )
  select jsonb_build_object(
    'rev', 3,   -- the game only uses the shared boards when this matches (3d/js/board.js REV)
    'total', coalesce((select rows from boards where leg = 0), '[]'::jsonb),
    'legs', coalesce((select jsonb_agg(rows order by leg) from boards where leg > 0), '[]'::jsonb))
$$;

-- register a run, finished or not. p_splits: ms at each delivery so far (1-5 of them).
-- p_legs: the boards to enter — 0 for the whole run (needs every stop), k for order k on its own.
create or replace function public.submit_score(p_course text, p_initials text, p_legs int[], p_splits int[], p_trace jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c jsonb := public.race_course(p_course);
  vmax numeric := coalesce((c->>'vmax')::numeric, 60.5);
  nstops int; ns int; n int; k int := 0; i int; lg int; lms int;
  prev jsonb; cur jsonb; st jsonb; dt numeric; d numeric; rad numeric; who text; nid bigint;
  out jsonb := '{}'::jsonb;
  request_fingerprint text; saved_result jsonb;
begin
  if c is null then raise exception 'bad_course'; end if;
  if p_initials is null or p_initials !~ '^[A-Z]{3}$' then raise exception 'bad_initials'; end if;
  if p_initials = any (string_to_array('ASS CUM COK CNT DIC DIK FAG FCK FUC FUK FUQ FKU JIZ KKK KYS NGR NIG SEX SHT TIT VAG XXX CNM NMB TMD MLB GAN', ' ')) then
    raise exception 'blocked_initials';
  end if;
  request_fingerprint := encode(sha256(convert_to(jsonb_build_array(p_course, p_initials, p_legs, p_splits, p_trace)::text, 'UTF8')), 'hex');
  -- Consistent lock order: request, client, route. Locks are released on commit/rollback.
  perform pg_advisory_xact_lock(hashtextextended('request:' || request_fingerprint, 0));
  select s.result into saved_result from public.race_submissions s where s.fingerprint = request_fingerprint;
  if found then return saved_result; end if;
  -- Client headers must come through a trusted gateway. This protects successful registrations;
  -- rejected-request abuse also needs a rate limit at the API gateway.
  who := md5(coalesce(current_setting('request.headers', true)::json->>'cf-connecting-ip',
                      current_setting('request.headers', true)::json->>'x-forwarded-for', '') || '|' || p_course);
  perform pg_advisory_xact_lock(hashtextextended('client:' || who, 0));
  if exists (select 1 from public.race_scores where client = who and created_at > now() - interval '15 seconds') then
    raise exception 'rate_limited';
  end if;

  nstops := jsonb_array_length(c->'stops');
  ns := coalesce(array_length(p_splits, 1), 0);
  if ns < 1 or ns > nstops or p_trace is null or jsonb_typeof(p_trace) <> 'array'
     or coalesce(array_length(p_legs, 1), 0) < 1 or array_length(p_legs, 1) > nstops + 1 then
    raise exception 'implausible';
  end if;
  foreach lg in array p_legs loop
    if lg is null or lg < 0 or lg > ns or (lg = 0 and ns < nstops) then raise exception 'implausible'; end if;
  end loop;
  if (select count(distinct x) from unnest(p_legs) x) <> array_length(p_legs, 1) then raise exception 'implausible'; end if;
  n := jsonb_array_length(p_trace);
  if n < 2 or n > 4000 then raise exception 'implausible'; end if;
  rad := (c->>'radius')::numeric + 2;

  -- the first sample is on the start line within the first second
  cur := p_trace->0;
  if jsonb_typeof(cur) <> 'array' or jsonb_array_length(cur) <> 3 or (cur->>0)::numeric > 1000
     or sqrt(((cur->>1)::numeric - (c->'start'->>0)::numeric) ^ 2 + ((cur->>2)::numeric - (c->'start'->>1)::numeric) ^ 2) > 60 then
    raise exception 'implausible' using detail = 'start';
  end if;
  -- walk the route: time only moves forward, no sample faster than the taxi, each stop reached in order at its split
  for i in 1 .. n - 1 loop
    prev := cur; cur := p_trace->i;
    if jsonb_typeof(cur) <> 'array' or jsonb_array_length(cur) <> 3 then raise exception 'implausible'; end if;
    dt := ((cur->>0)::numeric - (prev->>0)::numeric) / 1000;
    if dt < 0 or dt > 1.5 then raise exception 'implausible' using detail = 'clock'; end if;
    d := sqrt(((cur->>1)::numeric - (prev->>1)::numeric) ^ 2 + ((cur->>2)::numeric - (prev->>2)::numeric) ^ 2);
    if d > vmax * dt + 3 then   -- +3 m for positions rounded to the metre
      raise exception 'implausible' using detail = format('speed %s at %s', round(d / greatest(dt, 0.05)), (cur->>0)::int);
    end if;
    if k < ns and (cur->>0)::int = p_splits[k + 1] then
      st := c->'stops'->k;
      if sqrt(((cur->>1)::numeric - (st->>0)::numeric) ^ 2 + ((cur->>2)::numeric - (st->>1)::numeric) ^ 2) > rad then
        raise exception 'implausible' using detail = format('stop %s', k + 1);
      end if;
      k := k + 1;
    end if;
  end loop;
  if k <> ns or (cur->>0)::int <> p_splits[ns] then raise exception 'implausible' using detail = 'route'; end if;
  -- a run is registered once: the same split times again are a replay of someone's route samples under other initials
  perform pg_advisory_xact_lock(hashtextextended('route:' || p_course || ':' || p_splits::text, 0));
  if exists (select 1 from public.race_scores where course = p_course and splits = p_splits) then
    raise exception 'duplicate';
  end if;

  foreach lg in array p_legs loop
    lms := case when lg = 0 then p_splits[nstops] else p_splits[lg] - coalesce(p_splits[lg - 1], 0) end;
    if lms < 200 then raise exception 'implausible'; end if;
    insert into public.race_scores (course, leg, initials, ms, splits, client) values (p_course, lg, p_initials, lms, p_splits, who) returning id into nid;
    out := out || jsonb_build_object(lg::text, jsonb_build_object(
      'id', nid,   -- share links point at this entry (og/ renders its card)
      'ms', lms,
      'rank', (select count(*) + 1 from public.race_scores where course = p_course and leg = lg and ms < lms),
      'total', (select count(*) from public.race_scores where course = p_course and leg = lg)));
  end loop;
  insert into public.race_submissions (fingerprint, result) values (request_fingerprint, out);
  return out;
end
$$;

-- one entry with its live place on its board, for share cards: {id, course, leg, initials, ms, rank, total, at}
create or replace function public.race_entry(p_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', s.id, 'course', s.course, 'leg', s.leg, 'initials', s.initials, 'ms', s.ms, 'at', s.created_at,
    'rank', (select count(*) + 1 from public.race_scores t where t.course = s.course and t.leg = s.leg and t.ms < s.ms),
    'total', (select count(*) from public.race_scores t where t.course = s.course and t.leg = s.leg))
  from public.race_scores s where s.id = p_id
$$;

revoke all on function public.race_entry(bigint) from public;
grant execute on function public.race_entry(bigint) to anon, authenticated;
revoke all on function public.race_boards(text, int) from public;
revoke all on function public.submit_score(text, text, int[], int[], jsonb) from public;
grant execute on function public.race_boards(text, int) to anon, authenticated;
grant execute on function public.submit_score(text, text, int[], int[], jsonb) to anon, authenticated;
