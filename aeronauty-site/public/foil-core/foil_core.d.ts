/* tslint:disable */
/* eslint-disable */

/**
 * Solver output, read from JS via the flat-array getters.
 */
export class SolveOut {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly chord: number;
    readonly circulation: number;
    readonly cl_cp: number;
    readonly cl_gamma: number;
    readonly cm_quarter: number;
    readonly cp: Float64Array;
    readonly gamma: number;
    readonly perimeter: number;
    readonly sigma: Float64Array;
    readonly vt: Float64Array;
}

/**
 * Perturbation-velocity grids for the drift exhibit, as one flat buffer:
 * [outer_u, outer_v, inner_u, inner_v]. Interior-of-foil points stay zero,
 * matching the JS fill.
 */
export function fill_grids(nodes_flat: Float64Array, alpha: number, sigma: Float64Array, gamma: number): Float32Array;

/**
 * Hess-Smith solve on a closed node loop (x0,y0,x1,y1,... with nodes[0] at
 * the TE). With kutta=false the given circulation is imposed instead of the
 * Kutta row. Freestream is (1, 0); incidence is already in the geometry.
 */
export function solve_section(nodes_flat: Float64Array, alpha: number, kutta: boolean, imposed_circulation: number, pivot_x: number, pivot_y: number): SolveOut;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_solveout_free: (a: number, b: number) => void;
    readonly solveout_sigma: (a: number) => [number, number];
    readonly solveout_vt: (a: number) => [number, number];
    readonly solveout_cp: (a: number) => [number, number];
    readonly solveout_gamma: (a: number) => number;
    readonly solveout_circulation: (a: number) => number;
    readonly solveout_cl_gamma: (a: number) => number;
    readonly solveout_cl_cp: (a: number) => number;
    readonly solveout_cm_quarter: (a: number) => number;
    readonly solveout_perimeter: (a: number) => number;
    readonly solveout_chord: (a: number) => number;
    readonly solve_section: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly fill_grids: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
