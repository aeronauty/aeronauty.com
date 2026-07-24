#!/usr/bin/env python3
"""Convert downloaded Flow360 results into public/urans/cases.json.

Expects results/<case-id>/total_forces.csv (columns incl. physical_step or
time, CL, CD, CM...) and results/<case-id>/surface_cp.csv (columns x, y, Cp in
surface order). Time-averages the last AVG_FRACTION of the force history.
Optionally attaches the matching flexfoil lattice numbers for the table.
"""

import csv
import json
import re
import time
from pathlib import Path

AVG_FRACTION = 0.3  # average the last 30% of the history
RESULTS = Path(__file__).parent / "results"
SITE_PUBLIC = Path(__file__).parents[2] / "public"
OUT = SITE_PUBLIC / "urans" / "cases.json"
LATTICE = SITE_PUBLIC / "flexfoil-data" / "lattice.json"

ID_RE = re.compile(r"c(\d+)-p(\d+)-t(\d+)-a(-?\d+(?:\.\d+)?)")


def read_csv(path):
    with path.open() as f:
        return list(csv.DictReader(f))


def mean_tail(rows, key):
    vals = [float(r[key]) for r in rows if r.get(key) not in (None, "")]
    n = max(1, int(len(vals) * AVG_FRACTION))
    tail = vals[-n:]
    return sum(tail) / len(tail)


def flexfoil_numbers(camber, pos, thick, alpha):
    """Matching lattice cell numbers, only when the alpha genuinely matches."""
    if not LATTICE.exists():
        return None
    data = json.loads(LATTICE.read_text())
    key = f"c{camber}-p{pos}-t{thick}"
    section = data["sections"].get(key)
    if not section:
        return None
    alphas = data["meta"]["alphas"]
    best = min(range(len(alphas)), key=lambda i: abs(alphas[i] - alpha))
    if abs(alphas[best] - alpha) > 0.26:  # never compare across a real alpha gap
        return None
    row = section["polar"][best]
    if not row:
        return None
    return {"cl": row[0], "cd": row[1]}


def main():
    cases = []
    for case_dir in sorted(RESULTS.iterdir()) if RESULTS.exists() else []:
        m = ID_RE.fullmatch(case_dir.name)
        forces = case_dir / "total_forces.csv"
        surface = case_dir / "surface_cp.csv"
        if not (m and forces.exists() and surface.exists()):
            continue
        camber, pos, thick = int(m[1]), int(m[2]), int(m[3])
        alpha = float(m[4])

        frows = read_csv(forces)
        srows = read_csv(surface)
        cp_key = next(k for k in srows[0] if k.lower() in ("cp", "pressurecoefficient"))
        x_key = next(k for k in srows[0] if k.lower() in ("x", "x/c", "xc"))

        cases.append(
            {
                "id": case_dir.name,
                "camberPct": camber,
                "camberPosPct": pos,
                "thicknessPct": thick,
                "alphaDeg": alpha,
                "re": 1.0e6,
                "mach": 0.1,
                "solver": "Flow360 URANS (SA)",
                "cl": round(mean_tail(frows, "CL"), 4),
                "cd": round(mean_tail(frows, "CD"), 5),
                "cm": round(mean_tail(frows, "CMz"), 4) if "CMz" in frows[0] else None,
                "flexfoil": flexfoil_numbers(camber, pos, thick, alpha),
                "cp": {
                    "x": [round(float(r[x_key]), 4) for r in srows],
                    "cp": [round(float(r[cp_key]), 3) for r in srows],
                },
            }
        )
        print(f"exported {case_dir.name}")

    if not cases:
        raise SystemExit("no complete cases found under results/ — nothing exported")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"generated": time.strftime("%Y-%m-%d"), "cases": cases}, separators=(",", ":")))
    print(f"wrote {OUT} ({len(cases)} case(s))")


if __name__ == "__main__":
    main()
