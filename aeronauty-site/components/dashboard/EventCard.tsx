"use client";

import { Clock, MapPin } from "lucide-react";
import type { CalendarEvent } from "@/lib/types";

interface Props {
  event: CalendarEvent;
  onClick: (event: CalendarEvent) => void;
  compact?: boolean;
  showDate?: boolean;
}

function formatTime(iso: string) {
  if (iso.length === 10) return "All day";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export default function EventCard({ event, onClick, compact, showDate }: Props) {
  return (
    <button
      onClick={() => onClick(event)}
      className={`w-full text-left p-3 rounded-xl transition-colors touch-manipulation ${
        compact
          ? "bg-gray-800/30 hover:bg-gray-800/50 active:bg-gray-700"
          : "bg-gray-800/50 hover:bg-gray-800 active:bg-gray-700"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-1 self-stretch rounded-full mt-0.5 flex-shrink-0"
          style={{ backgroundColor: event.color ?? "#3b82f6" }}
        />
        <div className="flex-1 min-w-0">
          <div className={`font-medium truncate ${compact ? "text-sm" : ""}`}>
            {event.title}
          </div>
          {showDate ? (
            <div className="text-xs text-gray-500 mt-0.5">
              {formatDate(event.start)} &middot; {formatTime(event.start)}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-400 mt-0.5">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                {formatTime(event.start)}
                {!event.allDay && ` – ${formatTime(event.end)}`}
              </span>
            </div>
          )}
          {event.location && !compact && (
            <div className="flex items-center gap-2 text-sm text-gray-400 mt-0.5">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
        </div>
        {!compact && (
          <span className="text-[10px] text-gray-600 flex-shrink-0 text-right max-w-[80px] truncate">
            {event.calendarName || event.source}
          </span>
        )}
      </div>
    </button>
  );
}
