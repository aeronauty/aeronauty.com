'use client'

import { useMemo, useState } from 'react'
import { FoilSolution } from '@/lib/foil/solver'
import { velocityAt } from '@/lib/foil/field'
import { noWheel, BLUE, RED_DEEP } from './CirculationLab'

/**
 * Draw-your-own control volume: the vertical-force budget
 *   L = -∮ [ rho v (u·n) + (p - p_inf) n_y ] dS
 * evaluated live on a user-sized box around the current foil solution.
 * The total is always L; the split between momentum flux (through the side
 * walls) and boundary pressure (on the top/bottom faces) is pure geometry —
 * the Karman–Burgers conditional-convergence result as a toy.
 */

const CX = 0.25 // box centred on the quarter chord
const M_INT = 320 // integration points per side
const M_GLYPH = 36 // glyph samples per side

interface SideSplit {
  flux: number
  press: number
}

interface Budget {
  flux: number
  press: number
  sides: { left: SideSplit; right: SideSplit; top: SideSplit; bottom: SideSplit }
}

function sideIntegral(
  sol: FoilSolution,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  nx: number,
  ny: number,
): SideSplit {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const w = len / M_INT
  let flux = 0
  let press = 0
  for (let k = 0; k < M_INT; k++) {
    const t = (k + 0.5) / M_INT
    const u = velocityAt(sol, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)
    const un = u.x * nx + u.y * ny
    const dp = 0.5 * (1 - (u.x * u.x + u.y * u.y))
    flux += -u.y * un * w
    press += -dp * ny * w
  }
  return { flux, press }
}

function budget(sol: FoilSolution, hx: number, hy: number): Budget {
  const right = sideIntegral(sol, CX + hx, -hy, CX + hx, hy, 1, 0)
  const left = sideIntegral(sol, CX - hx, hy, CX - hx, -hy, -1, 0)
  const bottom = sideIntegral(sol, CX - hx, -hy, CX + hx, -hy, 0, -1)
  const top = sideIntegral(sol, CX + hx, hy, CX - hx, hy, 0, 1)
  return {
    flux: right.flux + left.flux + top.flux + bottom.flux,
    press: right.press + left.press + top.press + bottom.press,
    sides: { left, right, top, bottom },
  }
}

