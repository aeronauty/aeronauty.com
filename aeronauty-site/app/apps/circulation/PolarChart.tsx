'use client'

import { useMemo } from 'react'

const BLUE = '#1f5f8b'
const RED = 'var(--accent)'
const RULE = 'var(--rule)'
const MUTED = 'var(--muted)'
const INK = 'var(--ink)'

const W = 340
const H = 240
const PAD = { l: 42, r: 10, t: 12, b: 30 }

interface Pane {
  title: string
  xLabel: string
  yLabel: string
  xTicks: number[]
  yTicks: number[]
  xRange: [number, number]
  yRange: [number, number]
  series: Array<{ pts: Array<[number, number]>; color: string; dash?: string; dots?: boolean }>
  marker?: number
}

function Chart({ pane }: { pane: Pane }) {
  const px = (x: number) => PAD.l + ((x - pane.xRange[0]) / (pane.xRange[1] - pane.xRange[0])) * (W - PAD.l - PAD.r)
  const py = (y: number) => PAD.t + ((pane.yRange[1] - y) / (pane.yRange[1] - pane.yRange[0])) * (H - PAD.t - PAD.b)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-[2px] border border-[var(--rule)] bg-[var(--paper-raised)]" role="img" aria-label={pane.title}>
      {pane.yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={PAD.l} x2={W - PAD.r} y1={py(t)} y2={py(t)} stroke={RULE} strokeWidth={t === 0 ? 1.2 : 0.6} />
          <text x={PAD.l - 5} y={py(t) + 3} textAnchor="end" fontSize="9" fill={MUTED} fontFamily="var(--font-mono), monospace">
            {t}
          </text>
        </g>
      ))}
      {pane.xTicks.map((t) => (
        <g key={`x${t}`}>
          <line y1={PAD.t} y2={H - PAD.b} x1={px(t)} x2={px(t)} stroke={RULE} strokeWidth={t === 0 ? 1.2 : 0.6} />
          <text y={H - PAD.b + 12} x={px(t)} textAnchor="middle" fontSize="9" fill={MUTED} fontFamily="var(--font-mono), monospace">
            {t}
          </text>
        </g>
      ))}
      {pane.marker !== undefined && (
        <line x1={px(pane.marker)} x2={px(pane.marker)} y1={PAD.t} y2={H - PAD.b} stroke="var(--accent-deep)" strokeWidth="1" strokeDasharray="2 4" />
      )}
      {pane.series.map((s, i) => {
        const cx = (x: number) => px(Math.max(pane.xRange[0], Math.min(pane.xRange[1], x)))
        const cy = (y: number) => py(Math.max(pane.yRange[0], Math.min(pane.yRange[1], y)))
        const d = s.pts.map(([x, y], k) => `${k === 0 ? 'M' : 'L'}${cx(x).toFixed(1)},${cy(y).toFixed(1)}`).join('')
        return (
          <g key={i}>
            <path d={d} fill="none" stroke={s.color} strokeWidth="1.8" strokeDasharray={s.dash} />
            {s.dots && s.pts.map(([x, y], k) => <circle key={k} cx={cx(x)} cy={cy(y)} r="1.8" fill={s.color} />)}
          </g>
        )
      })}
      <text x={(W + PAD.l - PAD.r) / 2} y={H - 6} textAnchor="middle" fontSize="9" fill={MUTED} fontFamily="var(--font-mono), monospace">
        {pane.xLabel}
      </text>
      <text
        x={12}
        y={(H - PAD.b + PAD.t) / 2}
        fontSize="9"
        fill={MUTED}
        fontFamily="var(--font-mono), monospace"
        transform={`rotate(-90 12 ${(H - PAD.b + PAD.t) / 2})`}
        textAnchor="middle"
      >
        {pane.yLabel}
      </text>
    </svg>
  )
}

/**
 * Inviscid panel line vs flexfoil viscous polar for the snapped section:
 * cl-alpha on the left, drag polar on the right.
 */
export function PolarChart({
  alphas,
  viscousPolar,
  inviscid,
  currentAlpha,
}: {
  alphas: number[]
  viscousPolar: (number[] | null)[]
  inviscid: Array<[number, number]>
  currentAlpha: number
}) {
  const { clPane, cdPane } = useMemo(() => {
    const visc: Array<[number, number]> = []
    const drag: Array<[number, number]> = []
    for (let i = 0; i < alphas.length; i++) {
      const row = viscousPolar[i]
      if (!row) continue
      visc.push([alphas[i], row[0]])
      drag.push([row[1] * 1e4, row[0]])
    }

    // axes sized to the data (within sane caps) so nothing gets clamped into
    // a fake stall plateau or pushed off the frame
    const allCl = [...visc.map((p) => p[1]), ...inviscid.map((p) => p[1])]
    const clTop = Math.min(3, Math.ceil((Math.max(2, ...allCl) + 0.1) * 2) / 2)
    const clBot = Math.max(-2, Math.floor((Math.min(-0.5, ...allCl) - 0.1) * 2) / 2)
    const clTicks: number[] = []
    for (let t = Math.ceil(clBot); t <= clTop; t++) clTicks.push(t)
    const cdMax = Math.min(600, Math.max(300, Math.ceil(Math.max(0, ...drag.map((p) => p[0])) / 100) * 100))
    const cdTicks: number[] = []
    for (let t = 0; t <= cdMax; t += 100) cdTicks.push(t)

    const clPane: Pane = {
      title: 'Lift curve, inviscid panel vs flexfoil viscous',
      xLabel: 'α, deg',
      yLabel: 'cl',
      xRange: [-8, 12],
      yRange: [clBot, clTop],
      xTicks: [-8, -4, 0, 4, 8, 12],
      yTicks: clTicks,
      series: [
        { pts: inviscid, color: RED },
        { pts: visc, color: INK, dots: true },
      ],
      marker: currentAlpha,
    }
    const cdPane: Pane = {
      title: 'Drag polar from flexfoil',
      xLabel: 'cd × 10⁴',
      yLabel: 'cl',
      xRange: [0, cdMax],
      yRange: [clBot, clTop],
      xTicks: cdTicks,
      yTicks: clTicks,
      series: [{ pts: drag, color: BLUE, dots: true }],
    }
    return { clPane, cdPane }
  }, [alphas, viscousPolar, inviscid, currentAlpha])

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Chart pane={clPane} />
        <p className="data-strip mt-1">
          cl–α · <span style={{ color: 'var(--accent-deep)' }}>inviscid panel</span> · viscous
          flexfoil
        </p>
      </div>
      <div>
        <Chart pane={cdPane} />
        <p className="data-strip mt-1">
          drag polar · <span style={{ color: BLUE }}>flexfoil</span> (panel code: cd = 0 by
          d&apos;Alembert)
        </p>
      </div>
    </div>
  )
}
