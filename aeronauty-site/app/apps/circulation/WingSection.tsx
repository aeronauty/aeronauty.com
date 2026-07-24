'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FoilCore } from '@/lib/foil/wasm'
import { noWheel, BLUE, RED_DEEP } from './CirculationLab'

/**
 * The third dimension: a Weissinger-L vortex lattice (in the same WASM core)
 * solves the spanwise circulation of a rectangular wing, and the Trefftz
 * crossflow plane shows what the wake does with it. Between symmetry planes
 * at both ends, Gamma(y) is constant, nothing is trailed, and the crossflow
 * plane is dead still — 2D physics, reproduced in 3D. Free the tip and the
 * spanwise gradient sheds a vortex sheet that rolls up at the tips: permanent
 * downwash between them, upwash outside.
 */

const ALPHA = (6 * Math.PI) / 180
const N_PANELS = 48
const GAMMA_2D = Math.PI * ALPHA // flat-plate 2D circulation, U = c = 1

const INK = '#1a1714'
const PAPER = '#f4efe4'
const RED_DOT = 'rgba(215, 38, 61, 0.78)'
const BLUE_DOT = 'rgba(31, 95, 139, 0.78)'

type Mode = 'walls' | 'tip'

interface Wake {
  /** trailing vortex positions (y) and strengths, crossflow-plane 2D field */
  ys: number[]
  ts: number[]
}

function crossflowVelocity(wake: Wake, y: number, z: number, out: { y: number; z: number }) {
  let vy = 0
  let vz = 0
  for (let k = 0; k < wake.ys.length; k++) {
    const dy = y - wake.ys[k]
    const r2 = dy * dy + z * z + 1e-4 // small core radius keeps the spiral finite
    const t = wake.ts[k] / (2 * Math.PI * r2)
    vy += -t * z
    vz += t * dy
  }
  out.y = vy
  out.z = vz
}

