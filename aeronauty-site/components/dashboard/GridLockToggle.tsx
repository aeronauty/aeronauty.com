"use client";

import { Lock, Unlock } from "lucide-react";
import { useDashboardStore } from "@/lib/dashboard-store";

export default function GridLockToggle() {
  const locked = useDashboardStore((s) => s.gridLocked);
  const setLocked = useDashboardStore((s) => s.setGridLocked);

  return (
    <button
      onClick={() => setLocked(!locked)}
      className="p-2.5 rounded-lg hover:bg-gray-800 active:bg-gray-700 touch-manipulation"
      title={locked ? "Unlock grid layout" : "Lock grid layout"}
    >
      {locked ? (
        <Lock className="w-5 h-5" />
      ) : (
        <Unlock className="w-5 h-5 text-blue-400" />
      )}
    </button>
  );
}
