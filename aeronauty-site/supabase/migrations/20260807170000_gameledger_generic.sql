-- Game Ledger: private, game-agnostic histories for people, profiles, events, and media.
--
-- This migration is deliberately additive. It does not alter or remove any legacy
-- Tile Tally object. Game presets are an application concern: complete definitions
-- and event values are stored as bounded JSON objects, without database enums for
-- games, counters, units, event fields, or result fields.

begin;

create table if not exists public.gameledger_entities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null default 'person',
  name text not null,
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gameledger_entities_id_owner_unique unique (id, owner_id),
  constraint gameledger_entities_type_check check (
    entity_type = btrim(entity_type)
    and entity_type ~ '^[a-z][a-z0-9_.-]{0,63}$'
  ),
  constraint gameledger_entities_name_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint gameledger_entities_metadata_check check (
    jsonb_typeof(metadata) = 'object'
    and octet_length(metadata::text) <= 65536
  ),
  constraint gameledger_entities_timestamps_check check (
    updated_at >= created_at
    and (archived_at is null or archived_at >= created_at)
  )
);

-- Keep this additive migration safe to re-run against a database that received an
-- earlier POC revision of the table before durable entity archival was added.
alter table public.gameledger_entities
  add column if not exists archived_at timestamptz;
alter table public.gameledger_entities
  drop constraint if exists gameledger_entities_timestamps_check;
alter table public.gameledger_entities
  add constraint gameledger_entities_timestamps_check check (
    updated_at >= created_at
    and (archived_at is null or archived_at >= created_at)
  );

comment on table public.gameledger_entities is
  'Reusable owner-private people, teams, sides, or other participant identities; entity_type is a free slug, not an enum.';
comment on column public.gameledger_entities.metadata is
  'Arbitrary display and application metadata; game history uses participant label snapshots rather than depending on later edits here.';
comment on column public.gameledger_entities.archived_at is
  'Nullable retirement marker. Authenticated clients archive identities instead of deleting them so lifetime and subgroup analytics retain a durable join key.';

create index if not exists gameledger_entities_owner_type_name_idx
  on public.gameledger_entities (owner_id, entity_type, lower(btrim(name)));
create index if not exists gameledger_entities_owner_created_idx
  on public.gameledger_entities (owner_id, created_at desc);

create table if not exists public.gameledger_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  revision integer not null default 1,
  definition jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gameledger_profiles_id_owner_unique unique (id, owner_id),
  constraint gameledger_profiles_name_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint gameledger_profiles_revision_check check (revision > 0),
  constraint gameledger_profiles_definition_check check (
    jsonb_typeof(definition) = 'object'
    and octet_length(definition::text) <= 262144
  ),
  constraint gameledger_profiles_timestamps_check check (
    updated_at >= created_at
    and (archived_at is null or archived_at >= created_at)
  )
);

comment on table public.gameledger_profiles is
  'Editable and archivable game templates. They are conveniences, never the historical definition of an already-created game.';
comment on column public.gameledger_profiles.definition is
  'Arbitrary preset JSON for counters, decimal units, targets, participants, event fields, result fields, display, and rules hints.';

create unique index if not exists gameledger_profiles_owner_name_active_unique
  on public.gameledger_profiles (owner_id, lower(btrim(name)))
  where archived_at is null;
create index if not exists gameledger_profiles_owner_updated_idx
  on public.gameledger_profiles (owner_id, updated_at desc);

create table if not exists public.gameledger_games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  profile_id uuid,
  profile_version integer,
  title text not null,
  definition jsonb not null default '{}'::jsonb,
  status text not null default 'in_progress',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gameledger_games_id_owner_unique unique (id, owner_id),
  constraint gameledger_games_profile_owner_fk
    foreign key (profile_id, owner_id)
    references public.gameledger_profiles (id, owner_id)
    on delete no action
    deferrable initially deferred,
  constraint gameledger_games_profile_pair_check check (
    (profile_id is null and profile_version is null)
    or (profile_id is not null and profile_version is not null and profile_version > 0)
  ),
  constraint gameledger_games_title_check
    check (char_length(btrim(title)) between 1 and 200),
  constraint gameledger_games_definition_check check (
    jsonb_typeof(definition) = 'object'
    and octet_length(definition::text) <= 262144
  ),
  constraint gameledger_games_status_check check (
    status = btrim(status)
    and status ~ '^[a-z][a-z0-9_.-]{0,63}$'
  ),
  constraint gameledger_games_location_check
    check (location is null or char_length(btrim(location)) between 1 and 500),
  constraint gameledger_games_completion_check check (
    (status = 'complete' and ended_at is not null)
    or (status <> 'complete' and ended_at is null)
  ),
  constraint gameledger_games_timestamps_check check (
    updated_at >= created_at
    and (ended_at is null or ended_at >= started_at)
  )
);

comment on table public.gameledger_games is
  'Owner-private game sessions. status is a free slug for open workflow states; complete is the sole terminal status and its outcome lives in the result event.';
comment on column public.gameledger_games.definition is
  'Complete per-game JSON snapshot. Profile edits never change this copy; it defines counters, units, targets, allowed event/result fields, and presentation for this game.';
comment on column public.gameledger_games.profile_version is
  'Profile revision observed when definition was copied; definition, not the mutable profile, remains authoritative for history.';

create index if not exists gameledger_games_owner_started_idx
  on public.gameledger_games (owner_id, started_at desc, created_at desc);
create index if not exists gameledger_games_owner_status_idx
  on public.gameledger_games (owner_id, status, updated_at desc);
create index if not exists gameledger_games_profile_idx
  on public.gameledger_games (profile_id) where profile_id is not null;

create table if not exists public.gameledger_participants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  game_id uuid not null,
  entity_id uuid,
  label text not null,
  seat smallint not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint gameledger_participants_id_game_owner_unique
    unique (id, game_id, owner_id),
  constraint gameledger_participants_game_owner_fk
    foreign key (game_id, owner_id)
    references public.gameledger_games (id, owner_id)
    on delete cascade,
  constraint gameledger_participants_entity_owner_fk
    foreign key (entity_id, owner_id)
    references public.gameledger_entities (id, owner_id)
    on delete restrict
    deferrable initially deferred,
  constraint gameledger_participants_label_check
    check (char_length(btrim(label)) between 1 and 120),
  constraint gameledger_participants_seat_check check (seat between 1 and 128),
  constraint gameledger_participants_game_seat_unique unique (game_id, seat),
  constraint gameledger_participants_metadata_check check (
    jsonb_typeof(metadata) = 'object'
    and octet_length(metadata::text) <= 65536
  )
);

comment on table public.gameledger_participants is
  'Per-game participant snapshots. entity_id is optional so guests, teams, colors, or roles need no reusable identity.';
