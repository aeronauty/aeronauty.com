"use client";

import { useMemo, useState, useEffect } from "react";
import { Trash2, Recycle, Leaf, Newspaper, Check } from "lucide-react";

// ── Bin type definitions ──────────────────────────────────
type BinCode = "R" | "S" | "B" | "P";

interface CollectionDay {
  date: string; // YYYY-MM-DD
  bins: BinCode[];
}

const BIN_META: Record<BinCode, { label: string; icon: typeof Trash2; colorClass: string; bgClass: string }> = {
  R: { label: "Black bin", icon: Trash2, colorClass: "text-gray-300", bgClass: "bg-gray-600" },
  S: { label: "Yellow bag", icon: Recycle, colorClass: "text-yellow-400", bgClass: "bg-yellow-900/40" },
  B: { label: "Brown bin", icon: Leaf, colorClass: "text-amber-600", bgClass: "bg-amber-900/30" },
  P: { label: "Blue bin", icon: Newspaper, colorClass: "text-blue-400", bgClass: "bg-blue-900/30" },
};

// ── 2026 Bann collection schedule ─────────────────────────
// German holidays that fall on collection Thursdays cause a 1-day postpone:
// - Jan 1 (Thu) → Jan 2 (Fri)
// - May 14 Ascension (Thu) → May 15 (Fri)
const SCHEDULE_2026: CollectionDay[] = [
  { date: "2025-12-25", bins: ["R", "S"] },
  { date: "2026-01-02", bins: ["B", "P"] },
  { date: "2026-01-08", bins: ["R", "S"] },
  { date: "2026-01-15", bins: ["B"] },
  { date: "2026-01-22", bins: ["R", "S"] },
  { date: "2026-01-29", bins: ["B", "P"] },
  { date: "2026-02-05", bins: ["R", "S"] },
  { date: "2026-02-12", bins: ["B"] },
  { date: "2026-02-19", bins: ["R", "S"] },
  { date: "2026-02-26", bins: ["B", "P"] },
  { date: "2026-03-05", bins: ["R", "S"] },
  { date: "2026-03-12", bins: ["B"] },
  { date: "2026-03-19", bins: ["R", "S"] },
  { date: "2026-03-26", bins: ["B", "P"] },
  { date: "2026-04-02", bins: ["R", "S"] },
  { date: "2026-04-09", bins: ["B"] },
  { date: "2026-04-16", bins: ["R", "S"] },
  { date: "2026-04-23", bins: ["B", "P"] },
  { date: "2026-04-30", bins: ["R", "S"] },
  { date: "2026-05-07", bins: ["B"] },
  { date: "2026-05-15", bins: ["R", "S"] },
  { date: "2026-05-21", bins: ["B", "P"] },
  { date: "2026-05-28", bins: ["R", "S"] },
  { date: "2026-06-04", bins: ["B"] },
  { date: "2026-06-11", bins: ["R", "S"] },
  { date: "2026-06-18", bins: ["B", "P"] },
  { date: "2026-06-25", bins: ["R", "S"] },
  { date: "2026-07-02", bins: ["B"] },
  { date: "2026-07-09", bins: ["R", "S"] },
  { date: "2026-07-16", bins: ["B", "P"] },
  { date: "2026-07-23", bins: ["R", "S"] },
  { date: "2026-07-30", bins: ["B"] },
  { date: "2026-08-06", bins: ["R", "S"] },
  { date: "2026-08-13", bins: ["B", "P"] },
  { date: "2026-08-20", bins: ["R", "S"] },
  { date: "2026-08-27", bins: ["B"] },
  { date: "2026-09-03", bins: ["R", "S"] },
  { date: "2026-09-10", bins: ["B", "P"] },
  { date: "2026-09-17", bins: ["R", "S"] },
  { date: "2026-09-24", bins: ["B"] },
  { date: "2026-10-01", bins: ["R", "S"] },
  { date: "2026-10-08", bins: ["B", "P"] },
  { date: "2026-10-15", bins: ["R", "S"] },
  { date: "2026-10-22", bins: ["B"] },
  { date: "2026-10-29", bins: ["R", "S"] },
  { date: "2026-11-05", bins: ["B", "P"] },
  { date: "2026-11-12", bins: ["R", "S"] },
  { date: "2026-11-19", bins: ["B"] },
  { date: "2026-11-26", bins: ["R", "S"] },
  { date: "2026-12-03", bins: ["B", "P"] },
  { date: "2026-12-10", bins: ["R", "S"] },
  { date: "2026-12-17", bins: ["B"] },
  { date: "2026-12-24", bins: ["R", "S"] },
  { date: "2026-12-31", bins: ["B", "P"] },
];

