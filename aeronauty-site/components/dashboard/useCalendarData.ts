"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useDashboardStore } from "@/lib/dashboard-store";
import type { CalendarEvent, CalendarInfo, ReminderList } from "@/lib/types";

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function useCalendarData() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start.getTime() + 30 * 86400000);

      const res = await fetch(
        `/api/calendars?timeMin=${start.toISOString()}&timeMax=${end.toISOString()}`
      );
      if (!res.ok) throw new Error("Failed to fetch events");
      const data = await res.json();
      setEvents(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCalendars = useCallback(async () => {
    try {
      const res = await fetch("/api/calendars?action=calendars");
      if (!res.ok) throw new Error("Failed to fetch calendars");
      const data = await res.json();
      setCalendars(data);
    } catch (err) {
      console.error("Calendar list fetch error:", err);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    fetchCalendars();
    const interval = setInterval(fetchEvents, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchEvents, fetchCalendars]);

  const hiddenCalendarIds = useDashboardStore((s) => s.hiddenCalendarIds);
  const calendarNicknames = useDashboardStore((s) => s.calendarNicknames);

  // Filter hidden calendars and apply nicknames
  const filteredEvents = useMemo(() => {
    return events
      .filter((e) => !hiddenCalendarIds.includes(e.calendarId))
      .map((e) => ({
        ...e,
        calendarName: calendarNicknames[e.calendarId] || e.calendarName,
      }));
  }, [events, hiddenCalendarIds, calendarNicknames]);

  const enrichedCalendars = useMemo(() => {
    return calendars.map((c) => ({
      ...c,
      name: calendarNicknames[c.id] || c.name,
    }));
  }, [calendars, calendarNicknames]);

  return {
    events: filteredEvents,
    calendars: enrichedCalendars,
    allCalendars: calendars,
    loading,
    error,
    refresh: fetchEvents,
  };
}

export function useReminders() {
  const [lists, setLists] = useState<ReminderList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReminders = useCallback(async () => {
    try {
      const res = await fetch("/api/reminders");
      if (!res.ok) throw new Error("Failed to fetch reminders");
      const data = await res.json();
      setLists(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReminders();
    const interval = setInterval(fetchReminders, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchReminders]);

  const getListInfo = (listId: string) => {
    const list = lists.find((l) => l.id === listId);
    return { source: list?.source, accountEmail: list?.accountEmail };
  };

  const completeReminder = async (listId: string, reminderId: string) => {
    const { source, accountEmail } = getListInfo(listId);

    // Optimistic update
    setLists((prev) =>
      prev.map((list) =>
        list.id === listId
          ? {
              ...list,
              reminders: list.reminders.map((r) =>
                r.id === reminderId ? { ...r, completed: !r.completed } : r
              ),
            }
          : list
      )
    );

    try {
      await fetch("/api/reminders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId, reminderId, source, accountEmail }),
      });
    } catch {
      fetchReminders(); // Revert on error
    }
  };

  const addReminder = async (
    listId: string,
    title: string,
    dueDate?: string
  ) => {
    const { source, accountEmail } = getListInfo(listId);

    try {
      await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId, source, accountEmail, title, dueDate }),
      });
      fetchReminders();
    } catch (err) {
      console.error("Add reminder error:", err);
    }
  };

  const deleteReminder = async (listId: string, reminderId: string) => {
    const { source, accountEmail } = getListInfo(listId);

    setLists((prev) =>
      prev.map((list) =>
        list.id === listId
          ? { ...list, reminders: list.reminders.filter((r) => r.id !== reminderId) }
          : list
      )
    );

    try {
      const params = new URLSearchParams({
        listId,
        reminderId,
        ...(source && { source }),
        ...(accountEmail && { accountEmail }),
      });
      await fetch(`/api/reminders?${params}`, { method: "DELETE" });
    } catch {
      fetchReminders();
    }
  };

  return {
    lists,
    loading,
    error,
    refresh: fetchReminders,
    completeReminder,
    addReminder,
    deleteReminder,
  };
}
