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
    "result_fields":{"winner":{"type":"participant"}},
    "result":{"allow_draw":false,"allow_multiple_winners":true}
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
        "result_fields":{"winner":{"type":"participant"}},
        "result":{"allow_draw":false,"allow_multiple_winners":true}
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

-- Participant identity/label/seat snapshots become historical facts as soon as
-- the atomic start commits, even while the game itself is still open.
do $participant_snapshots_immutable_after_start$
declare
  v_update_denied boolean := false;
  v_delete_denied boolean := false;
  v_insert_denied boolean := false;
begin
  begin
    update public.gameledger_participants
    set label = 'Mutable Alex'
    where id = '34000000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then
    v_update_denied := true;
  end;

  begin
    delete from public.gameledger_participants
    where id = '35000000-0000-4000-8000-000000000002';
  exception when insufficient_privilege then
    v_delete_denied := true;
  end;

  begin
    insert into public.gameledger_participants (
      id, owner_id, game_id, label, seat
    )
    values (
      '35100000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-000000000001',
      '33000000-0000-4000-8000-000000000001',
      'Late participant',
      3
    );
  exception when insufficient_privilege then
    v_insert_denied := true;
  end;

  perform pg_temp.gameledger_assert(
    v_update_denied and v_delete_denied and v_insert_denied,
    'participant snapshots must have no direct authenticated write path after atomic start'
  );
  perform pg_temp.gameledger_assert(
    (
      select count(*) = 2
        and min(label) = 'Alex'
        and max(label) = 'Sam'
      from public.gameledger_participants
      where game_id = '33000000-0000-4000-8000-000000000001'
    ),
    'denied snapshot writes must leave the original participant graph unchanged'
  );
end
$participant_snapshots_immutable_after_start$;

-- Reusable identities retire through archival. Their durable UUID remains joined
-- to every historical participant snapshot, and authenticated hard delete is off.
update public.gameledger_entities
set archived_at = now()
where id = '31000000-0000-4000-8000-000000000001';

select pg_temp.gameledger_assert(
  (
    select archived_at is not null
    from public.gameledger_entities
    where id = '31000000-0000-4000-8000-000000000001'
  )
  and (
    select entity_id = '31000000-0000-4000-8000-000000000001'
    from public.gameledger_participants
    where id = '34000000-0000-4000-8000-000000000001'
  ),
  'archiving an entity must retain its historical participant join'
);

do $authenticated_entity_delete_denied$
declare
  v_denied boolean := false;
begin
  begin
    delete from public.gameledger_entities
    where id = '31000000-0000-4000-8000-000000000002';
  exception when insufficient_privilege then
    v_denied := true;
  end;
  perform pg_temp.gameledger_assert(
    v_denied,
    'authenticated clients must archive reusable entities instead of deleting them'
  );
end
$authenticated_entity_delete_denied$;

do $archived_entity_cannot_join_new_game$
declare
  v_denied boolean := false;
begin
  begin
    perform public.gameledger_start_game(
      p_game_id => '31200000-0000-4000-8000-000000000001',
      p_title => 'Archived identity retry',
      p_definition => '{"counters":[],"event_fields":[],"result_fields":[]}'::jsonb,
      p_started_at => timestamptz '2026-08-07 17:30:00+00',
      p_participants => '[{
        "id":"31300000-0000-4000-8000-000000000001",
        "entity_id":"31000000-0000-4000-8000-000000000001",
        "label":"Alex",
        "seat":1
      }]'::jsonb
    );
  exception when no_data_found then
    v_denied := true;
  end;

  perform pg_temp.gameledger_assert(
    v_denied
      and not exists (
        select 1 from public.gameledger_games
        where id = '31200000-0000-4000-8000-000000000001'
      ),
    'an archived entity must not be attached to a newly started game'
  );
end
$archived_entity_cannot_join_new_game$;

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

