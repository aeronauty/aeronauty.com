'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

// ─── Geometry ─────────────────────────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
}

function nacaThickness(x: number): number {
  const t = 0.12;
  return (
    (t / 0.2) *
    (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1015 * x ** 4)
  );
}

// ─── Cubic spline (natural boundary conditions) ──────────────────────────────

function cumulativeArcLength(pts: Point[]): number[] {
  const s = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    s.push(s[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  return s;
}

function splineSecondDerivatives(s: number[], f: number[]): Float64Array {
  const n = s.length - 1;
  const M = new Float64Array(n + 1);
  if (n < 2) return M;

  const h: number[] = [];
  for (let i = 0; i < n; i++) h.push(s[i + 1] - s[i]);

  const size = n - 1;
  const dia = new Float64Array(size);
  const sup = new Float64Array(size);
  const sub = new Float64Array(size);
  const rhs = new Float64Array(size);

  for (let j = 0; j < size; j++) {
    dia[j] = 2 * (h[j] + h[j + 1]);
    if (j < size - 1) sup[j] = h[j + 1];
    if (j > 0) sub[j] = h[j];
    rhs[j] = 6 * ((f[j + 2] - f[j + 1]) / h[j + 1] - (f[j + 1] - f[j]) / h[j]);
  }

  for (let j = 1; j < size; j++) {
    const w = sub[j] / dia[j - 1];
    dia[j] -= w * sup[j - 1];
    rhs[j] -= w * rhs[j - 1];
  }

  const inner = new Float64Array(size);
  inner[size - 1] = rhs[size - 1] / dia[size - 1];
  for (let j = size - 2; j >= 0; j--) {
    inner[j] = (rhs[j] - sup[j] * inner[j + 1]) / dia[j];
  }
  for (let j = 0; j < size; j++) M[j + 1] = inner[j];
  return M;
}

function evalSpline(s: number[], f: number[], M: Float64Array, t: number): number {
  const n = s.length - 1;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s[mid + 1] < t) lo = mid + 1;
    else hi = mid;
  }
  const h = s[lo + 1] - s[lo];
  if (h < 1e-15) return f[lo];
  const a = (s[lo + 1] - t) / h;
  const b = (t - s[lo]) / h;
  return (
    a * f[lo] +
    b * f[lo + 1] +
    ((a * a * a - a) * M[lo] + (b * b * b - b) * M[lo + 1]) * (h * h) / 6
  );
}

function splineCurve(pts: Point[], nEval: number): Point[] {
  if (pts.length < 3) return pts;
  const s = cumulativeArcLength(pts);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const Mx = splineSecondDerivatives(s, xs);
  const My = splineSecondDerivatives(s, ys);
  const sMax = s[s.length - 1];
  const result: Point[] = [];
  for (let i = 0; i <= nEval; i++) {
    const t = (i / nEval) * sMax;
    result.push({
      x: evalSpline(s, xs, Mx, t),
      y: evalSpline(s, ys, My, t),
    });
  }
  return result;
}

// ─── GDES fix (simplified fold trimming) ─────────────────────────────────────

function gdesFixSurface(fore: Point[], rotatedAft: Point[]): Point[] {
  if (rotatedAft.length < 2) return [...fore, ...rotatedAft];

  const foreEnd = fore[fore.length - 1];
  const isFold = rotatedAft[0].x < foreEnd.x - 1e-6;

  if (!isFold) {
    return [...fore, ...rotatedAft];
  }

  let idx = 0;
  while (idx < rotatedAft.length && rotatedAft[idx].x < foreEnd.x) idx++;

  if (idx >= rotatedAft.length) return fore;

  if (idx > 0) {
    const prev = rotatedAft[idx - 1];
    const curr = rotatedAft[idx];
    const dx = curr.x - prev.x;
    if (Math.abs(dx) > 1e-10) {
      const t = (foreEnd.x - prev.x) / dx;
      const breakPt: Point = { x: foreEnd.x, y: prev.y + t * (curr.y - prev.y) };
      return [...fore, breakPt, ...rotatedAft.slice(idx)];
    }
  }
  return [...fore, ...rotatedAft.slice(idx)];
}

