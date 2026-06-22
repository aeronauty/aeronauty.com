"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SlopRoundReset({ liveCount }: { liveCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function startNewRound() {
    if (
      !window.confirm(
        `Start a new round? The ${liveCount} nominee${liveCount === 1 ? "" : "s"} currently on the board will be archived (not deleted) and the board will go empty.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/slop/reset", { method: "POST" });
      if (res.ok) {
        setDone(true);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={startNewRound}
        disabled={busy}
        className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-red-400 hover:text-red-700 disabled:opacity-60"
      >
        {busy ? "Starting…" : "Start a new round"}
      </button>
      <span className="text-sm text-stone-500">
        {done
          ? "New round started — the board is clear."
          : "The board never resets on its own; only this button clears it."}
      </span>
    </div>
  );
}
