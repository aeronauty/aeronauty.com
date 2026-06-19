import Link from "next/link";
import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import SlopVoteButton from "@/components/SlopVoteButton";
import {
  SLOP_CATEGORY_LABELS,
  currentWeekKey,
  hasSlopStore,
  listNominees,
} from "@/lib/slop-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Slop leaderboard — Aeronauty",
  description: "This week's worst physics and AI slop. Vote for the champion.",
};

const RANK_BADGES = ["🥇", "🥈", "🥉"];

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
}

export default async function SlopLeaderboardPage() {
  const weekKey = currentWeekKey();
  const nominees = hasSlopStore() ? await listNominees(weekKey) : [];

  return (
    <main className="min-h-screen bg-[var(--paper)] text-stone-950">
      <div className="mx-auto w-full max-w-2xl px-6 py-16">
        <div className="mb-10 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-[var(--accent)] hover:text-stone-950">
            Aeronauty
          </Link>
          <Link href="/slop" className="text-sm text-stone-500 hover:text-stone-950">
            Submit slop →
          </Link>
        </div>

        <p className="eyebrow">{weekKey} · Slop leaderboard</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          This week&apos;s worst offenders
        </h1>
        <p className="mt-6 text-lg leading-8 text-stone-600">
          Reviewed picks from the pile. Upvote the most egregious — the champion gets its own short.
        </p>

        {nominees.length === 0 ? (
          <div className="mt-10 rounded-md border border-stone-200 bg-white p-8 text-center text-stone-600">
            <p className="font-semibold text-stone-800">Nothing on the board yet this week.</p>
            <p className="mt-2 text-sm leading-6">
              The queue is being reviewed.{" "}
              <Link href="/slop" className="font-semibold text-[var(--accent)] hover:underline">
                Found something?
              </Link>
            </p>
          </div>
        ) : (
          <ol className="mt-10 space-y-4">
            {nominees.map((nominee, index) => (
              <li
                key={nominee.id}
                className="flex gap-4 rounded-md border border-stone-200 bg-white p-5"
              >
                <SlopVoteButton id={nominee.id} initialVotes={nominee.votes} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg" aria-hidden>
                      {RANK_BADGES[index] ?? `#${index + 1}`}
                    </span>
                    <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-stone-600">
                      {SLOP_CATEGORY_LABELS[nominee.category]}
                    </span>
                  </div>
                  <p className="mt-2 leading-7 text-stone-800">{nominee.reason}</p>
                  {(nominee.screenshotUrl || nominee.previewImageUrl) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={nominee.screenshotUrl ?? nominee.previewImageUrl ?? ""}
                      alt=""
                      loading="lazy"
                      className="mt-3 max-h-80 w-full rounded-md border border-stone-200 object-contain"
                    />
                  )}
                  {nominee.previewTitle && (
                    <p className="mt-2 text-sm font-medium text-stone-500">{nominee.previewTitle}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <a
                      href={nominee.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {hostnameOf(nominee.url)}
                    </a>
                    {nominee.credit && (
                      <span className="text-stone-400">spotted by {nominee.credit}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
