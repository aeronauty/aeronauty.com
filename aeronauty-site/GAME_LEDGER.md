# Game Ledger

Game Ledger is a private, schema-driven scorekeeper and game journal at
`/apps/tile-tally`. A game may have any number of participant or shared
counters, typed event fields, an explicit result, or no score at all. Cribbage,
Chess, open tallies, and word-tile games are editable starting presets rather
than database types.

The POC keeps the user's game in one chronological record:

- immutable score, state, and note events with append-only correction and UI undo;
- reusable people, teams, or other participant entities;
- an editable definition copied into each game so future preset edits cannot
  reinterpret history;
- explicit completion and result data rather than inferring a winner from a
  target;
- consent-gated photos and short video clips captured or imported on the phone;
- a replay view that merges events and media by their recorded or import time;
- an assistant that proposes editable updates without writing them; and
- opt-in board-photo reading for Cribbage, Chess, word tiles, and custom boards.

It also turns those individual ledgers into a cumulative history. The
**History & stats** tab can make a temporary subhistory by period, exact ruleset,
place, and any set of recurring people. It then recalculates career totals,
averages, records, W–D–L, streaks, running charts, and short interesting facts
from exactly that slice. These facts are deterministic local arithmetic, not
LLM output.

The optional **Tile table** is a separate tool within the same app. It does not
constrain the ledger model or search for words. See `TILE_TALLY.md` for its
interaction and persistence boundaries.

## Working name

**Game Ledger is a POC working title, not a cleared launch brand.** Current app
stores already use closely related names for tabletop-game tracking, and the
earlier Tile Tally name exactly matches an existing word-game scorekeeper.
Choose a distinctive final name and complete an appropriate US/EU/UK trademark
search before a public launch. Internal `tile-tally` paths remain only to avoid
needlessly breaking the current prototype URL and installed PWA during that
decision.

## Data model

The clean base migration is
`supabase/migrations/20260807170000_gameledger_generic.sql`. Reviewed AI writes
add `supabase/migrations/20260809120000_gameledger_ai_apply.sql`; the complete
contract and local SQL smoke-test instructions are in
`supabase/GAMELEDGER_SCHEMA.md`. It creates:

| Object | Purpose |
| --- | --- |
| `gameledger_entities` | Reusable people, teams, sides, or other identities. |
| `gameledger_profiles` | Editable reusable definitions. |
| `gameledger_games` | Session header and an immutable definition snapshot. |
| `gameledger_participants` | Per-game labels and seats, including guests. |
| `gameledger_events` | Ordered, immutable facts and append-only corrections. |
| `gameledger_event_sources` | Optional capture/import source envelopes. |
| `gameledger_media` | Private photo/video metadata and deletion tombstones. |
| `gameledger-media` | Private Supabase Storage bucket for media bytes. |

Reusable identities are archived rather than deleted once they appear in a
game. Their UUID remains joined to immutable per-game participant snapshots,
so a later rename or retirement cannot erase or reassign somebody's career
history. Guests remain game-local and are never merged merely because two labels
look alike.

There is no game-kind enum and no fixed score column. Counter names, units,
aggregation, ranking, targets, event fields, and result fields live in the
game's JSON definition. Values and fields live in event JSON. JSON inputs are
bounded and validated at both the UI and database boundary.

Games are started, appended to, finished, and deleted through transactional
RPCs. Direct event mutation is not granted to authenticated clients. Every
table has forced RLS and is isolated by `auth.uid()`.

Assistant writes use the same immutable writers behind an additional reviewed
proposal RPC. The proposal carries the event sequence and game timestamp the
user saw. Applying it revalidates the edited payload against the selected game
definition and participant set, then atomically rejects a stale basis. Server-
issued event/source UUIDs make a committed retry idempotent without treating a
different payload as the same operation.

The history client reads games, participants, events, and identities through a
single owner-scoped snapshot RPC. This gives one statement-level database view
with deterministic ordering; media bytes, paths, and signed URLs are excluded
from the analytics payload.

## Cumulative history rules

A subhistory is a filter over the source games, not a copied or editable second
record. The current POC supports all time, this year, the last 30 days, latest
game, last 5/10, or custom dates, combined with:

