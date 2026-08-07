-- Game Ledger generic-schema, immutability, RPC, media, and RLS smoke test.
--
-- Run only against a disposable/local database after migrations:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/gameledger_rls_smoke.sql
--
-- Everything, including the two synthetic auth users, is rolled back.

begin;
set local statement_timeout = '30s';

create or replace function pg_temp.gameledger_assert(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $assert$
begin
  if p_condition is not true then
    raise exception 'Game Ledger smoke assertion failed: %', p_message;
  end if;
end
$assert$;

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
    '30000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'gameledger-smoke-a@example.invalid',
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
    '40000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'gameledger-smoke-b@example.invalid',
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

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into public.gameledger_entities (
  id, owner_id, entity_type, name, metadata
)
values
  (
    '31000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'person',
    'Alex',
    '{"pronouns":"they/them"}'::jsonb
  ),
  (
    '31000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    'person',
    'Sam',
    '{}'::jsonb
  );

insert into public.gameledger_profiles (
  id, owner_id, name, definition
)
values (
  '32000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Our board game',
  '{
    "counters":[{"id":"points","unit":"peg","target":121}],
    "event_fields":{"phase":{"type":"string"}},
    "result_fields":{"winner":{"type":"participant"}}
  }'::jsonb
);

select pg_temp.gameledger_assert(
  (
    public.gameledger_start_game(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_title => 'Friday evening',
      p_definition => '{
        "counters":[{"id":"points","unit":"peg","target":121}],
        "event_fields":{"phase":{"type":"string"}},
        "result_fields":{"winner":{"type":"participant"}}
      }'::jsonb,
      p_started_at => timestamptz '2026-08-07 18:00:00+00',
      p_location => 'Home',
      p_participants => '[
        {
          "id":"34000000-0000-4000-8000-000000000001",
          "entity_id":"31000000-0000-4000-8000-000000000001",
          "label":"Alex",
          "seat":1,
          "metadata":{"color":"blue"}
        },
        {
          "id":"35000000-0000-4000-8000-000000000002",
          "entity_id":"31000000-0000-4000-8000-000000000002",
          "label":"Sam",
          "seat":2,
          "metadata":{"color":"red"}
        }
      ]'::jsonb,
      p_profile_id => '32000000-0000-4000-8000-000000000001',
      p_profile_version => 1
    )->>'idempotent'
  )::boolean = false,
  'main game and participants should start atomically'
);

-- Profile edits advance the profile but cannot rewrite the copied game definition.
update public.gameledger_profiles
set definition = jsonb_set(definition, '{counters,0,target}', '61'::jsonb)
where id = '32000000-0000-4000-8000-000000000001';

select pg_temp.gameledger_assert(
  (
    select revision = 2
    from public.gameledger_profiles
    where id = '32000000-0000-4000-8000-000000000001'
  ),
  'changing a profile definition should increment its revision'
);

select pg_temp.gameledger_assert(
  (
    select profile_version = 1
      and definition #>> '{counters,0,target}' = '121'
    from public.gameledger_games
    where id = '33000000-0000-4000-8000-000000000001'
  ),
  'the game must retain its complete profile snapshot and observed revision'
);

select pg_temp.gameledger_assert(
  (
    public.gameledger_start_game(
      p_game_id => '41000000-0000-4000-8000-000000000003',
      p_title => 'Atomic quick tally',
      p_definition => '{
        "counters":[{"id":"wins","value_type":"decimal"}],
        "result_fields":{"outcome":{"type":"text"}}
      }'::jsonb,
      p_started_at => timestamptz '2026-08-07 19:00:00+00',
      p_location => 'Kitchen',
      p_participants => '[
        {
          "id":"41100000-0000-4000-8000-000000000001",
          "entity_id":"31000000-0000-4000-8000-000000000001",
          "label":"Alex",
          "seat":1,
          "metadata":{"side":"left"}
        },
        {
          "id":"41200000-0000-4000-8000-000000000002",
          "entity_id":"31000000-0000-4000-8000-000000000002",
          "label":"Sam",
          "seat":2
        }
      ]'::jsonb
    )->>'idempotent'
  )::boolean = false,
  'start RPC should atomically create a game and participant snapshots'
);

