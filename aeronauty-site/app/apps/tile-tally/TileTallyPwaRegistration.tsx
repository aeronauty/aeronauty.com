"use client";

import { useEffect } from "react";

const SERVICE_WORKER_URL = "/tile-tally-sw.js";
const SERVICE_WORKER_SCOPE = "/apps/tile-tally";

/**
 * Registers the Tile Tally-only service worker after hydration.
 *
 * The worker deliberately has a narrow scope and never caches navigations,
 * authentication requests, API calls, or user data. Registration failures are
 * non-fatal: Tile Tally remains a normal network-backed web app.
 */
export default function TileTallyPwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

    let active = true;

    void navigator.serviceWorker
      .register(SERVICE_WORKER_URL, {
        scope: SERVICE_WORKER_SCOPE,
        updateViaCache: "none",
      })
      .then((registration) => {
        if (active) void registration.update().catch(() => undefined);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  return null;
}
