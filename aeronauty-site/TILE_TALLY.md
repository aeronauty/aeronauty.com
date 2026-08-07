# Tile table

The **Tile table** at `/apps/tile-tally` is an optional tactile letter-tile
workspace inside Game Ledger. It is not an anagram finder and it never suggests
moves. Users add the letters they actually hold, then arrange, insert, split,
join, lock, push, spin, and throw them across one low-friction surface.

Game Ledger itself is documented in `GAME_LEDGER.md`.

## Interaction model

- Loose tiles have equal mass, retain release momentum, collide, transfer
  momentum, bounce at the workbench edge, and settle under friction.
- Holding a tile in-line pushes neighbouring tiles along. Pulling it clearly
  above or below the row lifts it out instead.
- A slow, deliberate release near an exposed left or right edge snaps two tiles
  together. Mere collision never creates a word.
- Dropping a loose tile over a snapped seam inserts it between the two letters.
- Joined chains can be locked and then move or throw as one heavier rigid group.
  A hold action exposes break/unlock controls on touch; the same actions are
  available as ordinary buttons and keyboard commands.
- Tiles stay upright by default. Optional free rotation enables spin, and
  **Straighten** restores selected tiles or the whole table.
- **Scatter all** and **Scatter selected** detach and redistribute tiles with
  position, rotation, and momentum. A permitted two-spike device shake performs
  the same full scatter.
- Full-screen mode enlarges the workbench on phones and desktops.

The optional **Check word** action uses only the exact snapped chain selected by
the user. It copies that candidate and opens an external dictionary page; it
does not transmit the rack automatically or search alternative arrangements.

For a public release, keep this feature generically described as **word tiles**
or **letter tiles**. Do not use the SCRABBLE name, logos, board artwork,
distinctive branded tile treatment, rule text, or a copied official word list.
Free distribution does not remove brand or artwork risk; the final visual system
should remain unmistakably original.

## Architecture and persistence

`app/apps/tile-tally/physicalTileBoard.ts` is the platform-neutral engine. Its
`PhysicalTileBoard` class accepts plain commands and returns immutable snapshots
without importing React, the DOM, browser storage, or animation scheduling.
`tabletopModel.ts` contains geometry and physics helpers; `TilesView.tsx` is the
web/touch adapter.

Tile identity, resting pose, blank assignments, orientation, and explicit
snap/lock links are stored in versioned browser local storage, namespaced to the
signed-in user. The table survives reloads in that browser but does not sync to
Supabase or another device. Velocity, selection, full-screen state, motion
permission, and dictionary-check state are not persisted.

Motion samples remain in the browser and are neither stored nor transmitted.
Manual scatter remains available when motion access is unsupported or denied.

## PWA and native path

The same table runs in the browser and installable Game Ledger PWA. A future
Capacitor adapter can reuse the engine while providing native haptics, motion,
full-screen, and sharing integrations. The engine should remain the single
source of truth rather than creating separate iOS and Android physics models.

## Tests

The model has deterministic tests for grouping, insertion, snapping, locking,
orientation, collision, momentum, bounds, persistence, and scatter. Playwright
exercises mouse and mobile-WebKit pointer flows, accessibility controls,
full-screen mode, device-motion permission states, and persistence.

```bash
npm run test:e2e:tiles
```
