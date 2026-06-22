import Link from "next/link";
import type { Metadata } from "next";
import SlopSubmitForm from "@/components/SlopSubmitForm";
import { hasPostsStore, listPostsByTag } from "@/lib/posts-store";
import { SLOP_SERIES_TAG } from "@/lib/posts-shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Submit AI slop — Aeronauty",
  description:
    "Spotted shit physics or AI slop in the wild? Drop the link. The worst of it gets a weekly leaderboard and a starring role on YouTube.",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function SlopSubmitPage() {
  const exhibits = hasPostsStore() ? await listPostsByTag(SLOP_SERIES_TAG) : [];

  return (
    <main className="min-h-screen bg-[var(--paper)] text-stone-950">
      <div className="mx-auto w-full max-w-2xl px-6 py-16">
        <div className="mb-10 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-[var(--accent)] hover:text-stone-950">
            Aeronauty
          </Link>
          <div className="flex items-center gap-4 text-sm text-stone-500">
            {exhibits.length > 0 && (
              <a href="#exhibits" className="hover:text-stone-950">
                The exhibits
              </a>
            )}
            <Link href="/slop/leaderboard" className="hover:text-stone-950">
              This week&apos;s leaderboard →
            </Link>
          </div>
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

        {exhibits.length > 0 && (
          <section id="exhibits" className="mt-16 scroll-mt-8 border-t border-stone-200 pt-12">
            <p className="eyebrow">Slop Forensics</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">The exhibits so far</h2>
            <p className="mt-3 text-stone-600">
              The full breakdowns — slop, taken apart piece by piece.
            </p>
            <div className="mt-8 space-y-3">
              <a
                href="/slop/subsidy-clock"
                className="block rounded-md border border-stone-200 bg-white p-5 transition hover:border-stone-400 hover:shadow-[0_18px_50px_rgba(28,25,23,0.08)]"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-semibold tracking-tight">
                    The Subsidy Clock: a small annual number wearing a big cumulative coat
                  </h3>
                  <span className="shrink-0 text-xs font-medium text-[var(--accent)]">Interactive</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  A live counter tots up UK renewable subsidies to make you gasp. Point the same
                  ticking format at fuel duty, Brexit, PFI, water and the Truss budget — and ask what
                  each one actually bought.
                </p>
              </a>
              {exhibits.map((post) => (
                <Link
                  key={post.id}
                  href={`/posts/${post.slug}`}
                  className="block rounded-md border border-stone-200 bg-white p-5 transition hover:border-stone-400 hover:shadow-[0_18px_50px_rgba(28,25,23,0.08)]"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="font-semibold tracking-tight">{post.title}</h3>
                    <span className="shrink-0 text-xs text-stone-400">
                      {formatDate(post.publishedAt)}
                    </span>
                  </div>
                  {post.summary && (
                    <p className="mt-2 text-sm leading-6 text-stone-600">{post.summary}</p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
