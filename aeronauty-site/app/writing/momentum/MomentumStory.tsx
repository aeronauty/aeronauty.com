'use client'

import { useEffect, useRef, useState } from 'react'
import { makeSection, insideFoil, FoilGeometry } from '@/lib/foil/geometry'
import { solveFoil, FoilSolution } from '@/lib/foil/solver'
import { velocityAt } from '@/lib/foil/field'

/**
 * Scrollytelling: Newton's second law rebuilt for fluids. A sticky canvas
 * morphs through thirteen scenes as the prose scrolls. The back half is
 * computed live from the validated panel solution (2% camber, 12% thick,
 * alpha 5 deg — the same case as the momentum studies), not illustrated:
 * the "assemble it" scene literally counts tracer particles through the
 * reader's control volume and watches the tally converge to the potential-
 * flow value.
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
    kicker: '1 · Solids first',
    title: 'Newton, as originally built',
    body: [
      'Start where Newton started: with things. For any collection of matter — one ball, or the ten-septillion atoms of a thrown brick — the second law reads F = Σ mᵢ aᵢ: the total external force equals the sum, over every particle, of mass times acceleration. The internal forces — every atomic bond, every collision inside the body — cancel in equal-and-opposite pairs by the third law, which is the only reason one line of algebra can govern 10²⁵ atoms without naming any of them.',
      'The accelerations in that sum are absolute: measured in an inertial frame. That is the law’s fine print — it holds in inertial frames only. But it holds in all of them at once: watch the camera start drifting at constant velocity. Every velocity on screen changes; every acceleration is untouched; F = Σ mᵢ aᵢ reads the same. Accelerometers, which measure absolute acceleration directly, don’t care how fast you’re cruising. Everything that follows is this one law — we never replace it, we only re-organise the sum.',
    ],
  },
  {
    kicker: '2 · The ledger',
    title: 'Momentum is not stuff. It is a ledger.',
    body: [
      'Rewrite the sum: Σ mᵢ aᵢ = d/dt (Σ mᵢ vᵢ). The quantity being time-differentiated — mass times velocity, totalled over the collection — is momentum, and the second law becomes a bank statement: force is the rate at which the momentum account changes. The school picture of momentum as “oomph” stored inside moving objects works for billiard balls and quietly fails for everything else. Drop it. Momentum is a bookkeeping quantity: a number defined so that, in any interaction whatsoever, the total never changes. Watch the two balls collide: each ball’s entry changes, the total never moves.',
      'It exists because physics does not care where you are. Slide the whole experiment a metre to the left and nothing changes — and Noether’s theorem says that indifference forces a conserved quantity to exist, one component per direction you could have slid. That quantity is momentum. It was never a substance; it is the shadow cast by a symmetry.',
    ],
  },
  {
    kicker: '3 · Force is a flow rate',
    title: 'F = dp/dt, read literally',
    body: [
      'Newton’s second law, read as bookkeeping: a force is not a cause of motion — it is a transfer channel. F newtons means F kilogram-metres-per-second of momentum flowing from one account to another, per second.',
      'The cleanest proof that momentum flows without anything moving: a book resting on a table. Gravity deposits mg of downward momentum into the book every second. The book hands it to the table, the table to the floor, the floor to the planet. Flow rate mg, velocity everywhere zero. Momentum currents run through perfectly static matter — carried by stress. Hold that thought; the next scene opens the lid on it.',
    ],
  },
  {
    kicker: '4 · What pressure is',
    title: 'Pressure is momentum flux — run on thermal motion',
    body: [
      'Zoom into perfectly still air. The mean velocity is zero, but each molecule moves at roughly 500 m/s in a random direction — its peculiar velocity, the kinetic-theory term for motion relative to the average. Draw any imaginary surface through this stillness and watch the traffic. Mass transport nets to zero: equal crowds cross each way. Momentum transport does not. Rightward-movers carry rightward momentum to the right; leftward-movers carry leftward momentum to the left — and both count as rightward delivery of rightward momentum, so the two streams add instead of cancelling. That one-signed, never-cancelling flux of momentum is pressure. Watch the meters: mass ≈ 0, momentum pinned at p·A.',
      'The energy connection you can feel in the units — a pascal is a joule per cubic metre. For an ideal gas, p = ⅓ρ⟨c′²⟩ = n k_B T: pressure is two-thirds of the kinetic-energy density of the peculiar motion. Temperature is the same jiggle divided by a different denominator — energy per molecule rather than per volume — which is why the two are cousins, not synonyms: p = (molecules per volume) × (k_B T per molecule). No collisions between molecules are required; crossings alone do the job (collisions merely keep the motion isotropic, and in liquids intermolecular forces add a second channel on top). At a 10 m/s breeze the thermal channel outguns the bulk one by ⟨c′²⟩/3U² — around 900× — which is why low-speed aerodynamics is pressure-dominated.',
    ],
  },
  {
    kicker: '5 · Two carriers',
    title: 'One mechanism, two guises',
    body: [
      'Attach the ledger to regions of space instead of objects and every conserved quantity obeys the same template: a density, a flux, and the rule that content changes only by transport through the boundary. For momentum the flux has two parts — and you have now met both.',
      'Convection: the organised crossing — matter drifting with the mean flow carries its momentum like trucks carrying freight. Conduction: the disorganised crossing — the thermal traffic of the last scene, passing momentum through matter that on average goes nowhere. That is pressure, and it is also the book-on-the-table mechanism, seen molecule by molecule. Pressure is not a separate force that also acts on fluids. Pressure IS momentum flux, the conducted half. This single reclassification dissolves most of the confusion in every argument about lift.',
    ],
  },
  {
    kicker: '6 · From crowd to continuum',
    title: 'Euler’s move',
    body: [
      'Nobody can track 10²⁵ molecules, and nobody needs to. Average over parcels large enough to smooth the thermal jitter yet small enough to act as points, and the crowd condenses into fields: a density ρ(x), a velocity u(x), a pressure p(x). Watch the particles thicken until they become a flow. Nothing thermal is lost in the blur — the peculiar motion is exactly what the field p(x) carries forward into the continuum.',
      'This move has a birthday. Leonhard Euler, 1757, “Principes généraux du mouvement des fluides”: Newton’s second law written per unit volume of a continuum, ρ Du/Dt = −∇p — the first equations of fluid motion (Cauchy generalised the contact term to the full stress tensor in 1822; viscosity lives there). Euler’s equation follows a parcel, and for a parcel it is exact. But the useful question in aerodynamics is never about a parcel. It is about a place.',
    ],
  },
  {
    kicker: '7 · The region problem',
    title: 'Newton talks about matter. We want a law about a box.',
    body: [
      'Here is the honest difficulty: F = ma governs a fixed collection of matter, but the useful question in fluid mechanics is about a fixed region of space — a box — through which matter streams. The fluid in your box now will not be the fluid in your box in a moment.',
      'Watch the tagged parcel: at the first instant it exactly fills the box. Newton’s law applies to the blue matter, forever. But the blue matter leaves, taking its momentum with it. The momentum of the REGION and the momentum of the MATTER diverge — and the difference is exactly what crossed the boundary. Accounting for that difference is the whole content of the Reynolds transport theorem: d/dt(region) = d/dt(matter) − (momentum carried out across the boundary).',
    ],
  },
  {
    kicker: '8 · The turnstile',
    title: 'How momentum is “carried out”',
    body: [
      'No gradients required, nothing needs to change: momentum is carried out whenever matter crosses the surface, full stop. Through a patch of boundary with area dS and outward normal n̂, the fluid escaping in time dt fills a slanted prism of volume (u·n̂) dt dS — only the through-the-wall component of velocity moves matter across.',
      'That prism has mass ρ(u·n̂) dS per second — the conveyor. Each kilogram carries its momentum in its pockets — the cargo, vertical component v. Multiply: ρ v (u·n̂) dS per second. Velocity appears twice for two different reasons — once as the truck, once as the freight — which is why the term is quadratic and why it confuses everyone the first time. You have already watched this machine run once: pressure was the same turnstile, fed with peculiar velocity instead of the mean.',
    ],
  },
  {
    kicker: '9 · Assemble it',
    title: 'Newton’s second law for a box around a wing',
    body: [
      'Now assemble. Forces on the fluid in the box: pressure from the fluid outside, pushing inward on every patch (−p n̂ dS — a genuine Newtonian force), and the wing inside, pushing the fluid down with −L (the reaction to its lift). The flow is steady, so the region’s momentum content is constant — that is the only condition needed; the momentum ledger closes without ever consulting work or energy, which are a different conserved quantity’s books. So Newton reads: zero = forces in − momentum carried out. Rearranged: L = −∮ [ ρ v (u·n̂) + (p − p∞) n_y ] dS.',
      'This scene is measured, not asserted. The dots are tracer particles riding the panel-method flow; every one that crosses your box rings the blue turnstile with the momentum in its pockets, and the walls carry pressure taps feeding the red gauge. Both meters are noisy counts — so crank the particle density and watch them settle onto the analytic potential-flow ticks; resize the box and watch the two shares migrate while their sum stays nailed to L. The continuum limit of scene 6, happening live on your walls.',
    ],
  },
  {
    kicker: '10 · Equilibrium',
    title: 'The same current through every nested surface',
    body: [
      'Shrink-wrap the accounting surface onto the wing itself. No fluid crosses a solid skin, so the turnstile term dies identically and the budget collapses to pressure alone: ∮(p − p∞) n_y dS over the surface — the textbook definition of lift, suction above and overpressure below. On the skin the ledger is 100% conduction. The fluid pushes the wing up with L; the wing pushes the fluid down with L; that is Newton’s third law at the only surface where wing and fluid actually touch.',
      'Now inflate the surface. As it grows from the skin toward a distant circle, fluid begins to cross it and the turnstile wakes up: the pressure share slides from 100% toward an even split while convection takes up exactly the slack — and the total never moves. Skin, circle, or anything between: the same L per second threads every nested surface. That is what equilibrium means in a steady flow — not stillness, but a conserved current crossing every accountant’s boundary with the same total.',
    ],
  },
  {
    kicker: '11 · The control experiment',
    title: 'No turning, no force',
    body: [
      'The budget only ever reads what changed. Pass a stream through a region and let it leave with the same mass flow at the same velocity, in the same direction: no momentum has been exchanged, no acceleration has occurred, no F = ma has been performed. The integral doesn’t care how violently the flow manoeuvred inside — only the difference between what left and what arrived. A force lives on a boundary exactly when the flow through it comes out different than it went in.',
      'Aerodynamics has a famous control experiment. Solve the same section with the Kutta condition switched off — mathematically legal, Γ = 0 — and potential flow bends politely out of the foil’s way, unbends, and leaves with exactly what it brought. Budget: zero. No lift, no drag: d’Alembert’s paradox, the eighteenth century’s great embarrassment. Switch the Kutta condition on — the single fact viscosity insists upon, that the flow must leave the sharp edge smoothly — and the flow departs turned. The budget reads L. Lift is not speed, not suction, not any local incantation: it is the accountancy of turning.',
    ],
  },
  {
    kicker: '12 · The shape game',
    title: 'The split is your choice. The total is physics.',
    body: [
      'One last twist — the one that fuels every internet argument about lift. Squash the box flat: the lift arrives almost entirely as pressure on the top and bottom faces (squash it onto the ground and the bottom face is the overpressure footprint carrying the aircraft’s weight). Stretch it tall: the lift departs almost entirely as momentum flux through the side walls, the wake-rake reading.',
      'The split follows a pure geometry rule — each face collects lift in proportion to the angle it subtends at the wing, (2/π)·atan of the aspect ratio — because the budget integrand on a distant boundary is literally the angle element dθ. Around any enclosing loop, ∮dθ = 2π: topology, not aerodynamics. Asking “how much momentum is in the flow” is asking “how much of the horizon do my walls cover.” The only shape-independent statement is the total. The total is the lift.',
    ],
  },
  {
    kicker: '13 · The three ledgers',
    title: 'What to keep',
    body: [
      'Momentum content of the air: zero for the 2D section — every parcel rises before the wing, sinks behind it, and banks nothing. Momentum current through any closed surface: L per second, always, split by subtended angle between its two carriers. Impulse of the vortex system: the quantity your Newtonian gut was reaching for — it genuinely grows at rate L, in the wake of a finite wing.',
      'Most disagreements about lift are two people reading different rows of this table while saying the word “momentum”. The wing deposits L per second into the air; the current leaves through whatever surface you draw; pressure is half its plumbing; and on a real planet the conducted channel delivers every last newton-second to the ground, where the ledger closes. Newton holds. He just needed better accountants.',
    ],
  },
]

const ASSEMBLE_IDX = 8

// ---------------------------------------------------------------------------
// solver-backed data (scenes 9-12)
// ---------------------------------------------------------------------------

const BOX_CX = 0.25 // budget boxes and circles centred on the quarter chord

interface CircleSplit {
  R: number
  flux: number
  press: number
}

interface SolData {
  geo: FoilGeometry
  sol: FoilSolution
  sol0: FoilSolution
  L: number
  skin: Array<{ x: number; y: number; nx: number; ny: number; cp: number }>
  circleSplits: CircleSplit[]
  dal: { with: { total: number; cl: number }; without: { total: number; cl: number } }
}

function circleBudget(sol: FoilSolution, R: number, M: number): { flux: number; press: number } {
  let flux = 0
  let press = 0
  for (let k = 0; k < M; k++) {
    const th = (2 * Math.PI * (k + 0.5)) / M
    const nx = Math.cos(th)
    const ny = Math.sin(th)
    const u = velocityAt(sol, BOX_CX + R * nx, R * ny)
    const un = u.x * nx + u.y * ny
    const dp = 0.5 * (1 - (u.x * u.x + u.y * u.y))
    const w = (2 * Math.PI * R) / M
    flux += -u.y * un * w
    press += -dp * ny * w
  }
  return { flux, press }
}

function buildSolData(): SolData {
  const geo = makeSection({ camber: 0.02, camberPos: 0.4, thickness: 0.12, alpha: (5 * Math.PI) / 180, nPanels: 100 })
  const sol = solveFoil(geo)
  const sol0 = solveFoil(geo, { kutta: false, circulation: 0 })
  const L = -sol.circulation

  const skin = sol.geo.panels
    .filter((_, i) => i % 2 === 0)
    .map((p, i) => ({ x: p.mx, y: p.my, nx: p.nx, ny: p.ny, cp: sol.cp[i * 2] }))

  const circleSplits: CircleSplit[] = []
  for (let i = 0; i < 18; i++) {
    const R = 0.8 * Math.pow(3.4 / 0.8, i / 17)
    const b = circleBudget(sol, R, 360)
    circleSplits.push({ R, flux: b.flux, press: b.press })
  }

  const bw = circleBudget(sol, 2, 720)
  const b0 = circleBudget(sol0, 2, 720)
  return {
    geo,
    sol,
    sol0,
    L,
    skin,
    circleSplits,
    dal: {
      with: { total: bw.flux + bw.press, cl: sol.clGamma },
      without: { total: b0.flux + b0.press, cl: sol0.clGamma },
    },
  }
}

/** analytic box budget + wall glyphs, cached per box size */
interface BoxAnalytics {
  flux: number
  press: number
  glyphs: Array<{ x: number; y: number; vlen: number; kind: 'flux' | 'press' }>
}
const boxCache = new Map<string, BoxAnalytics>()

