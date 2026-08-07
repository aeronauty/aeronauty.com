-- Tile Tally: additive, account-isolated scorekeeping schema.
--
-- This migration deliberately keeps every scoring event as a turn row. Totals are
-- derived by a security-invoker view; they are never persisted in place of turns.
-- All object names are namespaced so this can share the existing Aeronauty project.

begin;

create table if not exists public.tiletally_players (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint tiletally_players_name_check
    check (char_length(btrim(name)) between 1 and 80),
  constraint tiletally_players_id_owner_unique unique (id, owner_id)
);

comment on table public.tiletally_players is
  'Named scorekeeping entities owned by one authenticated account; players are not auth users.';
comment on column public.tiletally_players.owner_id is
  'Supabase auth user that exclusively owns this player.';

-- Preserve friendly, case-insensitive uniqueness without requiring the citext extension.
create unique index if not exists tiletally_players_owner_lower_name_unique
  on public.tiletally_players (owner_id, lower(btrim(name)));
create index if not exists tiletally_players_owner_created_idx
  on public.tiletally_players (owner_id, created_at);

create table if not exists public.tiletally_games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  played_on date not null default current_date,
  location text,
  status text not null default 'in_progress',
  source text not null default 'manual',
  source_detail jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint tiletally_games_status_check
    check (status in ('in_progress', 'complete')),
  constraint tiletally_games_source_check
    check (source in ('manual', 'chat', 'voice', 'photo')),
  constraint tiletally_games_location_check
    check (location is null or char_length(btrim(location)) between 1 and 200),
  constraint tiletally_games_source_detail_check
    check (source_detail is null or jsonb_typeof(source_detail) = 'object'),
  constraint tiletally_games_completion_check
    check (
      (status = 'complete' and completed_at is not null)
      or (status = 'in_progress' and completed_at is null)
    ),
  constraint tiletally_games_id_owner_unique unique (id, owner_id)
);

comment on table public.tiletally_games is
  'Game headers. Scores remain normalized in tiletally_turns.';
comment on column public.tiletally_games.source_detail is
  'Raw-source metadata such as an original message, transcript, photo id, and ingest event id.';

create index if not exists tiletally_games_owner_played_idx
  on public.tiletally_games (owner_id, played_on desc, created_at desc);
create index if not exists tiletally_games_owner_status_idx
  on public.tiletally_games (owner_id, status, created_at desc);

-- Explicit membership makes participant order stable and lets foreign keys prove that
-- every turn's player actually belongs to its game.
create table if not exists public.tiletally_game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null,
  player_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  seat smallint not null,
  created_at timestamptz not null default now(),
  constraint tiletally_game_players_game_owner_fk
    foreign key (game_id, owner_id)
    references public.tiletally_games (id, owner_id)
    on delete cascade,
  constraint tiletally_game_players_player_owner_fk
    foreign key (player_id, owner_id)
    references public.tiletally_players (id, owner_id)
    on delete no action
    deferrable initially deferred,
  constraint tiletally_game_players_seat_check check (seat between 1 and 16),
  constraint tiletally_game_players_game_player_unique unique (game_id, player_id),
  constraint tiletally_game_players_game_seat_unique unique (game_id, seat)
);

comment on table public.tiletally_game_players is
  'Ordered player membership for each game; ownership is repeated for strict composite foreign keys and RLS.';

create index if not exists tiletally_game_players_owner_player_idx
  on public.tiletally_game_players (owner_id, player_id, game_id);

create table if not exists public.tiletally_score_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  game_id uuid,
  storage_path text not null,
  extracted_json jsonb,
  created_at timestamptz not null default now(),
  constraint tiletally_score_photos_game_owner_fk
    foreign key (game_id, owner_id)
    references public.tiletally_games (id, owner_id)
    on delete no action
    deferrable initially deferred,
  constraint tiletally_score_photos_path_unique unique (storage_path),
  constraint tiletally_score_photos_id_owner_unique unique (id, owner_id),
  constraint tiletally_score_photos_path_check
    check (
      storage_path = btrim(storage_path)
      and char_length(storage_path) between 38 and 1024
      and storage_path like owner_id::text || '/%'
      and position('..' in storage_path) = 0
    ),
  constraint tiletally_score_photos_extracted_check
    check (
      extracted_json is null
      or jsonb_typeof(extracted_json) in ('object', 'array')
    )
);

comment on table public.tiletally_score_photos is
  'Permanent provenance records for original score-sheet photos and their editable extraction.';
comment on column public.tiletally_score_photos.storage_path is
  'Private Storage object path, required to begin with the owning auth uid.';

create index if not exists tiletally_score_photos_owner_created_idx
  on public.tiletally_score_photos (owner_id, created_at desc);
create index if not exists tiletally_score_photos_game_idx
  on public.tiletally_score_photos (game_id) where game_id is not null;

