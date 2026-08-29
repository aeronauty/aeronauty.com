# Handover: aeronauty.com hosting, and the /pf/badges route

Written 2026-08-29. Two separate things in here:

1. **An unresolved hosting problem** — what aeronauty.com actually serves, and why
   nothing merged to `main` reaches it. This is the thing to fix.
2. **A route that was merged the same day** (`/pf/badges`) which must survive that
   fix. It is unrelated to the hosting problem but lives in the same repo.

Read section 3 before changing DNS, Pages settings, or `next.config.mjs`.

---

## 1. The hosting problem

### Measured facts

Everything here is reproducible from a shell. Where something is inference rather
than measurement, it says so.

| Check | Result |
|---|---|
| Hostnames ever certified for the domain (CT logs, certspotter) | **only** `aeronauty.com`, `www.aeronauty.com` — no beta/staging subdomain exists or ever has |
| DNS, both | Hostinger — `www.aeronauty.com.cdn.hstgr.net`; NS `cosmos/nova.dns-parking.com`; registrar Hostinger |
| Response headers | `server: hcdn`, `platform: hostinger`, `panel: hpanel`, `x-hcdn-cache-status: DYNAMIC` |
| `last-modified` on `/` | **Thu, 30 Oct 2025** |
| Nav links on the live homepage | exactly `/`, `/about`, `/projects`, `/snippets` |
| `/writing`, `/posts`, `/slop`, `/lab` | **404**, with and without trailing slash, on apex and www |
| TLS certificate | Let's Encrypt R13, **expired 16 July 2026** — browsers show a full-page interstitial |

Reproduce the important ones:

```bash
curl -sSI -k https://aeronauty.com/ | grep -iE 'last-modified|platform|server'
curl -sS -k https://aeronauty.com/ | grep -oE 'href="/[a-z-]*"' | sort -u
for p in /writing /posts /slop; do curl -sS -k -o /dev/null -w "$p %{http_code}\n" -L "https://aeronauty.com$p"; done
```

### What those four live routes correspond to

`about`, `apps`, `projects`, `snippets` are exactly — and only — the routes in the
**private** repo `aeronauty/aeronauty_dot_com` (local checkout `~/aeronauty_dot_com`,
`next.config.mjs` has `output: 'export'`). That repo's last push was **Feb 2026**,
so the served artifact predates even its current state.

The repo you are reading this in is the **public** `aeronauty/aeronauty.com`
(checkout `~/aeronauty-tile-tally/aeronauty-site` — the directory name is
misleading; there are also worktrees under `~/aeronauty.com`). It has writing,
posts, slop, lab, dashboard and api. **None of it is on the live domain.**

### Deploy paths that exist but do not reach the domain

- **GitHub Pages.** Configured — `public/CNAME` contains `aeronauty.com`,
  `build_type: workflow`, `https_enforced: true`. `.github/workflows/deploy.yml`
  ran automatically on push to `main` and *succeeded repeatedly* until
  **3 May 2026**; then six consecutive failures, then commit
  `3719d7c "Disable GitHub Pages auto deploy"` changed the trigger to
  `workflow_dispatch`. `GET /repos/aeronauty/aeronauty.com/pages/builds` returns
  **zero builds**. Note this workflow *deletes* `app/api` and `middleware.ts`
  before building, because a static export cannot carry them.
- **Vercel.** Two projects, `aeronauty-com` and `aeronauty-com-l1x2`, both deploy
  on every push (647 deployments recorded). Every `*.vercel.app` URL — preview
  **and** production — returns the Vercel SSO login page. `vercel domains inspect
  aeronauty.com` says *"not configured properly"* and asks for
  `A aeronauty.com 76.76.21.21`.

### Ruled out

No webhooks, no deploy keys, no GitHub App installation on either repo. No
`~/.netrc`, no FTP/SFTP client config, nothing in zsh history but repeated
`npm run build`. `~/.cloudflared` serves **aeronauty.win** (mcp/ha/dash) and has
nothing to do with the .com.

### The open contradiction — do not skip this

Harry states that the **last two essays under `aeronauty.com/writing` are
deployed**, and that he does **not** upload to Hostinger by hand. Every
measurement above contradicts that: `/writing` 404s, and the served bytes are
from October 2025.

That was not reconciled. An earlier draft of this document asserted "the site is
uploaded manually" — that was **inference from the absence of CI, not evidence**,
Harry rejected it, and it should not be repeated as fact.

Two cheap checks that would settle it:

1. **Which URL does he actually read the essays at?** If it is a `vercel.app`
   link, everything reconciles: Vercel deploys correctly and the domain simply
   never followed.
