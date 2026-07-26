'use client'

import { useEffect, useRef, useState } from 'react'
import { makeSection, insideFoil } from '@/lib/foil/geometry'
import { solveFoil, FoilSolution } from '@/lib/foil/solver'
import { velocityAt } from '@/lib/foil/field'

/**
 * Scrollytelling: Newton's second law rebuilt for fluids. A sticky canvas
 * morphs through nine scenes as the prose scrolls. Every scene is a live,
 * time-driven simulation — a colliding particle gas with a pinned total, a
 * momentum current through static furniture, the RTT parcel loop, and (for
 * scenes 6-8) real particles advected through the validated panel solution
 * (2% camber, 12% thick, alpha 5 deg — the same case as the momentum study).
 */

const INK = '#1a1714'
const PAPER = '#fbf8f1'
const RULE = '#d8d0c2'
const MUTED = '#6b635a'
const DEEP = '#a81c2e'
const BLUE = '#1f5f8b'

// ---------------------------------------------------------------------------
// prose
// ---------------------------------------------------------------------------

const STEPS: Array<{ kicker: string; title: string; body: string[] }> = [
  {
    kicker: '1 · The ledger',
    title: 'Momentum is not stuff. It is a ledger.',
    body: [
      'The school picture — momentum as “oomph” stored inside moving objects — works for billiard balls and quietly fails for everything else. Drop it. Momentum is a bookkeeping quantity: a number defined so that, in any interaction whatsoever, the total never changes. Watch the crowd: every collision violently reshuffles the individual accounts, and the total bar never moves. Not slowly — never.',
      'It exists because physics does not care where you are. Slide the whole experiment a metre to the left and nothing changes — and Noether’s theorem says that indifference forces a conserved quantity to exist, one component per direction you could have slid. That quantity is momentum. It was never a substance; it is the shadow cast by a symmetry.',
    ],
  },
  {
    kicker: '2 · Force is a flow rate',
    title: 'F = dp/dt, read literally',
    body: [
      'Newton’s second law, read as bookkeeping: a force is not a cause of motion — it is a transfer channel. F newtons means F kilogram-metres-per-second of momentum flowing from one account to another, per second.',
      'The cleanest proof that momentum flows without anything moving: a book resting on a table. Gravity deposits mg of downward momentum into the book every second. The book hands it to the table, the table to the floor, the floor to the planet. The counter keeps ticking; nothing in the picture moves. Momentum currents run through perfectly static matter — carried by stress. Hold that thought; it becomes the pressure term.',
    ],
  },
  {
    kicker: '3 · Two carriers',
    title: 'In a continuum, momentum moves two ways',
    body: [
      'Attach the ledger to regions of space instead of objects and every conserved quantity obeys the same template: a density, a flux, and the rule that content changes only by transport through the boundary. For momentum the flux has two parts — and only two. Watch both lanes cross the tollgate: the counters tick at the same rate.',
      'Convection: matter that moves carries its momentum with it, like trucks carrying freight. Conduction: matter that needn’t move at all passes momentum by contact — a nudge running down a chain of people who each end up exactly where they started. That is pressure. Pressure is not a separate force that also acts on fluids; pressure IS momentum flux, the conducted half. This single reclassification dissolves most of the confusion in every argument about lift.',
    ],
  },
  {
    kicker: '4 · The region problem',
    title: 'Newton talks about matter. We want a law about a box.',
    body: [
      'Here is the honest difficulty: F = ma governs a fixed collection of matter, but the useful question in fluid mechanics is about a fixed region of space — a box — through which matter streams. The fluid in your box now will not be the fluid in your box in a moment.',
      'Watch the loop: the tagged parcel starts by exactly filling the box. Newton’s law applies to the blue matter, forever. But the blue matter leaves, taking its momentum with it, and the three counters tell the story: the matter’s total never changes, the part still inside drains, the part carried across the boundary grows — and the two always sum to the first. Accounting for that split is the entire content of the Reynolds transport theorem: d/dt(region) = d/dt(matter) − (momentum carried out across the boundary).',
    ],
  },
  {
    kicker: '5 · The turnstile',
    title: 'How momentum is “carried out”',
    body: [
      'No gradients required, nothing needs to change: momentum is carried out whenever matter crosses the surface, full stop. Watch one tick of the clock. The velocity at the wall splits into two parts — the component along the wall slides forever and never crosses; only the through-the-wall component u·n̂ moves matter over. In time dt it sweeps out the slanted prism, volume (u·n̂) dt dS, and everything inside is about to be exported.',
      'That prism delivers mass ρ(u·n̂) dS per second — the conveyor. Each kilogram carries its momentum in its pockets — the cargo, vertical component v. Multiply: ρ v (u·n̂) dS per second. Velocity appears twice for two different reasons — once as the truck, once as the freight — which is why the term is quadratic and why it confuses everyone the first time.',
    ],
  },
  {
    kicker: '6 · Assemble it',
    title: 'Newton’s second law for a box around a wing',
    body: [
      'Now assemble. The particles you see are being pushed through the actual panel-method velocity field — watch them rise ahead of the wing, accelerate over the top, and wash down behind. Forces on the fluid in the box: pressure from the fluid outside, pushing inward on every patch (−p n̂ dS — a genuine Newtonian force), and the wing inside, pushing the fluid down with −L. Steady flow means the region’s content never changes. So Newton reads: zero = forces in − momentum carried out.',
      'Rearranged: L = −∮ [ ρ v (u·n̂) + (p − p∞) n_y ] dS. One integrand, evaluated identically on every face. Side walls: n_y = 0 kills the pressure term; they report the convected current. Top and bottom: almost nothing crosses them; they report the conducted current. The glyphs are this integrand, computed live from the solution — and the faces sum to L to four decimal places.',
    ],
  },
  {
    kicker: '7 · Equilibrium',
    title: 'The same integrand, on the skin',
    body: [
      'Here is the closure that makes it airtight. Apply the same integrand to the innermost surface available — the wing’s own skin. No fluid crosses the skin, so the convective term dies identically, leaving ∮(p − p∞) n_y dS over the surface: the textbook definition of lift itself. The whiskers are that pressure distribution — red suction pulling on the upper surface, blue overpressure pushing on the lower — integrating to L.',
      'So three readings of one object agree: the pressure integral on the skin, the flux-plus-pressure budget on any box, and ρU∞Γ from the circulation. The fluid pushes the wing up with L; the wing pushes the fluid down with L; every nested surface between them carries the same L-per-second current. That is what equilibrium means in a steady flow: not stillness, but a conserved current threading every accountant’s boundary with the same total.',
    ],
  },
  {
    kicker: '8 · The shape game',
    title: 'The split is your choice. The total is physics.',
    body: [
      'One last twist — the one that fuels every internet argument about lift. The box is breathing: tall and skinny, then wide and flat, while the budget is re-integrated live on its boundary every frame. Tall: the lift departs almost entirely as momentum flux through the side walls — the wake-rake reading. Flat: it arrives almost entirely as pressure on the top and bottom faces — squash it onto the ground and the bottom face is the overpressure footprint carrying the aircraft’s weight.',
      'The split follows a pure geometry rule — each face collects lift in proportion to the angle it subtends at the wing, (2/π)·atan of the aspect ratio — because the budget integrand on a distant boundary is literally the angle element dθ. Around any enclosing loop, ∮dθ = 2π: topology, not aerodynamics. Watch the measured split track the formula as the box morphs. Asking “how much momentum is in the flow” is asking “how much of the horizon do my walls cover.” The only shape-independent statement is the total. The total is the lift.',
    ],
  },
  {
    kicker: '9 · The three ledgers',
    title: 'What to keep',
    body: [
      'Momentum content of the air: zero for the 2D section — every parcel rises before the wing, sinks behind it, and banks nothing. Momentum current through any closed surface: L per second, always, split by subtended angle between its two carriers. Impulse of the vortex system: the quantity your Newtonian gut was reaching for — it genuinely grows at rate L, in the wake of a finite wing.',
      'Most disagreements about lift are two people reading different rows of this table while saying the word “momentum”. The wing deposits L per second into the air; the current leaves through whatever surface you draw; pressure is half its plumbing; and on a real planet the conducted channel delivers every last newton-second to the ground, where the ledger closes. Newton holds. He just needed better accountants.',
    ],
  },
]