comment on column public.gameledger_participants.label is
  'Immutable historical display label copied at atomic game creation; later entity edits or archival never rewrite the game.';

-- Replace the earlier POC FK action when this migration is re-run. Historical
-- participant-to-entity joins are durable: an entity must be archived, not erased.
alter table public.gameledger_participants
  drop constraint if exists gameledger_participants_entity_owner_fk;
alter table public.gameledger_participants
  add constraint gameledger_participants_entity_owner_fk
  foreign key (entity_id, owner_id)
  references public.gameledger_entities (id, owner_id)
  on delete restrict
  deferrable initially deferred;

create index if not exists gameledger_participants_owner_entity_idx
  on public.gameledger_participants (owner_id, entity_id, game_id)
  where entity_id is not null;

create table if not exists public.gameledger_media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  game_id uuid not null,
  bucket_id text not null default 'gameledger-media',
  storage_path text not null,
  media_kind text not null,
  mime_type text not null,
  byte_size bigint not null,
  duration_ms bigint,
  width integer,
  height integer,
  captured_at timestamptz not null default now(),
  caption text,
  media_data jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint gameledger_media_id_game_owner_unique
    unique (id, game_id, owner_id),
  constraint gameledger_media_game_owner_fk
    foreign key (game_id, owner_id)
    references public.gameledger_games (id, owner_id)
    on delete cascade,
  constraint gameledger_media_bucket_check check (bucket_id = 'gameledger-media'),
  constraint gameledger_media_path_unique unique (bucket_id, storage_path),
  constraint gameledger_media_path_check check (
    storage_path = btrim(storage_path)
    and char_length(storage_path) between 112 and 1024
    and storage_path like owner_id::text || '/' || game_id::text || '/' || id::text || '/%'
    and position('..' in storage_path) = 0
    and position('//' in storage_path) = 0
  ),
  constraint gameledger_media_kind_check check (media_kind in ('photo', 'video')),
  constraint gameledger_media_mime_check check (
    (media_kind = 'photo' and mime_type in (
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
    ))
    or
    (media_kind = 'video' and mime_type in (
      'video/mp4', 'video/webm', 'video/quicktime'
    ))
  ),
  constraint gameledger_media_size_check check (
    (media_kind = 'photo' and byte_size between 1 and 20971520)
    or (media_kind = 'video' and byte_size between 1 and 47185920)
  ),
  constraint gameledger_media_duration_check check (
    (media_kind = 'photo' and duration_ms is null)
    or (media_kind = 'video' and (duration_ms is null or duration_ms between 1 and 86400000))
  ),
  constraint gameledger_media_dimensions_check check (
    (width is null or width between 1 and 32768)
    and (height is null or height between 1 and 32768)
    and ((width is null) = (height is null))
  ),
  constraint gameledger_media_caption_check
    check (caption is null or char_length(btrim(caption)) between 1 and 2000),
  constraint gameledger_media_data_check check (
    jsonb_typeof(media_data) = 'object'
    and octet_length(media_data::text) <= 65536
  ),
  constraint gameledger_media_deleted_check
    check (deleted_at is null or deleted_at >= created_at)
);

comment on table public.gameledger_media is
  'Metadata and durable tombstones for private game photos/videos. Binary content lives only in the private gameledger-media Storage bucket.';
comment on column public.gameledger_media.storage_path is
  'Exact private object path: owner uid/game id/media id/filename.';
comment on column public.gameledger_media.deleted_at is
  'Irreversible application tombstone recorded after successful Storage API removal; the metadata row remains as provenance.';

create index if not exists gameledger_media_game_captured_idx
  on public.gameledger_media (game_id, captured_at, created_at)
  where deleted_at is null;
create index if not exists gameledger_media_owner_deleted_idx
  on public.gameledger_media (owner_id, deleted_at, created_at desc);

create table if not exists public.gameledger_events (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  game_id uuid not null,
  actor_participant_id uuid,
  seq bigint not null,
  event_kind text not null,
  event_data jsonb not null default '{}'::jsonb,
  note text,
  occurred_at timestamptz not null default now(),
  voids_event_id uuid,
  created_at timestamptz not null default now(),
  constraint gameledger_events_id_game_owner_unique
    unique (id, game_id, owner_id),
  constraint gameledger_events_game_owner_fk
    foreign key (game_id, owner_id)
    references public.gameledger_games (id, owner_id)
    on delete cascade,
  constraint gameledger_events_actor_game_owner_fk
    foreign key (actor_participant_id, game_id, owner_id)
    references public.gameledger_participants (id, game_id, owner_id)
    on delete no action
    deferrable initially deferred,
  constraint gameledger_events_voids_game_owner_fk
    foreign key (voids_event_id, game_id, owner_id)
    references public.gameledger_events (id, game_id, owner_id)
    on delete no action
    deferrable initially deferred,
  constraint gameledger_events_seq_unique unique (game_id, seq),
  constraint gameledger_events_seq_check check (seq > 0),
  constraint gameledger_events_kind_check check (
    event_kind = btrim(event_kind)
    and event_kind ~ '^[a-z][a-z0-9_.-]{0,63}$'
  ),
  constraint gameledger_events_data_check check (
    jsonb_typeof(event_data) = 'object'
    and octet_length(event_data::text) <= 131072
  ),
  constraint gameledger_events_note_check
    check (note is null or char_length(btrim(note)) between 1 and 10000),
  constraint gameledger_events_not_self_void_check
    check (voids_event_id is null or voids_event_id <> id)
);

comment on table public.gameledger_events is
  'Immutable ordered game ledger. All counters, decimal values, moves, positions, notes, results, and replay markers live in event_data.';
comment on column public.gameledger_events.id is
  'Client-generated idempotency UUID consumed by gameledger_append_event.';
comment on column public.gameledger_events.voids_event_id is
  'Optional immutable undo/correction edge. The original is never updated or deleted; another event may itself void this one.';

create index if not exists gameledger_events_game_timeline_idx
  on public.gameledger_events (game_id, occurred_at, seq);
create index if not exists gameledger_events_owner_kind_idx
  on public.gameledger_events (owner_id, event_kind, created_at desc);
create index if not exists gameledger_events_actor_idx
  on public.gameledger_events (actor_participant_id, occurred_at)
  where actor_participant_id is not null;
create index if not exists gameledger_events_voids_idx
  on public.gameledger_events (voids_event_id)
  where voids_event_id is not null;