export function ControlVolumeSection({ sol }: { sol: FoilSolution }) {
  const [logHx, setLogHx] = useState(1)
  const [logHy, setLogHy] = useState(1)
  const hx = 10 ** logHx
  const hy = 10 ** logHy
  const L = -sol.circulation

  const b = useMemo(() => budget(sol, hx, hy), [sol, hx, hy])

  // glyphs: where the lift crosses the boundary
  const view = useMemo(() => {
    const half = Math.max(hx, hy) * 1.3
    const W = 860
    const H = 430
    const s = W / (2 * half)
    const px = (x: number) => W / 2 + (x - CX) * s
    const pyi = (y: number) => H / 2 - y * s

    const glyphs: Array<{ x1: number; y1: number; y2: number; kind: 'flux' | 'press' }> = []
    const G = 2.2 * half // glyph scale, world units per unit integrand
    const add = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      nx: number,
      ny: number,
    ) => {
      for (let k = 0; k < M_GLYPH; k++) {
        const t = (k + 0.5) / M_GLYPH
        const gx = x0 + (x1 - x0) * t
        const gy = y0 + (y1 - y0) * t
        const u = velocityAt(sol, gx, gy)
        const un = u.x * nx + u.y * ny
        const dp = 0.5 * (1 - (u.x * u.x + u.y * u.y))
        const fluxDens = -u.y * un
        const pressDens = -dp * ny
        const dens = ny === 0 ? fluxDens : pressDens
        const len = Math.max(-half / 3, Math.min(half / 3, dens * G))
        glyphs.push({ x1: px(gx), y1: pyi(gy), y2: pyi(gy + len), kind: ny === 0 ? 'flux' : 'press' })
      }
    }
    add(CX + hx, -hy, CX + hx, hy, 1, 0)
    add(CX - hx, hy, CX - hx, -hy, -1, 0)
    add(CX - hx, -hy, CX + hx, -hy, 0, -1)
    add(CX + hx, hy, CX - hx, hy, 0, 1)

    // foil trace (or a marker when it would be sub-pixel)
    const chordPx = 1 * s
    const foil =
      chordPx > 14
        ? sol.geo.nodes.map((n) => `${px(n.x).toFixed(1)},${pyi(n.y).toFixed(1)}`).join(' ')
        : null

    return {
      W,
      H,
      box: { x: px(CX - hx), y: pyi(hy), w: 2 * hx * s, h: 2 * hy * s },
      glyphs,
      foil,
      foilDot: { x: px(0.5), y: pyi(0) },
    }
  }, [sol, hx, hy])

  const pc = (v: number) => ((100 * v) / L).toFixed(1)

  return (
    <section className="card mt-10 p-6 sm:p-8">
      <p className="eyebrow">03 · Draw the box yourself</p>
      <h2 className="mt-3 text-3xl font-semibold">Where does the lift cross your boundary?</h2>
      <p className="mt-3 max-w-3xl leading-7 text-stone-600">
        Take any closed box around the section and add up two things on its boundary: the vertical
        momentum carried through it by the flow, and the vertical force from the pressure acting on
        it. The sum is always the lift — to the last decimal, whatever box you draw. But the{' '}
        <em>split</em> is pure geometry: a tall skinny box hands everything to momentum flux
        through its side walls, a wide flat one takes it all as pressure on its top and bottom.
        &ldquo;The net vertical momentum in the flow&rdquo; is a property of the box, not the
        aeroplane.
      </p>

      <div className="mt-6">
        <svg
          viewBox={`0 0 ${view.W} ${view.H}`}
          className="w-full rounded-[2px] border border-[var(--rule)] bg-[var(--paper-raised)]"
          role="img"
          aria-label="Control volume around the foil with flux and pressure glyphs"
        >
          <rect
            x={view.box.x}
            y={view.box.y}
            width={view.box.w}
            height={view.box.h}
            fill="none"
            stroke="var(--ink)"
            strokeWidth="1.6"
          />
          {view.glyphs.map((g, i) => (
            <line
              key={i}
              x1={g.x1}
              y1={g.y1}
              x2={g.x1}
              y2={g.y2}
              stroke={g.kind === 'flux' ? BLUE : 'var(--accent-deep)'}
              strokeWidth="1.6"
              opacity="0.75"
            />
          ))}
          {view.foil ? (
            <polygon points={view.foil} fill="var(--ink)" />
          ) : (
            <g>
              <circle cx={view.foilDot.x} cy={view.foilDot.y} r="3.5" fill="var(--ink)" />
            </g>
          )}
        </svg>
        <p className="data-strip mt-2">
          <span style={{ color: BLUE }}>flux density on the side walls</span> ·{' '}
          <span style={{ color: RED_DEEP }}>pressure density on top/bottom</span> · glyph length =
          local contribution to L
        </p>
      </div>

      <div className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:max-w-2xl">
        <label className="block">
          <span className="data-strip flex justify-between">
            <span>Box half-width</span>
            <span className="text-[var(--ink)]">{hx.toFixed(1)} c</span>
          </span>
          <input
            ref={noWheel}
            type="range"
            min={0.3}
            max={1.7}
            step={0.02}
            value={logHx}
            onChange={(e) => setLogHx(Number(e.target.value))}
            className="mt-1 w-full"
            style={{ accentColor: 'var(--accent)' }}
          />
        </label>
        <label className="block">
          <span className="data-strip flex justify-between">
            <span>Box half-height</span>
            <span className="text-[var(--ink)]">{hy.toFixed(1)} c</span>
          </span>
          <input
            ref={noWheel}
            type="range"
            min={0.3}
            max={1.7}
            step={0.02}
            value={logHy}
            onChange={(e) => setLogHy(Number(e.target.value))}
            className="mt-1 w-full"
            style={{ accentColor: 'var(--accent)' }}
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-x-10 gap-y-4 border-t border-[var(--rule)] pt-5">
        <div>
          <div className="data-strip">momentum flux</div>
          <div className="font-mono text-xl font-bold tabular-nums" style={{ color: BLUE }}>
            {pc(b.flux)}%
          </div>
        </div>
        <div>
          <div className="data-strip">boundary pressure</div>
          <div className="font-mono text-xl font-bold tabular-nums" style={{ color: 'var(--accent-deep)' }}>
            {pc(b.press)}%
          </div>
        </div>
        <div>
          <div className="data-strip">total / L</div>
          <div className="font-mono text-xl font-bold tabular-nums text-[var(--ink)]">
            {((b.flux + b.press) / L).toFixed(4)}
          </div>
        </div>
        <div className="data-strip ml-auto">
          sides: L {pc(b.sides.left.flux)}% · R {pc(b.sides.right.flux)}% flux — top{' '}
          {pc(b.sides.top.press)}% · bottom {pc(b.sides.bottom.press)}% pressure
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-sm leading-6 text-stone-500">
        Try it: slide the box tall and skinny — the side walls&apos; blue flux glyphs grow and the
        pressure share collapses. Slide it wide and flat — the red pressure glyphs take over
        (squash it onto a ground plane and that bottom face is the overpressure footprint carrying
        the aircraft&apos;s weight). The total never moves. In 3D the same game gives a large
        sphere a fixed 2/3-flux, 1/3-pressure split — run scripts/vertical-momentum-study.ts for
        the full table.
      </p>
    </section>
  )
}