function boxAnalytics(data: SolData, hx: number, hy: number): BoxAnalytics {
  const key = `${hx.toFixed(3)}x${hy.toFixed(3)}`
  const hit = boxCache.get(key)
  if (hit) return hit
  const glyphs: BoxAnalytics['glyphs'] = []
  let flux = 0
  let press = 0
  const side = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number, M: number, gEvery: number) => {
    const w = Math.hypot(x1 - x0, y1 - y0) / M
    for (let k = 0; k < M; k++) {
      const t = (k + 0.5) / M
      const gx = x0 + (x1 - x0) * t
      const gy = y0 + (y1 - y0) * t
      const u = velocityAt(data.sol, gx, gy)
      const un = u.x * nx + u.y * ny
      const dp = 0.5 * (1 - (u.x * u.x + u.y * u.y))
      flux += -u.y * un * w
      press += -dp * ny * w
      if (k % gEvery === Math.floor(gEvery / 2)) {
        glyphs.push({ x: gx, y: gy, vlen: ny === 0 ? -u.y * un : -dp * ny, kind: ny === 0 ? 'flux' : 'press' })
      }
    }
  }
  side(BOX_CX + hx, -hy, BOX_CX + hx, hy, 1, 0, 200, 9)
  side(BOX_CX - hx, hy, BOX_CX - hx, -hy, -1, 0, 200, 9)
  side(BOX_CX - hx, -hy, BOX_CX + hx, -hy, 0, -1, 200, 8)
  side(BOX_CX + hx, hy, BOX_CX - hx, hy, 0, 1, 200, 8)
  const out = { flux, press, glyphs }
  boxCache.set(key, out)
  if (boxCache.size > 60) boxCache.delete(boxCache.keys().next().value as string)
  return out
}

