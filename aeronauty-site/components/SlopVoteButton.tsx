"use client";

import { useEffect, useState } from "react";
import { ArrowBigUp, ArrowBigDown } from "lucide-react";
import { voteLabelFor, type VoteDirection } from "@/lib/slop-shared";

export default function SlopVoteButton({
  id,
  initialScore,
}: {
  id: string;
  initialScore: number;
}) {
  const [score, setScore] = useState(initialScore);
  const [vote, setVote] = useState<VoteDirection | null>(null);
  const [pending, setPending] = useState(false);
  const labels = voteLabelFor(id);
  const storageKey = `slop-vote:${id}`;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "up" || saved === "down") setVote(saved);
    } catch {
      // storage unavailable — ignore
    }
  }, [storageKey]);

  async function cast(direction: VoteDirection) {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/slop/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, direction }),
      });
      if (response.ok) {
        const data = await response.json();
        if (typeof data.score === "number") setScore(data.score);
        const next: VoteDirection | null =
          data.yourVote === "up" || data.yourVote === "down" ? data.yourVote : null;
        setVote(next);
        try {
          if (next) window.localStorage.setItem(storageKey, next);
          else window.localStorage.removeItem(storageKey);
        } catch {
          // ignore
        }
      }
    } finally {
      setPending(false);
    }
  }

  const arrowBase =
    "flex w-16 shrink-0 flex-col items-center rounded-md border px-2 py-1.5 transition disabled:cursor-not-allowed";

  return (
    <div className="flex shrink-0 flex-col items-stretch gap-1">
      <button
        type="button"
        onClick={() => cast("up")}
        disabled={pending}
        aria-pressed={vote === "up"}
        aria-label={`Upvote: ${labels.up}`}
        className={`${arrowBase} ${
          vote === "up"
            ? "border-[var(--accent)] bg-teal-700/10 text-teal-900"
            : "border-stone-300 bg-white text-stone-600 hover:border-stone-500 hover:text-stone-950"
        }`}
      >
        <ArrowBigUp className="h-4 w-4" fill={vote === "up" ? "currentColor" : "none"} />
        <span className="mt-0.5 text-[10px] font-semibold leading-tight">{labels.up}</span>
      </button>

      <span
        className={`text-center text-sm font-bold tabular-nums ${
          score > 0 ? "text-teal-800" : score < 0 ? "text-stone-400" : "text-stone-500"
        }`}
      >
        {score > 0 ? `+${score}` : score}
      </span>

      <button
        type="button"
        onClick={() => cast("down")}
        disabled={pending}
        aria-pressed={vote === "down"}
        aria-label={`Downvote: ${labels.down}`}
        className={`${arrowBase} ${
          vote === "down"
            ? "border-stone-500 bg-stone-100 text-stone-900"
            : "border-stone-300 bg-white text-stone-600 hover:border-stone-500 hover:text-stone-950"
        }`}
      >
        <ArrowBigDown className="h-4 w-4" fill={vote === "down" ? "currentColor" : "none"} />
        <span className="mt-0.5 text-[10px] font-semibold leading-tight">{labels.down}</span>
      </button>
    </div>
  );
}
