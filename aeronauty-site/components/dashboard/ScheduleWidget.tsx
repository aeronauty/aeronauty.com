"use client";

import { useMemo } from "react";
import { useDashboardStore } from "@/lib/dashboard-store";
import EventCard from "./EventCard";
import type { CalendarEvent } from "@/lib/types";

interface Props {
  events: CalendarEvent[];
  selectedDate: Date;
  onEventClick: (event: CalendarEvent) => void;
}

function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number) {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function startOfWeek(d: Date) {
  const result = new Date(d);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  result.setDate(result.getDate() + diff);
  return result;
}

export default function ScheduleWidget({ events, selectedDate, onEventClick }: Props) {
  const view = useDashboardStore((s) => s.scheduleView);
  const setView = useDashboardStore((s) => s.setScheduleView);

  const todayEvents = useMemo(() => {
    const ds = dateStr(selectedDate);
    return events
      .filter((e) => e.start.startsWith(ds))
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [events, selectedDate]);

  const tomorrowEvents = useMemo(() => {
    const ds = dateStr(addDays(selectedDate, 1));
    return events
      .filter((e) => e.start.startsWith(ds))
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [events, selectedDate]);

  const weekEvents = useMemo(() => {
    const weekStart = startOfWeek(selectedDate);
    const days: { date: Date; label: string; events: CalendarEvent[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      const ds = dateStr(day);
      days.push({
        date: day,
        label: day.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
        events: events
          .filter((e) => e.start.startsWith(ds))
          .sort((a, b) => a.start.localeCompare(b.start)),
      });
    }
    return days;
  }, [events, selectedDate]);

  const upcomingEvents = useMemo(() => {
    const ds = dateStr(selectedDate);
    return events
      .filter((e) => e.start > ds && !e.start.startsWith(ds))
      .slice(0, 10);
  }, [events, selectedDate]);

  const tabs = [
    { key: "today" as const, label: "Today" },
    { key: "tomorrow" as const, label: "Tomorrow" },
    { key: "week" as const, label: "This Week" },
  ];

  return (
    <div className="bg-gray-900 rounded-2xl p-4 h-full flex flex-col overflow-hidden">
      {/* Tab bar doubles as drag handle */}
      <div className="flex gap-1 mb-3 bg-gray-800/50 rounded-xl p-1 drag-handle cursor-grab">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`flex-1 text-xs py-1.5 px-2 rounded-lg transition-colors touch-manipulation ${
              view === tab.key
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
        {view === "today" && (
          <>
            {todayEvents.length === 0 && (
              <p className="text-gray-500 text-sm py-4 text-center">No events today</p>
            )}
            {todayEvents.map((event) => (
              <EventCard key={`${event.source}-${event.id}`} event={event} onClick={onEventClick} />
            ))}
            {upcomingEvents.length > 0 && (
              <>
                <div className="text-xs text-gray-500 uppercase tracking-wider pt-3 pb-1">
                  Upcoming
                </div>
                {upcomingEvents.map((event) => (
                  <EventCard
                    key={`${event.source}-${event.id}`}
                    event={event}
                    onClick={onEventClick}
                    compact
                    showDate
                  />
                ))}
              </>
            )}
          </>
        )}

        {view === "tomorrow" && (
          <>
            {tomorrowEvents.length === 0 && (
              <p className="text-gray-500 text-sm py-4 text-center">No events tomorrow</p>
            )}
            {tomorrowEvents.map((event) => (
              <EventCard key={`${event.source}-${event.id}`} event={event} onClick={onEventClick} />
            ))}
          </>
        )}

        {view === "week" && (
          <>
            {weekEvents.map((day) => (
              <div key={day.label}>
                <div className="text-xs text-gray-500 uppercase tracking-wider pt-2 pb-1">
                  {day.label}
                </div>
                {day.events.length === 0 ? (
                  <p className="text-gray-600 text-xs py-1">No events</p>
                ) : (
                  <div className="space-y-1">
                    {day.events.map((event) => (
                      <EventCard
                        key={`${event.source}-${event.id}`}
                        event={event}
                        onClick={onEventClick}
                        compact
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
