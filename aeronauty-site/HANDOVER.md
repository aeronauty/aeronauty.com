# Aeronauty — Project Handover

A working reference for the aeronauty.com site: what it is, how it's built, where data
lives, how to deploy, and what's in flight. Written for a developer or designer picking
this up cold.

## What it is

Personal site for Harry Smith ("Aeronauty"), who is known on LinkedIn for sharply,
irreverently **debunking bad physics and AI slop** — technical and credible, but funny.
The site combines a portfolio/writing presence with two custom features built around that
brand:

- **Slop** (`/slop`) — a community "submit AI slop" pipeline → weekly leaderboard + YouTube
  shorts.
- **Posts** (`/posts`) — owner-authored short posts/debunks (the "Slop Forensics" series),
  including interactive HTML breakdowns.

## Stack

- **Next.js 14** (App Router), **React 18**, **TypeScript**, **Tailwind CSS 3**.
- **NextAuth v5 (beta)** — Google OAuth + a password "Owner" credentials provider.
- **Upstash Redis** — most app storage (being migrated to Supabase, see "In flight").
- **Supabase** (project `slop_basket`, ref `dykpznfwxapfgnbbooto`) — screenshot storage
  (private bucket `slop-screenshots`) and the `post_comments` Postgres table.
- **Resend** — transactional email (lab magic links, slop notifications, "post is live").
- **Vercel** — hosting (region `fra1`), cron, env vars.

## Directory map (under `aeronauty-site/`)

```
app/
  page.tsx                     home
  writing/                     hardcoded long-form essays (iframe to prebuilt HTML)
  posts/                       data-driven posts (index + [slug]); HTML or markdown
  slop/                        submit form + /leaderboard + /admin (owner)
  lab/                         private area (magic-link gated): writing, compose, activity
  dashboard/                   owner kitchen dashboard (calendars, reminders, etc.)
  api/
    slop/                      submit, vote, moderate, comment(s), digest (cron)
    posts/                     save/delete posts, comment(s)
    lab/, google-*, calendars, reminders, photos, news, weather, geocode
lib/
  redis-config.ts             Upstash client
  slop-store.ts               slop submissions, votes, comments, rate limits (Redis)
  posts-store.ts              posts (Redis)
  post-comments-store.ts      post comments (Supabase Postgres)
  supabase-storage.ts         Supabase client + screenshot bucket + getSupabaseAdmin()
  slop-notify.ts, email.ts    Resend senders
  slop-unfurl.ts              OG/Twitter link unfurl (SSRF-guarded)
  slop-viewer.ts, owner.ts    comment identity + owner check
  auth.ts, lab-auth.ts        NextAuth config + lab magic-link tokens
  activity-store.ts           first-party analytics (Redis)
  token-store.ts              dashboard Google OAuth tokens (Redis)
components/                    SiteNav, cards, Slop*/Post* feature components, HtmlEmbed, Markdown
middleware.ts                 gates /dashboard and /lab
```

## Features

### Slop (`/slop`)
- **Submit**: link + tags (multi-select predefined + free-text "Other") + comment + up to 4
  screenshots. Clean submissions **auto-publish** to the leaderboard; ones matching the
  moderation blocklist (`lib/slop-wordfilter.ts`, extend via `SLOP_BLOCKLIST`) are **held**.
- **Leaderboard** (`/slop/leaderboard`): up/down voting, **net score (up − down)** ranks the
  board, rotating cheeky vote-button labels, comments per nominee.
- **Admin** (`/slop/admin`, owner): two sections — Held (approve/remove) and Live (remove).
- **Screenshots**: private Supabase bucket, served via short-lived signed URLs.
- **Notifications**: instant email per submission + daily digest (Vercel cron 08:00 UTC,
  `/api/slop/digest`, gated by `CRON_SECRET`).
- **Archive link**: posts tagged `Slop Forensics` appear in an "exhibits" archive on `/slop`.

### Posts (`/posts`)
- **Compose** (`/lab/compose`, owner): markdown editor w/ live preview, draft/publish/delete.
- **Render**: markdown (react-markdown) or **HTML** posts (`format: "html"`) rendered in a
  sandboxed iframe with a compact **preview + click-to-expand** (`components/HtmlEmbed.tsx`).
- **Comments**: Supabase Postgres (`post_comments`), **sign-in required**.
- **Publish email**: owner gets a "post is live" email (`/api/posts` → `lib/email.ts`).
- **Programmatic publishing**: `/api/posts` accepts a `POSTS_API_KEY` bearer token. A
  user-level Claude skill `/post` (`~/.claude/skills/post/`) drafts a debunk in Harry's
  voice and publishes through it.

## Auth model (important)

- **NextAuth Google sign-in is public** — any Google account can get a session (so anyone
  can comment once signed in). **A session alone grants nothing.**
