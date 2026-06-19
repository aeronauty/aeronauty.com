"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { SLOP_CATEGORY_LABELS, type SlopSubmissionView } from "@/lib/slop-shared";

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
}

export default function SlopModerationList({
  initialItems,
}: {
  initialItems: SlopSubmissionView[];
}) {
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function moderate(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      const response = await fetch("/api/slop/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (response.ok) {
        setItems((current) => current.filter((item) => item.id !== id));
      }
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-stone-200 bg-white p-8 text-center text-stone-600">
        Queue is empty. Nothing waiting for review.
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.id} className="rounded-md border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-stone-600">
              {SLOP_CATEGORY_LABELS[item.category]}
            </span>
            <span className="text-xs text-stone-400">
              {new Date(item.createdAt).toLocaleString()}
            </span>
          </div>
          <p className="mt-2 leading-7 text-stone-800">{item.reason}</p>
          {item.screenshotUrls.length > 0 ? (
            <div
              className={`mt-3 grid gap-2 ${
                item.screenshotUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
              {item.screenshotUrls.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={src}
                  alt=""
                  loading="lazy"
                  className="max-h-80 w-full rounded-md border border-stone-200 object-contain"
                />
              ))}
            </div>
          ) : (
            item.previewImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.previewImageUrl}
                alt=""
                loading="lazy"
                className="mt-3 max-h-80 w-full rounded-md border border-stone-200 object-contain"
              />
            )
          )}
          {(item.previewTitle || item.previewDescription) && (
            <div className="mt-2 rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-500">
              {item.previewTitle && <p className="font-medium text-stone-600">{item.previewTitle}</p>}
              {item.previewDescription && <p className="mt-0.5 line-clamp-3">{item.previewDescription}</p>}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 break-all font-medium text-[var(--accent)] hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              {hostnameOf(item.url)}
            </a>
            {item.credit && <span className="text-stone-400">by {item.credit}</span>}
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={busyId === item.id}
              onClick={() => moderate(item.id, "approve")}
              className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Approve → leaderboard
            </button>
            <button
              type="button"
              disabled={busyId === item.id}
              onClick={() => moderate(item.id, "reject")}
              className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-red-400 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reject
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
