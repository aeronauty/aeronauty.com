-- Confirmed AI proposals use the normal immutable ledger writers, with one
-- additional invariant: the game must still have the exact sequence and header
-- revision the user reviewed. Stable event/source UUIDs make network retries
-- idempotent, but only when every reviewed input is identical to the committed
-- write. The game row lock serializes retry detection, basis checks, and writes.

-- Drop the earlier development signatures if this migration is re-run after a
-- preview deploy. The production signatures also bind the reviewed updated_at.
drop function if exists public.gameledger_ai_context(uuid);
drop function if exists public.gameledger_apply_reviewed_event(
  uuid, bigint, uuid, text, uuid, jsonb, text, timestamptz, uuid, text, jsonb, uuid
);
drop function if exists public.gameledger_apply_reviewed_finish(
  uuid, bigint, uuid, jsonb, text, timestamptz, uuid, text, jsonb
);
drop function if exists public.gameledger_apply_reviewed_event(
  uuid, bigint, timestamptz, uuid, text, uuid, jsonb, text, timestamptz, uuid, text, jsonb, uuid
);
drop function if exists public.gameledger_apply_reviewed_finish(
  uuid, bigint, timestamptz, uuid, jsonb, text, timestamptz, uuid, text, jsonb
);

-- The assistant needs exact current counter totals and a small timeline tail,
-- not every immutable event. Resolve void chains and aggregate inside Postgres
-- so request memory and network size remain bounded even for long-lived games.
create or replace function public.gameledger_ai_context(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_game public.gameledger_games%rowtype;
  v_event record;
  v_participants jsonb;
  v_totals jsonb;
  v_recent_events jsonb;
  v_last_event_seq bigint;
  v_event_count bigint;
  v_is_suppressed boolean;
begin
  if v_uid is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  select * into v_game
  from public.gameledger_games
  where id = p_game_id and owner_id = v_uid;
  if not found then
    raise no_data_found using message = 'Game not found';
  end if;

  select
    coalesce(max(event.seq), 0),
    count(*)
  into v_last_event_seq, v_event_count
  from public.gameledger_events as event
  where event.game_id = p_game_id and event.owner_id = v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', participant.id,
    'owner_id', participant.owner_id,
    'game_id', participant.game_id,
    'entity_id', participant.entity_id,
    'label', participant.label,
    'seat', participant.seat,
    'metadata', participant.metadata,
    'created_at', participant.created_at
  ) order by participant.seat, participant.id), '[]'::jsonb)
  into v_participants
  from public.gameledger_participants as participant
  where participant.game_id = p_game_id and participant.owner_id = v_uid;

  -- A live void suppresses its target; a later live void of that void restores
  -- the earlier event. Walking newest-to-oldest exactly matches ledger replay.
  create temporary table if not exists pg_temp.gameledger_ai_suppressed_events (
    event_id uuid primary key
  ) on commit delete rows;
  truncate table pg_temp.gameledger_ai_suppressed_events;

  for v_event in
    select event.id, event.event_kind, event.voids_event_id
    from public.gameledger_events as event
    where event.game_id = p_game_id
      and event.owner_id = v_uid
      and event.event_kind = 'void'
    order by event.seq desc
  loop
    execute
      'select exists (
         select 1
         from pg_temp.gameledger_ai_suppressed_events as suppressed
         where suppressed.event_id = $1
       )'
    into v_is_suppressed
    using v_event.id;
    if v_event.event_kind = 'void'
      and v_event.voids_event_id is not null
      and not v_is_suppressed
    then
      execute
        'insert into pg_temp.gameledger_ai_suppressed_events (event_id)
         values ($1)
         on conflict do nothing'
      using v_event.voids_event_id;
    end if;
  end loop;

  -- The aggregate query is dynamic only because pg_temp relations are created
  -- per database session and therefore cannot be resolved by offline function
  -- linters. Every identifier and SQL token is constant; values stay bound.
  execute $totals$
  with counter_definitions as (
    select
      counter.ordinality::integer as counter_order,
      counter.value->>'id' as counter_id,
      case when counter.value->>'scope' = 'game' then 'game' else 'participant' end as counter_scope,
      case
        when counter.value->>'aggregation' in ('latest', 'min', 'max')
          then counter.value->>'aggregation'
        else 'sum'
      end as aggregation,
      case
        when jsonb_typeof(counter.value->'initial') = 'number'
          then (counter.value->>'initial')::numeric
        else 0::numeric
      end as initial_value
    from jsonb_array_elements(
      case
        when jsonb_typeof($1->'counters') = 'array'
          then $1->'counters'
        else '[]'::jsonb
      end
    ) with ordinality as counter(value, ordinality)
    where jsonb_typeof(counter.value) = 'object'
      and nullif(counter.value->>'id', '') is not null
  ), owners as (
    select
      participant.id as participant_id,
      participant.id::text as owner_key,
      participant.seat::integer as owner_order,
      'participant'::text as counter_scope
    from public.gameledger_participants as participant
    where participant.game_id = $2 and participant.owner_id = $3
    union all
    select
      null::uuid,
      '__game__'::text,
      32767,
      'game'::text
    where exists (
      select 1 from counter_definitions where counter_scope = 'game'
    )
  ), owner_counters as (
    select
      owner.participant_id,
      owner.owner_key,
      owner.owner_order,
      counter.counter_order,
      counter.counter_id,
      counter.aggregation,
      counter.initial_value,
      counter.counter_scope
    from owners as owner
    join counter_definitions as counter
      on counter.counter_scope = owner.counter_scope
  ), event_values as (
    select
      event.actor_participant_id,
      event.seq,
      counter.counter_id,
      counter.counter_scope,
      (event.event_data->'values'->>counter.counter_id)::numeric as counter_value
    from public.gameledger_events as event
    join counter_definitions as counter
      on jsonb_typeof(event.event_data->'values'->counter.counter_id) = 'number'
    left join pg_temp.gameledger_ai_suppressed_events as suppressed
      on suppressed.event_id = event.id
    where event.game_id = $2
      and event.owner_id = $3
      and event.event_kind <> 'void'
      and suppressed.event_id is null
      and (counter.counter_scope = 'game' or event.actor_participant_id is not null)
  ), aggregate_values as (
    select
      owner_counter.owner_key,
      owner_counter.participant_id,
      owner_counter.owner_order,
      owner_counter.counter_order,
      owner_counter.counter_id,
      case owner_counter.aggregation
        when 'latest' then coalesce(
          (array_agg(event_value.counter_value order by event_value.seq desc)
            filter (where event_value.counter_value is not null))[1],
          owner_counter.initial_value
        )
        when 'min' then least(
          owner_counter.initial_value,
          coalesce(min(event_value.counter_value), owner_counter.initial_value)
        )
        when 'max' then greatest(
          owner_counter.initial_value,
          coalesce(max(event_value.counter_value), owner_counter.initial_value)
        )
        else owner_counter.initial_value + coalesce(sum(event_value.counter_value), 0)
      end as counter_value
    from owner_counters as owner_counter
    left join event_values as event_value
      on event_value.counter_id = owner_counter.counter_id
      and (
        owner_counter.counter_scope = 'game'
        or event_value.actor_participant_id = owner_counter.participant_id
      )
    group by
      owner_counter.owner_key,
      owner_counter.participant_id,
      owner_counter.owner_order,
      owner_counter.counter_order,
      owner_counter.counter_id,
      owner_counter.aggregation,
      owner_counter.initial_value
  ), values_by_owner as (
    select
      aggregate_value.owner_key,
      jsonb_object_agg(
        aggregate_value.counter_id,
        to_jsonb(aggregate_value.counter_value)
        order by aggregate_value.counter_order
      ) as values
    from aggregate_values as aggregate_value
    group by aggregate_value.owner_key
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'participant_id', owner.participant_id,
    'values', coalesce(values_by_owner.values, '{}'::jsonb)
  ) order by owner.owner_order, owner.owner_key), '[]'::jsonb)
  from owners as owner
  left join values_by_owner on values_by_owner.owner_key = owner.owner_key
  $totals$
  into v_totals
  using v_game.definition, p_game_id, v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', recent.id,
    'owner_id', recent.owner_id,
    'game_id', recent.game_id,
    'actor_participant_id', recent.actor_participant_id,
    'seq', recent.seq,
    'event_kind', recent.event_kind,
    'event_data', recent.compact_event_data,
    'note', recent.compact_note,
    'occurred_at', recent.occurred_at,
    'voids_event_id', recent.voids_event_id,
    'created_at', recent.created_at
  ) order by recent.seq, recent.id), '[]'::jsonb)
  into v_recent_events
  from (
    select
      event.*,
      case
        when octet_length(event.event_data::text) <= 2000 then event.event_data
        when jsonb_typeof(event.event_data->'board_observation') = 'object' then
          jsonb_build_object('board_observation', jsonb_build_object(
            'board_type', event.event_data#>'{board_observation,board_type}',
            'summary', event.event_data#>'{board_observation,summary}'
          ))
        else jsonb_build_object(
          'omitted', 'Large event payload; current totals already include its counter values.'
        )
      end as compact_event_data,
      case when event.note is null then null else left(event.note, 2000) end as compact_note
    from public.gameledger_events as event
    where event.game_id = p_game_id and event.owner_id = v_uid
    order by event.seq desc, event.id desc
    limit 50
  ) as recent;

  return jsonb_build_object(
    'schema_version', 1,
    'game', jsonb_build_object(
      'id', v_game.id,
      'owner_id', v_game.owner_id,
      'profile_id', v_game.profile_id,
      'profile_version', v_game.profile_version,
      'title', v_game.title,
      'definition', v_game.definition,
      'status', v_game.status,
      'location', v_game.location,
      'started_at', v_game.started_at,
      'ended_at', v_game.ended_at,
      'created_at', v_game.created_at,
      'updated_at', v_game.updated_at
    ),
    'participants', v_participants,
    'current_totals', v_totals,
    'recent_events', v_recent_events,
    'last_event_seq', v_last_event_seq,
    'event_count', v_event_count
  );