- one structural ruleset;
- an exact normalized location string;
- every selected recurring identity being present; and
- completed games by default, with open games explicitly opt-in.

The aggregator first resolves the complete append-only void graph inside each
selected game, computes final per-game counter values, maps participant
snapshots through stable entity UUIDs, and only then rolls those records up in
game order. It does not infer a winner from the score. W–D–L and streaks require
the normalized result saved by the finish transaction, whose winner UUIDs are
validated against that game's participants.

Counters are combined only when their scoring contracts match. The
compatibility fingerprint includes counter ID, scope, numeric type, unit,
aggregation, ranking, initial value, target, counter extensions, and result
semantics. It canonicalizes the raw definition as well as today's understood
fields: labels, placeholders, and quick-entry buttons are omitted, while every
unknown field is conservatively treated as scoring-relevant. Thus a future
house-rule key cannot silently merge incompatible histories. A 61-point
Cribbage game, a 121-point game, and an unrelated counter also called “Points”
remain separate metrics. The UI shows the number of games covered by the chosen
compatible metric.

Within-game aggregation and across-history rollup are separate operations.
`sum`, `latest`, `min`, and `max` counters keep the same deterministic meaning
across games by default; a counter may explicitly override it with
`extra.history_rollup` using one of those four values. Only `sum` is described
as cumulative. Latest/minimum/maximum values replace or bound the running value
instead of being blindly added. Stable entity UUIDs use the entity's current
display name in stats, while game-local guests retain their immutable snapshot
labels and are never merged by name.

Generated facts retain their source identity/game IDs in the analytics model.
History statistics are deterministic and are not generated by the assistant.

The new app reads only `gameledger_*` objects. No legacy game backfill is
required because this project has no existing game records. The reviewed AI
write migration was applied to production project `dykpznfwxapfgnbbooto` and
recorded in `supabase_migrations.schema_migrations` on 2026-08-09.

## Media boundary

Capture is always initiated by the user through native file/camera controls;
the app does not record in the background. The POC accepts common phone image
types up to 12 MiB and clips up to 45 MiB/60 seconds in the UI. A game allows
up to 20 media items. The database and private bucket enforce additional
ownership, MIME, size, path, and quota guardrails.

The client reserves a metadata row, then uploads to exactly:

```text
<auth.uid()>/<game_id>/<media_id>/<safe_filename>
```

Replay URLs are short-lived signed URLs. Deletion removes the Storage object
before irreversibly tombstoning its metadata. A production launch to untrusted
public accounts still needs trusted rate limiting or an entitlement policy,
quota monitoring, and an orphan-cleanup job.

The POC uses a one-shot upload for clips. Before treating 45 MiB video as a
production-grade mobile workflow, switch video transfer to Supabase's resumable
TUS endpoint and expose real progress/retry state; unreliable phone networks can
otherwise interrupt a large upload. The current client removes partial bytes and
releases the metadata reservation when a standard upload reports failure.

## Assistant and board-reading boundary

The assistant is scoped server-side to one authenticated, owner-visible game.
For chat, it receives only the game ID/title/status/start time, the scoring and
result contract (with arbitrary `definition.extra` omitted), participant IDs,
display labels and seats (not participant metadata), current counter totals, and
a bounded tail of the timeline. Game location is not sent. It may answer a
question or return at most one structured proposal. It cannot call a database
tool and the proposal is never written until the user reviews, edits, and
applies it. The Assistant UI says when chat or a normalized image copy will be
sent to the configured Anthropic or OpenAI provider.

Board analysis is separately opt-in. Choosing a photo does not contact an AI
provider. Pressing **Analyze board** first decodes it in the browser, resizes it
to at most 2048 pixels, paints it onto a fresh canvas, and exports a JPEG. That
removes EXIF/location metadata and bounds the transmitted copy. The normalized
copy is stored in the user's private game-media bucket as an audit reference and only
then sent by the authenticated server route to the configured provider.

The built-in readers deliberately observe rather than adjudicate:

- Cribbage records visible tracks and peg positions without inventing hidden
  scores or player/color mappings.
- Chess records visible pieces and, only for a complete board, the piece-
  placement field of FEN. A still image cannot establish the side to move,
  castling rights, en-passant state, or clocks.
