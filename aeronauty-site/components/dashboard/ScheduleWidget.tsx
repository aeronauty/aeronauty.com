"use client";

import { useMemo } from "react";
import { Clock, MapPin } from "lucide-react";
import type { CalendarEvent } from "@/lib/types";

interface Props {
  events: CalendarEvent[];
  selectedDate: Date;
  onEventClick: (event: CalendarEvent) => void;
}

export default function ScheduleWidget({ events, selectedDate, onEventClick }: Props) {
  const dayEvents = useMemo(() => {
    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;
    return events
      .filter((e) => e.start.startsWith(dateStr))
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [events, selectedDate]);

  const upcomingEvents = useMemo(() => {
    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;
    return events
      .filter((e) => e.start > dateStr && !e.start.startsWith(dateStr))
      .slice(0, 10);
  }, [events, selectedDate]);

  const formatTime = (iso: string) => {
    if (iso.length === 10) return "All day";
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  };

  const dateLabel = selectedDate.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="bg-gray-900 rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      <h2 className="text-lg font-semibold mb-3">{dateLabel}</h2>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
        {dayEvents.length === 0 && (
          <p className="text-gray-500 text-sm py-4 text-center">No events today</p>
        )}

        {dayEvents.map((event) => (
          <button
            key={`${event.source}-${event.id}`}
            onClick={() => onEventClick(event)}
            className="w-full text-left p-3 rounded-xl bg-gray-800/50 hover:bg-gray-800 active:bg-gray-700 transition-colors touch-manipulation"
          >
            <div className="flex items-start gap-3">
              <div
                className="w-1 self-stretch rounded-full mt-0.5 flex-shrink-0"
                style={{ backgroundColor: event.color ?? "#3b82f6" }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{event.title}</div>
                <div className="flex items-center gap-2 text-sm text-gray-400 mt-0.5">
                  <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    {formatTime(event.start)}
                    {!event.allDay && ` – ${formatTime(event.end)}`}
                  </span>
                </div>
                {event.location && (
                  <div className="flex items-center gap-2 text-sm text-gray-400 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{event.location}</span>
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-600 uppercase flex-shrink-0">
                {event.source}
              </span>
            </div>
          </button>
        ))}

        {upcomingEvents.length > 0 && (
          <>
            <div className="text-xs text-gray-500 uppercase tracking-wider pt-3 pb-1">
              Upcoming
            </div>
            {upcomingEvents.map((event) => (
              <button
                key={`${event.source}-${event.id}`}
                onClick={() => onEventClick(event)}
                className="w-full text-left p-3 rounded-xl bg-gray-800/30 hover:bg-gray-800/50 active:bg-gray-700 transition-colors touch-manipulation"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-1 self-stretch rounded-full mt-0.5 flex-shrink-0"
                    style={{ backgroundColor: event.color ?? "#3b82f6" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">{event.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {formatDate(event.start)} &middot; {formatTime(event.start)}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