// ---------------------------------------------------------------------------
// shared simulation state (module-level; the canvas loop owns it)
// ---------------------------------------------------------------------------

/** reader-adjustable controls for the assemble scene, written by the sliders */
const controls = { n: 350, scale: 1 }

let frameDt = 0.016 // real seconds, set once per rAF tick

const FLOW_DOM = { x0: -2.6, x1: 3.4, yh: 2.05 }
const SIM_SPEED = 0.55 // sim time units per real second

interface FlowPart {
  x: number
  y: number
  px: number
  py: number
  uy: number
}
const flowParts: FlowPart[] = []
let flowFieldId = ''

/** meters for the assemble scene (EMA, in sim units) */
const meter = { flux: 0, press: 0, respRate: 0, seeded: false }

function respawn(p: FlowPart) {
  p.x = FLOW_DOM.x0
  p.y = (Math.random() * 2 - 1) * FLOW_DOM.yh
  p.px = p.x
  p.py = p.y
  p.uy = 0
}

function stepFlow(data: SolData, fieldSol: FoilSolution, fieldId: string, n: number): number {
  if (fieldId !== flowFieldId) {
    flowFieldId = fieldId
  }
  while (flowParts.length < n) {
    const p: FlowPart = { x: 0, y: 0, px: 0, py: 0, uy: 0 }
    // initial fill across the whole domain so the picture starts populated
    p.x = FLOW_DOM.x0 + Math.random() * (FLOW_DOM.x1 - FLOW_DOM.x0)
    p.y = (Math.random() * 2 - 1) * FLOW_DOM.yh
    p.px = p.x
    p.py = p.y
    flowParts.push(p)
  }
  if (flowParts.length > n) flowParts.length = n

  const dtSim = Math.min(frameDt, 0.05) * SIM_SPEED
  let respawns = 0
  for (const p of flowParts) {
    p.px = p.x
    p.py = p.y
    const u = velocityAt(fieldSol, p.x, p.y)
    p.uy = u.y
    p.x += u.x * dtSim
    p.y += u.y * dtSim
    const nearFoil = p.x > -0.05 && p.x < 1.05 && Math.abs(p.y) < 0.18
    if (
      p.x > FLOW_DOM.x1 ||
      p.x < FLOW_DOM.x0 ||
      Math.abs(p.y) > FLOW_DOM.yh ||
      (nearFoil && insideFoil(data.geo, p.x, p.y))
    ) {
      respawn(p)
      respawns++
    }
  }
  const rate = respawns / Math.max(dtSim, 1e-6)
  if (!meter.seeded) {
    meter.respRate = n / (FLOW_DOM.x1 - FLOW_DOM.x0) // theoretical transit estimate
    meter.seeded = true
  }
  ema(meter, 'respRate', rate, 6)
  return dtSim
}

function ema(obj: typeof meter, key: 'flux' | 'press' | 'respRate', sample: number, tau: number) {
  const a = 1 - Math.exp(-Math.min(frameDt, 0.05) / tau)
  obj[key] += (sample - obj[key]) * a
}

// thermal-motion sim for the pressure scene
interface Mol {
  x: number
  y: number
  vx: number
  vy: number
}
const mols: Mol[] = []
const thermMeter = { mass: 0, mom: 0 }

function gauss(): number {
  let s = 0
  for (let i = 0; i < 4; i++) s += Math.random()
  return (s - 2) * 1.72 // ~unit variance
}

// ---------------------------------------------------------------------------
// scene renderers — (ctx, W, H, prog in [0,1], t seconds, data)
// ---------------------------------------------------------------------------

