"use client";

import { useEffect, useState } from "react";
import { ArrowBigUp } from "lucide-react";

export default function SlopVoteButton({ id, initialVotes }: { id: string; initialVotes: number }) {
  const [votes, setVotes] = useState(initialVotes);
  const [voted, setVoted] = useState(false);
  const [pending, setPending] = useState(false);

  const storageKey = `slop-voted:${id}`;

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey)) setVoted(true);
    } catch {
      // ignore storage being unavailable
    }
  }, [storageKey]);

  async function handleVote() {
    if (voted || pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/slop/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (response.ok) {
        const data = await response.json();
        if (typeof data.votes === "number") setVotes(data.votes);
        setVoted(true);
        try {
          window.localStorage.setItem(storageKey, "1");
        } catch {
          // ignore
        }
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleVote}
      disabled={voted || pending}
      aria-label={voted ? "You voted for this" : "Vote for this entry"}
      className={`flex w-16 shrink-0 flex-col items-center rounded-md border px-2 py-2 transition ${
        voted
          ? "border-[var(--accent)] bg-teal-700/10 text-teal-900"
          : "border-stone-300 bg-white text-stone-700 hover:border-stone-500 hover:text-stone-950"
      } disabled:cursor-not-allowed`}
    >
      <ArrowBigUp className="h-5 w-5" fill={voted ? "currentColor" : "none"} />
      <span className="mt-0.5 text-sm font-bold tabular-nums">{votes}</span>
    </button>
  );
}
