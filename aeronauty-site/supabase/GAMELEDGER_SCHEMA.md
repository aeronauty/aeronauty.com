# Game Ledger schema

`20260807170000_gameledger_generic.sql` adds a private, game-agnostic ledger. It
does not modify or delete the existing `tiletally_*` schema. The migration has not
been applied to any Supabase project.

## Design boundary

The database has no catalogue or enum of game kinds. Cribbage, chess, a word game,
a drinking-water tally, or a household competition are UI presets that produce a
JSON definition. The complete definition is copied into each game and stays there,
so changing or archiving the reusable profile cannot reinterpret old history.

JSON numbers retain decimal values. Counter names, units, targets, participant
roles, event fields, result fields, and display hints all live in `definition` and
`event_data`; the database does not assume that a game even has a score.

## Application contract

| Object | Purpose |
| --- | --- |
| `gameledger_entities` | Reusable people, teams, sides, or other identities. |
| `gameledger_profiles` | Editable/archivable templates with automatically incremented `revision`. |
| `gameledger_games` | Session header and complete `definition` snapshot. Open workflow states are free lowercase slugs; `complete` is the sole terminal state. |
| `gameledger_participants` | Stable per-game label/seat snapshots; `entity_id` is optional for guests and roles. |
| `gameledger_events` | Immutable ordered facts. `id` is a client-generated idempotency UUID. |
| `gameledger_event_sources` | Immutable provenance kept separately from the normalized event. |
| `gameledger_media` | Photo/video metadata and tombstones. Bytes are never stored in Postgres. |
| `gameledger-media` | Private Supabase Storage bucket containing the bytes. |

Entity display names are not globally unique—two real people or teams may share a
name. Deleting a reusable entity nulls only historical participants' `entity_id`;
their copied `label` and every game/event remain intact.

Start application games through the atomic RPC rather than separate header and
participant inserts:

```sql
gameledger_start_game(
  p_game_id uuid,
  p_title text,
  p_definition jsonb,
  p_started_at timestamptz,
  p_location text default null,
  p_participants jsonb default '[]',
  p_profile_id uuid default null,
  p_profile_version integer default null
) returns jsonb
```

Each participant is `{id, entity_id?, label, seat, metadata?}`. The RPC takes a
transaction lock on the client-generated game UUID, checks profile/entity ownership,
and creates the definition plus all label snapshots together. A repeated game UUID
returns `{idempotent: true, game, participants}`; invalid or duplicate participant
data rolls the entire first call back.

When a profile is supplied, the RPC holds a share lock and requires both
`p_profile_version` and `p_definition` to equal the current active profile. This
prevents forged provenance or a profile edit racing the snapshot. Start a custom
definition without a profile ID (or save it as a new profile first).

Create events only through:

```sql
gameledger_append_event(
  p_game_id uuid,
  p_event_id uuid,
  p_event_kind text,
  p_actor_participant_id uuid default null,
  p_event_data jsonb default '{}',
  p_note text default null,
  p_occurred_at timestamptz default now(),
  p_voids_event_id uuid default null,
  p_source_id uuid default gen_random_uuid(),
  p_source_kind text default 'manual',
  p_source_data jsonb default '{}',
  p_media_id uuid default null,
  p_source_item_index integer default null
) returns jsonb
```

It locks the game while assigning `seq`, inserts an event and its first source in
one transaction, and returns:

```json
{
  "idempotent": false,
  "event": { "id": "…", "seq": 1, "event_kind": "counter_change" },
  "source_id": "…"
}
```

Retry with the same `p_event_id`; the existing event is returned with
`idempotent: true`. The authenticated API has no direct INSERT, UPDATE, or DELETE
grant on events. Additional immutable sources may be attached later, for example
when a video is reviewed, but an event's original source is atomic.

Only an `in_progress` game accepts a new event. A retry of an existing event UUID
still succeeds after completion, but no later event can void or reinterpret the
final result. Standalone media and additional provenance sources may still be
attached for retrospective replay without changing the event ledger.

The exact event kind `result` and game status `complete` are reserved for the
atomic finish RPC:

```sql
gameledger_finish_game(
  p_game_id uuid,
  p_event_id uuid,
  p_result jsonb,
  p_note text default null,
  p_ended_at timestamptz default now(),
  p_source_id uuid default gen_random_uuid(),
  p_source_kind text default 'manual',
  p_source_data jsonb default '{}',
  p_media_id uuid default null,
  p_source_item_index integer default null
) returns jsonb
```

It locks an owned `in_progress` game, appends the explicit result and source at the
next sequence, and sets `status = 'complete'` plus `ended_at` in the same
transaction. The same result event UUID is an idempotent retry. Direct clients
cannot append a `result`, insert/update a completed game, or set `ended_at`, so the
result and header cannot be left in contradictory states.

Outcomes such as win, draw, abandonment, timeout, or a custom result belong in
`p_result`; they are not competing terminal status values. Open games may use
custom workflow statuses such as `paused` or `awaiting_review`, but must return to
`in_progress` before the finish RPC.

Undo and correction are append-only: create a new event whose `voids_event_id`
points to the earlier event. Never rewrite or remove the earlier observation. A
void can itself be voided, which gives redo semantics without destroying history.

## Definition and event examples

Profiles are suggestions rather than privileged database types. A cribbage preset
could produce this complete game definition:

