/**
 * Numerical study: circulation-consistent farfield boundary conditions on a
 * truncated domain — the 2D laboratory version of the AVL/Flow360 coupling
 * idea.
 *
 * Setup: the validated foil (lib/foil, checked against exact Karman-Trefftz
 * solutions) sits inside a circular outer boundary of radius R. The outer
 * boundary carries source panels whose strength is solved so the boundary
 * matches a SPECIFIED exterior state; the foil carries its usual sources +
 * shared vortex strength with tangency + Kutta. No freestream term is added
 * to the interior — all "wind" arrives through the outer boundary, exactly
 * like a CFD farfield.
 *
 * Boundary conditions tested, at each R:
 *   naive-N    u.n = U_inf . n                    (freestream, normal only)
 *   naive-F    (u - U_inf) ~ 0 in least squares    (freestream, full state)
 *   corr(G)-N  u.n = (U_inf + V_vortex(G)) . n     (vortex-corrected, normal)
 *   corr(G)-F  full-state vortex-corrected, least squares
 *
 * The corrected BC defines a fixed-point map G_out = F(G_imposed), which is
 * affine in potential flow: G_out = A + B G_imposed. B is the contraction
 * factor — it answers "is the iteration necessary?" quantitatively.
 *
 * Reference: the unbounded panel solution (same discretisation), so the
 * numbers isolate the TRUNCATION error, not panel discretisation error.
 *
 * Run: npx tsx scripts/farfield-truncation-study.ts
 */

import { makeSection, FoilGeometry, FoilPanel, Vec2 } from '../lib/foil/geometry'
import { solveFoil, panelInfluence } from '../lib/foil/solver'

const ALPHA = (5 * Math.PI) / 180
const SECTION = { camber: 0.02, camberPos: 0.4, thickness: 0.12, alpha: ALPHA, nPanels: 100 }
const CENTRE = { x: 0.25, y: 0 } // outer boundary centred on the quarter chord
const N_OUTER = 128

// ---------- outer-circle panels (normals pointing OUT of the domain) ----------

function circlePanels(R: number): FoilPanel[] {
  const out: FoilPanel[] = []
  for (let k = 0; k < N_OUTER; k++) {
    // counterclockwise loop; for CCW, the right-side normal (ty, -tx) points
    // outward (away from the enclosed domain)
    const t0 = (2 * Math.PI * k) / N_OUTER
    const t1 = (2 * Math.PI * (k + 1)) / N_OUTER
    const ax = CENTRE.x + R * Math.cos(t0)
    const ay = CENTRE.y + R * Math.sin(t0)
    const bx = CENTRE.x + R * Math.cos(t1)
    const by = CENTRE.y + R * Math.sin(t1)
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy)
    const tx = dx / len
    const ty = dy / len
    out.push({ ax, ay, bx, by, mx: (ax + bx) / 2, my: (ay + by) / 2, len, tx, ty, nx: ty, ny: -tx, xc: 0 })
  }
  return out
}

// specified exterior state at a point: freestream + optional point vortex of
// circulation G at the quarter chord (the "AVL knows the circulation" field)
function exteriorState(x: number, y: number, G: number): Vec2 {
  const rx = x - CENTRE.x
  const ry = y - CENTRE.y
  const r2 = rx * rx + ry * ry
  return {
    x: Math.cos(0) * 1 + (G / (2 * Math.PI * r2)) * -ry, // U_inf = (1, 0)
    y: (G / (2 * Math.PI * r2)) * rx,
  }
}

