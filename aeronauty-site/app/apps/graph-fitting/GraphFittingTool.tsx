'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

// ============================================================
//  DATA
// ============================================================
const datasets = {
  curve1: {
    name: 'Ultra Efficient Widebody', color: '#16a34a',
    x: [352,1376.9,2416.1,3436.6,4442.2,5466.4,6490.6,7518.6,8531.6,9544.6,10565.1,11581.9,12602.3,13619.1,14650.7],
    y: [8.6409,5.4206,4.9553,4.825,4.7083,4.7079,4.7074,4.707,4.7408,4.7677,4.8151,4.8557,4.9031,4.9437,5.0048]
  },
  curve2: {
    name: '787-900', color: '#2563eb',
    x: [231.5,452.1,922,1376.5,1849.6,2777.1,3700.8,4635.6,5563,6479.2,7406.6,8337.7,9242.7,10181.3,11112.4,12032.3,12974.6,13898.2,14844.2],
    y: [15.2244,10.808,8.1553,7.2391,6.7466,6.2609,6.1032,5.9661,5.9315,5.8491,5.8624,5.862,5.9026,5.8544,5.8608,5.8946,5.8395,5.8391,5.8114]
  },
  curve3: {
    name: 'A350-900', color: '#9333ea',
    x: [452,921.9,1384,1857,2777.1,3715.7,4646.8,5559.3,6497.9,7410.3,8345.2,9261.4,10196.2],
    y: [11.5942,8.4835,7.3484,6.9449,6.3976,6.1648,5.9661,5.952,5.8696,5.8077,5.7594,5.8001,5.7313]
  }
} as const;

type CurveKey = keyof typeof datasets;
type FitType = 'poly3' | 'poly4' | 'poly5' | 'power';

const curveKeys: CurveKey[] = ['curve1', 'curve2', 'curve3'];
const fitColors: Record<FitType, string> = { poly3: '#dc2626', poly4: '#ea580c', poly5: '#9333ea', power: '#0284c7' };
const fitNames: Record<FitType, string> = { poly3: 'Polynomial (3rd)', poly4: 'Polynomial (4th)', poly5: 'Polynomial (5th)', power: 'Power (a·xᵇ+c)' };
const fitDash: Record<FitType, string> = { poly3: 'dot', poly4: 'dashdot', poly5: 'dash', power: 'solid' };
const fitOrder: FitType[] = ['poly3', 'poly4', 'poly5', 'power'];

// ============================================================
//  LINEAR ALGEBRA
// ============================================================
function gaussSolve(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col, maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > maxVal) { maxVal = Math.abs(M[row][col]); maxRow = row; }
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-15) continue;
    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / M[col][col];
      for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j];
    }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i];
  }
  return x;
}

// ============================================================
//  POLYNOMIAL FIT
// ============================================================
interface PolyFitResult {
  eval: (x: number) => number;
  r2: number;
  coeffs: number[];
  degree: number;
}

function polyFit(xs: readonly number[], ys: readonly number[], deg: number): PolyFitResult {
  const n = xs.length, m = deg + 1;
  const xMax = Math.max(...xs);
  const xn = xs.map(x => x / xMax);

  const XtX = Array.from({ length: m }, () => Array(m).fill(0));
  const Xty = Array(m).fill(0);

  for (let i = 0; i < n; i++) {
    const pw = [1];
    for (let j = 1; j < m; j++) pw.push(pw[j - 1] * xn[i]);
    for (let j = 0; j < m; j++) {
      Xty[j] += pw[j] * ys[i];
      for (let k = 0; k < m; k++) XtX[j][k] += pw[j] * pw[k];
    }
  }
  const coeffs = gaussSolve(XtX, Xty);

  const evalFn = (x: number) => {
    const u = x / xMax;
    let v = 0, up = 1;
    for (let i = 0; i < m; i++) { v += coeffs[i] * up; up *= u; }
    return v;
  };

  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) { ssTot += (ys[i] - yMean) ** 2; ssRes += (ys[i] - evalFn(xs[i])) ** 2; }

  const origCoeffs = coeffs.map((c, i) => c / Math.pow(xMax, i));
  return { eval: evalFn, r2: 1 - ssRes / ssTot, coeffs: origCoeffs, degree: deg };
}

// ============================================================
//  POWER FIT  y = a·x^b + c  (Levenberg–Marquardt)
// ============================================================
interface PowerFitResult {
  eval: (x: number) => number;
  r2: number;
  a: number;
  b: number;
  c: number;
}

