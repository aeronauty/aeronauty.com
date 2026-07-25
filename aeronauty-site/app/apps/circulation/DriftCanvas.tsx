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
 *
 * Zoom scales the world window (up to ~50 chords wide) with proportionally
 * more tracked particles; the displacement-vector overlay and the field
 * statistics exist to answer one question honestly: after the foil has gone,
 * what did the air KEEP — and the vertical answer is zero.
 */

// world window at zoom 1, in chords; both dimensions scale with zoom
const BASE_W = 6.4
const BASE_HALF_H = 1.5
const ASPECT = BASE_W / (2 * BASE_HALF_H)
const BASE_SPEED = 1.6 // on-screen chords/s at slow-mo 1, zoom 1 (scaled by zoom)
const QC_END = -1.4
const HOLD_SECONDS = 3

const INK = '#1a1714'
const PAPER = '#f4efe4'
const RULE = '#d8d0c2'
const RED_DOT = 'rgba(215, 38, 61, 0.78)'
const BLUE_DOT = 'rgba(31, 95, 139, 0.78)'

// Eulerian probes: fixed lab points near the path whose time-integrated air
// velocity gives the circulation (u) and the net downwash -> 0 (v)
const PROBE_X = 3.3
const PROBE_Y = 0.3

// material-line stations as fractions of the window
const LINE_FRACS = [0.17, 0.34, 0.52, 0.69, 0.86]
const HLINE_FRACS = [-2 / 3, -0.4, -1 / 6, 1 / 6, 0.4, 2 / 3]

const MAX_PARTICLES = 12000

type Density = 'sparse' | 'normal' | 'dense'
const DENSITY_FACTOR: Record<Density, number> = { sparse: 1.5, normal: 1, dense: 0.72 }

interface GridState {
  grid: VelocityGrid
  sol: FoilSolution
  version: number
}

interface MatLine {
  lx: Float64Array
  ly: Float64Array
  /** seed station: x for vertical lines, y for horizontal ones */
  s0: number
  n: number
}

interface ParticleSystem {
  zoom: number
  x1: number
  yHalf: number
  qcStart: number
  px: Float64Array
  py: Float64Array
  ox: Float64Array
  oy: Float64Array
  lines: MatLine[]
  hlines: MatLine[]
  t: number
  phase: 'running' | 'hold'
  holdLeft: number
  /** time-integrated air velocity at the two fixed probes */
  probeAbove: number
  probeBelow: number
  probeVAbove: number
  probeVBelow: number
}

function seed(zoom: number, density: Density): ParticleSystem {
  const x1 = BASE_W * zoom
  const yHalf = BASE_HALF_H * zoom
  // world spacing grows like sqrt(zoom): the on-screen field gets denser as
  // you zoom out, while the total count grows ~linearly with zoom
  let spacing = 0.16 * Math.sqrt(zoom) * DENSITY_FACTOR[density]
  const count = (x1 / spacing) * ((2 * yHalf) / (spacing * 0.725))
  if (count > MAX_PARTICLES) spacing *= Math.sqrt(count / MAX_PARTICLES)
  const dy = spacing * 0.725

  const xs: number[] = []
  const ys: number[] = []
  for (let x = spacing / 2; x <= x1; x += spacing) {
    // stagger rows so no particle sits exactly on the flight path
    for (let y = -yHalf + dy / 2; y <= yHalf; y += dy) {
      xs.push(x)
      ys.push(y)
    }
  }

  const lineN = Math.min(261, Math.round(101 * Math.sqrt(zoom)))
  const lines: MatLine[] = LINE_FRACS.map((f) => {
    const lx = new Float64Array(lineN)
    const ly = new Float64Array(lineN)
    for (let i = 0; i < lineN; i++) {
      lx[i] = f * x1
      ly[i] = -yHalf + (i * 2 * yHalf) / (lineN - 1)
    }
    return { lx, ly, s0: f * x1, n: lineN }
  })
  const hlineN = Math.min(289, Math.round(129 * Math.sqrt(zoom)))
  const hlines: MatLine[] = HLINE_FRACS.map((f) => {
    const lx = new Float64Array(hlineN)
    const ly = new Float64Array(hlineN)
    for (let i = 0; i < hlineN; i++) {
      lx[i] = (i * x1) / (hlineN - 1)
      ly[i] = f * yHalf
    }
    return { lx, ly, s0: f * yHalf, n: hlineN }
  })

  return {
    zoom,
    x1,
    yHalf,
    qcStart: x1 + 1,
    px: Float64Array.from(xs),
    py: Float64Array.from(ys),
    ox: Float64Array.from(xs),
    oy: Float64Array.from(ys),
    lines,
    hlines,
    t: 0,
    phase: 'running',
    holdLeft: 0,
    probeAbove: 0,
    probeBelow: 0,
    probeVAbove: 0,
    probeVBelow: 0,
  }
}

