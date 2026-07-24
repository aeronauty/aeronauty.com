# Flow360 URANS comparison for /apps/circulation

Adds the heavy-artillery tier to the Circulation Machine: the same section the
panel code and flexfoil solve, run as a time-accurate URANS case in Flow360,
with the time-averaged surface Cp and force coefficients displayed on the page
next to the inviscid panel result and the flexfoil viscous overlay.

**Status: scaffold.** Everything on the site side is live — the page section
(`app/apps/circulation/UransSection.tsx`) renders automatically as soon as
`public/urans/cases.json` exists. What needs a human with a Flow360 account is
running the actual cases. The scripts here are written against the v2 Python
client (`pip install flow360`) but are **untested against a live account** —
check `run_case.py` against the current team template for 2D airfoil cases
before submitting (mesh settings especially).

## Workflow

1. `python3 -m venv .venv && .venv/bin/pip install flow360`
2. Configure credentials (`flow360 configure`, or `FLOW360_APIKEY`).
3. Edit the CASES list in `run_case.py` (defaults: the lattice's showcase
   cells at Re 1e6, M 0.1 — matching the flexfoil lattice conditions).
4. `.venv/bin/python run_case.py` — TODAY this only generates the section
   geometry (`results/<case-id>/<case-id>.dat`, identical formulas to the
   site) and then exits at the marked TODO. Fill in the meshing/params block
   from the team template; once filled it should submit, wait, and download
   `surface_cp.csv` and `total_forces.csv` per case into `results/<case-id>/`.
   Adjust the CSV column names in `export_results.py` to whatever the
   download actually contains (it sniffs a few common ones and will KeyError
   on the rest).
5. `.venv/bin/python export_results.py` — time-averages the last N periods,
   writes/updates `../../public/urans/cases.json`.
6. Commit `public/urans/cases.json` and deploy. The URANS card appears on the
   page automatically.

## Case standards (so the comparison is honest)

- Match the flexfoil lattice conditions: Re_c = 1.0e6, ncrit is moot (URANS is
  fully turbulent unless transition model enabled — note it on the page copy
  if you enable AFT), M = 0.1 as the incompressible stand-in.
- 2D: one-cell extrusion, symmetry (slip) side walls.
- y+ < 1 first cell; farfield ≥ 100 c.
- Unsteady: 2nd-order time stepping; Δt ≈ 0.01 c/U∞ with ≥ 20 pseudo-steps,
  run ≥ 30 convective times, average the last 10 (steady cases will just
  converge flat — cheap insurance for the high-α points).
- Turbulence: SpalartAllmaras to match what the page copy claims. If you use
  SST or enable transition, update `solver` in the exported JSON — the page
  displays that string verbatim.

## Output schema (`public/urans/cases.json`)

```json
{
  "generated": "YYYY-MM-DD",
  "cases": [
    {
      "id": "c4-p40-t12-a6",
      "camberPct": 4, "camberPosPct": 40, "thicknessPct": 12, "alphaDeg": 6,
      "re": 1e6, "mach": 0.1,
      "solver": "Flow360 URANS (SA)",
      "cl": 1.05, "cd": 0.0102, "cm": -0.09,
      "flexfoil": { "cl": 1.02, "cd": 0.0095 },
      "cp": { "x": [0.0, ...], "cp": [1.0, ...] }
    }
  ]
}
```

`cp.x` is x/c from 0..1 in surface order (TE → lower → LE → upper → TE, same
convention as the panel code); `flexfoil` is optional and filled by
`export_results.py` from the lattice JSON when the case matches a cell.
