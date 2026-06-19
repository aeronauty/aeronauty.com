import Link from "next/link";
import type { Metadata } from "next";
import SlopSubmitForm from "@/components/SlopSubmitForm";

export const metadata: Metadata = {
  title: "Submit AI slop — Aeronauty",
  description:
    "Spotted shit physics or AI slop in the wild? Drop the link. The worst of it gets a weekly leaderboard and a starring role on YouTube.",
};

export default function SlopSubmitPage() {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-stone-950">
      <div className="mx-auto w-full max-w-2xl px-6 py-16">
        <div className="mb-10 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-[var(--accent)] hover:text-stone-950">
            Aeronauty
          </Link>
          <Link href="/slop/leaderboard" className="text-sm text-stone-500 hover:text-stone-950">
            This week&apos;s leaderboard →
          </Link>
        </div>

        <p className="eyebrow">Submit the slop</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          Found some nonsense? Hand it over.
        </h1>
        <p className="mt-6 text-lg leading-8 text-stone-600">
          Shit physics, confidently-wrong engineering, AI-generated drivel dressed up as insight —
          drop the link below. Each week (or whenever I get round to it) the worst of it goes on a
          leaderboard, you vote for the champion, and the winner earns its own short.
        </p>
        <p className="mt-4 text-sm leading-6 text-stone-500">
          Everything is reviewed before it goes public. I go after the claim, not the person — keep
          it to public posts and accounts, not private individuals.
        </p>

        <div className="mt-10">
          <SlopSubmitForm />
        </div>
      </div>
    </main>
  );
}