- Word tiles record visible letters, racks, and 1-based grid coordinates. They
  do not solve anagrams, suggest words, or calculate points.
- Custom boards extract user-editable visible facts and named regions. Inferred
  x/y coordinates are stripped because the review UI does not expose them.

Every reading remains editable. Applying it appends one `board_position` event
with an `ai.vision` source linked to the private media object. Its source envelope
records the model plus `user_reviewed`, `user_asserted`, and
`independently_attested: false`: provenance describes how the row was created,
not proof that the physical position was correct. The reader learns only from
applied observations whose reviewer explicitly checks **Remember my guidance
and corrected reading**. That consent is persisted as `learning_opt_in: true`;
unchecked and legacy rows, discards, and raw model output are never examples.
Learning is game-scoped unless a custom profile explicitly supplies the same
`extra.vision_learning_key`.

## Authentication

The app uses Google Identity Services as the primary login and exchanges the
Google ID token for a Supabase session. Supabase Auth and RLS—not the Google
client—authorize data access. Redirect OAuth remains as a fallback.

Google Web OAuth client configuration:

```text
Authorized JavaScript origins
https://www.aeronauty.com
https://aeronauty.com
http://localhost:3000

Authorized redirect URI (fallback only)
https://dykpznfwxapfgnbbooto.supabase.co/auth/v1/callback
```

Supabase Authentication → URL Configuration:

```text
Site URL
https://www.aeronauty.com

Redirect allow-list
https://www.aeronauty.com/apps/tile-tally
https://aeronauty.com/apps/tile-tally
http://localhost:3000/apps/tile-tally
```

Set these public deployment variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe publishable key; RLS enforces access. |
| `NEXT_PUBLIC_TILETALLY_GOOGLE_CLIENT_ID` | Public Google Web client ID. |

Server-only AI variables:

| Variable | Purpose |
| --- | --- |
| `TILETALLY_AI_PROVIDER` | `anthropic` or `openai`; required when both keys exist. |
| `ANTHROPIC_API_KEY` | Anthropic provider credential. |
| `TILETALLY_CLAUDE_MODEL` | Claude chat model; also the fallback vision model. |
| `TILETALLY_CLAUDE_VISION_MODEL` | Optional Claude vision override. |
| `OPENAI_API_KEY` | OpenAI provider credential. |
| `TILETALLY_OPENAI_MODEL` | OpenAI chat/vision model; capability-specific overrides are also supported. |
| `TILETALLY_AI_*_TOKEN_CAP` / `TILETALLY_AI_REQUESTS_PER_HOUR` | Per-account request/token cost guardrails. |

The deployed AI routes run in Next.js on Vercel. A key stored only as a Supabase
Edge Function secret is not available to them; add the chosen key to Vercel as
a sensitive server-only environment variable (or move inference into an Edge
Function). Provider keys and Supabase privileged keys must never reach browser
environment variables.

Do not expose the Google client secret, a Supabase secret/service-role key, or
AI-provider keys to the browser.

## Local validation

```bash
npm ci
npx tsc --noEmit
npm run test:e2e
npm run build
```

For the database, start a disposable local Supabase stack, apply all local
migrations, and run `supabase/tests/gameledger_rls_smoke.sql`. Do not run a
database reset against the linked production project.

## Production rollout

1. Review the migration and SQL smoke-test result.
2. Confirm the CLI is linked to `dykpznfwxapfgnbbooto` and run
   `supabase db push --dry-run`.
3. Apply the migration.
4. add the public environment variables to Preview and Production;
5. deploy the web app, then test Google sign-in, account isolation, game
   creation, correction, completion, upload, replay, deletion, and reload on
   desktop and iPhone Safari.

The current route and some internal filenames retain `tile-tally` so existing
links and home-screen installs keep working. The user-facing umbrella identity
is Game Ledger.

## Platform path

The current installable PWA is the cross-platform POC. A later Capacitor shell
can reuse the deployed application and add native haptics, share sheets, device
motion, and store distribution without duplicating the ledger model. True
offline scoring should use an explicit local operation log and conflict policy;
authenticated API responses must not simply be cached by the service worker.
