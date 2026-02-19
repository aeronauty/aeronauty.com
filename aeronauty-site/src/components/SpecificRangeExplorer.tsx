"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import katex from "katex";
import "katex/dist/katex.min.css";

function Tex({ children, display = false }: { children: string; display?: boolean }) {
  const html = katex.renderToString(children, { displayMode: display, throwOnError: false });
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

// ============================================================
// ISA
// ============================================================
const ISA = {
  T0: 288.15, p0: 101325, rho0: 1.225, g: 9.80665,
  R: 287.058, gamma: 1.4, L: 0.0065, h_trop: 11000, T_trop: 216.65,
};

const PRESSURE_EXP = ISA.g / (ISA.R * ISA.L);

function atmosphere(h_m: number) {
  let T: number, p: number;
  if (h_m <= ISA.h_trop) {
    T = ISA.T0 - ISA.L * h_m;
    p = ISA.p0 * Math.pow(T / ISA.T0, PRESSURE_EXP);
  } else {
    T = ISA.T_trop;
    const p_trop = ISA.p0 * Math.pow(ISA.T_trop / ISA.T0, PRESSURE_EXP);
    p = p_trop * Math.exp(-ISA.g * (h_m - ISA.h_trop) / (ISA.R * ISA.T_trop));
  }
  const rho = p / (ISA.R * T);
  return { T, p, rho };
}

// ============================================================
// SR model
// ============================================================
interface Aircraft {
  S: number; CD0: number; k: number;
  TSFC_ref: number; Mdd0: number; kappa_CL: number;
}

function computeSpecificRange(h_m: number, M: number, W_kg: number, aircraft: Aircraft) {
  const { S, CD0, k, TSFC_ref, Mdd0, kappa_CL } = aircraft;
  const W = W_kg * ISA.g;
  const { T, p, rho } = atmosphere(h_m);
  const a = Math.sqrt(ISA.gamma * ISA.R * T);
  const V_TAS = M * a;
  const q = 0.5 * rho * V_TAS * V_TAS;
  const CL = W / (q * S);
  if (CL > 1.2) return null;
  let CD = CD0 + k * CL * CL;
  const Mcrit = Mdd0 - kappa_CL * CL;
  if (M > Mcrit) {
    const dM = M - Mcrit;
    CD += 20 * Math.pow(dM, 4);
  }
  const D = q * S * CD;
  const theta = T / ISA.T0;
  const TSFC = TSFC_ref * Math.sqrt(theta);
  const FF = TSFC * D;
  const SR_m_per_N = V_TAS / FF;
  const SR_NAM = SR_m_per_N * (1000 * ISA.g) / 1852;
  return { SR_NAM, CL, CD, Mcrit, V_TAS, D, FF, q, T, p, rho, a };
}

const DEFAULT_AIRCRAFT: Aircraft = {
  S: 139, CD0: 0.0275, k: 0.063,
  TSFC_ref: 1.89e-4, Mdd0: 0.88, kappa_CL: 0.17,
};

// ============================================================
// CSV parsing
// ============================================================
interface RefPoint { sr: number; altitude: number; }
interface RefCurve { mass: number; points: RefPoint[]; }

function parseDigitisedCSV(csv: string): RefCurve[] {
  const massMap: Record<string, number> = { "80": 80000, "100": 100000, "120": 120000, "140": 140000 };
  const result: RefCurve[] = [];
  let currentMass: number | null = null;
  let points: RefPoint[] = [];

  for (const line of csv.trim().split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentMass && points.length) result.push({ mass: currentMass, points });
      currentMass = null;
      points = [];
      continue;
    }
    if (trimmed.startsWith("x,")) {
      if (currentMass && points.length) result.push({ mass: currentMass, points });
      const label = trimmed.split(",")[1].trim();
      currentMass = massMap[label] || null;
      points = [];
      continue;
    }
    if (!currentMass) continue;
    const [srStr, altStr] = trimmed.split(",");
    const sr = parseFloat(srStr);
    const alt = parseFloat(altStr);
    if (isFinite(sr) && isFinite(alt)) {
      points.push({ sr, altitude: alt });
    }
  }
  if (currentMass && points.length) result.push({ mass: currentMass, points });
  return result;
}

// ============================================================
// Weights & colours
// ============================================================
const WEIGHTS = [
  { mass: 80000, color: "#c0392b", label: "80t" },
  { mass: 100000, color: "#e67e22", label: "100t" },
  { mass: 120000, color: "#27ae60", label: "120t" },
  { mass: 140000, color: "#2980b9", label: "140t" },
];

// ============================================================
// Curve generation
// ============================================================
function generateCurves(M: number, aircraft: Aircraft, weights: typeof WEIGHTS, refCurves: RefCurve[]) {
  const refBounds: Record<number, { min: number; max: number }> = {};
  for (const c of refCurves) {
    const alts = c.points.map(p => p.altitude);
    refBounds[c.mass] = { min: Math.min(...alts), max: Math.max(...alts) };
  }

  const curves: Record<number, RefPoint[]> = {};
  const optima: { mass: number; label: string; altitude: number; sr: number }[] = [];

  weights.forEach(w => {
    const bounds = refBounds[w.mass] || { min: 24, max: 45 };
    const hMin = Math.floor(bounds.min * 1000);
    const hMax = Math.ceil(bounds.max * 1000);
    const points: RefPoint[] = [];
    let bestSR = 0, bestAlt = 0;

    for (let h_ft = hMin; h_ft <= hMax; h_ft += 150) {
      const h_m = h_ft * 0.3048;
      const result = computeSpecificRange(h_m, M, w.mass, aircraft);
      if (result && result.SR_NAM > 0 && result.CL < 1.0) {
        points.push({ sr: result.SR_NAM, altitude: h_ft / 1000 });
        if (result.SR_NAM > bestSR) { bestSR = result.SR_NAM; bestAlt = h_ft / 1000; }
      }
    }

    curves[w.mass] = points;
    optima.push({ mass: w.mass, label: w.label, altitude: bestAlt, sr: bestSR });
  });

  return { curves, optima };
}

