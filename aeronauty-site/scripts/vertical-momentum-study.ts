/**
 * Vertical-momentum bookkeeping for lifting vortex systems, computed with the
 * validated panel code (2D) and a horseshoe vortex (3D).
 *
 * The claims under numerical test (the Smyth debate):
 *   A. Every closed control surface around the foil recovers the full lift
 *      L = rho U |Gamma| from the sum of vertical momentum FLUX and boundary
 *      PRESSURE — the total is shape-independent (validation of the method).
 *   B. The SPLIT between flux and pressure depends on the control-surface
 *      shape, sliding between ~0 and ~100% — so "the net vertical momentum
 *      change in the flow" has no shape-independent meaning. Only the sum is
 *      physical (Karman–Burgers conditional convergence, in numbers).
 *   C. Same story in 3D for a horseshoe vortex on a big sphere and on
 *      elongated boxes.
 *
 * rho = 1, U = 1 throughout. 2D pressure from Bernoulli:
 * p - p_inf = (1 - |u|^2)/2.
 *
 * Run: npx tsx scripts/vertical-momentum-study.ts
 */

import { makeSection } from '../lib/foil/geometry'
import { solveFoil } from '../lib/foil/solver'
import { velocityAt } from '../lib/foil/field'

const ALPHA = (5 * Math.PI) / 180
const geo = makeSection({ camber: 0.02, camberPos: 0.4, thickness: 0.12, alpha: ALPHA, nPanels: 120 })
const sol = solveFoil(geo)
const L_ref = -sol.circulation // rho U |Gamma|, positive up
console.log(`2D reference: Gamma = ${sol.circulation.toFixed(5)}, L = rho U |Gamma| = ${L_ref.toFixed(5)}\n`)

// ---------- 2D control-surface budget ----------

interface Split {
  flux: number
  press: number
}

/** integrate -[ rho v (u.n) + (p - p_inf) n_y ] over a closed contour */
function budget2D(points: Array<{ x: number; y: number; nx: number; ny: number; w: number }>): Split {
  let flux = 0
  let press = 0
  for (const q of points) {
    const u = velocityAt(sol, q.x, q.y)
    const un = u.x * q.nx + u.y * q.ny
    const dp = 0.5 * (1 - (u.x * u.x + u.y * u.y))
    flux += -u.y * un * q.w
    press += -dp * q.ny * q.w
  }
  return { flux, press }
}

function circleContour(R: number, M = 3000) {
  const pts = []
  for (let k = 0; k < M; k++) {
    const t = (2 * Math.PI * (k + 0.5)) / M
    pts.push({ x: 0.25 + R * Math.cos(t), y: R * Math.sin(t), nx: Math.cos(t), ny: Math.sin(t), w: (2 * Math.PI * R) / M })
  }
  return pts
}

function boxContour(hx: number, hy: number, M = 1500) {
  // rectangle centred on the quarter chord, half-width hx, half-height hy
  const pts: Array<{ x: number; y: number; nx: number; ny: number; w: number }> = []
  const side = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0)
    for (let k = 0; k < M; k++) {
      const t = (k + 0.5) / M
      pts.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, nx, ny, w: len / M })
    }
  }
  side(0.25 + hx, -hy, 0.25 + hx, hy, 1, 0) // right
  side(0.25 - hx, hy, 0.25 - hx, -hy, -1, 0) // left
  side(0.25 - hx, -hy, 0.25 + hx, -hy, 0, -1) // bottom
  side(0.25 + hx, hy, 0.25 - hx, hy, 0, 1) // top
  return pts
}

console.log('2D: vertical-force budget vs control-surface shape (percent of L)')
console.log('shape                      | flux %  | pressure % | total/L')
const show = (name: string, s: Split) => {
  console.log(
    `${name.padEnd(26)} | ${((100 * s.flux) / L_ref).toFixed(1).padStart(6)} | ${((100 * s.press) / L_ref).toFixed(1).padStart(9)} | ${((s.flux + s.press) / L_ref).toFixed(4).padStart(7)}`,
  )
}
show('circle R=2', budget2D(circleContour(2)))
show('circle R=10', budget2D(circleContour(10)))
show('circle R=40', budget2D(circleContour(40)))
show('square 10x10', budget2D(boxContour(10, 10)))
show('tall box 3 x 60', budget2D(boxContour(3, 60)))
show('wide box 60 x 3', budget2D(boxContour(60, 3)))
show('very tall 2 x 200', budget2D(boxContour(2, 200)))
show('very wide 200 x 2', budget2D(boxContour(200, 2)))

// ---------- 2D: what the two vertical planes alone carry ----------

function planeFlux(x: number, H: number, M = 6000): number {
  // vertical momentum flux (rho v u) through the vertical line at x, |y|<=H,
  // signed as transport OUT of the region to the LEFT of the plane
  let f = 0
  for (let k = 0; k < M; k++) {
    const y = -H + ((k + 0.5) / M) * 2 * H
    const u = velocityAt(sol, x, y)
    f += u.y * u.x * ((2 * H) / M)
  }
  return f
}
console.log('\n2D: rho∫v·u dy through single vertical planes (percent of L), H = ±60')
for (const x of [-20, -3, 3, 20]) {
  console.log(`  plane at x = ${String(x).padStart(3)}:  ${((100 * planeFlux(x, 60)) / L_ref).toFixed(1)} %`)
}