create table if not exists public.tiletally_ingest_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  status text not null default 'pending',
  raw_input text,
  photo_id uuid,
  model text,
  input_tokens integer,
  output_tokens integer,
  proposed_action jsonb,
  game_id uuid,
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  constraint tiletally_ingest_events_kind_check
    check (kind in ('chat', 'voice', 'photo')),
  constraint tiletally_ingest_events_status_check
    check (status in ('pending', 'committed', 'rejected', 'failed', 'answered')),
  constraint tiletally_ingest_events_raw_check
    check (
      raw_input is null
      or char_length(btrim(raw_input)) between 1 and 20000
    ),
  constraint tiletally_ingest_events_input_tokens_check
    check (input_tokens is null or input_tokens between 0 and 1000000),
  constraint tiletally_ingest_events_output_tokens_check
    check (output_tokens is null or output_tokens between 0 and 1000000),
  constraint tiletally_ingest_events_model_check
    check (model is null or char_length(btrim(model)) between 1 and 200),
  constraint tiletally_ingest_events_action_check
    check (
      (
        status in ('pending', 'committed', 'rejected')
        and jsonb_typeof(proposed_action) = 'object'
        and proposed_action->>'type' in ('log_game', 'add_turn', 'finish_game')
        and jsonb_typeof(proposed_action->'payload') = 'object'
      )
      or (status in ('failed', 'answered') and proposed_action is null)
    ),
  constraint tiletally_ingest_events_kind_source_check
    check (
      (kind in ('chat', 'voice') and raw_input is not null and photo_id is null)
      or (kind = 'photo' and photo_id is not null)
    ),
  constraint tiletally_ingest_events_commit_state_check
    check (
      (status = 'committed' and committed_at is not null and game_id is not null)
      or (
        status in ('pending', 'rejected', 'failed', 'answered')
        and committed_at is null
        and game_id is null
      )
    ),
  constraint tiletally_ingest_events_photo_owner_fk
    foreign key (photo_id, owner_id)
    references public.tiletally_score_photos (id, owner_id)
    on delete no action
    deferrable initially deferred,
  constraint tiletally_ingest_events_game_owner_fk
    foreign key (game_id, owner_id)
    references public.tiletally_games (id, owner_id)
    on delete no action
    deferrable initially deferred,
  constraint tiletally_ingest_events_id_owner_unique unique (id, owner_id)
);

comment on table public.tiletally_ingest_events is
  'Immutable-after-commit provenance envelope for AI-assisted input, preview, model usage, and committed game.';
comment on column public.tiletally_ingest_events.proposed_action is
  'Confirmed-action candidate shaped as {type: log_game|add_turn|finish_game, payload: {...}}.';

create index if not exists tiletally_ingest_events_owner_created_idx
  on public.tiletally_ingest_events (owner_id, created_at desc);
create index if not exists tiletally_ingest_events_owner_status_idx
  on public.tiletally_ingest_events (owner_id, status, created_at desc);
create index if not exists tiletally_ingest_events_photo_idx
  on public.tiletally_ingest_events (photo_id) where photo_id is not null;

-- Complete the intentional game <-> ingest provenance link after both tables exist.
alter table public.tiletally_games
  add column if not exists ingest_event_id uuid;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tiletally_games_ingest_owner_fk'
      and conrelid = 'public.tiletally_games'::regclass
  ) then
    alter table public.tiletally_games
      add constraint tiletally_games_ingest_owner_fk
      foreign key (ingest_event_id, owner_id)
      references public.tiletally_ingest_events (id, owner_id)
      on delete no action
      deferrable initially deferred;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tiletally_games_source_ingest_check'
      and conrelid = 'public.tiletally_games'::regclass
  ) then
    alter table public.tiletally_games
      add constraint tiletally_games_source_ingest_check
      check (
        (source = 'manual' and ingest_event_id is null)
        or (source in ('chat', 'voice', 'photo') and ingest_event_id is not null)
      );
  end if;
end
$migration$;

create unique index if not exists tiletally_games_ingest_event_unique
  on public.tiletally_games (ingest_event_id)
  where ingest_event_id is not null;

