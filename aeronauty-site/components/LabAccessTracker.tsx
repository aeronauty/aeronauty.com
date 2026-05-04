"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function LabAccessTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname === "/lab/login") return;

    fetch("/api/activity/lab-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify({
        path: pathname,
        pageTitle: document.title,
        metadata: {
          viewport: `${window.innerWidth}x${window.innerHeight}`,
        },
      }),
    })
      .then((response) => response.json().catch(() => ({})))
      .then((detail) => {
        window.dispatchEvent(new CustomEvent("aeronauty:lab-activity-recorded", { detail }));
      })
      .catch(() => {});
  }, [pathname]);

  return null;
}