insert into public.gameledger_entities (
  id, owner_id, entity_type, name, metadata
)
values (
  '31000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000001',
  'person',
  'Jordan',
  '{}'::jsonb
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
          "entity_id":"31000000-0000-4000-8000-000000000003",
          "label":"Jordan",
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
      and min(label) = 'Jordan'
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

-- Reserved result fields are the stable cross-game analytics vocabulary. Failed
-- validation must not append an event or complete the game.
do $normalized_result_validation$
declare
  v_bad_outcome boolean := false;
  v_bad_uuid boolean := false;
  v_non_string_uuid boolean := false;
  v_duplicate_winner boolean := false;
  v_cross_game_winner boolean := false;
  v_draw_winner boolean := false;
  v_disallowed_draw boolean := false;
  v_disallowed_multiple_winners boolean := false;
  v_abandoned_winner boolean := false;
begin
  begin
    perform public.gameledger_finish_game(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_event_id => '3a100000-0000-4000-8000-000000000001',
      p_result => '{"_outcome":"Winner"}'::jsonb
    );
  exception when check_violation then
    v_bad_outcome := true;
  end;

  begin
    perform public.gameledger_finish_game(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_event_id => '3a100000-0000-4000-8000-000000000002',
      p_result => '{
        "_outcome":"completed",
        "_winner_participant_ids":["not-a-uuid"]
      }'::jsonb
    );
  exception when check_violation then
    v_bad_uuid := true;
  end;

  begin
    perform public.gameledger_finish_game(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_event_id => '3a100000-0000-4000-8000-000000000003',
      p_result => '{
        "_outcome":"completed",
        "_winner_participant_ids":[42]
      }'::jsonb
    );
  exception when check_violation then
    v_non_string_uuid := true;
  end;

  begin
    perform public.gameledger_finish_game(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_event_id => '3a100000-0000-4000-8000-000000000004',
      p_result => '{
        "_outcome":"completed",
        "_winner_participant_ids":[
          "34000000-0000-4000-8000-000000000001",
          "34000000-0000-4000-8000-000000000001"
        ]
      }'::jsonb
    );
  exception when check_violation then
    v_duplicate_winner := true;
  end;

  begin
    perform public.gameledger_finish_game(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_event_id => '3a100000-0000-4000-8000-000000000005',
      p_result => '{
        "_outcome":"completed",
        "_winner_participant_ids":[
          "41100000-0000-4000-8000-000000000001"
        ]
      }'::jsonb
    );
  exception when check_violation then
    v_cross_game_winner := true;
  end;

  begin
    perform public.gameledger_finish_game(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_event_id => '3a100000-0000-4000-8000-000000000006',
      p_result => '{
        "_outcome":"draw",
        "_winner_participant_ids":[
          "34000000-0000-4000-8000-000000000001"
        ]
      }'::jsonb
    );
  exception when check_violation then
    v_draw_winner := true;
  end;

  begin
    perform public.gameledger_finish_game(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_event_id => '3a100000-0000-4000-8000-000000000008',
      p_result => '{
        "_outcome":"draw",
        "_winner_participant_ids":[]
      }'::jsonb
    );
  exception when check_violation then
    v_disallowed_draw := true;
  end;

  begin
    perform public.gameledger_finish_game(
      p_game_id => '41000000-0000-4000-8000-000000000003',
      p_event_id => '3a100000-0000-4000-8000-000000000009',
      p_result => '{
        "_outcome":"completed",
        "_winner_participant_ids":[
          "41100000-0000-4000-8000-000000000001",
          "41200000-0000-4000-8000-000000000002"
        ]
      }'::jsonb
    );
  exception when check_violation then
    v_disallowed_multiple_winners := true;
  end;

  begin
    perform public.gameledger_finish_game(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_event_id => '3a100000-0000-4000-8000-000000000007',
      p_result => '{
        "_outcome":"abandoned",
        "_winner_participant_ids":[
          "35000000-0000-4000-8000-000000000002"
        ]
      }'::jsonb
    );
  exception when check_violation then
    v_abandoned_winner := true;
  end;

  perform pg_temp.gameledger_assert(
    v_bad_outcome
      and v_bad_uuid
      and v_non_string_uuid
      and v_duplicate_winner
      and v_cross_game_winner
      and v_draw_winner
      and v_disallowed_draw
      and v_disallowed_multiple_winners
      and v_abandoned_winner,
    'finish must reject malformed, duplicate, cross-game, contradictory, and definition-disallowed result facts'
  );
  perform pg_temp.gameledger_assert(
    (
      select status = 'in_progress' and ended_at is null
      from public.gameledger_games
      where id = '33000000-0000-4000-8000-000000000001'
    )
    and not exists (
      select 1
      from public.gameledger_events
      where game_id = '33000000-0000-4000-8000-000000000001'
        and event_kind = 'result'
    )
    and (
      select status = 'in_progress' and ended_at is null
      from public.gameledger_games
      where id = '41000000-0000-4000-8000-000000000003'
    )
    and not exists (
      select 1
      from public.gameledger_events
      where game_id = '41000000-0000-4000-8000-000000000003'
        and event_kind = 'result'
    ),
    'invalid reserved or definition-disallowed result facts must roll back without changing either game history'
  );
end
$normalized_result_validation$;

select pg_temp.gameledger_assert(
  (
    public.gameledger_finish_game(
      p_game_id => '33000000-0000-4000-8000-000000000001',
      p_event_id => '3a000000-0000-4000-8000-000000000003',
      p_result => '{
        "_outcome":"completed",
        "_winner_participant_ids":[
          "{34000000-0000-4000-8000-000000000001}",
          "35000000-0000-4000-8000-000000000002"
        ],
        "values":{"points":121,"margin":0.5},
        "house_fact":{"label":"shared victory","streak":3}
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
        and event_data->>'_outcome' = 'completed'
        and jsonb_array_length(event_data->'_winner_participant_ids') = 2
        and event_data #>> '{_winner_participant_ids,0}'
          = '34000000-0000-4000-8000-000000000001'
        and (event_data #>> '{values,margin}')::numeric = 0.5
        and event_data #>> '{house_fact,label}' = 'shared victory'
      )
    from public.gameledger_events
    where game_id = '33000000-0000-4000-8000-000000000001'
  ),
  'finish must preserve arbitrary result JSON and commit a valid co-winner result'
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

select pg_temp.gameledger_assert(
  (
    public.gameledger_finish_game(
      p_game_id => '41000000-0000-4000-8000-000000000003',
      p_event_id => '41300000-0000-4000-8000-000000000003',
      p_result => '{
        "_outcome":"no-decision",
        "_winner_participant_ids":[],
        "reason":"evening interrupted"
      }'::jsonb,
      p_ended_at => timestamptz '2026-08-07 19:10:00+00',
      p_source_id => '41400000-0000-4000-8000-000000000003'
    )->>'idempotent'
  )::boolean = false,
  'no-decision must remain a valid normalized custom outcome'
);

select public.gameledger_start_game(
  p_game_id => '45000000-0000-4000-8000-000000000007',
  p_title => 'Unusual activity',
  p_definition => '{"result_fields":[],"custom_schema":{"version":7}}'::jsonb,
  p_started_at => timestamptz '2026-08-07 20:00:00+00'
);

select pg_temp.gameledger_assert(
  (
    public.gameledger_finish_game(
      p_game_id => '45000000-0000-4000-8000-000000000007',
      p_event_id => '45100000-0000-4000-8000-000000000007',
      p_result => '{
        "_outcome":"custom",
        "_winner_participant_ids":[],
        "anything":{"still":"preserved"}
      }'::jsonb,
      p_ended_at => timestamptz '2026-08-07 20:01:00+00',
      p_source_id => '45200000-0000-4000-8000-000000000007'
    )->>'idempotent'
  )::boolean = false,
  'custom must remain a valid outcome and preserve unrelated result JSON'
);

