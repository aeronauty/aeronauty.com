# Game Ledger app shell

Game Ledger is installable as a progressive web app from
`/apps/tile-tally`. This is the first platform-agnostic shell: the same Next.js
application runs in a browser, from an iOS or Android home screen, and in a
desktop standalone window.

## Current PWA boundary

- `public/tile-tally.webmanifest` gives Game Ledger its own app identity, launch
  URL, standalone display mode, and theme colors. It does not replace the
  separate dashboard manifest.
- `app/apps/tile-tally/layout.tsx` adds route-specific mobile metadata and
  registers the service worker after hydration.
- `public/tile-tally-sw.js` only caches content-hashed `/_next/static/` files
  and the public Game Ledger app icons. It does not intercept page navigations and cannot cache
  `/api/`, Supabase, OAuth, ledger, or tile-workspace data.
- Dedicated 192 px, 512 px, maskable, scalable, and Apple touch icons provide
  consistent home-screen and desktop installation artwork.
- Installation is an app-like launch mode, not an offline-data promise. Games
  still require Supabase and the tile workspace remains local to that browser.

## Native packaging path

The tabletop engine is already independent of React and browser persistence.
`app/apps/tile-tally/physicalTileBoard.ts` exposes plain TypeScript snapshots
and commands, so the same snapping, locking, orientation, and physics behavior
can run in the PWA, a Capacitor shell, or a future native renderer.

Use a native wrapper only after the PWA interaction model is stable:

1. Add Capacitor to this repository and create iOS and Android projects as
   generated build artifacts.
2. Point the shell at the deployed HTTPS app initially. This preserves the
   existing Next.js API routes, Supabase OAuth callback, and release cadence.
3. Configure universal/app links for `/apps/tile-tally` and add native OAuth
   callback URLs without removing the web callback.
4. Add thin native adapters for haptics, shake, full-screen behavior, sharing,
   and update prompts. Keep board physics and gestures in the shared engine.
5. If true offline scores become a requirement, design an explicit local
   operation log and conflict resolution before caching any authenticated
   response. A service-worker response cache is not a safe substitute.

This staged path avoids maintaining separate game logic while leaving room for
store distribution and native device APIs.