// ---------- 3D horseshoe on a sphere and boxes ----------

// horseshoe: bound segment at x=0 from y=-b/2..b/2 at z=0, trailers to x=+far
const B_SPAN = 1
const GAMMA3 = 1
const FAR = 4000

function seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number, px: number, py: number, pz: number, out: number[]) {
  const r1x = px - ax
  const r1y = py - ay
  const r1z = pz - az
  const r2x = px - bx
  const r2y = py - by
  const r2z = pz - bz
  const cx = r1y * r2z - r1z * r2y
  const cy = r1z * r2x - r1x * r2z
  const cz = r1x * r2y - r1y * r2x
  const m1 = Math.hypot(r1x, r1y, r1z)
  const m2 = Math.hypot(r2x, r2y, r2z)
  const den = m1 * m2 * (m1 * m2 + r1x * r2x + r1y * r2y + r1z * r2z)
  if (Math.abs(den) < 1e-14) return
  const f = (GAMMA3 * (m1 + m2)) / (4 * Math.PI * den)
  out[0] += f * cx
  out[1] += f * cy
  out[2] += f * cz
}

function horseshoeVel(px: number, py: number, pz: number): number[] {
  const v = [0, 0, 0]
  seg(FAR, -B_SPAN / 2, 0, 0, -B_SPAN / 2, 0, px, py, pz, v)
  seg(0, -B_SPAN / 2, 0, 0, B_SPAN / 2, 0, px, py, pz, v)
  seg(0, B_SPAN / 2, 0, FAR, B_SPAN / 2, 0, px, py, pz, v)
  // sign: lift up for U = +x means downwash between the trailers
  return v
}
{
  const test = horseshoeVel(0, 0, 0.01)
  if (test[2] > 0) console.log('\n(3D sign check failed — flip GAMMA3)')
}
const L3 = GAMMA3 * B_SPAN // rho U Gamma b

function sphereBudget(R: number, n = 220): Split {
  let flux = 0
  let press = 0
  for (let i = 0; i < n; i++) {
    const th = (Math.PI * (i + 0.5)) / n // polar from +z
    for (let j = 0; j < 2 * n; j++) {
      const ph = (2 * Math.PI * (j + 0.5)) / (2 * n)
      const nx = Math.sin(th) * Math.cos(ph)
      const ny = Math.sin(th) * Math.sin(ph)
      const nz = Math.cos(th)
      const dA = R * R * Math.sin(th) * (Math.PI / n) * (Math.PI / n)
      const p = horseshoeVel(R * nx, R * ny, R * nz)
      const ux = 1 + p[0]
      const uy = p[1]
      const uz = p[2]
      const un = ux * nx + uy * ny + uz * nz
      const dp = 0.5 * (1 - (ux * ux + uy * uy + uz * uz))
      flux += -uz * un * dA
      press += -dp * nz * dA
    }
  }
  return { flux, press }
}

function boxBudget3(hx: number, hy: number, hz: number, n = 160): Split {
  let flux = 0
  let press = 0
  const face = (fixAxis: 'x' | 'y' | 'z', sign: number) => {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 0, dA = 0
        const a = -1 + (2 * (i + 0.5)) / n
        const b = -1 + (2 * (j + 0.5)) / n
        if (fixAxis === 'x') {
          px = sign * hx; py = a * hy; pz = b * hz; nx = sign; dA = (2 * hy * 2 * hz) / (n * n)
        } else if (fixAxis === 'y') {
          py = sign * hy; px = a * hx; pz = b * hz; ny = sign; dA = (2 * hx * 2 * hz) / (n * n)
        } else {
          pz = sign * hz; px = a * hx; py = b * hy; nz = sign; dA = (2 * hx * 2 * hy) / (n * n)
        }
        const p = horseshoeVel(px, py, pz)
        const ux = 1 + p[0]
        const uy = p[1]
        const uz = p[2]
        const un = ux * nx + uy * ny + uz * nz
        const dp = 0.5 * (1 - (ux * ux + uy * uy + uz * uz))
        flux += -uz * un * dA
        press += -dp * nz * dA
      }
    }
  }
  for (const s of [1, -1] as const) {
    face('x', s)
    face('y', s)
    face('z', s)
  }
  return { flux, press }
}

console.log(`\n3D horseshoe (b = 1, Gamma = 1, L = ${L3}): vertical-force budget (percent of L)`)
console.log('surface                    | flux %  | pressure % | total/L')
const show3 = (name: string, s: Split) => {
  console.log(
    `${name.padEnd(26)} | ${((100 * s.flux) / L3).toFixed(1).padStart(6)} | ${((100 * s.press) / L3).toFixed(1).padStart(9)} | ${((s.flux + s.press) / L3).toFixed(4).padStart(7)}`,
  )
}
show3('sphere R=5b', sphereBudget(5))
show3('sphere R=20b', sphereBudget(20))
show3('sphere R=60b', sphereBudget(60))
show3('cube 10x10x10', boxBudget3(10, 10, 10))
show3('tall box 5x5x50', boxBudget3(5, 5, 50))
show3('flat box 50x50x3', boxBudget3(50, 50, 3))
