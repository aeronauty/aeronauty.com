/**
 * Module worker that runs the WASM velocity-grid fill off the main thread.
 * Receives { id, nodes, alpha, sigma, gamma }, replies { id, buf } with the
 * flat [outer_u, outer_v, inner_u, inner_v] Float32Array (buffer transferred),
 * or { id, error } if the core cannot load — the caller then falls back to
 * the main-thread paths.
 */

const ready = (async () => {
  const base = '/foil-core'
  const mod: { default: (opts: { module_or_path: string }) => Promise<unknown>; fill_grids: Function } = await import(
    /* webpackIgnore: true */ `${base}/foil_core.js`
  )
  await mod.default({ module_or_path: `${base}/foil_core_bg.wasm` })
  return mod
})()

const port = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void
  onmessage: ((e: MessageEvent) => void) | null
}

port.onmessage = async (e: MessageEvent) => {
  const { id, nodes, alpha, sigma, gamma } = e.data as {
    id: number
    nodes: Float64Array
    alpha: number
    sigma: Float64Array
    gamma: number
  }
  try {
    const core = await ready
    const buf = core.fill_grids(nodes, alpha, sigma, gamma) as Float32Array
    port.postMessage({ id, buf }, [buf.buffer as ArrayBuffer])
  } catch (err) {
    port.postMessage({ id, error: String(err) })
  }
}

export {}
