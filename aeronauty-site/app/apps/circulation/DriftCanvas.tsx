'use client'

import { useEffect, useRef, useState } from 'react'
import { FoilSolution } from '@/lib/foil/solver'
import { VelocityGrid, samplePerturbation } from '@/lib/foil/field'
import { insideFoil } from '@/lib/foil/geometry'
import { noWheel } from './CirculationLab'

/**
 * The lab-frame exhibit: air initially at rest, the solved section flies
 * through it. Air velocity at a lab point is just the perturbation field of
 * the panel solution evaluated at the foil-relative position — the freestream
 * subtracts out exactly (Galilean transform), so what the particles do IS the
 * disturbance the foil leaves behind.
 */

// lab window, in chords
const X0 = 0
const X1 = 6.4
const Y0 = -1.5
const Y1 = 1.5
const ASPECT = (X1 - X0) / (Y1 - Y0)

// foil quarter-chord path: y = 0, from START toward END at U = 1
const QC_START = 7.4
const QC_END = -1.4
const BASE_SPEED = 1.6 // on-screen chords per second at slow-mo 1
const HOLD_SECONDS = 3 // pause on the aftermath before looping

const INK = '#1a1714'
const PAPER = '#f4efe4'
const RULE = '#d8d0c2'
const RED_DOT = 'rgba(215, 38, 61, 0.78)'
const BLUE_DOT = 'rgba(31, 95, 139, 0.78)'

// Eulerian probes for the live circulation measurement: fixed lab points
// whose time-integrated horizontal air velocity is the theorem's quantity
const PROBE_X = 3.3
const PROBE_Y = 0.3
const LINE_XS = [1.1, 2.2, 3.3, 4.4, 5.5]
const LINE_N = 101 // points per material line
const LINE_Y0 = -1.5
const LINE_DY = 0.03

interface GridState {
  grid: VelocityGrid
  sol: FoilSolution
  version: number
}

interface ParticleSystem {
  px: Float64Array
  py: Float64Array
  ox: Float64Array // seed positions
  oy: Float64Array
  lines: { lx: Float64Array; ly: Float64Array; x0: number }[]
  t: number
  phase: 'running' | 'hold'
  holdLeft: number
  /** time-integrated horizontal air velocity at the two fixed probes */
  probeAbove: number
  probeBelow: number
}

function seed(): ParticleSystem {
  const xs: number[] = []
  const ys: number[] = []
  for (let x = 0.08; x <= X1; x += 0.16) {
    for (let y = -1.45; y <= 1.451; y += 0.116) {
      xs.push(x)
      ys.push(y)
    }
  }
  const lines = LINE_XS.map((x0) => {
    const lx = new Float64Array(LINE_N)
    const ly = new Float64Array(LINE_N)
    for (let i = 0; i < LINE_N; i++) {
      lx[i] = x0
      ly[i] = LINE_Y0 + i * LINE_DY
    }
    return { lx, ly, x0 }
  })
  return {
    px: Float64Array.from(xs),
    py: Float64Array.from(ys),
    ox: Float64Array.from(xs),
    oy: Float64Array.from(ys),
    lines,
    t: 0,
    phase: 'running',
    holdLeft: 0,
    probeAbove: 0,
    probeBelow: 0,
  }
}

