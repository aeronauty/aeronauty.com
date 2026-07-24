'use client'

import { useEffect, useMemo, useState } from 'react'
import { makeSection } from '@/lib/foil/geometry'
import { solveFoil } from '@/lib/foil/solver'
import { CpPlot } from './CpPlot'

interface UransCase {
  id: string
  camberPct: number
  camberPosPct: number
  thicknessPct: number
  alphaDeg: number
  re: number
  mach: number
  solver: string
  cl: number
  cd: number
  cm: number | null
  flexfoil: { cl: number; cd: number } | null
  cp: { x: number[]; cp: number[] }
}

/**
 * Renders the Flow360 URANS comparison when public/urans/cases.json exists
 * (see scripts/flow360-urans). Nothing is rendered until real runs land, so
 * the card appears with the data, not before it.
 */
export function UransSection() {
  const [cases, setCases] = useState<UransCase[] | null>(null)

  useEffect(() => {
    fetch('/urans/cases.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setCases(data?.cases ?? null))
      .catch(() => setCases(null))
  }, [])

  if (!cases || cases.length === 0) return null

  return (
    <section className="card mt-10 p-6 sm:p-8">
      <p className="eyebrow">URANS · Flow360</p>
      <h2 className="mt-3 text-3xl font-semibold">The heavy artillery</h2>
      <p className="mt-3 max-w-3xl leading-7 text-stone-600">
        The same sections, run as time-accurate URANS in Flow360 — trillions of floating-point
        operations to check a panel method you can run at 60 frames a second. The panel code&apos;s
        Cp (solid) against the time-averaged URANS surface pressure (dashed).
      </p>
      <div className="mt-6 space-y-10">
        {cases.map((c) => (
          <UransCaseView key={c.id} c={c} />
        ))}
      </div>
    </section>
  )
}

function Num({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[6rem]">
      <div className="data-strip">{label}</div>
      <div className="font-mono text-lg font-bold tabular-nums text-[var(--ink)]">{value}</div>
    </div>
  )
}

function UransCaseView({ c }: { c: UransCase }) {
  const sol = useMemo(
    () =>
      solveFoil(
        makeSection({
          camber: c.camberPct / 100,
          camberPos: c.camberPosPct / 100,
          thickness: c.thicknessPct / 100,
          alpha: (c.alphaDeg * Math.PI) / 180,
          nPanels: 140,
        }),
      ),
    [c],
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <div>
        <h3 className="text-xl font-semibold">
          {c.camberPct}% camber @ {c.camberPosPct}% · {c.thicknessPct}% thick · α ={' '}
          {c.alphaDeg}°
        </h3>
        <p className="data-strip mt-2">
          {c.solver} · Re {c.re.toExponential(0).replace('e+', '×10^')} · M {c.mach}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-4">
          <Num label="cl panel" value={sol.clGamma.toFixed(3)} />
          {c.flexfoil && <Num label="cl flexfoil" value={c.flexfoil.cl.toFixed(3)} />}
          <Num label="cl URANS" value={c.cl.toFixed(3)} />
          {c.flexfoil && <Num label="cd flexfoil" value={c.flexfoil.cd.toFixed(5)} />}
          <Num label="cd URANS" value={c.cd.toFixed(5)} />
          {c.cm !== null && <Num label="cm URANS" value={c.cm.toFixed(3)} />}
        </div>
        <p className="mt-4 max-w-xl text-sm leading-6 text-stone-500">
          The inviscid panel line overshoots — no boundary layer, no decambering — and the gap to
          URANS is the viscosity the cheaper models approximate.
          {c.flexfoil &&
            ' Where flexfoil lands relative to the two is exactly where an integral boundary-layer method should live.'}
        </p>
      </div>
      <div>
        <CpPlot sol={sol} overlay={c.cp} />
        <p className="data-strip mt-2">panel (solid) vs URANS time-averaged (dashed)</p>
      </div>
    </div>
  )
}