function powerFit(xs: readonly number[], ys: readonly number[]): PowerFitResult {
  const n = xs.length;
  let c = Math.min(...ys) * 0.8;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0, cnt = 0;
  for (let i = 0; i < n; i++) {
    const ymc = ys[i] - c;
    if (ymc > 0.01) {
      const lx = Math.log(xs[i]), ly = Math.log(ymc);
      sx += lx; sy += ly; sxy += lx * ly; sx2 += lx * lx; cnt++;
    }
  }
  let b = (cnt * sxy - sx * sy) / (cnt * sx2 - sx * sx);
  let a = Math.exp((sy - b * sx) / cnt);
  if (!isFinite(a) || !isFinite(b) || a <= 0) { a = 100; b = -0.3; }

  let lambda = 1e-3, bestCost = Infinity, best = [a, b, c];

  for (let iter = 0; iter < 500; iter++) {
    const JtJ = [[0,0,0],[0,0,0],[0,0,0]], Jtr = [0,0,0];
    let cost = 0;
    for (let i = 0; i < n; i++) {
      const xb = Math.pow(xs[i], b);
      const fi = a * xb + c;
      const ri = ys[i] - fi;
      cost += ri * ri;
      const j0 = xb, j1 = a * xb * Math.log(xs[i]), j2 = 1;
      JtJ[0][0]+=j0*j0; JtJ[0][1]+=j0*j1; JtJ[0][2]+=j0*j2;
      JtJ[1][0]+=j1*j0; JtJ[1][1]+=j1*j1; JtJ[1][2]+=j1*j2;
      JtJ[2][0]+=j2*j0; JtJ[2][1]+=j2*j1; JtJ[2][2]+=j2*j2;
      Jtr[0]+=j0*ri; Jtr[1]+=j1*ri; Jtr[2]+=j2*ri;
    }
    if (cost < bestCost) { bestCost = cost; best = [a, b, c]; }

    const D = JtJ.map(r => [...r]);
    for (let i = 0; i < 3; i++) D[i][i] *= (1 + lambda);
    let delta: number[];
    try { delta = gaussSolve(D, Jtr); } catch { lambda *= 10; continue; }

    const na = a + delta[0], nb = b + delta[1], nc = c + delta[2];
    if (na <= 0 || !isFinite(na) || !isFinite(nb) || !isFinite(nc)) { lambda *= 10; continue; }

    let newCost = 0, valid = true;
    for (let i = 0; i < n; i++) {
      const fi = na * Math.pow(xs[i], nb) + nc;
      if (!isFinite(fi)) { valid = false; break; }
      newCost += (ys[i] - fi) ** 2;
    }
    if (!valid) { lambda *= 10; continue; }

    if (newCost < cost) { a = na; b = nb; c = nc; lambda *= 0.1; }
    else { lambda *= 10; }
    if (Math.abs(cost - newCost) < 1e-14 * Math.max(cost, 1) && iter > 10) break;
  }

  [a, b, c] = best;
  const evalFn = (x: number) => a * Math.pow(x, b) + c;
  const yMean = ys.reduce((s, v) => s + v, 0) / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) { ssTot += (ys[i] - yMean) ** 2; ssRes += (ys[i] - evalFn(xs[i])) ** 2; }
  return { eval: evalFn, r2: 1 - ssRes / ssTot, a, b, c };
}

// ============================================================
//  PRECOMPUTE ALL FITS
// ============================================================
type FitResults = Record<FitType, PolyFitResult | PowerFitResult>;
const allFits: Record<CurveKey, FitResults> = {} as Record<CurveKey, FitResults>;
for (const key of curveKeys) {
  const ds = datasets[key];
  allFits[key] = {
    poly3: polyFit(ds.x, ds.y, 3),
    poly4: polyFit(ds.x, ds.y, 4),
    poly5: polyFit(ds.x, ds.y, 5),
    power: powerFit(ds.x, ds.y)
  };
}

// ============================================================
//  FORMATTING
// ============================================================
function fmt(v: number, sig = 4): string {
  if (v === 0) return '0';
  if (Math.abs(v) < 0.001 || Math.abs(v) >= 1e5) return v.toExponential(sig - 1);
  return parseFloat(v.toPrecision(sig)).toString();
}

