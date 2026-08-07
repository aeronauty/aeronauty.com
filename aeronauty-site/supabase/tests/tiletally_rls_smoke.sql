-- Tile Tally RLS and atomic-write smoke test.
--
-- Run against a disposable/local database after migrations:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/tiletally_rls_smoke.sql
--
-- The entire test rolls back, including its two synthetic auth users.

begin;
set local statement_timeout = '30s';

create or replace function pg_temp.tiletally_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $assert$
begin
  if p_condition is not true then
    raise exception 'Tile Tally smoke assertion failed: %', p_message;
  end if;
end
$assert$;

-- Stable, transaction-local identities make the fixture easy to inspect in a failure.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'tiletally-smoke-a@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'tiletally-smoke-b@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

-- User A creates two players and exercises both manual atomic RPCs.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into public.tiletally_players (id, owner_id, name)
values
  (
    '11000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Alice'
  ),
  (
    '12000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Bob'
  );

insert into public.tiletally_games (
  id, owner_id, played_on, status, source
)
values (
  '13000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  date '2026-08-06',
  'in_progress',
  'manual'
);

insert into public.tiletally_game_players (id, game_id, player_id, owner_id, seat)
values
  (
    '13100000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000003',
    '11000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    1
  ),
  (
    '13200000-0000-4000-8000-000000000002',
    '13000000-0000-4000-8000-000000000003',
    '12000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    2
  );

select pg_temp.tiletally_assert(
  (public.tiletally_add_turn(
    '13000000-0000-4000-8000-000000000003',
    '11000000-0000-4000-8000-000000000001',
    25,
    'HELLO',
    false,
    '14000000-0000-4000-8000-000000000004'
  )->>'idempotent')::boolean = false,
  'first manual add_turn call should insert'
);

select pg_temp.tiletally_assert(
  (public.tiletally_add_turn(
    '13000000-0000-4000-8000-000000000003',
    '11000000-0000-4000-8000-000000000001',
    25,
    'HELLO',
    false,
    '14000000-0000-4000-8000-000000000004'
  )->>'idempotent')::boolean = true,
  'manual add_turn retry should be idempotent'
);

select pg_temp.tiletally_assert(
  (
    select count(*) = 1 and min(seq) = 1
    from public.tiletally_turns
    where game_id = '13000000-0000-4000-8000-000000000003'
  ),
  'manual add_turn retry must not duplicate a row'
);

select public.tiletally_add_turn(
  '13000000-0000-4000-8000-000000000003',
  '12000000-0000-4000-8000-000000000002',
  -2,
  null,
  false,
  '14100000-0000-4000-8000-000000000005'
);

select pg_temp.tiletally_assert(
  (
    select kind = 'adjustment'
    from public.tiletally_turns
    where id = '14100000-0000-4000-8000-000000000005'
  ),
  'a negative manual correction should be stored as an adjustment row'
);

insert into public.tiletally_ingest_events (
  id, owner_id, kind, status, raw_input, model, proposed_action
)
values (
  '14200000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000001',
  'chat',
  'pending',
  'Correction: subtract one from Bob.',
  'smoke-model',
  jsonb_build_object(
    'type', 'add_turn',
    'payload', jsonb_build_object(
      'game_ref', '13000000-0000-4000-8000-000000000003',
      'player', 'Bob',
      'score', -1
    )
  )
);

select public.tiletally_commit_ingest_event(
  '14200000-0000-4000-8000-000000000006'
);

select pg_temp.tiletally_assert(
  (
    select kind = 'adjustment' and source = 'chat'
    from public.tiletally_turns
    where ingest_event_id = '14200000-0000-4000-8000-000000000006'
  ),
  'a negative AI add_turn correction should preserve source and use adjustment kind'
);

select pg_temp.tiletally_assert(
  (public.tiletally_finish_game(
    '13000000-0000-4000-8000-000000000003',
    jsonb_build_array(jsonb_build_object(
      'player_id', '12000000-0000-4000-8000-000000000002',
      'points', -4
    ))
  )->>'idempotent')::boolean = false,
  'first finish_game call should complete the game'
);