export function WingSection({ core }: { core: FoilCore | null }) {
  const [mode, setMode] = useState<Mode>('tip')
  const [ar, setAr] = useState(8)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const statsRef = useRef<HTMLSpanElement>(null)
  const [resetTick, setResetTick] = useState(0)

  const { ys, gammas, wake } = useMemo(() => {
    if (mode === 'walls' || !core) {
      // symmetry both ends: the 2D answer at every station, nothing trailed
      const ys = Array.from({ length: N_PANELS }, (_, i) => (-0.5 + (i + 0.5) / N_PANELS) * ar)
      return { ys, gammas: ys.map(() => GAMMA_2D), wake: { ys: [], ts: [] } as Wake }
    }
    const flat = core.vlm_rectangular(ar, ALPHA, N_PANELS)
    const ys = Array.from(flat.slice(0, N_PANELS))
    const gammas = Array.from(flat.slice(N_PANELS))
    // trailing vorticity at station edges = spanwise drop in Gamma; sign fixed
    // by requiring downwash at the wing centre (lift is up)
    const eys: number[] = []
    const ets: number[] = []
    for (let k = 0; k <= N_PANELS; k++) {
      const gl = k === 0 ? 0 : gammas[k - 1]
      const gr = k === N_PANELS ? 0 : gammas[k]
      const edge = k === 0 ? -ar / 2 : k === N_PANELS ? ar / 2 : (ys[k - 1] + ys[k]) / 2
      const t = gr - gl
      if (Math.abs(t) > 1e-9) {
        eys.push(edge)
        ets.push(t)
      }
    }
    const wake: Wake = { ys: eys, ts: ets }
    const probe = { y: 0, z: 0 }
    crossflowVelocity(wake, 0, 0.001, probe)
    if (probe.z > 0) wake.ts = wake.ts.map((t) => -t)
    return { ys, gammas, wake }
  }, [core, mode, ar])

  // ---- Trefftz-plane particle animation ----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const halfW = 0.75 * ar
    const halfH = 0.375 * ar
    const aspect = halfW / halfH

    const px: number[] = []
    const pz: number[] = []
    const oy: number[] = []
    const oz: number[] = []
    const step = ar / 46
    for (let y = -halfW + step / 2; y <= halfW; y += step) {
      for (let z = -halfH + step / 2; z <= halfH; z += step * 0.9) {
        px.push(y)
        pz.push(z)
        oy.push(y)
        oz.push(z)
      }
    }

    let raf = 0
    let lastMs = 0
    let needsClear = true
    const v = { y: 0, z: 0 }

    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame)
      const cssW = canvas.clientWidth
      const cssH = cssW / aspect
      const dpr = window.devicePixelRatio || 1
      const bw = Math.round(cssW * dpr)
      if (canvas.width !== bw) {
        canvas.width = bw
        canvas.height = Math.round(cssH * dpr)
        needsClear = true
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const dt = Math.min((ms - lastMs) / 1000, 0.3) * 1.2
      lastMs = ms

      // advect (midpoint), frozen wake field
      for (let i = 0; i < px.length; i++) {
        crossflowVelocity(wake, px[i], pz[i], v)
        const my = px[i] + 0.5 * dt * v.y
        const mz = pz[i] + 0.5 * dt * v.z
        crossflowVelocity(wake, my, mz, v)
        px[i] += dt * v.y
        pz[i] += dt * v.z
      }

      const sx = (y: number) => ((y + halfW) / (2 * halfW)) * cssW
      const sy = (z: number) => ((halfH - z) / (2 * halfH)) * cssH
      if (needsClear) {
        ctx.fillStyle = PAPER
        ctx.fillRect(0, 0, cssW, cssH)
        needsClear = false
      } else {
        ctx.fillStyle = 'rgba(244, 239, 228, 0.14)'
        ctx.fillRect(0, 0, cssW, cssH)
      }

      // the wing trace
      ctx.strokeStyle = INK
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(sx(-ar / 2), sy(0))
      ctx.lineTo(sx(ar / 2), sy(0))
      ctx.stroke()
      if (mode === 'walls') {
        ctx.strokeStyle = 'rgba(107, 99, 90, 0.6)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([5, 4])
        for (const yw of [-ar / 2, ar / 2]) {
          ctx.beginPath()
          ctx.moveTo(sx(yw), 0)
          ctx.lineTo(sx(yw), cssH)
          ctx.stroke()
        }
        ctx.setLineDash([])
      }

      for (let i = 0; i < px.length; i++) {
        const x = sx(px[i])
        const y = sy(pz[i])
        if (x < -3 || x > cssW + 3 || y < -3 || y > cssH + 3) continue
        ctx.fillStyle = oz[i] > 0 ? RED_DOT : BLUE_DOT
        ctx.fillRect(x - 1.1, y - 1.1, 2.2, 2.2)
      }

      if (statsRef.current && (ms | 0) % 3 === 0) {
        let dzIn = 0
        let nIn = 0
        let dzOut = 0
        let nOut = 0
        for (let i = 0; i < px.length; i++) {
          const dz = pz[i] - oz[i]
          if (Math.abs(oy[i]) < ar / 2) {
            dzIn += dz
            nIn++
          } else {
            dzOut += dz
            nOut++
          }
        }
        const f = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(3)
        statsRef.current.textContent = `⟨Δz⟩ inside span ${f(dzIn / Math.max(1, nIn))} · outside ${f(
          dzOut / Math.max(1, nOut),
        )} (chords)`
      }
    }
    raf = requestAnimationFrame((ms) => {
      lastMs = ms
      raf = requestAnimationFrame(frame)
    })
    return () => cancelAnimationFrame(raf)
  }, [wake, ar, mode, resetTick])

  // ---- Gamma(y) plot ----
  const plot = useMemo(() => {
    const W = 420
    const H = 150
    const pxx = (y: number) => 30 + ((y / ar + 0.5) * (W - 40))
    const pyy = (g: number) => 10 + (1.15 - g / GAMMA_2D) * (H - 30) / 1.15
    let d = ''
    for (let i = 0; i < ys.length; i++) {
      d += `${i === 0 ? 'M' : 'L'}${pxx(ys[i]).toFixed(1)},${pyy(gammas[i]).toFixed(1)}`
    }
    return { W, H, d, ref: pyy(GAMMA_2D), zero: pyy(0) }
  }, [ys, gammas, ar])

  return (
    <section className="card mt-10 p-6 sm:p-8">
      <p className="eyebrow">03 · The third dimension</p>
      <h2 className="mt-3 text-3xl font-semibold">Give the wing an end</h2>
      <p className="mt-3 max-w-3xl leading-7 text-stone-600">
        A vortex-lattice solve (same WASM core) for a rectangular wing, and the crossflow plane far
        behind it. With <em>symmetry planes at both ends</em> the circulation is the 2D value at
        every station, nothing trails, and the plane is dead still — everything the exhibits above
        showed survives contact with 3D. Free the tip and the spanwise Γ gradient must trail into
        the wake: the sheet rolls up at the tips, and between them the downwash is{' '}
        <em>permanent</em> — balanced by upwash outside. That is where the momentum bookkeeping
        moves when the wing gets an end.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div>
          <canvas
            ref={canvasRef}
            className="w-full rounded-[2px] border border-[var(--rule)]"
            style={{ aspectRatio: '2' }}
            role="img"
            aria-label="Trefftz-plane crossflow animation behind the wing"
          />
          <p className="data-strip mt-2">
            crossflow (Trefftz) plane · wing trace and{' '}
            {mode === 'walls' ? 'symmetry walls dashed' : 'free tips'} ·{' '}
            <span style={{ color: RED_DEEP }}>red</span> starts above,{' '}
            <span style={{ color: BLUE }}>blue</span> below
          </p>
        </div>
        <div>
          <svg viewBox={`0 0 ${plot.W} ${plot.H}`} className="w-full rounded-[2px] border border-[var(--rule)] bg-[var(--paper-raised)]">
            <line x1="30" x2={plot.W - 10} y1={plot.ref} y2={plot.ref} stroke="var(--rule)" strokeDasharray="4 3" />
            <line x1="30" x2={plot.W - 10} y1={plot.zero} y2={plot.zero} stroke="var(--rule)" />
            <path d={plot.d} fill="none" stroke="var(--accent)" strokeWidth="2" />
            <text x={plot.W - 12} y={plot.ref - 4} textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono), monospace">
              2D Γ
            </text>
          </svg>
          <p className="data-strip mt-2">spanwise circulation Γ(y) vs the 2D value</p>
          <div className="mt-5 space-y-4">
            <div className="flex gap-4">
              <button className={mode === 'walls' ? 'button-primary' : 'button-secondary'} onClick={() => setMode('walls')}>
                Symmetry both ends
              </button>
              <button className={mode === 'tip' ? 'button-primary' : 'button-secondary'} onClick={() => setMode('tip')}>
                Free tip
              </button>
            </div>
            <label className="block max-w-xs">
              <span className="data-strip flex justify-between">
                <span>Aspect ratio</span>
                <span className="text-[var(--ink)]">{ar.toFixed(0)}</span>
              </span>
              <input
                ref={noWheel}
                type="range"
                min={4}
                max={16}
                step={1}
                value={ar}
                onChange={(e) => setAr(Number(e.target.value))}
                className="mt-1 w-full"
                style={{ accentColor: 'var(--accent)' }}
              />
            </label>
            <button className="button-secondary" onClick={() => setResetTick((n) => n + 1)}>
              Reset particles
            </button>
            <p className="data-strip">
              <span ref={statsRef}>—</span>
            </p>
          </div>
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-sm leading-6 text-stone-500">
        The same wing runs in Flow360 as URANS (scripts/flow360-urans/wing_3d.py): once as this
        quasi-2D case with symmetry at both ends, once as the classical half-wing with a free tip —
        full volume export plus crossflow wake slices, so the tip-vortex roll-up above can be
        checked against a few billion cells&apos; worth of the real thing.
      </p>
    </section>
  )
}