// ============================================================
// Nelder-Mead
// ============================================================
function nelderMead(objective: (x: number[]) => number, x0: number[], { maxIter = 1000, tol = 1e-8 } = {}) {
  const n = x0.length;
  const alpha = 1, gamma = 2, rho = 0.5, sigma = 0.5;

  const simplex = [{ x: [...x0], f: objective(x0) }];
  for (let i = 0; i < n; i++) {
    const xi = [...x0];
    xi[i] *= 1.05 + 0.001;
    if (xi[i] === 0) xi[i] = 0.00025;
    simplex.push({ x: xi, f: objective(xi) });
  }

  for (let iter = 0; iter < maxIter; iter++) {
    simplex.sort((a, b) => a.f - b.f);
    const fRange = simplex[n].f - simplex[0].f;
    if (fRange < tol) break;

    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) centroid[j] += simplex[i].x[j];
    }
    for (let j = 0; j < n; j++) centroid[j] /= n;

    const worst = simplex[n];
    const reflected = centroid.map((c, j) => c + alpha * (c - worst.x[j]));
    const fr = objective(reflected);

    if (fr < simplex[0].f) {
      const expanded = centroid.map((c, j) => c + gamma * (reflected[j] - c));
      const fe = objective(expanded);
      simplex[n] = fe < fr ? { x: expanded, f: fe } : { x: reflected, f: fr };
    } else if (fr < simplex[n - 1].f) {
      simplex[n] = { x: reflected, f: fr };
    } else {
      const contracted = centroid.map((c, j) => c + rho * (worst.x[j] - c));
      const fc = objective(contracted);
      if (fc < worst.f) {
        simplex[n] = { x: contracted, f: fc };
      } else {
        const best = simplex[0];
        for (let i = 1; i <= n; i++) {
          const shrunk = best.x.map((b, j) => b + sigma * (simplex[i].x[j] - b));
          simplex[i] = { x: shrunk, f: objective(shrunk) };
        }
      }
    }
  }

  simplex.sort((a, b) => a.f - b.f);
  return simplex[0];
}

// ============================================================
// Param sliders
// ============================================================
const PARAM_SLIDERS = [
  { key: "S" as const, label: "S (wing area)", unit: "m\u00b2", min: 100, max: 600, step: 1, fmt: (v: number) => v.toFixed(1) },
  { key: "CD0" as const, label: "CD0 (zero-lift drag)", unit: "", min: 0.010, max: 0.030, step: 0.0005, fmt: (v: number) => v.toFixed(4) },
  { key: "k" as const, label: "k (induced drag factor)", unit: "", min: 0.02, max: 0.08, step: 0.001, fmt: (v: number) => v.toFixed(3) },
  { key: "TSFC_ref" as const, label: "TSFC_ref", unit: "kg/(N\u00b7s)", min: 1e-5, max: 5e-4, step: 1e-6, fmt: (v: number) => v.toExponential(3) },
  { key: "Mdd0" as const, label: "Mdd0 (drag divergence)", unit: "", min: 0.80, max: 0.92, step: 0.005, fmt: (v: number) => v.toFixed(3) },
  { key: "kappa_CL" as const, label: "\u03ba_CL (Mcrit slope)", unit: "", min: 0.05, max: 0.35, step: 0.005, fmt: (v: number) => v.toFixed(3) },
];

function fitAircraftParams(mach: number, startParams: Aircraft, refCurves: RefCurve[]) {
  const paramKeys = ["S", "CD0", "k", "TSFC_ref", "Mdd0", "kappa_CL"] as const;
  const bounds = PARAM_SLIDERS.map(p => [p.min, p.max]);
  const x0 = paramKeys.map(k => startParams[k]);

  const objective = (x: number[]) => {
    for (let i = 0; i < x.length; i++) {
      if (x[i] < bounds[i][0] || x[i] > bounds[i][1]) return 1e12;
    }
    const ac: Record<string, number> = {};
    paramKeys.forEach((k, i) => ac[k] = x[i]);

    let sse = 0;
    for (const curve of refCurves) {
      for (const pt of curve.points) {
        const h_m = pt.altitude * 1000 * 0.3048;
        const result = computeSpecificRange(h_m, mach, curve.mass, ac as unknown as Aircraft);
        if (!result) { sse += 1000; continue; }
        const diff = result.SR_NAM - pt.sr;
        sse += diff * diff;
      }
    }
    return sse;
  };

  const clamp = (x: number[]) => x.map((v, i) => Math.max(bounds[i][0], Math.min(bounds[i][1], v)));
  const perturb = (base: number[], scale: number) => clamp(base.map((v, i) => {
    const range = bounds[i][1] - bounds[i][0];
    return v + (Math.random() - 0.5) * range * scale;
  }));

  let best = nelderMead(objective, x0, { maxIter: 3000 });
  for (let restart = 0; restart < 8; restart++) {
    const x0r = perturb(best.x, 0.3);
    const trial = nelderMead(objective, x0r, { maxIter: 3000 });
    if (trial.f < best.f) best = trial;
  }
  best = nelderMead(objective, best.x, { maxIter: 5000, tol: 1e-12 });

  const fitted: Record<string, number> = {};
  paramKeys.forEach((k, i) => fitted[k] = best.x[i]);
  return { params: fitted as unknown as Aircraft, sse: best.f };
}

