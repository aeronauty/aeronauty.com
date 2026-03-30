"use client";

import { useState, useEffect } from "react";
import { X, Trash2 } from "lucide-react";
import type { CalendarEvent, CalendarInfo } from "@/lib/types";

interface Props {
  event?: CalendarEvent | null;
  calendars: CalendarInfo[];
  selectedDate: Date;
  onSave: (data: {
    calendarId: string;
    source: "google" | "apple";
    title: string;
    description?: string;
    start: string;
    end: string;
    allDay: boolean;
    location?: string;
  }) => void;
  onDelete?: (event: CalendarEvent) => void;
  onClose: () => void;
}

export default function EventModal({ event, calendars, selectedDate, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [calendarId, setCalendarId] = useState(event?.calendarId ?? calendars[0]?.id ?? "");
  const [source, setSource] = useState<"google" | "apple">(event?.source ?? calendars[0]?.source ?? "google");

  const pad = (n: number) => String(n).padStart(2, "0");
  const defaultDate = `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}`;

  const [startDate, setStartDate] = useState(
    event?.start?.slice(0, 10) ?? defaultDate
  );
  const [startTime, setStartTime] = useState(
    event?.start?.slice(11, 16) ?? "09:00"
  );
  const [endDate, setEndDate] = useState(
    event?.end?.slice(0, 10) ?? defaultDate
  );
  const [endTime, setEndTime] = useState(
    event?.end?.slice(11, 16) ?? "10:00"
  );

  useEffect(() => {
    const cal = calendars.find((c) => c.id === calendarId);
    if (cal) setSource(cal.source);
  }, [calendarId, calendars]);

  const handleSave = () => {
    if (!title.trim()) return;
    const start = allDay ? startDate : `${startDate}T${startTime}:00`;
    const end = allDay ? endDate : `${endDate}T${endTime}:00`;
    onSave({ calendarId, source, title, description: description || undefined, start, end, allDay, location: location || undefined });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold">{event ? "Edit Event" : "New Event"}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-800 touch-manipulation">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <input
            type="text"
            placeholder="Event title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-gray-800 rounded-xl px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />

          <select
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
            className="w-full bg-gray-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          >
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.source})
              </option>
            ))}
          </select>

          <label className="flex items-center gap-3 touch-manipulation">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="w-5 h-5 rounded"
            />
            <span>All day</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Start</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-gray-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {!allDay && (
              <div>
                <label className="text-sm text-gray-400 mb-1 block">&nbsp;</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-gray-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            <div>
              <label className="text-sm text-gray-400 mb-1 block">End</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-gray-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {!allDay && (
              <div>
                <label className="text-sm text-gray-400 mb-1 block">&nbsp;</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full bg-gray-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          <input
            type="text"
            placeholder="Location (optional)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full bg-gray-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />

          <textarea
            placeholder="Notes (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-gray-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="p-4 border-t border-gray-800 flex items-center gap-3">
          {event && onDelete && (
            <button
              onClick={() => { onDelete(event); onClose(); }}
              className="p-3 rounded-xl hover:bg-red-900/50 touch-manipulation"
            >
              <Trash2 className="w-5 h-5 text-red-400" />
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl hover:bg-gray-800 touch-manipulation"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 font-medium touch-manipulation"
          >
            {event ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
