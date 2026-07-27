/**
 * Off-surface velocity evaluation for the panel solution: direct summation,
 * streamline tracing, surface stagnation points, and a two-level sampling grid
 * (plus a multipole far field) fast enough to advect thousands of particles.
 *
 * All "perturbation" quantities exclude the freestream, i.e. they are the
 * velocity of the air in the frame where the air at infinity is at rest and
 * the foil translates at (-1, 0).
 */

import { FoilGeometry, insideFoil, Vec2 } from './geometry'
import { FoilSolution, panelInfluence } from './solver'

/** Perturbation velocity (no freestream) at a field point, by direct summation. */
export function perturbationAt(sol: FoilSolution, x: number, y: number): Vec2 {
  const panels = sol.geo.panels
  const sigma = sol.sigma
  const gamma = sol.gamma
  let vx = 0
  let vy = 0
  for (let j = 0; j < panels.length; j++) {
    const e = panelInfluence(panels[j], x, y)
    vx += e.usx * sigma[j] + e.uvx * gamma
    vy += e.usy * sigma[j] + e.uvy * gamma
  }
  return { x: vx, y: vy }
}

/** Total velocity (freestream + perturbation) at a field point. */
export function velocityAt(sol: FoilSolution, x: number, y: number): Vec2 {
  const v = perturbationAt(sol, x, y)
  return { x: v.x + 1, y: v.y }
}

/**
 * Trace a streamline of the total flow with fixed spatial steps (RK4 on the
 * normalised velocity). Stops at domain exit, a stagnation region, step limit,
 * or on entering the foil.
 */
export function traceStreamline(
  sol: FoilSolution,
  seed: Vec2,
  opts: { step?: number; maxSteps?: number; xMax?: number; yMax?: number } = {},
): Vec2[] {
  const h = opts.step ?? 0.008
  const maxSteps = opts.maxSteps ?? 900
  const xMax = opts.xMax ?? 2.6
  const yMax = opts.yMax ?? 1.6
  const pts: Vec2[] = [{ ...seed }]
  let x = seed.x
  let y = seed.y

  const dir = (px: number, py: number): Vec2 | null => {
    const v = velocityAt(sol, px, py)
    const m = Math.hypot(v.x, v.y)
    if (m < 1e-5) return null
    return { x: v.x / m, y: v.y / m }
  }

  for (let s = 0; s < maxSteps; s++) {
    const k1 = dir(x, y)
    if (!k1) break
    const k2 = dir(x + 0.5 * h * k1.x, y + 0.5 * h * k1.y)
    if (!k2) break
    const k3 = dir(x + 0.5 * h * k2.x, y + 0.5 * h * k2.y)
    if (!k3) break
    const k4 = dir(x + h * k3.x, y + h * k3.y)
    if (!k4) break
    x += (h / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x)
    y += (h / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y)
    if (x > xMax || x < -xMax || Math.abs(y) > yMax) break
    if (insideFoil(sol.geo, x, y)) break
    pts.push({ x, y })
  }
  return pts
}

export interface StagnationPoint {
  x: number
  y: number
  /** index of the panel pair where vt changes sign */
  panelIndex: number
}

/**
 * Surface stagnation points: zero crossings of the tangential velocity along
 * the contour, positioned by linear interpolation between control points.
 * The trailing edge itself (crossing between the last and first panels) is
 * excluded — with the Kutta condition on it is the trivial rear crossing.
 */
export function stagnationPoints(sol: FoilSolution): StagnationPoint[] {
  const panels = sol.geo.panels
  const vt = sol.vt
  const n = panels.length
  const out: StagnationPoint[] = []
  for (let i = 0; i < n - 1; i++) {
    const a = vt[i]
    const b = vt[i + 1]
    if (a === 0 || a * b >= 0) continue
    const f = a / (a - b)
    out.push({
      x: panels[i].mx + f * (panels[i + 1].mx - panels[i].mx),
      y: panels[i].my + f * (panels[i + 1].my - panels[i].my),
      panelIndex: i,
    })
  }
  return out
}

export interface VelocityGrid {
  /** outer grid extent and spacing */
  outer: { x0: number; y0: number; nx: number; ny: number; h: number; u: Float32Array; v: Float32Array }
  inner: { x0: number; y0: number; nx: number; ny: number; h: number; u: Float32Array; v: Float32Array }
  /** multipole data for points beyond the outer grid */
  circulation: number
  centre: Vec2
  dipole: Vec2
}