select public.gameledger_start_game(
  p_game_id => '46000000-0000-4000-8000-000000000008',
  p_title => 'Draw-friendly activity',
  p_definition => '{"result":{"allow_draw":true}}'::jsonb,
  p_started_at => timestamptz '2026-08-07 20:02:00+00'
);

select pg_temp.gameledger_assert(
  (
    public.gameledger_finish_game(
      p_game_id => '46000000-0000-4000-8000-000000000008',
      p_event_id => '46100000-0000-4000-8000-000000000008',
      p_result => '{
        "_outcome":"draw",
        "_winner_participant_ids":[],
        "house_fact":{"still":"preserved"}
      }'::jsonb,
      p_ended_at => timestamptz '2026-08-07 20:03:00+00',
      p_source_id => '46200000-0000-4000-8000-000000000008'
    )->>'idempotent'
  )::boolean = false,
  'an explicitly allowed draw must remain supported'
);

select pg_temp.gameledger_assert(
  (
    select event_data #>> '{house_fact,still}' = 'preserved'
    from public.gameledger_events
    where id = '46100000-0000-4000-8000-000000000008'
  ),
  'an allowed draw must retain arbitrary result JSON'
);

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
  v_update_denied boolean := false;
  v_insert_denied boolean := false;
begin
  begin
    update public.gameledger_participants
    set label = 'Rewritten after the fact'
    where id = '34000000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then
    v_update_denied := true;
  end;

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
    v_update_denied and v_insert_denied,
    'participant snapshots must remain immutable after completion'
  );
end
$complete_participant_rewrite_denied$;

-- The analytics RPC returns the complete owner graph as explicitly shaped JSON.
-- Compare array IDs to independently ordered table facts so accidental ordering
-- drift is caught without coupling this test to every payload field.
do $history_snapshot_shape_and_order$
declare
  v_snapshot jsonb := public.gameledger_history_snapshot();