// ---------- dense solvers ----------

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
    if (pmax < 1e-12) throw new Error(`singular at ${k}`)
    if (piv !== k) {
      for (let j = k; j < n; j++) {
        const t = A[k * n + j]
        A[k * n + j] = A[piv * n + j]
        A[piv * n + j] = t
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

/** least squares via normal equations with tiny Tikhonov */
function solveLSQ(A: number[][], b: number[], nUnk: number): Float64Array {
  const AtA = new Float64Array(nUnk * nUnk)
  const Atb = new Float64Array(nUnk)
  for (let r = 0; r < A.length; r++) {
    const row = A[r]
    for (let i = 0; i < nUnk; i++) {
      if (row[i] === 0) continue
      Atb[i] += row[i] * b[r]
      for (let j = i; j < nUnk; j++) AtA[i * nUnk + j] += row[i] * row[j]
    }
  }
  for (let i = 0; i < nUnk; i++) {
    for (let j = 0; j < i; j++) AtA[i * nUnk + j] = AtA[j * nUnk + i]
    AtA[i * nUnk + i] += 1e-12
  }
  return solveDense(AtA, Atb, nUnk)
}

// ---------- the truncated-domain solve ----------

interface TruncResult {
  circulation: number
}

/**
 * Solve the annular domain. bc = 'normal' matches only u.n on the outer
 * circle (square system); bc = 'full' matches both velocity components in
 * least squares (the closest analogue of prescribing the whole state vector,
 * which is what a characteristic freestream BC tries to do).
 */
function solveTruncated(geo: FoilGeometry, R: number, G: number, bc: 'normal' | 'full'): TruncResult {
  const fp = geo.panels
  const op = circlePanels(R)
  const nf = fp.length
  const no = op.length
  const nUnk = nf + no + 1 // sigma_f, sigma_o, gamma (foil vortex)

  const all = [...fp, ...op]
  const rows: number[][] = []
  const rhs: number[] = []

  const velRow = (px: number, py: number, selfIdx: number, selfIsOuter: boolean): { vx: number[]; vy: number[] } => {
    const vx = new Array(nUnk).fill(0)
    const vy = new Array(nUnk).fill(0)
    for (let j = 0; j < nf + no; j++) {
      let usx: number, usy: number, uvx: number, uvy: number
      if (j === selfIdx) {
        const p = all[j]
        // self limit taken from the DOMAIN side: outer side of the foil,
        // inner side of the outer circle
        const s = selfIsOuter ? -0.5 : 0.5
        usx = s * p.nx
        usy = s * p.ny
        uvx = selfIsOuter ? 0.5 * p.tx : -0.5 * p.tx
        uvy = selfIsOuter ? 0.5 * p.ty : -0.5 * p.ty
      } else {
        const e = panelInfluence(all[j], px, py)
        usx = e.usx
        usy = e.usy
        uvx = e.uvx
        uvy = e.uvy
      }
      vx[j] += usx
      vy[j] += usy
      if (j < nf) {
        vx[nf + no] += uvx
        vy[nf + no] += uvy
      }
    }
    return { vx, vy }
  }

  // foil tangency (no freestream: the wind comes from the outer boundary)
  for (let i = 0; i < nf; i++) {
    const p = fp[i]
    const { vx, vy } = velRow(p.mx, p.my, i, false)
    rows.push(vx.map((v, c) => v * p.nx + vy[c] * p.ny))
    rhs.push(0)
  }
  // Kutta
  {
    const first = fp[0]
    const last = fp[nf - 1]
    const r1 = velRow(first.mx, first.my, 0, false)
    const r2 = velRow(last.mx, last.my, nf - 1, false)
    rows.push(r1.vx.map((v, c) => v * first.tx + r1.vy[c] * first.ty + r2.vx[c] * last.tx + r2.vy[c] * last.ty))
    rhs.push(0)
  }
  // outer boundary: match the specified exterior state
  for (let i = 0; i < no; i++) {
    const p = op[i]
    const spec = exteriorState(p.mx, p.my, G)
    const { vx, vy } = velRow(p.mx, p.my, nf + i, true)
    if (bc === 'normal') {
      rows.push(vx.map((v, c) => v * p.nx + vy[c] * p.ny))
      rhs.push(spec.x * p.nx + spec.y * p.ny)
    } else {
      rows.push(vx)
      rhs.push(spec.x)
      rows.push(vy)
      rhs.push(spec.y)
    }
  }

  let sol: Float64Array
  if (bc === 'normal') {
    const n = nUnk
    const A = new Float64Array(n * n)
    const b = new Float64Array(n)
    // square: nf tangency + 1 Kutta + no outer = nf + no + 1 rows
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < n; c++) A[r * n + c] = rows[r][c]
      b[r] = rhs[r]
    }
    try {
      sol = solveDense(A, b, n)
    } catch {
      sol = solveLSQ(rows, rhs, nUnk) // fall back if the Neumann null mode bites
    }
  } else {
    sol = solveLSQ(rows, rhs, nUnk)
  }

  return { circulation: sol[nf + no] * geo.perimeter }
}

