"use client";

import { useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { Settings, RefreshCw, LogOut } from "lucide-react";
import TimerButton from "@/components/dashboard/TimerButton";
import Link from "next/link";
import ClockWidget from "@/components/dashboard/ClockWidget";
import CalendarWidget from "@/components/dashboard/CalendarWidget";
import ScheduleWidget from "@/components/dashboard/ScheduleWidget";
import WeatherWidget from "@/components/dashboard/WeatherWidget";
import MusicWidget from "@/components/dashboard/MusicWidget";
import NewsWidget from "@/components/dashboard/NewsWidget";
import BinsWidget from "@/components/dashboard/BinsWidget";
import EventModal from "@/components/dashboard/EventModal";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import GridLockToggle from "@/components/dashboard/GridLockToggle";
import WidgetWrapper from "@/components/dashboard/WidgetWrapper";
import HiddenWidgetsBar from "@/components/dashboard/HiddenWidgetsBar";
import { useCalendarData } from "@/components/dashboard/useCalendarData";
import { useDashboardStore } from "@/lib/dashboard-store";
import type { CalendarEvent } from "@/lib/types";

export default function DashboardPage() {
  const { data: session } = useSession();
  const { events, calendars, loading, refresh: refreshCalendar } = useCalendarData();
  const maximizedWidget = useDashboardStore((s) => s.maximizedWidget);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshCalendar();
    setRefreshing(false);
  }, [refreshCalendar]);

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

  // Widget map for maximized rendering
  const widgetContent: Record<string, React.ReactNode> = {
    calendar: (
      <CalendarWidget
        events={events}
        onDaySelect={setSelectedDate}
        selectedDate={selectedDate}
        onCreateEvent={() => {
          setEditingEvent(null);
          setShowEventModal(true);
        }}
      />
    ),
    schedule: (
      <ScheduleWidget
        events={events}
        selectedDate={selectedDate}
        onEventClick={handleEventClick}
      />
    ),
    weather: <WeatherWidget />,
    music: <MusicWidget />,
    news: <NewsWidget />,
    bins: <BinsWidget />,
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden relative z-10">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900/50 backdrop-blur-sm border-b border-gray-800/50 relative z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300">
            {session?.user?.name?.[0] ?? "O"}
          </div>
          {/* Quick Links */}
          <div className="hidden sm:flex items-center gap-1 ml-2">
            <a href="https://www.netflix.com/browse" target="_blank" rel="noopener noreferrer"
              className="p-1.5 rounded-lg hover:bg-red-600/30 touch-manipulation" title="Netflix">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-red-500" fill="currentColor">
                <path d="M5.398 0v.006c3.028 8.556 5.37 15.175 8.348 23.596 2.344.058 4.85.398 4.854.398-2.8-7.924-5.923-16.747-8.487-24h-4.715zm8.489 0v9.63L18.6 22.951c.043.043.105.065.168.065.023 0 .046-.003.068-.01a.172.172 0 0 0 .115-.143V0h-5.064zM5.398 1.05V24c1.873-.225 2.81-.312 4.715-.398v-9.22L5.398 1.05z" />
              </svg>
            </a>
            <a href="https://app.plex.tv/desktop" target="_blank" rel="noopener noreferrer"
              className="p-1.5 rounded-lg hover:bg-amber-600/30 touch-manipulation" title="Plex">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-amber-500" fill="currentColor">
                <path d="M11.643 0H4.68l7.679 12L4.68 24h6.963l7.677-12z" />
              </svg>
            </a>
            <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer"
              className="p-1.5 rounded-lg hover:bg-red-700/30 touch-manipulation" title="YouTube">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-red-600" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            </a>
          </div>
        </div>

        <ClockWidget />

        <div className="flex items-center gap-1">
          <TimerButton />
          <GridLockToggle />
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

      {/* Hidden widgets restore bar */}
      <HiddenWidgetsBar />

      {/* Main content */}
      <main className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <RefreshCw className="w-8 h-8 animate-spin text-gray-500" />
          </div>
        ) : (
          <DashboardGrid>
            {Object.entries(widgetContent).map(([id, content]) => (
              <div key={id}>
                <WidgetWrapper id={id}>{content}</WidgetWrapper>
              </div>
            ))}
          </DashboardGrid>
        )}
      </main>

      {/* Maximized widget overlay */}
      {maximizedWidget && widgetContent[maximizedWidget] && (
        <WidgetWrapper id={maximizedWidget}>
          {widgetContent[maximizedWidget]}
        </WidgetWrapper>
      )}

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