begin
  perform pg_temp.gameledger_assert(
    jsonb_typeof(v_snapshot) = 'object'
      and (
        select array_agg(key order by key) = array[
          'active_media_counts',
          'entities',
          'events',
          'games',
          'participants',
          'schema_version'
        ]::text[]
        from jsonb_object_keys(v_snapshot) as keys(key)
      )
      and v_snapshot->>'schema_version' = '1'
      and jsonb_typeof(v_snapshot->'entities') = 'array'
      and jsonb_typeof(v_snapshot->'games') = 'array'
      and jsonb_typeof(v_snapshot->'participants') = 'array'
      and jsonb_typeof(v_snapshot->'events') = 'array'
      and jsonb_typeof(v_snapshot->'active_media_counts') = 'array',
    'history snapshot must have the stable versioned root shape'
  );

  perform pg_temp.gameledger_assert(
    (
      select jsonb_agg(item->'id' order by ordinal)
      from jsonb_array_elements(v_snapshot->'entities')
        with ordinality as items(item, ordinal)
    ) = (
      select jsonb_agg(to_jsonb(entity.id) order by entity.created_at, entity.id)
      from public.gameledger_entities as entity
    )
    and (
      select jsonb_agg(item->'id' order by ordinal)
      from jsonb_array_elements(v_snapshot->'games')
        with ordinality as items(item, ordinal)
    ) = (
      select jsonb_agg(
        to_jsonb(game.id)
        order by game.started_at, game.created_at, game.id
      )
      from public.gameledger_games as game
    )
    and (
      select jsonb_agg(item->'id' order by ordinal)
      from jsonb_array_elements(v_snapshot->'participants')
        with ordinality as items(item, ordinal)
    ) = (
      select jsonb_agg(
        to_jsonb(participant.id)
        order by participant.game_id, participant.seat, participant.id
      )
      from public.gameledger_participants as participant
    )
    and (
      select jsonb_agg(item->'id' order by ordinal)
      from jsonb_array_elements(v_snapshot->'events')
        with ordinality as items(item, ordinal)
    ) = (
      select jsonb_agg(
        to_jsonb(event.id)
        order by event.game_id, event.seq, event.id
      )
      from public.gameledger_events as event
    )
    and (
      select jsonb_agg(item->'game_id' order by ordinal)
      from jsonb_array_elements(v_snapshot->'active_media_counts')
        with ordinality as items(item, ordinal)
    ) = (
      select jsonb_agg(to_jsonb(game.id) order by game.id)
      from public.gameledger_games as game
    ),
    'snapshot entity, game, participant, event, and media-count arrays must be deterministic'
  );

  perform pg_temp.gameledger_assert(
    jsonb_array_length(v_snapshot->'active_media_counts')
      = jsonb_array_length(v_snapshot->'games')
      and exists (
        select 1
        from jsonb_array_elements(v_snapshot->'active_media_counts') as counts(item)
        where item->>'game_id' = '33000000-0000-4000-8000-000000000001'
          and (item->>'active_media_count')::integer = 1
      )
      and not exists (
        select 1
        from jsonb_array_elements(v_snapshot->'active_media_counts') as counts(item)
        where item->>'game_id' <> '33000000-0000-4000-8000-000000000001'
          and (item->>'active_media_count')::integer <> 0
      ),
    'snapshot must include a deterministic active media count for every game'
  );

  perform pg_temp.gameledger_assert(
    (v_snapshot->'entities'->0) ?& array[
      'id', 'entity_type', 'name', 'metadata', 'archived_at', 'created_at', 'updated_at'
    ]::text[]
      and not (v_snapshot->'entities'->0 ? 'owner_id')
      and not (v_snapshot::text like '%signed_url%')
      and not (v_snapshot::text like '%storage_path%')
      and exists (
        select 1
        from jsonb_array_elements(v_snapshot->'events') as events(item)
        where item->>'id' = '3a000000-0000-4000-8000-000000000003'
          and item #>> '{event_data,house_fact,label}' = 'shared victory'
      )
      and v_snapshot = public.gameledger_history_snapshot(),
    'snapshot objects must be bounded, omit storage secrets, preserve arbitrary facts, and serialize repeatably'
  );
end
$history_snapshot_shape_and_order$;

-- The support boundary must fail before aggregation. Temporarily create enough
-- owner identities to cross the cheapest row-count guard, assert the stable SQL
-- state, then remove them before continuing the isolation checks.
reset role;
insert into public.gameledger_entities (
  id, owner_id, entity_type, name, metadata
)
select
  md5('gameledger-snapshot-limit-' || ordinal::text)::uuid,
  '30000000-0000-4000-8000-000000000001',
  'snapshot_limit_test',
  'Synthetic identity ' || ordinal::text,
  '{"smoke_only":true}'::jsonb
from generate_series(1, 10001) as rows(ordinal);
set local role authenticated;

do $history_snapshot_support_boundary$
declare
  v_guarded boolean := false;
begin
  begin
    perform public.gameledger_history_snapshot();
  exception when program_limit_exceeded then
    v_guarded := true;
  end;

  perform pg_temp.gameledger_assert(
    v_guarded,
    'history snapshot must fail predictably before aggregating an account beyond its support boundary'
  );
end
$history_snapshot_support_boundary$;

reset role;
delete from public.gameledger_entities
where owner_id = '30000000-0000-4000-8000-000000000001'
  and metadata = '{"smoke_only":true}'::jsonb;
set local role authenticated;

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

select pg_temp.gameledger_assert(
  jsonb_array_length(public.gameledger_history_snapshot()->'entities') = 0
    and jsonb_array_length(public.gameledger_history_snapshot()->'games') = 0
    and jsonb_array_length(public.gameledger_history_snapshot()->'participants') = 0
    and jsonb_array_length(public.gameledger_history_snapshot()->'events') = 0
    and jsonb_array_length(public.gameledger_history_snapshot()->'active_media_counts') = 0,
  'history snapshot must not leak any User A facts to an empty User B account'
);

insert into public.gameledger_entities (
  id, owner_id, entity_type, name, metadata
)
values (
  '51000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  'person',
  'User B person',
  '{"account":"B"}'::jsonb
);

select public.gameledger_start_game(
  p_game_id => '52000000-0000-4000-8000-000000000001',
  p_title => 'User B private game',
  p_definition => '{"counters":[{"id":"score"}]}'::jsonb,
  p_started_at => timestamptz '2026-08-08 12:00:00+00',
  p_participants => '[{
    "id":"53000000-0000-4000-8000-000000000001",
    "entity_id":"51000000-0000-4000-8000-000000000001",
    "label":"User B person",
    "seat":1
  }]'::jsonb
);

select public.gameledger_append_event(
  p_game_id => '52000000-0000-4000-8000-000000000001',
  p_event_id => '54000000-0000-4000-8000-000000000001',
  p_event_kind => 'counter_change',
  p_actor_participant_id => '53000000-0000-4000-8000-000000000001',
  p_event_data => '{"values":{"score":7}}'::jsonb,
  p_source_id => '55000000-0000-4000-8000-000000000001'
);

do $user_b_snapshot_isolated$
declare
  v_snapshot jsonb := public.gameledger_history_snapshot();
