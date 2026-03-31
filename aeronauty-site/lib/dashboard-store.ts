"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LayoutItem } from "react-grid-layout";

export interface WeatherLocation {
  lat: number;
  lon: number;
  name: string;
}

export type BackgroundTheme = "none" | "classic" | "nature" | "space" | "architecture" | "moody" | "custom";

interface DashboardState {
  // Background
  backgroundTheme: BackgroundTheme;
  setBackgroundTheme: (theme: BackgroundTheme) => void;
  albumUrl: string | null;
  setAlbumUrl: (url: string | null) => void;

  // Weather
  weatherLocation: WeatherLocation | null;
  setWeatherLocation: (loc: WeatherLocation | null) => void;

  // Schedule view
  scheduleView: "today" | "tomorrow" | "week";
  setScheduleView: (view: "today" | "tomorrow" | "week") => void;

  // Calendar settings
  hiddenCalendarIds: string[];
  setHiddenCalendarIds: (ids: string[]) => void;
  calendarNicknames: Record<string, string>; // calendarId → nickname
  setCalendarNickname: (calendarId: string, nickname: string) => void;
  removeCalendarNickname: (calendarId: string) => void;

  // Widget visibility
  hiddenWidgets: string[];
  toggleWidgetHidden: (widgetId: string) => void;
  showWidget: (widgetId: string) => void;

  // Maximize
  maximizedWidget: string | null;
  setMaximizedWidget: (widgetId: string | null) => void;

  // Grid layout
  gridLayouts: Record<string, LayoutItem[]>;
  setGridLayouts: (layouts: Record<string, LayoutItem[]>) => void;
  gridLocked: boolean;
  setGridLocked: (locked: boolean) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      backgroundTheme: "nature",
      setBackgroundTheme: (theme) => set({ backgroundTheme: theme }),
      albumUrl: null,
      setAlbumUrl: (url) => set({ albumUrl: url }),

      weatherLocation: null,
      setWeatherLocation: (loc) => set({ weatherLocation: loc }),

      scheduleView: "today",
      setScheduleView: (view) => set({ scheduleView: view }),

      hiddenCalendarIds: [],
      setHiddenCalendarIds: (ids) => set({ hiddenCalendarIds: ids }),
      calendarNicknames: {},
      setCalendarNickname: (calendarId, nickname) =>
        set((s) => ({
          calendarNicknames: { ...s.calendarNicknames, [calendarId]: nickname },
        })),
      removeCalendarNickname: (calendarId) =>
        set((s) => {
          const { [calendarId]: _, ...rest } = s.calendarNicknames;
          return { calendarNicknames: rest };
        }),

      hiddenWidgets: [],
      toggleWidgetHidden: (widgetId) =>
        set((s) => ({
          hiddenWidgets: s.hiddenWidgets.includes(widgetId)
            ? s.hiddenWidgets.filter((id) => id !== widgetId)
            : [...s.hiddenWidgets, widgetId],
        })),
      showWidget: (widgetId) =>
        set((s) => ({
          hiddenWidgets: s.hiddenWidgets.filter((id) => id !== widgetId),
        })),

      maximizedWidget: null,
      setMaximizedWidget: (widgetId) => set({ maximizedWidget: widgetId }),

      gridLayouts: {},
      setGridLayouts: (layouts) => set({ gridLayouts: layouts }),
      gridLocked: true,
      setGridLocked: (locked) => set({ gridLocked: locked }),
    }),
    { name: "dashboard-settings" }
  )
);