select pg_temp.gameledger_assert(
  (
    public.gameledger_start_game(
      p_game_id => '41000000-0000-4000-8000-000000000003',
      p_title => 'ignored retry title',
      p_definition => '{}'::jsonb,
      p_started_at => timestamptz '2030-01-01 00:00:00+00'
    )->>'idempotent'
  )::boolean = true,
  'same game UUID should make start retry idempotent'
);

select pg_temp.gameledger_assert(
  (
    select title = 'Atomic quick tally'
      and definition #>> '{counters,0,id}' = 'wins'
    from public.gameledger_games
    where id = '41000000-0000-4000-8000-000000000003'
  )
  and (
    select count(*) = 2
      and min(label) = 'Alex'
      and max(label) = 'Sam'
    from public.gameledger_participants
    where game_id = '41000000-0000-4000-8000-000000000003'
  ),
  'start retry must preserve the original complete game graph'
);

do $atomic_start_rollback$
declare
  v_denied boolean := false;
begin
  begin
    perform public.gameledger_start_game(
      p_game_id => '42000000-0000-4000-8000-000000000004',
      p_title => 'Must roll back',
      p_definition => '{}'::jsonb,
      p_started_at => now(),
      p_participants => '[{
        "id":"42100000-0000-4000-8000-000000000001",
        "entity_id":"42f00000-0000-4000-8000-000000000099",
        "label":"Foreign or missing",
        "seat":1
      }]'::jsonb
    );
  exception when no_data_found then
    v_denied := true;
  end;

  perform pg_temp.gameledger_assert(
    v_denied,
    'start should reject a participant entity not owned by the caller'
  );
  perform pg_temp.gameledger_assert(
    not exists (
      select 1 from public.gameledger_games
      where id = '42000000-0000-4000-8000-000000000004'
    ),
    'failed participant validation must roll back the game header'
  );
end
$atomic_start_rollback$;

do $forged_profile_snapshot_denied$
declare
  v_bad_version boolean := false;
  v_bad_definition boolean := false;
begin
  begin
    perform public.gameledger_start_game(
      p_game_id => '43000000-0000-4000-8000-000000000005',
      p_title => 'Forged profile version',
      p_definition => '{
        "counters":[{"id":"points","unit":"peg","target":61}],
        "event_fields":{"phase":{"type":"string"}},
        "result_fields":{"winner":{"type":"participant"}}
      }'::jsonb,
      p_started_at => now(),
      p_profile_id => '32000000-0000-4000-8000-000000000001',
      p_profile_version => 999
    );
  exception when check_violation then
    v_bad_version := true;
  end;

  begin
    perform public.gameledger_start_game(
      p_game_id => '44000000-0000-4000-8000-000000000006',
      p_title => 'Mismatched profile definition',
      p_definition => '{}'::jsonb,
      p_started_at => now(),
      p_profile_id => '32000000-0000-4000-8000-000000000001',
      p_profile_version => 2
    );
  exception when check_violation then
    v_bad_definition := true;
  end;

  perform pg_temp.gameledger_assert(
    v_bad_version and v_bad_definition,
    'start should reject forged profile revision and mismatched definition'
  );
  perform pg_temp.gameledger_assert(
    not exists (
      select 1 from public.gameledger_games
      where id in (
        '43000000-0000-4000-8000-000000000005',
        '44000000-0000-4000-8000-000000000006'
      )
    ),
    'forged profile snapshots must not leave game headers'
  );
end
$forged_profile_snapshot_denied$;

-- The database stores only private-object metadata, never photo/video bytes.
insert into public.gameledger_media (
  id,
  owner_id,
  game_id,
  storage_path,
  media_kind,
  mime_type,
  byte_size,
  duration_ms,
  width,
  height,
  captured_at,
  caption,
  media_data
)
values (
  '36000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001/33000000-0000-4000-8000-000000000001/36000000-0000-4000-8000-000000000001/board.mp4',
  'video',
  'video/mp4',
  1048576,
  12000,
  1920,
  1080,
  timestamptz '2026-08-07 18:02:00+00',
  'Opening hands and board',
  '{"device_orientation":"landscape"}'::jsonb
);