// ============================================================
// COMPONENT
// ============================================================
export default function SpecificRangeExplorer() {
  const [refCurves, setRefCurves] = useState<RefCurve[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/data/specific-range/exported_points.csv")
      .then(r => r.text())
      .then(csv => { setRefCurves(parseDigitisedCSV(csv)); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const [mach, setMach] = useState(0.82);
  const [showCompressibility, setShowCompressibility] = useState(true);
  const [activeTab, setActiveTab] = useState("story");
  const [hoveredWeight, setHoveredWeight] = useState<number | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayX, setOverlayX] = useState(4.5);
  const [overlayY, setOverlayY] = useState(1.0);
  const [overlayW, setOverlayW] = useState(97.0);
  const [overlayH, setOverlayH] = useState(98.5);
  const [showParams, setShowParams] = useState(false);
  const [showRefCurves, setShowRefCurves] = useState(false);
  const [fitting, setFitting] = useState(false);
  const [fitSSE, setFitSSE] = useState<number | null>(null);
  const [aircraftParams, setAircraftParams] = useState<Aircraft>({ ...DEFAULT_AIRCRAFT });
  const [xMin, setXMin] = useState(60);
  const [xMax, setXMax] = useState(119);
  const [yMin, setYMin] = useState(24);
  const [yMax, setYMax] = useState(45);

  const aircraft = useMemo(() => ({
    ...aircraftParams,
    Mdd0: showCompressibility ? aircraftParams.Mdd0 : 1.5,
    kappa_CL: showCompressibility ? aircraftParams.kappa_CL : 0,
  }), [aircraftParams, showCompressibility]);

  const { curves, optima } = useMemo(
    () => generateCurves(mach, aircraft, WEIGHTS, refCurves),
    [mach, aircraft, refCurves]
  );

  const optimaLineData = useMemo(() =>
    optima.filter(o => o.sr > 0).map(o => ({ sr: o.sr, altitude: o.altitude })),
    [optima]
  );

  const refScatterData = useMemo(() =>
    refCurves.map(c => ({ mass: c.mass, points: c.points.map(p => ({ sr: p.sr, altitude: p.altitude })) })),
    [refCurves]
  );

  const handleFit = useCallback(() => {
    setFitting(true);
    setTimeout(() => {
      const result = fitAircraftParams(mach, aircraftParams, refCurves);
      setAircraftParams(result.params);
      setFitSSE(result.sse);
      setFitting(false);
    }, 50);
  }, [mach, aircraftParams, refCurves]);

  const handleResetParams = useCallback(() => {
    setAircraftParams({ ...DEFAULT_AIRCRAFT });
    setFitSSE(null);
  }, []);

  const updateParam = useCallback((key: string, value: number) => {
    setAircraftParams(prev => ({ ...prev, [key]: value }));
  }, []);

  const CustomTooltip = useCallback(({ active, payload }: { active?: boolean; payload?: Array<{ payload?: { altitude?: number; sr?: number } }> }) => {
    if (!active || !payload || !payload.length) return null;
    const pt = payload[0]?.payload;
    if (!pt) return null;
    return (
      <div style={{
        background: "rgba(15, 20, 30, 0.95)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 6, padding: "10px 14px",
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        fontSize: 12, color: "#e0e0e0", lineHeight: 1.6,
      }}>
        <div style={{ fontWeight: 700, color: "#fff" }}>
          {((pt.altitude ?? 0) * 1000).toLocaleString()} ft
        </div>
        <div>SR: {pt.sr?.toFixed(1)} NAM/1000kg</div>
      </div>
    );
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0e17", color: "#e8e8e8",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif" }}>
        Loading reference data...
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0e17",
      color: "#e8e8e8",
      fontFamily: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif",
      padding: "24px 20px",
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* Header */}
        <div style={{
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          paddingBottom: 20, marginBottom: 28,
        }}>
          <h1 style={{
            fontSize: 26, fontWeight: 300, letterSpacing: "-0.02em",
            margin: 0, color: "#fff", lineHeight: 1.3,
          }}>
            Specific Range vs. Pressure Altitude
          </h1>
          <p style={{
            fontSize: 14, color: "rgba(255,255,255,0.45)",
            margin: "6px 0 0", fontWeight: 400,
          }}>
            Constant Mach &middot; ISA &middot; Parameters fitted to Lufthansa published data
          </p>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: "flex", gap: 2, marginBottom: 24,
          background: "rgba(255,255,255,0.04)", borderRadius: 8,
          padding: 3, width: "fit-content",
        }}>
          {[
            { id: "story", label: "The Story" },
            { id: "chart", label: "Interactive Chart" },
            { id: "physics", label: "Physics & Derivation" },
            { id: "asymmetry", label: "Why the Asymmetry?" },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "8px 18px", borderRadius: 6, border: "none",
                background: activeTab === tab.id ? "rgba(255,255,255,0.12)" : "transparent",
                color: activeTab === tab.id ? "#fff" : "rgba(255,255,255,0.4)",
                fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400,
                cursor: "pointer", transition: "all 0.2s", fontFamily: "inherit",
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ====== STORY TAB ====== */}
        {activeTab === "story" && (
          <div style={{ maxWidth: 720, fontSize: 15, lineHeight: 1.9, color: "rgba(255,255,255,0.65)" }}>
            <h2 style={{ fontSize: 20, fontWeight: 400, color: "#fff", margin: "0 0 24px" }}>
              A graph from a father&rsquo;s study books
            </h2>

            <p>
              In late February 2025, I got a message on LinkedIn from a man named Jeroen Gemke.
              He&rsquo;d been watching my Aircraft Flight Mechanics lectures on YouTube and had a question
              he couldn&rsquo;t crack &mdash; one that had consumed months of effort and stacks of handwritten pages.
            </p>

            <p>
              The question centred on a single graph. It came from a Lufthansa training manual called
              {" "}<em>Jet Airplane Performance</em>, and it showed specific range &mdash; nautical air miles
              per 1000&nbsp;kg of fuel &mdash; plotted against pressure altitude for different aircraft weights.
              The curves had a distinctive shape: gentle roll-off below the optimum altitude, then a sharp,
              almost cliff-like drop above it. Jeroen wanted to know: what formulas produce these curves?
              And why that asymmetry?
            </p>

            <div style={{
              margin: "32px 0", padding: "24px 28px",
              background: "rgba(255,255,255,0.03)", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "#e0c068", margin: "0 0 16px" }}>
                The backstory
              </h3>
              <p style={{ margin: "0 0 16px" }}>
                Jeroen comes from a Dutch aviation family. His father spent his career at KLM &mdash; from
                roughly 1950 to 1990 &mdash; responsible for flight planning. In those days, preparing a single
                long-haul flight from Amsterdam to Chicago on a DC-8 was an entire eight-hour shift.
                Everything was done by hand: weather charts studied, wind triangles drawn, time fronts
                constructed, optimal altitudes computed. Later, Jeroen rode along on type ratings and
                proficiency checks aboard A310s, 747-400s, DC-10s.
              </p>
              <p style={{ margin: 0 }}>
                When his mother recently moved to a nursing home, Jeroen was clearing out the family house
                and found his father&rsquo;s old study books. They explained &mdash; in careful detail &mdash; how all those
                calculations were done by hand. He also found an E6B flight computer. It struck him that
                this craft knowledge, this tacit expertise in building flight plans from first principles,
                is in danger of being lost entirely. Today, flight plans come out of a computer at the push
                of a button.
              </p>
            </div>

            <p>
              Jeroen set himself a project: bridge the gap between that traditional knowledge and modern
              methods. He&rsquo;d already worked out how the horizontal flight path was constructed &mdash;
              the manual process of drawing time fronts by building wind triangles. The last piece was the
              vertical flight profile: computing the optimal cruise altitude, and understanding the shape of
              those specific range curves.
            </p>

            <p>
              When he reached out, I was happy to help. My first instinct was to recreate the graph
              computationally and see if the physics would fall out. As I wrote to him:
            </p>

            <blockquote style={{
              margin: "24px 0", padding: "16px 24px",
              borderLeft: "3px solid rgba(74, 158, 255, 0.4)",
              background: "rgba(74, 158, 255, 0.04)",
              borderRadius: "0 8px 8px 0",
              fontStyle: "italic", color: "rgba(255,255,255,0.55)",
            }}>
              &ldquo;What I&rsquo;ll probably do is find the way to recreate the figure and then&hellip;
              er&hellip; figure it out. That might be a nice approach!&rdquo;
            </blockquote>

            <p>
              Looking at the shape of the curves, I could see something like a parabola
              shifted upwards &mdash; hinting at a nonlinear scaling on one of the axes, or perhaps a logarithmic
              term buried in the physics. I suspected the density-altitude relationship, thrust-specific fuel
              consumption behaviour, and wave drag near the coffin corner were all playing a role.
            </p>

            <p>
              There was a charming exchange about tools. Jeroen, 61, described himself as a &ldquo;boomer&rdquo;
              who learned SAS and Fortran, and said he only really &ldquo;understood&rdquo; Excel and handwritten
              calculations &mdash; which was exactly why he loved the YouTube lectures, because I wrote down the
              formulas and he could follow the reasoning. I offered to build an interactive widget he could
              run online.
            </p>

            <p>
              Over the following months we traded emails and had a Teams call. The problem turned out to
              be genuinely interesting: the elegant <Tex>{"\\operatorname{sech}"}</Tex> symmetry of the
              subsonic drag polar gets shattered by three effects conspiring above the optimum altitude.
              The physics tab and the asymmetry tab lay it all out.
            </p>

            <div style={{
              margin: "32px 0", padding: "24px 28px",
              background: "linear-gradient(135deg, rgba(224,192,104,0.06), rgba(74,158,255,0.06))",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "#fff", margin: "0 0 12px" }}>
                What this tool is
              </h3>
              <p style={{ margin: 0 }}>
                This interactive explorer is the answer to Jeroen&rsquo;s question, built in the way I know
                best: code. It reconstructs the Lufthansa figure from first-principles physics &mdash; the
                International Standard Atmosphere, a parabolic drag polar with Lock-type wave drag, and a
                temperature-scaled TSFC model. The parameters can be fitted to the published data via
                Nelder-Mead optimisation. You can toggle wave drag on and off, overlay the original figure,
                and watch the asymmetry appear and disappear. It&rsquo;s a bridge between the handwritten
                calculations of Jeroen&rsquo;s father&rsquo;s era and the computational tools of today &mdash; which is
                exactly the gap Jeroen was trying to close.
              </p>
            </div>
          </div>
        )}

        {/* ====== CHART TAB ====== */}
        {activeTab === "chart" && (
          <div>
            <div style={{ display: "flex", gap: 32, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <label style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)", marginBottom: 6, fontWeight: 600 }}>Mach Number</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input type="range" min={0.7} max={0.88} step={0.01} value={mach} onChange={e => setMach(parseFloat(e.target.value))} style={{ width: 180, accentColor: "#4a9eff" }} />
                  <span style={{ fontFamily: "'JetBrains Mono', 'SF Mono', monospace", fontSize: 18, fontWeight: 600, color: "#4a9eff", minWidth: 50 }}>{mach.toFixed(2)}</span>
                </div>
              </div>
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                  <input type="checkbox" checked={showCompressibility} onChange={e => setShowCompressibility(e.target.checked)} style={{ accentColor: "#e74c3c" }} />
                  Include wave drag
                </label>
              </div>
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                  <input type="checkbox" checked={showOverlay} onChange={e => setShowOverlay(e.target.checked)} style={{ accentColor: "#f39c12" }} />
                  Reference overlay
                </label>
              </div>
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                  <input type="checkbox" checked={showRefCurves} onChange={e => setShowRefCurves(e.target.checked)} style={{ accentColor: "#9b59b6" }} />
                  Reference points
                </label>
              </div>
            </div>

            {/* Axis limits */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 16, padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
              {[
                { label: "X min (SR)", value: xMin, set: setXMin, min: 0, max: 100, step: 1 },
                { label: "X max (SR)", value: xMax, set: setXMax, min: 60, max: 200, step: 1 },
                { label: "Y min (alt)", value: yMin, set: setYMin, min: 0, max: 40, step: 1 },
                { label: "Y max (alt)", value: yMax, set: setYMax, min: 30, max: 60, step: 1 },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{s.label}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</span>
                  </div>
                  <input type="range" min={s.min} max={s.max} step={s.step} value={s.value} onChange={e => s.set(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "#4a9eff" }} />
                </div>
              ))}
            </div>

            {/* Overlay controls */}
            {showOverlay && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 16, padding: "12px 16px", background: "rgba(243, 156, 18, 0.06)", borderRadius: 8, border: "1px solid rgba(243, 156, 18, 0.12)" }}>
                {[
                  { label: "X offset", value: overlayX, set: setOverlayX, min: -20, max: 30, step: 0.5, unit: "%" },
                  { label: "Y offset", value: overlayY, set: setOverlayY, min: -20, max: 30, step: 0.5, unit: "%" },
                  { label: "Width", value: overlayW, set: setOverlayW, min: 50, max: 150, step: 0.5, unit: "%" },
                  { label: "Height", value: overlayH, set: setOverlayH, min: 50, max: 150, step: 0.5, unit: "%" },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{s.label}</span>
                      <span style={{ fontSize: 11, color: "#f39c12", fontFamily: "'JetBrains Mono', monospace" }}>{s.value.toFixed(1)}{s.unit}</span>
                    </div>
                    <input type="range" min={s.min} max={s.max} step={s.step} value={s.value} onChange={e => s.set(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "#f39c12" }} />
                  </div>
                ))}
              </div>
            )}

            {/* Fit & Params buttons */}
            <div style={{ display: "flex", gap: 12, marginBottom: 24, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={handleFit} disabled={fitting} style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid rgba(74, 158, 255, 0.4)", background: fitting ? "rgba(74, 158, 255, 0.1)" : "rgba(74, 158, 255, 0.15)", color: "#4a9eff", fontSize: 13, fontWeight: 600, cursor: fitting ? "wait" : "pointer", fontFamily: "inherit" }}>
                {fitting ? "Fitting..." : "Fit to Reference"}
              </button>
              <button onClick={handleResetParams} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Reset Params
              </button>
              <button onClick={() => setShowParams(p => !p)} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: showParams ? "rgba(255,255,255,0.08)" : "transparent", color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                {showParams ? "Hide Params" : "Show Params"}
              </button>
              {fitSSE !== null && (
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace" }}>
                  SSE: {fitSSE.toFixed(1)}
                </span>
              )}
            </div>

            {/* Parameter Sliders */}
            {showParams && (
              <div style={{ marginBottom: 24, padding: "16px 20px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 28px" }}>
                  {PARAM_SLIDERS.map(p => (
                    <div key={p.key}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{p.label}</span>
                        <span style={{ fontSize: 12, color: "#4a9eff", fontFamily: "'JetBrains Mono', monospace" }}>
                          {p.fmt(aircraftParams[p.key])} {p.unit}
                        </span>
                      </div>
                      <input type="range" min={p.min} max={p.max} step={p.step} value={aircraftParams[p.key]} onChange={e => updateParam(p.key, parseFloat(e.target.value))} style={{ width: "100%", accentColor: "#4a9eff" }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chart */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: "20px 16px 12px 8px", position: "relative", overflow: "hidden" }}>
              {showOverlay && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/data/specific-range/reference.png" alt=""
                  style={{ position: "absolute", top: `${overlayY}%`, left: `${overlayX}%`, width: `${overlayW}%`, height: `${overlayH}%`, objectFit: "fill", opacity: 0.18, pointerEvents: "none", zIndex: 0, mixBlendMode: "screen" }}
                />
              )}
              <ResponsiveContainer width="100%" height={580} style={{ position: "relative", zIndex: 1 }}>
                <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="none" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="sr" type="number" name="Specific Range" domain={[xMin, xMax]} tickCount={7} allowDataOverflow
                    label={{ value: "SPECIFIC RANGE \u2014 NAM / 1000 KG \u2192", position: "bottom", offset: 10, style: { fill: "rgba(255,255,255,0.4)", fontSize: 12, letterSpacing: "0.05em" } }}
                    stroke="rgba(255,255,255,0.2)" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                  />
                  <YAxis dataKey="altitude" type="number" name="Pressure Altitude" domain={[yMin, yMax]} tickCount={11} allowDataOverflow
                    tickFormatter={(v: number) => `${v}`}
                    label={{ value: "PRESSURE ALTITUDE \u2014 1000 FT \u2192", angle: -90, position: "insideLeft", offset: 0, style: { fill: "rgba(255,255,255,0.4)", fontSize: 12, letterSpacing: "0.05em" } }}
                    stroke="rgba(255,255,255,0.2)" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                  />
                  <ZAxis range={[16, 16]} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={36.089} stroke="rgba(255,255,255,0.15)" strokeDasharray="8 4" label={{ value: "Tropopause", position: "right", style: { fill: "rgba(255,255,255,0.25)", fontSize: 10 } }} />

                  {showRefCurves && refScatterData.map(c => {
                    const w = WEIGHTS.find(wt => wt.mass === c.mass);
                    return <Scatter key={`ref_${c.mass}`} data={c.points} fill={w?.color || "#888"} opacity={0.4} shape="diamond" legendType="none" isAnimationActive={false} />;
                  })}

                  {optimaLineData.length >= 2 && (
                    <Scatter data={optimaLineData} line={{ stroke: "rgba(255,255,255,0.25)", strokeWidth: 1.5, strokeDasharray: "6 3" }} shape={() => null} legendType="none" isAnimationActive={false} />
                  )}

                  {WEIGHTS.map(w => (
                    <Scatter key={w.mass} data={curves[w.mass]} line={{ stroke: w.color, strokeWidth: hoveredWeight === w.mass ? 3 : 1.8 }} shape={() => null} name={w.label} opacity={hoveredWeight && hoveredWeight !== w.mass ? 0.2 : 1} isAnimationActive={false} />
                  ))}

                  {optima.filter(o => o.sr > 0).map(o => {
                    const w = WEIGHTS.find(wt => wt.mass === o.mass);
                    return <Scatter key={`opt_${o.mass}`} data={[{ sr: o.sr, altitude: o.altitude }]} fill={w?.color || "#fff"} shape="circle" legendType="none" isAnimationActive={false} />;
                  })}
                </ScatterChart>
              </ResponsiveContainer>

              <div style={{ position: "relative", marginTop: -80, marginRight: 60, textAlign: "right", pointerEvents: "none", zIndex: 2 }}>
                <span style={{ display: "inline-block", padding: "6px 14px", border: "1.5px solid rgba(255,255,255,0.2)", borderRadius: 4, fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>M = const</span>
              </div>
              <div style={{ height: 50 }} />
            </div>

            {/* Weight Legend */}
            <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
              {WEIGHTS.map(w => {
                const opt = optima.find(o => o.mass === w.mass);
                return (
                  <div key={w.mass} onMouseEnter={() => setHoveredWeight(w.mass)} onMouseLeave={() => setHoveredWeight(null)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 6, background: hoveredWeight === w.mass ? "rgba(255,255,255,0.08)" : "transparent", cursor: "pointer", transition: "background 0.2s" }}>
                    <div style={{ width: 24, height: 3, background: w.color, borderRadius: 2 }} />
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{w.label}</span>
                    {opt && opt.sr > 0 && (
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace" }}>
                        opt: {(opt.altitude * 1000).toLocaleString()}ft
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 20, padding: "12px 16px", background: "rgba(74, 158, 255, 0.06)", borderRadius: 8, border: "1px solid rgba(74, 158, 255, 0.12)", fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
              <strong style={{ color: "rgba(255,255,255,0.7)" }}>Reading the chart:</strong>{" "}
              Toggle &ldquo;Reference overlay&rdquo; to show the Lufthansa Fig. 5/20 as a watermark,
              and &ldquo;Reference points&rdquo; to show the digitized data. Click &ldquo;Fit to Reference&rdquo;
              to auto-tune the aircraft parameters via Nelder-Mead optimization.
              Use &ldquo;Show Params&rdquo; to manually fine-tune individual parameters.
            </div>
          </div>
        )}

        {/* ====== PHYSICS TAB ====== */}
        {activeTab === "physics" && (
          <div style={{ maxWidth: 720 }}>
            <div style={{ fontSize: 15, lineHeight: 1.9, color: "rgba(255,255,255,0.65)" }}>

              <p>
                Here&rsquo;s the thing about specific range &mdash; it&rsquo;s just distance per unit fuel burned. Nothing exotic.
                But the way the algebra simplifies at constant Mach is genuinely elegant
                (and I don&rsquo;t use that word lightly).
              </p>

              <h3 style={{ fontSize: 17, fontWeight: 600, color: "#4a9eff", margin: "36px 0 12px" }}>
                Starting point
              </h3>
              <p>
                Specific range is the nautical miles you get per kilogram of fuel burned. In its rawest form:
              </p>
              <div style={{ textAlign: "center", margin: "20px 0" }}>
                <Tex display>{"\\text{SR} = \\frac{V_{\\text{TAS}}}{\\text{TSFC} \\times D}"}</Tex>
              </div>
              <p>
                That&rsquo;s true airspeed divided by fuel flow (which is thrust-specific fuel consumption times drag,
                since in steady cruise thrust equals drag). Simple enough.
              </p>

              <h3 style={{ fontSize: 17, fontWeight: 600, color: "#4a9eff", margin: "36px 0 12px" }}>
                Fix the Mach number
              </h3>
              <p>
                At constant Mach, your TAS only depends on the local speed of sound &mdash; which only depends on temperature:
              </p>
              <div style={{ textAlign: "center", margin: "20px 0" }}>
                <Tex display>{"V_{\\text{TAS}} = M \\, a = M \\sqrt{\\gamma R T}"}</Tex>
              </div>
              <p>
                Now here&rsquo;s where it gets interesting. Dynamic pressure can be rewritten purely in
                terms of pressure and Mach:
              </p>
              <div style={{ textAlign: "center", margin: "20px 0" }}>
                <Tex display>{"q = \\tfrac{1}{2} \\rho V^2 = \\tfrac{1}{2} \\gamma \\, p \\, M^2"}</Tex>
              </div>
              <p>
                That&rsquo;s a neat result &mdash; density has vanished. This means the lift coefficient at constant Mach and weight is purely a function of pressure:
              </p>
              <div style={{ textAlign: "center", margin: "20px 0" }}>
                <Tex display>{"C_L = \\frac{W}{q S} = \\frac{2 W}{\\gamma \\, p \\, M^2 S}"}</Tex>
              </div>
              <p>
                As you climb (pressure drops), <Tex>{"C_L"}</Tex> increases to maintain lift. That&rsquo;s the whole game.
              </p>

              <h3 style={{ fontSize: 17, fontWeight: 600, color: "#4a9eff", margin: "36px 0 12px" }}>
                Drag and fuel consumption
              </h3>
              <p>
                The drag polar gives us:
              </p>
              <div style={{ textAlign: "center", margin: "20px 0" }}>
                <Tex display>{"C_D = C_{D_0} + k \\, C_L^{\\,2} + \\Delta C_{D,\\text{wave}}(M, C_L)"}</Tex>
              </div>
              <p>
                I&rsquo;ll ignore the wave drag term for now &mdash; that&rsquo;s the spoiler for the asymmetry discussion.
                Without it, drag is just a function of <Tex>{"C_L"}</Tex>, which is just a function of pressure.
              </p>
              <p>
                For TSFC, the standard model scales with the square root of temperature ratio:
              </p>
              <div style={{ textAlign: "center", margin: "20px 0" }}>
                <Tex display>{"c = c_{\\text{ref}} \\sqrt{\\theta} \\qquad \\text{where} \\quad \\theta = T / T_0"}</Tex>
              </div>

              <h3 style={{ fontSize: 17, fontWeight: 600, color: "#4a9eff", margin: "36px 0 12px" }}>
                The cancellation
              </h3>
              <p>
                Now combine everything. The fuel flow is <Tex>{"\\dot{W}_f = c \\cdot D = c_{\\text{ref}} \\sqrt{\\theta} \\cdot q S C_D"}</Tex>, so:
              </p>
              <div style={{ textAlign: "center", margin: "20px 0" }}>
                <Tex display>{"\\text{SR} = \\frac{M \\, a_0 \\sqrt{\\theta}}{c_{\\text{ref}} \\sqrt{\\theta} \\cdot q S \\, C_D}"}</Tex>
              </div>
              <p>
                The <Tex>{"\\sqrt{\\theta}"}</Tex> terms cancel. Substituting <Tex>{"q = \\tfrac{1}{2} \\gamma p M^2"}</Tex>:
              </p>
              <div style={{ textAlign: "center", margin: "20px 0" }}>
                <Tex display>{"\\text{SR} = \\frac{2 \\, a_0}{c_{\\text{ref}} \\, \\gamma \\, S \\, M} \\cdot \\frac{1}{p \\cdot C_D}"}</Tex>
              </div>
              <p>
                Everything in front is constant at fixed Mach. So at constant Mach and weight,{" "}
                <strong style={{ color: "#fff" }}>SR depends only on pressure and the drag coefficient</strong>
                {" "}&mdash; and <Tex>{"C_D"}</Tex> itself depends on pressure through <Tex>{"C_L"}</Tex>. Temperature
                has dropped out completely.
              </p>
            </div>

            {/* ---- Symmetry derivation ---- */}
            <div style={{ marginTop: 40, padding: "24px 28px", background: "rgba(231, 76, 60, 0.08)", borderRadius: 12, border: "1px solid rgba(231, 76, 60, 0.2)" }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: "#e74c3c", margin: "0 0 16px" }}>
                The symmetry in log(&sigma;)
              </h3>
              <div style={{ fontSize: 15, lineHeight: 1.9, color: "rgba(255,255,255,0.65)" }}>
                <p>
                  Let&rsquo;s be explicit about the symmetry, because it&rsquo;s genuinely satisfying.
                  We showed that (ignoring wave drag):
                </p>
                <div style={{ textAlign: "center", margin: "20px 0" }}>
                  <Tex display>{"\\text{SR} \\propto \\frac{1}{p \\, C_D} = \\frac{1}{p \\left( C_{D_0} + k \\, C_L^{\\,2} \\right)}"}</Tex>
                </div>
                <p>
                  Substitute <Tex>{"C_L = A / p"}</Tex> where <Tex>{"A = 2W / (\\gamma M^2 S)"}</Tex> is constant:
                </p>
                <div style={{ textAlign: "center", margin: "20px 0" }}>
                  <Tex display>{"\\text{SR} \\propto \\frac{1}{C_{D_0}\\, p + k A^2 / p}"}</Tex>
                </div>
                <p>
                  Maximise with respect to <Tex>{"p"}</Tex>. Setting <Tex>{"d(\\text{SR})/dp = 0"}</Tex> gives
                  the optimum pressure <Tex>{"p^*"}</Tex> where:
                </p>
                <div style={{ textAlign: "center", margin: "20px 0" }}>
                  <Tex display>{"C_{D_0} \\, p^* = \\frac{k A^2}{p^*} \\quad \\Longrightarrow \\quad C_{D_0} = k \\, C_{L}^{*\\,2}"}</Tex>
                </div>
                <p>
                  This is just the classic result that the optimum is where zero-lift drag equals induced drag.
                  Now define <Tex>{"\\sigma = p / p^*"}</Tex>. The denominator becomes:
                </p>
                <div style={{ textAlign: "center", margin: "20px 0" }}>
                  <Tex display>{"C_{D_0}\\, p + \\frac{k A^2}{p} = C_{D_0}\\, p^* \\!\\left( \\sigma + \\frac{1}{\\sigma} \\right)"}</Tex>
                </div>
                <p>
                  At the optimum this equals <Tex>{"2 \\, C_{D_0} \\, p^*"}</Tex>, so:
                </p>
                <div style={{ textAlign: "center", margin: "24px 0", padding: "16px", background: "rgba(231,76,60,0.12)", borderRadius: 8 }}>
                  <Tex display>{"\\boxed{\\frac{\\text{SR}}{\\text{SR}_{\\max}} = \\frac{2}{\\sigma + 1/\\sigma}}"}</Tex>
                </div>
                <p>
                  Now for the punchline. Let <Tex>{"\\xi = \\ln \\sigma"}</Tex>. Then{" "}
                  <Tex>{"\\sigma + 1/\\sigma = e^\\xi + e^{-\\xi} = 2\\cosh\\xi"}</Tex>, so:
                </p>
                <div style={{ textAlign: "center", margin: "24px 0", padding: "16px", background: "rgba(231,76,60,0.12)", borderRadius: 8 }}>
                  <Tex display>{"\\frac{\\text{SR}}{\\text{SR}_{\\max}} = \\operatorname{sech}(\\xi) = \\operatorname{sech}\\!\\left(\\ln \\frac{p}{p^*}\\right)"}</Tex>
                </div>
                <p>
                  Since <Tex>{"\\cosh"}</Tex> is an even function, this is{" "}
                  <strong style={{ color: "#e74c3c" }}>perfectly symmetric in <Tex>{"\\ln(p/p^*)"}</Tex></strong>.
                  Double the pressure or halve it &mdash; same SR. That&rsquo;s the mathematical baseline.
                </p>
                <p style={{ marginTop: 16 }}>
                  But here&rsquo;s the catch: <Tex>{"\\ln p"}</Tex> is <em>not</em> linearly proportional to altitude
                  (especially across the tropopause), and the moment you add wave drag, the symmetry shatters.
                  Which brings us to the next tab.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ====== ASYMMETRY TAB ====== */}
        {activeTab === "asymmetry" && (
          <div style={{ maxWidth: 720, fontSize: 15, lineHeight: 1.9, color: "rgba(255,255,255,0.65)" }}>
            <h2 style={{ fontSize: 20, fontWeight: 400, color: "#fff", margin: "0 0 20px" }}>
              Why the curves bend more sharply above the optimum
            </h2>
            <p>
              If you look at the chart, the drop-off above the optimal altitude is noticeably steeper
              than the fall below it. We just showed that without wave drag, SR is symmetric in{" "}
              <Tex>{"\\ln(p/p^*)"}</Tex> &mdash; a perfect <Tex>{"\\operatorname{sech}"}</Tex> curve.
              So something&rsquo;s breaking that symmetry, and it turns out there are three things conspiring at once.
            </p>

            <div style={{ marginTop: 28, marginBottom: 28, padding: "20px 24px", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "rgba(74, 158, 255, 0.15)", color: "#4a9eff", fontSize: 14, fontWeight: 700 }}>1</span>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#fff", margin: 0 }}>Pressure vs. altitude isn&rsquo;t linear</h3>
              </div>
              <p style={{ margin: 0 }}>
                The symmetry lives in <Tex>{"\\ln p"}</Tex> space, not altitude space. In the troposphere
                (below ~36,000 ft) pressure follows a power law, and in the stratosphere it drops
                exponentially. That exponential decay compresses the upper portion of the curve
                when you plot against altitude &mdash; equal steps in altitude correspond to{" "}
                <em>larger</em> steps in <Tex>{"\\ln p"}</Tex> up high.
              </p>
            </div>

            <div style={{ marginBottom: 28, padding: "20px 24px", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "rgba(231, 76, 60, 0.15)", color: "#e74c3c", fontSize: 14, fontWeight: 700 }}>2</span>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#fff", margin: 0 }}>Wave drag kicks in hard at high altitude</h3>
              </div>
              <p style={{ margin: 0 }}>
                This is the big one. At constant Mach, climbing means lower pressure, which
                means higher <Tex>{"C_L"}</Tex> to maintain lift. That pushes you past the critical Mach number
                for drag divergence, and the wave drag term goes as{" "}
                <Tex>{"20(M - M_{\\text{crit}})^4"}</Tex>. Fourth power &mdash; it&rsquo;s savage.
                Below the optimum, you&rsquo;re just seeing gentle increases from the{" "}
                <Tex>{"C_{D_0}"}</Tex> parasitic term. Above it, you&rsquo;ve got a fourth-power penalty
                piling on top of the induced drag. There&rsquo;s no equivalent mechanism in the other direction.
              </p>
            </div>

            <div style={{ marginBottom: 28, padding: "20px 24px", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "rgba(39, 174, 96, 0.15)", color: "#27ae60", fontSize: 14, fontWeight: 700 }}>3</span>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#fff", margin: 0 }}>TSFC flatlines above the tropopause</h3>
              </div>
              <p style={{ margin: 0 }}>
                Our TSFC model scales as <Tex>{"c_{\\text{ref}}\\sqrt{\\theta}"}</Tex>.
                In the troposphere, temperature drops linearly with altitude, so TSFC improves
                as you climb &mdash; you&rsquo;re getting a fuel efficiency bonus. Above the tropopause
                (ISA: 216.65 K, constant), that improvement stops dead. So just as wave drag is ramping
                up, the one thing that was helping you (improving TSFC) has flatlined. Double penalty.
              </p>
            </div>

            <div style={{ padding: "20px 24px", background: "linear-gradient(135deg, rgba(74,158,255,0.06), rgba(231,76,60,0.06))", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: "0 0 12px" }}>The net effect</h3>
              <p style={{ margin: 0 }}>
                Below the optimum, SR rolls off gently &mdash; just parasitic drag increasing, partially offset
                by improving TSFC. Above, three effects compound: the pressure-altitude mapping accelerates,
                wave drag surges as a fourth power, and the TSFC benefit disappears. The result is
                the steep, almost cliff-like drop-off you see on the chart &mdash; the aerodynamic
                coffin corner in action.
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 48, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
          Aircraft Flight Mechanics &mdash; Specific Range Analysis
          <br />
          Fitted to Lufthansa Fig. 5/20 &middot; ISA atmosphere &middot; Parabolic drag polar with Lock wave drag
        </div>
      </div>
    </div>
  );
}
