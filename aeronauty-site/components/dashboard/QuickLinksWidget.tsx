"use client";

import { ExternalLink } from "lucide-react";

interface QuickLink {
  name: string;
  url: string;
  icon: React.ReactNode;
  color: string;
}

const LINKS: QuickLink[] = [
  {
    name: "Netflix",
    url: "https://www.netflix.com/browse",
    color: "bg-red-600 hover:bg-red-500",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <path d="M5.398 0v.006c3.028 8.556 5.37 15.175 8.348 23.596 2.344.058 4.85.398 4.854.398-2.8-7.924-5.923-16.747-8.487-24h-4.715zm8.489 0v9.63L18.6 22.951c.043.043.105.065.168.065.023 0 .046-.003.068-.01a.172.172 0 0 0 .115-.143V0h-5.064zM5.398 1.05V24c1.873-.225 2.81-.312 4.715-.398v-9.22L5.398 1.05z" />
      </svg>
    ),
  },
  {
    name: "Plex",
    url: "https://app.plex.tv/desktop",
    color: "bg-amber-600 hover:bg-amber-500",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <path d="M11.643 0H4.68l7.679 12L4.68 24h6.963l7.677-12z" />
      </svg>
    ),
  },
  {
    name: "AirPlay",
    url: "#",
    color: "bg-blue-600 hover:bg-blue-500",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
        <polygon points="12 15 17 21 7 21 12 15" />
      </svg>
    ),
  },
  {
    name: "YouTube",
    url: "https://www.youtube.com",
    color: "bg-red-700 hover:bg-red-600",
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
];

export default function QuickLinksWidget() {
  return (
    <div className="h-full bg-gray-900 rounded-2xl p-4 flex flex-col">
      <div className="drag-handle cursor-grab flex items-center gap-2 mb-3">
        <ExternalLink className="w-5 h-5 text-cyan-400" />
        <h2 className="text-sm font-semibold">Quick Links</h2>
      </div>
      <div className="flex-1 grid grid-cols-2 gap-2 content-start">
        {LINKS.map((link) => (
          <a
            key={link.name}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl ${link.color} transition-colors touch-manipulation text-white`}
          >
            {link.icon}
            <span className="text-xs font-medium">{link.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