// ── Helpers ───────────────────────────────────────────────
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDate(ds: string): Date {
  const [y, m, d] = ds.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// Key for localStorage dismiss — resets daily
function dismissKey(date: string): string {
  return `bins-dismissed-${date}`;
}

// ── Component ─────────────────────────────────────────────
export default function BinsWidget() {
  const [dismissed, setDismissed] = useState(false);

  const today = useMemo(() => startOfDay(new Date()), []);

  const upcoming = useMemo(() => {
    return SCHEDULE_2026.filter((c) => parseDate(c.date) >= today).slice(0, 6);
  }, [today]);

  const next = upcoming[0] ?? null;
  const nextDate = next ? parseDate(next.date) : null;
  const nextDays = next && nextDate ? daysBetween(today, nextDate) : null;

  // "Put bins out" alert: show on the evening before (nextDays === 1) or on the day (nextDays === 0)
  const isAlertDay = nextDays === 1 || nextDays === 0;

  // Check localStorage for dismiss state
  useEffect(() => {
    if (!next) return;
    const key = dismissKey(next.date);
    setDismissed(localStorage.getItem(key) === "true");
  }, [next]);

  const handleDismiss = () => {
    if (!next) return;
    localStorage.setItem(dismissKey(next.date), "true");
    setDismissed(true);
  };

  if (!next) {
    return (
      <div className="bg-gray-900/80 backdrop-blur-md rounded-2xl p-3 h-full flex items-center justify-center drag-handle cursor-grab">
        <p className="text-gray-500 text-sm">No upcoming collections</p>
      </div>
    );
  }

  // Alert mode: eve of bin day or bin day, not dismissed
  const showAlert = isAlertDay && !dismissed;

  return (
    <div
      className={`backdrop-blur-md rounded-2xl p-3 h-full flex flex-col overflow-hidden transition-colors ${
        showAlert
          ? "bg-amber-900/40 ring-2 ring-amber-500/60 animate-pulse"
          : "bg-gray-900/80"
      }`}
    >
      {/* Alert banner */}
      {showAlert && (
        <button
          onClick={handleDismiss}
          className="flex items-center justify-between gap-2 mb-2 px-2 py-1.5 bg-amber-600/30 rounded-lg text-amber-300 text-xs font-medium touch-manipulation hover:bg-amber-600/50 transition-colors"
        >
          <span>{nextDays === 1 ? "Put bins out tonight!" : "Bins out today!"}</span>
          <Check className="w-4 h-4 flex-shrink-0" />
        </button>
      )}

      {/* Next collection — compact, no separate title */}
      <div className="drag-handle cursor-grab flex items-center justify-between mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {next.bins.map((bin) => {
            const meta = BIN_META[bin];
            const Icon = meta.icon;
            return (
              <div key={bin} className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${meta.bgClass}`}>
                <Icon className={`w-3.5 h-3.5 ${meta.colorClass}`} />
                <span className={`text-xs font-medium ${meta.colorClass}`}>{meta.label}</span>
              </div>
            );
          })}
        </div>
        <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
          {nextDays === 0 ? "Today" : nextDays === 1 ? "Tomorrow" : formatDate(nextDate!)}
        </span>
      </div>

      {/* Upcoming list — scrollable */}
      <div className="flex-1 overflow-y-auto space-y-0.5 scrollbar-thin">
        {upcoming.slice(1).map((collection) => {
          const d = parseDate(collection.date);
          const days = daysBetween(today, d);
          return (
            <div
              key={collection.date}
              className="flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-800/40"
            >
              <span className="text-[11px] text-gray-500 w-16 flex-shrink-0">
                {formatDate(d)}
              </span>
              <div className="flex items-center gap-1.5 flex-1">
                {collection.bins.map((bin) => {
                  const meta = BIN_META[bin];
                  const Icon = meta.icon;
                  return (
                    <Icon key={bin} className={`w-3.5 h-3.5 ${meta.colorClass}`} aria-label={meta.label} />
                  );
                })}
              </div>
              <span className="text-[11px] text-gray-600 flex-shrink-0">
                {days === 1 ? "Tomorrow" : `in ${days}d`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