create table if not exists public.gameledger_event_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  game_id uuid not null,
  event_id uuid not null,
  source_kind text not null default 'manual',
  source_data jsonb not null default '{}'::jsonb,
  media_id uuid,
  source_item_index integer,
  created_at timestamptz not null default now(),
  constraint gameledger_event_sources_event_game_owner_fk
    foreign key (event_id, game_id, owner_id)
    references public.gameledger_events (id, game_id, owner_id)
    on delete cascade,
  constraint gameledger_event_sources_media_game_owner_fk
    foreign key (media_id, game_id, owner_id)
    references public.gameledger_media (id, game_id, owner_id)
    on delete no action
    deferrable initially deferred,
  constraint gameledger_event_sources_kind_check check (
    source_kind = btrim(source_kind)
    and source_kind ~ '^[a-z][a-z0-9_.-]{0,63}$'
  ),
  constraint gameledger_event_sources_data_check check (
    jsonb_typeof(source_data) = 'object'
    and octet_length(source_data::text) <= 131072
  ),
  constraint gameledger_event_sources_item_check
    check (source_item_index is null or source_item_index >= 0)
);

comment on table public.gameledger_event_sources is
  'Immutable one-to-many provenance envelopes. Raw manual/import/camera/AI details stay separate from the normalized event_data, and media remains an object reference.';

create index if not exists gameledger_event_sources_event_idx
  on public.gameledger_event_sources (event_id, created_at);
create index if not exists gameledger_event_sources_media_idx
  on public.gameledger_event_sources (media_id)
  where media_id is not null;

-- A profile revision advances only when its complete definition changes. Existing
-- games retain both their copied definition and the revision seen at creation.
create or replace function public.gameledger_touch_profile()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.definition is distinct from old.definition then
    new.revision := old.revision + 1;
  else
    new.revision := old.revision;
  end if;
  new.updated_at := now();
  return new;
end
$function$;

do $triggers$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'gameledger_profiles_touch'
      and tgrelid = 'public.gameledger_profiles'::regclass
      and not tgisinternal
  ) then
    create trigger gameledger_profiles_touch
      before update on public.gameledger_profiles
      for each row execute function public.gameledger_touch_profile();
  end if;
end
$triggers$;

create or replace function public.gameledger_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := now();
  return new;
end
$function$;

do $triggers$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'gameledger_games_touch'
      and tgrelid = 'public.gameledger_games'::regclass
      and not tgisinternal
  ) then
    create trigger gameledger_games_touch
      before update on public.gameledger_games
      for each row execute function public.gameledger_touch_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'gameledger_entities_touch'
      and tgrelid = 'public.gameledger_entities'::regclass
      and not tgisinternal
  ) then
    create trigger gameledger_entities_touch
      before update on public.gameledger_entities
      for each row execute function public.gameledger_touch_updated_at();
  end if;
end
$triggers$;

-- POC quotas bound accidental or single-account exhaustion. The Storage policy
-- below also matches reported object bytes/MIME to this reserved metadata. A truly
-- open public launch still needs trusted rate/abuse controls outside this schema.
create or replace function public.gameledger_enforce_media_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner_count bigint;
  v_owner_bytes numeric;
  v_game_count bigint;
  v_game_bytes numeric;
  v_global_count bigint;
  v_global_bytes numeric;
begin
  new.bucket_id := 'gameledger-media';
  new.created_at := now();
  new.deleted_at := null;

  -- Trusted service-role/database maintenance may implement a different quota.
  if v_uid is null then
    return new;
  end if;

  if new.owner_id <> v_uid then
    raise insufficient_privilege using message = 'Media owner must match auth uid';
  end if;

  -- Serialize reservations globally so concurrent inserts cannot race the caps.
  perform pg_catalog.pg_advisory_xact_lock(865410237961234::bigint);

  select count(*), coalesce(sum(byte_size), 0)
  into v_owner_count, v_owner_bytes
  from public.gameledger_media
  where owner_id = v_uid and deleted_at is null;

  select count(*), coalesce(sum(byte_size), 0)
  into v_game_count, v_game_bytes
  from public.gameledger_media
  where owner_id = v_uid
    and game_id = new.game_id
    and deleted_at is null;

  select count(*), coalesce(sum(byte_size), 0)
  into v_global_count, v_global_bytes
  from public.gameledger_media
  where deleted_at is null;

  if v_game_count >= 20 or v_game_bytes + new.byte_size > 157286400 then
    raise check_violation
      using message = 'Game media quota exceeded (20 items or 150 MiB)';
  end if;
  if v_owner_count >= 40 or v_owner_bytes + new.byte_size > 268435456 then
    raise check_violation
      using message = 'Account media quota exceeded (40 items or 256 MiB)';
  end if;
  if v_global_count >= 1000 or v_global_bytes + new.byte_size > 805306368 then
    raise check_violation
      using message = 'Game Ledger POC media capacity reached';
  end if;

  return new;
end
$function$;

do $triggers$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'gameledger_media_enforce_insert'
      and tgrelid = 'public.gameledger_media'::regclass
      and not tgisinternal
  ) then
    create trigger gameledger_media_enforce_insert
      before insert on public.gameledger_media
      for each row execute function public.gameledger_enforce_media_insert();
  end if;
end
$triggers$;

-- Storage INSERT and metadata tombstoning take the same path-derived transaction
-- lock. This closes the upload-vs-delete race that could otherwise strand bytes
-- behind a tombstone and release their quota reservation.
create or replace function public.gameledger_storage_upload_allowed(
  p_storage_path text,
  p_reported_size text,
  p_reported_mime text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_size bigint;
begin
  if v_uid is null
    or p_storage_path is null
    or p_reported_size !~ '^[0-9]+$'
  then
    return false;
  end if;

  v_size := p_reported_size::bigint;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_storage_path, 314159::bigint)
  );

  return exists (
    select 1 from public.gameledger_media as m
    where m.owner_id = v_uid
      and m.bucket_id = 'gameledger-media'
      and m.storage_path = p_storage_path
      and m.deleted_at is null
      and m.byte_size = v_size
      and m.mime_type = split_part(lower(coalesce(p_reported_mime, '')), ';', 1)
  );
exception
  when numeric_value_out_of_range then
    return false;
end
$function$;

comment on function public.gameledger_storage_upload_allowed(text, text, text) is
  'Storage INSERT policy helper: serializes object lifecycle and matches active owned metadata to Storage-reported size/MIME.';