select pg_temp.tiletally_assert(
  (public.tiletally_finish_game(
    '13000000-0000-4000-8000-000000000003',
    jsonb_build_array(jsonb_build_object(
      'player_id', '12000000-0000-4000-8000-000000000002',
      'points', -4
    ))
  )->>'idempotent')::boolean = true,
  'finish_game retry should be a no-op success'
);

select pg_temp.tiletally_assert(
  (
    select status = 'complete' and completed_at is not null
    from public.tiletally_games
    where id = '13000000-0000-4000-8000-000000000003'
  ),
  'manual game should be complete'
);

select pg_temp.tiletally_assert(
  (
    select count(*) = 4 and max(seq) = 4
    from public.tiletally_turns
    where game_id = '13000000-0000-4000-8000-000000000003'
  ),
  'finish retry must not duplicate adjustments'
);

select pg_temp.tiletally_assert(
  (
    select total = 25
    from public.tiletally_game_totals
    where game_id = '13000000-0000-4000-8000-000000000003'
      and player_id = '11000000-0000-4000-8000-000000000001'
  ),
  'security-invoker totals view should derive Alice total from turns'
);

-- Photo table paths must remain under the auth uid prefix, and rows are not deletable.
insert into public.tiletally_score_photos (
  id, owner_id, storage_path, extracted_json
)
values (
  '15000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001/smoke/photo.webp',
  '{"confidence":0.8}'::jsonb
);

do $photo_delete_denied$
declare
  v_denied boolean := false;
begin
  begin
    delete from public.tiletally_score_photos
    where id = '15000000-0000-4000-8000-000000000005';
  exception when insufficient_privilege then
    v_denied := true;
  end;
  perform pg_temp.tiletally_assert(v_denied, 'score photo row DELETE should be denied');
end
$photo_delete_denied$;

-- The exact example shape from the API contract commits all normalized rows once.
insert into public.tiletally_ingest_events (
  id,
  owner_id,
  kind,
  status,
  raw_input,
  model,
  input_tokens,
  output_tokens,
  proposed_action
)
values (
  '16000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000001',
  'chat',
  'pending',
  'Alice and Bob played today. Alice got 50 with FRIENDS and Bob got 31.',
  'smoke-model',
  100,
  50,
  jsonb_build_object(
    'type', 'log_game',
    'payload', jsonb_build_object(
      'played_on', '2026-08-06',
      'location', 'Kitchen',
      'players', jsonb_build_array('Alice', 'Bob'),
      'turns', jsonb_build_array(
        jsonb_build_object(
          'player', 'Alice', 'score', 50, 'word', 'FRIENDS', 'is_bingo', true
        ),
        jsonb_build_object('player', 'Bob', 'score', 31)
      ),
      'adjustments', jsonb_build_array(
        jsonb_build_object('player', 'Bob', 'points', -3)
      ),
      'status', 'complete'
    )
  )
);

select pg_temp.tiletally_assert(
  (public.tiletally_commit_ingest_event(
    '16000000-0000-4000-8000-000000000006'
  )->>'idempotent')::boolean = false,
  'first ingest commit should write the confirmed action'
);

select pg_temp.tiletally_assert(
  (public.tiletally_commit_ingest_event(
    '16000000-0000-4000-8000-000000000006'
  )->>'idempotent')::boolean = true,
  'ingest commit retry should return idempotent success'
);

select pg_temp.tiletally_assert(
  (
    select status = 'committed' and game_id is not null and committed_at is not null
    from public.tiletally_ingest_events
    where id = '16000000-0000-4000-8000-000000000006'
  ),
  'ingest event should retain its committed game link'
);

select pg_temp.tiletally_assert(
  (
    select count(*) = 3
    from public.tiletally_turns
    where ingest_event_id = '16000000-0000-4000-8000-000000000006'
  ),
  'log_game should preserve two plays and one adjustment as distinct turns'
);

select pg_temp.tiletally_assert(
  (
    select count(distinct source_item_index) = 3
    from public.tiletally_turns
    where ingest_event_id = '16000000-0000-4000-8000-000000000006'
  ),
  'ingest source item indexes should be stable and unique'
);

-- A committed provenance event is visible but cannot be changed through the update policy.
do $committed_immutable$
declare
  v_rows bigint;