begin
  perform pg_temp.gameledger_assert(
    jsonb_array_length(v_snapshot->'entities') = 1
      and v_snapshot #>> '{entities,0,id}' = '51000000-0000-4000-8000-000000000001'
      and jsonb_array_length(v_snapshot->'games') = 1
      and v_snapshot #>> '{games,0,id}' = '52000000-0000-4000-8000-000000000001'
      and jsonb_array_length(v_snapshot->'participants') = 1
      and v_snapshot #>> '{participants,0,id}' = '53000000-0000-4000-8000-000000000001'
      and jsonb_array_length(v_snapshot->'events') = 1
      and v_snapshot #>> '{events,0,id}' = '54000000-0000-4000-8000-000000000001'
      and jsonb_array_length(v_snapshot->'active_media_counts') = 1
      and v_snapshot #>> '{active_media_counts,0,active_media_count}' = '0'
      and position('33000000-0000-4000-8000-000000000001' in v_snapshot::text) = 0,
    'User B snapshot must contain only User B entities, games, snapshots, events, and counts'
  );
end
$user_b_snapshot_isolated$;

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

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select pg_temp.gameledger_assert(
  position(
    '52000000-0000-4000-8000-000000000001'
    in public.gameledger_history_snapshot()::text
  ) = 0
    and position(
      '33000000-0000-4000-8000-000000000001'
      in public.gameledger_history_snapshot()::text
    ) > 0,
  'User A snapshot must retain User A history while excluding User B facts'
);

-- Reviewed AI writes add an atomic sequence/header basis to the normal ledger
-- RPCs. Dedicated games keep these retry/staleness checks independent from the
-- history fixtures above.
select public.gameledger_start_game(
  p_game_id => '60000000-0000-4000-8000-000000000001',
  p_title => 'Reviewed event apply fixture',
  p_definition => '{"counters":[{"id":"points"}]}'::jsonb,
  p_started_at => timestamptz '2026-08-09 10:00:00+00',
  p_participants => '[{
    "id":"61000000-0000-4000-8000-000000000001",
    "label":"Reviewer",
    "seat":1
  }]'::jsonb
);

do $reviewed_event_apply_is_atomic_and_exact$
declare
  v_basis timestamptz;
  v_first jsonb;
  v_retry jsonb;
  v_rejected boolean;
