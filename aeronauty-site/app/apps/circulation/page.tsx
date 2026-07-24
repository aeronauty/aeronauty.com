import type { Metadata } from 'next'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteNav } from '@/components/SiteNav'
import CirculationLab from './CirculationLab'
import { UransSection } from './UransSection'

export const metadata: Metadata = {
  title: 'The Circulation Machine — Aeronauty',
  description:
    'A from-scratch 2D panel method with camber, thickness and incidence sliders — plus the view nobody shows you: still air, a moving foil, and the permanent drift that IS circulation.',
}

export default function CirculationPage() {
  return (
    <div className="min-h-screen bg-[var(--paper)] text-stone-950">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:px-10">
        <header className="border-b border-stone-300 pb-10">
          <p className="eyebrow">Apps · Potential flow</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight sm:text-6xl">
            The Circulation Machine
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-stone-600">
            A 2D panel code written from scratch for this page — no XFOIL, no ports, no borrowed
            solver — validated against exact conformal-map solutions instead (Kármán–Trefftz
            sections, where the answer is known in closed form). Then it does the thing panel codes
            never get asked to do: sit still with the air and watch the foil fly past. Where a
            borrowed solver does appear for comparison — flexfoil for viscosity, Flow360 for URANS
            — it says so on the tin.
          </p>
        </header>

        <div className="mt-12">
          <CirculationLab />
        </div>

        <UransSection />

        <section className="card mt-10 p-6 sm:p-8">
          <p className="eyebrow">03 · Notes for the sceptical</p>
          <h2 className="mt-3 text-3xl font-semibold">What is actually being solved</h2>
          <div className="mt-4 max-w-3xl space-y-4 leading-7 text-stone-600">
            <p>
              The formulation is the classic one: each surface panel carries a constant-strength
              source, the whole surface carries one shared vortex-sheet strength, and flow tangency
              is enforced at every panel midpoint. That gives N equations for N+1 unknowns — and
              that missing equation is the whole story. The pure circulatory flow adds only{' '}
              <em>tangential</em> velocity at the wall, so the tangency operator literally cannot
              see it: the influence matrix without the Kutta row is rank-deficient by exactly one,
              and its null vector is the circulating mode. The Kutta condition — smooth flow off
              the trailing edge — supplies the one scalar geometry alone cannot.
            </p>
            <p>
              In the second exhibit the frame is changed, not the physics. The air velocity in the
              still-air frame is the same solved field with the freestream subtracted — a Galilean
              transform. To first order the symmetric (thickness) part of the disturbance leaves no
              permanent displacement at all: its potential is single-valued, so the along-path
              velocity integrates to zero. The circulatory part has a multivalued potential, and
              the jump is precisely Γ. Everything the air permanently remembers about the passage
              is the circulation — which is why the measured drag asymmetry between the two probes
              converges on −Γ as the foil departs.
            </p>
            <p>
              Where did the downwash go? Locally it is real: air near the section is deflected
              downward as it passes, and the horizontal material lines bulge to show it. But for a
              steadily translating 2D section the time-integrated vertical velocity at any fixed
              station is exactly zero — the circulatory field&apos;s v is odd in x along the flight
              direction and the thickness field&apos;s v integrates away too, so the bulge always
              closes. &ldquo;The wing throws air down and that is the lift&rdquo; is a statement
              about a control volume, not about what the air keeps: momentum flux through any plane
              is balanced by the pressure field on that plane&apos;s boundary, and in unbounded 2D
              the books close with nothing accumulating anywhere. What the air keeps is the
              horizontal drift asymmetry — the circulation.
            </p>
            <p>
              Lift per unit span is ρU∞ times the circulation — with the counterclockwise-positive
              convention used here, L′ = −ρU∞Γ, which is why a lifting section reads a negative Γ.
              It can be read from the circulation directly (Kutta–Joukowski) or by integrating the
              surface pressures; the two agree to about a percent here, and both are checked
              against the exact solutions in the repo&apos;s validation harness — cl to about a
              part in a thousand on finite-angle trailing edges.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