```json
{
  "version": 1,
  "name": "Cribbage",
  "preset": "cribbage",
  "participant": { "min": 2, "max": 4 },
  "counters": [
    {
      "id": "points",
      "label": "Points",
      "scope": "participant",
      "value_type": "integer",
      "unit": "pts",
      "initial": 0,
      "aggregation": "sum",
      "ranking": "highest",
      "input": { "mode": "delta", "quick_values": [1, 2, 3, 4], "allow_negative": true },
      "target": { "operator": ">=", "value": 121, "finish": "suggest" }
    }
  ],
  "event_fields": [
    { "id": "hand", "label": "Hand / note", "type": "text" }
  ],
  "result_fields": [],
  "result": { "mode": "derived", "winner_counter_id": "points", "allow_draw": false }
}
```

A pegging event can then carry multiple arbitrary values without a schema change:

```json
{
  "values": { "points": 2.5, "games_won": 0 },
  "fields": { "hand": "Pegging: fifteen" }
}
```

A chess definition needs no counters at all. The current renderer represents a
typed position field as an item in `event_fields`, and stores its value under
`event_data.fields`, for example:

```json
{
  "fields": { "position": "18…Nxd4" }
}
```

The app renderer currently understands field types `number`, `text`, `boolean`,
and `select`; definitions and events may retain additional bounded JSON for a
future renderer. A tile-word preset can likewise put `word` or `bonus` in
`fields` and arbitrary counter values in `values`. None of these names is
enforced or reserved by Postgres.

## Media and replay

The phone first creates a `gameledger_media` row, then uploads to its exact path:

```text
<auth.uid()>/<game_id>/<media_id>/<filename>
```

The metadata row records `mime_type`, `byte_size`, optional `duration_ms`, optional
paired `width`/`height`, `captured_at`, caption, and bounded `media_data`. Photos are
limited to 20 MiB and videos to 45 MiB so the POC stays under the current Supabase
Free per-object ceiling. The bucket permits common web, iPhone, and Android
image/video MIME types. It is private, and Storage RLS checks both the UID path
prefix and the matching active metadata row. On upload, Storage-reported
`metadata.size` and `metadata.mimetype` must match the reserved `byte_size` and
`mime_type`; the row cannot claim a tiny JPEG while uploading a large MP4.

The metadata reservation trigger serializes inserts and applies POC caps: 20 items
or 150 MiB per game, 40 items or 256 MiB per account, and 1,000 items or 768 MiB
across this bucket. Tombstoned rows release their reservation only after the object
has gone. These are useful cost guardrails, not sufficient anti-abuse for open
public OAuth: launch still needs trusted rate limiting, an entitlement/allowlist,
and operational quota monitoring so throwaway accounts cannot reserve capacity.

The replay screen merges, in time order:

- events ordered by `occurred_at, seq`;
- active media ordered by `captured_at, created_at`;
- event sources that connect a media item to a derived observation.

Media may exist without an event, so taking a photograph or recording a clip never
requires inventing a score/move. Later analysis can append an event and another
source referencing that media; the raw object remains separate.

The start RPC sets `definition`, `profile_id`, and `profile_version`; authenticated
clients have no direct game/participant INSERT grant. Those snapshot columns also
have no UPDATE grant; later profile or rules corrections are events. Trusted admin
roles retain direct maintenance access. Session header fields such as title, status,
start time, and location remain editable while the game is open. Participant
snapshots, game headers, and event facts lock at completion except for whole-game
deletion; media and extra source envelopes may still be added for replay.

Deletion is a two-step, retryable workflow:

1. Delete the object with the Supabase Storage API while its exact active metadata
   row authorizes both the SELECT and DELETE operations.
2. Call `gameledger_mark_media_deleted(media_id)`. This sets an irreversible
   tombstone. The RPC verifies no Storage row remains; if that call is interrupted
   after object removal, retry it safely.

There is no Storage UPDATE policy. A replacement gets a new media ID and path,
preventing old provenance from silently referring to different bytes. When deleting
an entire game, the application must fetch and remove all Storage objects first,
tombstone their metadata, then call `gameledger_delete_game(game_id)`. Direct game
DELETE is not granted, and this RPC refuses while any active media remains. Cascades
remove database rows, but never pretend to remove Storage bytes. Orphan cleanup
after a broken client flow requires a trusted server using the service role; it is
not broadened to arbitrary authenticated object paths. Account deletion likewise
needs trusted media cleanup before the Auth user is removed.

## Security and limits

All seven application tables enable and force RLS. Authenticated users can see only
rows whose `owner_id = auth.uid()`, and `anon` receives no table access. Composite
foreign keys prevent an owner, participant, media item, event, or source from being
attached across accounts or games.

Events and sources are immutable through authenticated grants. JSON inputs must be
objects and are bounded (64–256 KiB, depending on purpose); strings, sequence
numbers, media dimensions, MIME types, durations, and byte sizes also have explicit
limits. `SECURITY DEFINER` RPCs use an empty `search_path` and independently verify
`auth.uid()` before writing.

Authenticated column grants exclude server-managed revisions, tombstones, and
creation/update timestamps. Profile/entity/game triggers and RPCs supply those
values, preventing callers from backdating provenance or forging profile versions.

Run the disposable smoke test only after applying migrations to a local database:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/gameledger_rls_smoke.sql
```

The test transaction rolls back its synthetic users and all fixture rows.
