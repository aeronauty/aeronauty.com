"use client";

import { useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { Settings, RefreshCw, LogOut } from "lucide-react";
import Link from "next/link";
import ClockWidget from "@/components/dashboard/ClockWidget";
import CalendarWidget from "@/components/dashboard/CalendarWidget";
import ScheduleWidget from "@/components/dashboard/ScheduleWidget";
import RemindersWidget from "@/components/dashboard/RemindersWidget";
import EventModal from "@/components/dashboard/EventModal";
import { useCalendarData, useReminders } from "@/components/dashboard/useCalendarData";
import type { CalendarEvent } from "@/lib/types";

export default function DashboardPage() {
  const { data: session } = useSession();
  const { events, calendars, loading, refresh: refreshCalendar } = useCalendarData();
  const {
    lists,
    loading: remindersLoading,
    refresh: refreshReminders,
    completeReminder,
    addReminder,
    deleteReminder,
  } = useReminders();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshCalendar(), refreshReminders()]);
    setRefreshing(false);
  }, [refreshCalendar, refreshReminders]);

  const handleCreateEvent = async (data: {
    calendarId: string;
    source: "google" | "apple";
    title: string;
    description?: string;
    start: string;
    end: string;
    allDay: boolean;
    location?: string;
  }) => {
    try {
      if (editingEvent) {
        await fetch("/api/calendars", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, eventId: editingEvent.id }),
        });
      } else {
        await fetch("/api/calendars", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      }
      refreshCalendar();
    } catch (err) {
      console.error("Event save error:", err);
    }
  };

  const handleDeleteEvent = async (event: CalendarEvent) => {
    try {
      await fetch(
        `/api/calendars?calendarId=${encodeURIComponent(event.calendarId)}&eventId=${encodeURIComponent(event.id)}&source=${event.source}`,
        { method: "DELETE" }
      );
      refreshCalendar();
    } catch (err) {
      console.error("Event delete error:", err);
    }
  };

  const handleEventClick = (event: CalendarEvent) => {
    setEditingEvent(event);
    setShowEventModal(true);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900/50 backdrop-blur-sm border-b border-gray-800/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300">
            {session?.user?.name?.[0] ?? "O"}
          </div>
        </div>

        <ClockWidget />

        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2.5 rounded-lg hover:bg-gray-800 active:bg-gray-700 touch-manipulation"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/dashboard/settings"
            className="p-2.5 rounded-lg hover:bg-gray-800 active:bg-gray-700 touch-manipulation"
          >
            <Settings className="w-5 h-5" />
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/dashboard/login" })}
            className="p-2.5 rounded-lg hover:bg-gray-800 active:bg-gray-700 touch-manipulation"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden p-4">
        {loading && remindersLoading ? (
          <div className="h-full flex items-center justify-center">
            <RefreshCw className="w-8 h-8 animate-spin text-gray-500" />
          </div>
        ) : (
          <div className="h-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Left: Calendar month view */}
            <div className="h-full min-h-0">
              <CalendarWidget
                events={events}
                onDaySelect={setSelectedDate}
                selectedDate={selectedDate}
                onCreateEvent={() => {
                  setEditingEvent(null);
                  setShowEventModal(true);
                }}
              />
            </div>

            {/* Middle: Schedule / Day view */}
            <div className="h-full min-h-0">
              <ScheduleWidget
                events={events}
                selectedDate={selectedDate}
                onEventClick={handleEventClick}
              />
            </div>

            {/* Right: Reminders */}
            <div className="h-full min-h-0">
              <RemindersWidget
                lists={lists}
                onComplete={completeReminder}
                onAdd={addReminder}
                onDelete={deleteReminder}
              />
            </div>
          </div>
        )}
      </main>

      {/* Event modal */}
      {showEventModal && (
        <EventModal
          event={editingEvent}
          calendars={calendars}
          selectedDate={selectedDate}
          onSave={handleCreateEvent}
          onDelete={editingEvent ? handleDeleteEvent : undefined}
          onClose={() => {
            setShowEventModal(false);
            setEditingEvent(null);
          }}
        />
      )}
    </div>
  );
}