select pg_temp.gameledger_assert(
  public.gameledger_storage_upload_allowed(
    '30000000-0000-4000-8000-000000000001/33000000-0000-4000-8000-000000000001/36000000-0000-4000-8000-000000000001/board.mp4',
    '1048576',
    'video/mp4'
  )
  and not public.gameledger_storage_upload_allowed(
    '30000000-0000-4000-8000-000000000001/33000000-0000-4000-8000-000000000001/36000000-0000-4000-8000-000000000001/board.mp4',
    '1048577',
    'video/mp4'
  )
  and not public.gameledger_storage_upload_allowed(
    '30000000-0000-4000-8000-000000000001/33000000-0000-4000-8000-000000000001/36000000-0000-4000-8000-000000000001/board.mp4',
    '1048576',
    'image/jpeg'
  ),
  'Storage upload helper must require the exact active metadata path, size, and MIME'
);

-- Exercise the Storage policies themselves, not only their helper. The metadata
-- reservation must match before an authenticated Storage-style INSERT can commit.
do $storage_insert_metadata_mismatch_denied$
declare
  v_wrong_size_denied boolean := false;
  v_wrong_mime_denied boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'gameledger-media',
      '30000000-0000-4000-8000-000000000001/33000000-0000-4000-8000-000000000001/36000000-0000-4000-8000-000000000001/board.mp4',
      '30000000-0000-4000-8000-000000000001',
      '{"size":1048577,"mimetype":"video/mp4"}'::jsonb
    );
  exception when insufficient_privilege then
    v_wrong_size_denied := true;
  end;

  begin
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    values (
      'gameledger-media',
      '30000000-0000-4000-8000-000000000001/33000000-0000-4000-8000-000000000001/36000000-0000-4000-8000-000000000001/board.mp4',
      '30000000-0000-4000-8000-000000000001',
      '{"size":1048576,"mimetype":"image/jpeg"}'::jsonb
    );
  exception when insufficient_privilege then
    v_wrong_mime_denied := true;
  end;

  perform pg_temp.gameledger_assert(
    v_wrong_size_denied and v_wrong_mime_denied,
    'Storage INSERT policy must reject mismatched reserved size and MIME'
  );
end
$storage_insert_metadata_mismatch_denied$;

insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'gameledger-media',
  '30000000-0000-4000-8000-000000000001/33000000-0000-4000-8000-000000000001/36000000-0000-4000-8000-000000000001/board.mp4',
  '30000000-0000-4000-8000-000000000001',
  '{"size":1048576,"mimetype":"video/mp4"}'::jsonb
);

select pg_temp.gameledger_assert(
  (
    select count(*) = 1
    from storage.objects
    where bucket_id = 'gameledger-media'
      and name = '30000000-0000-4000-8000-000000000001/33000000-0000-4000-8000-000000000001/36000000-0000-4000-8000-000000000001/board.mp4'
  ),
  'owner A should upload and read the exact reserved private object'
);

-- User B must not discover or remove User A's private object through Storage RLS.
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select pg_temp.gameledger_assert(
  (
    select count(*) = 0
    from storage.objects
    where bucket_id = 'gameledger-media'
  ),
  'owner B must not see owner A Storage objects'
);

do $cross_account_storage_delete_denied$
declare
  v_rows bigint;
begin
  delete from storage.objects
  where bucket_id = 'gameledger-media'
    and name = '30000000-0000-4000-8000-000000000001/33000000-0000-4000-8000-000000000001/36000000-0000-4000-8000-000000000001/board.mp4';
  get diagnostics v_rows = row_count;
  perform pg_temp.gameledger_assert(
    v_rows = 0,
    'owner B must not delete owner A Storage objects'
  );
end
$cross_account_storage_delete_denied$;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select pg_temp.gameledger_assert(
  (
    select count(*) = 1
    from storage.objects
    where bucket_id = 'gameledger-media'
  ),
  'owner B deletion attempt must leave owner A object intact'
);

