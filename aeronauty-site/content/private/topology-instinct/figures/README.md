# Figures — topology-instinct

Static SVGs and a single animated HTML preview for the scrollytelling article.
Hand-written, minimal external dependencies, no build step.

## Files

| File | Beat | Purpose |
|---|---|---|
| `adhd-flowchart-animated.html` | 8 | Two-state animated SVG, hand-drawn aesthetic via rough.js, scroll-triggered via IntersectionObserver, with replay button. Standalone preview file — the integration step lifts the `<div class="af-figure">` block plus the inline `<script>` into the article. |
| `data-as-dag.svg` | 7 | Single SVG, side-by-side: small pandas/CSV-shaped table on the left, small DAG (artifacts → operations → artifacts) on the right. Scales cleanly; article CSS can stack it on mobile. |

> Note: an earlier static-SVG version of the ADHD flowchart (variants A/B/C) was scrapped per the W15 revised brief. The animated HTML supersedes it.

## ADHD flowchart — animated

### Library stack

- **rough.js 4.6.6** for the hand-drawn stroke aesthetic — pulled from `unpkg.com` via inline `<script>` tag.
- **D3 v7** — referenced in case the file is opened standalone; the article already loads D3 so the integration step can drop the D3 tag if it dupes.
- **vanilla IntersectionObserver** for the scroll-into-view trigger.
- No bundler, no build step, no other deps.

### State 1 (the meme)

- Three loop nodes, pale yellow: `Get new idea`, `Start new project`, `Tell everyone`. Closed loop edges between them.
- A disconnected, greyed-out `Finish project` floating to the right of the loop. No edges.
- Caption beneath: *the original flowchart isn't mine but it bloody rings true*

### State 2 (post-AI, post-meds)

- Loop is preserved, untouched (no spin, no pulse — the loop is a fact).
- Four AI agent nodes fade in below the loop: `boilerplate`, `tests`, `data cleaning`, `lit review`. (Picked from the suggested list — no invented labels.)
- Delegation edges draw from `Start new project` down into each AI agent.
- Completion edges draw from each AI agent up into `Finish project`.
- `Finish project` colour-shifts grey → green with a 1.10× scale pulse.
- Caption swaps mid-animation to *here's what it looks like with AI agents (and some ADHD meds)*, then settles to *PhD supervisor energy. The brain that was a tax is now an asset.*

### Animation timeline

| t (s) | Event |
|---|---|
| 0.0 | State 1 fully rendered, first caption visible. |
| 0.8 | Caption swaps to mid caption. |
| 1.0 | AI agent nodes fade in (320ms each, 80ms stagger). |
| 1.5 | Delegation edges draw (~400ms, ease-in-out). |
| 2.0 | Completion edges draw (~300ms). |
| 2.3 | `Finish project` grey → green + 1.10× scale pulse (480ms). |
| 2.5 | Settled caption visible. |

Replay button bottom-right re-runs the timeline. Triggered once on scroll-into-view (`threshold: 0.35`).

### Visual style

- rough.js: `roughness=1.5`, `strokeWidth=2`, `fillStyle="hachure"`, fixed `seed` so theme-rebuilds don't visually flicker.
- Loop nodes pale yellow (`#fef9c3` / dark `#4a3508`).
- AI agent nodes pale blue (`#dbeafe` / dark `#1b2840`).
- `Finish project` grey (`#d1d5db` / dark `#2a2f36`) → green (`#bbf7d0` / dark `#14391f`).
- Captions outside the SVG (sibling `<div>`) so they reflow with body text scaling, but still inside the `.af-figure` block for ease of lifting.

### Accessibility

- `prefers-reduced-motion: reduce` → skips the timeline and jumps straight to the settled state with the final caption. Replay button still works (instantly).
- `prefers-color-scheme: dark` → SVG is rebuilt on scheme change so rough.js fills/strokes pick up the new theme variables (rough.js bakes colour into nodes at draw time, so this is the cleanest fix).
- `<title>` and `<desc>` on the SVG describe the figure for screen readers.

### Namespacing

- All CSS classes prefixed `af-` (adhd-flowchart-).
- JS wrapped in an IIFE assigned to `window.AdhdFlowchart` (exposes `play()`, `reset()`, `jumpToSettled()` for the integration step if it wants to drive the figure programmatically).

### Test

```bash
cd /Users/harry/aeronauty.com/aeronauty-site/public/articles/topology-instinct/figures
python3 -m http.server 8765
open http://localhost:8765/adhd-flowchart-animated.html
```

### Notes / deviations from the spec

- Picked `boilerplate`, `tests`, `data cleaning`, `lit review` from the suggested list. **No labels were invented.**
- Animation timing matches the spec exactly. The fade-in and pulse durations (320ms fade, 480ms pulse) were chosen to land cleanly inside the t=1.0→1.5 and t=2.3→2.5 windows respectively.
- The "draw-on" effect for delegation/completion edges uses `stroke-dasharray` + animated `stroke-dashoffset` on every `<path>` produced by rough.js (rough.js generates multiple sub-paths per shape — all of them animate together).
- D3 is included for the standalone preview but the figure itself only uses vanilla DOM + CSS transitions — D3 is not required at runtime. The integration step can omit the D3 `<script>` tag if D3 is already loaded by the article.

## Data-as-DAG figure

Single SVG, `viewBox="0 0 1000 480"`, intended to render at full article width on desktop. Two halves at x=30..470 and x=530..980 with a dashed vertical divider.

If the article CSS wants to stack the halves on mobile, the cleanest split is:
- left half ≈ `viewBox="0 0 500 480"` (the table + its title/subtitle), or
- two pre-split SVGs.

For now the single-SVG version scales acceptably down to ~600px wide before the table monospace text gets uncomfortably small.

### Dark-mode approach

CSS variables inside `<style>` inside `<defs>`, with a `prefers-color-scheme: dark` media query that flips them. Every stroke / fill / text colour reads from a variable. Box fills are `none` so the page background shows through in either mode. Arrowhead `<marker>` definitions reference the same variables so arrowheads track the theme.

The figure also defines `--accent-art` (artifact, blue-ish) and `--accent-op` (operation, amber-ish) so the two node types are colour-coded in both schemes.

### Fonts

System sans only:

```
-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif
```

Monospace for the table cells:

```
ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace
```

No webfont loads, nothing to import.
