#!/usr/bin/env python3
"""Generate seed data for the gated Theodorsen lab article.

The script deliberately separates three layers:

1. Theodorsen frequency response, evaluated numerically from Hankel functions.
2. FlexFoil quasi-steady 2D section data, used as the low-order lift slope.
3. A CFD ladder schema for later Flow360 RANS/URANS/LES/DDES overlays.

It does not run Flow360. The Flow360 entries are placeholders with the case
schema this article will consume once actual simulations exist.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
from scipy import special


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "data" / "theodorsen_quasi2d.json"


@dataclass
class ModelRow:
    model: str
    flow_memory: str
    viscous: bool
    resolved_unsteadiness: bool
    separated_flow: str
    relative_cost: float
    status: str
    note: str


def theodorsen(k: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Return F, G, magnitude, phase for C(k).

    C(k) = H_1^(2)(k) / (H_1^(2)(k) + i H_0^(2)(k)).

    This is a numerical special-function evaluation, not a tidy elementary
    expression. That distinction is the point of the article: Theodorsen
    compressed the wake-memory problem into a function, but evaluating that
    function is still a computational act.
    """

    k_safe = np.maximum(k, 1.0e-6)
    h0 = special.hankel2(0, k_safe)
    h1 = special.hankel2(1, k_safe)
    c = h1 / (h1 + 1j * h0)
    return c.real, c.imag, np.abs(c), np.angle(c, deg=True)


def flexfoil_quasi_steady(naca: str, re: float, mach: float, alpha_span: float) -> dict[str, Any]:
    try:
        import flexfoil
    except ImportError as exc:  # pragma: no cover - useful on fresh machines
        raise SystemExit("Install flexfoil first: python3 -m pip install flexfoil") from exc

    alpha = np.linspace(-alpha_span, alpha_span, 17)
    foil = flexfoil.naca(naca, n_panels=160)
    polar = foil.polar(alpha=alpha.tolist(), Re=re, mach=mach, viscous=True, store=False, parallel=False)

    rows = []
    for result in polar.results:
        rows.append(
            {
                "alphaDeg": float(result.alpha),
                "cl": float(result.cl),
                "cd": float(result.cd),
                "cm": float(result.cm),
                "success": bool(result.success),
                "converged": bool(result.converged),
            }
        )

    fit_rows = [row for row in rows if row["success"] and abs(row["alphaDeg"]) <= min(4.0, alpha_span)]
    if len(fit_rows) >= 2:
        alpha_rad = np.radians([row["alphaDeg"] for row in fit_rows])
        cl = np.array([row["cl"] for row in fit_rows])
        slope, intercept = np.polyfit(alpha_rad, cl, 1)
    else:
        slope = 2.0 * math.pi
        intercept = 0.0

    return {
        "airfoil": f"NACA {naca}",
        "reynolds": re,
        "mach": mach,
        "alphaSpanDeg": alpha_span,
        "liftSlopePerRad": float(slope),
        "zeroLiftCl": float(intercept),
        "rows": rows,
        "source": "flexfoil",
    }


def build_flow360_ladder() -> list[dict[str, Any]]:
    rows = [
        ModelRow(
            "Theodorsen + FlexFoil quasi-steady",
            "Wake memory compressed into C(k); section lift slope from FlexFoil.",
            False,
            True,
            "No separation model",
            1.0,
            "seeded",
            "The reference model for the first widgets.",
        ),
        ModelRow(
            "Flow360 RANS",
            "Steady mean-flow memory only.",
            True,
            False,
            "Modelled, steady",
            80.0,
            "planned",
            "Useful as the wrong comparison when the motion is genuinely unsteady.",
        ),
        ModelRow(
            "Flow360 URANS",
            "Time-accurate mean flow with modelled turbulence.",
            True,
            True,
            "Modelled, unsteady",
            450.0,
            "planned",
            "The first practical CFD comparison for oscillating-section loops.",
        ),
        ModelRow(
            "Flow360 LES",
            "Large eddies resolved; sub-grid turbulence modelled.",
            True,
            True,
            "Mostly resolved if the grid/time step earn it",
            9000.0,
            "planned",
            "Expensive truth-adjacent case for a simple quasi-2D section.",
        ),
        ModelRow(
            "Flow360 DDES",
            "RANS near walls, LES-like in separated regions.",
            True,
            True,
            "Hybrid",
            2200.0,
            "planned",
            "The pragmatic bridge for separated unsteady wake physics.",
        ),
    ]
    return [asdict(row) for row in rows]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--naca", default="0012")
    parser.add_argument("--re", type=float, default=1.0e6)
    parser.add_argument("--mach", type=float, default=0.05)
    parser.add_argument("--alpha-span", type=float, default=6.0)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    k = np.concatenate(([0.001], np.linspace(0.01, 2.0, 160)))
    f, g, mag, phase = theodorsen(k)
    quasi = flexfoil_quasi_steady(args.naca, args.re, args.mach, args.alpha_span)

    payload = {
        "generatedBy": "content/private/theodorsen/scripts/generate_quasi2d_data.py",
        "generatedAt": None,
        "notes": [
            "Theodorsen values are numerical Hankel-function evaluations.",
            "FlexFoil provides the quasi-steady section polar used by the widgets.",
            "Flow360 rows are a planned comparison schema, not completed CFD results.",
        ],
        "theodorsen": [
            {
                "k": float(ki),
                "F": float(fi),
                "G": float(gi),
                "magnitude": float(mi),
                "phaseDeg": float(pi),
            }
            for ki, fi, gi, mi, pi in zip(k, f, g, mag, phase)
        ],
        "quasiSteady": quasi,
        "flow360Ladder": build_flow360_ladder(),
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {args.out}")
    print(f"FlexFoil lift slope: {quasi['liftSlopePerRad']:.4f} per rad")


if __name__ == "__main__":
    main()
