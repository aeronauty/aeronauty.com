/**
 * Hess & Smith panel method (constant-strength source per panel + one shared
 * vortex-sheet strength), solved directly. Freestream is always (1, 0):
 * incidence is baked into the geometry by rotation, so results are in units of
 * U = 1, chord ~ 1.
 *
 * Kernels are derived from the point source/vortex in panel-local coordinates
 * (X along the panel, Y along the outward normal):
 *
 *   source (strength s per length):
 *     u = s/4pi * ln(R1^2/R2^2)          R1,R2 = distances to the ends
 *     v = s/2pi * (th2 - th1)            th_i = atan2(Y, X - X_i)
 *   vortex (strength g per length) = source field rotated +90 degrees:
 *     u = -g/2pi * (th2 - th1)
 *     v =  g/4pi * ln(R1^2/R2^2)
 *
 * Self-influence limits (control point on the panel's outer face):
 *   source -> v = s/2, u = 0;   vortex -> u = -g/2, v = 0.
 *
 * The tangency system alone is blind to the circulatory mode; the Kutta row
 * (equal-and-opposite tangential velocities on the two panels meeting at the
 * trailing edge) supplies the missing scalar. With kutta: false the caller
 * fixes gamma directly and the system is solved without that row — the
 * "any circulation satisfies tangency" demonstration.
 */

import { FoilGeometry, FoilPanel } from './geometry'

const TWO_PI = 2 * Math.PI
const FOUR_PI = 4 * Math.PI

export interface PanelInfluence {
  /** global-frame velocity per unit source strength */
  usx: number
  usy: number
  /** global-frame velocity per unit vortex strength */
  uvx: number
  uvy: number
}

/** Velocity at (px, py) induced by unit-strength source and vortex sheets on one panel. */
export function panelInfluence(p: FoilPanel, px: number, py: number): PanelInfluence {
  const rx = px - p.ax
  const ry = py - p.ay
  // panel-local coordinates
  const X = rx * p.tx + ry * p.ty
  const Y = rx * p.nx + ry * p.ny
  const L = p.len

  const r1sq = X * X + Y * Y
  const dx2 = X - L
  const r2sq = dx2 * dx2 + Y * Y
  if (r1sq < 1e-20 || r2sq < 1e-20) {
    return { usx: 0, usy: 0, uvx: 0, uvy: 0 }
  }

  const logTerm = Math.log(r1sq / r2sq) / FOUR_PI
  // th2 - th1 in one atan2: tan(th2 - th1) = Y L / (X(X-L) + Y^2), with the
  // quadrant carried by the signs of the two arguments (exact identity)
  const dTheta = Math.atan2(Y * L, X * dx2 + Y * Y)
  const angTerm = dTheta / TWO_PI

  // local components
  const us = logTerm
  const vs = angTerm
  const uv = -angTerm
  const vv = logTerm

  // rotate to global
  return {
    usx: us * p.tx + vs * p.nx,
    usy: us * p.ty + vs * p.ny,
    uvx: uv * p.tx + vv * p.nx,
    uvy: uv * p.ty + vv * p.ny,
  }
}

/** Self-influence of a panel at its own control point, approached from outside. */
function selfInfluence(p: FoilPanel): PanelInfluence {
  return {
    usx: 0.5 * p.nx,
    usy: 0.5 * p.ny,
    uvx: -0.5 * p.tx,
    uvy: -0.5 * p.ty,
  }
}

export interface FoilSolution {
  geo: FoilGeometry
  /** per-panel source strengths */
  sigma: Float64Array
  /** shared vortex-sheet strength (per unit length) */
  gamma: number
  /** total circulation, counterclockwise positive */
  circulation: number
  /** surface tangential velocity at each control point (signed along the panel tangent) */
  vt: Float64Array
  /** surface pressure coefficient at each control point */
  cp: Float64Array
  /** lift coefficient from Kutta–Joukowski */
  clGamma: number
  /** lift coefficient from Cp integration */
  clCp: number
  /** quarter-chord pitching moment coefficient (nose-up positive) */
  cmQuarter: number
  /** whether the Kutta condition was enforced (vs. gamma imposed) */
  kutta: boolean
}

/** Dense Gaussian elimination with partial pivoting. */
function solveDense(A: Float64Array, b: Float64Array, n: number): Float64Array {
  for (let k = 0; k < n; k++) {
    let piv = k
    let pmax = Math.abs(A[k * n + k])
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(A[i * n + k])
      if (v > pmax) {
        pmax = v
        piv = i
      }
    }
    if (pmax < 1e-13) throw new Error(`panel system singular at row ${k}`)
    if (piv !== k) {
      for (let j = k; j < n; j++) {
        const tmp = A[k * n + j]
        A[k * n + j] = A[piv * n + j]
        A[piv * n + j] = tmp
      }
      const tb = b[k]
      b[k] = b[piv]
      b[piv] = tb
    }
    const akk = A[k * n + k]
    for (let i = k + 1; i < n; i++) {
      const f = A[i * n + k] / akk
      if (f === 0) continue
      A[i * n + k] = 0
      for (let j = k + 1; j < n; j++) A[i * n + j] -= f * A[k * n + j]
      b[i] -= f * b[k]
    }
  }
  const x = new Float64Array(n)
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]
    for (let j = i + 1; j < n; j++) s -= A[i * n + j] * x[j]
    x[i] = s / A[i * n + i]
  }
  return x
}