// ---------- the study ----------

const geo = makeSection(SECTION)
const ref = solveFoil(geo)
const Gref = ref.circulation
console.log(`reference (unbounded): Gamma = ${Gref.toFixed(5)}  cl = ${ref.clGamma.toFixed(4)}\n`)

const RADII = [2, 3, 5, 10, 20, 50]
const pct = (g: number) => (100 * (g - Gref)) / Gref

interface RowOut {
  R: number
  naiveN: number
  naiveF: number
  B_N: number
  B_F: number
  oneShotF: number
  iterF: number
  itersF: number
}

const table: RowOut[] = []
for (const R of RADII) {
  const naiveN = solveTruncated(geo, R, 0, 'normal').circulation
  const naiveF = solveTruncated(geo, R, 0, 'full').circulation

  // affine map G_out = A + B G_in, measured with two probes
  const probe = (bc: 'normal' | 'full'): { A: number; B: number } => {
    const g1 = solveTruncated(geo, R, Gref, bc).circulation
    const g0 = bc === 'normal' ? naiveN : naiveF
    const B = (g1 - g0) / Gref
    return { A: g0, B }
  }
  const mN = probe('normal')
  const mF = probe('full')

  // one-shot: impose the cheap model's guess (10% low, a realistic AVL miss)
  const oneShotF = solveTruncated(geo, R, 0.9 * Gref, 'full').circulation
  // fixed point of the affine map + iterations to reach 0.1% of Gref from naive
  const fixedF = mF.A / (1 - mF.B)
  let iters = 0
  let g = naiveF
  while (Math.abs(g - fixedF) > 0.001 * Math.abs(Gref) && iters < 50) {
    g = mF.A + mF.B * g
    iters++
  }

  table.push({ R, naiveN: pct(naiveN), naiveF: pct(naiveF), B_N: mN.B, B_F: mF.B, oneShotF: pct(oneShotF), iterF: pct(fixedF), itersF: iters })
}

console.log('R/c | naive dCL% (u.n only) | naive dCL% (full state) | B (normal) | B (full) | one-shot dCL% (0.9G) | iterated dCL% | iters to 0.1%')
for (const r of table) {
  console.log(
    `${String(r.R).padStart(3)} | ${r.naiveN.toFixed(3).padStart(21)} | ${r.naiveF.toFixed(3).padStart(23)} | ${r.B_N.toFixed(4).padStart(10)} | ${r.B_F.toFixed(4).padStart(8)} | ${r.oneShotF.toFixed(3).padStart(20)} | ${r.iterF.toFixed(4).padStart(13)} | ${String(r.itersF).padStart(4)}`,
  )
}

// scaling fits: error ~ C R^p between successive radii
const fit = (vals: number[]) => {
  const ps: number[] = []
  for (let i = 1; i < RADII.length; i++) {
    const e0 = Math.abs(vals[i - 1])
    const e1 = Math.abs(vals[i])
    if (e0 > 1e-9 && e1 > 1e-9) ps.push(Math.log(e1 / e0) / Math.log(RADII[i] / RADII[i - 1]))
  }
  return ps.map((p) => p.toFixed(2)).join(', ')
}
console.log(`\nscaling exponents p in error ~ R^p (successive pairs):`)
console.log(`  naive full-state : ${fit(table.map((t) => t.naiveF))}`)
console.log(`  naive normal-only: ${fit(table.map((t) => t.naiveN))}`)
console.log(`  iterated residual: ${fit(table.map((t) => t.iterF))}`)
console.log(`  contraction B(F) : ${fit(table.map((t) => t.B_F))}`)
