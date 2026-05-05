"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const CONSENT_KEY = "aeronauty-analytics-consent";
const ATTRIBUTION_KEY = "aeronauty-public-attribution";

type ConsentState = "unknown" | "accepted" | "declined";
type Attribution = {
  landingPath: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  capturedAt: string;
};

function readConsent(): ConsentState {
  if (typeof window === "undefined") return "unknown";
  const value = window.localStorage.getItem(CONSENT_KEY);
  return value === "accepted" || value === "declined" ? value : "unknown";
}

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

export default function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [consent, setConsent] = useState<ConsentState>("unknown");

  const path = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    setConsent(readConsent());
  }, []);

  useEffect(() => {
    if (consent !== "accepted") return;
    if (pathname === "/lab/activity") return;
    const currentSearchParams = new URLSearchParams(searchParams.toString());
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

    fetch("/api/activity/page-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        consent: true,
        path,
        pageTitle: document.title,
        metadata: {
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          documentReferrer,
          attribution,
          ...utm,
        },
      }),
    }).catch(() => {});
  }, [consent, path, pathname, searchParams]);

  function choose(next: Exclude<ConsentState, "unknown">) {
    window.localStorage.setItem(CONSENT_KEY, next);
    setConsent(next);
  }

  if (consent !== "unknown") return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] border-t border-gray-800 bg-gray-950/95 px-4 py-4 text-white shadow-2xl backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-gray-300">
          I track first-party page views and approximate region so I know which private drafts and
          demos are worth keeping alive. Servers need paying for; electrons do not throw themselves
          into the furnace. See the{" "}
          <Link href="/privacy" className="font-semibold text-blue-300 hover:text-blue-200">
            privacy notice
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => choose("declined")}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 transition hover:border-gray-500 hover:text-white"
          >
            No thanks
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-400"
          >
            That's fine
          </button>
        </div>
      </div>
    </div>
  );
}