-- Game headers and participant snapshots are also one idempotent write. The client
-- supplies stable UUIDs so a network retry can return the complete stored graph.
create or replace function public.gameledger_start_game(
  p_game_id uuid,
  p_title text,
  p_definition jsonb,
  p_started_at timestamptz,
  p_location text default null,
  p_participants jsonb default '[]'::jsonb,
  p_profile_id uuid default null,
  p_profile_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_game public.gameledger_games%rowtype;
  v_profile public.gameledger_profiles%rowtype;
  v_item jsonb;
  v_participant_id uuid;
  v_entity_id uuid;
  v_label text;
  v_seat smallint;
  v_metadata jsonb;
  v_participants jsonb;
begin
  if v_uid is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  if p_game_id is null then
    raise check_violation using message = 'Game id is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_game_id::text, 271828::bigint)
  );

  select * into v_game
  from public.gameledger_games
  where id = p_game_id and owner_id = v_uid;

  if found then
    select coalesce(jsonb_agg(to_jsonb(p) order by p.seat), '[]'::jsonb)
    into v_participants
    from public.gameledger_participants as p
    where p.game_id = p_game_id and p.owner_id = v_uid;

    return jsonb_build_object(
      'idempotent', true,
      'game', to_jsonb(v_game),
      'participants', v_participants
    );
  end if;

  if p_definition is null or jsonb_typeof(p_definition) <> 'object' then
    raise check_violation using message = 'Game definition must be a JSON object';
  end if;
  if p_participants is null
    or jsonb_typeof(p_participants) <> 'array'
    or jsonb_array_length(p_participants) > 128
    or octet_length(p_participants::text) > 131072
  then
    raise check_violation
      using message = 'Participants must be a JSON array of at most 128 items';
  end if;
  if (p_profile_id is null) <> (p_profile_version is null)
    or (p_profile_version is not null and p_profile_version <= 0)
  then
    raise check_violation
      using message = 'Profile id and positive profile version must be supplied together';
  end if;
  if p_profile_id is not null then
    select * into v_profile
    from public.gameledger_profiles
    where id = p_profile_id
      and owner_id = v_uid
      and archived_at is null
    for share;
    if not found then
      raise no_data_found using message = 'Active profile not found';
    end if;
    if p_profile_version <> v_profile.revision
      or p_definition is distinct from v_profile.definition
    then
      raise check_violation
        using message = 'Profile revision and definition must match the current profile';
    end if;
  end if;

  insert into public.gameledger_games (
    id,
    owner_id,
    profile_id,
    profile_version,
    title,
    definition,
    status,
    started_at,
    location
  )
  values (
    p_game_id,
    v_uid,
    p_profile_id,
    p_profile_version,
    p_title,
    p_definition,
    'in_progress',
    p_started_at,
    p_location
  )
  returning * into v_game;

  for v_item in
    select value from jsonb_array_elements(p_participants)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or not (v_item ? 'id')
      or not (v_item ? 'label')
      or not (v_item ? 'seat')
    then
      raise check_violation
        using message = 'Each participant needs id, label, and seat';
    end if;

    v_participant_id := (v_item->>'id')::uuid;
    v_entity_id := nullif(v_item->>'entity_id', '')::uuid;
    v_label := v_item->>'label';
    v_seat := (v_item->>'seat')::smallint;
    v_metadata := coalesce(v_item->'metadata', '{}'::jsonb);

    if v_entity_id is not null and not exists (
      select 1 from public.gameledger_entities
      where id = v_entity_id
        and owner_id = v_uid
        and archived_at is null
    ) then
      raise no_data_found using message = 'Active participant entity not found';
    end if;

    insert into public.gameledger_participants (
      id,
      owner_id,
      game_id,
      entity_id,
      label,
      seat,
      metadata
    )
    values (
      v_participant_id,
      v_uid,
      p_game_id,
      v_entity_id,
      v_label,
      v_seat,
      v_metadata
    );
  end loop;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.seat), '[]'::jsonb)
  into v_participants
  from public.gameledger_participants as p
  where p.game_id = p_game_id and p.owner_id = v_uid;

  return jsonb_build_object(
    'idempotent', false,
    'game', to_jsonb(v_game),
    'participants', v_participants
  );
end
$function$;

comment on function public.gameledger_start_game(
  uuid, text, jsonb, timestamptz, text, jsonb, uuid, integer
) is
  'Atomically and idempotently creates one owned game definition snapshot plus validated participant label snapshots.';