// ---------------------------------------------------------------------------
// solver-backed data (scenes 6-8)
// ---------------------------------------------------------------------------

interface Glyph {
  x: number
  y: number
  vlen: number
  kind: 'flux' | 'press'
}

interface SolData {
  sol: FoilSolution
  L: number
  glyphs: Glyph[]
  budget: { flux: number; press: number }
  skin: Array<{ x: number; y: number; nx: number; ny: number; cp: number }>
}

const BOX_HX = 2.2
const BOX_HY = 1.5
const BOX_CX = 0.25

function boxBudget(sol: FoilSolution, hx: number, hy: number, M: number, glyphEvery = 0, glyphs?: Glyph[]) {
  let flux = 0
  let press = 0
  const side = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0)
    const w = len / M
    for (let k = 0; k < M; k++) {
      const t = (k + 0.5) / M
      const gx = x0 + (x1 - x0) * t
      const gy = y0 + (y1 - y0) * t
      const u = velocityAt(sol, gx, gy)
      const un = u.x * nx + u.y * ny
      const dp = 0.5 * (1 - (u.x * u.x + u.y * u.y))
      flux += -u.y * un * w
      press += -dp * ny * w
      if (glyphs && glyphEvery > 0 && k % glyphEvery === Math.floor(glyphEvery / 2)) {
        const dens = ny === 0 ? -u.y * un : -dp * ny
        glyphs.push({ x: gx, y: gy, vlen: dens, kind: ny === 0 ? 'flux' : 'press' })
      }
    }
  }
  side(BOX_CX + hx, -hy, BOX_CX + hx, hy, 1, 0)
  side(BOX_CX - hx, hy, BOX_CX - hx, -hy, -1, 0)
  side(BOX_CX - hx, -hy, BOX_CX + hx, -hy, 0, -1)
  side(BOX_CX + hx, hy, BOX_CX - hx, hy, 0, 1)
  return { flux, press }
}

function buildSolData(): SolData {
  const geo = makeSection({ camber: 0.02, camberPos: 0.4, thickness: 0.12, alpha: (5 * Math.PI) / 180, nPanels: 100 })
  const sol = solveFoil(geo)
  const L = -sol.circulation
  const glyphs: Glyph[] = []
  const budget = boxBudget(sol, BOX_HX, BOX_HY, 240, 11, glyphs)
  const skin = sol.geo.panels
    .filter((_, i) => i % 2 === 0)
    .map((p, i) => ({ x: p.mx, y: p.my, nx: p.nx, ny: p.ny, cp: sol.cp[i * 2] }))
  return { sol, L, glyphs, budget, skin }
}

// ---------------------------------------------------------------------------
// per-scene mutable simulation state (module-level; client only)
// ---------------------------------------------------------------------------

interface GasPart {
  x: number
  y: number
  vx: number
  vy: number
}
interface Flash {
  x: number
  y: number
  age: number
}
interface FlowPart {
  x: number
  y: number
  hist: number[]
}

interface Sim {
  tl: number[] // per-scene local clock, advances only while active
  gas?: { parts: GasPart[]; flashes: Flash[] }
  lane?: { xs: number[]; cCount: number; kCount: number; prevPulse: number; cFlash: number; kFlash: number }
  flow6?: FlowPart[]
  flow7?: FlowPart[]
  live8?: { flux: number; press: number; at: number }
  lastIdx: number
  fadeT: number
}

const sim: Sim = { tl: STEPS.map(() => 0), lastIdx: -1, fadeT: 1 }

// ---------------------------------------------------------------------------
// drawing helpers
// ---------------------------------------------------------------------------

const mono = '12px ui-monospace, SFMono-Regular, monospace'
const monoBold = '700 13px ui-monospace, SFMono-Regular, monospace'

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, head = 6) {
  const a = Math.atan2(y1 - y0, x1 - x0)
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 - head * Math.cos(a - 0.45), y1 - head * Math.sin(a - 0.45))
  ctx.lineTo(x1 - head * Math.cos(a + 0.45), y1 - head * Math.sin(a + 0.45))
  ctx.closePath()
  ctx.fill()
}

