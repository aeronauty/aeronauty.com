"use client";

import { useEffect, useRef, useCallback } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useDashboardStore } from "@/lib/dashboard-store";

const INACTIVITY_TIMEOUT = 30_000; // 30 seconds

interface Props {
  id: string;
  children: React.ReactNode;
}

export default function WidgetWrapper({ id, children }: Props) {
  const maximizedWidget = useDashboardStore((s) => s.maximizedWidget);
  const setMaximizedWidget = useDashboardStore((s) => s.setMaximizedWidget);
  const toggleWidgetHidden = useDashboardStore((s) => s.toggleWidgetHidden);
  const locked = useDashboardStore((s) => s.gridLocked);

  const isMaximized = maximizedWidget === id;
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Auto-restore from maximized after inactivity
  const resetTimer = useCallback(() => {
    if (!isMaximized) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setMaximizedWidget(null);
    }, INACTIVITY_TIMEOUT);
  }, [isMaximized, setMaximizedWidget]);

  useEffect(() => {
    if (!isMaximized) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // Start the inactivity timer
    resetTimer();

    // Reset on any interaction
    const events = ["mousemove", "mousedown", "touchstart", "keydown", "scroll"];
    const handler = () => resetTimer();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, handler));
    };
  }, [isMaximized, resetTimer]);

  if (isMaximized) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-950/95 backdrop-blur-lg p-4 flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Maximize toolbar */}
        <div className="flex justify-end mb-2">
          <button
            onClick={() => setMaximizedWidget(null)}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 touch-manipulation"
            title="Restore"
          >
            <Minimize2 className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    );
  }

  return (
    <div className="relative h-full group">
      {/* Hover controls — only show when grid is unlocked */}
      {!locked && (
        <div className="absolute top-1.5 right-1.5 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setMaximizedWidget(id)}
            className="p-1 rounded bg-gray-800/90 hover:bg-gray-700 touch-manipulation"
            title="Maximize"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => toggleWidgetHidden(id)}
            className="p-1 rounded bg-gray-800/90 hover:bg-red-900/80 touch-manipulation"
            title="Hide widget"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