export interface SolveOptions {
  /** enforce the Kutta condition (default true) */
  kutta?: boolean
  /** imposed total circulation (counterclockwise positive) when kutta is false */
  circulation?: number
}

export function solveFoil(geo: FoilGeometry, opts: SolveOptions = {}): FoilSolution {
  const kutta = opts.kutta !== false
  const panels = geo.panels
  const n = panels.length

  // Influence table: velocity of panel j's unit sheets at control point i.
  const inf: PanelInfluence[] = new Array(n * n)
  for (let i = 0; i < n; i++) {
    const pi = panels[i]
    for (let j = 0; j < n; j++) {
      inf[i * n + j] = i === j ? selfInfluence(panels[j]) : panelInfluence(panels[j], pi.mx, pi.my)
    }
  }

  const first = panels[0]
  const last = panels[n - 1]

  let sigma: Float64Array
  let gamma: number

  if (kutta) {
    const dim = n + 1
    const A = new Float64Array(dim * dim)
    const b = new Float64Array(dim)
    for (let i = 0; i < n; i++) {
      const pi = panels[i]
      let vortexNormal = 0
      for (let j = 0; j < n; j++) {
        const e = inf[i * n + j]
        A[i * dim + j] = e.usx * pi.nx + e.usy * pi.ny
        vortexNormal += e.uvx * pi.nx + e.uvy * pi.ny
      }
      A[i * dim + n] = vortexNormal
      b[i] = -pi.nx // -(U . n), U = (1, 0)
    }
    // Kutta row: Vt(first) + Vt(last) = 0 (tangents point in opposite
    // streamwise senses on the two TE panels, so smooth outflow sums to zero).
    let vortexKutta = 0
    for (let j = 0; j < n; j++) {
      const ef = inf[0 * n + j]
      const el = inf[(n - 1) * n + j]
      A[n * dim + j] = ef.usx * first.tx + ef.usy * first.ty + el.usx * last.tx + el.usy * last.ty
      vortexKutta += ef.uvx * first.tx + ef.uvy * first.ty + el.uvx * last.tx + el.uvy * last.ty
    }
    A[n * dim + n] = vortexKutta
    b[n] = -(first.tx + last.tx)

    const x = solveDense(A, b, dim)
    sigma = x.slice(0, n) as Float64Array
    gamma = x[n]
  } else {
    gamma = (opts.circulation ?? 0) / geo.perimeter
    const A = new Float64Array(n * n)
    const b = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const pi = panels[i]
      let vortexNormal = 0
      for (let j = 0; j < n; j++) {
        const e = inf[i * n + j]
        A[i * n + j] = e.usx * pi.nx + e.usy * pi.ny
        vortexNormal += e.uvx * pi.nx + e.uvy * pi.ny
      }
      b[i] = -pi.nx - gamma * vortexNormal
    }
    sigma = solveDense(A, b, n)
  }

  // Surface velocity, Cp, and integrated coefficients.
  const vt = new Float64Array(n)
  const cp = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const pi = panels[i]
    let vx = 1
    let vy = 0
    for (let j = 0; j < n; j++) {
      const e = inf[i * n + j]
      vx += e.usx * sigma[j] + e.uvx * gamma
      vy += e.usy * sigma[j] + e.uvy * gamma
    }
    vt[i] = vx * pi.tx + vy * pi.ty
    cp[i] = 1 - vt[i] * vt[i]
  }

  const circulation = gamma * geo.perimeter
  const c = geo.chord
  const clGamma = (-2 * circulation) / c

  // Force and moment from Cp: dF = -Cp n ds; lift is the +y component
  // (freestream is +x). Moment about the quarter-chord pivot, nose-up positive.
  let fy = 0
  let mz = 0
  const px0 = geo.pivot.x
  const py0 = geo.pivot.y
  for (let i = 0; i < n; i++) {
    const p = panels[i]
    fy += -cp[i] * p.ny * p.len
    mz += -cp[i] * ((p.mx - px0) * p.ny - (p.my - py0) * p.nx) * p.len
  }
  const clCp = fy / c
  const cmQuarter = -mz / (c * c)

  return { geo, sigma, gamma, circulation, vt, cp, clGamma, clCp, cmQuarter, kutta }
}
