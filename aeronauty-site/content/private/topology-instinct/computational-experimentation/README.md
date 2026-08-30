# Computational Experimentation

Aeronauty long-form essay package.

## Source of truth

The prose lives in the Google Doc, not in this directory:

- Document: `1Kr4WRmlAJeHkxZPBLpQl3Wz2U2rHTvRkh3a8EDhLMEs`
- Tab: `t.0`
- URL: <https://docs.google.com/document/d/1Kr4WRmlAJeHkxZPBLpQl3Wz2U2rHTvRkh3a8EDhLMEs/edit?tab=t.0>

`article-source.md` and `source-metadata.json` are generated derivatives. Do not hand-edit the prose snapshot. `article.html` owns only presentation and reads the snapshot at runtime.

## Sync and validate

The sync script uses Application Default Credentials through the site’s existing `googleapis` dependency. The authenticated principal must be able to read the Doc.

```bash
cd aeronauty-site
npm run sync:computational-experimentation
npm run test:computational-experimentation
```

That workflow:

1. reads the authoritative Google Doc and tab;
2. writes `article-source.md` plus revision metadata;
3. validates the marker contract and article shell;
4. runs the numerical acceptance tests used by the visible vortex demonstrations.

For local user credentials, `gcloud auth application-default login` is the simplest route. CI does not need Doc credentials because it validates the committed snapshot rather than silently pulling mutable prose.

## Editorial markers

The runtime renderer turns the editor’s markers into article components:

- `[<callout>... ]` → interactive asterisk aside;
- `[<put this in a little side callout>... ]` → wider side aside;
- the five panel/wake instructions → the corresponding interactive calibration instruments;
- `[<Show the page of my dissertation.>]` → an explicitly labelled schematic until the archival page is supplied;
- `— — —` → a styled section boundary.

Unrecognised top-level `[<...>]` instructions render as visible errors rather than disappearing.

## Numerical trust case

`article.html` and `test-vortex-core.mjs` use `vortex-core.js`. The aerodynamic test checks:

- the canonical unit-panel result;
- closed form against independent midpoint quadrature;
- vector superposition;
- closure of discrete trailing-circulation jumps;
- Kelvin balance between bound and shed circulation.

This is deliberate: the demonstration and the automated check are two views of the same primitive.

The 3D readers also share `interaction-core.js` with `test-interaction-core.mjs`. Those checks cover the orthographic camera basis, projection round-trips, pointer-plane dragging, rigid filament translation, pan direction, cursor-anchored zoom, and recoverable camera limits.

Case 03 is a real finite-wing vortex-lattice solve. `vlm-core.js` is a clean-room browser implementation of the Katz–Plotkin quarter-chord / three-quarter-chord formulation used by Aeronauty's earlier browser circulation lab: one chordwise horseshoe row, cosine span spacing and a Kutta wake. It uses the same Weissinger-L placement and conventions and agrees with that lab's independent Rust/WASM result in the small-angle, very-long-wake limit. The reader reports the solved lift, an independent Prandtl lifting-line comparison, the no-penetration residual and trailing-sheet closure.

The optional coupled mode is not the old post-processed roll-up picture. `vlm-worker.js` sheds vortex rings from the solved trailing-edge circulation, convects the bounded wake with Heun integration under freestream plus bound- and wake-induced velocity, and feeds the displaced wake back into the next no-penetration solve. The visible march is deliberately bounded to 16 steps and 8–16 span panels. It is therefore labelled as a short impulsive-start snapshot, not a converged steady benchmark; the reader separates circulatory, acceleration and total unsteady-pressure lift. It also reports the core radius, TE shedding consistency and nodal filament continuity. Tests cover finite-segment sign, lattice placement, the steady benchmark, scalar/vector load consistency, lifting-line convergence, shedding consistency, incident-filament exclusion, deterministic wake snapshots, and bounded sensitivity to timestep, core and grid.

Cases 04 and 05 are two views of one staged unsteady experiment. `unsteady-core.js` contains the time-marching discrete-vortex model used by the worker and `test-unsteady-core.mjs`. The experiment uses pure heave with body-frame normal velocity `wN = -hDot`, quarter-panel bound vortices, three-quarter-panel collocation, an implicitly solved newest wake vortex, and Kelvin circulation closure.

The two two-dimensional wake stages deliberately separate assumptions:

1. **Fixed (flat)** means a fixed wake shape on the linearized mean plane; wake elements still convect downstream and influence the wing. This is the linearized validation case, and its displacement is suppressed in both input views.
2. **TE-following** keeps the trailing-edge height at which each element was shed, but prescribes downstream convection without wake-on-wake motion.
The numerical comparison is based on pressure-derived circulatory lift, not bound circulation alone. The discrete pressure load is reconstructed first, the pure-heave apparent-mass term is removed, and the fundamental harmonic is normalised as `H1 = CL,circ / (2π wN/U∞)`. The reader then compares `|H1|`, `1 - |H1|`, and `-arg(H1)` with Theodorsen's `C(k)`.

The canonical reference is the checked-in `assets/theodorsen-data.json` table generated from the Hankel-function definition of `C(k)`. The model formulation and placement conventions follow Katz & Plotkin, *Low-Speed Aerodynamics*, second edition, Chapter 13; the canonical result is Theodorsen, NACA Report 496. Only the linearized flat stage is expected to match the reference. The TE-history stage uses `h0/c = 0.06` to make finite-amplitude wake-geometry departures visible, and remains a comparison outside Theodorsen's flat-wake assumptions. The three-dimensional free wake stays in Case 03 and is never scored against Theodorsen.

## Reader routes

The published reader is available at:

`/writing/computational-experimentation`

The same package remains available through the gated Lab route at:

`/lab/articles/computational-experimentation`

## Photograph source

`obi-wan-nairobi.jpg` is the official Christian Craighead author portrait supplied in the high-resolution resources for *One Man In*. The rendered callout links to the [Simon & Schuster source page](https://www.simonandschuster.com/books/One-Man-In/Christian-Craighead/9781982177331) and includes its required credit: “Photograph by Drake Sweet/Bison films.”
