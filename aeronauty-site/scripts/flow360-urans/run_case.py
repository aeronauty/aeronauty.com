#!/usr/bin/env python3
"""Submit Flow360 URANS cases for Circulation Machine sections.

SCAFFOLD — written against the flow360 v2 Python client but not yet run
against a live account. Before submitting real (billable) cases, diff the
meshing/params blocks against the current team template for 2D airfoil
work; the section generation and the results contract are the stable parts.

Sections are generated with the same four-digit-family formulas as
lib/foil/geometry.ts and scripts/flexfoil-viscous.py (keep the three in sync).
"""

import math
from pathlib import Path

# ---- cases to run: showcase cells of the flexfoil lattice ----
CASES = [
    # (camber %, camber pos %, thickness %, alpha deg)
    (4, 40, 12, 6),
    (4, 40, 12, 10),
    (0, 40, 12, 6),
]
RE = 1.0e6
MACH = 0.1
N_SURFACE_POINTS = 240

RESULTS = Path(__file__).parent / "results"


# ---- section geometry (mirror of lib/foil/geometry.ts) ----

def camber_line(x, m, p):
    if m == 0:
        return 0.0
    if x < p:
        return (m / p**2) * (2 * p * x - x * x)
    q = 1 - p
    return (m / q**2) * (1 - 2 * p + 2 * p * x - x * x)


def camber_slope(x, m, p):
    if m == 0:
        return 0.0
    if x < p:
        return (2 * m / p**2) * (p - x)
    q = 1 - p
    return (2 * m / q**2) * (p - x)


def thickness_dist(x, t):
    s = math.sqrt(max(x, 0.0))
    return 5 * t * (0.2969 * s - 0.126 * x - 0.3516 * x**2 + 0.2843 * x**3 - 0.1036 * x**4)


def section_xy(m, p, t, n=N_SURFACE_POINTS):
    xs, ys = [], []
    for k in range(n):
        beta = 2 * math.pi * k / n
        x = 0.5 * (1 + math.cos(beta))
        yc = camber_line(x, m, p)
        yt = thickness_dist(x, t)
        theta = math.atan(camber_slope(x, m, p))
        if beta < math.pi:
            xs.append(x + yt * math.sin(theta))
            ys.append(yc - yt * math.cos(theta))
        else:
            xs.append(x - yt * math.sin(theta))
            ys.append(yc + yt * math.cos(theta))
    return xs, ys


def write_dat(case_id, xs, ys):
    out = RESULTS / case_id
    out.mkdir(parents=True, exist_ok=True)
    dat = out / f"{case_id}.dat"
    with dat.open("w") as f:
        f.write(f"{case_id}\n")
        # Selig order: TE -> upper -> LE -> lower -> TE (reverse of our loop)
        idx = [0] + list(range(len(xs) - 1, 0, -1))
        for i in idx:
            f.write(f"{xs[i]:.6f} {ys[i]:.6f}\n")
        f.write(f"{xs[0]:.6f} {ys[0]:.6f}\n")
    return dat


def main():
    # geometry generation needs no flow360 install: write every .dat first so
    # the meshing team has the inputs even before the template is filled in
    for c, p, t, a in CASES:
        case_id = f"c{c}-p{p}-t{t}-a{a}"
        xs, ys = section_xy(c / 100, p / 100, t / 100)
        dat = write_dat(case_id, xs, ys)
        print(f"[{case_id}] wrote {dat}")

    # ----------------------------------------------------------------------
    # TODO(team template): the untested part. Intent, matching the README
    # case standards, per case:
    #   * 2D extruded mesh from the .dat (one cell thick, slip sides),
    #     y+ < 1, farfield >= 100 c
    #   * fl.SimulationParams with:
    #       - operating condition from RE, MACH (chord = 1)
    #       - alpha per case
    #       - SpalartAllmaras
    #       - unsteady 2nd order: dt = 0.01 c/U, >= 3000 physical steps,
    #         >= 20 pseudo-steps each
    #       - surface output: Cp on the airfoil wall
    #       - force output: CL, CD, CM history
    #   * project = fl.Project.from_geometry(...); case = project.run_case(...)
    #   * download the force history and wall Cp slice into
    #     results/<case_id>/total_forces.csv and surface_cp.csv
    # ----------------------------------------------------------------------
    raise SystemExit(
        "Geometry written for all cases. Case submission is a scaffold: fill "
        "in the Flow360 meshing/params block from the team 2D airfoil "
        "template before running (see README)."
    )


if __name__ == "__main__":
    main()