create table if not exists public.tiletally_turns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  game_id uuid not null,
  player_id uuid not null,
  seq integer not null,
  score integer not null,
  word text,
  is_bingo boolean not null default false,
  kind text not null default 'play',
  source text not null default 'manual',
  source_detail jsonb,
  ingest_event_id uuid,
  source_item_index integer,
  score_photo_id uuid,
  created_at timestamptz not null default now(),
  constraint tiletally_turns_game_owner_fk
    foreign key (game_id, owner_id)
    references public.tiletally_games (id, owner_id)
    on delete cascade,
  constraint tiletally_turns_game_player_fk
    foreign key (game_id, player_id)
    references public.tiletally_game_players (game_id, player_id)
    on delete no action
    deferrable initially deferred,
  constraint tiletally_turns_ingest_owner_fk
    foreign key (ingest_event_id, owner_id)
    references public.tiletally_ingest_events (id, owner_id)
    on delete no action
    deferrable initially deferred,
  constraint tiletally_turns_photo_owner_fk
    foreign key (score_photo_id, owner_id)
    references public.tiletally_score_photos (id, owner_id)
    on delete no action
    deferrable initially deferred,
  constraint tiletally_turns_game_seq_unique unique (game_id, seq),
  constraint tiletally_turns_seq_check check (seq > 0),
  constraint tiletally_turns_score_check check (score between -1000000 and 1000000),
  constraint tiletally_turns_word_check
    check (word is null or char_length(btrim(word)) between 1 and 100),
  constraint tiletally_turns_kind_check
    check (kind in ('play', 'adjustment')),
  constraint tiletally_turns_adjustment_check
    check (kind <> 'adjustment' or (word is null and is_bingo = false)),
  constraint tiletally_turns_source_check
    check (source in ('manual', 'chat', 'voice', 'photo')),
  constraint tiletally_turns_source_detail_check
    check (source_detail is null or jsonb_typeof(source_detail) = 'object'),
  constraint tiletally_turns_provenance_check
    check (
      (
        source = 'manual'
        and ingest_event_id is null
        and source_item_index is null
        and score_photo_id is null
      )
      or (
        source in ('chat', 'voice', 'photo')
        and ingest_event_id is not null
        and source_item_index is not null
        and source_item_index >= 0
      )
    ),
  constraint tiletally_turns_photo_source_check
    check (
      (source = 'photo' and score_photo_id is not null)
      or (source <> 'photo' and score_photo_id is null)
    )
);

comment on table public.tiletally_turns is
  'Canonical turn-level ledger: every play and end-game adjustment is one row.';
comment on column public.tiletally_turns.source_item_index is
  'Stable position inside an ingest event, supporting atomic retry/idempotency without flattening turns.';

create index if not exists tiletally_turns_game_seq_idx
  on public.tiletally_turns (game_id, seq);
create index if not exists tiletally_turns_owner_player_created_idx
  on public.tiletally_turns (owner_id, player_id, created_at desc);
create index if not exists tiletally_turns_ingest_idx
  on public.tiletally_turns (ingest_event_id) where ingest_event_id is not null;
create unique index if not exists tiletally_turns_ingest_item_unique
  on public.tiletally_turns (ingest_event_id, source_item_index)
  where ingest_event_id is not null;

-- security_invoker is essential: an ordinary owner-created view can otherwise bypass
-- the underlying tables' RLS. This view remains a derived convenience only.
create or replace view public.tiletally_game_totals
with (security_invoker = true)
as
select
  g.id as game_id,
  g.owner_id,
  g.played_on,
  g.status,
  gp.player_id,
  p.name as player_name,
  coalesce(sum(t.score), 0)::bigint as total,
  count(t.id)::bigint as turn_count,
  count(t.id) filter (where t.is_bingo)::bigint as bingo_count
from public.tiletally_games as g
join public.tiletally_game_players as gp
  on gp.game_id = g.id and gp.owner_id = g.owner_id
join public.tiletally_players as p
  on p.id = gp.player_id and p.owner_id = g.owner_id
left join public.tiletally_turns as t
  on t.game_id = g.id
  and t.player_id = gp.player_id
  and t.owner_id = g.owner_id
group by g.id, g.owner_id, g.played_on, g.status, gp.player_id, p.name;

comment on view public.tiletally_game_totals is
  'RLS-respecting derived totals; every value is recomputed from tiletally_turns.';

-- Enable and force RLS on every application table. FORCE also prevents accidental
-- table-owner bypass; Supabase service-role access remains explicitly privileged.
alter table public.tiletally_players enable row level security;
alter table public.tiletally_players force row level security;
alter table public.tiletally_games enable row level security;
alter table public.tiletally_games force row level security;
alter table public.tiletally_game_players enable row level security;
alter table public.tiletally_game_players force row level security;
alter table public.tiletally_turns enable row level security;
alter table public.tiletally_turns force row level security;
alter table public.tiletally_score_photos enable row level security;
alter table public.tiletally_score_photos force row level security;
alter table public.tiletally_ingest_events enable row level security;
alter table public.tiletally_ingest_events force row level security;