// Mirrored by OUTER/INNER in wasm/foil-core/src/lib.rs — keep in sync.
export const OUTER_SPEC = { x0: -1.6, y0: -1.4, nx: 211, ny: 141, h: 0.02 }
export const INNER_SPEC = { x0: -0.18, y0: -0.3, nx: 281, ny: 121, h: 0.005 }

interface GridSpec {
  x0: number
  y0: number
  nx: number
  ny: number
  h: number
}

function fillRow(sol: FoilSolution, spec: GridSpec, u: Float32Array, v: Float32Array, iy: number): void {
  const y = spec.y0 + iy * spec.h
  for (let ix = 0; ix < spec.nx; ix++) {
    const x = spec.x0 + ix * spec.h
    if (insideFoil(sol.geo, x, y)) {
      // interior values are unphysical; leave zero so blended cells stay tame
      continue
    }
    const p = perturbationAt(sol, x, y)
    const k = iy * spec.nx + ix
    u[k] = p.x
    v[k] = p.y
  }
}

/** Assemble a VelocityGrid from filled arrays (used by both the JS fill and the WASM fill). */
export function gridFromArrays(
  sol: FoilSolution,
  outer: { u: Float32Array; v: Float32Array },
  inner: { u: Float32Array; v: Float32Array },
): VelocityGrid {
  const panels = sol.geo.panels
  let cx = 0
  let cy = 0
  for (const p of panels) {
    cx += p.mx * p.len
    cy += p.my * p.len
  }
  cx /= sol.geo.perimeter
  cy /= sol.geo.perimeter

  let dx = 0
  let dy = 0
  for (let j = 0; j < panels.length; j++) {
    dx += sol.sigma[j] * panels[j].len * (panels[j].mx - cx)
    dy += sol.sigma[j] * panels[j].len * (panels[j].my - cy)
  }

  return {
    outer: { ...OUTER_SPEC, ...outer },
    inner: { ...INNER_SPEC, ...inner },
    circulation: sol.circulation,
    centre: { x: cx, y: cy },
    dipole: { x: dx, y: dy },
  }
}

/**
 * Precompute the perturbation field on a coarse outer grid plus a fine inner
 * grid hugging the foil. Points beyond the outer grid use a multipole
 * expansion: the total circulation as a point vortex at the perimeter
 * centroid (which kills the vortex dipole term) plus the source dipole.
 */
export function buildVelocityGrid(sol: FoilSolution): VelocityGrid {
  const outer = { u: new Float32Array(OUTER_SPEC.nx * OUTER_SPEC.ny), v: new Float32Array(OUTER_SPEC.nx * OUTER_SPEC.ny) }
  const inner = { u: new Float32Array(INNER_SPEC.nx * INNER_SPEC.ny), v: new Float32Array(INNER_SPEC.nx * INNER_SPEC.ny) }
  for (let iy = 0; iy < OUTER_SPEC.ny; iy++) fillRow(sol, OUTER_SPEC, outer.u, outer.v, iy)
  for (let iy = 0; iy < INNER_SPEC.ny; iy++) fillRow(sol, INNER_SPEC, inner.u, inner.v, iy)
  return gridFromArrays(sol, outer, inner)
}

/**
 * Same computation sliced into ~6 ms chunks so a browser can keep animating
 * while the field rebuilds (the whole build is a few hundred ms of kernel
 * evaluations). Returns null if `isCancelled` reports true at a slice
 * boundary — the caller abandons superseded builds that way.
 */
export async function buildVelocityGridAsync(
  sol: FoilSolution,
  isCancelled?: () => boolean,
): Promise<VelocityGrid | null> {
  const outer = { u: new Float32Array(OUTER_SPEC.nx * OUTER_SPEC.ny), v: new Float32Array(OUTER_SPEC.nx * OUTER_SPEC.ny) }
  const inner = { u: new Float32Array(INNER_SPEC.nx * INNER_SPEC.ny), v: new Float32Array(INNER_SPEC.nx * INNER_SPEC.ny) }
  const work: Array<() => void> = []
  for (let iy = 0; iy < OUTER_SPEC.ny; iy++) work.push(() => fillRow(sol, OUTER_SPEC, outer.u, outer.v, iy))
  for (let iy = 0; iy < INNER_SPEC.ny; iy++) work.push(() => fillRow(sol, INNER_SPEC, inner.u, inner.v, iy))

  let sliceStart = performance.now()
  for (const job of work) {
    job()
    if (performance.now() - sliceStart > 6) {
      await new Promise((r) => setTimeout(r, 0))
      if (isCancelled?.()) return null
      sliceStart = performance.now()
    }
  }
  return gridFromArrays(sol, outer, inner)
}