function easeInOut(u: number) {
  const c = Math.max(0, Math.min(1, u))
  return c * c * (3 - 2 * c)
}

interface SceneCtx {
  ctx: CanvasRenderingContext2D
  W: number
  H: number
  prog: number
  t: number // scene-local seconds
  dt: number
  data: SolData | null
}
type Draw = (s: SceneCtx) => void

// ---------------------------------------------------------------------------
// 1 · particle gas: accounts churn, total pinned
// ---------------------------------------------------------------------------

const sceneLedger: Draw = ({ ctx, W, H, dt }) => {
  const gx0 = W * 0.06
  const gx1 = W * 0.58
  const gy0 = H * 0.1
  const gy1 = H * 0.9
  const R = 8
  if (!sim.gas) {
    const parts: GasPart[] = []
    for (let i = 0; i < 26; i++) {
      parts.push({
        x: gx0 + Math.random() * (gx1 - gx0),
        y: gy0 + Math.random() * (gy1 - gy0),
        vx: 34 + (Math.random() - 0.5) * 90,
        vy: (Math.random() - 0.5) * 90,
      })
    }
    sim.gas = { parts, flashes: [] }
  }
  const { parts, flashes } = sim.gas
  const gw = gx1 - gx0
  const gh = gy1 - gy0
  // advance with periodic wrap (no walls -> total p exactly conserved)
  for (const p of parts) {
    p.x += p.vx * dt
    p.y += p.vy * dt
    if (p.x < gx0) p.x += gw
    if (p.x > gx1) p.x -= gw
    if (p.y < gy0) p.y += gh
    if (p.y > gy1) p.y -= gh
  }
  // pairwise elastic collisions, equal masses
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i]
      const b = parts[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d2 = dx * dx + dy * dy
      if (d2 > 4 * R * R || d2 < 1e-9) continue
      const d = Math.sqrt(d2)
      const nx = dx / d
      const ny = dy / d
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
      if (rel >= 0) continue // separating
      a.vx += rel * nx
      a.vy += rel * ny
      b.vx -= rel * nx
      b.vy -= rel * ny
      // separate overlap
      const push = (2 * R - d) / 2
      a.x -= nx * push
      a.y -= ny * push
      b.x += nx * push
      b.y += ny * push
      if (flashes.length < 24) flashes.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, age: 0 })
    }
  }
  // region
  ctx.strokeStyle = RULE
  ctx.setLineDash([5, 5])
  ctx.strokeRect(gx0, gy0, gw, gh)
  ctx.setLineDash([])
  // flashes
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]
    f.age += dt
    if (f.age > 0.45) {
      flashes.splice(i, 1)
      continue
    }
    ctx.strokeStyle = `rgba(215, 38, 61, ${0.8 * (1 - f.age / 0.45)})`
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(f.x, f.y, 5 + f.age * 70, 0, 7)
    ctx.stroke()
  }
  // particles with velocity tails
  for (const p of parts) {
    ctx.strokeStyle = 'rgba(26,23,20,0.35)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(p.x - p.vx * 0.08, p.y - p.vy * 0.08)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    ctx.fillStyle = INK
    ctx.beginPath()
    ctx.arc(p.x, p.y, 3.6, 0, 7)
    ctx.fill()
  }
  // ledger panel: individual accounts churn, totals pinned
  const lx = W * 0.65
  const lw = W * 0.3
  ctx.font = mono
  ctx.fillStyle = MUTED
  ctx.fillText('accounts (8 of 26)', lx, H * 0.12)
  const mid = lx + lw * 0.45
  for (let i = 0; i < 8; i++) {
    const y = H * 0.16 + i * H * 0.055
    const v = Math.max(-1, Math.min(1, parts[i].vx / 150))
    ctx.fillStyle = 'rgba(26,23,20,0.55)'
    ctx.fillRect(mid, y, v * lw * 0.5, 6)
    ctx.strokeStyle = RULE
    ctx.beginPath()
    ctx.moveTo(mid, y - 2)
    ctx.lineTo(mid, y + 8)
    ctx.stroke()
  }
  const Px = parts.reduce((s, p) => s + p.vx, 0)
  const Py = parts.reduce((s, p) => s + p.vy, 0)
  ctx.fillStyle = MUTED
  ctx.fillText('total (never moves)', lx, H * 0.68)
  ctx.fillStyle = DEEP
  ctx.fillRect(mid, H * 0.72, (Px / 900) * lw * 0.5, 9)
  ctx.fillStyle = BLUE
  ctx.fillRect(mid, H * 0.79, (Py / 900) * lw * 0.5, 9)
  ctx.strokeStyle = INK
  ctx.beginPath()
  ctx.moveTo(mid, H * 0.7)
  ctx.lineTo(mid, H * 0.86)
  ctx.stroke()
  ctx.font = mono
  ctx.fillStyle = DEEP
  ctx.fillText(`Σpx = ${Px.toFixed(0)}`, lx, H * 0.92)
  ctx.fillStyle = BLUE
  ctx.fillText(`Σpy = ${Py.toFixed(0)}`, lx + lw * 0.55, H * 0.92)
}

// ---------------------------------------------------------------------------
// 2 · book on table: current flows, nothing moves, counter ticks
// ---------------------------------------------------------------------------

