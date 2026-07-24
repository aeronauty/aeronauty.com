'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { makeSection } from '@/lib/foil/geometry'
import { solveFoil, FoilSolution } from '@/lib/foil/solver'
import { buildVelocityGridAsync, VelocityGrid } from '@/lib/foil/field'
import {
  loadFoilCore,
  solveSectionWasm,
  buildVelocityGridWasm,
  gridFromWasmBuffer,
  flatNodes,
  FoilCore,
} from '@/lib/foil/wasm'
import { loadViscousLattice, lookupViscous, ViscousLattice } from '@/lib/foil/viscous'
import { DesignerCanvas } from './DesignerCanvas'
import { CpPlot } from './CpPlot'
import { DriftCanvas } from './DriftCanvas'
import { PolarChart } from './PolarChart'

const N_PANELS = 140
export const BLUE = '#1f5f8b'
export const RED = '#d7263d'
export const RED_DEEP = '#a81c2e'

/**
 * Some browsers wheel-adjust an unfocused range input, so a trackpad scroll
 * over a slider silently redesigns the foil. Block the input's default and
 * forward the gesture to the page so scrolling still works everywhere.
 */
export function noWheel(el: HTMLElement | null): void {
  el?.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1
      window.scrollBy(0, e.deltaY * scale)
    },
    { passive: false },
  )
}

interface Params {
  camberPct: number
  camberPosPct: number
  thicknessPct: number
  alphaDeg: number
}

function ControlSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  disabled?: boolean
  onChange: (v: number) => void
}) {
  return (
    <label className={`block ${disabled ? 'opacity-40' : ''}`}>
      <span className="data-strip flex justify-between">
        <span>{label}</span>
        <span className="text-[var(--ink)]">
          {value.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}
          {unit}
        </span>
      </span>
      <input
        ref={noWheel}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full"
        style={{ accentColor: 'var(--accent)' }}
      />
    </label>
  )
}

function Readout({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-[7rem]">
      <div className="data-strip">{label}</div>
      <div
        className="font-mono text-xl font-bold tabular-nums"
        style={{ color: accent ? 'var(--accent-deep)' : 'var(--ink)' }}
      >
        {value}
      </div>
    </div>
  )
}