begin
  update public.tiletally_ingest_events
  set raw_input = 'tampered'
  where id = '16000000-0000-4000-8000-000000000006';
  get diagnostics v_rows = row_count;
  perform pg_temp.tiletally_assert(v_rows = 0, 'committed ingest event should be immutable');
end
$committed_immutable$;

-- Read-only AI answers are auditable without fabricating a proposed write action.
insert into public.tiletally_ingest_events (
  id, owner_id, kind, status, raw_input, model, proposed_action
)
values (
  '17000000-0000-4000-8000-000000000007',
  '10000000-0000-4000-8000-000000000001',
  'chat',
  'answered',
  'What was my average this month?',
  'smoke-model',
  null
);

-- An authenticated user cannot forge ownership for an insert.
do $wrong_owner_insert_denied$
declare
  v_denied boolean := false;
begin
  begin
    insert into public.tiletally_players (owner_id, name)
    values ('20000000-0000-4000-8000-000000000002', 'Forged');
  exception when insufficient_privilege then
    v_denied := true;
  end;
  perform pg_temp.tiletally_assert(v_denied, 'owner_id RLS WITH CHECK should reject forgery');
end
$wrong_owner_insert_denied$;

-- User B owns a separate row and cannot see or mutate any User A record.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

insert into public.tiletally_players (id, owner_id, name)
values (
  '21000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  'User B player'
);

select pg_temp.tiletally_assert(
  (select count(*) = 1 from public.tiletally_players),
  'User B should see exactly their own player'
);
select pg_temp.tiletally_assert(
  (select count(*) = 0 from public.tiletally_games),
  'User B must not see User A games'
);
select pg_temp.tiletally_assert(
  (select count(*) = 0 from public.tiletally_game_totals),
  'security-invoker totals view must not leak User A rows'
);
select pg_temp.tiletally_assert(
  (select count(*) = 0 from public.tiletally_ingest_events),
  'User B must not see User A ingest provenance'
);

do $other_event_commit_denied$
declare
  v_denied boolean := false;
begin
  begin
    perform public.tiletally_commit_ingest_event(
      '16000000-0000-4000-8000-000000000006'
    );
  exception when no_data_found then
    v_denied := true;
  end;
  perform pg_temp.tiletally_assert(v_denied, 'User B must not commit User A event');
end
$other_event_commit_denied$;

-- Catalog checks cover properties that are awkward to exercise through direct SQL
-- against storage.objects but are security-critical in production.
reset role;

select pg_temp.tiletally_assert(
  (
    select count(*) = 6
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'tiletally_players',
        'tiletally_games',
        'tiletally_game_players',
        'tiletally_turns',
        'tiletally_score_photos',
        'tiletally_ingest_events'
      )
      and c.relrowsecurity
      and c.relforcerowsecurity
  ),
  'all six Tile Tally tables should enable and force RLS'
);

select pg_temp.tiletally_assert(
  (
    select coalesce(reloptions, array[]::text[]) @> array['security_invoker=true']
    from pg_class
    where oid = 'public.tiletally_game_totals'::regclass
  ),
  'totals view should be security_invoker'
);

select pg_temp.tiletally_assert(
  not has_table_privilege('anon', 'public.tiletally_players', 'SELECT')
  and not has_table_privilege('anon', 'public.tiletally_games', 'SELECT')
  and not has_table_privilege('anon', 'public.tiletally_turns', 'SELECT'),
  'anon should have no Tile Tally table access'
);

select pg_temp.tiletally_assert(
  (
    select public = false
      and file_size_limit = 4194304
      and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']::text[]
      and cardinality(allowed_mime_types) = 3
    from storage.buckets
    where id = 'tiletally-score-photos'
  ),
  'photo bucket should be private, 4 MB, and limited to three web image types'
);

select pg_temp.tiletally_assert(
  (
    select count(*) = 2
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'tiletally_score_photos_owner_select',
        'tiletally_score_photos_owner_insert'
      )
  ),
  'photo bucket should have owner-prefix SELECT and INSERT policies'
);

select pg_temp.tiletally_assert(
  not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'tiletally_score_photos_owner_%'
      and cmd in ('UPDATE', 'DELETE')
  ),
  'photo objects should have no overwrite or delete policy'
);

rollback;

select 'Tile Tally RLS smoke test passed' as result;
