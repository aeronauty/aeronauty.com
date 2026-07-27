'use client'

import { useMemo } from 'react'
import { FoilSolution } from '@/lib/foil/solver'

const RED = 'var(--accent)'
const BLUE = '#1f5f8b'
const RULE = 'var(--rule)'
const MUTED = 'var(--muted)'

const W = 420
const H = 300
const PAD = { l: 40, r: 12, t: 14, b: 26 }

export interface CpOverlay {
  x: number[]
  cp: number[]
}

/** Surface Cp vs chordwise station, negative up, split into the two surfaces. */
export function CpPlot({ sol, overlay }: { sol: FoilSolution; overlay?: CpOverlay | null }) {
  const { upperPath, lowerPath, overlayPath, ticks, cpMin } = useMemo(() => {
    const n = sol.geo.panels.length
    const half = n / 2
    // fixed, slightly generous scale so the plot doesn't jump while dragging
    const rawMin = Math.min(-1.2, ...Array.from(sol.cp))
    const min = Math.max(rawMin, -12)
    const max = 1.05

    const px = (xc: number) => PAD.l + xc * (W - PAD.l - PAD.r)
    // aero convention: negative Cp (suction) plotted upward
    const py = (cp: number) => PAD.t + ((cp - min) / (max - min)) * (H - PAD.t - PAD.b)

    const path = (idx: number[]) => {
      let d = ''
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k]
        const cp = Math.max(sol.cp[i], min)
        d += `${k === 0 ? 'M' : 'L'}${px(sol.geo.panels[i].xc).toFixed(1)},${py(cp).toFixed(1)}`
      }
      return d
    }

    // lower surface panels run TE -> LE (indices 0..half-1); reverse for LE -> TE
    const lowerIdx: number[] = []
    for (let i = half - 1; i >= 0; i--) lowerIdx.push(i)
    const upperIdx: number[] = []
    for (let i = half; i < n; i++) upperIdx.push(i)

    // anchor ticks at 0 so the emphasized Cp = 0 axis always renders
    const tickVals: Array<{ cp: number; y: number }> = [{ cp: 1, y: py(1) }, { cp: 0, y: py(0) }]
    const tickStep = min < -6 ? 2 : 1
    for (let cp = -tickStep; cp >= min; cp -= tickStep) {
      tickVals.push({ cp, y: py(cp) })
    }

    // viscous overlay: one dashed polyline in surface order (the short TE
    // closure segment is invisible at plot scale)
    let ovl = ''
    if (overlay) {
      const npts = Math.min(overlay.x.length, overlay.cp.length)
      for (let k = 0; k < npts; k++) {
        const cp = Math.max(Math.min(overlay.cp[k], max), min)
        ovl += `${k === 0 ? 'M' : 'L'}${px(overlay.x[k]).toFixed(1)},${py(cp).toFixed(1)}`
      }
    }
    return { upperPath: path(upperIdx), lowerPath: path(lowerIdx), overlayPath: ovl, ticks: tickVals, cpMin: min, px, py }
  }, [sol, overlay])

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-[2px] border border-[var(--rule)] bg-[var(--paper-raised)]"
      role="img"
      aria-label="Surface pressure coefficient distribution"
    >
      {ticks.map((t) => (
        <g key={t.cp}>
          <line x1={PAD.l} x2={W - PAD.r} y1={t.y} y2={t.y} stroke={RULE} strokeWidth={t.cp === 0 ? 1.4 : 0.7} />
          <text x={PAD.l - 6} y={t.y + 3.5} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-mono), monospace">
            {t.cp}
          </text>
        </g>
      ))}
      <text
        x={PAD.l - 26}
        y={(H - PAD.b + PAD.t) / 2}
        fontSize="10"
        fill={MUTED}
        fontFamily="var(--font-mono), monospace"
        transform={`rotate(-90 ${PAD.l - 26} ${(H - PAD.b + PAD.t) / 2})`}
        textAnchor="middle"
      >
        Cp
      </text>
      <text x={(W + PAD.l - PAD.r) / 2} y={H - 8} fontSize="10" fill={MUTED} textAnchor="middle" fontFamily="var(--font-mono), monospace">
        x / c
      </text>
      <path d={lowerPath} fill="none" stroke={BLUE} strokeWidth="1.8" />
      <path d={upperPath} fill="none" stroke={RED} strokeWidth="1.8" />
      {overlayPath && <path d={overlayPath} fill="none" stroke="var(--ink)" strokeWidth="1.3" strokeDasharray="4 3" opacity="0.75" />}
      {cpMin <= -12 && (
        <text x={W - PAD.r - 4} y={PAD.t + 10} textAnchor="end" fontSize="9" fill={MUTED} fontFamily="var(--font-mono), monospace">
          clipped at −12
        </text>
      )}
    </svg>
  )
}