/**
 * Streamline of the total flow traced on the sampled grid (fast enough to
 * retrace on every parameter change). Same seeding and termination rules as
 * traceStreamline, but advanced with a midpoint (RK2) step on bilinear
 * samples — the grid resolution, not the integrator, limits accuracy here.
 */
export function traceStreamlineGrid(
  grid: VelocityGrid,
  geo: FoilGeometry,
  seed: Vec2,
  opts: { step?: number; maxSteps?: number; xMin?: number; xMax?: number; yMax?: number } = {},
): Vec2[] {
  const h = opts.step ?? 0.01
  const maxSteps = opts.maxSteps ?? 700
  const xMin = opts.xMin ?? -2
  const xMax = opts.xMax ?? 2.6
  const yMax = opts.yMax ?? 1.6
  const pts: Vec2[] = [{ ...seed }]
  let x = seed.x
  let y = seed.y
  const v = { x: 0, y: 0 }

  const dir = (px: number, py: number): Vec2 | null => {
    samplePerturbation(grid, px, py, v)
    const vx = v.x + 1
    const vy = v.y
    const m = Math.hypot(vx, vy)
    if (m < 1e-5) return null
    return { x: vx / m, y: vy / m }
  }

  for (let s = 0; s < maxSteps; s++) {
    const k1 = dir(x, y)
    if (!k1) break
    const k2 = dir(x + 0.5 * h * k1.x, y + 0.5 * h * k1.y)
    if (!k2) break
    x += h * k2.x
    y += h * k2.y
    if (x > xMax || x < xMin || Math.abs(y) > yMax) break
    if (insideFoil(geo, x, y)) break
    pts.push({ x, y })
  }
  return pts
}

function bilinear(
  g: { x0: number; y0: number; nx: number; ny: number; h: number; u: Float32Array; v: Float32Array },
  x: number,
  y: number,
  out: Vec2,
): void {
  const fx = (x - g.x0) / g.h
  const fy = (y - g.y0) / g.h
  const ix = Math.min(Math.max(Math.floor(fx), 0), g.nx - 2)
  const iy = Math.min(Math.max(Math.floor(fy), 0), g.ny - 2)
  const tx = fx - ix
  const ty = fy - iy
  const k00 = iy * g.nx + ix
  const k10 = k00 + 1
  const k01 = k00 + g.nx
  const k11 = k01 + 1
  const w00 = (1 - tx) * (1 - ty)
  const w10 = tx * (1 - ty)
  const w01 = (1 - tx) * ty
  const w11 = tx * ty
  out.x = g.u[k00] * w00 + g.u[k10] * w10 + g.u[k01] * w01 + g.u[k11] * w11
  out.y = g.v[k00] * w00 + g.v[k10] * w10 + g.v[k01] * w01 + g.v[k11] * w11
}

/**
 * Sample the perturbation velocity at a point in the FOIL frame. Uses the
 * inner grid, then the outer grid, then the multipole tail. Writes into `out`
 * to avoid allocation in particle loops.
 */
export function samplePerturbation(grid: VelocityGrid, x: number, y: number, out: Vec2): void {
  const inner = grid.inner
  if (
    x >= inner.x0 &&
    x <= inner.x0 + (inner.nx - 1) * inner.h &&
    y >= inner.y0 &&
    y <= inner.y0 + (inner.ny - 1) * inner.h
  ) {
    bilinear(inner, x, y, out)
    return
  }
  const outer = grid.outer
  if (
    x >= outer.x0 &&
    x <= outer.x0 + (outer.nx - 1) * outer.h &&
    y >= outer.y0 &&
    y <= outer.y0 + (outer.ny - 1) * outer.h
  ) {
    bilinear(outer, x, y, out)
    return
  }
  // Multipole tail: point vortex + source dipole. Expanding
  // sum (Q_j/2pi) ln|x - c - delta_j| about the centroid gives
  // phi ~ (S/2pi) ln r  -  (d.r)/(2 pi r^2), so the dipole velocity carries a
  // MINUS sign relative to grad[(d.r)/(2 pi r^2)].
  const rx = x - grid.centre.x
  const ry = y - grid.centre.y
  const r2 = rx * rx + ry * ry
  if (r2 < 1e-12) {
    out.x = 0
    out.y = 0
    return
  }
  const vortex = grid.circulation / (2 * Math.PI * r2)
  const dr = grid.dipole.x * rx + grid.dipole.y * ry
  const inv = 1 / (2 * Math.PI * r2)
  out.x = -vortex * ry - inv * (grid.dipole.x - (2 * dr * rx) / r2)
  out.y = vortex * rx - inv * (grid.dipole.y - (2 * dr * ry) / r2)
}