- `jwt`/`session` callbacks stamp two flags: `labAllowed` (allowlisted lab/dashboard
  accounts, or the password owner) and `isOwner` (the owner only). Old tokens are upgraded
  on read.
- **Every private surface must gate on `labAllowed`/`isOwner`, never on "is logged in".**
  `middleware.ts` covers `/dashboard` + `/lab`, but it does **not** cover `/api/*` — so each
  owner-only API route checks at the resource (`isOwnerRequest()` / `session.user.labAllowed`).
  This was a real privilege-escalation that a review caught; do not regress it.
- Per-client identity (rate limits, vote dedup) hashes the **right-most** `X-Forwarded-For`
  hop (Vercel-trusted), not the spoofable left-most value.

## Data stores

| Data | Store | Notes |
|---|---|---|
| Slop submissions / votes / comments / rate limits | **Redis** | being migrated |
| Posts | **Redis** | being migrated; has live data (the published exhibit) |
| Post comments | **Supabase Postgres** (`post_comments`) | RLS on, secret-key only |
| Screenshots | **Supabase Storage** (`slop-screenshots`, private) | signed URLs |
| Lab magic-link tokens | **Redis** | ephemeral (15 min) |
| Dashboard Google OAuth tokens | **Redis** (`token-store`) | **critical live data** |
| Analytics (activity/engagement) | **Redis** | has history |

## Environment variables (names only — values are in Vercel/`.env.local`)

- `AUTH_SECRET` / `AERONAUTY_AUTH_SECRET` — session + lab-token signing, IP hashing.
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google OAuth.
- `DASHBOARD_PASSWORD` — owner password login.
- Upstash: `aeronauty_storage_KV_REST_API_URL/TOKEN` (+ `KV_*` / `UPSTASH_*` fallbacks).
- Supabase: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (new `sb_secret_…` format). **Marked
  sensitive in Vercel — `vercel env pull` returns them empty; only the deployed server sees
  the real values.** (`RESEND_API_KEY` is likewise sensitive.)
- `RESEND_API_KEY`, `AERONAUTY_MAGIC_LINK_FROM`, `AERONAUTY_LAB_ALLOWED_EMAILS`.
- `CRON_SECRET` — authorizes the digest cron.
- `POSTS_API_KEY` — bearer token for programmatic post publishing.
- `SLOP_BLOCKLIST` (optional) — extra moderation terms. `SLOP_NOTIFY_TO` (optional).
- `NEXT_PUBLIC_SITE_URL` / `AUTH_URL` / `NEXTAUTH_URL` — canonical host.

## Deploy workflow

- Work on a branch → PR → **squash-merge to `main`** → Vercel auto-deploys. (Because of
  squash-merges, when continuing a branch after a merge, `git fetch origin main && git reset
  --soft origin/main` then re-commit to avoid phantom conflicts.)
- Env changes only take effect on the **next deploy**.
- Canonical host is **`www.aeronauty.com`** (apex 307s to www).

## Conventions

- Pages that read live data use `export const dynamic = "force-dynamic"`.
- **Client-safe shared modules** (`*-shared.ts`) hold types/constants so client components
  don't pull server clients (Redis/Supabase) into the browser bundle. `import "server-only"`
  guards server modules.
- User text is rendered as escaped React text (no `dangerouslySetInnerHTML`); HTML posts are
  the one exception and are isolated in a sandboxed iframe.
- Local testing pattern: stand up `next start` with a `.env.local` assembled from prod creds,
  drive the real endpoints with a Node script against the live Redis/Supabase, then clean up.

## In flight / tech debt

- **Redis → Supabase migration (active):** the goal is to move *all* storage off Redis to
  Supabase Postgres. A detailed audit + phased plan + schema is being produced. High-risk
  pieces to handle carefully: dashboard `token-store` (Google tokens — breaks calendars if
  wrong), lab magic-links (auth), and analytics history. Post comments already moved.
- **Comment storage split:** slop comments are in Redis, post comments in Supabase — to be
  unified by the migration.
- **Design refresh (active):** see brief below.

## Design brief

**Current aesthetic:** warm paper (`#f7f4ee`), stone-grey text, single teal accent
(`#0f766e`), **system sans** fonts throughout, uniformly rounded white cards with soft
shadows, generous but undifferentiated spacing. Clean and readable, but it reads a little
**generic / AI-templated ("vibe-codey")**: no distinctive typeface, one flat accent, every
surface is the same rounded-card treatment, and there's no strong typographic hierarchy or
identity tied to the physics/debunking brand.

**Goal:** make it look intentional and premium without losing the warmth or the irreverent
edge — a site that feels like it's run by someone with strong opinions and technical
authority. Likely levers: a real typeface pairing (e.g. a characterful display + a clean
text face via `next/font`), a richer/more confident palette, stronger type scale and
hierarchy, more deliberate use of the aerodynamics/physics identity, and signature details
instead of uniform cards. A multi-agent design exploration is producing concrete directions
+ a recommended design system + sample restyles.
