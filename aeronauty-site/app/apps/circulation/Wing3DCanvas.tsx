'use client'

import { useEffect, useMemo, useRef } from 'react'
import { sectionNodes } from '@/lib/foil/geometry'

/**
 * Hand-rolled 3D view of the vortex-lattice wing: the real 4/40/12 sections
 * lofted along the span, the Gamma(y) loading curtain, and the trailed
 * vortex filaments marched downstream with mutual induction — so the tip
 * roll-up you see is computed from the solved circulation, not drawn by hand.
 * Particles ride the same wake field in 3D. Drag to rotate.
 *
 * Axes: x downstream, y spanwise, z up (the solver's convention).
 */

const INK = '#1a1714'
const PAPER = '#f4efe4'
const RED_DOT = 'rgba(215, 38, 61, 0.8)'
const BLUE_DOT = 'rgba(31, 95, 139, 0.8)'
const ACCENT = '#d7263d'

const WAKE_LEN_FACTOR = 1.6 // wake length in spans
const WAKE_STEPS = 160
const CORE2 = 1e-3 // squared smoothing core for induction

export interface WakeData {
  ys: number[]
  ts: number[]
}

/** PCA reduced-order model of the URANS wake: u(x,y,z) = mean + sum a_k(x) phi_k(y,z) */
export interface PcaField {
  semispan: number
  stations: number[]
  k: number
  y0: number
  z0: number
  ny: number
  nz: number
  dy: number
  dz: number
  mean: number[]
  modes: number[][]
  coeffs: number[][]
}

function pcaVelocity(f: PcaField, x: number, y: number, z: number, out: { y: number; z: number }) {
  out.y = 0
  out.z = 0
  const sgn = y < 0 ? -1 : 1
  const ya = Math.abs(y)
  const fy = (ya - f.y0) / f.dy
  const fz = (z - f.z0) / f.dz
  if (fy < 0 || fy > f.ny - 1.001 || fz < 0 || fz > f.nz - 1.001) return
  // interpolate mode coefficients downstream (clamped)
  const xs = f.stations
  const xc = Math.min(Math.max(x, xs[0]), xs[xs.length - 1])
  let si = 0
  while (si < xs.length - 2 && xs[si + 1] < xc) si++
  const t = (xc - xs[si]) / (xs[si + 1] - xs[si])
  const a: number[] = []
  for (let k = 0; k < f.k; k++) a.push(f.coeffs[si][k] * (1 - t) + f.coeffs[si + 1][k] * t)

  const iy = Math.floor(fy)
  const iz = Math.floor(fz)
  const ty = fy - iy
  const tz = fz - iz
  const N = f.ny * f.nz
  const sample = (off: number): number => {
    const k00 = off + iy * f.nz + iz
    const bil = (arr: number[]) =>
      arr[k00] * (1 - ty) * (1 - tz) + arr[k00 + f.nz] * ty * (1 - tz) + arr[k00 + 1] * (1 - ty) * tz + arr[k00 + f.nz + 1] * ty * tz
    let val = bil(f.mean)
    for (let k = 0; k < f.k; k++) val += a[k] * bil(f.modes[k])
    return val
  }
  out.y = sgn * sample(0)
  out.z = sample(N)
}

/** filament paths [k][station] = (y, z), marched with mutual induction */
function rollUpWake(wake: WakeData, span: number): { paths: Float64Array[]; dx: number } {
  const n = wake.ys.length
  const wakeLen = WAKE_LEN_FACTOR * span
  const dx = wakeLen / WAKE_STEPS
  const paths = Array.from({ length: n }, () => new Float64Array(2 * (WAKE_STEPS + 1)))
  const y = Float64Array.from(wake.ys)
  const z = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    paths[k][0] = y[k]
    paths[k][1] = 0
  }
  for (let s = 1; s <= WAKE_STEPS; s++) {
    for (let k = 0; k < n; k++) {
      let vy = 0
      let vz = 0
      for (let j = 0; j < n; j++) {
        if (j === k) continue
        const dy = y[k] - y[j]
        const dz = z[k] - z[j]
        const r2 = dy * dy + dz * dz + CORE2
        const t = wake.ts[j] / (2 * Math.PI * r2)
        vy += -t * dz
        vz += t * dy
      }
      // freeze into the marching frame: d(y,z)/dx = v/U, U = 1
      paths[k][2 * s] = y[k] + vy * dx
      paths[k][2 * s + 1] = z[k] + vz * dx
    }
    for (let k = 0; k < n; k++) {
      y[k] = paths[k][2 * s]
      z[k] = paths[k][2 * s + 1]
    }
  }
  return { paths, dx }
}