export function DriftCanvas({ gridState }: { gridState: GridState | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const measuredRef = useRef<HTMLSpanElement>(null)
  const predictedRef = useRef<HTMLSpanElement>(null)
  const downwashRef = useRef<HTMLSpanElement>(null)
  const statsRef = useRef<HTMLSpanElement>(null)
  const historyRef = useRef<HTMLCanvasElement>(null)

  const [playing, setPlaying] = useState(true)
  const [slowmo, setSlowmo] = useState(0.2)
  const [zoom, setZoom] = useState(1)
  const [density, setDensity] = useState<Density>('normal')
  const [trails, setTrails] = useState(true)
  const [showLines, setShowLines] = useState(true)
  const [showHLines, setShowHLines] = useState(true)
  const [showVectors, setShowVectors] = useState(false)
  const [vecGain, setVecGain] = useState(30)
  const [resetTick, setResetTick] = useState(0)

  const playingRef = useRef(playing)
  const slowmoRef = useRef(slowmo)
  const trailsRef = useRef(trails)
  const linesRef = useRef(showLines)
  const hlinesRef = useRef(showHLines)
  const vectorsRef = useRef(showVectors)
  const vecGainRef = useRef(vecGain)
  const visibleRef = useRef(true)
  playingRef.current = playing
  slowmoRef.current = slowmo
  trailsRef.current = trails
  linesRef.current = showLines
  hlinesRef.current = showHLines
  vectorsRef.current = showVectors
  vecGainRef.current = vecGain

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

    const sys = seed(zoom, density)
    // time histories of the two net-vertical measures, kept through the hold
    const hist: { t: number[]; dy: number[]; vint: number[] } = { t: [], dy: [], vint: [] }
    let raf = 0
    let lastMs = 0
    let lastReadout = 0
    let needsClear = true

    const v = { x: 0, y: 0 }

    const airVelocity = (x: number, y: number, qc: number, out: { x: number; y: number }) => {
      // foil-relative position; the grid is in foil coordinates (LE near 0)
      samplePerturbation(grid, x - (qc - 0.25), y, out)
    }

    // The animated flight only spans qc in [QC_END, qcStart]. Pre-integrate
    // the two tails (foil far right before the pass, far left after it) from
    // the same far field, so the displayed measurements genuinely converge.
    const probeTail = (py: number): { u: number; v: number } => {
      const dt = 0.05
      let accU = 0
      let accV = 0
      const far = sys.qcStart + 90
      for (let qc = sys.qcStart + 0.5 * dt; qc < far; qc += dt) {
        airVelocity(PROBE_X, py, qc, v)
        accU += v.x * dt
        accV += v.y * dt
      }
      for (let qc = QC_END - 0.5 * dt; qc > -90; qc -= dt) {
        airVelocity(PROBE_X, py, qc, v)
        accU += v.x * dt
        accV += v.y * dt
      }
      return { u: accU, v: accV }
    }
    const tailAbove = probeTail(PROBE_Y)
    const tailBelow = probeTail(-PROBE_Y)
    const applyTails = () => {
      sys.probeAbove = tailAbove.u
      sys.probeBelow = tailBelow.u
      sys.probeVAbove = tailAbove.v
      sys.probeVBelow = tailBelow.v
    }
    applyTails()

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
      const qcMid = sys.qcStart - (t0 + 0.5 * dt)
      const qcEnd = sys.qcStart - (t0 + dt)
      for (let i = 0; i < n; i++) {
        // midpoint rule: sample, take half step, resample at midpoint time
        airVelocity(arrX[i], arrY[i], sys.qcStart - t0, v)
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
        for (const line of sys.lines) advect(line.lx, line.ly, line.n, sys.t, h)
        for (const hline of sys.hlines) advect(hline.lx, hline.ly, hline.n, sys.t, h)
        // accumulate the impulse integrals at the two fixed probes (midpoint rule)
        const qcMid = sys.qcStart - (sys.t + 0.5 * h)
        airVelocity(PROBE_X, PROBE_Y, qcMid, v)
        sys.probeAbove += v.x * h
        sys.probeVAbove += v.y * h
        airVelocity(PROBE_X, -PROBE_Y, qcMid, v)
        sys.probeBelow += v.x * h
        sys.probeVBelow += v.y * h
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
      const sx = (x: number) => (x / sys.x1) * cssW
      const sy = (y: number) => ((sys.yHalf - y) / (2 * sys.yHalf)) * cssH

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

      // vertical material lines: original (dashed) + deformed, lobe filled
      if (linesRef.current) {
        for (const line of sys.lines) {
          ctx.strokeStyle = RULE
          ctx.setLineDash([3, 5])
          ctx.beginPath()
          ctx.moveTo(sx(line.s0), sy(-sys.yHalf))
          ctx.lineTo(sx(line.s0), sy(sys.yHalf))
          ctx.stroke()
          ctx.setLineDash([])

          ctx.beginPath()
          ctx.moveTo(sx(line.lx[0]), sy(line.ly[0]))
          for (let i = 1; i < line.n; i++) ctx.lineTo(sx(line.lx[i]), sy(line.ly[i]))
          ctx.lineTo(sx(line.s0), sy(line.ly[line.n - 1]))
          ctx.lineTo(sx(line.s0), sy(line.ly[0]))
          ctx.closePath()
          ctx.fillStyle = 'rgba(26, 23, 20, 0.05)'
          ctx.fill()

          ctx.strokeStyle = 'rgba(26, 23, 20, 0.75)'
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.moveTo(sx(line.lx[0]), sy(line.ly[0]))
          for (let i = 1; i < line.n; i++) ctx.lineTo(sx(line.lx[i]), sy(line.ly[i]))
          ctx.stroke()
        }
      }

      // horizontal material lines: they bulge while the foil passes and end
      // flat again — no net downwash survives the passage
      if (hlinesRef.current) {
        for (const hline of sys.hlines) {
          ctx.strokeStyle = RULE
          ctx.setLineDash([3, 5])
          ctx.beginPath()
          ctx.moveTo(sx(0), sy(hline.s0))
          ctx.lineTo(sx(sys.x1), sy(hline.s0))
          ctx.stroke()
          ctx.setLineDash([])

          ctx.beginPath()
          ctx.moveTo(sx(hline.lx[0]), sy(hline.ly[0]))
          for (let i = 1; i < hline.n; i++) ctx.lineTo(sx(hline.lx[i]), sy(hline.ly[i]))
          ctx.lineTo(sx(hline.lx[hline.n - 1]), sy(hline.s0))
          ctx.lineTo(sx(hline.lx[0]), sy(hline.s0))
          ctx.closePath()
          ctx.fillStyle = 'rgba(26, 23, 20, 0.05)'
          ctx.fill()

          ctx.strokeStyle = 'rgba(26, 23, 20, 0.55)'
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.moveTo(sx(hline.lx[0]), sy(hline.ly[0]))
          for (let i = 1; i < hline.n; i++) ctx.lineTo(sx(hline.lx[i]), sy(hline.ly[i]))
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

      // displacement vectors: seed -> now, amplified. The instrument for
      // "what did the air keep": horizontal shear survives, vertical nets out.
      if (vectorsRef.current) {
        const gain = vecGainRef.current
        ctx.strokeStyle = 'rgba(26, 23, 20, 0.5)'
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let i = 0; i < n; i++) {
          const dx = (sys.px[i] - sys.ox[i]) * gain
          const dy = (sys.py[i] - sys.oy[i]) * gain
          const x0 = sx(sys.ox[i])
          const y0 = sy(sys.oy[i])
          const x1p = sx(sys.ox[i] + dx)
          const y1p = sy(sys.oy[i] + dy)
          if (Math.abs(x1p - x0) < 1 && Math.abs(y1p - y0) < 1) continue
          ctx.moveTo(x0, y0)
          ctx.lineTo(x1p, y1p)
        }
        ctx.stroke()
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
      const qc = sys.qcStart - sys.t
      const ox = qc - 0.25
      if (ox + geo.bbox.xMax > -0.2 && ox + geo.bbox.xMin < sys.x1 + 0.2) {
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
      if (downwashRef.current) {
        const net = 0.5 * (sys.probeVAbove + sys.probeVBelow)
        downwashRef.current.textContent = net.toFixed(3)
      }
      let meanDyNow = 0
      if (statsRef.current) {
        // whole-field particle statistics: the net-motion answer
        let sumDy = 0
        let sumAbsDy = 0
        let sumDxAbove = 0
        let nAbove = 0
        let sumDxBelow = 0
        let nBelow = 0
        const n = sys.px.length
        for (let i = 0; i < n; i++) {
          const dx = sys.px[i] - sys.ox[i]
          const dy = sys.py[i] - sys.oy[i]
          sumDy += dy
          sumAbsDy += Math.abs(dy)
          if (sys.oy[i] > 0) {
            sumDxAbove += dx
            nAbove++
          } else {
            sumDxBelow += dx
            nBelow++
          }
        }
        meanDyNow = sumDy / n
        const f = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(4)
        statsRef.current.textContent =
          `⟨Δy⟩ ${f(sumDy / n)} · ⟨|Δy|⟩ ${(sumAbsDy / n).toFixed(4)} · ` +
          `⟨Δx⟩ above ${f(sumDxAbove / Math.max(1, nAbove))} · below ${f(sumDxBelow / Math.max(1, nBelow))} · n=${n}`
      }

      // ---- net-vertical strip chart: the whole argument in one trace ----
      if (sys.phase === 'running') {
        hist.t.push(sys.t)
        hist.dy.push(meanDyNow)
        hist.vint.push(0.5 * (sys.probeVAbove + sys.probeVBelow))
        if (hist.t.length > 2400) {
          hist.t.shift()
          hist.dy.shift()
          hist.vint.shift()
        }
      }
      const hc = historyRef.current
      if (hc && hist.t.length > 1) {
        const w = hc.clientWidth
        const hgt = w / 9
        const dpr2 = window.devicePixelRatio || 1
        if (hc.width !== Math.round(w * dpr2)) {
          hc.width = Math.round(w * dpr2)
          hc.height = Math.round(hgt * dpr2)
        }
        const hctx = hc.getContext('2d')
        if (hctx) {
          hctx.setTransform(dpr2, 0, 0, dpr2, 0, 0)
          hctx.fillStyle = '#fbf8f1'
          hctx.fillRect(0, 0, w, hgt)
          const tMax = sys.qcStart - QC_END
          const amp = Math.max(0.06, ...hist.dy.map(Math.abs), ...hist.vint.map(Math.abs)) * 1.2
          const hx = (t: number) => (t / tMax) * w
          const hy = (v: number) => hgt / 2 - (v / amp) * (hgt / 2 - 4)
          hctx.strokeStyle = RULE
          hctx.lineWidth = 1
          hctx.beginPath()
          hctx.moveTo(0, hgt / 2)
          hctx.lineTo(w, hgt / 2)
          hctx.stroke()
          const trace = (vals: number[], style: string, dash: number[]) => {
            hctx.strokeStyle = style
            hctx.setLineDash(dash)
            hctx.lineWidth = 1.6
            hctx.beginPath()
            for (let i = 0; i < hist.t.length; i++) {
              const X = hx(hist.t[i])
              const Y = hy(vals[i])
              i === 0 ? hctx.moveTo(X, Y) : hctx.lineTo(X, Y)
            }
            hctx.stroke()
            hctx.setLineDash([])
          }
          trace(hist.vint, '#a81c2e', [4, 3])
          trace(hist.dy, '#1a1714', [])
          hctx.fillStyle = '#6b635a'
          hctx.font = `10px ui-monospace, monospace`
          hctx.fillText(`±${amp.toFixed(2)} c`, 6, 12)
        }
      }
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
          // cap per-frame sim time so extreme zoom x speed stays integrable
          step(Math.min(dtReal * BASE_SPEED * sys.zoom * slowmoRef.current, 0.8))
          if (sys.qcStart - sys.t < QC_END) {
            sys.phase = 'hold'
            sys.holdLeft = HOLD_SECONDS
          }
        } else {
          sys.holdLeft -= dtReal
          if (sys.holdLeft <= 0) {
            const fresh = seed(sys.zoom, density)
            sys.px = fresh.px
            sys.py = fresh.py
            sys.ox = fresh.ox
            sys.oy = fresh.oy
            sys.lines = fresh.lines
            sys.hlines = fresh.hlines
            sys.t = 0
            applyTails()
            sys.phase = 'running'
            needsClear = true
            hist.t.length = 0
            hist.dy.length = 0
            hist.vint.length = 0
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
  }, [gridState, resetTick, zoom, density])

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
        <button className="button-secondary" onClick={() => setResetTick((n) => n + 1)}>
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
        <label className="flex items-center gap-3">
          <span className="data-strip">zoom out</span>
          <input
            ref={noWheel}
            type="range"
            min={1}
            max={8}
            step={0.5}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ accentColor: 'var(--accent)' }}
          />
          <span className="data-strip w-20 text-[var(--ink)]">{(BASE_W * zoom).toFixed(0)} chords</span>
        </label>
        <label className="flex items-center gap-2">
          <span className="data-strip">particles</span>
          <select
            value={density}
            onChange={(e) => setDensity(e.target.value as Density)}
            className="data-strip rounded-[2px] border border-[var(--rule)] bg-[var(--paper-raised)] px-2 py-1 text-[var(--ink)]"
          >
            <option value="sparse">sparse</option>
            <option value="normal">normal</option>
            <option value="dense">dense</option>
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={trails} onChange={(e) => setTrails(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
          <span className="data-strip">trails</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
          <span className="data-strip">vertical lines</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={showHLines} onChange={(e) => setShowHLines(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
          <span className="data-strip">horizontal lines</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={showVectors}
            onChange={(e) => setShowVectors(e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          <span className="data-strip">displacement vectors</span>
        </label>
        {showVectors && (
          <label className="flex items-center gap-3">
            <span className="data-strip">× gain</span>
            <input
              ref={noWheel}
              type="range"
              min={0}
              max={3}
              step={0.1}
              value={Math.log10(vecGain)}
              onChange={(e) => setVecGain(10 ** Number(e.target.value))}
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="data-strip w-14 text-[var(--ink)]">{vecGain.toFixed(0)}×</span>
          </label>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-[var(--rule)] pt-3">
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
        <div>
          <span className="data-strip">net ∫v&thinsp;dt&nbsp;</span>
          <span ref={downwashRef} className="font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
            —
          </span>
        </div>
        <div className="w-full">
          <span className="data-strip">field drift&nbsp;</span>
          <span ref={statsRef} className="font-mono text-sm tabular-nums text-[var(--ink)]">
            —
          </span>
        </div>
      </div>
      <div className="mt-3">
        <canvas
          ref={historyRef}
          className="w-full rounded-[2px] border border-[var(--rule)]"
          style={{ aspectRatio: '9' }}
          role="img"
          aria-label="Time history of net vertical displacement through the pass"
        />
        <p className="data-strip mt-1">
          net vertical, through the whole pass: <span style={{ color: 'var(--ink)' }}>⟨Δy⟩ of every
          particle</span> · <span style={{ color: 'var(--accent-deep)' }}>∫v dt at the probes
          (dashed)</span> — both swell while the foil passes and collapse back to zero. That is the
          whole argument.
        </p>
      </div>
      <p className="data-strip mt-2">
        probes fixed in the room (+) at y = ±0.3c integrate air velocity as the foil passes (tails
        beyond the window pre-integrated) · U·ΔΔx positive = below-path air dragged with the foil ·
        net ∫v&thinsp;dt is the accumulated downwash — watch it return to zero · field drift
        averages every tracked particle&apos;s permanent displacement, in chords
      </p>
    </div>
  )
}
