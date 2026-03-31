"use client";

import { useCallback, useRef } from "react";

interface QuickLink {
  href: string;
  title: string;
  hoverClass: string;
  icon: React.ReactNode;
}

const LINKS: QuickLink[] = [
  {
    href: "https://www.netflix.com/browse",
    title: "Netflix",
    hoverClass: "hover:bg-red-600/30",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-red-500" fill="currentColor">
        <path d="M5.398 0v.006c3.028 8.556 5.37 15.175 8.348 23.596 2.344.058 4.85.398 4.854.398-2.8-7.924-5.923-16.747-8.487-24h-4.715zm8.489 0v9.63L18.6 22.951c.043.043.105.065.168.065.023 0 .046-.003.068-.01a.172.172 0 0 0 .115-.143V0h-5.064zM5.398 1.05V24c1.873-.225 2.81-.312 4.715-.398v-9.22L5.398 1.05z" />
      </svg>
    ),
  },
  {
    href: "https://app.plex.tv/desktop",
    title: "Plex",
    hoverClass: "hover:bg-amber-600/30",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-amber-500" fill="currentColor">
        <path d="M11.643 0H4.68l7.679 12L4.68 24h6.963l7.677-12z" />
      </svg>
    ),
  },
  {
    href: "https://www.youtube.com",
    title: "YouTube",
    hoverClass: "hover:bg-red-700/30",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-red-600" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
];

// Auto-return timeout: if the external window is still open after this,
// bring focus back to the dashboard. User can re-open it.
const AUTO_RETURN_MS = 10 * 60 * 1000; // 10 minutes

export default function QuickLinks() {
  const openWindowRef = useRef<Window | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const openLink = useCallback((href: string) => {
    // Close any previously opened external window
    if (openWindowRef.current && !openWindowRef.current.closed) {
      openWindowRef.current.close();
    }
    if (timerRef.current) clearTimeout(timerRef.current);

    // Open in a new window (not tab — window can be closed by us)
    const w = window.open(href, "dashboard-external", "noopener");
    openWindowRef.current = w;

    // Auto-close the external window after timeout and refocus dashboard
    timerRef.current = setTimeout(() => {
      if (w && !w.closed) {
        w.close();
      }
      window.focus();
    }, AUTO_RETURN_MS);

    // Also poll: if user closed the window manually, clear the timer
    const poll = setInterval(() => {
      if (!w || w.closed) {
        clearInterval(poll);
        if (timerRef.current) clearTimeout(timerRef.current);
        window.focus();
      }
    }, 2000);

    // Clean up poll after auto-return timeout
    setTimeout(() => clearInterval(poll), AUTO_RETURN_MS + 5000);
  }, []);

  return (
    <div className="hidden sm:flex items-center gap-1 ml-2">
      {LINKS.map((link) => (
        <button
          key={link.href}
          onClick={() => openLink(link.href)}
          className={`p-1.5 rounded-lg touch-manipulation ${link.hoverClass}`}
          title={link.title}
        >
          {link.icon}
        </button>
      ))}
    </div>
  );
}