function getEquation(type: FitType, fit: PolyFitResult | PowerFitResult): string {
  if (type === 'power') {
    const pf = fit as PowerFitResult;
    return `y = ${fmt(pf.a)}·x^(${fmt(pf.b)}) + ${fmt(pf.c)}`;
  }
  const sup = ['', '', '²', '³', '⁴', '⁵'];
  const pf = fit as PolyFitResult;
  const deg = pf.degree;
  let s = 'y = ';
  for (let i = deg; i >= 0; i--) {
    const c = pf.coeffs[i];
    if (i < deg) s += c >= 0 ? ' + ' : ' − ';
    const v = i < deg ? fmt(Math.abs(c)) : fmt(c);
    s += i === 0 ? v : i === 1 ? v + '·x' : v + '·x' + sup[i];
  }
  return s;
}

// ============================================================
//  DECLARE PLOTLY TYPE
// ============================================================
declare global {
  interface Window {
    Plotly?: {
      react: (el: HTMLElement, data: unknown[], layout: unknown, config: unknown) => void;
      Plots: { resize: (el: HTMLElement) => void };
    };
  }
}

// ============================================================
//  COMPONENT
// ============================================================
export default function GraphFittingTool() {
  const chartRef = useRef<HTMLDivElement>(null);
  const [plotlyLoaded, setPlotlyLoaded] = useState(false);
  const [activeDataset, setActiveDataset] = useState<'all' | CurveKey>('all');
  const [activeFits, setActiveFits] = useState<Set<FitType>>(new Set<FitType>(['poly5', 'power']));
  const [showExtrapolation, setShowExtrapolation] = useState(true);

  useEffect(() => {
    if (window.Plotly) { setPlotlyLoaded(true); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.plot.ly/plotly-2.32.0.min.js';
    script.onload = () => setPlotlyLoaded(true);
    document.head.appendChild(script);
  }, []);

  const toggleFit = useCallback((ft: FitType) => {
    setActiveFits(prev => {
      const next = new Set(prev);
      if (next.has(ft)) next.delete(ft); else next.add(ft);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!plotlyLoaded || !chartRef.current || !window.Plotly) return;

    const allX = [...datasets.curve1.x, ...datasets.curve2.x, ...datasets.curve3.x];
    const maxDataX = Math.max(...allX);
    const xEnd = showExtrapolation ? 25000 : maxDataX + 500;
    const nPts = 600;
    const evalXs = Array.from({ length: nPts }, (_, i) => 150 + (xEnd - 150) * i / (nPts - 1));

    const traces: unknown[] = [];
    const keysToFit = activeDataset === 'all' ? curveKeys : [activeDataset];

    for (const key of curveKeys) {
      const ds = datasets[key];
      const sel = activeDataset === key || activeDataset === 'all';
      traces.push({
        x: [...ds.x], y: [...ds.y], mode: 'markers', type: 'scatter', name: ds.name,
        marker: { color: ds.color, size: sel ? 8 : 5, opacity: sel ? 1 : 0.25 },
        hovertemplate: `${ds.name}<br>Range: %{x:,.0f} km<br>Fuel: %{y:.3f} kg/km<extra></extra>`
      });
    }

    for (const ft of fitOrder) {
      if (!activeFits.has(ft)) continue;
      for (const key of keysToFit) {
        const fits = allFits[key];
        const ys = evalXs.map(x => fits[ft].eval(x));
        const label = keysToFit.length > 1
          ? `${fitNames[ft]} — ${datasets[key].name}`
          : fitNames[ft];
        const color = keysToFit.length > 1 ? datasets[key].color : fitColors[ft];
        traces.push({
          x: evalXs, y: ys, mode: 'lines', type: 'scatter', name: label,
          line: { color, width: 2.5, dash: fitDash[ft] },
          hovertemplate: `${label}<br>x: %{x:,.0f} km<br>y: %{y:.3f}<extra></extra>`
        });
      }
    }

    const shapes: unknown[] = [{
      type: 'rect', xref: 'x', yref: 'paper', x0: 6500, x1: 7500, y0: 0, y1: 1,
      fillcolor: 'rgba(59,130,246,0.06)', line: { width: 0 }
    }];
    const annotations: unknown[] = [{
      x: 7000, y: 1.02, yref: 'paper', xref: 'x', showarrow: false,
      text: '~7,000 km: types converge', font: { color: '#3b82f6', size: 10 }, yanchor: 'bottom'
    }];
    if (showExtrapolation) {
      shapes.push({
        type: 'line', xref: 'x', yref: 'paper', x0: maxDataX, x1: maxDataX, y0: 0, y1: 1,
        line: { color: 'rgba(156,163,175,0.5)', width: 1, dash: 'dash' }
      });
      annotations.push({
        x: maxDataX, y: 0.03, yref: 'paper', xref: 'x', showarrow: false,
        text: '← Data  |  Extrapolation →', font: { color: '#9ca3af', size: 10 }, xanchor: 'center'
      });
    }

    const layout = {
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: '#ffffff',
      font: { family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#374151', size: 12 },
      xaxis: {
        title: { text: 'Range (km)', font: { size: 13, color: '#6b7280' } },
        gridcolor: '#e5e7eb', zerolinecolor: '#d1d5db',
        range: [0, xEnd], dtick: 5000, tickformat: ',d'
      },
      yaxis: {
        title: { text: 'Fuel Burn (kg / km)', font: { size: 13, color: '#6b7280' } },
        gridcolor: '#e5e7eb', zerolinecolor: '#d1d5db',
        range: [-2, 22]
      },
      legend: { bgcolor: 'rgba(255,255,255,0.9)', font: { size: 11 }, x: 1, xanchor: 'right', y: 1, bordercolor: '#e5e7eb', borderwidth: 1 },
      margin: { t: 30, r: 20, b: 55, l: 65 },
      shapes, annotations, hovermode: 'closest'
    };

    window.Plotly.react(chartRef.current, traces, layout, {
      responsive: true, displayModeBar: 'hover', displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d']
    });
  }, [plotlyLoaded, activeDataset, activeFits, showExtrapolation]);

  useEffect(() => {
    if (!plotlyLoaded || !chartRef.current || !window.Plotly) return;
    const el = chartRef.current;
    const onResize = () => window.Plotly?.Plots.resize(el);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [plotlyLoaded]);

  const keysToFit = activeDataset === 'all' ? curveKeys : [activeDataset];

  return (
    <div>
      <div ref={chartRef} className="w-full rounded-lg border border-gray-200" style={{ height: 520 }} />

      {/* Controls */}
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider min-w-[50px]">Data</span>
          <div className="flex gap-1.5">
            {([['all', 'All'], ['curve1', 'UE Widebody'], ['curve2', '787-900'], ['curve3', 'A350-900']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveDataset(key)}
                className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-all ${
                  activeDataset === key
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider min-w-[50px]">Fit</span>
          <div className="flex gap-1.5">
            {fitOrder.map(ft => (
              <button
                key={ft}
                onClick={() => toggleFit(ft)}
                className="px-3 py-1.5 rounded-md border text-sm font-medium transition-all"
                style={activeFits.has(ft) ? {
                  backgroundColor: fitColors[ft],
                  borderColor: fitColors[ft],
                  color: '#fff'
                } : {
                  backgroundColor: '#fff',
                  borderColor: '#e5e7eb',
                  color: '#6b7280'
                }}
              >
                {ft === 'power' ? 'Power' : `Poly ${ft.slice(4)}`}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showExtrapolation}
            onChange={e => setShowExtrapolation(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Extend x-axis beyond data to expose extrapolation behaviour
        </label>
      </div>

      {/* Results */}
      {activeFits.size > 0 && (
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Fit Results{activeDataset !== 'all' ? ` — ${datasets[activeDataset].name}` : ''}
          </h3>
          {keysToFit.map(key => (
            <div key={key}>
              {keysToFit.length > 1 && (
                <div className="mt-2 text-xs font-semibold" style={{ color: datasets[key].color }}>
                  {datasets[key].name}
                </div>
              )}
              {fitOrder.filter(ft => activeFits.has(ft)).map(ft => {
                const f = allFits[key][ft];
                const r2Color = f.r2 > 0.98 ? '#16a34a' : f.r2 > 0.95 ? '#ea580c' : '#dc2626';
                return (
                  <div key={`${key}-${ft}`} className="flex justify-between items-baseline gap-4 flex-wrap py-1.5 border-b border-gray-100 last:border-b-0">
                    <span className="font-semibold text-sm whitespace-nowrap" style={{ color: fitColors[ft] }}>
                      {fitNames[ft]}
                    </span>
                    <span className="font-mono text-xs text-gray-400 overflow-x-auto whitespace-nowrap flex-1 text-center">
                      {getEquation(ft, f)}
                    </span>
                    <span className="font-bold text-sm whitespace-nowrap" style={{ color: r2Color }}>
                      R² = {f.r2.toFixed(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400 text-center">
        Data digitised from DfT aviation fuel efficiency report · Fits computed via least-squares &amp; Levenberg–Marquardt
      </p>
    </div>
  );
}
