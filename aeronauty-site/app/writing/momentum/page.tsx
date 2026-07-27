import type { Metadata } from 'next'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteNav } from '@/components/SiteNav'
import MomentumStory from './MomentumStory'

export const metadata: Metadata = {
  title: 'Newton, for Fluids — Aeronauty',
  description:
    'A scrollytelling derivation of the momentum equation: what momentum actually is, the Reynolds transport theorem, and why every box you draw around a wing reports the same lift.',
}

export default function MomentumPage() {
  return (
    <div className="min-h-screen bg-[var(--paper)] text-stone-950">
      <SiteNav />
      <main className="mx-auto max-w-5xl px-5 py-16 sm:px-8">
        <header className="border-b border-stone-300 pb-10">
          <p className="eyebrow">Writing · Fluid mechanics</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight sm:text-6xl">
            Newton, for fluids
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-stone-600">
            F = ma is a law about <em>things</em>. A fluid is not a thing — it is a crowd. This is
            the story of how Newton&rsquo;s second law is rebuilt for crowds: what momentum actually
            is, how it moves, what the Reynolds transport theorem does, and why every closed surface
            you draw around a wing — skin, box, or planet — reports exactly the same force. Every
            number in the animations comes from the same validated panel code that runs{' '}
            <a href="/apps/circulation" className="an-link font-medium">
              the Circulation Machine
            </a>
            .
          </p>
        </header>
        <MomentumStory />
      </main>
      <SiteFooter />
    </div>
  )
}