export default function CirculationLab() {
  const [params, setParams] = useState<Params>({
    camberPct: 4,
    camberPosPct: 40,
    thicknessPct: 12,
    alphaDeg: 6,
  })
  const [kuttaOn, setKuttaOn] = useState(true)
  const [manualCirc, setManualCirc] = useState(0)

  // The Rust core (wasm/foil-core) mirrors the JS math (solve bit-parity;
  // grid fill ~3x faster via fast transcendentals, and off-thread via the
  // worker below); the JS path stays as the no-WASM fallback and the
  // harness's parity reference.
  const [core, setCore] = useState<FoilCore | null>(null)
  useEffect(() => {
    let live = true
    loadFoilCore().then((c) => {
      if (live) setCore(c)
    })
    return () => {
      live = false
    }
  }, [])

  const sol: FoilSolution = useMemo(() => {
    const geo = makeSection({
      camber: params.camberPct / 100,
      camberPos: params.camberPosPct / 100,
      thickness: params.thicknessPct / 100,
      alpha: (params.alphaDeg * Math.PI) / 180,
      nPanels: N_PANELS,
    })
    const opts = kuttaOn ? {} : { kutta: false, circulation: manualCirc }
    return core ? solveSectionWasm(core, geo, opts) : solveFoil(geo, opts)
  }, [params, kuttaOn, manualCirc, core])

  // The sampled velocity field is the expensive part. Preferred path: the
  // WASM fill in a module worker (zero main-thread cost); fallbacks are the
  // main-thread WASM call (~75 ms) and the sliced JS fill. Rebuilds are
  // debounced after the sliders settle; Cp and readouts track the solve
  // instantly.
  const workerRef = useRef<Worker | null>(null)
  const workerBroken = useRef(false)
  const pendingGrid = useRef(new Map<number, (buf: Float32Array | null) => void>())
  const gridReqId = useRef(0)
  useEffect(() => {
    if (typeof Worker === 'undefined') return
    try {
      const w = new Worker(new URL('./gridWorker.ts', import.meta.url), { type: 'module' })
      const flushPending = () => {
        pendingGrid.current.forEach((resolve) => resolve(null))
        pendingGrid.current.clear()
      }
      w.onmessage = (e: MessageEvent) => {
        const { id, buf, error } = e.data as { id: number; buf?: Float32Array; error?: string }
        if (error) workerBroken.current = true
        const resolve = pendingGrid.current.get(id)
        pendingGrid.current.delete(id)
        resolve?.(buf ?? null)
      }
      w.onerror = () => {
        // settle in-flight requests so their callers fall through to the
        // main-thread paths instead of hanging forever
        workerBroken.current = true
        flushPending()
      }
      workerRef.current = w
      return () => {
        w.terminate()
        workerRef.current = null
        flushPending()
      }
    } catch {
      workerBroken.current = true
    }
  }, [])

  const [gridState, setGridState] = useState<{ grid: VelocityGrid; sol: FoilSolution; version: number } | null>(null)
  const versionRef = useRef(0)
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      let grid: VelocityGrid | null = null
      const w = workerRef.current
      try {
        if (w && !workerBroken.current) {
          const buf = await new Promise<Float32Array | null>((resolve) => {
            const id = ++gridReqId.current
            pendingGrid.current.set(id, resolve)
            w.postMessage({ id, nodes: flatNodes(sol.geo), alpha: sol.geo.alpha, sigma: sol.sigma, gamma: sol.gamma })
          })
          if (buf && !cancelled) grid = gridFromWasmBuffer(sol, buf)
        }
        if (!grid && !cancelled && core) grid = buildVelocityGridWasm(core, sol)
      } catch {
        grid = null // any WASM-path failure falls through to the JS fill
      }
      if (!grid && !cancelled) grid = await buildVelocityGridAsync(sol, () => cancelled)
      if (!grid || cancelled) return
      versionRef.current += 1
      setGridState({ grid, sol, version: versionRef.current })
    }, 60)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [sol, core])

  const stale = gridState === null || gridState.sol !== sol

  const toggleKutta = () => {
    if (kuttaOn) setManualCirc(Number(sol.circulation.toFixed(3)))
    setKuttaOn(!kuttaOn)
  }

  // ---- viscous overlay (precomputed flexfoil lattice) ----
  const [viscousOn, setViscousOn] = useState(false)
  const [lattice, setLattice] = useState<ViscousLattice | 'loading' | 'missing' | null>(null)
  const toggleViscous = () => {
    setViscousOn((v) => !v)
    if (lattice === null || lattice === 'missing') {
      setLattice('loading')
      loadViscousLattice().then((l) => setLattice(l ?? 'missing'))
    }
  }
  const viscous = useMemo(() => {
    if (!viscousOn || lattice === null || lattice === 'loading' || lattice === 'missing') return null
    return lookupViscous(lattice, params.camberPct, params.camberPosPct, params.thicknessPct, params.alphaDeg)
  }, [viscousOn, lattice, params])

  // Inviscid lift curve for the polar comparison (cheap: one solve per
  // degree). Built from the SNAPPED lattice cell, not the raw sliders, so the
  // chart always compares the same geometry inviscid-vs-viscous — off-lattice
  // slider settings would otherwise smuggle a camber difference into what the
  // page attributes to the boundary layer.
  const inviscidPolar = useMemo<Array<[number, number]>>(() => {
    if (!viscousOn || !viscous) return []
    const pts: Array<[number, number]> = []
    for (let a = -8; a <= 12; a += 1) {
      const geo = makeSection({
        camber: viscous.camberPct / 100,
        camberPos: viscous.camberPosPct / 100,
        thickness: viscous.thicknessPct / 100,
        alpha: (a * Math.PI) / 180,
        nPanels: 100,
      })
      const s = core ? solveSectionWasm(core, geo) : solveFoil(geo)
      pts.push([a, s.clGamma])
    }
    return pts
  }, [viscousOn, viscous, core])

  const latticeMeta = lattice !== null && lattice !== 'loading' && lattice !== 'missing' ? lattice.meta : null
  const offLattice =
    viscous !== null &&
    (viscous.camberPct !== params.camberPct ||
      viscous.camberPosPct !== params.camberPosPct ||
      viscous.thicknessPct !== params.thicknessPct)

  return (
    <div className="space-y-10">
      {/* ---------------- The section ---------------- */}
      <section className="card p-6 sm:p-8">
        <p className="eyebrow">01 · The panel code</p>
        <h2 className="mt-3 text-3xl font-semibold">Design a section, watch the flow</h2>
        <p className="mt-3 max-w-3xl leading-7 text-stone-600">
          Constant-strength source panels, one shared vortex strength, and a Kutta row — solved
          directly in your browser on every slider tick. Switch the Kutta condition off and the
          tangency equations are perfectly happy with <em>any</em> circulation: drag Γ yourself and
          watch the rear stagnation point wander off the trailing edge.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <DesignerCanvas
              sol={sol}
              gridState={gridState}
              stale={stale}
              transition={viscousOn && viscous?.point ? { xtrU: viscous.point.xtrU, xtrL: viscous.point.xtrL } : null}
            />
            <p className="data-strip mt-2">
              Streamlines · <span style={{ color: RED_DEEP }}>●</span> stagnation points
              {viscousOn && viscous?.point ? ' · small dots = BL transition' : ''}
            </p>
          </div>
          <div>
            <CpPlot sol={sol} overlay={viscousOn && viscous?.cp ? viscous.cp : null} />
            <p className="data-strip mt-2">
              Surface pressure · <span style={{ color: RED_DEEP }}>upper</span> ·{' '}
              <span style={{ color: BLUE }}>lower</span> · negative up
              {viscousOn && viscous?.cp ? ` · dashed = viscous @ α ${viscous.cpAlphaDeg}°` : ''}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <ControlSlider
            label="Camber"
            value={params.camberPct}
            min={0}
            max={8}
            step={0.5}
            unit="%"
            onChange={(v) => setParams((p) => ({ ...p, camberPct: v }))}
          />
          <ControlSlider
            label="Camber position"
            value={params.camberPosPct}
            min={15}
            max={70}
            step={1}
            unit="% c"
            onChange={(v) => setParams((p) => ({ ...p, camberPosPct: v }))}
          />
          <ControlSlider
            label="Thickness"
            value={params.thicknessPct}
            min={4}
            max={24}
            step={0.5}
            unit="%"
            onChange={(v) => setParams((p) => ({ ...p, thicknessPct: v }))}
          />
          <ControlSlider
            label="Incidence α"
            value={params.alphaDeg}
            min={-8}
            max={12}
            step={0.5}
            unit="°"
            onChange={(v) => setParams((p) => ({ ...p, alphaDeg: v }))}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-4 border-t border-[var(--rule)] pt-5">
          <Readout label="cl (Kutta–Joukowski)" value={sol.clGamma.toFixed(3)} accent />
          <Readout label="cl (Cp integration)" value={sol.clCp.toFixed(3)} />
          <Readout label="cm c/4" value={sol.cmQuarter.toFixed(3)} />
          <Readout label="Γ / U∞c" value={sol.circulation.toFixed(3)} />
          <div className="ml-auto flex items-end gap-6">
            <button
              onClick={toggleViscous}
              className={viscousOn ? 'button-primary' : 'button-secondary'}
              aria-pressed={viscousOn}
            >
              Viscous {viscousOn ? 'on' : 'off'}
            </button>
            <button
              onClick={toggleKutta}
              className={kuttaOn ? 'button-primary' : 'button-secondary'}
              aria-pressed={kuttaOn}
            >
              Kutta {kuttaOn ? 'on' : 'off'}
            </button>
            <div className={`w-52 ${kuttaOn ? 'hidden sm:block' : ''}`}>
              <ControlSlider
                label="Imposed Γ"
                value={kuttaOn ? sol.circulation : manualCirc}
                min={-1.8}
                max={0.6}
                step={0.02}
                unit=""
                disabled={kuttaOn}
                onChange={setManualCirc}
              />
            </div>
          </div>
        </div>
        {!kuttaOn && (
          <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-500">
            With the Kutta row removed, the two cl estimates disagree: Kutta–Joukowski reports the
            circulation you imposed, while the Cp integration fights the unresolved singularity at
            the trailing edge. When the flow has to whip around a sharp edge, the discretisation
            tells on you. Set Γ back to the solved value (or switch Kutta on) and they agree again.
          </p>
        )}

        {viscousOn && (
          <div className="mt-6 border-t border-[var(--rule)] pt-5">
            {lattice === 'loading' && <p className="data-strip">loading flexfoil data…</p>}
            {lattice === 'missing' && (
              <p className="data-strip">
                viscous lattice not generated — run scripts/flexfoil-viscous.py and redeploy
              </p>
            )}
            {lattice !== 'loading' && lattice !== 'missing' && lattice !== null && !viscous && (
              <p className="data-strip">no lattice cell matches this section — adjust the sliders toward the lattice ranges</p>
            )}
            {viscous && (
              <>
                {offLattice && (
                  <p className="data-strip mb-4" style={{ color: 'var(--accent-deep)' }}>
                    sliders are off the precomputed lattice — every viscous number, the Cp overlay,
                    the transition dots and BOTH polar curves show the nearest cell:{' '}
                    {viscous.camberPct}% / {viscous.camberPosPct}% c / {viscous.thicknessPct}%
                  </p>
                )}
                <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
                  {viscous.point ? (
                    <>
                      <Readout label="cl viscous" value={viscous.point.cl.toFixed(3)} accent />
                      <Readout label="cd viscous" value={viscous.point.cd.toFixed(5)} />
                      <Readout label="cm c/4 viscous" value={viscous.point.cm.toFixed(3)} />
                      <Readout
                        label="transition upper"
                        value={viscous.point.xtrU >= 0.999 ? 'laminar' : `${(viscous.point.xtrU * 100).toFixed(0)}% c`}
                      />
                      <Readout
                        label="transition lower"
                        value={viscous.point.xtrL >= 0.999 ? 'laminar' : `${(viscous.point.xtrL * 100).toFixed(0)}% c`}
                      />
                    </>
                  ) : (
                    <p className="data-strip">flexfoil did not converge at this α — the polar below shows the converged range</p>
                  )}
                </div>
                <p className="data-strip mt-3">
                  flexfoil · Re {latticeMeta ? latticeMeta.re.toExponential(1).replace('e+', '×10^') : '—'} · ncrit{' '}
                  {latticeMeta ? latticeMeta.ncrit : '—'} · lattice cell {viscous.camberPct}% /{' '}
                  {viscous.camberPosPct}% c / {viscous.thicknessPct}% · α {viscous.alphaDeg.toFixed(1)}°
                </p>
                {latticeMeta && (
                  <div className="mt-5">
                    <PolarChart
                      alphas={latticeMeta.alphas}
                      viscousPolar={viscous.polar}
                      inviscid={inviscidPolar}
                      currentAlpha={params.alphaDeg}
                    />
                  </div>
                )}
                <p className="mt-4 max-w-3xl text-sm leading-6 text-stone-500">
                  The overlay is the lattice cell above run through{' '}
                  <a
                    href="https://pypi.org/project/flexfoil/"
                    className="an-link font-medium"
                    target="_blank"
                    rel="noreferrer"
                  >
                    flexfoil
                  </a>{' '}
                  — the XFOIL-class viscous solver — precomputed and snapped to the nearest cell;
                  both curves in the lift chart use that same cell, so the gap between them is
                  physics, not geometry. The viscous Cp is reconstructed from the boundary-layer
                  edge velocity (1 − ue²). Watch the suction peak get trimmed and the lift curve
                  bend over where the inviscid panel line keeps climbing: that difference is the
                  boundary layer at work.
                </p>
              </>
            )}
          </div>
        )}
      </section>

      {/* ---------------- The other frame ---------------- */}
      <section className="card p-6 sm:p-8">
        <p className="eyebrow">02 · The frame nobody shows you</p>
        <h2 className="mt-3 text-3xl font-semibold">Still air, moving foil</h2>
        <p className="mt-3 max-w-3xl leading-7 text-stone-600">
          Every textbook nails the foil to the page and blows air at it. Here the air starts{' '}
          <em>at rest</em> and the section flies through, using the exact velocity field solved
          above. <span style={{ color: RED_DEEP, fontWeight: 600 }}>Red</span> particles start above the
          flight path, <span style={{ color: BLUE, fontWeight: 600 }}>blue</span> below. Watch what
          each side keeps after the foil has gone: below-path air gets dragged along with the foil,
          above-path air gets shoved the other way. That permanent difference — measured live below
          — <em>is</em> the circulation: U·(Δx<sub>below</sub> − Δx<sub>above</sub>) = Γ.
        </p>

        <div className="mt-6">
          <DriftCanvas gridState={gridState} />
        </div>

        <p className="mt-4 max-w-3xl text-sm leading-6 text-stone-500">
          Things worth trying: set camber and α to zero — thickness alone leaves almost no permanent
          displacement (the loops close again; Darwin drift is second-order small). Switch Kutta off
          with Γ = 0 and the asymmetry vanishes at incidence. And watch the two families of material
          lines: the <em>vertical</em> ones keep their shear forever, while the <em>horizontal</em>{' '}
          ones bulge as the foil passes and snap back flat — the air is deflected down locally, but
          integrated over the whole passage the downwash at any fixed station is exactly zero. The
          net ∫v&thinsp;dt readout tracks it live. Then zoom out to fifty chords, turn on the
          displacement vectors, and crank the gain: every particle moved, and what the whole field
          kept is horizontal shear — the ⟨Δy⟩ readout sits at zero while ⟨Δx⟩ above and below hold
          opposite signs. The lasting signature is horizontal, and it is exactly Γ/U.
        </p>
      </section>
    </div>
  )
}
