'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { makeSection } from '@/lib/foil/geometry'
import { solveFoil, FoilSolution } from '@/lib/foil/solver'
import { buildVelocityGridAsync, VelocityGrid } from '@/lib/foil/field'
import { DesignerCanvas } from './DesignerCanvas'
import { CpPlot } from './CpPlot'
import { DriftCanvas } from './DriftCanvas'

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

  const sol: FoilSolution = useMemo(() => {
    const geo = makeSection({
      camber: params.camberPct / 100,
      camberPos: params.camberPosPct / 100,
      thickness: params.thicknessPct / 100,
      alpha: (params.alphaDeg * Math.PI) / 180,
      nPanels: N_PANELS,
    })
    return solveFoil(geo, kuttaOn ? {} : { kutta: false, circulation: manualCirc })
  }, [params, kuttaOn, manualCirc])

  // The sampled velocity field is the expensive part (a few hundred ms of
  // kernel evaluations), so rebuild it debounced after the sliders settle and
  // in ~6 ms slices so the drift animation keeps running; the Cp plot and
  // readouts track the solve instantly.
  const [gridState, setGridState] = useState<{ grid: VelocityGrid; sol: FoilSolution; version: number } | null>(null)
  const versionRef = useRef(0)
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      const grid = await buildVelocityGridAsync(sol, () => cancelled)
      if (!grid || cancelled) return
      versionRef.current += 1
      setGridState({ grid, sol, version: versionRef.current })
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [sol])

  const stale = gridState === null || gridState.sol !== sol

  const toggleKutta = () => {
    if (kuttaOn) setManualCirc(Number(sol.circulation.toFixed(3)))
    setKuttaOn(!kuttaOn)
  }

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
            <DesignerCanvas sol={sol} gridState={gridState} stale={stale} />
            <p className="data-strip mt-2">
              Streamlines · <span style={{ color: RED_DEEP }}>●</span> stagnation points
            </p>
          </div>
          <div>
            <CpPlot sol={sol} />
            <p className="data-strip mt-2">
              Surface pressure · <span style={{ color: RED_DEEP }}>upper</span> ·{' '}
              <span style={{ color: BLUE }}>lower</span> · negative up
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
          with Γ = 0 and the asymmetry vanishes at incidence. And notice the particles rise and fall
          as the foil passes but keep almost no net vertical shift — in 2D the lasting signature is
          horizontal, and it is exactly Γ/U.
        </p>
      </section>
    </div>
  )
}
