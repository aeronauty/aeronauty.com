"use client";

import { useState, useEffect, useCallback } from "react";
import { Newspaper, ExternalLink, Loader2 } from "lucide-react";

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  snippet: string;
}

const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function sourceBadgeColor(source: string): string {
  if (source.startsWith("BBC")) return "bg-red-900/60 text-red-300";
  if (source.startsWith("Sky")) return "bg-blue-900/60 text-blue-300";
  return "bg-gray-800 text-gray-400";
}

export default function NewsWidget() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch("/api/news");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch news:", err);
      // Only show error if we have no existing data
      if (items.length === 0) {
        setError("Unable to load news");
      }
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchNews]);

  return (
    <div className="bg-gray-900/80 backdrop-blur-md rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="drag-handle cursor-grab flex items-center gap-2 mb-3">
        <Newspaper className="w-4 h-4 text-gray-400" />
        <h2 className="text-lg font-semibold">News</h2>
      </div>

      {/* Loading state */}
      {loading && items.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      )}

      {/* Error state */}
      {error && items.length === 0 && !loading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-sm text-center">{error}</p>
        </div>
      )}

      {/* News list */}
      {items.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-1 pr-1 -mr-1 scrollbar-thin">
          {items.map((item, idx) => (
            <a
              key={`${item.link}-${idx}`}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 rounded-xl hover:bg-gray-800/60 active:bg-gray-700/60 transition-colors touch-manipulation group"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {/* Source + time */}
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${sourceBadgeColor(item.source)}`}
                    >
                      {item.source}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      {timeAgo(item.pubDate)}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-medium leading-snug line-clamp-2">
                    {item.title}
                  </h3>

                  {/* Snippet */}
                  {item.snippet && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                      {item.snippet}
                    </p>
                  )}
                </div>

                <ExternalLink className="w-3.5 h-3.5 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
