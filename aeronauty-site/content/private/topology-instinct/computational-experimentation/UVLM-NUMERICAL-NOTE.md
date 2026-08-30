# Finite-wing harmonic UVLM numerical note

## Purpose and boundary

Case 03 contains two separate trust cases:

1. a steady finite-wing vortex-lattice calibration against an independent Prandtl lifting-line solution; and
2. a small-amplitude pure-heave unsteady vortex-lattice experiment that compares three wake-kinematics assumptions.

The finite-wing response is not graded against Theodorsen. Theodorsen remains the two-dimensional, infinite-span reference in Cases 04 and 05. Case 03 instead normalises every unsteady result by the same finite wing's steady VLM lift slope and reports numerical periodicity and refinement diagnostics.

## Coordinates and forcing

The body frame uses `x` downstream, `y` from port to starboard and `z` upward. Positive filament circulation follows the right-hand rule. The flat wing remains fixed in the body frame. Pure heave is

```text
h(t)    = h0 sin(omega t)
hDot(t) = h0 omega cos(omega t)
omega   = 2 k U / c
wN(t)   = -hDot(t)
```

The no-penetration right-hand side is the normal component of body-frame ambient velocity plus the known wake-induced velocity. The moving-wing and fixed-loading pictures are therefore renderings of one numerical state, not two solvers.

## Lattice and shed wake

The wing uses rectangular vortex-ring panels with leading segments at panel quarter chord and collocation at panel three-quarter chord. The harmonic preset uses two chordwise rows and 6-10 cosine-spaced spanwise rows.

The steady horseshoe closure at `c + 0.25 dx` is not reused for UVLM. At time `tn` the current unknown trailing closure is instead

```text
xa = c + beta U dt
za = h(tn - beta dt) - h(tn)
beta = 0.25
```

For the flat mean-plane treatment, `za` is set to zero. The line is retained even when no wake panel exists yet. At the next time step the retained line becomes the downstream boundary of the newest wake-ring row, and

```text
GammaWake,new(n+1) = GammaBound,TE(n)
```

Once shed, a ring strength is never changed or deleted. This is the three-dimensional vortex-ring form of the unsteady Kutta/Helmholtz condition described by Katz and Plotkin, second edition, Section 13.12, especially Eq. 13.142.

## Wake treatments

- **Flat mean-plane:** wake rows advance downstream at `U dt`; all `z` coordinates remain zero.
- **TE history:** the birth line uses the trailing-edge height at shedding and every row receives the exact body-frame translation over the next step. Wake-on-wake motion is disabled.
- **Free roll-up:** the exact body-frame translation is combined with a Heun correction from bound- and wake-induced velocity. Incident filaments are excluded at their own nodes and a Rosenhead-Moore core of `0.03 c` regularises the convection calculation.

A full all-node/all-filament multi-cycle roll-up grows too quickly for a responsive browser. The public preset therefore uses a disclosed near-wake approximation: all shed rows remain in the topology and induce velocity on the wing and on the active near wake, but induced-motion corrections are applied only to the newest 12 rows. Older rows continue with exact body-frame convection. Transverse displacement is multiplied by five in the drawing only.

## Pressure loading and harmonic response

For each panel, the pressure load includes chordwise and spanwise circulation differences, the local wake-tangential velocity, and the time change of the panel potential. The animated instantaneous trace uses a second-order BDF2 derivative after startup, then removes the same analytic no-wake added-mass term used by the reported phasor. The trace and readout therefore show the same pressure-derived circulatory quantity.

The reported phase does not use that finite difference. Over the last complete cycle the worker least-squares fits:

```text
Q(t) = instantaneous tangential/circulatory pressure term
P(t) = rho sum(Gamma_ij S_ij) / (qInf Sref)
LHat = QHat + i omega PHat
```

A no-wake unit-normal-flow solve supplies the added-mass potential gain. It uses the mean-plane harmonic lattice, including the actual unsteady closure at `c + beta U dt`; it does not reuse the steady closure at the physical trailing edge. Its `i omega` contribution is subtracted from `LHat`. The remaining circulatory phasor is normalised by

```text
CLalpha,steady,VLM * (wNHat / U)
```

The reader reports the magnitude retained, `1 - magnitude` as lift deficiency, and `-arg(H)` as lag.

## Publication gates

The public preset uses four cycles, 24 steps per cycle, `h0/c = 0.03`, a two-row chordwise lattice, and fits the last cycle. A magnitude or phase is shown only when the last cycle and the preceding cycle satisfy:

- flat and TE-history: relative magnitude change at most 3%, wrapped phase change at most 2 degrees, harmonic-fit RMS at most 2%;
- free roll-up: relative magnitude change at most 5%, wrapped phase change at most 3 degrees, harmonic-fit RMS at most 5%;
- maximum no-penetration residual below `1e-10 U`;
- TE shedding and nodal filament-continuity residuals below `1e-12` after normalisation.

The cycle, fit and normalised residual checks form one publication gate. If any check fails, the reader labels the result transient and withholds the phase comparison.

## Automated checks

`test-vlm-core.mjs` and `test-vlm-worker.mjs` cover:

- the Katz-Plotkin finite-segment sign and regularised-core limit;
- quarter-/three-quarter-chord placement and the independent steady lifting-line trend;
- the exact `c + 0.25 U dt` trailing-closure fixture;
- first-step zero wake panels, second-step one full-length wake panel, and exact previous-TE strength transfer;
- synthetic harmonic amplitude, phase and offset recovery;
- exact agreement between TE-history and free wake when induced motion is disabled;
- deterministic multi-cycle response, periodicity gates and preserved wake-row count;
- no-penetration, shedding and filament-continuity residuals;
- timestep, core, active-row and grid sensitivity; and
- worker protocol, input clamping, progress, stale-result correlation and compact snapshot output.

The formulation follows Katz and Plotkin, *Low-Speed Aerodynamics*, second edition, Chapter 13: trailing-edge placement and circulation conservation in Sections 13.8.2 and 13.12; the unsteady boundary system in Eqs. 13.142-13.147; pressure loading in Eqs. 13.148-13.151; and wake convection in Eqs. 13.153-13.154.