end
$function$;

comment on function public.gameledger_ai_context(uuid) is
  'Returns exact current counter aggregates and at most 50 compact recent events for one owned game; raw event history never leaves Postgres.';

create or replace function public.gameledger_apply_reviewed_event(
  p_game_id uuid,
  p_expected_last_seq bigint,
  p_expected_game_updated_at timestamptz,
  p_event_id uuid,
  p_source_id uuid,
  p_event_kind text,
  p_actor_participant_id uuid default null,
  p_event_data jsonb default '{}'::jsonb,
  p_note text default null,
  p_occurred_at timestamptz default null,
  p_source_kind text default 'ai.chat',
  p_source_data jsonb default '{}'::jsonb,
  p_media_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_game public.gameledger_games%rowtype;
  v_event public.gameledger_events%rowtype;
  v_source public.gameledger_event_sources%rowtype;
  v_current_seq bigint;
  v_event_data jsonb := coalesce(p_event_data, '{}'::jsonb);
  v_source_data jsonb;
begin
  if v_uid is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if p_expected_last_seq is null or p_expected_last_seq < 0 then
    raise check_violation using message = 'Expected event sequence must be non-negative';
  end if;
  if p_expected_game_updated_at is null then
    raise check_violation using message = 'Expected game updated_at is required';
  end if;
  if p_event_id is null or p_source_id is null then
    raise check_violation using message = 'Reviewed event and source ids are required';
  end if;
  if p_event_kind = 'result' then
    raise check_violation
      using message = 'Use gameledger_apply_reviewed_finish for result events';
  end if;
  if p_source_data is not null and jsonb_typeof(p_source_data) <> 'object' then
    raise check_violation using message = 'Reviewed source data must be a JSON object';
  end if;

  -- Persist the exact review basis and whether the server supplied the event
  -- time. This distinguishes an exact null-time retry from a changed request
  -- even though the canonical event stores a generated timestamp.
  v_source_data := jsonb_set(
    coalesce(p_source_data, '{}'::jsonb),
    '{_gameledger_review}',
    jsonb_build_object(
      'schema_version', 1,
      'expected_last_seq', p_expected_last_seq,
      'expected_game_updated_at', p_expected_game_updated_at,
      'occurred_at_input', to_jsonb(p_occurred_at)
    ),
    true
  );

  -- Lock before looking for an existing event. If two identical first attempts
  -- race, the waiter rechecks after the winner commits and takes the retry path.
  select * into v_game
  from public.gameledger_games
  where id = p_game_id and owner_id = v_uid
  for update;
  if not found then
    raise no_data_found using message = 'Game not found';
  end if;

  select * into v_event
  from public.gameledger_events
  where id = p_event_id
    and game_id = p_game_id
    and owner_id = v_uid;

  if found then
    select * into v_source
    from public.gameledger_event_sources
    where id = p_source_id
      and event_id = p_event_id
      and game_id = p_game_id
      and owner_id = v_uid;

    if not found
      or v_event.seq <> p_expected_last_seq + 1
      or v_event.event_kind is distinct from p_event_kind
      or v_event.actor_participant_id is distinct from p_actor_participant_id
      or v_event.event_data is distinct from v_event_data
      or v_event.note is distinct from p_note
      or v_event.voids_event_id is not null
      or (p_occurred_at is not null and v_event.occurred_at is distinct from p_occurred_at)
      or v_source.source_kind is distinct from p_source_kind
      or v_source.source_data is distinct from v_source_data
      or v_source.media_id is distinct from p_media_id
      or v_source.source_item_index is not null
    then
      raise check_violation
        using message = 'Reviewed event id was already used with different content';
    end if;

    return jsonb_build_object(
      'idempotent', true,
      'event', to_jsonb(v_event),
      'source_id', v_source.id
    );
  end if;

  select coalesce(max(seq), 0)
  into v_current_seq
  from public.gameledger_events
  where game_id = p_game_id and owner_id = v_uid;

  if v_current_seq <> p_expected_last_seq
    or v_game.updated_at is distinct from p_expected_game_updated_at
  then
    raise serialization_failure
      using message = 'Game changed after this proposal was reviewed';
  end if;

  return public.gameledger_append_event(
    p_game_id,
    p_event_id,
    p_event_kind,
    p_actor_participant_id,
    v_event_data,
    p_note,
    p_occurred_at,
    null,
    p_source_id,
    p_source_kind,
    v_source_data,
    p_media_id,
    null
  );
end
$function$;

comment on function public.gameledger_apply_reviewed_event(
  uuid, bigint, timestamptz, uuid, uuid, text, uuid, jsonb, text, timestamptz, text, jsonb, uuid
) is
  'Atomically checks a reviewed sequence/header basis, appends through the generic event writer, and permits only semantically exact retries.';

create or replace function public.gameledger_apply_reviewed_finish(
  p_game_id uuid,
  p_expected_last_seq bigint,
  p_expected_game_updated_at timestamptz,
  p_event_id uuid,
  p_source_id uuid,
  p_result jsonb,
  p_note text default null,
  p_ended_at timestamptz default null,
  p_source_kind text default 'ai.chat',
  p_source_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_game public.gameledger_games%rowtype;
  v_event public.gameledger_events%rowtype;
  v_source public.gameledger_event_sources%rowtype;
  v_current_seq bigint;
  v_result jsonb := p_result;
  v_source_data jsonb;
  v_outcome text;
  v_winner jsonb;
  v_winner_id uuid;
  v_winner_ids uuid[] := array[]::uuid[];
begin
  if v_uid is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if p_expected_last_seq is null or p_expected_last_seq < 0 then
    raise check_violation using message = 'Expected event sequence must be non-negative';
  end if;
  if p_expected_game_updated_at is null then
    raise check_violation using message = 'Expected game updated_at is required';
  end if;
  if p_event_id is null or p_source_id is null then
    raise check_violation using message = 'Reviewed event and source ids are required';
  end if;
  if v_result is null or jsonb_typeof(v_result) <> 'object' then
    raise check_violation using message = 'Result must be a JSON object';
  end if;
  if p_source_data is not null and jsonb_typeof(p_source_data) <> 'object' then
    raise check_violation using message = 'Reviewed source data must be a JSON object';
  end if;

  -- Match gameledger_finish_game's reserved-field normalization so a valid UUID
  -- spelling has the same exact-retry identity as its canonical stored form.
  if v_result ? '_outcome' then
    if jsonb_typeof(v_result->'_outcome') <> 'string' then
      raise check_violation
        using message = 'Reserved result _outcome must be a lowercase slug';
    end if;
    v_outcome := v_result->>'_outcome';
    if v_outcome <> btrim(v_outcome)
      or v_outcome !~ '^[a-z][a-z0-9_.-]{0,63}$'
    then
      raise check_violation
        using message = 'Reserved result _outcome must be a lowercase slug';
    end if;
  end if;

  if v_result ? '_winner_participant_ids' then
    if jsonb_typeof(v_result->'_winner_participant_ids') <> 'array'
      or jsonb_array_length(v_result->'_winner_participant_ids') > 128
    then
      raise check_violation using message =
        'Reserved result _winner_participant_ids must be an array of at most 128 UUID strings';
    end if;

    for v_winner in
      select value
      from jsonb_array_elements(v_result->'_winner_participant_ids')
    loop
      if jsonb_typeof(v_winner) <> 'string' then
        raise check_violation using message =
          'Reserved result _winner_participant_ids must contain only UUID strings';
      end if;
      begin
        v_winner_id := (v_winner #>> '{}')::uuid;
      exception
        when invalid_text_representation then
          raise check_violation using message =
            'Reserved result _winner_participant_ids contains an invalid UUID';
      end;
      if v_winner_id = any(v_winner_ids) then
        raise check_violation using message =
          'Reserved result _winner_participant_ids must not contain duplicates';
      end if;
      v_winner_ids := array_append(v_winner_ids, v_winner_id);
    end loop;

    v_result := jsonb_set(
      v_result,
      '{_winner_participant_ids}',
      to_jsonb(v_winner_ids),
      false
    );
  end if;

  if v_outcome in ('draw', 'abandoned')
    and cardinality(v_winner_ids) <> 0
  then
    raise check_violation
      using message = 'Draw and abandoned results cannot name winners';
  end if;

  v_source_data := jsonb_set(
    coalesce(p_source_data, '{}'::jsonb),
    '{_gameledger_review}',
    jsonb_build_object(
      'schema_version', 1,
      'expected_last_seq', p_expected_last_seq,
      'expected_game_updated_at', p_expected_game_updated_at,
      'ended_at_input', to_jsonb(p_ended_at)
    ),
    true
  );

  select * into v_game
  from public.gameledger_games
  where id = p_game_id and owner_id = v_uid
  for update;
  if not found then
    raise no_data_found using message = 'Game not found';
  end if;

  select * into v_event
  from public.gameledger_events
  where id = p_event_id
    and game_id = p_game_id
    and owner_id = v_uid;

  if found then
    select * into v_source
    from public.gameledger_event_sources
    where id = p_source_id
      and event_id = p_event_id
      and game_id = p_game_id
      and owner_id = v_uid;

    if not found
      or v_event.seq <> p_expected_last_seq + 1
      or v_event.event_kind <> 'result'
      or v_event.actor_participant_id is not null
      or v_event.event_data is distinct from v_result
      or v_event.note is distinct from p_note
      or v_event.voids_event_id is not null
      or (p_ended_at is not null and v_event.occurred_at is distinct from p_ended_at)
      or v_source.source_kind is distinct from p_source_kind
      or v_source.source_data is distinct from v_source_data
      or v_source.media_id is not null
      or v_source.source_item_index is not null
      or v_game.status <> 'complete'
      or v_game.ended_at is distinct from v_event.occurred_at
    then
      raise check_violation
        using message = 'Reviewed result event id was already used with different content';
    end if;

    return jsonb_build_object(
      'idempotent', true,
      'event', to_jsonb(v_event),
      'source_id', v_source.id,
      'game', to_jsonb(v_game)
    );
  end if;

  select coalesce(max(seq), 0)
  into v_current_seq
  from public.gameledger_events
  where game_id = p_game_id and owner_id = v_uid;

  if v_current_seq <> p_expected_last_seq
    or v_game.updated_at is distinct from p_expected_game_updated_at
  then
    raise serialization_failure
      using message = 'Game changed after this proposal was reviewed';
  end if;

  return public.gameledger_finish_game(
    p_game_id,
    p_event_id,
    v_result,
    p_note,
    p_ended_at,
    p_source_id,
    p_source_kind,
    v_source_data,
    null,
    null
  );
end
$function$;

comment on function public.gameledger_apply_reviewed_finish(
  uuid, bigint, timestamptz, uuid, uuid, jsonb, text, timestamptz, text, jsonb
) is
  'Atomically checks a reviewed sequence/header basis, finishes through the generic writer, and permits only exact reviewed-result retries.';

revoke all on function public.gameledger_ai_context(uuid)
from public, anon, authenticated;
grant execute on function public.gameledger_ai_context(uuid)
to authenticated;

revoke all on function public.gameledger_apply_reviewed_event(
  uuid, bigint, timestamptz, uuid, uuid, text, uuid, jsonb, text, timestamptz, text, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.gameledger_apply_reviewed_event(
  uuid, bigint, timestamptz, uuid, uuid, text, uuid, jsonb, text, timestamptz, text, jsonb, uuid
) to authenticated;

revoke all on function public.gameledger_apply_reviewed_finish(
  uuid, bigint, timestamptz, uuid, uuid, jsonb, text, timestamptz, text, jsonb
) from public, anon, authenticated;
grant execute on function public.gameledger_apply_reviewed_finish(
  uuid, bigint, timestamptz, uuid, uuid, jsonb, text, timestamptz, text, jsonb
) to authenticated;