const sceneBook: Draw = ({ ctx, W, H, t }) => {
  const gx = W * 0.42
  const groundY = H * 0.84
  const tableY = groundY - H * 0.3
  const bookY = tableY - H * 0.12
  const legL = gx - W * 0.13
  const legR = gx + W * 0.13
  ctx.fillStyle = INK
  ctx.fillRect(gx - W * 0.3, groundY, W * 0.6, 6)
  ctx.fillStyle = MUTED
  ctx.fillRect(gx - W * 0.17, tableY, W * 0.34, 8)
  ctx.fillRect(legL - 5, tableY + 8, 10, groundY - tableY - 8)
  ctx.fillRect(legR - 5, tableY + 8, 10, groundY - tableY - 8)
  ctx.fillStyle = DEEP
  ctx.fillRect(gx - W * 0.08, bookY, W * 0.16, tableY - bookY - 2)
  // gravity feed into the book
  ctx.strokeStyle = 'rgba(26,23,20,0.5)'
  ctx.lineWidth = 1.6
  ctx.fillStyle = 'rgba(26,23,20,0.5)'
  for (const dx of [-W * 0.04, 0, W * 0.04]) {
    const s = (t * 0.5) % 1
    arrow(ctx, gx + dx, bookY - 34 + s * 20, gx + dx, bookY - 14 + s * 20, 5)
  }
  ctx.font = mono
  ctx.fillStyle = MUTED
  ctx.fillText('gravity: deposits mg / s', gx + W * 0.12, bookY - 24)
  // downward chevron current, book -> table -> legs -> ground
  const chevrons = (x: number, y0: number, y1: number, phase: number) => {
    const n = Math.max(3, Math.floor((y1 - y0) / 16))
    for (let i = 0; i < n; i++) {
      const s = (i / n + t * 0.35 + phase) % 1
      const y = y0 + (y1 - y0) * s
      ctx.strokeStyle = `rgba(31, 95, 139, ${0.9 - 0.45 * s})`
      ctx.lineWidth = 2.2
      ctx.beginPath()
      ctx.moveTo(x - 7, y - 6)
      ctx.lineTo(x, y + 2)
      ctx.lineTo(x + 7, y - 6)
      ctx.stroke()
    }
  }
  chevrons(gx - W * 0.04, bookY + 6, tableY - 2, 0)
  chevrons(gx + W * 0.04, bookY + 6, tableY - 2, 0.5)
  // spread along the tabletop toward the legs
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const s = (i / 4 + t * 0.35) % 1
      const x = gx + dir * (W * 0.05 + s * (W * 0.13 - W * 0.055))
      ctx.strokeStyle = `rgba(31,95,139,${0.7 - 0.3 * s})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - dir * 6, tableY - 2)
      ctx.lineTo(x + dir * 2, tableY + 4)
      ctx.moveTo(x - dir * 6, tableY + 10)
      ctx.lineTo(x + dir * 2, tableY + 4)
      ctx.stroke()
    }
  }
  chevrons(legL, tableY + 14, groundY - 4, 0.25)
  chevrons(legR, tableY + 14, groundY - 4, 0.75)
  // the ledger line
  ctx.font = monoBold
  ctx.fillStyle = INK
  ctx.fillText(`momentum delivered to Earth:  ${(t * 1).toFixed(1)} mg·s`, W * 0.06, H * 0.09)
  ctx.font = mono
  ctx.fillStyle = MUTED
  ctx.fillText('flow rate: mg, steady · velocity: zero everywhere', W * 0.06, H * 0.09 + 18)
}

// ---------------------------------------------------------------------------
// 3 · two carriers through a tollgate, counters tick together
// ---------------------------------------------------------------------------

const sceneCarriers: Draw = ({ ctx, W, H, t, dt }) => {
  const x0 = W * 0.06
  const x1 = W * 0.94
  const gateX = W * 0.58
  const yTop = H * 0.32
  const yBot = H * 0.74
  if (!sim.lane) {
    const xs: number[] = []
    for (let i = 0; i < 12; i++) xs.push(x0 + (i / 12) * (x1 - x0))
    sim.lane = { xs, cCount: 0, kCount: 0, prevPulse: 0, cFlash: 0, kFlash: 0 }
  }
  const lane = sim.lane
  const speed = (x1 - x0) / 14 // px/s -> ~0.86 crossings/s at 12 particles
  // conveyor lane
  for (let i = 0; i < lane.xs.length; i++) {
    const was = lane.xs[i]
    let x = was + speed * dt
    if (was <= gateX && x > gateX) {
      lane.cCount++
      lane.cFlash = 0.35
    }
    if (x > x1) x -= x1 - x0
    lane.xs[i] = x
    ctx.fillStyle = BLUE
    ctx.beginPath()
    ctx.arc(x, yTop, 6, 0, 7)
    ctx.fill()
    ctx.strokeStyle = DEEP
    ctx.fillStyle = DEEP
    ctx.lineWidth = 1.8
    arrow(ctx, x, yTop - 9, x, yTop - 22, 4.5)
  }
  // pulse chain lane — one pulse per conveyor crossing, so the rates match
  const n = 22
  const period = 14 / 12 // conveyor spacing / conveyor speed
  const pf = ((t % period) / period) * 1.25 // pulse position, runs past the end
  const pulseX = x0 + pf * (x1 - x0)
  const gateFrac = (gateX - x0) / (x1 - x0)
  if (lane.prevPulse <= gateFrac && pf > gateFrac && pf < 1.2) {
    lane.kCount++
    lane.kFlash = 0.35
  }
  lane.prevPulse = pf
  for (let i = 0; i < n; i++) {
    const rest = x0 + (i / (n - 1)) * (x1 - x0)
    const d = Math.exp(-0.5 * ((rest - pulseX) / 26) ** 2)
    ctx.fillStyle = d > 0.45 ? DEEP : INK
    ctx.beginPath()
    ctx.arc(rest - d * 10, yBot, 7, 0, 7)
    ctx.fill()
  }
  // gate
  lane.cFlash = Math.max(0, lane.cFlash - dt)
  lane.kFlash = Math.max(0, lane.kFlash - dt)
  for (const [y, flash] of [
    [yTop, lane.cFlash],
    [yBot, lane.kFlash],
  ] as const) {
    ctx.strokeStyle = flash > 0 ? DEEP : RULE
    ctx.lineWidth = flash > 0 ? 3 : 2
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(gateX, y - 34)
    ctx.lineTo(gateX, y + 26)
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.font = mono
  ctx.fillStyle = MUTED
  ctx.fillText('convection: matter moves, momentum rides along', x0, yTop - 44)
  ctx.fillText('conduction (pressure): a nudge down a chain — nobody relocates', x0, yBot - 44)
  ctx.font = monoBold
  ctx.fillStyle = BLUE
  ctx.fillText(`through gate: ${lane.cCount} ↑units`, gateX + 12, yTop + 40)
  ctx.fillText(`through gate: ${lane.kCount} ↑units`, gateX + 12, yBot + 40)
}

// ---------------------------------------------------------------------------
// 4 · RTT — looping tagged-parcel exodus with a three-line ledger
// ---------------------------------------------------------------------------

const sceneRTT: Draw = ({ ctx, W, H, t }) => {
  const P = 7
  const phase = (t % P) / P
  const drift0 = easeInOut(Math.min(1, phase / 0.85)) * 1.35
  const bx = W * 0.3
  const by = H * 0.24
  const bw = W * 0.32
  const bh = H * 0.46
  const drift = drift0 * bw
  const fadeIn = phase < 0.04 ? phase / 0.04 : phase > 0.97 ? (1 - phase) / 0.03 : 1
  ctx.globalAlpha = fadeIn
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 9; j++) {
      const x0 = bx + ((i + 0.5) / 12) * bw
      const y0 = by + ((j + 0.5) / 9) * bh
      const x = x0 + drift
      const inside = x <= bx + bw
      const nearWall = Math.abs(x - (bx + bw)) < 7
      ctx.fillStyle = nearWall
        ? DEEP
        : inside
          ? 'rgba(31,95,139,0.9)'
          : 'rgba(31,95,139,0.3)'
      ctx.fillRect(x - 2.4, y0 - 2.4, 4.8, 4.8)
    }
  }
  // fresh fluid following in from the left
  for (let i = 0; i < 18; i++) {
    for (let j = 0; j < 9; j++) {
      const x0 = bx - 1.5 * bw + ((i + 0.5) / 18) * 1.5 * bw
      const y0 = by + ((j + 0.5) / 9) * bh
      const x = x0 + drift
      if (x < bx || x > bx + bw) continue
      ctx.fillStyle = 'rgba(107,99,90,0.45)'
      ctx.fillRect(x - 2.4, y0 - 2.4, 4.8, 4.8)
    }
  }
  ctx.globalAlpha = 1
  ctx.strokeStyle = INK
  ctx.lineWidth = 2.4
  ctx.strokeRect(bx, by, bw, bh)
  ctx.font = mono
  ctx.fillStyle = INK
  ctx.fillText('the REGION (fixed)', bx, by - 12)
  // ledger
  const fracIn = Math.max(0, Math.min(1, 1 - drift0))
  const lx = bx + bw + W * 0.05
  ctx.fillStyle = MUTED
  ctx.fillText('momentum of the MATTER', lx, by + 8)
  ctx.font = monoBold
  ctx.fillStyle = INK
  ctx.fillText('1.00  (Newton applies here)', lx, by + 26)
  ctx.font = mono
  ctx.fillStyle = MUTED
  ctx.fillText('…still inside the region', lx, by + 62)
  ctx.font = monoBold
  ctx.fillStyle = BLUE
  ctx.fillText(fracIn.toFixed(2), lx, by + 80)
  ctx.font = mono
  ctx.fillStyle = MUTED
  ctx.fillText('…carried across the boundary', lx, by + 116)
  ctx.font = monoBold
  ctx.fillStyle = DEEP
  ctx.fillText((1 - fracIn).toFixed(2), lx, by + 134)
  ctx.strokeStyle = RULE
  ctx.beginPath()
  ctx.moveTo(lx, by + 150)
  ctx.lineTo(lx + W * 0.24, by + 150)
  ctx.stroke()
  ctx.font = mono
  ctx.fillStyle = INK
  ctx.fillText(`${fracIn.toFixed(2)} + ${(1 - fracIn).toFixed(2)} = 1.00, always`, lx, by + 168)
}

// ---------------------------------------------------------------------------
// 5 · the turnstile, one tick at a time
// ---------------------------------------------------------------------------

const sceneTurnstile: Draw = ({ ctx, W, H, t }) => {
  const P = 3.4
  const cycle = Math.floor(t / P)
  const ph = (t % P) / P
  const px = W * 0.46
  const y0 = H * 0.14
  const y1 = H * 0.82
  const pa = H * 0.36
  const pb = H * 0.6
  const ux = 96
  const uy = -34
  // wall + patch
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(px, y0)
  ctx.lineTo(px, y1)
  ctx.stroke()
  ctx.strokeStyle = DEEP
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(px, pa)
  ctx.lineTo(px, pb)
  ctx.stroke()
  ctx.font = mono
  ctx.fillStyle = DEEP
  ctx.fillText('dS', px + 8, pb + 16)
  // velocity decomposition at the patch centre
  const cy = (pa + pb) / 2
  const dec = easeInOut(ph / 0.22)
  ctx.lineWidth = 2.4
  ctx.strokeStyle = INK
  ctx.fillStyle = INK
  arrow(ctx, px, cy, px + ux * 0.9, cy + uy * 0.9, 7)
  ctx.fillText('u', px + ux * 0.9 + 8, cy + uy * 0.9)
  if (dec > 0.02) {
    ctx.strokeStyle = BLUE
    ctx.fillStyle = BLUE
    ctx.lineWidth = 3
    arrow(ctx, px, cy, px + ux * 0.9 * dec, cy, 7)
    ctx.font = monoBold
    ctx.fillText('u·n̂  (crosses)', px + 14, cy + 20)
    ctx.font = mono
    ctx.strokeStyle = 'rgba(107,99,90,0.7)'
    ctx.fillStyle = 'rgba(107,99,90,0.9)'
    ctx.lineWidth = 1.8
    ctx.setLineDash([4, 4])
    arrow(ctx, px, cy, px, cy + uy * 0.9 * dec, 6)
    ctx.setLineDash([])
    ctx.fillText('slides along — never crosses', Math.max(6, px - 218), cy + uy * 0.9 - 8)
  }
  // the swept prism (upstream side: fluid about to cross in dt)
  const ext = easeInOut((ph - 0.25) / 0.45)
  if (ext > 0) {
    ctx.fillStyle = `rgba(31,95,139,${0.16 * ext})`
    ctx.strokeStyle = BLUE
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(px, pa)
    ctx.lineTo(px - ux * ext, pa - uy * ext)
    ctx.lineTo(px - ux * ext, pb - uy * ext)
    ctx.lineTo(px, pb)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.font = mono
    ctx.fillStyle = BLUE
    if (ext > 0.9) ctx.fillText('(u·n̂) dt dS — everything here is about to be exported', px - ux - 40, pa - uy + 18)
  }
  // stream of particles carried through
  for (let i = 0; i < 12; i++) {
    const s = (i / 12 + t * 0.16) % 1
    const yy = pa + 6 + ((i * 41) % (pb - pa - 12))
    const x = px - 130 + s * 260
    const y = yy + (uy / ux) * (x - px) * 0.8
    const inPrism = ext > 0.5 && x < px && x > px - ux * ext
    ctx.fillStyle = inPrism ? DEEP : 'rgba(31,95,139,0.8)'
    ctx.beginPath()
    ctx.arc(x, y, inPrism ? 5 : 3.6, 0, 7)
    ctx.fill()
  }
  // counters: tick once per cycle
  const ticked = cycle + (ph > 0.8 ? 1 : 0)
  ctx.font = monoBold
  ctx.fillStyle = INK
  ctx.fillText(`ticks: ${ticked}`, W * 0.06, H * 0.1)
  ctx.fillStyle = BLUE
  ctx.fillText(`mass exported:  ${ticked} × ρ(u·n̂) dS dt`, W * 0.06, H * 0.1 + 20)
  ctx.fillStyle = DEEP
  ctx.fillText(`momentum exported:  ticks × cargo v`, W * 0.06, H * 0.1 + 40)
  ctx.font = mono
  ctx.fillStyle = MUTED
  ctx.textAlign = 'center'
  ctx.fillText('traffic: ρ(u·n̂) dS  ×  cargo: v  =  ρ v (u·n̂) dS  per second', W / 2, H * 0.94)
  ctx.textAlign = 'left'
}

// ---------------------------------------------------------------------------
// world transform + solver-driven particle field (scenes 6-8)
// ---------------------------------------------------------------------------

function foilWorld(W: number, H: number, halfW: number, halfH: number) {
  const s = Math.min(W / (2 * halfW), H / (2 * halfH))
  return {
    s,
    px: (x: number) => W / 2 + (x - BOX_CX) * s,
    py: (y: number) => H / 2 - y * s,
  }
}

function stepFlow(
  parts: FlowPart[],
  data: SolData,
  dt: number,
  xMin: number,
  xMax: number,
  yHalf: number,
  speed: number,
) {
  for (const p of parts) {
    const u = velocityAt(data.sol, p.x, p.y)
    p.x += u.x * dt * speed
    p.y += u.y * dt * speed
    p.hist.push(p.x, p.y)
    if (p.hist.length > 18) p.hist.splice(0, 2)
    if (p.x > xMax || Math.abs(p.y) > yHalf * 1.1 || insideFoil(data.sol.geo, p.x, p.y)) {
      p.x = xMin
      p.y = (Math.random() * 2 - 1) * yHalf
      p.hist.length = 0
    }
  }
}

function seedFlow(n: number, xMin: number, xMax: number, yHalf: number): FlowPart[] {
  const parts: FlowPart[] = []
  for (let i = 0; i < n; i++) {
    parts.push({ x: xMin + Math.random() * (xMax - xMin), y: (Math.random() * 2 - 1) * yHalf, hist: [] })
  }
  return parts
}

function drawFlow(ctx: CanvasRenderingContext2D, parts: FlowPart[], px: (x: number) => number, py: (y: number) => number) {
  ctx.lineWidth = 1.1
  for (const p of parts) {
    const h = p.hist
    if (h.length >= 4) {
      ctx.strokeStyle = 'rgba(26,23,20,0.22)'
      ctx.beginPath()
      ctx.moveTo(px(h[0]), py(h[1]))
      for (let i = 2; i < h.length; i += 2) ctx.lineTo(px(h[i]), py(h[i + 1]))
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(26,23,20,0.65)'
    ctx.beginPath()
    ctx.arc(px(p.x), py(p.y), 1.8, 0, 7)
    ctx.fill()
  }
}

function drawFoil(ctx: CanvasRenderingContext2D, data: SolData, px: (x: number) => number, py: (y: number) => number) {
  ctx.fillStyle = INK
  ctx.beginPath()
  data.sol.geo.nodes.forEach((n, i) => (i === 0 ? ctx.moveTo(px(n.x), py(n.y)) : ctx.lineTo(px(n.x), py(n.y))))
  ctx.closePath()
  ctx.fill()
}

// ---------------------------------------------------------------------------
// 6 · the live budget box, in a live flow
// ---------------------------------------------------------------------------

const sceneBudget: Draw = ({ ctx, W, H, prog, dt, data }) => {
  if (!data) return
  const { px, py, s } = foilWorld(W, H, 3.4, 2.1)
  if (!sim.flow6) sim.flow6 = seedFlow(230, BOX_CX - 3.35, BOX_CX + 3.35, 2.0)
  stepFlow(sim.flow6, data, Math.min(dt, 0.05), BOX_CX - 3.35, BOX_CX + 3.4, 2.0, 0.55)
  drawFlow(ctx, sim.flow6, px, py)
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.strokeRect(px(BOX_CX - BOX_HX), py(BOX_HY), 2 * BOX_HX * s, 2 * BOX_HY * s)
  const nShow = Math.floor(data.glyphs.length * Math.min(1, prog * 1.4 + 0.1))
  const G = 4.5
  for (let i = 0; i < nShow; i++) {
    const g = data.glyphs[i]
    const len = Math.max(-0.55, Math.min(0.55, g.vlen * G))
    // nudge side-wall glyphs off the box edge so they don't hide under it
    const gx = px(g.x) + (g.kind === 'flux' ? (g.x > BOX_CX ? 5 : -5) : 0)
    ctx.strokeStyle = g.kind === 'flux' ? BLUE : DEEP
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(gx, py(g.y))
    ctx.lineTo(gx, py(g.y + len))
    ctx.stroke()
  }
  drawFoil(ctx, data, px, py)
  ctx.font = monoBold
  ctx.fillStyle = BLUE
  ctx.fillText(`flux  ${((100 * data.budget.flux) / data.L).toFixed(1)}%`, W * 0.05, H * 0.09)
  ctx.fillStyle = DEEP
  ctx.fillText(`pressure  ${((100 * data.budget.press) / data.L).toFixed(1)}%`, W * 0.05, H * 0.09 + 20)
  ctx.fillStyle = INK
  ctx.fillText(`total / L  ${((data.budget.flux + data.budget.press) / data.L).toFixed(4)}`, W * 0.05, H * 0.09 + 40)
}

// ---------------------------------------------------------------------------
// 7 · equilibrium on the skin
// ---------------------------------------------------------------------------

const sceneBalance: Draw = ({ ctx, W, H, prog, t, dt, data }) => {
  if (!data) return
  const { px, py } = foilWorld(W, H, 1.05, 0.62)
  if (!sim.flow7) sim.flow7 = seedFlow(150, BOX_CX - 1.02, BOX_CX + 1.02, 0.58)
  stepFlow(sim.flow7, data, Math.min(dt, 0.05), BOX_CX - 1.02, BOX_CX + 1.05, 0.58, 0.3)
  drawFlow(ctx, sim.flow7, px, py)
  // pressure whiskers: outward along the normal, length |cp|;
  // red = suction (pulls), blue = overpressure (pushes)
  const A = 0.16 * Math.min(1, prog * 1.6 + 0.2)
  for (const p of data.skin) {
    const len = Math.abs(p.cp) * A
    ctx.strokeStyle = p.cp < 0 ? DEEP : BLUE
    ctx.lineWidth = 1.7
    ctx.beginPath()
    ctx.moveTo(px(p.x), py(p.y))
    ctx.lineTo(px(p.x + p.nx * len), py(p.y + p.ny * len))
    ctx.stroke()
  }
  drawFoil(ctx, data, px, py)
  // the exchange, pulsing in antiphase
  const pulse = 0.62 + 0.38 * Math.sin(t * 2.2)
  ctx.font = monoBold
  ctx.textAlign = 'center'
  ctx.fillStyle = `rgba(168,28,46,${pulse})`
  ctx.fillText('fluid on wing:  +L', W / 2, H * 0.09)
  ctx.strokeStyle = `rgba(168,28,46,${pulse})`
  ctx.lineWidth = 2.2
  ctx.fillStyle = `rgba(168,28,46,${pulse})`
  arrow(ctx, W / 2 + W * 0.12, H * 0.14, W / 2 + W * 0.12, H * 0.05, 6)
  const pulse2 = 0.62 + 0.38 * Math.sin(t * 2.2 + Math.PI)
  ctx.fillStyle = `rgba(31,95,139,${pulse2})`
  ctx.fillText('wing on fluid:  −L', W / 2, H * 0.96)
  ctx.strokeStyle = `rgba(31,95,139,${pulse2})`
  ctx.fillStyle = `rgba(31,95,139,${pulse2})`
  arrow(ctx, W / 2 + W * 0.12, H * 0.88, W / 2 + W * 0.12, H * 0.97, 6)
  ctx.font = mono
  ctx.fillStyle = MUTED
  ctx.fillText(`∮ skin  =  box budget  =  ρU∞Γ  =  cl ${data.sol.clGamma.toFixed(3)}`, W / 2, H * 0.17)
  ctx.textAlign = 'left'
}

// ---------------------------------------------------------------------------
// 8 · the breathing box: budget re-integrated live as the shape morphs
// ---------------------------------------------------------------------------

const sceneShapes: Draw = ({ ctx, W, H, t, data }) => {
  if (!data) return
  const { px, py, s } = foilWorld(W, H, 3.5, 2.15)
  // box must always enclose the foil (x in [0,1]); hx >= 1 keeps the side
  // walls clear of the body at both extremes
  const sn = Math.sin(t * 0.55)
  const hx = 2.0 + 1.0 * sn
  const hy = 1.15 - 0.75 * sn
  // live glyphs every frame (cheap), full integration ~8x per second
  const glyphs: Glyph[] = []
  boxBudget(data.sol, hx, hy, 34, 3, glyphs)
  if (!sim.live8 || t - sim.live8.at > 0.12) {
    const b = boxBudget(data.sol, hx, hy, 150)
    sim.live8 = { ...b, at: t }
  }
  const live = sim.live8
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.strokeRect(px(BOX_CX - hx), py(hy), 2 * hx * s, 2 * hy * s)
  const G = 4.5
  for (const g of glyphs) {
    const len = Math.max(-0.5, Math.min(0.5, g.vlen * G))
    const gx = px(g.x) + (g.kind === 'flux' ? (g.x > BOX_CX ? 5 : -5) : 0)
    ctx.strokeStyle = g.kind === 'flux' ? BLUE : DEEP
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(gx, py(g.y))
    ctx.lineTo(gx, py(g.y + len))
    ctx.stroke()
  }
  drawFoil(ctx, data, px, py)
  // measured vs predicted split
  const fluxFrac = Math.max(0, Math.min(1, live.flux / data.L))
  const pred = (2 / Math.PI) * Math.atan(hy / hx)
  const barY = H * 0.93
  const barW = W * 0.56
  const bx = W / 2 - barW / 2
  ctx.fillStyle = BLUE
  ctx.fillRect(bx, barY, barW * fluxFrac, 10)
  ctx.fillStyle = DEEP
  ctx.fillRect(bx + barW * fluxFrac, barY, barW * (1 - fluxFrac), 10)
  ctx.font = monoBold
  ctx.fillStyle = BLUE
  ctx.fillText(`flux ${(100 * fluxFrac).toFixed(1)}%`, bx, barY - 8)
  ctx.fillStyle = DEEP
  ctx.textAlign = 'right'
  ctx.fillText(`pressure ${(100 * (1 - fluxFrac)).toFixed(1)}%`, bx + barW, barY - 8)
  ctx.textAlign = 'left'
  ctx.font = monoBold
  ctx.fillStyle = INK
  ctx.fillText(`total / L  ${((live.flux + live.press) / data.L).toFixed(4)}  — pinned`, W * 0.05, H * 0.09)
  ctx.font = mono
  ctx.fillStyle = MUTED
  ctx.fillText(`far-field rule (2/π)·atan(hy/hx): ${(100 * pred).toFixed(1)}%`, W * 0.05, H * 0.09 + 18)
}

// ---------------------------------------------------------------------------
// 9 · the three ledgers
// ---------------------------------------------------------------------------

const sceneLedgers: Draw = ({ ctx, W, H, t }) => {
  const rows: Array<[string, string, string]> = [
    ['momentum CONTENT of the air', '0  (nothing retained)', INK],
    ['momentum CURRENT through any closed surface', 'L per second, always', DEEP],
    ['IMPULSE of the vortex wake (3D)', 'grows at exactly L', INK],
  ]
  rows.forEach((r, i) => {
    const y = H * 0.26 + i * H * 0.22
    ctx.font = mono
    ctx.fillStyle = MUTED
    ctx.fillText(r[0], W * 0.08, y)
    ctx.font = '700 17px ui-monospace, monospace'
    ctx.fillStyle = r[2]
    ctx.fillText(r[1], W * 0.08, y + 24)
    if (i === 1) {
      // the current: an animated dashed conveyor under the row
      ctx.strokeStyle = DEEP
      ctx.lineWidth = 2
      ctx.setLineDash([8, 6])
      ctx.lineDashOffset = -t * 30
      ctx.beginPath()
      ctx.moveTo(W * 0.08, y + 38)
      ctx.lineTo(W * 0.92, y + 38)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.lineDashOffset = 0
    } else if (i === 2) {
      // the impulse: a bar that genuinely grows at a steady rate
      const g = ((t * 0.18) % 1) * W * 0.5
      ctx.fillStyle = 'rgba(31,95,139,0.75)'
      ctx.fillRect(W * 0.08, y + 32, g, 8)
      ctx.font = mono
      ctx.fillStyle = MUTED
      ctx.fillText('rate: L', W * 0.08 + g + 8, y + 40)
    } else {
      ctx.strokeStyle = RULE
      ctx.beginPath()
      ctx.moveTo(W * 0.08, y + 38)
      ctx.lineTo(W * 0.92, y + 38)
      ctx.stroke()
    }
  })
}

const SCENES: Draw[] = [
  sceneLedger,
  sceneBook,
  sceneCarriers,
  sceneRTT,
  sceneTurnstile,
  sceneBudget,
  sceneBalance,
  sceneShapes,
  sceneLedgers,
]

// ---------------------------------------------------------------------------
// the scrollytelling shell
// ---------------------------------------------------------------------------

export default function MomentumStory() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stepRefs = useRef<(HTMLDivElement | null)[]>([])
  const [active, setActive] = useState(0)
  const activeRef = useRef(0)
  activeRef.current = active
  const [data, setData] = useState<SolData | null>(null)
  const [navH, setNavH] = useState(0)

  useEffect(() => {
    const measure = () => setNavH(document.querySelector('header')?.getBoundingClientRect().height ?? 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    setData(buildSolData())
  }, [])

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = stepRefs.current.indexOf(e.target as HTMLDivElement)
            if (idx !== -1) setActive(idx)
          }
        }
      },
      { rootMargin: '-35% 0px -55% 0px' },
    )
    stepRefs.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let raf = 0
    let lastMs = 0
    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.06, lastMs ? (ms - lastMs) / 1000 : 0.016)
      lastMs = ms
      const cssW = canvas.clientWidth
      const cssH = canvas.clientHeight
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(cssW * dpr)) {
        canvas.width = Math.round(cssW * dpr)
        canvas.height = Math.round(cssH * dpr)
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = PAPER
      ctx.fillRect(0, 0, cssW, cssH)

      const idx = activeRef.current
      if (idx !== sim.lastIdx) {
        sim.lastIdx = idx
        sim.fadeT = 0
      }
      sim.fadeT += dt
      sim.tl[idx] += dt

      const el = stepRefs.current[idx]
      let prog = 0.5
      if (el) {
        const r = el.getBoundingClientRect()
        const vh = window.innerHeight
        prog = Math.max(0, Math.min(1, (vh * 0.65 - r.top) / (r.height + vh * 0.3)))
      }
      ctx.globalAlpha = Math.min(1, sim.fadeT / 0.35)
      SCENES[idx]?.({ ctx, W: cssW, H: cssH, prog, t: sim.tl[idx], dt, data })
      ctx.globalAlpha = 1
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [data])

  return (
    <div className="mt-10">
      {/* sticky visual */}
      <div
        className="sticky z-10 -mx-5 bg-[var(--paper)] px-5 pb-3 pt-3 sm:-mx-8 sm:px-8"
        style={{ top: navH }}
      >
        <canvas
          ref={canvasRef}
          className="h-[48vh] w-full rounded-[2px] border border-[var(--rule)]"
          role="img"
          aria-label="Animated figure for the current section"
        />
        <p className="data-strip mt-2">{STEPS[active].kicker}</p>
      </div>

      {/* scrolling prose */}
      <div className="mx-auto max-w-2xl">
        {STEPS.map((s, i) => (
          <div
            key={s.kicker}
            ref={(el) => {
              stepRefs.current[i] = el
            }}
            className="min-h-[85vh] py-16"
          >
            <p className="eyebrow">{s.kicker}</p>
            <h2 className="mt-3 text-3xl font-semibold">{s.title}</h2>
            {s.body.map((p, j) => (
              <p key={j} className="mt-5 text-lg leading-8 text-stone-600">
                {p}
              </p>
            ))}
            {i === 5 && (
              <p className="mt-5 font-mono text-sm text-[var(--accent-deep)]">
                L = −∮ [ ρ v (u·n̂) + (p − p∞) n_y ] dS
              </p>
            )}
          </div>
        ))}
        <div className="border-t border-[var(--rule)] py-12 text-sm leading-7 text-stone-500">
          <p>
            Further reading: Lighthill, <em>An Informal Introduction to Theoretical Fluid
            Mechanics</em> (impulse, done properly); Saffman, <em>Vortex Dynamics</em> ch. 3 (why
            &ldquo;total momentum of the fluid&rdquo; is conditionally convergent); Batchelor
            §7.2–7.3; Kármán &amp; Burgers in Durand&rsquo;s <em>Aerodynamic Theory</em> II (the
            control-volume shape result); McLean, <em>Understanding Aerodynamics</em> (the
            lift-explanation debates, adjudicated). The interactive laboratory for everything above
            lives at{' '}
            <a href="/apps/circulation" className="an-link font-medium text-stone-700">
              /apps/circulation
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
