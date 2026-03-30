"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { CalendarEvent } from "@/lib/types";

interface Props {
  events: CalendarEvent[];
  onDaySelect: (date: Date) => void;
  selectedDate: Date;
  onCreateEvent: () => void;
}

export default function CalendarWidget({ events, onDaySelect, selectedDate, onCreateEvent }: Props) {
  const [viewMonth, setViewMonth] = useState(
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const firstDow = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const e of events) {
      const key = e.start.slice(0, 10);
      (map[key] ??= []).push(e);
    }
    return map;
  }, [events]);

  const prevMonth = () =>
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  const nextMonth = () =>
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));

  const monthLabel = viewMonth.toLocaleDateString([], { month: "long", year: "numeric" });

  return (
    <div className="bg-gray-900 rounded-2xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          className="p-2 rounded-lg hover:bg-gray-800 active:bg-gray-700 touch-manipulation"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onCreateEvent}
            className="p-2 rounded-lg hover:bg-gray-800 active:bg-gray-700 touch-manipulation"
          >
            <Plus className="w-5 h-5" />
          </button>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg hover:bg-gray-800 active:bg-gray-700 touch-manipulation"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 flex-1">
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateKey = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
          const isToday = dayDate.getTime() === today.getTime();
          const isSelected =
            selectedDate.getFullYear() === dayDate.getFullYear() &&
            selectedDate.getMonth() === dayDate.getMonth() &&
            selectedDate.getDate() === dayDate.getDate();
          const dayEvents = eventsByDate[dateKey] ?? [];

          return (
            <button
              key={day}
              onClick={() => onDaySelect(dayDate)}
              className={`
                relative flex flex-col items-center justify-center rounded-lg py-2 min-h-[44px]
                touch-manipulation transition-colors
                ${isSelected ? "bg-blue-600" : isToday ? "bg-gray-800" : "hover:bg-gray-800/50"}
              `}
            >
              <span className={`text-sm ${isToday && !isSelected ? "text-blue-400 font-bold" : ""}`}>
                {day}
              </span>
              {dayEvents.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {dayEvents.slice(0, 3).map((e, j) => (
                    <div
                      key={j}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: e.color ?? "#3b82f6" }}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
