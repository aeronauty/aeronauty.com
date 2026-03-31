"use client";

import { useState, useEffect, useRef } from "react";
import { Home } from "lucide-react";
import { usePathname } from "next/navigation";

/**
 * Floating home button that:
 * - Appears on first touch/click anywhere on the page
 * - Navigates back to /dashboard
 * - Auto-hides after 5 seconds of no interaction
 * - Hidden when already on /dashboard (main page)
 */
export default function FloatingHomeButton() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Don't show on the main dashboard page
  const isMainDashboard = pathname === "/dashboard";

  useEffect(() => {
    if (isMainDashboard) {
      setVisible(false);
      return;
    }

    const show = () => {
      setVisible(true);
      // Auto-hide after 5 seconds
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setVisible(false), 5000);
    };

    // Show on first touch or click
    window.addEventListener("touchstart", show, { passive: true, once: false });
    window.addEventListener("mousedown", show, { passive: true, once: false });

    return () => {
      window.removeEventListener("touchstart", show);
      window.removeEventListener("mousedown", show);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isMainDashboard]);

  if (isMainDashboard || !visible) return null;

  return (
    <a
      href="/dashboard"
      className="fixed bottom-6 right-6 z-[100] w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center shadow-lg touch-manipulation"
      title="Back to Dashboard"
      onClick={() => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      }}
    >
      <Home className="w-6 h-6 text-white" />
    </a>
  );
}