select pg_temp.gameledger_assert(
  (
    public.gameledger_append_event(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_event_id => '37000000-0000-4000-8000-000000000001',
      p_event_kind => 'counter_change',
      p_actor_participant_id => '34000000-0000-4000-8000-000000000001',
      p_event_data => '{
        "values":{"points":2.5,"games_won":0},
        "phase":"pegging",
        "reason":"fifteen"
      }'::jsonb,
      p_note => 'Half-point house rule demonstrates decimal JSON.',
      p_occurred_at => timestamptz '2026-08-07 18:03:00+00',
      p_source_id => '39000000-0000-4000-8000-000000000001',
      p_source_kind => 'manual',
      p_source_data => '{"device":"phone","offline":false}'::jsonb
    )->>'idempotent'
  )::boolean = false,
  'first append should insert an event and provenance source'
);

select pg_temp.gameledger_assert(
  (
    public.gameledger_append_event(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_event_id => '37000000-0000-4000-8000-000000000001',
      p_event_kind => 'ignored_on_retry',
      p_event_data => '{"values":{"points":999}}'::jsonb
    )->>'idempotent'
  )::boolean = true,
  'retrying a client event UUID should return the original event'
);

select pg_temp.gameledger_assert(
  (
    select count(*) = 1
      and min(seq) = 1
      and min((event_data #>> '{values,points}')::numeric) = 2.5
    from public.gameledger_events
    where game_id = '33000000-0000-4000-8000-000000000001'
  ),
  'idempotency must preserve one decimal-valued event at seq 1'
);

select pg_temp.gameledger_assert(
  (
    select count(*) = 1
    from public.gameledger_event_sources
    where event_id = '37000000-0000-4000-8000-000000000001'
      and source_data->>'device' = 'phone'
  ),
  'the source envelope must remain separate from event_data'
);

-- Undo is another immutable event. Here a video review is its independent source.
select public.gameledger_append_event(
  p_game_id => '33000000-0000-4000-8000-000000000001',
  p_event_id => '38000000-0000-4000-8000-000000000002',
  p_event_kind => 'correction',
  p_actor_participant_id => '34000000-0000-4000-8000-000000000001',
  p_event_data => '{"reason":"video_review","replacement":{"values":{"points":2}}}'::jsonb,
  p_occurred_at => timestamptz '2026-08-07 18:04:00+00',
  p_voids_event_id => '37000000-0000-4000-8000-000000000001',
  p_source_id => '39000000-0000-4000-8000-000000000002',
  p_source_kind => 'video_review',
  p_source_data => '{"timecode_ms":3100}'::jsonb,
  p_media_id => '36000000-0000-4000-8000-000000000001',
  p_source_item_index => 0
);

select pg_temp.gameledger_assert(
  (
    select count(*) = 2
      and max(seq) = 2
      and bool_or(voids_event_id = '37000000-0000-4000-8000-000000000001')
    from public.gameledger_events
    where game_id = '33000000-0000-4000-8000-000000000001'
  ),
  'correction should append seq 2 and retain the original event'
);

select pg_temp.gameledger_assert(
  (
    select media_id = '36000000-0000-4000-8000-000000000001'
      and source_data->>'timecode_ms' = '3100'
    from public.gameledger_event_sources
    where id = '39000000-0000-4000-8000-000000000002'
  ),
  'video provenance should reference metadata while timecode remains source data'
);

do $event_immutability$
declare
  v_denied boolean := false;
begin
  begin
    update public.gameledger_events
    set note = 'rewritten'
    where id = '37000000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then
    v_denied := true;
  end;
  perform pg_temp.gameledger_assert(v_denied, 'authenticated events must be immutable');
end
$event_immutability$;

do $direct_result_append_denied$
declare
  v_denied boolean := false;
begin
  begin
    perform public.gameledger_append_event(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_event_id => '3c000000-0000-4000-8000-000000000003',
      p_event_kind => 'result',
      p_event_data => '{"outcome":"should_not_commit"}'::jsonb
    );
  exception when check_violation then
    v_denied := true;
  end;
  perform pg_temp.gameledger_assert(
    v_denied,
    'generic append must reserve result events for atomic finish'
  );
end
$direct_result_append_denied$;

do $direct_complete_denied$
declare
  v_denied boolean := false;
begin
  begin
    update public.gameledger_games
    set status = 'complete'
    where id = '33000000-0000-4000-8000-000000000001';
  exception when check_violation or insufficient_privilege then
    v_denied := true;
  end;
  perform pg_temp.gameledger_assert(
    v_denied,
    'direct clients must not complete a game without an atomic result'
  );
end
$direct_complete_denied$;

select pg_temp.gameledger_assert(
  (
    public.gameledger_finish_game(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_event_id => '3a000000-0000-4000-8000-000000000003',
      p_result => '{
        "outcome":"winner",
        "winner_participant_id":"34000000-0000-4000-8000-000000000001",
        "values":{"points":121,"margin":0.5}
      }'::jsonb,
      p_note => 'Finished by agreement.',
      p_ended_at => timestamptz '2026-08-07 18:10:00+00',
      p_source_id => '3b000000-0000-4000-8000-000000000003',
      p_source_kind => 'manual',
      p_source_data => '{"confirmed_by":["Alex","Sam"]}'::jsonb
    )->>'idempotent'
  )::boolean = false,
  'first finish should append a result and complete the game atomically'
);

select pg_temp.gameledger_assert(
  (
    select status = 'complete'
      and ended_at = timestamptz '2026-08-07 18:10:00+00'
    from public.gameledger_games
    where id = '33000000-0000-4000-8000-000000000001'
  )
  and (
    select count(*) = 3
      and max(seq) = 3
      and bool_or(
        event_kind = 'result'
        and event_data->>'outcome' = 'winner'
        and (event_data #>> '{values,margin}')::numeric = 0.5
      )
    from public.gameledger_events
    where game_id = '33000000-0000-4000-8000-000000000001'
  ),
  'finish must commit matching complete header and explicit decimal-valued result'
);

select pg_temp.gameledger_assert(
  (
    public.gameledger_finish_game(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_event_id => '3a000000-0000-4000-8000-000000000003',
      p_result => '{"outcome":"ignored_retry_payload"}'::jsonb
    )->>'idempotent'
  )::boolean = true,
  'same result event UUID should make finish retry idempotent'
);

select pg_temp.gameledger_assert(
  (
    public.gameledger_append_event(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_event_id => '37000000-0000-4000-8000-000000000001',
      p_event_kind => 'ignored_existing_retry'
    )->>'idempotent'
  )::boolean = true,
  'an existing pre-finish event UUID should remain retryable after completion'
);

do $post_finish_append_denied$
declare
  v_denied boolean := false;
begin
  begin
    perform public.gameledger_append_event(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_event_id => '3d000000-0000-4000-8000-000000000004',
      p_event_kind => 'correction',
      p_voids_event_id => '3a000000-0000-4000-8000-000000000003'
    );
  exception when object_not_in_prerequisite_state then
    v_denied := true;
  end;
  perform pg_temp.gameledger_assert(
    v_denied,
    'a completed game must reject new events that could reinterpret its result'
  );
end
$post_finish_append_denied$;

do $different_finish_denied$
declare
  v_denied boolean := false;
begin
  begin
    perform public.gameledger_finish_game(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_event_id => '3a000000-0000-4000-8000-000000000004',
      p_result => '{"outcome":"second_result"}'::jsonb
    );
  exception when object_not_in_prerequisite_state then
    v_denied := true;
  end;
  perform pg_temp.gameledger_assert(
    v_denied,
    'a completed game must reject a different result event UUID'
  );
end
$different_finish_denied$;

do $complete_game_update_denied$
declare
  v_rows bigint;
begin
  update public.gameledger_games
  set status = 'in_progress'
  where id = '33000000-0000-4000-8000-000000000001';
  get diagnostics v_rows = row_count;
  perform pg_temp.gameledger_assert(
    v_rows = 0,
    'authenticated update policy must make completed game headers immutable'
  );
end
$complete_game_update_denied$;

do $complete_participant_rewrite_denied$
declare
  v_rows bigint;
  v_insert_denied boolean := false;
begin
  update public.gameledger_participants
  set label = 'Rewritten after the fact'
  where id = '34000000-0000-4000-8000-000000000001';
  get diagnostics v_rows = row_count;
  perform pg_temp.gameledger_assert(
    v_rows = 0,
    'completed-game participant label snapshots must be immutable'
  );

  begin
    insert into public.gameledger_participants (
      id, owner_id, game_id, label, seat
    )
    values (
      '3e000000-0000-4000-8000-000000000005',
      '30000000-0000-4000-8000-000000000001',
      '33000000-0000-4000-8000-000000000001',
      'Late participant',
      3
    );
  exception when insufficient_privilege then
    v_insert_denied := true;
  end;
  perform pg_temp.gameledger_assert(
    v_insert_denied,
    'completed games must reject new participants'
  );
end
$complete_participant_rewrite_denied$;

do $active_media_game_delete_denied$
declare
  v_denied boolean := false;
begin
  begin
    perform public.gameledger_delete_game(
      '33000000-0000-4000-8000-000000000001'
    );
  exception when object_not_in_prerequisite_state then
    v_denied := true;
  end;
  perform pg_temp.gameledger_assert(
    v_denied,
    'game deletion must refuse to cascade active media metadata'
  );
end
$active_media_game_delete_denied$;

-- The Storage API removes bytes first. Metadata cannot be tombstoned while the
-- exact private object is still present, even if a client calls the RPC directly.
do $media_tombstone_before_object_delete_denied$
declare
  v_denied boolean := false;
begin
  begin
    perform public.gameledger_mark_media_deleted(
      '36000000-0000-4000-8000-000000000001'
    );
  exception when object_not_in_prerequisite_state then
    v_denied := true;
  end;
  perform pg_temp.gameledger_assert(
    v_denied,
    'media metadata must remain active until its Storage object is removed'
  );
end
$media_tombstone_before_object_delete_denied$;

do $storage_owner_delete$
declare
  v_rows bigint;
begin
  delete from storage.objects
  where bucket_id = 'gameledger-media'
    and name = '30000000-0000-4000-8000-000000000001/33000000-0000-4000-8000-000000000001/36000000-0000-4000-8000-000000000001/board.mp4';
  get diagnostics v_rows = row_count;
  perform pg_temp.gameledger_assert(
    v_rows = 1,
    'owner A should delete its exact active Storage object through policy'
  );
  perform pg_temp.gameledger_assert(
    not exists (
      select 1 from storage.objects
      where bucket_id = 'gameledger-media'
    ),
    'deleted Storage object must no longer be visible to owner A'
  );
end
$storage_owner_delete$;

select pg_temp.gameledger_assert(
  (
    public.gameledger_mark_media_deleted(
      '36000000-0000-4000-8000-000000000001'
    )->>'idempotent'
  )::boolean = false,
  'first post-Storage-removal tombstone call should mark deleted_at'
);

select pg_temp.gameledger_assert(
  (
    public.gameledger_mark_media_deleted(
      '36000000-0000-4000-8000-000000000001'
    )->>'idempotent'
  )::boolean = true,
  'media tombstone retry should be idempotent'
);

select pg_temp.gameledger_assert(
  (
    select deleted_at is not null
    from public.gameledger_media
    where id = '36000000-0000-4000-8000-000000000001'
  ),
  'media metadata should retain an irreversible tombstone'
);

do $media_delete_column_denied$
declare
  v_denied boolean := false;
begin
  begin
    update public.gameledger_media
    set deleted_at = null
    where id = '36000000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then
    v_denied := true;
  end;
  perform pg_temp.gameledger_assert(
    v_denied,
    'authenticated clients must not clear or set deleted_at directly'
  );
end
$media_delete_column_denied$;

do $direct_game_delete_denied$
declare
  v_denied boolean := false;
begin
  begin
    delete from public.gameledger_games
    where id = '41000000-0000-4000-8000-000000000003';
  exception when insufficient_privilege then
    v_denied := true;
  end;
  perform pg_temp.gameledger_assert(
    v_denied,
    'authenticated clients must use the guarded game delete RPC'
  );
end
$direct_game_delete_denied$;

select pg_temp.gameledger_assert(
  (
    public.gameledger_delete_game(
      '41000000-0000-4000-8000-000000000003'
    )->>'deleted'
  )::boolean,
  'guarded delete should remove a game with no active media'
);

select pg_temp.gameledger_assert(
  not exists (
    select 1 from public.gameledger_games
    where id = '41000000-0000-4000-8000-000000000003'
  )
  and not exists (
    select 1 from public.gameledger_participants
    where game_id = '41000000-0000-4000-8000-000000000003'
  ),
  'guarded game deletion should cascade its participant graph'
);

-- A second account sees none of User A's graph and cannot append into it.
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select pg_temp.gameledger_assert(
  (select count(*) = 0 from public.gameledger_entities)
  and (select count(*) = 0 from public.gameledger_profiles)
  and (select count(*) = 0 from public.gameledger_games)
  and (select count(*) = 0 from public.gameledger_participants)
  and (select count(*) = 0 from public.gameledger_events)
  and (select count(*) = 0 from public.gameledger_event_sources)
  and (select count(*) = 0 from public.gameledger_media),
  'RLS should hide the entire User A graph from User B'
);

do $cross_account_append_denied$
declare
  v_denied boolean := false;
begin
  begin
    perform public.gameledger_append_event(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_event_id => '38000000-0000-4000-8000-000000000003',
      p_event_kind => 'note'
    );
  exception when no_data_found then
    v_denied := true;
  end;
  perform pg_temp.gameledger_assert(v_denied, 'User B must not append to User A game');
end
$cross_account_append_denied$;

do $cross_account_media_denied$
declare
  v_denied boolean := false;
begin
  begin
    perform public.gameledger_mark_media_deleted(
      '36000000-0000-4000-8000-000000000001'
    );
  exception when no_data_found then
    v_denied := true;
  end;
  perform pg_temp.gameledger_assert(v_denied, 'User B must not tombstone User A media');
end
$cross_account_media_denied$;

reset role;

select pg_temp.gameledger_assert(
  (
    select count(*) = 7
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'gameledger_entities',
        'gameledger_profiles',
        'gameledger_games',
        'gameledger_participants',
        'gameledger_events',
        'gameledger_event_sources',
        'gameledger_media'
      )
      and c.relrowsecurity
      and c.relforcerowsecurity
  ),
  'all seven Game Ledger tables should enable and force RLS'
);

select pg_temp.gameledger_assert(
  not has_table_privilege('anon', 'public.gameledger_games', 'SELECT')
  and not has_table_privilege('anon', 'public.gameledger_events', 'SELECT')
  and not has_table_privilege('anon', 'public.gameledger_media', 'SELECT'),
  'anon should have no Game Ledger table access'
);

select pg_temp.gameledger_assert(
  not has_table_privilege('authenticated', 'public.gameledger_events', 'INSERT')
  and not has_table_privilege('authenticated', 'public.gameledger_events', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.gameledger_events', 'DELETE')
  and not has_table_privilege('authenticated', 'public.gameledger_event_sources', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.gameledger_event_sources', 'DELETE'),
  'event facts and their sources should be immutable through direct grants'
);

select pg_temp.gameledger_assert(
  not has_column_privilege(
    'authenticated', 'public.gameledger_games', 'definition', 'UPDATE'
  )
  and not has_column_privilege(
    'authenticated', 'public.gameledger_games', 'ended_at', 'UPDATE'
  ),
  'definition snapshots and ended_at should not be directly updateable'
);

select pg_temp.gameledger_assert(
  not has_table_privilege(
    'authenticated', 'public.gameledger_games', 'DELETE'
  )
  and not has_table_privilege(
    'authenticated', 'public.gameledger_games', 'INSERT'
  )
  and not has_table_privilege(
    'authenticated', 'public.gameledger_participants', 'INSERT'
  ),
  'direct game start/delete should be revoked in favor of atomic guarded RPCs'
);

select pg_temp.gameledger_assert(
  not has_column_privilege(
    'authenticated', 'public.gameledger_profiles', 'revision', 'INSERT'
  )
  and not has_column_privilege(
    'authenticated', 'public.gameledger_media', 'created_at', 'INSERT'
  )
  and not has_column_privilege(
    'authenticated', 'public.gameledger_media', 'deleted_at', 'INSERT'
  )
  and not has_column_privilege(
    'authenticated', 'public.gameledger_event_sources', 'created_at', 'INSERT'
  ),
  'authenticated callers must not forge revisions, tombstones, or provenance time'
);

select pg_temp.gameledger_assert(
  (
    select count(*) = 4
    from pg_trigger
    where not tgisinternal
      and tgname in (
        'gameledger_profiles_touch',
        'gameledger_games_touch',
        'gameledger_entities_touch',
        'gameledger_media_enforce_insert'
      )
  ),
  'profile/game/entity timestamp and media quota triggers should exist'
);

select pg_temp.gameledger_assert(
  (
    select public = false
      and file_size_limit = 47185920
      and allowed_mime_types @> array[
        'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
        'video/mp4', 'video/webm', 'video/quicktime'
      ]::text[]
      and cardinality(allowed_mime_types) = 8
    from storage.buckets
    where id = 'gameledger-media'
  ),
  'media bucket should be private, 45 MiB, and limited to known photo/video MIME types'
);

select pg_temp.gameledger_assert(
  (
    select count(*) = 3
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'gameledger_media_owner_select',
        'gameledger_media_owner_insert',
        'gameledger_media_owner_delete'
      )
  ),
  'Storage should have exact active-metadata select, insert, and delete policies'
);

select pg_temp.gameledger_assert(
  not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'gameledger_media_owner_%'
      and cmd = 'UPDATE'
  ),
  'Storage objects must never be overwritten in place'
);

select pg_temp.gameledger_assert(
  (
    select prosecdef
      and coalesce(proconfig, array[]::text[]) @> array['search_path=""']
    from pg_proc
    where oid = 'public.gameledger_append_event(uuid,uuid,text,uuid,jsonb,text,timestamp with time zone,uuid,uuid,text,jsonb,uuid,integer)'::regprocedure
  ),
  'append RPC should be SECURITY DEFINER with an empty search_path'
);

select pg_temp.gameledger_assert(
  (
    select prosecdef
      and coalesce(proconfig, array[]::text[]) @> array['search_path=""']
    from pg_proc
    where oid = 'public.gameledger_finish_game(uuid,uuid,jsonb,text,timestamp with time zone,uuid,text,jsonb,uuid,integer)'::regprocedure
  ),
  'finish RPC should be SECURITY DEFINER with an empty search_path'
);

select pg_temp.gameledger_assert(
  (
    select prosecdef
      and coalesce(proconfig, array[]::text[]) @> array['search_path=""']
    from pg_proc
    where oid = 'public.gameledger_enforce_media_insert()'::regprocedure
  ),
  'media reservation trigger should be SECURITY DEFINER with an empty search_path'
);

select pg_temp.gameledger_assert(
  (
    select count(*) = 2
    from pg_proc
    where oid in (
      'public.gameledger_start_game(uuid,text,jsonb,timestamp with time zone,text,jsonb,uuid,integer)'::regprocedure,
      'public.gameledger_delete_game(uuid)'::regprocedure
    )
      and prosecdef
      and coalesce(proconfig, array[]::text[]) @> array['search_path=""']
  ),
  'start and guarded-delete RPCs should be SECURITY DEFINER with empty search_path'
);

select pg_temp.gameledger_assert(
  has_function_privilege(
    'authenticated',
    'public.gameledger_storage_upload_allowed(text,text,text)',
    'EXECUTE'
  ),
  'authenticated Storage INSERT policy must be able to execute its narrow helper'
);

select pg_temp.gameledger_assert(
  not has_function_privilege(
    'anon',
    'public.gameledger_append_event(uuid,uuid,text,uuid,jsonb,text,timestamp with time zone,uuid,uuid,text,jsonb,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.gameledger_finish_game(uuid,uuid,jsonb,text,timestamp with time zone,uuid,text,jsonb,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.gameledger_mark_media_deleted(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.gameledger_start_game(uuid,text,jsonb,timestamp with time zone,text,jsonb,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.gameledger_delete_game(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.gameledger_storage_upload_allowed(text,text,text)',
    'EXECUTE'
  ),
  'anon should not execute any Game Ledger writer RPC'
);

rollback;

select 'Game Ledger RLS smoke test passed' as result;