type Draw = (ctx: CanvasRenderingContext2D, W: number, H: number, prog: number, t: number, data: SolData | null) => void

const mono = '12px ui-monospace, SFMono-Regular, monospace'

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, val: number, scale: number, color: string, label: string) {
  ctx.fillStyle = color
  const h = val * scale
  ctx.fillRect(x, y - Math.max(0, h), w, Math.abs(h))
  ctx.fillStyle = MUTED
  ctx.font = mono
  ctx.fillText(label, x, y + 16)
}

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, lw = 2) {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy)
  if (len < 1) return
  const ux = dx / len
  const uy = dy / len
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = lw
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  const ah = Math.min(7, len * 0.4)
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 - ah * ux - ah * 0.5 * uy, y1 - ah * uy + ah * 0.5 * ux)
  ctx.lineTo(x1 - ah * ux + ah * 0.5 * uy, y1 - ah * uy - ah * 0.5 * ux)
  ctx.closePath()
  ctx.fill()
}

/** horizontal meter with an analytic tick */
function gauge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  value: number,
  tick: number,
  fullScale: number,
  color: string,
  label: string,
) {
  ctx.strokeStyle = RULE
  ctx.strokeRect(x, y, w, 10)
  const frac = Math.max(0, Math.min(1, value / fullScale))
  ctx.fillStyle = color
  ctx.fillRect(x, y, w * frac, 10)
  const tx = x + w * Math.max(0, Math.min(1, tick / fullScale))
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(tx, y - 4)
  ctx.lineTo(tx, y + 14)
  ctx.stroke()
  ctx.fillStyle = MUTED
  ctx.font = mono
  ctx.fillText(`${label}  ${value.toFixed(3)}  (potential ${tick.toFixed(3)})`, x, y - 8)
}

/** 1: solids — F = sum(m a), internal pairs cancel, inertial-camera beat */
const sceneSolids: Draw = (ctx, W, H, prog, t) => {
  const T = 6
  const tc = t % T
  const A = W * 0.02 // px/s^2
  const drifting = prog > 0.55
  const vCam = drifting ? W * 0.035 : 0
  const x0 = W * 0.16 + 0.5 * A * tc * tc - vCam * tc
  const cy = H * 0.55
  const nx = 7
  const nyn = 4
  const sp = Math.min(26, W * 0.032)
  // lattice
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nyn; j++) {
      const x = x0 + i * sp
      const y = cy + (j - (nyn - 1) / 2) * sp
      ctx.fillStyle = INK
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, 7)
      ctx.fill()
    }
  }
  // internal force pairs flickering on a few bonds
  for (let k = 0; k < 6; k++) {
    const i = (k * 2) % (nx - 1)
    const j = (k * 3) % nyn
    const x = x0 + i * sp
    const y = cy + (j - (nyn - 1) / 2) * sp
    const a = Math.abs(Math.sin(t * 2.4 + k * 1.9)) * 0.75
    ctx.globalAlpha = a
    arrow(ctx, x + 6, y, x + sp * 0.45, y, MUTED, 1.4)
    arrow(ctx, x + sp - 6, y, x + sp * 0.55, y, MUTED, 1.4)
    ctx.globalAlpha = 1
  }
  // external force
  arrow(ctx, x0 - 66, cy, x0 - 14, cy, DEEP, 3)
  ctx.fillStyle = DEEP
  ctx.font = mono
  ctx.fillText('F (external)', x0 - 70, cy - 14)
  // acceleration arrows (constant), velocity arrows (growing / frame-dependent)
  const vx = A * tc - vCam
  arrow(ctx, x0 + nx * sp + 4, cy - 16, x0 + nx * sp + 4 + 34, cy - 16, INK, 2)
  ctx.fillStyle = INK
  ctx.fillText('a  (same in every inertial frame)', x0 + nx * sp + 44, cy - 12)
  arrow(ctx, x0 + nx * sp + 4, cy + 16, x0 + nx * sp + 4 + Math.max(-60, Math.min(60, vx * 0.4)), cy + 16, BLUE, 2)
  ctx.fillStyle = BLUE
  ctx.fillText('v  (frame-dependent)', x0 + nx * sp + 70, cy + 20)
  ctx.fillStyle = MUTED
  ctx.textAlign = 'center'
  ctx.fillText(
    drifting ? 'camera drifting at constant velocity — every acceleration unchanged' : 'F = Σ mᵢ aᵢ — internal pairs cancel by the third law',
    W / 2,
    H * 0.12,
  )
  ctx.textAlign = 'left'
}

/** 2: two balls exchange momentum; total bar constant */
const sceneLedger: Draw = (ctx, W, H, prog, t) => {
  const cy = H * 0.56
  const r = 22
  const period = 6
  const tt = (t % period) / period
  const m1 = 2
  const m2 = 1
  const u1 = 1.2
  const u2 = -1.6
  const v1 = ((m1 - m2) * u1 + 2 * m2 * u2) / (m1 + m2)
  const v2 = ((m2 - m1) * u2 + 2 * m1 * u1) / (m1 + m2)
  const xc = W * 0.5
  const span = W * 0.3
  let x1: number, x2: number, p1: number, p2: number
  if (tt < 0.5) {
    const s = tt / 0.5
    x1 = xc - span + span * s * (u1 / 1.2)
    x2 = xc + span + span * s * (u2 / 1.2) * 0.75
    p1 = m1 * u1
    p2 = m2 * u2
  } else {
    const s = (tt - 0.5) / 0.5
    x1 = xc - r + span * s * (v1 / 1.2) * 0.8
    x2 = xc + r + span * s * (v2 / 1.2) * 0.8
    p1 = m1 * v1
    p2 = m2 * v2
  }
  ctx.strokeStyle = RULE
  ctx.beginPath()
  ctx.moveTo(W * 0.08, cy + r + 8)
  ctx.lineTo(W * 0.92, cy + r + 8)
  ctx.stroke()
  ctx.fillStyle = DEEP
  ctx.beginPath()
  ctx.arc(x1, cy, r * 1.15, 0, 7)
  ctx.fill()
  ctx.fillStyle = BLUE
  ctx.beginPath()
  ctx.arc(x2, cy, r * 0.85, 0, 7)
  ctx.fill()
  const by = H * 0.26
  const sc = 26
  bar(ctx, W * 0.3, by, 26, p1, sc, DEEP, 'p₁')
  bar(ctx, W * 0.42, by, 26, p2, sc, BLUE, 'p₂')
  bar(ctx, W * 0.6, by, 26, p1 + p2, sc, INK, 'p₁+p₂  (never moves)')
  ctx.strokeStyle = RULE
  ctx.beginPath()
  ctx.moveTo(W * 0.26, by)
  ctx.lineTo(W * 0.78, by)
  ctx.stroke()
}

