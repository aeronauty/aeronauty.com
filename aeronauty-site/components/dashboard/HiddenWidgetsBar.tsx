"use client";

import { Calendar, Clock, Cloud, Music, ExternalLink, Plus } from "lucide-react";
import { useDashboardStore } from "@/lib/dashboard-store";

const WIDGET_META: Record<string, { label: string; icon: React.ReactNode }> = {
  calendar: { label: "Calendar", icon: <Calendar className="w-3.5 h-3.5" /> },
  schedule: { label: "Schedule", icon: <Clock className="w-3.5 h-3.5" /> },
  weather: { label: "Weather", icon: <Cloud className="w-3.5 h-3.5" /> },
  music: { label: "Music", icon: <Music className="w-3.5 h-3.5" /> },
  links: { label: "Quick Links", icon: <ExternalLink className="w-3.5 h-3.5" /> },
};

export default function HiddenWidgetsBar() {
  const hiddenWidgets = useDashboardStore((s) => s.hiddenWidgets);
  const showWidget = useDashboardStore((s) => s.showWidget);

  if (hiddenWidgets.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <span className="text-xs text-gray-500">Hidden:</span>
      {hiddenWidgets.map((id) => {
        const meta = WIDGET_META[id] ?? { label: id, icon: <Plus className="w-3.5 h-3.5" /> };
        return (
          <button
            key={id}
            onClick={() => showWidget(id)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800/60 hover:bg-gray-700 text-xs text-gray-400 hover:text-white transition-colors touch-manipulation"
            title={`Show ${meta.label}`}
          >
            {meta.icon}
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
