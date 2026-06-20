"use client";

import { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";

/** Wraps an HTML fragment/document into a minimal page so it renders cleanly in an iframe. */
function wrapDoc(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank"><style>html,body{margin:0;padding:0;background:#f7f4ee}</style></head><body>${html}</body></html>`;
}

// Sandboxed: scripts run, but the frame gets an opaque origin (no access to the
// parent page, cookies, or storage). allow-popups lets in-content links open.
const SANDBOX = "allow-scripts allow-popups";

export default function HtmlEmbed({ html, title }: { html: string; title: string }) {
  const [expanded, setExpanded] = useState(false);
  const doc = wrapDoc(html);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [expanded]);

  return (
    <>
      <div className="relative overflow-hidden rounded-md border border-stone-200 bg-[var(--paper)]">
        <iframe
          title={title}
          srcDoc={doc}
          sandbox={SANDBOX}
          loading="lazy"
          className="block h-[460px] w-full border-0"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[var(--paper)] to-transparent" />
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-stone-800"
        >
          <Maximize2 className="h-4 w-4" /> Expand
        </button>
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-stone-900/80 p-2 backdrop-blur-sm sm:p-4"
          onClick={() => setExpanded(false)}
        >
          <div
            className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-lg bg-[var(--paper)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2">
              <span className="truncate text-sm font-semibold text-stone-700">{title}</span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close"
                className="rounded-full p-1.5 text-stone-500 transition hover:bg-stone-200 hover:text-stone-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <iframe
              title={`${title} — expanded`}
              srcDoc={doc}
              sandbox={SANDBOX}
              className="block w-full flex-1 border-0"
            />
          </div>
        </div>
      )}
    </>
  );
}