2. **What does `aeronauty.com` show in a private window?** A certificate warning
   plus a four-link homepage means the site has been quietly broken since
   mid-July. Anything else means there is a delivery path still unfound.

### If the fix is to point DNS at Vercel

Route diff was checked: **nothing currently live would be lost** —
`about`, `apps`, `projects`, `snippets` all exist in this repo too. Gained:
`posts`, `slop`, `writing`, `lab`, `privacy`, `api`. A valid auto-renewing
certificate comes with it, which also fixes the expiry.

Records Vercel asks for: `A @ 76.76.21.21`, `CNAME www → cname.vercel-dns.com`,
edited in Hostinger's DNS panel. Deployment Protection may also need loosening —
under Vercel's *Standard Protection* a custom production domain is public while
generated `*.vercel.app` URLs stay gated, which is probably the behaviour wanted.

A lower-risk alternative, if the main site should not move yet: attach a
subdomain (e.g. `CNAME pf → cname.vercel-dns.com`) to the Vercel project and
leave the apex alone.

---

## 2. What `/pf/badges` is

A name-badge design vote for the Parents & Friends association at International
School Westpfalz — five designs, approval voting, colour suggestions, comments.
Public, no account, because the voters are parents following a link from
WhatsApp. Merged in PR #50 on 2026-08-29.

| Path | Role |
|---|---|
| `public/pf/badges.html` | the page — **generated**, see below |
| `app/api/pf-badges/route.ts` | GET tallies + feedback + this browser's ballot |
| `app/api/pf-badges/vote/route.ts` | POST replaces this browser's ballot |
| `app/api/pf-badges/feedback/route.ts` | POST a comment or a colour proposal |
| `lib/pf-badges-shared.ts` | types, layout list, ISW palette, hex normaliser |
| `lib/pf-badges-store.ts` | Supabase reads/writes + rate limiting |
| `lib/pf-badges-voter.ts` | voter identity cookie |
| `next.config.mjs` | one rewrite: `/pf/badges` → `/pf/badges.html` |

Supabase tables `pf_badge_votes` and `pf_badge_feedback` in project
`dykpznfwxapfgnbbooto`, RLS enabled with **no policies**, so only the secret-key
server client reaches them — the same invariant as `post_comments`. No new npm
dependencies were added.

### Do not hand-edit `public/pf/badges.html`

It is generated by `src/build_vote_page.py` in the separate `~/ISW_P_AND_F`
project, which inlines the same traced logo and QR used by the printed badge
sheets so the on-screen previews cannot drift from what actually prints.
Regenerate with `python3 src/build_vote_page.py` from that directory.

---

## 3. Things that will bite you

- **The API routes cannot survive a static export.** `deploy.yml` deletes
  `app/api` and `middleware.ts` before building. If the hosting fix is
  "re-enable GitHub Pages", `/pf/badges` will still render but voting and
  commenting will 404, silently. The page needs a server runtime (Vercel, or any
  Node host) for its three API routes.
- **`.card` is a booby trap in this page.** Badge layout D contains an inner
  `.card` (its white writing area). The page shell deliberately uses
  `.designcard` for the article wrapper. A bare `.card` rule leaks border and
  padding into the badge preview. This was a real bug; it is fixed; do not
  "tidy" it back.
- **Voter identity is a cookie, not an IP hash** (`lib/pf-badges-voter.ts`).
  Parents on the school wifi share one NAT address, so IP-keyed identity would
  let the first voter occupy the ballot for everyone behind them. IP hashing is
  still used for feedback rate limiting, which is what it is good for. Do not
  "harden" this into IP identity.
- **A name is required to comment or propose a colour**, enforced server-side in
  `lib/pf-badges-store.ts` as well as in the page. Votes stay anonymous
  deliberately — requiring a name there would suppress turnout.
- The badge wording is bilingual and in **sentence case**: "My name is" /
  "Ich heiße". The eszett is only correct because it is not all-caps; in ALL-CAPS
  German it must become SS. If anyone switches the case, the spelling changes too.

## 4. Verified before handover

Approval voting (multi-select, toggle off, tallies persist); comment and
colour-proposal flows; rejection of a missing name, a whitespace-only name and a
malformed hex; mobile at 375×812 with no horizontal overflow, badges scaled to
fit with no dead space and 48px touch targets; desktop three-column; clean
production build; zero TypeScript errors. Test rows were deleted from Supabase
afterwards — both tables were left empty.

Not verified: the page has never been reached over the public internet, because
of the hosting problem in section 1.