-- This is the sole authenticated event writer. Locking the game serializes seq
-- allocation, and event UUIDs make retries idempotent. Event and source commit in
-- one transaction, so a canonical event can never be created without provenance.
create or replace function public.gameledger_append_event(
  p_game_id uuid,
  p_event_id uuid,
  p_event_kind text,
  p_actor_participant_id uuid default null,
  p_event_data jsonb default '{}'::jsonb,
  p_note text default null,
  p_occurred_at timestamptz default now(),
  p_voids_event_id uuid default null,
  p_source_id uuid default gen_random_uuid(),
  p_source_kind text default 'manual',
  p_source_data jsonb default '{}'::jsonb,
  p_media_id uuid default null,
  p_source_item_index integer default null
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
  v_seq bigint;
  v_source_id uuid;
begin
  if v_uid is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  if p_event_kind = 'result' then
    raise check_violation
      using message = 'Use gameledger_finish_game for result events';
  end if;

  -- This row lock also proves ownership without revealing other users' games.
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
    select id into v_source_id
    from public.gameledger_event_sources
    where event_id = v_event.id
      and game_id = v_event.game_id
      and owner_id = v_uid
    order by created_at, id
    limit 1;

    if v_source_id is null then
      raise integrity_constraint_violation
        using message = 'Existing event has no provenance source';
    end if;

    return jsonb_build_object(
      'idempotent', true,
      'event', to_jsonb(v_event),
      'source_id', v_source_id
    );
  end if;

  if v_game.status <> 'in_progress' then
    raise object_not_in_prerequisite_state
      using message = 'Only an in-progress game accepts new events';
  end if;

  select coalesce(max(seq), 0) + 1 into v_seq
  from public.gameledger_events
  where game_id = p_game_id;

  insert into public.gameledger_events (
    id,
    owner_id,
    game_id,
    actor_participant_id,
    seq,
    event_kind,
    event_data,
    note,
    occurred_at,
    voids_event_id
  )
  values (
    p_event_id,
    v_uid,
    p_game_id,
    p_actor_participant_id,
    v_seq,
    p_event_kind,
    coalesce(p_event_data, '{}'::jsonb),
    p_note,
    coalesce(p_occurred_at, now()),
    p_voids_event_id
  )
  returning * into v_event;

  insert into public.gameledger_event_sources (
    id,
    owner_id,
    game_id,
    event_id,
    source_kind,
    source_data,
    media_id,
    source_item_index
  )
  values (
    p_source_id,
    v_uid,
    p_game_id,
    p_event_id,
    p_source_kind,
    coalesce(p_source_data, '{}'::jsonb),
    p_media_id,
    p_source_item_index
  );

  return jsonb_build_object(
    'idempotent', false,
    'event', to_jsonb(v_event),
    'source_id', p_source_id
  );
end
$function$;

comment on function public.gameledger_append_event(
  uuid, uuid, text, uuid, jsonb, text, timestamptz, uuid, uuid, text, jsonb, uuid, integer
) is
  'Atomically and idempotently appends one immutable generic event plus one immutable provenance source to an owned game.';

-- Result and completion are one write: callers cannot leave a result event in an
-- open game, or mark the game complete without its explicit immutable result.
create or replace function public.gameledger_finish_game(
  p_game_id uuid,
  p_event_id uuid,
  p_result jsonb,
  p_note text default null,
  p_ended_at timestamptz default now(),
  p_source_id uuid default gen_random_uuid(),
  p_source_kind text default 'manual',
  p_source_data jsonb default '{}'::jsonb,
  p_media_id uuid default null,
  p_source_item_index integer default null
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
  v_seq bigint;
  v_source_id uuid;
  v_ended_at timestamptz := coalesce(p_ended_at, now());
  v_outcome text;
  v_winner jsonb;
  v_winner_id uuid;
  v_winner_ids uuid[] := array[]::uuid[];
begin
  if v_uid is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  if p_result is null or jsonb_typeof(p_result) <> 'object' then
    raise check_violation using message = 'Result must be a JSON object';
  end if;

  -- These two underscore-prefixed fields are the normalized cross-game analytics
  -- contract. Every other bounded result key remains application-defined JSON.
  if p_result ? '_outcome' then
    if jsonb_typeof(p_result->'_outcome') <> 'string' then
      raise check_violation
        using message = 'Reserved result _outcome must be a lowercase slug';
    end if;
    v_outcome := p_result->>'_outcome';
    if v_outcome <> btrim(v_outcome)
      or v_outcome !~ '^[a-z][a-z0-9_.-]{0,63}$'
    then
      raise check_violation
        using message = 'Reserved result _outcome must be a lowercase slug';
    end if;
  end if;

  if p_result ? '_winner_participant_ids' then
    if jsonb_typeof(p_result->'_winner_participant_ids') <> 'array'
      or jsonb_array_length(p_result->'_winner_participant_ids') > 128
    then
      raise check_violation using message =
        'Reserved result _winner_participant_ids must be an array of at most 128 UUID strings';
    end if;

    for v_winner in
      select value
      from jsonb_array_elements(p_result->'_winner_participant_ids')
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

    -- UUID input accepts several valid textual spellings. Store the reserved
    -- field canonically so analytics clients can compare it to snapshot UUIDs as
    -- text without re-implementing PostgreSQL UUID normalization.
    p_result := jsonb_set(
      p_result,
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

  select * into v_game
  from public.gameledger_games
  where id = p_game_id and owner_id = v_uid
  for update;
  if not found then
    raise no_data_found using message = 'Game not found';
  end if;

  -- The immutable per-game definition is authoritative for normalized result
  -- cardinality. Missing allow_draw keeps the application default (draws are
  -- allowed), while co-winners require an explicit JSON boolean true.
  if v_outcome = 'draw'
    and v_game.definition @> '{"result":{"allow_draw":false}}'::jsonb
  then
    raise check_violation
      using message = 'This game definition does not allow a draw result';
  end if;

  if cardinality(v_winner_ids) > 1
    and (v_game.definition #> '{result,allow_multiple_winners}')
      is distinct from 'true'::jsonb
  then
    raise check_violation
      using message = 'This game definition does not allow multiple winners';
  end if;

  if exists (
    select 1
    from unnest(v_winner_ids) as requested(id)
    where not exists (
      select 1
      from public.gameledger_participants as participant
      where participant.id = requested.id
        and participant.game_id = p_game_id
        and participant.owner_id = v_uid
    )
  ) then
    raise check_violation using message =
      'Every reserved result winner must be a participant in the owned game';
  end if;

  -- A committed retry is successful only for this exact result event UUID.
  if v_game.status = 'complete' then
    select * into v_event
    from public.gameledger_events
    where id = p_event_id
      and game_id = p_game_id
      and owner_id = v_uid
      and event_kind = 'result';

    if not found then
      raise object_not_in_prerequisite_state
        using message = 'Game is already complete with another result event';
    end if;

    select id into v_source_id
    from public.gameledger_event_sources
    where event_id = v_event.id
      and game_id = v_event.game_id
      and owner_id = v_uid
    order by created_at, id
    limit 1;

    if v_source_id is null then
      raise integrity_constraint_violation
        using message = 'Existing result event has no provenance source';
    end if;

    return jsonb_build_object(
      'idempotent', true,
      'event', to_jsonb(v_event),
      'source_id', v_source_id,
      'game', to_jsonb(v_game)
    );
  end if;

  if v_game.status <> 'in_progress' then
    raise object_not_in_prerequisite_state
      using message = 'Only an in-progress game may be finished';
  end if;

  if v_ended_at < v_game.started_at then
    raise check_violation using message = 'End time precedes game start';
  end if;

  select coalesce(max(seq), 0) + 1 into v_seq
  from public.gameledger_events
  where game_id = p_game_id;

  insert into public.gameledger_events (
    id,
    owner_id,
    game_id,
    seq,
    event_kind,
    event_data,
    note,
    occurred_at
  )
  values (
    p_event_id,
    v_uid,
    p_game_id,
    v_seq,
    'result',
    p_result,
    p_note,
    v_ended_at
  )
  returning * into v_event;

  insert into public.gameledger_event_sources (
    id,
    owner_id,
    game_id,
    event_id,
    source_kind,
    source_data,
    media_id,
    source_item_index
  )
  values (
    p_source_id,
    v_uid,
    p_game_id,
    p_event_id,
    p_source_kind,
    coalesce(p_source_data, '{}'::jsonb),
    p_media_id,
    p_source_item_index
  );

  update public.gameledger_games
  set status = 'complete',
      ended_at = v_ended_at
  where id = p_game_id and owner_id = v_uid
  returning * into v_game;

  return jsonb_build_object(
    'idempotent', false,
    'event', to_jsonb(v_event),
    'source_id', p_source_id,
    'game', to_jsonb(v_game)
  );
end
$function$;

comment on function public.gameledger_finish_game(
  uuid, uuid, jsonb, text, timestamptz, uuid, text, jsonb, uuid, integer
) is
  'Atomically validates normalized outcome/winner fields against the owned game definition, appends an immutable result plus provenance, and completes an owned in-progress game; retries use the result event UUID.';

-- Tombstoning is intentionally irreversible through the authenticated API. The app
-- calls this after Storage API removal; retries return the same tombstone.
create or replace function public.gameledger_mark_media_deleted(p_media_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_media public.gameledger_media%rowtype;
  v_was_deleted boolean;
begin
  if v_uid is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  select * into v_media
  from public.gameledger_media
  where id = p_media_id and owner_id = v_uid;
  if not found then
    raise no_data_found using message = 'Media not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_media.storage_path, 314159::bigint)
  );

  -- Re-read under the lifecycle lock before changing state.
  select * into v_media
  from public.gameledger_media
  where id = p_media_id and owner_id = v_uid
  for update;
  if not found then
    raise no_data_found using message = 'Media not found';
  end if;

  v_was_deleted := v_media.deleted_at is not null;
  if not v_was_deleted then
    if exists (
      select 1 from storage.objects
      where bucket_id = v_media.bucket_id
        and name = v_media.storage_path
    ) then
      raise object_not_in_prerequisite_state
        using message = 'Delete the Storage object before tombstoning metadata';
    end if;

    update public.gameledger_media
    set deleted_at = now()
    where id = p_media_id and owner_id = v_uid
    returning * into v_media;
  end if;

  return jsonb_build_object(
    'idempotent', v_was_deleted,
    'media', to_jsonb(v_media)
  );
end
$function$;

comment on function public.gameledger_mark_media_deleted(uuid) is
  'Irreversibly tombstones owned media metadata after physical Storage API removal; does not store or return binary media.';

-- Direct game DELETE is not granted: cascading active media metadata would orphan
-- billable Storage objects and release quota. Cleanup bytes/tombstones first.
create or replace function public.gameledger_delete_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  perform 1
  from public.gameledger_games
  where id = p_game_id and owner_id = v_uid
  for update;
  if not found then
    raise no_data_found using message = 'Game not found';
  end if;

  if exists (
    select 1 from public.gameledger_media
    where game_id = p_game_id
      and owner_id = v_uid
      and deleted_at is null
  ) then
    raise object_not_in_prerequisite_state
      using message = 'Delete and tombstone all game media before deleting the game';
  end if;

  delete from public.gameledger_games
  where id = p_game_id and owner_id = v_uid;

  return jsonb_build_object('deleted', true, 'game_id', p_game_id);
end
$function$;

comment on function public.gameledger_delete_game(uuid) is
  'Deletes an owned game graph only after every media object has been removed and its metadata tombstoned.';

-- Analytics clients need one MVCC-consistent read across the durable identities,
-- immutable participant snapshots, game definitions, and event ledgers. This RPC
-- deliberately emits an explicit, bounded field set and media counts only: no
-- Storage object paths, binaries, source envelopes, or ephemeral signed URLs.
create or replace function public.gameledger_history_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_snapshot jsonb;
  v_entity_count bigint;
  v_game_count bigint;
  v_participant_count bigint;
  v_event_count bigint;
  v_active_media_count bigint;
  v_payload_bytes bigint;
  c_max_entities constant bigint := 10000;
  c_max_games constant bigint := 50000;
  c_max_participants constant bigint := 250000;
  c_max_events constant bigint := 500000;
  c_max_active_media constant bigint := 250000;
  c_max_payload_bytes constant bigint := 67108864; -- 64 MiB
begin
  if v_uid is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;

  -- Refuse accounts outside the POC support envelope before jsonb_agg can build
  -- a very large in-memory value. The byte total covers every variable-length
  -- value emitted below with its JSON escaping, plus a conservative allowance
  -- for array/root punctuation and the one media-count object per game.
  select
    (select count(*)
     from public.gameledger_entities as entity
     where entity.owner_id = v_uid),
    (select count(*)
     from public.gameledger_games as game
     where game.owner_id = v_uid),
    (select count(*)
     from public.gameledger_participants as participant
     where participant.owner_id = v_uid),
    (select count(*)
     from public.gameledger_events as event
     where event.owner_id = v_uid),
    (select count(*)
     from public.gameledger_media as media
     where media.owner_id = v_uid and media.deleted_at is null),
    coalesce((
      select sum(
        octet_length(jsonb_build_object(
          'id', entity.id,
          'entity_type', entity.entity_type,
          'name', entity.name,
          'metadata', entity.metadata,
          'archived_at', entity.archived_at,
          'created_at', entity.created_at,
          'updated_at', entity.updated_at
        )::text)
      )
      from public.gameledger_entities as entity
      where entity.owner_id = v_uid
    ), 0)
    + coalesce((
      select sum(
        octet_length(jsonb_build_object(
          'id', game.id,
          'profile_id', game.profile_id,
          'profile_version', game.profile_version,
          'title', game.title,
          'definition', game.definition,
          'status', game.status,
          'started_at', game.started_at,
          'ended_at', game.ended_at,
          'location', game.location,
          'created_at', game.created_at,
          'updated_at', game.updated_at
        )::text)
      )
      from public.gameledger_games as game
      where game.owner_id = v_uid
    ), 0)
    + coalesce((
      select sum(
        octet_length(jsonb_build_object(
          'id', participant.id,
          'game_id', participant.game_id,
          'entity_id', participant.entity_id,
          'label', participant.label,
          'seat', participant.seat,
          'metadata', participant.metadata,
          'created_at', participant.created_at
        )::text)
      )
      from public.gameledger_participants as participant
      where participant.owner_id = v_uid
    ), 0)
    + coalesce((
      select sum(
        octet_length(jsonb_build_object(
          'id', event.id,
          'game_id', event.game_id,
          'actor_participant_id', event.actor_participant_id,
          'seq', event.seq,
          'event_kind', event.event_kind,
          'event_data', event.event_data,
          'note', event.note,
          'occurred_at', event.occurred_at,
          'voids_event_id', event.voids_event_id,
          'created_at', event.created_at
        )::text)
      )
      from public.gameledger_events as event
      where event.owner_id = v_uid
    ), 0)
    + coalesce((
      select count(*) * 128 + 4096
      from public.gameledger_games as game
      where game.owner_id = v_uid
    ), 0)
  into
    v_entity_count,
    v_game_count,
    v_participant_count,
    v_event_count,
    v_active_media_count,
    v_payload_bytes;

  if v_entity_count > c_max_entities
    or v_game_count > c_max_games
    or v_participant_count > c_max_participants
    or v_event_count > c_max_events
    or v_active_media_count > c_max_active_media
    or v_payload_bytes > c_max_payload_bytes
  then
    raise program_limit_exceeded using message =
      'History snapshot exceeds the supported account size; narrow/export history before requesting one full snapshot';
  end if;

  -- All five aggregates are subqueries of this one SQL statement, so under
  -- READ COMMITTED they observe the same statement-level MVCC snapshot.
  with entity_rows as (
    select
      jsonb_build_object(
        'id', entity.id,
        'entity_type', entity.entity_type,
        'name', entity.name,
        'metadata', entity.metadata,
        'archived_at', entity.archived_at,
        'created_at', entity.created_at,
        'updated_at', entity.updated_at
      ) as item,
      entity.created_at,
      entity.id
    from public.gameledger_entities as entity
    where entity.owner_id = v_uid
  ),
  game_rows as (
    select
      jsonb_build_object(
        'id', game.id,
        'profile_id', game.profile_id,
        'profile_version', game.profile_version,
        'title', game.title,
        'definition', game.definition,
        'status', game.status,
        'started_at', game.started_at,
        'ended_at', game.ended_at,
        'location', game.location,
        'created_at', game.created_at,
        'updated_at', game.updated_at
      ) as item,
      game.started_at,
      game.created_at,
      game.id
    from public.gameledger_games as game
    where game.owner_id = v_uid
  ),
  participant_rows as (
    select
      jsonb_build_object(
        'id', participant.id,
        'game_id', participant.game_id,
        'entity_id', participant.entity_id,
        'label', participant.label,
        'seat', participant.seat,
        'metadata', participant.metadata,
        'created_at', participant.created_at
      ) as item,
      participant.game_id,
      participant.seat,
      participant.id
    from public.gameledger_participants as participant
    where participant.owner_id = v_uid
  ),
  event_rows as (
    select
      jsonb_build_object(
        'id', event.id,
        'game_id', event.game_id,
        'actor_participant_id', event.actor_participant_id,
        'seq', event.seq,
        'event_kind', event.event_kind,
        'event_data', event.event_data,
        'note', event.note,
        'occurred_at', event.occurred_at,
        'voids_event_id', event.voids_event_id,
        'created_at', event.created_at
      ) as item,
      event.game_id,
      event.seq,
      event.id
    from public.gameledger_events as event
    where event.owner_id = v_uid
  ),
  active_media_count_rows as (
    select
      jsonb_build_object(
        'game_id', game.id,
        'active_media_count', count(media.id)
      ) as item,
      game.id
    from public.gameledger_games as game
    left join public.gameledger_media as media
      on media.game_id = game.id
      and media.owner_id = v_uid
      and media.deleted_at is null
    where game.owner_id = v_uid
    group by game.id
  )
  select jsonb_build_object(
    'schema_version', 1,
    'entities', coalesce(
      (select jsonb_agg(item order by created_at, id) from entity_rows),
      '[]'::jsonb
    ),
    'games', coalesce(
      (select jsonb_agg(item order by started_at, created_at, id) from game_rows),
      '[]'::jsonb
    ),
    'participants', coalesce(
      (select jsonb_agg(item order by game_id, seat, id) from participant_rows),
      '[]'::jsonb
    ),
    'events', coalesce(
      (select jsonb_agg(item order by game_id, seq, id) from event_rows),
      '[]'::jsonb
    ),
    'active_media_counts', coalesce(
      (select jsonb_agg(item order by id) from active_media_count_rows),
      '[]'::jsonb
    )
  )
  into v_snapshot;

  return v_snapshot;
end
$function$;

comment on function public.gameledger_history_snapshot() is
  'Returns one deterministic owner-private JSON snapshot for cumulative and subgroup analytics, with a 64 MiB estimated-payload ceiling and generous row-count guards, active media counts, but no object paths or signed URLs.';

-- Every application table is owner-private, including table-owner execution paths.
alter table public.gameledger_entities enable row level security;
alter table public.gameledger_entities force row level security;
alter table public.gameledger_profiles enable row level security;
alter table public.gameledger_profiles force row level security;
alter table public.gameledger_games enable row level security;
alter table public.gameledger_games force row level security;
alter table public.gameledger_participants enable row level security;
alter table public.gameledger_participants force row level security;
alter table public.gameledger_media enable row level security;
alter table public.gameledger_media force row level security;
alter table public.gameledger_events enable row level security;
alter table public.gameledger_events force row level security;
alter table public.gameledger_event_sources enable row level security;
alter table public.gameledger_event_sources force row level security;

-- Earlier POC revisions used broad entity and open-game participant write
-- policies. Drop them explicitly so re-running this migration tightens an
-- existing database as well as a fresh one.
drop policy if exists gameledger_entities_owner_all
  on public.gameledger_entities;
drop policy if exists gameledger_participants_owner_insert_open
  on public.gameledger_participants;
drop policy if exists gameledger_participants_owner_update_open
  on public.gameledger_participants;
drop policy if exists gameledger_participants_owner_delete_open
  on public.gameledger_participants;

do $policies$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'gameledger_entities'
      and policyname = 'gameledger_entities_owner_select'
  ) then
    create policy gameledger_entities_owner_select
      on public.gameledger_entities for select to authenticated
      using (owner_id = (select auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'gameledger_entities'
      and policyname = 'gameledger_entities_owner_insert'
  ) then
    create policy gameledger_entities_owner_insert
      on public.gameledger_entities for insert to authenticated
      with check (owner_id = (select auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'gameledger_entities'
      and policyname = 'gameledger_entities_owner_update'
  ) then
    create policy gameledger_entities_owner_update
      on public.gameledger_entities for update to authenticated
      using (owner_id = (select auth.uid()))
      with check (owner_id = (select auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'gameledger_profiles'
      and policyname = 'gameledger_profiles_owner_all'
  ) then
    create policy gameledger_profiles_owner_all
      on public.gameledger_profiles for all to authenticated
      using (owner_id = (select auth.uid()))
      with check (owner_id = (select auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'gameledger_games'
      and policyname = 'gameledger_games_owner_select'
  ) then
    create policy gameledger_games_owner_select
      on public.gameledger_games for select to authenticated
      using (owner_id = (select auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'gameledger_games'
      and policyname = 'gameledger_games_owner_insert_open'
  ) then
    create policy gameledger_games_owner_insert_open
      on public.gameledger_games for insert to authenticated
      with check (
        owner_id = (select auth.uid())
        and status <> 'complete'
        and ended_at is null
      );
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'gameledger_games'
      and policyname = 'gameledger_games_owner_update_open'
  ) then
    create policy gameledger_games_owner_update_open
      on public.gameledger_games for update to authenticated
      using (
        owner_id = (select auth.uid())
        and status <> 'complete'
        and ended_at is null
      )
      with check (
        owner_id = (select auth.uid())
        and status <> 'complete'
        and ended_at is null
      );
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'gameledger_participants'
      and policyname = 'gameledger_participants_owner_select'
  ) then
    create policy gameledger_participants_owner_select
      on public.gameledger_participants for select to authenticated
      using (owner_id = (select auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'gameledger_media'
      and policyname = 'gameledger_media_owner_select'
  ) then
    create policy gameledger_media_owner_select
      on public.gameledger_media for select to authenticated
      using (owner_id = (select auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'gameledger_media'
      and policyname = 'gameledger_media_owner_insert'
  ) then
    create policy gameledger_media_owner_insert
      on public.gameledger_media for insert to authenticated
      with check (owner_id = (select auth.uid()) and deleted_at is null);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'gameledger_media'
      and policyname = 'gameledger_media_owner_caption_update'
  ) then
    create policy gameledger_media_owner_caption_update
      on public.gameledger_media for update to authenticated
      using (owner_id = (select auth.uid()))
      with check (owner_id = (select auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'gameledger_events'
      and policyname = 'gameledger_events_owner_select'
  ) then
    create policy gameledger_events_owner_select
      on public.gameledger_events for select to authenticated
      using (owner_id = (select auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'gameledger_event_sources'
      and policyname = 'gameledger_event_sources_owner_select'
  ) then
    create policy gameledger_event_sources_owner_select
      on public.gameledger_event_sources for select to authenticated
      using (owner_id = (select auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'gameledger_event_sources'
      and policyname = 'gameledger_event_sources_owner_insert'
  ) then
    create policy gameledger_event_sources_owner_insert
      on public.gameledger_event_sources for insert to authenticated
      with check (owner_id = (select auth.uid()));
  end if;
end
$policies$;

-- One private bucket for phone photos and video. DB rows contain metadata only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gameledger-media',
  'gameledger-media',
  false,
  47185920,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $storage_policies$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'gameledger_media_owner_select'
  ) then
    create policy gameledger_media_owner_select
      on storage.objects for select to authenticated
      using (
        bucket_id = 'gameledger-media'
        and split_part(name, '/', 1) = (select auth.uid())::text
        and exists (
          select 1 from public.gameledger_media as m
          where m.owner_id = (select auth.uid())
            and m.bucket_id = 'gameledger-media'
            and m.storage_path = name
            and m.deleted_at is null
            and m.byte_size = case
              when metadata->>'size' ~ '^[0-9]+$'
                then (metadata->>'size')::bigint
              else -1
            end
            and m.mime_type = split_part(
              lower(coalesce(metadata->>'mimetype', '')),
              ';',
              1
            )
        )
      );
  end if;

  -- Metadata is created first. Only its exact active path may be uploaded.
  if not exists (
    select 1 from pg_policies where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'gameledger_media_owner_insert'
  ) then
    create policy gameledger_media_owner_insert
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'gameledger-media'
        and split_part(name, '/', 1) = (select auth.uid())::text
        and public.gameledger_storage_upload_allowed(
          name,
          metadata->>'size',
          metadata->>'mimetype'
        )
      );
  end if;

  -- Storage remove needs SELECT and DELETE. Both policies therefore recognize the
  -- same exact active metadata row. The app removes bytes first, then tombstones;
  -- whole-game cleanup must remove every object before deleting the game row.
  if not exists (
    select 1 from pg_policies where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'gameledger_media_owner_delete'
  ) then
    create policy gameledger_media_owner_delete
      on storage.objects for delete to authenticated
      using (
        bucket_id = 'gameledger-media'
        and split_part(name, '/', 1) = (select auth.uid())::text
        and exists (
          select 1 from public.gameledger_media as m
          where m.owner_id = (select auth.uid())
            and m.bucket_id = 'gameledger-media'
            and m.storage_path = name
            and m.deleted_at is null
        )
      );
  end if;

  -- No UPDATE policy: replacing an original requires a new media id/path so old
  -- provenance cannot silently point at different bytes.
end
$storage_policies$;

-- Explicit grants pair with RLS. Event rows cannot be directly changed or created;
-- the append RPC is the only authenticated writer and always adds a source row.
revoke all on table public.gameledger_entities from anon, authenticated;
revoke all on table public.gameledger_profiles from anon, authenticated;
revoke all on table public.gameledger_games from anon, authenticated;
revoke all on table public.gameledger_participants from anon, authenticated;
revoke all on table public.gameledger_media from anon, authenticated;
revoke all on table public.gameledger_events from anon, authenticated;
revoke all on table public.gameledger_event_sources from anon, authenticated;

grant select on table public.gameledger_entities to authenticated;
grant insert (id, owner_id, entity_type, name, metadata, archived_at)
  on table public.gameledger_entities to authenticated;
grant update (entity_type, name, metadata, archived_at)
  on table public.gameledger_entities to authenticated;

grant select, delete on table public.gameledger_profiles to authenticated;
grant insert (id, owner_id, name, definition, archived_at)
  on table public.gameledger_profiles to authenticated;
grant update (name, definition, archived_at)
  on table public.gameledger_profiles to authenticated;

grant select on table public.gameledger_games to authenticated;
grant update (title, status, started_at, location)
  on table public.gameledger_games to authenticated;

grant select on table public.gameledger_participants to authenticated;

grant select on table public.gameledger_media to authenticated;
grant insert (
  id, owner_id, game_id, storage_path, media_kind, mime_type, byte_size,
  duration_ms, width, height, captured_at, caption, media_data
) on table public.gameledger_media to authenticated;
grant update (caption) on table public.gameledger_media to authenticated;
grant select on table public.gameledger_events to authenticated;
grant select on table public.gameledger_event_sources to authenticated;
grant insert (
  id, owner_id, game_id, event_id, source_kind, source_data, media_id,
  source_item_index
) on table public.gameledger_event_sources to authenticated;

revoke all on function public.gameledger_touch_profile() from public, anon, authenticated;
revoke all on function public.gameledger_touch_updated_at() from public, anon, authenticated;
revoke all on function public.gameledger_enforce_media_insert() from public, anon, authenticated;
revoke all on function public.gameledger_storage_upload_allowed(text, text, text)
  from public, anon;
revoke all on function public.gameledger_start_game(
  uuid, text, jsonb, timestamptz, text, jsonb, uuid, integer
) from public, anon;
revoke all on function public.gameledger_append_event(
  uuid, uuid, text, uuid, jsonb, text, timestamptz, uuid, uuid, text, jsonb, uuid, integer
) from public, anon;
revoke all on function public.gameledger_finish_game(
  uuid, uuid, jsonb, text, timestamptz, uuid, text, jsonb, uuid, integer
) from public, anon;
revoke all on function public.gameledger_mark_media_deleted(uuid) from public, anon;
revoke all on function public.gameledger_delete_game(uuid) from public, anon;
revoke all on function public.gameledger_history_snapshot()
  from public, anon, authenticated;
grant execute on function public.gameledger_append_event(
  uuid, uuid, text, uuid, jsonb, text, timestamptz, uuid, uuid, text, jsonb, uuid, integer
) to authenticated;
grant execute on function public.gameledger_finish_game(
  uuid, uuid, jsonb, text, timestamptz, uuid, text, jsonb, uuid, integer
) to authenticated;
grant execute on function public.gameledger_mark_media_deleted(uuid) to authenticated;
grant execute on function public.gameledger_delete_game(uuid) to authenticated;
grant execute on function public.gameledger_history_snapshot() to authenticated;
grant execute on function public.gameledger_storage_upload_allowed(text, text, text)
  to authenticated;
grant execute on function public.gameledger_start_game(
  uuid, text, jsonb, timestamptz, text, jsonb, uuid, integer
) to authenticated;

commit;
