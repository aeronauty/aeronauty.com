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
      keepalive: true,
      body: JSON.stringify({
        path: pathname,
        pageTitle: document.title,
        metadata: {
          viewport: `${window.innerWidth}x${window.innerHeight}`,
        },
      }),
    }).catch(() => {});
  }, [pathname]);

  return null;
}
