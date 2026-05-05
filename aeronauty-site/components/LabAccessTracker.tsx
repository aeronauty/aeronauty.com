"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const ATTRIBUTION_KEY = "aeronauty-lab-attribution";

type Attribution = {
  landingPath: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  capturedAt: string;
};

function getUtm(searchParams: URLSearchParams) {
  return {
    utmSource: searchParams.get("utm_source"),
    utmMedium: searchParams.get("utm_medium"),
    utmCampaign: searchParams.get("utm_campaign"),
  };
}

function readStoredAttribution(): Attribution | null {
  try {
    const raw = window.sessionStorage.getItem(ATTRIBUTION_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    return null;
  }
}

function writeStoredAttribution(attribution: Attribution) {
  try {
    window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
  } catch {}
}

export default function LabAccessTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const path = query ? `${pathname}?${query}` : pathname;

  useEffect(() => {
    if (!pathname || pathname === "/lab/login" || pathname === "/lab/activity") return;
    const currentSearchParams = new URLSearchParams(query);
    const utm = getUtm(currentSearchParams);
    const documentReferrer = document.referrer || null;
    const existingAttribution = readStoredAttribution();
    const hasNewAttribution = Boolean(utm.utmSource || documentReferrer);
    const attribution =
      hasNewAttribution || !existingAttribution
        ? {
            landingPath: path,
            referrer: documentReferrer,
            ...utm,
            capturedAt: new Date().toISOString(),
          }
        : existingAttribution;

    if (hasNewAttribution || !existingAttribution) {
      writeStoredAttribution(attribution);
    }

    fetch("/api/activity/lab-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify({
        path,
        pageTitle: document.title,
        metadata: {
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          documentReferrer,
          attribution,
          ...utm,
        },
      }),
    })
      .then((response) => response.json().catch(() => ({})))
      .then((detail) => {
        window.dispatchEvent(new CustomEvent("aeronauty:lab-activity-recorded", { detail }));
      })
      .catch(() => {});
  }, [path, pathname, query]);

  return null;
}