begin
  select updated_at into v_basis
  from public.gameledger_games
  where id = '60000000-0000-4000-8000-000000000001';

  v_first := public.gameledger_apply_reviewed_event(
    p_game_id => '60000000-0000-4000-8000-000000000001',
    p_expected_last_seq => 0,
    p_expected_game_updated_at => v_basis,
    p_event_id => '62000000-0000-4000-8000-000000000001',
    p_event_kind => 'score',
    p_actor_participant_id => '61000000-0000-4000-8000-000000000001',
    p_event_data => '{"values":{"points":7}}'::jsonb,
    p_note => 'Reviewed seven points',
    p_occurred_at => null,
    p_source_id => '63000000-0000-4000-8000-000000000001',
    p_source_kind => 'ai.chat',
    p_source_data => '{"provider":"openai","reviewed":true}'::jsonb
  );
  perform pg_temp.gameledger_assert(
    (v_first->>'idempotent')::boolean = false
      and v_first #>> '{event,seq}' = '1',
    'reviewed event apply should append exactly one next event'
  );

  -- A null requested time is generated by the canonical writer, while the raw
  -- null remains in provenance so an otherwise identical retry is still exact.
  v_retry := public.gameledger_apply_reviewed_event(
    p_game_id => '60000000-0000-4000-8000-000000000001',
    p_expected_last_seq => 0,
    p_expected_game_updated_at => v_basis,
    p_event_id => '62000000-0000-4000-8000-000000000001',
    p_event_kind => 'score',
    p_actor_participant_id => '61000000-0000-4000-8000-000000000001',
    p_event_data => '{"values":{"points":7}}'::jsonb,
    p_note => 'Reviewed seven points',
    p_occurred_at => null,
    p_source_id => '63000000-0000-4000-8000-000000000001',
    p_source_kind => 'ai.chat',
    p_source_data => '{"provider":"openai","reviewed":true}'::jsonb
  );
  perform pg_temp.gameledger_assert(
    (v_retry->>'idempotent')::boolean
      and v_retry #>> '{event,id}' = '62000000-0000-4000-8000-000000000001',
    'an exact reviewed event retry should return the committed event'
  );

  perform pg_temp.gameledger_assert(
    (
      select count(*) = 1
        and min(source_data #>> '{_gameledger_review,expected_last_seq}') = '0'
        and bool_and(source_data #> '{_gameledger_review,occurred_at_input}' = 'null'::jsonb)
      from public.gameledger_event_sources
      where event_id = '62000000-0000-4000-8000-000000000001'
    ),
    'reviewed event provenance must retain its exact basis and null time input'
  );

  v_rejected := false;
  begin
    perform public.gameledger_apply_reviewed_event(
      p_game_id => '60000000-0000-4000-8000-000000000001',
      p_expected_last_seq => 0,
      p_expected_game_updated_at => v_basis,
      p_event_id => '62000000-0000-4000-8000-000000000001',
      p_event_kind => 'score',
      p_actor_participant_id => '61000000-0000-4000-8000-000000000001',
      p_event_data => '{"values":{"points":70}}'::jsonb,
      p_note => 'Reviewed seven points',
      p_occurred_at => null,
      p_source_id => '63000000-0000-4000-8000-000000000001',
      p_source_kind => 'ai.chat',
      p_source_data => '{"provider":"openai","reviewed":true}'::jsonb
    );
  exception when check_violation then
    v_rejected := true;
  end;
  perform pg_temp.gameledger_assert(
    v_rejected,
    'a reviewed event UUID must reject a retry with changed event content'
  );

  v_rejected := false;
  begin
    perform public.gameledger_apply_reviewed_event(
      p_game_id => '60000000-0000-4000-8000-000000000001',
      p_expected_last_seq => 0,
      p_expected_game_updated_at => v_basis,
      p_event_id => '62000000-0000-4000-8000-000000000001',
      p_event_kind => 'score',
      p_actor_participant_id => '61000000-0000-4000-8000-000000000001',
      p_event_data => '{"values":{"points":7}}'::jsonb,
      p_note => 'Reviewed seven points',
      p_occurred_at => null,
      p_source_id => '63000000-0000-4000-8000-000000000001',
      p_source_kind => 'ai.chat',
      p_source_data => '{"provider":"anthropic","reviewed":true}'::jsonb
    );
  exception when check_violation then
    v_rejected := true;
  end;
  perform pg_temp.gameledger_assert(
    v_rejected,
    'a reviewed event UUID must reject a retry with changed provenance'
  );

  v_rejected := false;
  begin
    perform public.gameledger_apply_reviewed_event(
      p_game_id => '60000000-0000-4000-8000-000000000001',
      p_expected_last_seq => 0,
      p_expected_game_updated_at => v_basis - interval '1 microsecond',
      p_event_id => '62000000-0000-4000-8000-000000000002',
      p_event_kind => 'note',
      p_event_data => '{}',
      p_source_id => '63000000-0000-4000-8000-000000000002'
    );
  exception when serialization_failure then
    v_rejected := true;
  end;
  perform pg_temp.gameledger_assert(
    v_rejected,
    'a new reviewed event must reject a stale header basis'
  );

  v_rejected := false;
  begin
    perform public.gameledger_apply_reviewed_event(
      p_game_id => '60000000-0000-4000-8000-000000000001',
      p_expected_last_seq => 0,
      p_expected_game_updated_at => v_basis,
      p_event_id => '62000000-0000-4000-8000-000000000003',
      p_event_kind => 'note',
      p_event_data => '{}',
      p_source_id => '63000000-0000-4000-8000-000000000003'
    );
  exception when serialization_failure then
    v_rejected := true;
  end;
  perform pg_temp.gameledger_assert(
    v_rejected
      and not exists (
        select 1 from public.gameledger_events
        where id in (
          '62000000-0000-4000-8000-000000000002',
          '62000000-0000-4000-8000-000000000003'
        )
      )
      and not exists (
        select 1 from public.gameledger_event_sources
        where id in (
          '63000000-0000-4000-8000-000000000002',
          '63000000-0000-4000-8000-000000000003'
        )
      ),
    'stale reviewed events must roll back both canonical facts and provenance'
  );
end
$reviewed_event_apply_is_atomic_and_exact$;

-- Assistant context is aggregated in Postgres and emits only a compact tail.
-- A void-of-void restores the original score without shipping the full ledger
-- to the application server for replay.
select public.gameledger_append_event(
  p_game_id => '60000000-0000-4000-8000-000000000001',
  p_event_id => '62000000-0000-4000-8000-000000000010',
  p_event_kind => 'void',
  p_event_data => '{"reason":"temporary correction"}'::jsonb,
  p_voids_event_id => '62000000-0000-4000-8000-000000000001',
  p_source_id => '63000000-0000-4000-8000-000000000010'
);
select public.gameledger_append_event(
  p_game_id => '60000000-0000-4000-8000-000000000001',
  p_event_id => '62000000-0000-4000-8000-000000000011',
  p_event_kind => 'void',
  p_event_data => '{"reason":"restore original"}'::jsonb,
  p_voids_event_id => '62000000-0000-4000-8000-000000000010',
  p_source_id => '63000000-0000-4000-8000-000000000011'
);

do $assistant_context_is_aggregated_and_bounded$
declare
  v_context jsonb := public.gameledger_ai_context(
    '60000000-0000-4000-8000-000000000001'
  );
begin
  perform pg_temp.gameledger_assert(
    v_context->>'schema_version' = '1'
      and v_context->>'last_event_seq' = '3'
      and v_context->>'event_count' = '3'
      and jsonb_array_length(v_context->'recent_events') = 3
      and v_context #>> '{current_totals,0,participant_id}'
        = '61000000-0000-4000-8000-000000000001'
      and (v_context #>> '{current_totals,0,values,points}')::numeric = 7,
    'assistant context must resolve void chains and return exact totals with a bounded timeline tail'
  );
end
$assistant_context_is_aggregated_and_bounded$;

select public.gameledger_start_game(
  p_game_id => '64000000-0000-4000-8000-000000000001',
  p_title => 'Reviewed finish apply fixture',
  p_definition => '{"result":{"allow_draw":true}}'::jsonb,
  p_started_at => timestamptz '2026-08-09 00:00:00+00',
  p_participants => '[{
    "id":"6a000000-0000-4000-8000-000000000001",
    "label":"Winner",
    "seat":1
  }]'::jsonb
);

do $reviewed_finish_apply_is_atomic_and_exact$
declare
  v_basis timestamptz;
  v_first jsonb;
  v_retry jsonb;
  v_rejected boolean;
begin
  select updated_at into v_basis
  from public.gameledger_games
  where id = '64000000-0000-4000-8000-000000000001';

  v_rejected := false;
  begin
    perform public.gameledger_apply_reviewed_finish(
      p_game_id => '64000000-0000-4000-8000-000000000001',
      p_expected_last_seq => 0,
      p_expected_game_updated_at => v_basis - interval '1 microsecond',
      p_event_id => '66000000-0000-4000-8000-000000000001',
      p_result => '{"_outcome":"completed","_winner_participant_ids":[]}',
      p_source_id => '67000000-0000-4000-8000-000000000001'
    );
  exception when serialization_failure then
    v_rejected := true;
  end;
  perform pg_temp.gameledger_assert(
    v_rejected
      and (
        select status = 'in_progress' and ended_at is null
        from public.gameledger_games
        where id = '64000000-0000-4000-8000-000000000001'
      )
      and not exists (
        select 1 from public.gameledger_events
        where id = '66000000-0000-4000-8000-000000000001'
      ),
    'stale reviewed finish must leave the game open and append nothing'
  );

  v_first := public.gameledger_apply_reviewed_finish(
    p_game_id => '64000000-0000-4000-8000-000000000001',
    p_expected_last_seq => 0,
    p_expected_game_updated_at => v_basis,
    p_event_id => '66000000-0000-4000-8000-000000000001',
    p_result => '{
      "_outcome":"completed",
      "_winner_participant_ids":["6A000000-0000-4000-8000-000000000001"],
      "summary":"first to target"
    }'::jsonb,
    p_note => 'Reviewed finish',
    p_ended_at => null,
    p_source_id => '67000000-0000-4000-8000-000000000001',
    p_source_kind => 'ai.chat',
    p_source_data => '{"provider":"anthropic","reviewed":true}'::jsonb
  );
  perform pg_temp.gameledger_assert(
    (v_first->>'idempotent')::boolean = false
      and v_first #>> '{event,event_data,_winner_participant_ids,0}'
        = '6a000000-0000-4000-8000-000000000001'
      and v_first #>> '{game,status}' = 'complete',
    'reviewed finish should canonicalize winners and complete atomically'
  );

  v_retry := public.gameledger_apply_reviewed_finish(
    p_game_id => '64000000-0000-4000-8000-000000000001',
    p_expected_last_seq => 0,
    p_expected_game_updated_at => v_basis,
    p_event_id => '66000000-0000-4000-8000-000000000001',
    p_result => '{
      "_outcome":"completed",
      "_winner_participant_ids":["6A000000-0000-4000-8000-000000000001"],
      "summary":"first to target"
    }'::jsonb,
    p_note => 'Reviewed finish',
    p_ended_at => null,
    p_source_id => '67000000-0000-4000-8000-000000000001',
    p_source_kind => 'ai.chat',
    p_source_data => '{"provider":"anthropic","reviewed":true}'::jsonb
  );
  perform pg_temp.gameledger_assert(
    (v_retry->>'idempotent')::boolean
      and v_retry #>> '{event,id}' = '66000000-0000-4000-8000-000000000001'
      and v_retry #>> '{game,status}' = 'complete',
    'an exact reviewed finish retry should return the committed result'
  );

  v_rejected := false;
  begin
    perform public.gameledger_apply_reviewed_finish(
      p_game_id => '64000000-0000-4000-8000-000000000001',
      p_expected_last_seq => 0,
      p_expected_game_updated_at => v_basis,
      p_event_id => '66000000-0000-4000-8000-000000000001',
      p_result => '{
        "_outcome":"completed",
        "_winner_participant_ids":["6A000000-0000-4000-8000-000000000001"],
        "summary":"changed after review"
      }'::jsonb,
      p_note => 'Reviewed finish',
      p_ended_at => null,
      p_source_id => '67000000-0000-4000-8000-000000000001',
      p_source_kind => 'ai.chat',
      p_source_data => '{"provider":"anthropic","reviewed":true}'::jsonb
    );
  exception when check_violation then
    v_rejected := true;
  end;
  perform pg_temp.gameledger_assert(
    v_rejected,
    'a reviewed result UUID must reject a retry with changed result content'
  );

  v_rejected := false;
  begin
    perform public.gameledger_apply_reviewed_finish(
      p_game_id => '64000000-0000-4000-8000-000000000001',
      p_expected_last_seq => 0,
      p_expected_game_updated_at => v_basis + interval '1 microsecond',
      p_event_id => '66000000-0000-4000-8000-000000000001',
      p_result => '{
        "_outcome":"completed",
        "_winner_participant_ids":["6A000000-0000-4000-8000-000000000001"],
        "summary":"first to target"
      }'::jsonb,
      p_note => 'Reviewed finish',
      p_ended_at => null,
      p_source_id => '67000000-0000-4000-8000-000000000001',
      p_source_kind => 'ai.chat',
      p_source_data => '{"provider":"anthropic","reviewed":true}'::jsonb
    );
  exception when check_violation then
    v_rejected := true;
  end;
  perform pg_temp.gameledger_assert(
    v_rejected,
    'an existing reviewed result must reject a changed review basis'
  );

  perform pg_temp.gameledger_assert(
    (
      select count(*) = 1
        and min(source_data #>> '{_gameledger_review,expected_last_seq}') = '0'
        and bool_and(source_data #> '{_gameledger_review,ended_at_input}' = 'null'::jsonb)
      from public.gameledger_event_sources
      where event_id = '66000000-0000-4000-8000-000000000001'
    )
      and (
        select count(*) = 1 and min(event_kind) = 'result'
        from public.gameledger_events
        where game_id = '64000000-0000-4000-8000-000000000001'
      ),
    'reviewed finish retries must retain one result and one exact provenance source'
  );
end
$reviewed_finish_apply_is_atomic_and_exact$;

reset role;

do $entity_fk_restricts_maintenance_delete$
declare
  v_restricted boolean := false;
begin
  begin
    delete from public.gameledger_entities
    where id = '31000000-0000-4000-8000-000000000001';
    set constraints gameledger_participants_entity_owner_fk immediate;
  exception when foreign_key_violation then
    v_restricted := true;
  end;
  perform pg_temp.gameledger_assert(
    v_restricted,
    'even trusted maintenance cannot erase an entity still referenced by history'
  );
end
$entity_fk_restricts_maintenance_delete$;

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
  )
  and not has_table_privilege(
    'authenticated', 'public.gameledger_participants', 'UPDATE'
  )
  and not has_table_privilege(
    'authenticated', 'public.gameledger_participants', 'DELETE'
  )
  and not has_table_privilege(
    'authenticated', 'public.gameledger_entities', 'DELETE'
  ),
  'game start/delete, participant mutation, and entity hard delete must be unavailable directly'
);

