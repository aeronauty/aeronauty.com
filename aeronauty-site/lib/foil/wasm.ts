/**
 * Loader and thin wrappers for the Rust panel core (wasm/foil-core, built
 * with wasm-pack into public/foil-core). The math is an exact mirror of the
 * TypeScript in solver.ts/field.ts — the harness asserts parity — so the UI
 * can prefer WASM for speed and fall back to JS transparently.
 */

import { FoilGeometry } from './geometry'
import { FoilSolution, SolveOptions } from './solver'
import { VelocityGrid, gridFromArrays, OUTER_SPEC, INNER_SPEC } from './field'

export interface FoilCore {
  solve_section(
    nodes: Float64Array,
    alpha: number,
    kutta: boolean,
    imposedCirculation: number,
    pivotX: number,
    pivotY: number,
  ): {
    sigma: Float64Array
    vt: Float64Array
    cp: Float64Array
    gamma: number
    circulation: number
    cl_gamma: number
    cl_cp: number
    cm_quarter: number
    perimeter: number
    chord: number
    free(): void
  }
  fill_grids(nodes: Float64Array, alpha: number, sigma: Float64Array, gamma: number): Float32Array
}

let corePromise: Promise<FoilCore | null> | null = null

/**
 * Load the WASM core from /foil-core (browser only; resolves null on any
 * failure so callers can stay on the JS path). Idempotent.
 */
export function loadFoilCore(): Promise<FoilCore | null> {
  if (!corePromise) {
    corePromise = (async () => {
      try {
        const base = '/foil-core'
        // template specifier: kept out of the webpack module graph (plus the
        // ignore hint) and out of TS module resolution — it resolves at
        // runtime against public/
        const mod: { default: (opts: { module_or_path: string }) => Promise<unknown> } = await import(
          /* webpackIgnore: true */ `${base}/foil_core.js`
        )
        await mod.default({ module_or_path: `${base}/foil_core_bg.wasm` })
        return mod as unknown as FoilCore
      } catch {
        return null
      }
    })()
  }
  return corePromise
}

function flattenNodes(geo: FoilGeometry): Float64Array {
  const flat = new Float64Array(geo.nodes.length * 2)
  for (let i = 0; i < geo.nodes.length; i++) {
    flat[2 * i] = geo.nodes[i].x
    flat[2 * i + 1] = geo.nodes[i].y
  }
  return flat
}

/** Hess-Smith solve in WASM, wrapped into the same FoilSolution shape as solveFoil. */
export function solveSectionWasm(core: FoilCore, geo: FoilGeometry, opts: SolveOptions = {}): FoilSolution {
  const kutta = opts.kutta !== false
  const out = core.solve_section(
    flattenNodes(geo),
    geo.alpha,
    kutta,
    opts.circulation ?? 0,
    geo.pivot.x,
    geo.pivot.y,
  )
  const sol: FoilSolution = {
    geo,
    sigma: out.sigma,
    gamma: out.gamma,
    circulation: out.circulation,
    vt: out.vt,
    cp: out.cp,
    clGamma: out.cl_gamma,
    clCp: out.cl_cp,
    cmQuarter: out.cm_quarter,
    kutta,
  }
  out.free()
  return sol
}

/** Public nodes flattener (shared with the worker request path). */
export function flatNodes(geo: FoilGeometry): Float64Array {
  return flattenNodes(geo)
}

/** Slice the worker/WASM flat buffer into a VelocityGrid. */
export function gridFromWasmBuffer(sol: FoilSolution, buf: Float32Array): VelocityGrid {
  const oLen = OUTER_SPEC.nx * OUTER_SPEC.ny
  const iLen = INNER_SPEC.nx * INNER_SPEC.ny
  if (buf.length !== 2 * (oLen + iLen)) {
    throw new Error(`foil-core grid layout mismatch: got ${buf.length}, expected ${2 * (oLen + iLen)}`)
  }
  return gridFromArrays(
    sol,
    { u: buf.slice(0, oLen), v: buf.slice(oLen, 2 * oLen) },
    { u: buf.slice(2 * oLen, 2 * oLen + iLen), v: buf.slice(2 * oLen + iLen) },
  )
}

/** Velocity-grid fill in WASM on the main thread (fallback when the worker is unavailable). */
export function buildVelocityGridWasm(core: FoilCore, sol: FoilSolution): VelocityGrid {
  const buf = core.fill_grids(flattenNodes(sol.geo), sol.geo.alpha, sol.sigma as Float64Array, sol.gamma)
  return gridFromWasmBuffer(sol, buf)
}