export function Wing3DCanvas({
  mode,
  ar,
  wake,
  ys,
  gammas,
  gamma2d,
  source = 'vlm',
  pca = null,
}: {
  mode: 'walls' | 'tip'
  ar: number
  wake: WakeData
  ys: number[]
  gammas: number[]
  gamma2d: number
  source?: 'vlm' | 'urans'
  pca?: PcaField | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const view = useRef({ az: -0.7, el: 0.42, dragging: false, px: 0, py: 0 })

  const rolled = useMemo(() => rollUpWake(wake, ar), [wake, ar])

  const sections = useMemo(() => {
    const nodes = sectionNodes({ camber: 0.04, camberPos: 0.4, thickness: 0.12, alpha: (6 * Math.PI) / 180, nPanels: 60 })
    return nodes.map((p) => ({ x: p.x, z: p.y }))
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // particles seeded on a uniform lattice upstream of the wing, streaming
    // downstream and recycling to their own column: clean streaklines that
    // show exactly which tubes of air the wake winds up
    const NY = 25
    const NZ = 5
    const NX = 4
    const NP = NY * NZ * NX
    const X_START = -0.6
    const X_END = 1 + WAKE_LEN_FACTOR * ar
    const SPAN_TOTAL = X_END - X_START
    const px = new Float64Array(NP)
    const py = new Float64Array(NP)
    const pz = new Float64Array(NP)
    const oy = new Float64Array(NP)
    const oz = new Float64Array(NP)
    for (let i = 0; i < NP; i++) {
      const col = i % (NY * NZ)
      const iy = col % NY
      const iz = Math.floor(col / NY)
      const layer = Math.floor(i / (NY * NZ))
      oy[i] = ((iy + 0.5) / NY - 0.5) * 1.3 * ar
      oz[i] = ((iz + 0.5) / NZ - 0.5) * 0.36 * ar
      px[i] = X_START + ((layer + 0.5) / NX) * SPAN_TOTAL
      py[i] = oy[i]
      pz[i] = oz[i]
    }

    const usePca = source === 'urans' && pca !== null
    const wakeVel = (x: number, y: number, z: number, out: { y: number; z: number }) => {
      out.y = 0
      out.z = 0
      if (mode === 'walls' || x < 1) return
      if (usePca) {
        pcaVelocity(pca as PcaField, x, y, z, out)
        return
      }
      const s = Math.min(WAKE_STEPS - 1, Math.max(0, Math.floor((x - 1) / rolled.dx)))
      const n = wake.ys.length
      for (let j = 0; j < n; j++) {
        const fy = rolled.paths[j][2 * s]
        const fz = rolled.paths[j][2 * s + 1]
        const dy = y - fy
        const dz = z - fz
        const r2 = dy * dy + dz * dz + CORE2
        const t = wake.ts[j] / (2 * Math.PI * r2)
        out.y += -t * dz
        out.z += t * dy
      }
    }

    let raf = 0
    let lastMs = 0
    const v = { y: 0, z: 0 }

    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame)
      const cssW = canvas.clientWidth
      const cssH = cssW / 2
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(cssW * dpr)) {
        canvas.width = Math.round(cssW * dpr)
        canvas.height = Math.round(cssH * dpr)
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const dt = Math.min((ms - lastMs) / 1000, 0.1) * 2.2
      lastMs = ms

      // advance particles: downstream at U=1 plus wake swirl
      for (let i = 0; i < NP; i++) {
        wakeVel(px[i], py[i], pz[i], v)
        px[i] += dt
        py[i] += v.y * dt
        pz[i] += v.z * dt
        if (px[i] > X_END) {
          px[i] = X_START
          py[i] = oy[i]
          pz[i] = oz[i]
        }
      }

      // ---- projection ----
      const { az, el } = view.current
      const ca = Math.cos(az)
      const sa = Math.sin(az)
      const ce = Math.cos(el)
      const se = Math.sin(el)
      const scale = cssW / (2.6 * ar)
      const cx0 = 0.35 * ar // scene centre (downstream of the wing)
      const proj = (x: number, y: number, z: number): [number, number, number] => {
        const X = (x - cx0) * ca + y * sa
        const Y = -(x - cx0) * sa + y * ca
        const Z = z
        const depth = Y * ce + Z * se
        const sxp = cssW / 2 + X * scale
        const syp = cssH / 2 + (Y * se - Z * ce) * scale
        return [sxp, syp, depth]
      }

      ctx.fillStyle = PAPER
      ctx.fillRect(0, 0, cssW, cssH)

      const line = (pts: Array<[number, number, number]>, style: string, width: number, alpha = 1) => {
        ctx.strokeStyle = style
        ctx.lineWidth = width
        ctx.globalAlpha = alpha
        ctx.beginPath()
        pts.forEach(([X, Y], i) => (i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y)))
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // wing: sections at a few span stations + LE/TE edges
      const half = ar / 2
      const stations = [-1, -0.66, -0.33, 0, 0.33, 0.66, 1].map((f) => f * half)
      for (const yst of stations) {
        line(sections.map((p) => proj(p.x, yst, p.z)), INK, yst === -half || yst === half ? 1.6 : 0.8)
      }
      line([proj(0, -half, 0), proj(0, half, 0)], INK, 1.2)
      line([proj(1, -half, -0.105), proj(1, half, -0.105)], INK, 1.2)

      // loading curtain: Gamma(y) above the quarter chord
      const curtain: Array<[number, number, number]> = ys.map((yv, i) => proj(0.25, yv, 0.3 + (gammas[i] / gamma2d) * 0.9))
      line([proj(0.25, ys[0], 0.3), ...curtain, proj(0.25, ys[ys.length - 1], 0.3)], ACCENT, 1.6)
      ctx.globalAlpha = 0.08
      ctx.fillStyle = ACCENT
      ctx.beginPath()
      curtain.forEach(([X, Y], i) => (i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y)))
      for (let i = ys.length - 1; i >= 0; i--) {
        const [X, Y] = proj(0.25, ys[i], 0.3)
        ctx.lineTo(X, Y)
      }
      ctx.fill()
      ctx.globalAlpha = 1

      if (mode === 'walls') {
        // symmetry panes
        for (const yw of [-half, half]) {
          const pane = [proj(-0.6, yw, -0.8), proj(2.2, yw, -0.8), proj(2.2, yw, 1.0), proj(-0.6, yw, 1.0)]
          ctx.globalAlpha = 0.06
          ctx.fillStyle = INK
          ctx.beginPath()
          pane.forEach(([X, Y], i) => (i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y)))
          ctx.closePath()
          ctx.fill()
          ctx.globalAlpha = 0.35
          line([...pane, pane[0]], INK, 0.8, 0.35)
        }
      } else if (usePca) {
        // no drawn filaments: the field itself is the URANS reduced-order model
      } else {
        // trailed filaments, opacity by strength
        const tMax = Math.max(...wake.ts.map(Math.abs), 1e-9)
        for (let k = 0; k < wake.ys.length; k++) {
          const pts: Array<[number, number, number]> = []
          for (let s = 0; s <= WAKE_STEPS; s += 2) {
            pts.push(proj(1 + s * rolled.dx, rolled.paths[k][2 * s], rolled.paths[k][2 * s + 1]))
          }
          line(pts, INK, 0.9, 0.12 + 0.75 * (Math.abs(wake.ts[k]) / tMax))
        }
      }

      // particles
      for (let i = 0; i < NP; i++) {
        const [X, Y] = proj(px[i], py[i], pz[i])
        ctx.fillStyle = oz[i] > 0 ? RED_DOT : BLUE_DOT
        ctx.fillRect(X - 1, Y - 1, 2.2, 2.2)
      }

      // freestream arrow
      line([proj(-0.9 - 0.12 * ar, 0, 0.6), proj(-0.4 - 0.12 * ar, 0, 0.6)], 'rgba(26,23,20,0.5)', 1.5)
    }

    raf = requestAnimationFrame((ms) => {
      lastMs = ms
      raf = requestAnimationFrame(frame)
    })

    const down = (e: PointerEvent) => {
      view.current.dragging = true
      view.current.px = e.clientX
      view.current.py = e.clientY
      canvas.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!view.current.dragging) return
      view.current.az -= (e.clientX - view.current.px) * 0.008
      view.current.el = Math.max(-1.4, Math.min(1.4, view.current.el - (e.clientY - view.current.py) * 0.008))
      view.current.px = e.clientX
      view.current.py = e.clientY
    }
    const up = () => {
      view.current.dragging = false
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
    }
  }, [mode, ar, wake, rolled, sections, ys, gammas, gamma2d, source, pca])

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="w-full cursor-grab touch-none rounded-[2px] border border-[var(--rule)] active:cursor-grabbing"
        style={{ aspectRatio: '2' }}
        role="img"
        aria-label="Rotatable 3D view of the wing, its spanwise loading and the rolled-up wake"
      />
      <p className="data-strip mt-2">
        drag to rotate · <span style={{ color: 'var(--accent-deep)' }}>Γ(y) curtain</span> at c/4 ·{' '}
        {source === 'urans'
          ? 'particles ride the URANS wake compressed to 3 PCA modes (99.8% of variance), coefficients interpolated downstream'
          : 'wake filaments marched with mutual induction — the roll-up is computed, not drawn'}
      </p>
    </div>
  )
}