select pg_temp.gameledger_assert(
  has_column_privilege(
    'authenticated', 'public.gameledger_entities', 'archived_at', 'UPDATE'
  )
  and (
    select confdeltype = 'r'
    from pg_constraint
    where conrelid = 'public.gameledger_participants'::regclass
      and conname = 'gameledger_participants_entity_owner_fk'
  )
  and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'gameledger_participants'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
  ),
  'entities must be archivable, entity history restricted, and participant RLS read-only'
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
    select count(*) = 3
    from pg_proc
    where oid in (
      'public.gameledger_ai_context(uuid)'::regprocedure,
      'public.gameledger_apply_reviewed_event(uuid,bigint,timestamp with time zone,uuid,uuid,text,uuid,jsonb,text,timestamp with time zone,text,jsonb,uuid)'::regprocedure,
      'public.gameledger_apply_reviewed_finish(uuid,bigint,timestamp with time zone,uuid,uuid,jsonb,text,timestamp with time zone,text,jsonb)'::regprocedure
    )
      and prosecdef
      and coalesce(proconfig, array[]::text[]) @> array['search_path=""']
  )
  and has_function_privilege(
    'authenticated',
    'public.gameledger_ai_context(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.gameledger_apply_reviewed_event(uuid,bigint,timestamp with time zone,uuid,uuid,text,uuid,jsonb,text,timestamp with time zone,text,jsonb,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.gameledger_apply_reviewed_finish(uuid,bigint,timestamp with time zone,uuid,uuid,jsonb,text,timestamp with time zone,text,jsonb)',
    'EXECUTE'
  ),
  'assistant context and reviewed apply RPCs should be hardened SECURITY DEFINER functions executable by authenticated users'
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
    select count(*) = 3
    from pg_proc
    where oid in (
      'public.gameledger_start_game(uuid,text,jsonb,timestamp with time zone,text,jsonb,uuid,integer)'::regprocedure,
      'public.gameledger_delete_game(uuid)'::regprocedure,
      'public.gameledger_history_snapshot()'::regprocedure
    )
      and prosecdef
      and coalesce(proconfig, array[]::text[]) @> array['search_path=""']
  ),
  'start, guarded-delete, and history RPCs should be SECURITY DEFINER with empty search_path'
);

select pg_temp.gameledger_assert(
  (
    select provolatile = 's'
    from pg_proc
    where oid = 'public.gameledger_history_snapshot()'::regprocedure
  )
  and has_function_privilege(
    'authenticated',
    'public.gameledger_history_snapshot()',
    'EXECUTE'
  ),
  'authenticated must be able to execute the stable history snapshot RPC'
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
  )
  and not has_function_privilege(
    'anon',
    'public.gameledger_history_snapshot()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.gameledger_ai_context(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.gameledger_apply_reviewed_event(uuid,bigint,timestamp with time zone,uuid,uuid,text,uuid,jsonb,text,timestamp with time zone,text,jsonb,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.gameledger_apply_reviewed_finish(uuid,bigint,timestamp with time zone,uuid,uuid,jsonb,text,timestamp with time zone,text,jsonb)',
    'EXECUTE'
  ),
  'anon should not execute any Game Ledger RPC'
);

rollback;

select 'Game Ledger RLS smoke test passed' as result;
