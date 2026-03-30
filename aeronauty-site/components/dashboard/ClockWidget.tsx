"use client";

import { useState, useEffect } from "react";

export default function ClockWidget() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="text-center py-4">
      <div className="text-6xl font-light tracking-tight tabular-nums">{time}</div>
      <div className="text-xl text-gray-400 mt-1">{date}</div>
    </div>
  );
}
