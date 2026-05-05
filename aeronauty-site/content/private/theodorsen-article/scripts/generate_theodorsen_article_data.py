#!/usr/bin/env python3
"""Generate data for the private Theodorsen article widgets.

The script builds the local JSON consumed by the standalone figure widgets:

- Theodorsen's C(k), evaluated from scipy Hankel functions.
- A FlexFoil quasi-steady NACA 0012 polar and fitted lift slope.
- Time-domain wake-memory approximations for history-integral explanations.
- Harmonic response and pitch/plunge component summaries.
- A placeholder Flow360 comparison ladder schema.

It does not run Flow360. The ladder rows are intentionally schema-shaped
placeholders that can be replaced by actual case outputs later.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from scipy import special


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "data" / "theodorsen_article_data.json"

WAGNER_A1 = 0.165
WAGNER_A2 = 0.335
WAGNER_B1 = 0.0455
WAGNER_B2 = 0.3


@dataclass
class LadderRow:
    id: str
    model: str
    layer: str
    memory: str
    closure: str
    resolves_unsteadiness: bool
    viscous: bool
    relative_cost: float
    status: str
    flow360_schema: dict[str, Any]
    analogy_note: str
    maths_note: str


def theodorsen_complex(k: np.ndarray | float) -> np.ndarray:
    """Return C(k) = H_1^(2)(k) / (H_1^(2)(k) + i H_0^(2)(k))."""

    k_arr = np.asarray(k, dtype=float)
    k_safe = np.maximum(k_arr, 1.0e-7)
    h0 = special.hankel2(0, k_safe)
    h1 = special.hankel2(1, k_safe)
    return h1 / (h1 + 1j * h0)


def wagner(s: np.ndarray | float) -> np.ndarray:
    s_arr = np.asarray(s, dtype=float)
    return 1.0 - WAGNER_A1 * np.exp(-WAGNER_B1 * s_arr) - WAGNER_A2 * np.exp(-WAGNER_B2 * s_arr)


def wagner_kernel(s: np.ndarray | float) -> np.ndarray:
    s_arr = np.asarray(s, dtype=float)
    return WAGNER_A1 * WAGNER_B1 * np.exp(-WAGNER_B1 * s_arr) + WAGNER_A2 * WAGNER_B2 * np.exp(-WAGNER_B2 * s_arr)


def flexfoil_quasi_steady(naca: str, re: float, mach: float, alpha_span: float, alpha_step: float) -> dict[str, Any]:
    try:
        import flexfoil
    except ImportError as exc:  # pragma: no cover
        raise SystemExit("Install FlexFoil first: python3 -m pip install flexfoil") from exc

    foil = flexfoil.naca(naca, n_panels=180)
    polar = foil.polar(
        alpha=(-alpha_span, alpha_span, alpha_step),
        Re=re,
        mach=mach,
        viscous=True,
        store=False,
        parallel=False,
    )

    rows = []
    for result in polar.results:
        rows.append(
            {
                "alphaDeg": float(result.alpha),
                "alphaRad": float(math.radians(result.alpha)),
                "cl": float(result.cl),
                "cd": float(result.cd),
                "cm": float(result.cm),
                "success": bool(result.success),
                "converged": bool(result.converged),
            }
        )

    fit_rows = [row for row in rows if row["success"] and abs(row["alphaDeg"]) <= min(4.0, alpha_span)]
    if len(fit_rows) >= 2:
        slope, intercept = np.polyfit(
            np.array([row["alphaRad"] for row in fit_rows]),
            np.array([row["cl"] for row in fit_rows]),
            1,
        )
    else:
        slope = 2.0 * math.pi
        intercept = 0.0

    return {
        "airfoil": f"NACA {naca}",
        "reynolds": re,
        "mach": mach,
        "alphaSpanDeg": alpha_span,
        "alphaStepDeg": alpha_step,
        "liftSlopePerRad": float(slope),
        "zeroLiftCl": float(intercept),
        "rows": rows,
        "source": "FlexFoil",
    }


def build_theodorsen_table() -> list[dict[str, float]]:
    k = np.concatenate(([0.001], np.linspace(0.01, 2.0, 220)))
    c = theodorsen_complex(k)
    return [
        {
            "k": float(ki),
            "F": float(ci.real),
            "G": float(ci.imag),
            "magnitude": float(abs(ci)),
            "phaseDeg": float(np.angle(ci, deg=True)),
        }
        for ki, ci in zip(k, c)
    ]


def build_reduced_frequency_examples() -> list[dict[str, float | str]]:
    chord_m = 1.0
    speed_mps = 50.0
    rows = []
    for frequency_hz in [0.25, 0.5, 1.0, 2.0, 4.0, 8.0, 12.0]:
        omega = 2.0 * math.pi * frequency_hz
        k = omega * chord_m / (2.0 * speed_mps)
        rows.append(
            {
                "label": f"{frequency_hz:g} Hz",
                "frequencyHz": frequency_hz,
                "omegaRadSec": omega,
                "speedMps": speed_mps,
                "chordM": chord_m,
                "k": k,
                "convectiveHalfChordSeconds": chord_m / (2.0 * speed_mps),
            }
        )
    return rows


def build_history_data(lift_slope: float) -> dict[str, Any]:
    s = np.linspace(0.0, 28.0, 180)
    alpha_final = math.radians(5.0)
    step_cl = lift_slope * alpha_final * wagner(s)
    quasi_cl = np.full_like(s, lift_slope * alpha_final)
    ramp_alpha = alpha_final * np.minimum(s / 8.0, 1.0)
    ds = s[1] - s[0]
    ramp_cl = []
    for i, si in enumerate(s):
        kernel = wagner_kernel(si - s[: i + 1])
        dalpha_ds = np.gradient(ramp_alpha[: i + 1], ds) if i > 1 else np.array([alpha_final / 8.0] * (i + 1))
        ramp_cl.append(float(lift_slope * np.trapezoid(dalpha_ds * kernel, s[: i + 1])))

    return {
        "kernel": [
            {"s": float(si), "phi": float(ph), "dPhiDs": float(kern)}
            for si, ph, kern in zip(s, wagner(s), wagner_kernel(s))
        ],
        "stepResponse": [
            {"s": float(si), "quasiCl": float(qi), "memoryCl": float(mi)}
            for si, qi, mi in zip(s, quasi_cl, step_cl)
        ],
        "rampResponse": [
            {"s": float(si), "alphaDeg": float(math.degrees(ai)), "memoryCl": float(ci)}
            for si, ai, ci in zip(s, ramp_alpha, ramp_cl)
        ],
        "notes": {
            "analogy": "A sudden command does not produce full lift instantly; the wake has to catch up.",
            "maths": "Uses the common two-exponential Wagner approximation as the time-domain companion to C(k).",
        },
    }


def build_harmonic_data(lift_slope: float) -> dict[str, Any]:
    phase = np.linspace(0.0, 2.0 * math.pi, 181)
    alpha_amp = math.radians(4.0)
    k_values = [0.02, 0.08, 0.18, 0.35, 0.7, 1.2]
    cases = []
    for k in k_values:
        c = complex(theodorsen_complex(k))
        quasi = lift_slope * alpha_amp * np.sin(phase)
        theo = lift_slope * alpha_amp * abs(c) * np.sin(phase + np.angle(c))
        cases.append(
            {
                "k": k,
                "magnitude": float(abs(c)),
                "phaseDeg": float(np.angle(c, deg=True)),
                "samples": [
                    {
                        "cycle": float(p / (2.0 * math.pi)),
                        "alphaNorm": float(math.sin(p)),
                        "quasiCl": float(q),
                        "theodorsenCl": float(t),
                        "collapsedCl": float(t / max(1.0e-9, abs(c))),
                        "phaseCorrectedCl": float(lift_slope * alpha_amp * math.sin(p)),
                    }
                    for p, q, t in zip(phase, quasi, theo)
                ],
            }
        )
    return {
        "alphaAmplitudeDeg": 4.0,
        "cases": cases,
        "notes": {
            "analogy": "Different oscillations look messy until the wake's delay and attenuation are accounted for.",
            "maths": "Dividing by |C(k)| and removing phase aligns the circulatory harmonic response.",
        },
    }


def build_pitch_plunge_data(lift_slope: float) -> dict[str, Any]:
    ks = np.linspace(0.02, 1.3, 90)
    pitch_amp = math.radians(3.0)
    plunge_over_chord = 0.04
    rows = []
    for k in ks:
        c = complex(theodorsen_complex(k))
        plunge_effective_alpha = 2.0 * k * plunge_over_chord
        pitch_circ = lift_slope * pitch_amp * c
        plunge_circ = lift_slope * plunge_effective_alpha * c * complex(0.0, 1.0)
        pitch_added = math.pi * (k**2) * pitch_amp * complex(1.0, 0.0)
        plunge_added = math.pi * k * plunge_over_chord * complex(0.0, 1.0)
        total = pitch_circ + plunge_circ + pitch_added + plunge_added
        rows.append(
            {
                "k": float(k),
                "pitchCirculatoryReal": float(pitch_circ.real),
                "pitchCirculatoryImag": float(pitch_circ.imag),
                "plungeCirculatoryReal": float(plunge_circ.real),
                "plungeCirculatoryImag": float(plunge_circ.imag),
                "pitchAddedMassReal": float(pitch_added.real),
                "pitchAddedMassImag": float(pitch_added.imag),
                "plungeAddedMassReal": float(plunge_added.real),
                "plungeAddedMassImag": float(plunge_added.imag),
                "totalMagnitude": float(abs(total)),
                "totalPhaseDeg": float(np.angle(total, deg=True)),
            }
        )
    return {
        "pitchAmplitudeDeg": 3.0,
        "plungeOverChord": plunge_over_chord,
        "rows": rows,
        "notes": {
            "analogy": "Pitch and plunge both make lift, but they ask the wake different questions.",
            "maths": "Components are simplified thin-airfoil phasors: circulatory terms scaled by C(k), added-mass terms kept explicit.",
        },
    }


def build_ck_markers() -> list[dict[str, Any]]:
    values = []
    for label, k in [("quasi-steady edge", 0.02), ("article default", 0.18), ("wake-lag rich", 0.55), ("high-frequency limit", 1.2)]:
        c = complex(theodorsen_complex(k))
        values.append(
            {
                "label": label,
                "k": k,
                "F": float(c.real),
                "G": float(c.imag),
                "magnitude": float(abs(c)),
                "phaseDeg": float(np.angle(c, deg=True)),
            }
        )
    return values


def build_model_ladder() -> list[dict[str, Any]]:
    rows = [
        LadderRow(
            id="thin-airfoil",
            model="Quasi-steady thin airfoil",
            layer="analytic baseline",
            memory="None: current angle maps directly to current lift.",
            closure="Inviscid, attached-flow lift slope",
            resolves_unsteadiness=False,
            viscous=False,
            relative_cost=1.0,
            status="generated",
            flow360_schema={},
            analogy_note="The wing acts as if the wake forgets instantly.",
            maths_note="CL = a0 alpha, with a0 fitted from the FlexFoil polar for these widgets.",
        ),
        LadderRow(
            id="theodorsen",
            model="Theodorsen + FlexFoil",
            layer="analytic unsteady correction",
            memory="Shed wake memory compressed into C(k).",
            closure="FlexFoil lift slope plus inviscid harmonic wake response",
            resolves_unsteadiness=True,
            viscous=False,
            relative_cost=2.0,
            status="generated",
            flow360_schema={},
            analogy_note="The wake becomes a delay-and-attenuation knob.",
            maths_note="The circulatory lift phasor is multiplied by C(k), evaluated with Hankel functions.",
        ),
        LadderRow(
            id="flow360-rans",
            model="Flow360 RANS",
            layer="steady CFD",
            memory="Steady mean-flow state; no resolved motion history.",
            closure="Turbulence model, steady residual convergence",
            resolves_unsteadiness=False,
            viscous=True,
            relative_cost=80.0,
            status="placeholder",
            flow360_schema={"solver": "RANS", "time": "steady", "outputs": ["CL", "CD", "CM", "surfaceCp"]},
            analogy_note="A high-fidelity photograph of the wrong instant if the motion matters.",
            maths_note="Useful for viscous baseline polar comparisons, not for harmonic phase lag.",
        ),
        LadderRow(
            id="flow360-urans",
            model="Flow360 URANS",
            layer="unsteady CFD",
            memory="Time-accurate mean-flow evolution with modeled turbulence.",
            closure="Dual-time or physical-time URANS",
            resolves_unsteadiness=True,
            viscous=True,
            relative_cost=450.0,
            status="placeholder",
            flow360_schema={"solver": "URANS", "time": "periodic", "outputs": ["cycleCL", "cycleCD", "cycleCM", "phaseAverage"]},
            analogy_note="The first practical CFD rung that can remember the moving wing.",
            maths_note="Will provide direct phase/amplitude comparisons against the C(k) widgets.",
        ),
        LadderRow(
            id="flow360-les-ddes",
            model="Flow360 LES / DDES",
            layer="resolved / hybrid unsteady CFD",
            memory="Large-scale wake structures evolve in the computed flow.",
            closure="LES or hybrid RANS-LES closure",
            resolves_unsteadiness=True,
            viscous=True,
            relative_cost=2200.0,
            status="placeholder",
            flow360_schema={"solver": "LES_DDES", "time": "periodic", "outputs": ["wakeQ", "vorticity", "cycleLoads", "spectra"]},
            analogy_note="The wake is no longer a knob; it is an object in the simulation.",
            maths_note="Reserved for separated or vortex-dominated cases where a scalar C(k) is too compressed.",
        ),
    ]
    return [asdict(row) for row in rows]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--naca", default="0012")
    parser.add_argument("--re", type=float, default=1.0e6)
    parser.add_argument("--mach", type=float, default=0.05)
    parser.add_argument("--alpha-span", type=float, default=8.0)
    parser.add_argument("--alpha-step", type=float, default=1.0)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    quasi = flexfoil_quasi_steady(args.naca, args.re, args.mach, args.alpha_span, args.alpha_step)
    lift_slope = float(quasi["liftSlopePerRad"])
    payload = {
        "meta": {
            "generatedBy": "content/private/theodorsen-article/scripts/generate_theodorsen_article_data.py",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "dependencies": ["flexfoil", "numpy", "scipy"],
            "notes": [
                "C(k) values are numerical Hankel-function evaluations.",
                "The history-integral data uses a two-exponential Wagner approximation.",
                "Flow360 ladder rows are placeholder schema entries, not completed CFD cases.",
            ],
        },
        "quasiSteady": quasi,
        "theodorsen": build_theodorsen_table(),
        "ckMarkers": build_ck_markers(),
        "reducedFrequency": build_reduced_frequency_examples(),
        "liftHistory": build_history_data(lift_slope),
        "harmonicCollapse": build_harmonic_data(lift_slope),
        "pitchPlunge": build_pitch_plunge_data(lift_slope),
        "modelLadder": build_model_ladder(),
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {args.out}")
    print(f"FlexFoil lift slope: {lift_slope:.4f} per rad")
    print(f"Theodorsen samples: {len(payload['theodorsen'])}")


if __name__ == "__main__":
    main()