/** 3: book on table, momentum current flowing with nothing moving */
const sceneBook: Draw = (ctx, W, H, prog, t) => {
  const gx = W * 0.5
  const groundY = H * 0.82
  const tableY = groundY - H * 0.28
  const bookY = tableY - H * 0.1
  ctx.fillStyle = INK
  ctx.fillRect(gx - W * 0.3, groundY, W * 0.6, 6)
  ctx.fillStyle = MUTED
  ctx.fillRect(gx - W * 0.16, tableY, W * 0.32, 8)
  ctx.fillRect(gx - W * 0.13, tableY + 8, 10, groundY - tableY - 8)
  ctx.fillRect(gx + W * 0.13 - 10, tableY + 8, 10, groundY - tableY - 8)
  ctx.fillStyle = DEEP
  ctx.fillRect(gx - W * 0.07, bookY, W * 0.14, tableY - bookY - 2)
  const flow = (x: number, y0: number, y1: number) => {
    const n = 6
    for (let i = 0; i < n; i++) {
      const s = (i / n + t * 0.25) % 1
      const y = y0 + (y1 - y0) * s
      ctx.strokeStyle = `rgba(31, 95, 139, ${0.85 - 0.4 * s})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - 6, y - 5)
      ctx.lineTo(x, y + 3)
      ctx.lineTo(x + 6, y - 5)
      ctx.stroke()
    }
  }
  flow(gx, bookY + 8, tableY)
  flow(gx - W * 0.13 + 5, tableY + 10, groundY - 4)
  flow(gx + W * 0.13 - 5, tableY + 10, groundY - 4)
  ctx.fillStyle = MUTED
  ctx.font = mono
  ctx.textAlign = 'center'
  ctx.fillText('current: mg per second · velocity: zero everywhere', gx, H * 0.12)
  ctx.textAlign = 'left'
}

/** 4: pressure = momentum flux of thermal motion, measured across a line */
const scenePressure: Draw = (ctx, W, H, prog, t) => {
  const bx = W * 0.1
  const bw = W * 0.8
  const by = H * 0.2
  const bh = H * 0.58
  const SIG = 75 // px/s, per-component std dev
  const N = 110
  if (mols.length === 0) {
    for (let i = 0; i < N; i++) {
      mols.push({ x: bx + Math.random() * bw, y: by + Math.random() * bh, vx: gauss() * SIG, vy: gauss() * SIG })
    }
  }
  const dt = Math.min(frameDt, 0.05)
  const mid = bx + bw / 2
  let massX = 0
  let momX = 0
  for (const m of mols) {
    const pxOld = m.x
    m.x += m.vx * dt
    m.y += m.vy * dt
    if (m.x < bx) {
      m.x = 2 * bx - m.x
      m.vx = -m.vx
    }
    if (m.x > bx + bw) {
      m.x = 2 * (bx + bw) - m.x
      m.vx = -m.vx
    }
    if (m.y < by) {
      m.y = 2 * by - m.y
      m.vy = -m.vy
    }
    if (m.y > by + bh) {
      m.y = 2 * (by + bh) - m.y
      m.vy = -m.vy
    }
    if (pxOld < mid !== m.x < mid) {
      const s = m.x >= mid ? 1 : -1 // +1 crossed L->R
      massX += s
      momX += s * m.vx // both directions contribute positively
    }
  }
  const aE = 1 - Math.exp(-dt / 2.5)
  thermMeter.mass += (massX / dt - thermMeter.mass) * aE
  thermMeter.mom += (momX / dt - thermMeter.mom) * aE
  // expected: momentum flux across the line = n <vx^2> * length = N*sig^2/bw
  const expect = (N * SIG * SIG) / bw

  ctx.strokeStyle = RULE
  ctx.strokeRect(bx, by, bw, bh)
  ctx.setLineDash([5, 4])
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(mid, by - 8)
  ctx.lineTo(mid, by + bh + 8)
  ctx.stroke()
  ctx.setLineDash([])
  for (const m of mols) {
    ctx.fillStyle = m.vx > 0 ? BLUE : DEEP
    ctx.beginPath()
    ctx.arc(m.x, m.y, 3, 0, 7)
    ctx.fill()
  }
  ctx.font = mono
  ctx.fillStyle = MUTED
  ctx.textAlign = 'center'
  ctx.fillText('still air: mean velocity = 0 · every molecule ~500 m/s (peculiar velocity)', W / 2, H * 0.1)
  ctx.textAlign = 'left'
  const gy = H * 0.93
  ctx.fillStyle = INK
  ctx.fillText(`mass crossing the line:  ${(thermMeter.mass / N).toFixed(2)} ≈ 0`, bx, gy)
  ctx.fillStyle = DEEP
  ctx.fillText(`momentum crossing ÷ p·A:  ${(thermMeter.mom / expect).toFixed(2)}  (kinetic theory: 1.00)`, bx + bw * 0.45, gy)
}

/** 5: convection (moving stream) vs conduction (pressure pulse in a chain) */
const sceneCarriers: Draw = (ctx, W, H, prog, t) => {
  const yTop = H * 0.3
  const yBot = H * 0.7
  ctx.fillStyle = MUTED
  ctx.font = mono
  ctx.fillText('convection: the organised crossing — matter drifts, freight rides along', W * 0.08, yTop - 44)
  ctx.fillText('conduction (pressure): the disorganised crossing — hand to hand, no drift', W * 0.08, yBot - 44)
  for (let i = 0; i < 22; i++) {
    const x = W * 0.08 + ((i / 22 + t * 0.12) % 1) * W * 0.84
    ctx.fillStyle = BLUE
    ctx.beginPath()
    ctx.arc(x, yTop + 6 * Math.sin(i * 2.4), 5, 0, 7)
    ctx.fill()
  }
  const n = 20
  const pulse = ((t * 0.35) % 1) * n
  for (let i = 0; i < n; i++) {
    const d = Math.exp(-0.5 * ((i - pulse) / 1.2) ** 2)
    const x = W * 0.08 + (i / (n - 1)) * W * 0.84 - d * 8
    ctx.fillStyle = d > 0.4 ? DEEP : INK
    ctx.beginPath()
    ctx.arc(x, yBot, 7, 0, 7)
    ctx.fill()
  }
}

/** shared world transform centred on the quarter chord */
function foilWorld(W: number, H: number, halfW: number) {
  const s = W / (2 * halfW)
  return {
    s,
    px: (x: number) => W / 2 + (x - BOX_CX) * s,
    py: (y: number) => H / 2 - y * s,
  }
}

function drawFoil(ctx: CanvasRenderingContext2D, data: SolData, px: (x: number) => number, py: (y: number) => number) {
  ctx.fillStyle = INK
  ctx.beginPath()
  data.sol.geo.nodes.forEach((n, i) => (i === 0 ? ctx.moveTo(px(n.x), py(n.y)) : ctx.lineTo(px(n.x), py(n.y))))
  ctx.closePath()
  ctx.fill()
}

function drawFlowParts(ctx: CanvasRenderingContext2D, px: (x: number) => number, py: (y: number) => number, alpha = 0.35) {
  ctx.fillStyle = `rgba(26, 23, 20, ${alpha})`
  for (const p of flowParts) {
    ctx.fillRect(px(p.x) - 1.1, py(p.y) - 1.1, 2.2, 2.2)
  }
}

/** 6: particles thicken into a continuum; Euler 1757 */
let arrowGrid: Array<{ x: number; y: number; ux: number; uy: number }> | null = null
const sceneContinuum: Draw = (ctx, W, H, prog, t, data) => {
  if (!data) return
  const { px, py } = foilWorld(W, H, 3.2)
  const n = Math.round(140 + Math.min(1, prog * 1.3) * 560)
  stepFlow(data, data.sol, 'kutta', n)
  drawFlowParts(ctx, px, py, 0.4)
  drawFoil(ctx, data, px, py)
  // field arrows fade in as the crowd becomes a continuum
  const a = Math.max(0, Math.min(1, prog * 2.2 - 0.9))
  if (a > 0.01) {
    if (!arrowGrid) {
      arrowGrid = []
      for (let i = 0; i < 15; i++) {
        for (let j = 0; j < 8; j++) {
          const x = BOX_CX - 2.9 + (i / 14) * 5.8
          const y = -1.75 + (j / 7) * 3.5
          if (x > -0.1 && x < 1.1 && Math.abs(y) < 0.2 && insideFoil(data.geo, x, y)) continue
          const u = velocityAt(data.sol, x, y)
          arrowGrid.push({ x, y, ux: u.x, uy: u.y })
        }
      }
    }
    ctx.globalAlpha = a
    for (const g of arrowGrid) {
      arrow(ctx, px(g.x), py(g.y), px(g.x + g.ux * 0.22), py(g.y + g.uy * 0.22), BLUE, 1.4)
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = MUTED
    ctx.font = mono
    ctx.fillText('u(x), p(x) — Euler, 1757', W * 0.06, H * 0.1)
  }
}

/** 7: RTT — tagged matter leaves the fixed region */
const sceneRTT: Draw = (ctx, W, H, prog) => {
  const bx = W * 0.28
  const by = H * 0.28
  const bw = W * 0.3
  const bh = H * 0.44
  const drift = prog * bw * 1.15
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 9; j++) {
      const x0 = bx + ((i + 0.5) / 12) * bw
      const y0 = by + ((j + 0.5) / 9) * bh
      const x = x0 + drift
      const inside = x >= bx && x <= bx + bw
      ctx.fillStyle = inside ? 'rgba(31,95,139,0.9)' : 'rgba(31,95,139,0.35)'
      ctx.fillRect(x - 2.2, y0 - 2.2, 4.4, 4.4)
    }
  }
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 9; j++) {
      const x0 = bx - bw + ((i + 0.5) / 12) * bw
      const y0 = by + ((j + 0.5) / 9) * bh
      const x = x0 + drift
      if (x < bx || x > bx + bw) continue
      ctx.fillStyle = 'rgba(107,99,90,0.5)'
      ctx.fillRect(x - 2.2, y0 - 2.2, 4.4, 4.4)
    }
  }
  ctx.strokeStyle = INK
  ctx.lineWidth = 2.4
  ctx.strokeRect(bx, by, bw, bh)
  ctx.font = mono
  ctx.fillStyle = INK
  ctx.fillText('the REGION (fixed)', bx, by - 12)
  ctx.fillStyle = BLUE
  ctx.fillText('the MATTER (tagged, leaving with its momentum)', bx + bw * 0.4, by + bh + 24)
}

/** 8: the turnstile — slanted prism at a boundary patch */
const sceneTurnstile: Draw = (ctx, W, H, prog, t) => {
  const px = W * 0.46
  const y0 = H * 0.22
  const y1 = H * 0.78
  ctx.strokeStyle = INK
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(px, y0)
  ctx.lineTo(px, y1)
  ctx.stroke()
  const pa = H * 0.4
  const pb = H * 0.6
  ctx.strokeStyle = DEEP
  ctx.beginPath()
  ctx.moveTo(px, pa)
  ctx.lineTo(px, pb)
  ctx.stroke()
  ctx.font = mono
  ctx.fillStyle = DEEP
  ctx.fillText('dS', px + 8, (pa + pb) / 2 + 4)
  ctx.strokeStyle = MUTED
  ctx.beginPath()
  ctx.moveTo(px, (pa + pb) / 2)
  ctx.lineTo(px + 60, (pa + pb) / 2)
  ctx.stroke()
  ctx.fillStyle = MUTED
  ctx.fillText('n̂', px + 66, (pa + pb) / 2 + 4)
  const ux = 90
  const uy = -34
  ctx.fillStyle = 'rgba(31,95,139,0.15)'
  ctx.beginPath()
  ctx.moveTo(px, pa)
  ctx.lineTo(px + ux, pa + uy)
  ctx.lineTo(px + ux, pb + uy)
  ctx.lineTo(px, pb)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = BLUE
  ctx.lineWidth = 1.5
  ctx.stroke()
  for (let i = 0; i < 9; i++) {
    const s = (i / 9 + t * 0.2) % 1
    const yy = pa + ((i * 37) % (pb - pa))
    const x = px - 40 + s * (ux + 55)
    ctx.fillStyle = BLUE
    ctx.beginPath()
    ctx.arc(x, yy + uy * ((x - px + 40) / (ux + 55)) * 0.8, 4, 0, 7)
    ctx.fill()
  }
  ctx.fillStyle = INK
  ctx.fillText('traffic: ρ (u·n̂) dS   ×   cargo: v   =   ρ v (u·n̂) dS', W * 0.2, H * 0.9)
}

/** 9: the interactive budget — counted turnstile + pressure taps vs analytic */
const sceneAssemble: Draw = (ctx, W, H, prog, t, data) => {
  if (!data) return
  const hx = 2.2 * controls.scale
  const hy = 1.5 * controls.scale
  // fit the whole box above the gauges: horizontal AND vertical constraints
  const s = Math.min(W / (2 * Math.max(3.2, hx * 1.25)), (0.66 * H) / (2 * hy * 1.04))
  const px = (x: number) => W / 2 + (x - BOX_CX) * s
  const py = (y: number) => H * 0.37 - y * s
  const dtSim = stepFlow(data, data.sol, 'kutta', controls.n)
  const an = boxAnalytics(data, hx, hy)

  // --- turnstile: count tracer crossings of the reader's box ---
  const w = (2 * FLOW_DOM.yh) / Math.max(meter.respRate, 1e-3) // mass flux per particle stream
  let sum = 0
  for (const p of flowParts) {
    const inPrev = Math.abs(p.px - BOX_CX) < hx && Math.abs(p.py) < hy
    const inNow = Math.abs(p.x - BOX_CX) < hx && Math.abs(p.y) < hy
    if (inPrev !== inNow) sum += (inNow ? -1 : 1) * w * p.uy
  }
  ema(meter, 'flux', -sum / Math.max(dtSim, 1e-6), 4)

  // --- pressure taps: stratified Monte-Carlo on top and bottom faces ---
  const mT = 4 + Math.round(controls.n / 45)
  let pSum = 0
  for (const ny of [1, -1]) {
    for (let k = 0; k < mT; k++) {
      const tt = (k + 0.5 + (Math.random() - 0.5) * 0.9) / mT
      const gx = BOX_CX - hx + 2 * hx * tt
      const u = velocityAt(data.sol, gx, ny * hy)
      const dp = 0.5 * (1 - (u.x * u.x + u.y * u.y))
      pSum += -dp * ny * ((2 * hx) / mT)
    }
  }
  ema(meter, 'press', pSum, 2)

  // --- draw ---
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.strokeRect(px(BOX_CX - hx), py(hy), 2 * hx * s, 2 * hy * s)
  const G = 1.5
  for (const g of an.glyphs) {
    ctx.strokeStyle = g.kind === 'flux' ? BLUE : DEEP
    ctx.lineWidth = 1.8
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    ctx.moveTo(px(g.x), py(g.y))
    ctx.lineTo(px(g.x), py(g.y + g.vlen * G))
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  drawFlowParts(ctx, px, py, 0.32)
  drawFoil(ctx, data, px, py)

  const gx0 = W * 0.07
  const gw = W * 0.4
  const fs = data.L * 1.35
  gauge(ctx, gx0, H * 0.78, gw, meter.flux, an.flux, fs, BLUE, 'momentum turnstile (counted)')
  gauge(ctx, gx0, H * 0.9, gw, meter.press, an.press, fs, DEEP, 'pressure taps (sampled)')
  gauge(ctx, W * 0.56, H * 0.84, gw * 0.9, meter.flux + meter.press, data.L, fs, INK, 'sum → L')
}

/** 10: nested surfaces — skin whiskers, then an expanding circle */
const sceneNested: Draw = (ctx, W, H, prog, t, data) => {
  if (!data) return
  const e = Math.max(0, Math.min(1, (prog - 0.42) / 0.5))
  const ee = e * e * (3 - 2 * e)
  const halfW = 0.85 + ee * 2.55
  const R = 0.8 + ee * 1.9
  // fit the growing circle both ways, not just horizontally
  const sFit = Math.min(W / (2 * halfW), ee > 0.02 ? (0.84 * H) / (2 * (R + 0.15)) : Infinity)
  const px = (x: number) => W / 2 + (x - BOX_CX) * sFit
  const py = (y: number) => H / 2 - y * sFit
  // skin pressure whiskers
  const A = 46 * (1 - ee * 0.55)
  for (const p of data.skin) {
    const len = -p.cp * A
    ctx.strokeStyle = p.cp < 0 ? DEEP : BLUE
    ctx.lineWidth = 1.6
    ctx.globalAlpha = 1 - ee * 0.6
    ctx.beginPath()
    ctx.moveTo(px(p.x), py(p.y))
    ctx.lineTo(px(p.x + (p.nx * len) / 300), py(p.y + (p.ny * len) / 300))
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  drawFoil(ctx, data, px, py)
  ctx.font = mono
  if (ee < 0.15) {
    ctx.textAlign = 'center'
    ctx.fillStyle = DEEP
    ctx.fillText('fluid on wing:  +L', W / 2, H * 0.1)
    ctx.fillStyle = BLUE
    ctx.fillText('wing on fluid:  −L', W / 2, H * 0.94)
    ctx.fillStyle = MUTED
    ctx.fillText('no fluid crosses the skin — the ledger is 100% pressure', W / 2, H * 0.18)
    ctx.textAlign = 'left'
  }
  if (ee > 0.02) {
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.8
    ctx.beginPath()
    ctx.arc(px(BOX_CX), py(0), R * sFit, 0, 7)
    ctx.stroke()
    // live whiskers on the circle (scale grows with R so they stay legible)
    const G = 1.2 * R
    for (let k = 0; k < 40; k++) {
      const th = (2 * Math.PI * (k + 0.5)) / 40
      const nx = Math.cos(th)
      const ny = Math.sin(th)
      const gx = BOX_CX + R * nx
      const gy = R * ny
      const u = velocityAt(data.sol, gx, gy)
      const un = u.x * nx + u.y * ny
      const dp = 0.5 * (1 - (u.x * u.x + u.y * u.y))
      ctx.globalAlpha = 0.75 * ee
      ctx.strokeStyle = BLUE
      ctx.beginPath()
      ctx.moveTo(px(gx) - 2, py(gy))
      ctx.lineTo(px(gx) - 2, py(gy + -u.y * un * G))
      ctx.stroke()
      ctx.strokeStyle = DEEP
      ctx.beginPath()
      ctx.moveTo(px(gx) + 2, py(gy))
      ctx.lineTo(px(gx) + 2, py(gy + -dp * ny * G))
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    // interpolate the precomputed split
    const cs = data.circleSplits
    let sp = cs[cs.length - 1]
    for (let i = 1; i < cs.length; i++) {
      if (cs[i].R >= R) {
        const f = (R - cs[i - 1].R) / (cs[i].R - cs[i - 1].R)
        sp = {
          R,
          flux: cs[i - 1].flux + (cs[i].flux - cs[i - 1].flux) * f,
          press: cs[i - 1].press + (cs[i].press - cs[i - 1].press) * f,
        }
        break
      }
    }
    const fluxPc = (100 * sp.flux) / data.L
    const barY = H * 0.93
    const barW = W * 0.56
    const bx = W / 2 - barW / 2
    ctx.globalAlpha = ee
    ctx.fillStyle = DEEP
    ctx.fillRect(bx, barY, barW * (1 - fluxPc / 100), 9)
    ctx.fillStyle = BLUE
    ctx.fillRect(bx + barW * (1 - fluxPc / 100), barY, barW * (fluxPc / 100), 9)
    ctx.fillStyle = MUTED
    ctx.textAlign = 'center'
    ctx.fillText(
      `R = ${R.toFixed(1)}c: pressure ${(100 - fluxPc).toFixed(0)}% · flux ${fluxPc.toFixed(0)}% · total ${((sp.flux + sp.press) / data.L).toFixed(3)} L`,
      W / 2,
      barY - 8,
    )
    ctx.textAlign = 'left'
    ctx.globalAlpha = 1
  }
}

/** 11: d'Alembert control experiment — Kutta off vs on */
const sceneDalembert: Draw = (ctx, W, H, prog, t, data) => {
  if (!data) return
  const kuttaOn = prog > 0.5
  const field = kuttaOn ? data.sol : data.sol0
  const { px, py, s } = foilWorld(W, H, 3.2)
  stepFlow(data, field, kuttaOn ? 'kutta' : 'nokutta', 450)
  drawFlowParts(ctx, px, py, 0.4)
  // budget circle R=2
  ctx.setLineDash([6, 5])
  ctx.strokeStyle = MUTED
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.arc(px(BOX_CX), py(0), 2 * s, 0, 7)
  ctx.stroke()
  ctx.setLineDash([])
  drawFoil(ctx, data, px, py)
  const d = kuttaOn ? data.dal.with : data.dal.without
  ctx.font = mono
  ctx.textAlign = 'center'
  ctx.fillStyle = INK
  ctx.fillText(
    kuttaOn ? 'Kutta condition on — the flow leaves turned' : 'no Kutta condition (Γ = 0) — the flow unbends and leaves unchanged',
    W / 2,
    H * 0.09,
  )
  ctx.fillStyle = kuttaOn ? DEEP : MUTED
  ctx.fillText(
    `cl = ${d.cl.toFixed(3)} · budget on the circle = ${d.total.toFixed(3)} ${kuttaOn ? '= L' : '→ d’Alembert'}`,
    W / 2,
    H * 0.94,
  )
  ctx.textAlign = 'left'
}

/** 12: the shape game — analytic split as the box morphs */
const sceneShapes: Draw = (ctx, W, H, prog) => {
  const u = prog
  const logAspect = 1.6 - 3.2 * u
  const aspect = 10 ** logAspect
  const fluxFrac = (2 / Math.PI) * Math.atan(aspect)
  const half = 0.36 * Math.min(W, H)
  const a = half / Math.sqrt(aspect)
  const b = half * Math.sqrt(aspect)
  const bw = Math.min(W * 0.42, a)
  const bh = Math.min(H * 0.42, b)
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.strokeRect(W / 2 - bw, H / 2 - bh, 2 * bw, 2 * bh)
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.ellipse(W / 2, H / 2, 16, 3.5, 0.08, 0, 7)
  ctx.fill()
  const barY = H * 0.9
  const barW = W * 0.6
  ctx.fillStyle = BLUE
  ctx.fillRect(W / 2 - barW / 2, barY, barW * fluxFrac, 10)
  ctx.fillStyle = DEEP
  ctx.fillRect(W / 2 - barW / 2 + barW * fluxFrac, barY, barW * (1 - fluxFrac), 10)
  ctx.font = mono
  ctx.fillStyle = BLUE
  ctx.fillText(`flux ${(100 * fluxFrac).toFixed(1)}%`, W / 2 - barW / 2, barY - 8)
  ctx.fillStyle = DEEP
  ctx.textAlign = 'right'
  ctx.fillText(`pressure ${(100 * (1 - fluxFrac)).toFixed(1)}%`, W / 2 + barW / 2, barY - 8)
  ctx.textAlign = 'center'
  ctx.fillStyle = INK
  ctx.fillText('total: L, always — (2/π)·atan(b/a)', W / 2, H * 0.08)
  ctx.textAlign = 'left'
}

/** 13: the three ledgers table */
const sceneLedgers: Draw = (ctx, W, H) => {
  const rows = [
    ['momentum CONTENT of the air', '0  (nothing retained)'],
    ['momentum CURRENT through any closed surface', 'L per second, always'],
    ['IMPULSE of the vortex wake (3D)', 'grows at exactly L'],
  ]
  ctx.font = '600 14px ui-monospace, monospace'
  rows.forEach((r, i) => {
    const y = H * 0.3 + i * H * 0.18
    ctx.fillStyle = MUTED
    ctx.fillText(r[0], W * 0.08, y)
    ctx.fillStyle = i === 1 ? DEEP : INK
    ctx.font = '700 17px ui-monospace, monospace'
    ctx.fillText(r[1], W * 0.08, y + 24)
    ctx.font = '600 14px ui-monospace, monospace'
    ctx.strokeStyle = RULE
    ctx.beginPath()
    ctx.moveTo(W * 0.08, y + 40)
    ctx.lineTo(W * 0.92, y + 40)
    ctx.stroke()
  })
}

const SCENES: Draw[] = [
  sceneSolids,
  sceneLedger,
  sceneBook,
  scenePressure,
  sceneCarriers,
  sceneContinuum,
  sceneRTT,
  sceneTurnstile,
  sceneAssemble,
  sceneNested,
  sceneDalembert,
  sceneShapes,
  sceneLedgers,
]

// ---------------------------------------------------------------------------
// the scrollytelling shell
// ---------------------------------------------------------------------------

/** keep wheel-over-slider from changing the value; forward the scroll */
function noWheel(el: HTMLInputElement | null) {
  el?.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault()
      window.scrollBy(0, ev.deltaY)
    },
    { passive: false },
  )
}

export default function MomentumStory() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stepRefs = useRef<(HTMLDivElement | null)[]>([])
  const [active, setActive] = useState(0)
  const activeRef = useRef(0)
  activeRef.current = active
  const [data, setData] = useState<SolData | null>(null)
  const [density, setDensity] = useState(controls.n)
  const [boxScale, setBoxScale] = useState(controls.scale)

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
    let last = 0
    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame)
      frameDt = last ? Math.min((ms - last) / 1000, 0.05) : 0.016
      last = ms
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
      const el = stepRefs.current[idx]
      let prog = 0.5
      if (el) {
        const r = el.getBoundingClientRect()
        const vh = window.innerHeight
        prog = Math.max(0, Math.min(1, (vh * 0.65 - r.top) / (r.height + vh * 0.3)))
      }
      SCENES[idx]?.(ctx, cssW, cssH, prog, ms / 1000, data)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [data])

  return (
    <div className="mt-10">
      {/* sticky visual */}
      <div className="sticky top-[92px] z-10 -mx-5 bg-[var(--paper)] px-5 pb-3 pt-3 sm:-mx-8 sm:px-8">
        <canvas
          ref={canvasRef}
          className="h-[42vh] w-full rounded-[2px] border border-[var(--rule)]"
          role="img"
          aria-label="Animated figure for the current section"
        />
        <div className="mt-2 flex items-center gap-6">
          <p className="data-strip shrink-0">{STEPS[active].kicker}</p>
          {active === ASSEMBLE_IDX && (
            <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-1">
              <label className="flex flex-1 items-center gap-2" style={{ minWidth: 180 }}>
                <span className="data-strip shrink-0">particles {density}</span>
                <input
                  ref={noWheel}
                  type="range"
                  min={100}
                  max={900}
                  step={25}
                  value={density}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setDensity(v)
                    controls.n = v
                  }}
                  className="w-full"
                  style={{ accentColor: 'var(--accent)' }}
                />
              </label>
              <label className="flex flex-1 items-center gap-2" style={{ minWidth: 180 }}>
                <span className="data-strip shrink-0">
                  box {(2.2 * boxScale).toFixed(1)}×{(1.5 * boxScale).toFixed(1)}c
                </span>
                <input
                  ref={noWheel}
                  type="range"
                  min={0.5}
                  max={1.35}
                  step={0.01}
                  value={boxScale}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setBoxScale(v)
                    controls.scale = v
                  }}
                  className="w-full"
                  style={{ accentColor: 'var(--accent)' }}
                />
              </label>
            </div>
          )}
        </div>
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
            {i === ASSEMBLE_IDX && (
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