export function DriftCanvas({ gridState }: { gridState: GridState | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const measuredRef = useRef<HTMLSpanElement>(null)
  const predictedRef = useRef<HTMLSpanElement>(null)

  const [playing, setPlaying] = useState(true)
  const [slowmo, setSlowmo] = useState(0.2)
  const [trails, setTrails] = useState(true)
  const [showLines, setShowLines] = useState(true)
  const [resetTick, setResetTick] = useState(0)

  const playingRef = useRef(playing)
  const slowmoRef = useRef(slowmo)
  const trailsRef = useRef(trails)
  const linesRef = useRef(showLines)
  const visibleRef = useRef(true)
  playingRef.current = playing
  slowmoRef.current = slowmo
  trailsRef.current = trails
  linesRef.current = showLines

  useEffect(() => {
    // start paused for users who asked for reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(false)
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      visibleRef.current = entries[0]?.isIntersecting ?? true
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!gridState) return
    const canvas = canvasRef.current
    if (!canvas) return
    const { grid, sol } = gridState
    const geo = sol.geo

    const sys = seed()
    let raf = 0
    let lastMs = 0
    let lastReadout = 0
    let needsClear = true

    const v = { x: 0, y: 0 }

    const airVelocity = (x: number, y: number, qc: number, out: { x: number; y: number }) => {
      // foil-relative position; the grid is in foil coordinates (LE near 0)
      samplePerturbation(grid, x - (qc - 0.25), y, out)
    }

    // The animated flight only spans qc in [QC_END, QC_START], which captures
    // ~96% of the impulse integral at the probes. Pre-integrate the two tails
    // (foil far right before the pass, far left after it) from the same far
    // field, so the displayed measurement genuinely converges to -Gamma.
    const probeTail = (py: number): number => {
      const dt = 0.05
      let acc = 0
      for (let qc = QC_START + 0.5 * dt; qc < 80; qc += dt) {
        airVelocity(PROBE_X, py, qc, v)
        acc += v.x * dt
      }
      for (let qc = QC_END - 0.5 * dt; qc > -80; qc -= dt) {
        airVelocity(PROBE_X, py, qc, v)
        acc += v.x * dt
      }
      return acc
    }
    const tailAbove = probeTail(PROBE_Y)
    const tailBelow = probeTail(-PROBE_Y)
    sys.probeAbove = tailAbove
    sys.probeBelow = tailBelow

    const eject = (i: number, arrX: Float64Array, arrY: Float64Array, qc: number) => {
      const rx = arrX[i] - (qc - 0.25)
      const ry = arrY[i]
      if (!insideFoil(geo, rx, ry)) return
      let best = Infinity
      let bi = 0
      for (let j = 0; j < geo.panels.length; j++) {
        const p = geo.panels[j]
        const dd = (p.mx - rx) * (p.mx - rx) + (p.my - ry) * (p.my - ry)
        if (dd < best) {
          best = dd
          bi = j
        }
      }
      const p = geo.panels[bi]
      arrX[i] = p.mx + p.nx * 0.01 + (qc - 0.25)
      arrY[i] = p.my + p.ny * 0.01
    }

    const advect = (arrX: Float64Array, arrY: Float64Array, n: number, t0: number, dt: number) => {
      const qcMid = QC_START - (t0 + 0.5 * dt)
      const qcEnd = QC_START - (t0 + dt)
      for (let i = 0; i < n; i++) {
        // midpoint rule: sample, take half step, resample at midpoint time
        airVelocity(arrX[i], arrY[i], QC_START - t0, v)
        const mx = arrX[i] + 0.5 * dt * v.x
        const my = arrY[i] + 0.5 * dt * v.y
        airVelocity(mx, my, qcMid, v)
        arrX[i] += dt * v.x
        arrY[i] += dt * v.y
        eject(i, arrX, arrY, qcEnd)
      }
    }

    const step = (dtSim: number) => {
      const sub = Math.max(1, Math.ceil(dtSim / 0.02))
      const h = dtSim / sub
      for (let s = 0; s < sub; s++) {
        advect(sys.px, sys.py, sys.px.length, sys.t, h)
        for (const line of sys.lines) advect(line.lx, line.ly, LINE_N, sys.t, h)
        // accumulate the impulse integral at the two fixed probes (midpoint rule)
        const qcMid = QC_START - (sys.t + 0.5 * h)
        airVelocity(PROBE_X, PROBE_Y, qcMid, v)
        sys.probeAbove += v.x * h
        airVelocity(PROBE_X, -PROBE_Y, qcMid, v)
        sys.probeBelow += v.x * h
        sys.t += h
      }
    }

    let prevFoilOx: number | null = null

    const foilPath = (ctx: CanvasRenderingContext2D, sx: (x: number) => number, sy: (y: number) => number, ox: number) => {
      ctx.beginPath()
      ctx.moveTo(sx(geo.nodes[0].x + ox), sy(geo.nodes[0].y))
      for (let i = 1; i < geo.nodes.length; i++) {
        ctx.lineTo(sx(geo.nodes[i].x + ox), sy(geo.nodes[i].y))
      }
      ctx.closePath()
    }

    const draw = (cssW: number, cssH: number, ctx: CanvasRenderingContext2D) => {
      const sx = (x: number) => ((x - X0) / (X1 - X0)) * cssW
      const sy = (y: number) => ((Y1 - y) / (Y1 - Y0)) * cssH

      if (needsClear || !trailsRef.current) {
        ctx.fillStyle = PAPER
        ctx.fillRect(0, 0, cssW, cssH)
        needsClear = false
        prevFoilOx = null
      } else {
        // scrub the previous foil silhouette so the ink body doesn't smear
        if (prevFoilOx !== null) {
          foilPath(ctx, sx, sy, prevFoilOx)
          ctx.save()
          ctx.lineWidth = 3
          ctx.fillStyle = PAPER
          ctx.strokeStyle = PAPER
          ctx.fill()
          ctx.stroke()
          ctx.restore()
        }
        ctx.fillStyle = 'rgba(244, 239, 228, 0.16)'
        ctx.fillRect(0, 0, cssW, cssH)
      }

      // flight path
      ctx.strokeStyle = 'rgba(107, 99, 90, 0.3)'
      ctx.setLineDash([2, 6])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, sy(0))
      ctx.lineTo(cssW, sy(0))
      ctx.stroke()
      ctx.setLineDash([])

      // material lines: original (dashed) + deformed, with the swept lobe filled
      if (linesRef.current) {
        for (const line of sys.lines) {
          ctx.strokeStyle = RULE
          ctx.setLineDash([3, 5])
          ctx.beginPath()
          ctx.moveTo(sx(line.x0), sy(LINE_Y0))
          ctx.lineTo(sx(line.x0), sy(-LINE_Y0))
          ctx.stroke()
          ctx.setLineDash([])

          ctx.beginPath()
          ctx.moveTo(sx(line.lx[0]), sy(line.ly[0]))
          for (let i = 1; i < LINE_N; i++) ctx.lineTo(sx(line.lx[i]), sy(line.ly[i]))
          ctx.lineTo(sx(line.x0), sy(line.ly[LINE_N - 1]))
          ctx.lineTo(sx(line.x0), sy(line.ly[0]))
          ctx.closePath()
          ctx.fillStyle = 'rgba(26, 23, 20, 0.05)'
          ctx.fill()

          ctx.strokeStyle = 'rgba(26, 23, 20, 0.75)'
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.moveTo(sx(line.lx[0]), sy(line.ly[0]))
          for (let i = 1; i < LINE_N; i++) ctx.lineTo(sx(line.lx[i]), sy(line.ly[i]))
          ctx.stroke()
        }
      }

      // particles
      const n = sys.px.length
      for (let i = 0; i < n; i++) {
        const x = sx(sys.px[i])
        const y = sy(sys.py[i])
        if (x < -4 || x > cssW + 4) continue
        ctx.fillStyle = sys.oy[i] > 0 ? RED_DOT : BLUE_DOT
        ctx.fillRect(x - 1.1, y - 1.1, 2.2, 2.2)
      }

      // fixed measurement probes
      for (const py of [PROBE_Y, -PROBE_Y]) {
        const cx = sx(PROBE_X)
        const cy = sy(py)
        ctx.strokeStyle = 'rgba(168, 28, 46, 0.85)'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(cx - 5, cy)
        ctx.lineTo(cx + 5, cy)
        ctx.moveTo(cx, cy - 5)
        ctx.lineTo(cx, cy + 5)
        ctx.stroke()
      }

      // foil silhouette
      const qc = QC_START - sys.t
      const ox = qc - 0.25
      if (ox + geo.bbox.xMax > X0 - 0.2 && ox + geo.bbox.xMin < X1 + 0.2) {
        foilPath(ctx, sx, sy, ox)
        ctx.fillStyle = INK
        ctx.fill()
        prevFoilOx = ox
      } else {
        prevFoilOx = null
      }
    }

    const updateReadout = () => {
      const jump = -(sys.probeBelow - sys.probeAbove)
      if (measuredRef.current) measuredRef.current.textContent = jump.toFixed(3)
      if (predictedRef.current) predictedRef.current.textContent = (-sol.circulation).toFixed(3)
    }

    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame)
      const canvasEl = canvasRef.current
      if (!canvasEl || !visibleRef.current) {
        lastMs = ms
        return
      }
      const cssW = canvasEl.clientWidth
      const cssH = cssW / ASPECT
      const dpr = window.devicePixelRatio || 1
      const bw = Math.round(cssW * dpr)
      if (canvasEl.width !== bw) {
        canvasEl.width = bw
        canvasEl.height = Math.round(cssH * dpr)
        needsClear = true
      }
      const ctx = canvasEl.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Generous cap: browsers throttle rAF for occluded/battery-saving
      // windows, and the sim should track wall clock (substepping keeps the
      // integration accurate); only a long absence (tab switch) is clamped.
      const dtReal = Math.min((ms - lastMs) / 1000, 0.6)
      lastMs = ms

      if (playingRef.current) {
        if (sys.phase === 'running') {
          step(dtReal * BASE_SPEED * slowmoRef.current)
          if (QC_START - sys.t < QC_END) {
            sys.phase = 'hold'
            sys.holdLeft = HOLD_SECONDS
          }
        } else {
          sys.holdLeft -= dtReal
          if (sys.holdLeft <= 0) {
            const fresh = seed()
            sys.px = fresh.px
            sys.py = fresh.py
            sys.ox = fresh.ox
            sys.oy = fresh.oy
            sys.lines = fresh.lines
            sys.t = 0
            sys.probeAbove = tailAbove
            sys.probeBelow = tailBelow
            sys.phase = 'running'
            needsClear = true
          }
        }
      }

      draw(cssW, cssH, ctx)
      if (ms - lastReadout > 150) {
        lastReadout = ms
        updateReadout()
      }
    }

    raf = requestAnimationFrame((ms) => {
      lastMs = ms
      raf = requestAnimationFrame(frame)
    })
    return () => cancelAnimationFrame(raf)
  }, [gridState, resetTick])

  return (
    <div ref={wrapRef}>
      <div className="relative">
        {gridState ? (
          <canvas
            ref={canvasRef}
            className="w-full rounded-[2px] border border-[var(--rule)]"
            style={{ aspectRatio: `${ASPECT}` }}
            role="img"
            aria-label="Animation of still air disturbed by the passing foil"
          />
        ) : (
          <div
            className="data-strip flex w-full items-center justify-center rounded-[2px] border border-[var(--rule)] bg-[var(--paper-raised)]"
            style={{ aspectRatio: `${ASPECT}` }}
          >
            computing flow field…
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button className="button-secondary" onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          className="button-secondary"
          onClick={() => setResetTick((n) => n + 1)}
        >
          Restart
        </button>
        <label className="flex items-center gap-3">
          <span className="data-strip">slow-mo</span>
          <input
            ref={noWheel}
            type="range"
            min={-3}
            max={0}
            step={0.05}
            value={Math.log2(slowmo)}
            onChange={(e) => setSlowmo(2 ** Number(e.target.value))}
            style={{ accentColor: 'var(--accent)' }}
          />
          <span className="data-strip w-14 text-[var(--ink)]">{slowmo.toFixed(2)}×</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={trails} onChange={(e) => setTrails(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
          <span className="data-strip">trails</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
          <span className="data-strip">material lines</span>
        </label>

        <div className="ml-auto flex items-baseline gap-5 border-l border-[var(--rule)] pl-6">
          <div>
            <span className="data-strip">measured U·ΔΔx&nbsp;</span>
            <span ref={measuredRef} className="font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
              —
            </span>
          </div>
          <div>
            <span className="data-strip">−Γ solved&nbsp;</span>
            <span ref={predictedRef} className="font-mono text-lg font-bold tabular-nums" style={{ color: 'var(--accent-deep)' }}>
              —
            </span>
          </div>
        </div>
      </div>
      <p className="data-strip mt-2">
        measured at two probes fixed in the room (+) at y = ±0.3c, integrating air velocity as the
        foil passes (tails beyond the visible window pre-integrated from the same field) · positive
        = below-path air dragged with the foil
      </p>
    </div>
  )
}
