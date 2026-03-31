"use client";

import { useState, useEffect } from "react";

export default function ClockWidget() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Render placeholder until client-side hydration to avoid mismatch
  if (!now) {
    return (
      <div className="text-center flex items-center gap-3">
        <div className="text-2xl font-light tracking-tight tabular-nums">&nbsp;</div>
      </div>
    );
  }

  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="text-center flex items-center gap-3">
      <div className="text-2xl font-light tracking-tight tabular-nums">{time}</div>
      <div className="text-sm text-gray-400">{date}</div>
    </div>
  );
}
