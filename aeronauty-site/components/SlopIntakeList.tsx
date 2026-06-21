"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { SlopTagChips } from "@/components/SlopTagChips";
import type { SlopIntakeItem } from "@/lib/slop-shared";

export default function SlopIntakeList({ initialItems }: { initialItems: SlopIntakeItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setStatus(id: string, status: "posted" | "dismissed") {
    setBusyId(id);
    try {
      const res = await fetch("/api/slop/intake/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) setItems((current) => current.filter((i) => i.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-stone-200 bg-white p-8 text-center text-stone-600">
        Nothing new from the sweep.
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.id} className="rounded-md border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            {item.priorityAuthor && (
              <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Priority
              </span>
            )}
            {typeof item.severity === "number" && (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-600">
                Severity {item.severity}/5
              </span>
            )}
            <SlopTagChips tags={item.tags} customTags={item.customTags} />
          </div>

          {item.draftHeadline && (
            <h3 className="mt-3 text-lg font-semibold text-stone-900">{item.draftHeadline}</h3>
          )}
          <p className="mt-1 text-sm text-stone-500">
            {item.authorName || "Unknown author"}
            {item.authorHeadline ? ` · ${item.authorHeadline}` : ""}
          </p>

          <blockquote className="mt-3 border-l-2 border-stone-300 pl-3 text-sm italic leading-6 text-stone-700">
            “{item.excerpt}”
          </blockquote>

          {item.whySlop && (
            <p className="mt-2 text-sm leading-6 text-stone-700">
              <span className="font-semibold">Flaw:</span> {item.whySlop}
            </p>
          )}

          {item.screenshotUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.screenshotUrl}
              alt=""
              loading="lazy"
              className="mt-3 max-h-72 w-full rounded-md border border-stone-200 object-contain"
            />
          )}

          {item.draftBody && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-[var(--accent)]">
                Draft takedown
              </summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-md bg-stone-50 p-3 font-sans text-sm leading-6 text-stone-700">
                {item.draftBody}
              </pre>
            </details>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <a
              href={item.postUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 break-all font-medium text-[var(--accent)] hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" /> View on LinkedIn
            </a>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={busyId === item.id}
              onClick={() => setStatus(item.id, "posted")}
              className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-60"
            >
              Mark posted
            </button>
            <button
              type="button"
              disabled={busyId === item.id}
              onClick={() => setStatus(item.id, "dismissed")}
              className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-red-400 hover:text-red-700 disabled:opacity-60"
            >
              Dismiss
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