-- Idempotently create owner policies without replacing any pre-existing policy.
do $policies$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tiletally_players'
      and policyname = 'tiletally_players_owner_all'
  ) then
    create policy tiletally_players_owner_all
      on public.tiletally_players for all to authenticated
      using (owner_id = (select auth.uid()))
      with check (owner_id = (select auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tiletally_games'
      and policyname = 'tiletally_games_owner_all'
  ) then
    create policy tiletally_games_owner_all
      on public.tiletally_games for all to authenticated
      using (owner_id = (select auth.uid()))
      with check (owner_id = (select auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tiletally_game_players'
      and policyname = 'tiletally_game_players_owner_all'
  ) then
    create policy tiletally_game_players_owner_all
      on public.tiletally_game_players for all to authenticated
      using (owner_id = (select auth.uid()))
      with check (owner_id = (select auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tiletally_turns'
      and policyname = 'tiletally_turns_owner_all'
  ) then
    create policy tiletally_turns_owner_all
      on public.tiletally_turns for all to authenticated
      using (owner_id = (select auth.uid()))
      with check (owner_id = (select auth.uid()));
  end if;

  -- Original photos are provenance. Owners may read, insert, and correct metadata,
  -- but there is intentionally no DELETE policy.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tiletally_score_photos'
      and policyname = 'tiletally_score_photos_owner_select'
  ) then
    create policy tiletally_score_photos_owner_select
      on public.tiletally_score_photos for select to authenticated
      using (owner_id = (select auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tiletally_score_photos'
      and policyname = 'tiletally_score_photos_owner_insert'
  ) then
    create policy tiletally_score_photos_owner_insert
      on public.tiletally_score_photos for insert to authenticated
      with check (owner_id = (select auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tiletally_score_photos'
      and policyname = 'tiletally_score_photos_owner_update'
  ) then
    create policy tiletally_score_photos_owner_update
      on public.tiletally_score_photos for update to authenticated
      using (owner_id = (select auth.uid()))
      with check (owner_id = (select auth.uid()));
  end if;

  -- Only a pending row may transition. Once it becomes committed or answered it is
  -- immutable through the authenticated API, preserving model/raw-input provenance.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tiletally_ingest_events'
      and policyname = 'tiletally_ingest_events_owner_select'
  ) then
    create policy tiletally_ingest_events_owner_select
      on public.tiletally_ingest_events for select to authenticated
      using (owner_id = (select auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tiletally_ingest_events'
      and policyname = 'tiletally_ingest_events_owner_insert'
  ) then
    create policy tiletally_ingest_events_owner_insert
      on public.tiletally_ingest_events for insert to authenticated
      with check (owner_id = (select auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tiletally_ingest_events'
      and policyname = 'tiletally_ingest_events_pending_update'
  ) then
    create policy tiletally_ingest_events_pending_update
      on public.tiletally_ingest_events for update to authenticated
      using (
        owner_id = (select auth.uid())
        and status = 'pending'
      )
      with check (owner_id = (select auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tiletally_ingest_events'
      and policyname = 'tiletally_ingest_events_unresolved_delete'
  ) then
    create policy tiletally_ingest_events_unresolved_delete
      on public.tiletally_ingest_events for delete to authenticated
      using (
        owner_id = (select auth.uid())
        and status in ('pending', 'rejected', 'failed')
      );
  end if;
end
$policies$;

-- Commit a previously previewed and explicitly confirmed AI action atomically.
-- The function is SECURITY INVOKER: caller grants and RLS remain authoritative.
create or replace function public.tiletally_commit_ingest_event(
  p_event_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_event public.tiletally_ingest_events%rowtype;
  v_action_type text;
  v_payload jsonb;
  v_item jsonb;
  v_items jsonb;
  v_player_name text;
  v_player_id uuid;
  v_game_id uuid;
  v_game_status text;
  v_played_on date;
  v_location text;
  v_seq integer := 0;
  v_seat integer := 0;
  v_source_item integer := 0;
  v_created_turns integer := 0;
  v_word text;
  v_score integer;
  v_is_bingo boolean;
  v_source_detail jsonb;
begin
  if v_uid is null then
    raise exception using
      errcode = '42501',
      message = 'Tile Tally ingest commits require an authenticated user';
  end if;

  select *
  into v_event
  from public.tiletally_ingest_events
  where id = p_event_id and owner_id = v_uid
  for update;

  -- FOR UPDATE also evaluates the UPDATE policy. A committed row is therefore
  -- intentionally hidden by the pending-only policy, so retry with a read-only
  -- owner-scoped lookup before deciding that the event does not exist. This makes
  -- successful retries idempotent while keeping other users' events invisible.
  if not found then
    select *
    into v_event
    from public.tiletally_ingest_events
    where id = p_event_id and owner_id = v_uid;
  end if;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Tile Tally ingest event not found';
  end if;

  -- A retry after a successful response is a read-only success, not a duplicate write.
  if v_event.status = 'committed' then
    return jsonb_build_object(
      'status', 'committed',
      'type', v_event.proposed_action->>'type',
      'game_id', v_event.game_id,
      'idempotent', true
    );
  end if;

  if v_event.status <> 'pending' then
    raise exception 'Only pending Tile Tally ingest events can be committed';
  end if;

  v_action_type := v_event.proposed_action->>'type';
  v_payload := v_event.proposed_action->'payload';
  v_source_detail := jsonb_strip_nulls(jsonb_build_object(
    'ingest_event_id', v_event.id,
    'raw_input', v_event.raw_input,
    'photo_id', v_event.photo_id
  ));

  if v_action_type = 'log_game' then
    if jsonb_typeof(v_payload->'players') <> 'array'
      or jsonb_array_length(v_payload->'players') not between 1 and 16 then
      raise exception 'log_game.payload.players must contain between 1 and 16 names';
    end if;

    v_items := coalesce(v_payload->'turns', '[]'::jsonb);
    if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 2000 then
      raise exception 'log_game.payload.turns must be an array of at most 2000 items';
    end if;
    if jsonb_typeof(coalesce(v_payload->'adjustments', '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(v_payload->'adjustments', '[]'::jsonb)) > 32 then
      raise exception 'log_game.payload.adjustments must be an array of at most 32 items';
    end if;

    v_game_status := coalesce(nullif(v_payload->>'status', ''), 'in_progress');
    if v_game_status not in ('in_progress', 'complete') then
      raise exception 'log_game.payload.status is invalid';
    end if;
    v_played_on := coalesce((nullif(v_payload->>'played_on', ''))::date, current_date);
    v_location := nullif(btrim(v_payload->>'location'), '');

    insert into public.tiletally_games (
      owner_id, played_on, location, status, source, source_detail,
      ingest_event_id, completed_at
    ) values (
      v_uid, v_played_on, v_location, v_game_status, v_event.kind,
      v_source_detail, v_event.id,
      case when v_game_status = 'complete' then now() else null end
    )
    returning id into v_game_id;

    for v_player_name in
      select value from jsonb_array_elements_text(v_payload->'players')
    loop
      v_player_name := btrim(v_player_name);
      if char_length(v_player_name) not between 1 and 80 then
        raise exception 'Every log_game player needs a name between 1 and 80 characters';
      end if;

      select id into v_player_id
      from public.tiletally_players
      where owner_id = v_uid and lower(btrim(name)) = lower(v_player_name)
      order by created_at
      limit 1;

      if v_player_id is null then
        insert into public.tiletally_players (owner_id, name)
        values (v_uid, v_player_name)
        on conflict do nothing
        returning id into v_player_id;

        if v_player_id is null then
          select id into v_player_id
          from public.tiletally_players
          where owner_id = v_uid and lower(btrim(name)) = lower(v_player_name)
          order by created_at
          limit 1;
        end if;
      end if;

      v_seat := v_seat + 1;
      insert into public.tiletally_game_players (game_id, player_id, owner_id, seat)
      values (v_game_id, v_player_id, v_uid, v_seat);
    end loop;

    for v_item in select value from jsonb_array_elements(v_items)
    loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'Every log_game turn must be an object';
      end if;
      v_player_name := btrim(v_item->>'player');
      select p.id into v_player_id
      from public.tiletally_players as p
      join public.tiletally_game_players as gp
        on gp.player_id = p.id and gp.owner_id = p.owner_id
      where gp.game_id = v_game_id
        and p.owner_id = v_uid
        and lower(btrim(p.name)) = lower(v_player_name)
      limit 1;
      if v_player_id is null then
        raise exception 'Turn player "%" is not a member of this game', v_player_name;
      end if;
      if coalesce(v_item->>'score', '') !~ '^-?[0-9]+$' then
        raise exception 'Every log_game turn score must be an integer';
      end if;

      v_score := (v_item->>'score')::integer;
      v_word := nullif(btrim(v_item->>'word'), '');
      v_is_bingo := coalesce((v_item->>'is_bingo')::boolean, false);
      if v_score < 0 and (v_word is not null or v_is_bingo) then
        raise exception 'Negative log_game corrections cannot include a word or bingo flag';
      end if;
      v_seq := v_seq + 1;
      insert into public.tiletally_turns (
        owner_id, game_id, player_id, seq, score, word, is_bingo, kind,
        source, source_detail, ingest_event_id, source_item_index, score_photo_id
      ) values (
        v_uid, v_game_id, v_player_id, v_seq, v_score, v_word, v_is_bingo,
        case when v_score < 0 then 'adjustment' else 'play' end,
        v_event.kind, v_source_detail, v_event.id, v_source_item, v_event.photo_id
      );
      v_source_item := v_source_item + 1;
      v_created_turns := v_created_turns + 1;
    end loop;

    for v_item in
      select value from jsonb_array_elements(coalesce(v_payload->'adjustments', '[]'::jsonb))
    loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'Every log_game adjustment must be an object';
      end if;
      v_player_name := btrim(v_item->>'player');
      select p.id into v_player_id
      from public.tiletally_players as p
      join public.tiletally_game_players as gp
        on gp.player_id = p.id and gp.owner_id = p.owner_id
      where gp.game_id = v_game_id
        and p.owner_id = v_uid
        and lower(btrim(p.name)) = lower(v_player_name)
      limit 1;
      if v_player_id is null then
        raise exception 'Adjustment player "%" is not a member of this game', v_player_name;
      end if;
      if coalesce(v_item->>'points', '') !~ '^-?[0-9]+$' then
        raise exception 'Every log_game adjustment must have integer points';
      end if;

      v_seq := v_seq + 1;
      insert into public.tiletally_turns (
        owner_id, game_id, player_id, seq, score, kind, source, source_detail,
        ingest_event_id, source_item_index, score_photo_id
      ) values (
        v_uid, v_game_id, v_player_id, v_seq, (v_item->>'points')::integer,
        'adjustment', v_event.kind, v_source_detail, v_event.id,
        v_source_item, v_event.photo_id
      );
      v_source_item := v_source_item + 1;
      v_created_turns := v_created_turns + 1;
    end loop;

    if v_created_turns = 0 then
      raise exception 'log_game must contain at least one turn or adjustment';
    end if;

  elsif v_action_type = 'add_turn' then
    if coalesce(v_payload->>'game_ref', '') = '' then
      raise exception 'add_turn.payload.game_ref is required';
    end if;

    select id, status into v_game_id, v_game_status
    from public.tiletally_games
    where id = (v_payload->>'game_ref')::uuid and owner_id = v_uid
    for update;
    if not found then
      raise exception 'Tile Tally game not found';
    end if;
    if v_game_status <> 'in_progress' then
      raise exception 'Turns can only be added to an in-progress game';
    end if;

    v_player_name := btrim(v_payload->>'player');
    select p.id into v_player_id
    from public.tiletally_players as p
    join public.tiletally_game_players as gp
      on gp.player_id = p.id and gp.owner_id = p.owner_id
    where gp.game_id = v_game_id
      and p.owner_id = v_uid
      and lower(btrim(p.name)) = lower(v_player_name)
    limit 1;
    if v_player_id is null then
      raise exception 'add_turn player "%" is not a member of this game', v_player_name;
    end if;
    if coalesce(v_payload->>'score', '') !~ '^-?[0-9]+$' then
      raise exception 'add_turn.payload.score must be an integer';
    end if;

    select coalesce(max(seq), 0) + 1 into v_seq
    from public.tiletally_turns where game_id = v_game_id;
    v_score := (v_payload->>'score')::integer;
    v_word := nullif(btrim(v_payload->>'word'), '');
    v_is_bingo := coalesce((v_payload->>'is_bingo')::boolean, false);
    if v_score < 0 and (v_word is not null or v_is_bingo) then
      raise exception 'Negative add_turn corrections cannot include a word or bingo flag';
    end if;
    insert into public.tiletally_turns (
      owner_id, game_id, player_id, seq, score, word, is_bingo, kind,
      source, source_detail, ingest_event_id, source_item_index, score_photo_id
    ) values (
      v_uid, v_game_id, v_player_id, v_seq, v_score,
      v_word, v_is_bingo, case when v_score < 0 then 'adjustment' else 'play' end,
      v_event.kind, v_source_detail,
      v_event.id, 0, v_event.photo_id
    );
    v_created_turns := 1;

  elsif v_action_type = 'finish_game' then
    if coalesce(v_payload->>'game_ref', '') = '' then
      raise exception 'finish_game.payload.game_ref is required';
    end if;

    select id, status into v_game_id, v_game_status
    from public.tiletally_games
    where id = (v_payload->>'game_ref')::uuid and owner_id = v_uid
    for update;
    if not found then
      raise exception 'Tile Tally game not found';
    end if;
    if v_game_status <> 'in_progress' then
      raise exception 'Only an in-progress game can be finished';
    end if;

    v_items := coalesce(v_payload->'adjustments', '[]'::jsonb);
    if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 32 then
      raise exception 'finish_game.payload.adjustments must be an array of at most 32 items';
    end if;
    select coalesce(max(seq), 0) into v_seq
    from public.tiletally_turns where game_id = v_game_id;

    for v_item in select value from jsonb_array_elements(v_items)
    loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'Every finish_game adjustment must be an object';
      end if;
      v_player_name := btrim(v_item->>'player');
      select p.id into v_player_id
      from public.tiletally_players as p
      join public.tiletally_game_players as gp
        on gp.player_id = p.id and gp.owner_id = p.owner_id
      where gp.game_id = v_game_id
        and p.owner_id = v_uid
        and lower(btrim(p.name)) = lower(v_player_name)
      limit 1;
      if v_player_id is null then
        raise exception 'finish_game player "%" is not a member of this game', v_player_name;
      end if;
      if coalesce(v_item->>'points', '') !~ '^-?[0-9]+$' then
        raise exception 'Every finish_game adjustment must have integer points';
      end if;

      v_seq := v_seq + 1;
      insert into public.tiletally_turns (
        owner_id, game_id, player_id, seq, score, kind, source, source_detail,
        ingest_event_id, source_item_index, score_photo_id
      ) values (
        v_uid, v_game_id, v_player_id, v_seq, (v_item->>'points')::integer,
        'adjustment', v_event.kind, v_source_detail, v_event.id,
        v_source_item, v_event.photo_id
      );
      v_source_item := v_source_item + 1;
      v_created_turns := v_created_turns + 1;
    end loop;

    update public.tiletally_games
    set status = 'complete',
        completed_at = now(),
        source_detail = coalesce(source_detail, '{}'::jsonb)
          || jsonb_build_object('completion_ingest_event_id', v_event.id)
    where id = v_game_id and owner_id = v_uid;
  else
    raise exception 'Unsupported Tile Tally ingest action type: %', v_action_type;
  end if;

  if v_event.kind = 'photo' then
    update public.tiletally_score_photos
    set game_id = v_game_id
    where id = v_event.photo_id
      and owner_id = v_uid
      and (game_id is null or game_id = v_game_id);
    if not found then
      raise exception 'Score photo is already linked to a different game';
    end if;
  end if;

  update public.tiletally_ingest_events
  set status = 'committed',
      game_id = v_game_id,
      committed_at = now()
  where id = v_event.id and owner_id = v_uid and status = 'pending';

  if not found then
    raise exception 'Tile Tally ingest event changed while it was being committed';
  end if;

  return jsonb_build_object(
    'status', 'committed',
    'type', v_action_type,
    'game_id', v_game_id,
    'turns_created', v_created_turns,
    'idempotent', false
  );
end
$function$;

comment on function public.tiletally_commit_ingest_event(uuid) is
  'Atomically commits one confirmed pending action under auth.uid() and returns an idempotent result on retry.';

-- Manual scoring uses an RPC so game locking and next-sequence allocation happen in
-- one transaction. Supplying the same p_turn_id makes a network retry idempotent.
create or replace function public.tiletally_add_turn(
  p_game_id uuid,
  p_player_id uuid,
  p_score integer,
  p_word text default null,
  p_is_bingo boolean default false,
  p_turn_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_game_status text;
  v_seq integer;
  v_word text := nullif(btrim(p_word), '');
  v_kind text := case when p_score < 0 then 'adjustment' else 'play' end;
  v_existing public.tiletally_turns%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Tile Tally writes require an authenticated user';
  end if;
  if p_turn_id is null then
    raise exception 'p_turn_id cannot be null';
  end if;
  if v_kind = 'adjustment' and (v_word is not null or p_is_bingo) then
    raise exception 'Manual corrections cannot include a word or bingo flag';
  end if;

  select * into v_existing
  from public.tiletally_turns
  where id = p_turn_id and owner_id = v_uid;

  if found then
    if v_existing.game_id <> p_game_id
      or v_existing.player_id <> p_player_id
      or v_existing.score <> p_score
      or v_existing.word is distinct from v_word
      or v_existing.is_bingo <> p_is_bingo
      or v_existing.kind <> v_kind
      or v_existing.source <> 'manual' then
      raise exception 'p_turn_id already belongs to a different turn';
    end if;
    return jsonb_build_object(
      'turn_id', v_existing.id,
      'game_id', v_existing.game_id,
      'seq', v_existing.seq,
      'idempotent', true
    );
  end if;

  select status into v_game_status
  from public.tiletally_games
  where id = p_game_id and owner_id = v_uid
  for update;
  if not found then
    raise exception 'Tile Tally game not found';
  end if;
  if v_game_status <> 'in_progress' then
    raise exception 'Turns can only be added to an in-progress game';
  end if;

  if not exists (
    select 1 from public.tiletally_game_players
    where game_id = p_game_id and player_id = p_player_id and owner_id = v_uid
  ) then
    raise exception 'Player is not a member of this game';
  end if;

  select coalesce(max(seq), 0) + 1 into v_seq
  from public.tiletally_turns
  where game_id = p_game_id and owner_id = v_uid;

  insert into public.tiletally_turns (
    id, owner_id, game_id, player_id, seq, score, word, is_bingo,
    kind, source
  ) values (
    p_turn_id, v_uid, p_game_id, p_player_id, v_seq, p_score, v_word,
    p_is_bingo, v_kind, 'manual'
  );

  return jsonb_build_object(
    'turn_id', p_turn_id,
    'game_id', p_game_id,
    'seq', v_seq,
    'idempotent', false
  );
end
$function$;

comment on function public.tiletally_add_turn(uuid, uuid, integer, text, boolean, uuid) is
  'Adds one manual turn with game-level serialization; reuse p_turn_id for idempotent retries.';

-- Final scoring adjustments and the status transition must either all commit or all
-- roll back. A retry after completion returns success without duplicating adjustments.
create or replace function public.tiletally_finish_game(
  p_game_id uuid,
  p_adjustments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_game_status text;
  v_item jsonb;
  v_player_id uuid;
  v_seq integer;
  v_created integer := 0;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Tile Tally writes require an authenticated user';
  end if;

  select status into v_game_status
  from public.tiletally_games
  where id = p_game_id and owner_id = v_uid
  for update;
  if not found then
    raise exception 'Tile Tally game not found';
  end if;

  if v_game_status = 'complete' then
    return jsonb_build_object(
      'game_id', p_game_id,
      'status', 'complete',
      'adjustments_created', 0,
      'idempotent', true
    );
  end if;

  if jsonb_typeof(p_adjustments) <> 'array'
    or jsonb_array_length(p_adjustments) > 32 then
    raise exception 'p_adjustments must be an array of at most 32 items';
  end if;

  select coalesce(max(seq), 0) into v_seq
  from public.tiletally_turns
  where game_id = p_game_id and owner_id = v_uid;

  for v_item in select value from jsonb_array_elements(p_adjustments)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or coalesce(v_item->>'player_id', '') = '' then
      raise exception 'Every adjustment requires player_id and integer points';
    end if;
    if coalesce(v_item->>'points', '') !~ '^-?[0-9]+$' then
      raise exception 'Every adjustment requires integer points';
    end if;

    v_player_id := (v_item->>'player_id')::uuid;
    if not exists (
      select 1 from public.tiletally_game_players
      where game_id = p_game_id and player_id = v_player_id and owner_id = v_uid
    ) then
      raise exception 'Adjustment player is not a member of this game';
    end if;

    v_seq := v_seq + 1;
    insert into public.tiletally_turns (
      owner_id, game_id, player_id, seq, score, kind, source
    ) values (
      v_uid, p_game_id, v_player_id, v_seq, (v_item->>'points')::integer,
      'adjustment', 'manual'
    );
    v_created := v_created + 1;
  end loop;

  update public.tiletally_games
  set status = 'complete', completed_at = now()
  where id = p_game_id and owner_id = v_uid;

  return jsonb_build_object(
    'game_id', p_game_id,
    'status', 'complete',
    'adjustments_created', v_created,
    'idempotent', false
  );
end
$function$;

comment on function public.tiletally_finish_game(uuid, jsonb) is
  'Atomically appends manual adjustment rows and completes an owned game; completed retries are no-ops.';

-- Private photo bucket. Conflicts only tighten this Tile-Tally-owned bucket; no
-- unrelated bucket or object is modified.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tiletally-score-photos',
  'tiletally-score-photos',
  false,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $storage_policies$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'tiletally_score_photos_owner_select'
  ) then
    create policy tiletally_score_photos_owner_select
      on storage.objects for select to authenticated
      using (
        bucket_id = 'tiletally-score-photos'
        and split_part(name, '/', 1) = (select auth.uid())::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'tiletally_score_photos_owner_insert'
  ) then
    create policy tiletally_score_photos_owner_insert
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'tiletally-score-photos'
        and split_part(name, '/', 1) = (select auth.uid())::text
      );
  end if;

  -- Deliberately no UPDATE or DELETE policy: originals remain immutable provenance.
end
$storage_policies$;

-- Explicit least-privilege grants. RLS is still evaluated for authenticated users.
revoke all on table public.tiletally_players from anon, authenticated;
revoke all on table public.tiletally_games from anon, authenticated;
revoke all on table public.tiletally_game_players from anon, authenticated;
revoke all on table public.tiletally_turns from anon, authenticated;
revoke all on table public.tiletally_score_photos from anon, authenticated;
revoke all on table public.tiletally_ingest_events from anon, authenticated;
revoke all on table public.tiletally_game_totals from anon, authenticated;

grant select, insert, update, delete on table public.tiletally_players to authenticated;
grant select, insert, update, delete on table public.tiletally_games to authenticated;
grant select, insert, update, delete on table public.tiletally_game_players to authenticated;
grant select, insert, update, delete on table public.tiletally_turns to authenticated;
grant select, insert, update on table public.tiletally_score_photos to authenticated;
grant select, insert, update, delete on table public.tiletally_ingest_events to authenticated;
grant select on table public.tiletally_game_totals to authenticated;

revoke all on function public.tiletally_commit_ingest_event(uuid) from public, anon;
revoke all on function public.tiletally_add_turn(uuid, uuid, integer, text, boolean, uuid) from public, anon;
revoke all on function public.tiletally_finish_game(uuid, jsonb) from public, anon;
grant execute on function public.tiletally_commit_ingest_event(uuid) to authenticated;
grant execute on function public.tiletally_add_turn(uuid, uuid, integer, text, boolean, uuid) to authenticated;
grant execute on function public.tiletally_finish_game(uuid, jsonb) to authenticated;

commit;
