#!/usr/bin/env python3
"""Precompute the viscous overlay lattice for /apps/circulation using flexfoil.

Sections are generated with EXACTLY the same four-digit-family formulas as
lib/foil/geometry.ts (parabolic camber line, closed-TE thickness polynomial,
cosine loop spacing), fed to flexfoil.from_coordinates in standard Selig
order, and swept in alpha at fixed Re/ncrit. Surface Cp is reconstructed from
the boundary-layer edge velocity (cp = 1 - ue^2) — flexfoil's SolveResult.cp
is explicitly the INVISCID pass even for viscous solves, so storing it would
mislabel the overlay. Output: public/flexfoil-data/lattice.json.

Usage:
    python3 -m venv .venv && .venv/bin/pip install flexfoil
    .venv/bin/python scripts/flexfoil-viscous.py

Run from aeronauty-site/. Takes a few minutes.
"""

import json
import math
import sys
import time
from pathlib import Path

import flexfoil

RE = 1.0e6
NCRIT = 9.0
MACH = 0.0
CAMBERS = [0, 1, 2, 3, 4, 5, 6]  # percent chord
POSITIONS = [30, 40, 50]  # percent chord
THICKNESSES = [8, 10, 12, 15, 18]  # percent chord
ALPHAS = [round(-8 + 0.5 * i, 1) for i in range(41)]  # -8 .. 12 deg
CP_ALPHAS = [-4, 0, 2, 4, 6, 8, 10]
N_PANELS = 160


def camber_line(x: float, m: float, p: float) -> float:
    if m == 0:
        return 0.0
    if x < p:
        return (m / p**2) * (2 * p * x - x * x)
    q = 1 - p
    return (m / q**2) * (1 - 2 * p + 2 * p * x - x * x)


def camber_slope(x: float, m: float, p: float) -> float:
    if m == 0:
        return 0.0
    if x < p:
        return (2 * m / p**2) * (p - x)
    q = 1 - p
    return (2 * m / q**2) * (p - x)


def thickness_dist(x: float, t: float) -> float:
    s = math.sqrt(max(x, 0.0))
    return 5 * t * (0.2969 * s - 0.126 * x - 0.3516 * x**2 + 0.2843 * x**3 - 0.1036 * x**4)


def section_xy(m: float, p: float, t: float, n: int = N_PANELS):
    """Same surface points as sectionNodes() in lib/foil/geometry.ts, but in
    standard airfoil-file order (TE -> upper -> LE -> lower), which is what
    flexfoil's paneling expects — the reversed winding makes its solve blow up.
    """
    xs, ys = [], []
    for k in range(n):
        beta = 2 * math.pi * k / n
        x = 0.5 * (1 + math.cos(beta))
        yc = camber_line(x, m, p)
        yt = thickness_dist(x, t)
        theta = math.atan(camber_slope(x, m, p))
        lower = beta < math.pi
        if lower:
            xs.append(x + yt * math.sin(theta))
            ys.append(yc - yt * math.cos(theta))
        else:
            xs.append(x - yt * math.sin(theta))
            ys.append(yc + yt * math.cos(theta))
    xs = [xs[0]] + xs[1:][::-1]
    ys = [ys[0]] + ys[1:][::-1]
    return xs, ys


def main() -> int:
    out_path = Path("public/flexfoil-data/lattice.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    sections = {}
    n_total = len(CAMBERS) * len(POSITIONS) * len(THICKNESSES)
    done = 0
    t0 = time.time()

    for c in CAMBERS:
        for p in POSITIONS:
            for t in THICKNESSES:
                key = f"c{c}-p{p}-t{t}"
                xs, ys = section_xy(c / 100, p / 100, t / 100)
                foil = flexfoil.from_coordinates(xs, ys, name=key, n_panels=N_PANELS)

                polar = foil.polar(ALPHAS, Re=RE, mach=MACH, ncrit=NCRIT, store=False)
                by_alpha = {round(r.alpha, 1): r for r in polar.results}
                rows = []
                for a in ALPHAS:
                    r = by_alpha.get(a)
                    if r is None or not r.success or not r.converged:
                        rows.append(None)
                    else:
                        rows.append(
                            [
                                round(r.cl, 4),
                                round(r.cd, 5),
                                round(r.cm, 4),
                                round(r.x_tr_upper, 3),
                                round(r.x_tr_lower, 3),
                            ]
                        )

                cps = {}
                for a in CP_ALPHAS:
                    # viscous Cp from the BL edge velocity; assembled in the
                    # panel-code plotting order TE -> lower -> LE -> upper
                    bl = foil.bl_distribution(alpha=a, Re=RE, mach=MACH, ncrit=NCRIT)
                    if bl.success and bl.converged and bl.ue_upper and bl.ue_lower:
                        xs_arr = list(reversed(bl.x_lower)) + list(bl.x_upper)
                        cp_arr = [1 - u * u for u in reversed(bl.ue_lower)] + [
                            1 - u * u for u in bl.ue_upper
                        ]
                        cps[str(a)] = {
                            "x": [round(v, 4) for v in xs_arr],
                            "cp": [round(v, 3) for v in cp_arr],
                        }

                sections[key] = {"polar": rows, "cp": cps}
                done += 1
                if done % 10 == 0 or done == n_total:
                    print(f"  {done}/{n_total} sections ({time.time() - t0:.0f}s)", flush=True)

    payload = {
        "meta": {
            "re": RE,
            "ncrit": NCRIT,
            "mach": MACH,
            "cambers": CAMBERS,
            "positions": POSITIONS,
            "thicknesses": THICKNESSES,
            "alphas": ALPHAS,
            "cpAlphas": CP_ALPHAS,
            "nPanels": N_PANELS,
            "generated": time.strftime("%Y-%m-%d"),
            "solver": "flexfoil " + getattr(flexfoil, "__version__", "unknown"),
        },
        "sections": sections,
    }
    out_path.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"wrote {out_path} ({out_path.stat().st_size / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