// ─── ViewBox type ────────────────────────────────────────────────────────────

interface VB {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FULL_VB: VB = { x: -0.06, y: -0.2, w: 1.18, h: 0.4 };
const MIN_W = 0.0008;

function hingeVB(hingeX: number): VB {
  const w = 0.32;
  const h = w * (FULL_VB.h / FULL_VB.w);
  return { x: hingeX - w * 0.42, y: -h / 2, w, h };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface FlapDemoProps {
  accentColor?: string;
  monoClassName?: string;
  displayClassName?: string;
}

const SPLINE_COLOR = '#f43f5e';
const GDES_COLOR = '#14b8a6';
const N_PTS = 50;

export default function FlapDemo({
  accentColor = '#c4841d',
  monoClassName = '',
  displayClassName = '',
}: FlapDemoProps) {
  const [deflection, setDeflection] = useState(12);
  const [hingeXFrac, setHingeXFrac] = useState(0.75);
  const [showSpline, setShowSpline] = useState(false);
  const [showGDES, setShowGDES] = useState(false);

  // ── Pan & zoom ────────────────────────────────────────────────────────────

  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVB] = useState<VB>(FULL_VB);
  const vbRef = useRef(FULL_VB);
  vbRef.current = vb;

  const dragRef = useRef<{ x: number; y: number; vb: VB } | null>(null);
  const animRef = useRef(0);
  const [dragging, setDragging] = useState(false);

  const zoomed = vb.w < FULL_VB.w * 0.95;

  const animateTo = useCallback((target: VB) => {
    cancelAnimationFrame(animRef.current);
    const ease = 0.14;
    const go = () => {
      const c = vbRef.current;
      const done = Math.abs(c.w - target.w) < target.w * 0.003;
      if (done) {
        setVB(target);
        return;
      }
      setVB({
        x: c.x + (target.x - c.x) * ease,
        y: c.y + (target.y - c.y) * ease,
        w: c.w + (target.w - c.w) * ease,
        h: c.h + (target.h - c.h) * ease,
      });
      animRef.current = requestAnimationFrame(go);
    };
    animRef.current = requestAnimationFrame(go);
  }, []);

  // Scroll-wheel zoom (attached via ref so we can use passive:false)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handle = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnimationFrame(animRef.current);
      const rect = svg.getBoundingClientRect();
      const cur = vbRef.current;
      const mx = cur.x + ((e.clientX - rect.left) / rect.width) * cur.w;
      const my = cur.y + ((e.clientY - rect.top) / rect.height) * cur.h;
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const nw = Math.max(MIN_W, Math.min(FULL_VB.w * 1.05, cur.w * factor));
      const nh = nw * (FULL_VB.h / FULL_VB.w);
      const rx = (mx - cur.x) / cur.w;
      const ry = (my - cur.y) / cur.h;
      setVB({ x: mx - rx * nw, y: my - ry * nh, w: nw, h: nh });
    };
    svg.addEventListener('wheel', handle, { passive: false });
    return () => svg.removeEventListener('wheel', handle);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    cancelAnimationFrame(animRef.current);
    dragRef.current = { x: e.clientX, y: e.clientY, vb: { ...vbRef.current } };
    svgRef.current?.setPointerCapture(e.pointerId);
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - d.x) / rect.width) * d.vb.w;
    const dy = ((e.clientY - d.y) / rect.height) * d.vb.h;
    setVB({ ...d.vb, x: d.vb.x - dx, y: d.vb.y - dy });
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  const resetView = useCallback(() => animateTo(FULL_VB), [animateTo]);

  const zoomToHinge = useCallback(
    () => animateTo(hingeVB(hingeXFrac)),
    [animateTo, hingeXFrac],
  );

  // ── Base geometry ──────────────────────────────────────────────────────────

  const { foreUpper, foreLower, aftUpper, aftLower, fullUpper, fullLower } = useMemo(() => {
    const foreUpper: Point[] = [];
    const foreLower: Point[] = [];
    const aftUpper: Point[] = [];
    const aftLower: Point[] = [];
    const fullUpper: Point[] = [];
    const fullLower: Point[] = [];

    const hingeYt = nacaThickness(hingeXFrac);

    for (let i = 0; i <= N_PTS; i++) {
      const x = i / N_PTS;
      const yt = nacaThickness(x);
      fullUpper.push({ x, y: yt });
      fullLower.push({ x, y: -yt });
      if (x < hingeXFrac) {
        foreUpper.push({ x, y: yt });
        foreLower.push({ x, y: -yt });
      }
    }

    foreUpper.push({ x: hingeXFrac, y: hingeYt });
    foreLower.push({ x: hingeXFrac, y: -hingeYt });
    aftUpper.push({ x: hingeXFrac, y: hingeYt });
    aftLower.push({ x: hingeXFrac, y: -hingeYt });

    for (let i = 0; i <= N_PTS; i++) {
      const x = i / N_PTS;
      if (x > hingeXFrac) {
        aftUpper.push({ x, y: nacaThickness(x) });
        aftLower.push({ x, y: -nacaThickness(x) });
      }
    }

    return { foreUpper, foreLower, aftUpper, aftLower, fullUpper, fullLower };
  }, [hingeXFrac]);

  // ── Rotation ───────────────────────────────────────────────────────────────

  const rotate = useCallback(
    (p: Point): Point => {
      const rad = (deflection * Math.PI) / 180;
      const cosD = Math.cos(rad);
      const sinD = Math.sin(rad);
      const dx = p.x - hingeXFrac;
      const dy = p.y;
      return { x: hingeXFrac + dx * cosD + dy * sinD, y: -dx * sinD + dy * cosD };
    },
    [deflection, hingeXFrac],
  );

  const rotatedAftUpper = useMemo(() => aftUpper.map(rotate), [aftUpper, rotate]);
  const rotatedAftLower = useMemo(() => aftLower.map(rotate), [aftLower, rotate]);

  // ── Naive spline overlay ──────────────────────────────────────────────────

  const { splineUpperPts, splineLowerPts, mergedUpper, mergedLower } = useMemo(() => {
    if (!showSpline || Math.abs(deflection) < 0.5)
      return { splineUpperPts: [], splineLowerPts: [], mergedUpper: [], mergedLower: [] };

    const mu = [...foreUpper, ...rotatedAftUpper];
    const ml = [...foreLower, ...rotatedAftLower];

    return {
      splineUpperPts: splineCurve(mu, 500),
      splineLowerPts: splineCurve(ml, 500),
      mergedUpper: mu,
      mergedLower: ml,
    };
  }, [showSpline, deflection, foreUpper, foreLower, rotatedAftUpper, rotatedAftLower]);

  // ── GDES fix overlay ──────────────────────────────────────────────────────

  const { gdesUpperPts, gdesLowerPts } = useMemo(() => {
    if (!showGDES || Math.abs(deflection) < 0.5)
      return { gdesUpperPts: [], gdesLowerPts: [] };

    return {
      gdesUpperPts: gdesFixSurface(foreUpper, rotatedAftUpper),
      gdesLowerPts: gdesFixSurface(foreLower, rotatedAftLower),
    };
  }, [showGDES, deflection, foreUpper, foreLower, rotatedAftUpper, rotatedAftLower]);

  // ── SVG helpers ────────────────────────────────────────────────────────────

  const toPathStr = (pts: Point[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(6)},${(-p.y).toFixed(6)}`).join('');

  const toClosedPath = (upper: Point[], lower: Point[]) =>
    toPathStr(upper) + toPathStr([...lower].reverse()).replace('M', 'L') + 'Z';

  const ghostPath = toClosedPath(fullUpper, fullLower);
  const forePath = toClosedPath(foreUpper, foreLower);
  const aftPath = toClosedPath(rotatedAftUpper, rotatedAftLower);

  // ── Scaling (derived from current viewBox width) ──────────────────────────

  const sw = vb.w * 0.0022;
  const swOverlay = vb.w * 0.0028;
  const swThin = vb.w * 0.0015;
  const fontSize = vb.w * 0.017;
  const dotR = vb.w * 0.005;
  const knotR = vb.w * 0.0016;
  const dashGap = vb.w * 0.006;
  const dashLen = vb.w * 0.008;

  // ── Annotations ────────────────────────────────────────────────────────────

  const absDef = Math.abs(deflection);
  const hingeYt = nacaThickness(hingeXFrac);
  const labelOffset = vb.w * 0.02;
  const gapLabelY = deflection > 0 ? -(hingeYt + labelOffset * 2) : hingeYt + labelOffset * 2.5;
  const foldLabelY = deflection > 0 ? hingeYt + labelOffset * 2.5 : -(hingeYt + labelOffset * 2);

  // ── Knot points near hinge ─────────────────────────────────────────────────

  const hingeKnots = useMemo(() => {
    if (!zoomed || !showSpline) return [];
    const region = Math.max(vb.w * 0.5, 0.005);
    return [...mergedUpper, ...mergedLower].filter(
      (p) => Math.abs(p.x - hingeXFrac) < region && Math.abs(p.y) < region,
    );
  }, [zoomed, showSpline, mergedUpper, mergedLower, hingeXFrac, vb.w]);

  return (
    <div className="relative mt-8 mb-8 overflow-hidden rounded-xl border border-white/[0.08] bg-[#080d19]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 sm:px-8 sm:pt-7">
        <div className="flex items-baseline gap-3">
          <h4
            className={`${displayClassName} text-base font-semibold text-[#e8e6e1] sm:text-lg`}
          >
            Flap Deflection
          </h4>
          <span className={`${monoClassName} text-[11px] text-slate-600`}>NACA 0012</span>
        </div>
      </div>

      {/* Overlay toggles + view controls */}
      <div className="flex flex-wrap items-center gap-2 px-5 pt-3 sm:px-8">
        <button
          onClick={() => {
            setShowSpline((v) => !v);
            if (!showSpline && absDef > 3 && !zoomed) zoomToHinge();
          }}
          className={`${monoClassName} rounded-full px-3 py-1 text-[11px] font-medium transition-all ${
            showSpline
              ? 'border border-rose-500/40 bg-rose-500/15 text-rose-400'
              : 'border border-white/10 bg-white/5 text-slate-500 hover:text-slate-400'
          }`}
        >
          naive spline
        </button>
        <button
          onClick={() => {
            setShowGDES((v) => !v);
            if (!showGDES && absDef > 3 && !zoomed) zoomToHinge();
          }}
          className={`${monoClassName} rounded-full px-3 py-1 text-[11px] font-medium transition-all ${
            showGDES
              ? 'border border-teal-500/40 bg-teal-500/15 text-teal-400'
              : 'border border-white/10 bg-white/5 text-slate-500 hover:text-slate-400'
          }`}
        >
          GDES fix
        </button>

        <div className="flex-1" />

        {zoomed && (
          <button
            onClick={resetView}
            className={`${monoClassName} rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-400 transition-all hover:bg-amber-500/20`}
          >
            reset view
          </button>
        )}
      </div>

      {/* SVG — scroll to zoom, drag to pan */}
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="w-full select-none"
        style={{ maxHeight: 300, cursor: dragging ? 'grabbing' : 'grab' }}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={resetView}
      >
        {/* chord line */}
        <line x1={0} y1={0} x2={1} y2={0} stroke="#1e293b" strokeWidth={swThin * 0.5} />

        {/* ghost outline */}
        {deflection !== 0 && (
          <path
            d={ghostPath}
            fill="none"
            stroke="#334155"
            strokeWidth={swThin}
            strokeDasharray={`${dashLen} ${dashGap}`}
            opacity={0.45}
          />
        )}

        {/* hinge vertical */}
        <line
          x1={hingeXFrac}
          y1={vb.y + vb.h * 0.05}
          x2={hingeXFrac}
          y2={vb.y + vb.h * 0.95}
          stroke="#ef4444"
          strokeWidth={swThin * 0.7}
          strokeDasharray={`${dashGap} ${dashGap}`}
          opacity={0.3}
        />

        {/* Fore fill */}
        <path d={forePath} fill="#475569" fillOpacity={0.35} stroke="#94a3b8" strokeWidth={sw} />

        {/* Aft fill (rotated) */}
        <path d={aftPath} fill={accentColor} fillOpacity={0.3} stroke={accentColor} strokeWidth={sw} />

        {/* ── Naive spline overlay ── */}
        {showSpline && splineUpperPts.length > 0 && (
          <>
            <path d={toPathStr(splineUpperPts)} fill="none" stroke={SPLINE_COLOR} strokeWidth={swOverlay} opacity={0.9} />
            <path d={toPathStr(splineLowerPts)} fill="none" stroke={SPLINE_COLOR} strokeWidth={swOverlay} opacity={0.9} />
          </>
        )}

        {/* Knot dots */}
        {hingeKnots.map((p, i) => (
          <circle key={i} cx={p.x} cy={-p.y} r={knotR} fill={SPLINE_COLOR} opacity={0.55} />
        ))}

        {/* ── GDES fix overlay ── */}
        {showGDES && gdesUpperPts.length > 0 && (
          <>
            <path d={toPathStr(gdesUpperPts)} fill="none" stroke={GDES_COLOR} strokeWidth={swOverlay} opacity={0.9} />
            <path d={toPathStr(gdesLowerPts)} fill="none" stroke={GDES_COLOR} strokeWidth={swOverlay} opacity={0.9} />
          </>
        )}

        {/* Hinge dot */}
        <circle
          cx={hingeXFrac}
          cy={0}
          r={dotR}
          fill="#ef4444"
          stroke="#080d19"
          strokeWidth={dotR * 0.35}
        />

        {/* Gap/fold labels */}
        {absDef > 3 && deflection !== 0 && (
          <>
            <text
              x={hingeXFrac + labelOffset}
              y={gapLabelY}
              fill="#94a3b8"
              fontSize={fontSize}
              fontFamily="monospace"
              opacity={Math.min(1, absDef / 10)}
            >
              {zoomed ? 'gap side' : 'gap'}
            </text>
            <text
              x={hingeXFrac + labelOffset}
              y={foldLabelY}
              fill="#ef4444"
              fontSize={fontSize}
              fontFamily="monospace"
              opacity={Math.min(1, absDef / 10)}
            >
              {zoomed ? 'fold side' : 'fold'}
            </text>
          </>
        )}
      </svg>

      {/* Interaction hint */}
      <div className="px-5 pb-1 sm:px-8">
        <p className={`${monoClassName} text-[10px] text-slate-700`}>
          scroll to zoom · drag to pan{zoomed ? ' · double-click to reset' : ''}
        </p>
      </div>

      {/* Controls */}
      <div className="border-t border-white/[0.06] px-5 py-5 sm:px-8 sm:py-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className={`${monoClassName} w-[4.5rem] shrink-0 text-[11px] text-slate-500`}>
              δ flap
            </label>
            <input
              type="range"
              min={-25}
              max={25}
              step={0.5}
              value={deflection}
              onChange={(e) => setDeflection(parseFloat(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-800
                         [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#080d19]"
              style={{ '--tw-ring-color': accentColor, accentColor } as React.CSSProperties}
            />
            <span
              className={`${monoClassName} w-14 text-right text-sm tabular-nums text-slate-300`}
            >
              {deflection > 0 ? '+' : ''}
              {deflection.toFixed(1)}&deg;
            </span>
          </div>
          <div className="flex items-center gap-3">
            <label className={`${monoClassName} w-[4.5rem] shrink-0 text-[11px] text-slate-500`}>
              hinge x/c
            </label>
            <input
              type="range"
              min={0.5}
              max={0.95}
              step={0.01}
              value={hingeXFrac}
              onChange={(e) => setHingeXFrac(parseFloat(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-800
                         [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#080d19]"
              style={{ accentColor: '#ef4444' } as React.CSSProperties}
            />
            <span
              className={`${monoClassName} w-14 text-right text-sm tabular-nums text-slate-300`}
            >
              {hingeXFrac.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-slate-500/50" />
            fixed
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: accentColor, opacity: 0.7 }}
            />
            rotated
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            hinge
          </span>
          {deflection !== 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full border border-slate-600" />
              original
            </span>
          )}
          {showSpline && (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: SPLINE_COLOR }}
              />
              spline (C2)
            </span>
          )}
          {showGDES && (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: GDES_COLOR }}
              />
              GDES fix
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
