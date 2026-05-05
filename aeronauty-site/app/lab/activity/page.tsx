"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ActivityEvent = {
  id: string;
  eventType: string;
  path: string | null;
  pageTitle: string | null;
  email: string | null;
  authMethod: string | null;
  referrer: string | null;
  clientIpHash: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

type PathSummary = {
  path: string;
  views: number;
  visitors: number;
};

type SourceSummary = {
  source: string;
  views: number;
  visitors: number;
  labEvents: number;
  publicViews: number;
  lastSeen: string;
};

type TrackerStatus = {
  recorded?: boolean;
  reason?: string;
} | null;

function getVisitorKey(event: ActivityEvent): string {
  return event.email ?? event.clientIpHash ?? event.id;
}

function summarizePaths(events: ActivityEvent[]): PathSummary[] {
  const byPath = new Map<string, { views: number; visitors: Set<string> }>();

  for (const event of events) {
    const path = event.path ?? "(unknown)";
    const summary = byPath.get(path) ?? { views: 0, visitors: new Set<string>() };
    summary.views += 1;
    summary.visitors.add(getVisitorKey(event));
    byPath.set(path, summary);
  }

  return Array.from(byPath.entries())
    .map(([path, summary]) => ({
      path,
      views: summary.views,
      visitors: summary.visitors.size,
    }))
    .sort((a, b) => b.views - a.views || a.path.localeCompare(b.path))
    .slice(0, 8);
}

function metadataString(event: ActivityEvent, key: string): string | null {
  const value = event.metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function attributionValue(event: ActivityEvent, key: string): string | null {
  const attribution = event.metadata?.attribution;
  if (!attribution || typeof attribution !== "object") return null;
  const value = (attribution as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function getQueryValue(path: string | null, key: string): string | null {
  if (!path) return null;
  try {
    const url = new URL(path, "https://aeronauty.com");
    return url.searchParams.get(key);
  } catch {
    return null;
  }
}

function hostFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function readableSource(raw: string): string {
  const value = raw.toLowerCase().replace(/^www\./, "");
  if (value.includes("linkedin") || value === "lnkd.in") return "LinkedIn";
  if (value.includes("facebook") || value === "fb.me" || value === "l.facebook.com") return "Facebook";
  if (value.includes("reddit")) return "Reddit";
  if (value.includes("google")) return "Google";
  if (value.includes("x.com") || value.includes("twitter") || value === "t.co") return "X / Twitter";
  if (value.includes("bsky.app") || value.includes("bluesky")) return "Bluesky";
  if (value.includes("slack")) return "Slack";
  if (value.includes("teams.microsoft")) return "Teams";
  if (value.includes("aeronauty.com") || value.includes("localhost") || value.includes("127.0.0.1")) return "Internal";
  return value;
}

function getSource(event: ActivityEvent): string {
  const utmSource =
    getQueryValue(event.path, "utm_source") ??
    metadataString(event, "utmSource") ??
    attributionValue(event, "utmSource");
  if (utmSource) return readableSource(utmSource);

  const clientReferrer =
    attributionValue(event, "referrer") ??
    metadataString(event, "documentReferrer") ??
    event.referrer;
  const host = hostFromUrl(clientReferrer);
  if (!host) return "Direct / unknown";

  const source = readableSource(host);
  return source === "Internal" ? "Direct / internal" : source;
}

function summarizeSources(events: ActivityEvent[]): SourceSummary[] {
  const bySource = new Map<string, { views: number; visitors: Set<string>; labEvents: number; publicViews: number; lastSeen: string }>();

  for (const event of events) {
    const source = getSource(event);
    const summary = bySource.get(source) ?? {
      views: 0,
      visitors: new Set<string>(),
      labEvents: 0,
      publicViews: 0,
      lastSeen: event.createdAt,
    };
    summary.views += 1;
    summary.visitors.add(getVisitorKey(event));
    if (event.eventType === "page_view") summary.publicViews += 1;
    if (event.eventType === "lab_access" || event.eventType === "lab_login") summary.labEvents += 1;
    if (new Date(event.createdAt).getTime() > new Date(summary.lastSeen).getTime()) {
      summary.lastSeen = event.createdAt;
    }
    bySource.set(source, summary);
  }

  return Array.from(bySource.entries())
    .map(([source, summary]) => ({
      source,
      views: summary.views,
      visitors: summary.visitors.size,
      labEvents: summary.labEvents,
      publicViews: summary.publicViews,
      lastSeen: summary.lastSeen,
    }))
    .sort((a, b) => b.views - a.views || a.source.localeCompare(b.source));
}

function isDashboardSelfEvent(event: ActivityEvent): boolean {
  return event.path === "/lab/activity";
}

export default function LabActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [storeConfigured, setStoreConfigured] = useState<boolean | null>(null);
  const [ownerActivityFiltered, setOwnerActivityFiltered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus>(null);

  const visibleEvents = events.filter((event) => !isDashboardSelfEvent(event));
  const visitorCount = new Set(visibleEvents.map(getVisitorKey)).size;
  const publicPageViews = visibleEvents.filter((event) => event.eventType === "page_view").length;
  const labEvents = visibleEvents.filter((event) => event.eventType === "lab_access" || event.eventType === "lab_login").length;
  const topPaths = summarizePaths(visibleEvents);
  const topSources = summarizeSources(visibleEvents);
  const externalSourceEvents = visibleEvents.filter((event) => {
    const source = getSource(event);
    return source !== "Direct / unknown" && source !== "Direct / internal" && source !== "Internal";
  }).length;
  const topSource = topSources.find((source) => source.source !== "Direct / unknown" && source.source !== "Direct / internal") ?? topSources[0];

  const loadRecentActivity = useCallback(() => {
    setLoading(true);
    fetch("/api/activity/recent?limit=200", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { events: [] }))
      .then((body) => {
        setEvents(body.events ?? []);
        setStoreConfigured(body.activityStoreConfigured ?? null);
        setOwnerActivityFiltered(Boolean(body.ownerActivityFiltered));
      })
      .catch(() => {
        setEvents([]);
        setStoreConfigured(null);
        setOwnerActivityFiltered(false);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadRecentActivity();

    function handleActivityRecorded(event: Event) {
      setTrackerStatus(event instanceof CustomEvent ? event.detail : null);
      loadRecentActivity();
    }

    window.addEventListener("aeronauty:lab-activity-recorded", handleActivityRecorded);
    return () => window.removeEventListener("aeronauty:lab-activity-recorded", handleActivityRecorded);
  }, [loadRecentActivity]);

  return (
    <main className="min-h-screen bg-[var(--paper)] text-stone-950">
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="mb-10 flex items-center justify-between">
          <Link href="/lab" className="text-sm font-semibold text-[var(--accent)] hover:text-stone-950">
            Aeronauty Lab
          </Link>
          <a href="/api/lab/logout" className="text-sm text-stone-500 hover:text-stone-950">
            Sign out
          </a>
        </div>

        <p className="eyebrow">Lab</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">Activity</h1>
        <p className="mt-4 text-stone-600">
          Recent first-party activity events
          {ownerActivityFiltered ? ", excluding your own signed-in views" : ""}.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-stone-200 bg-white p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Recent visitors</p>
            <p className="mt-3 text-4xl font-semibold">{loading ? "..." : visitorCount}</p>
          </div>
          <div className="rounded-md border border-stone-200 bg-white p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Public page views</p>
            <p className="mt-3 text-4xl font-semibold">{loading ? "..." : publicPageViews}</p>
          </div>
          <div className="rounded-md border border-stone-200 bg-white p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Lab events</p>
            <p className="mt-3 text-4xl font-semibold">{loading ? "..." : labEvents}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-stone-200 bg-white p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Top source</p>
            <p className="mt-3 text-3xl font-semibold">{loading ? "..." : topSource?.source ?? "none yet"}</p>
            <p className="mt-2 text-sm text-stone-500">
              {topSource ? `${topSource.views} events from ${topSource.visitors} visitors` : "No source data yet"}
            </p>
          </div>
          <div className="rounded-md border border-stone-200 bg-white p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Sourced events</p>
            <p className="mt-3 text-4xl font-semibold">{loading ? "..." : externalSourceEvents}</p>
            <p className="mt-2 text-sm text-stone-500">Events with an external referrer or UTM source.</p>
          </div>
          <div className="rounded-md border border-stone-200 bg-white p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Direct / internal</p>
            <p className="mt-3 text-4xl font-semibold">
              {loading
                ? "..."
                : visibleEvents.filter((event) => {
                    const source = getSource(event);
                    return source === "Direct / unknown" || source === "Direct / internal" || source === "Internal";
                  }).length}
            </p>
            <p className="mt-2 text-sm text-stone-500">Includes app referrer stripping and login redirects.</p>
          </div>
        </div>

        {topPaths.length > 0 && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="rounded-md border border-stone-200 bg-white p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Top sources</h2>
              <div className="mt-4 divide-y divide-stone-200">
                {topSources.slice(0, 8).map((item) => (
                  <div key={item.source} className="grid gap-3 py-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <span className="font-medium text-stone-800">{item.source}</span>
                    <span className="text-stone-500">{item.views} events</span>
                    <span className="text-stone-500">{item.visitors} visitors</span>
                    <span className="text-xs text-stone-400 sm:col-span-3">
                      {item.labEvents} lab events · {item.publicViews} public views · last seen{" "}
                      {new Date(item.lastSeen).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-md border border-stone-200 bg-white p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Top paths</h2>
              <div className="mt-4 divide-y divide-stone-200">
                {topPaths.map((item) => (
                  <div key={item.path} className="grid gap-3 py-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <span className="break-all font-medium text-stone-800">{item.path}</span>
                    <span className="text-stone-500">{item.views} views</span>
                    <span className="text-stone-500">{item.visitors} visitors</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {storeConfigured === false && (
          <div className="mt-8 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            Activity storage is not configured in this deployment. Add either
            <code className="mx-1 rounded bg-amber-100 px-1 py-0.5">UPSTASH_REDIS_REST_URL</code>
            and
            <code className="mx-1 rounded bg-amber-100 px-1 py-0.5">UPSTASH_REDIS_REST_TOKEN</code>
            , or the equivalent Vercel KV REST variables, then redeploy.
          </div>
        )}

        {trackerStatus?.recorded === false && (
          <div className="mt-8 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            This browser reached the activity tracker, but the current page access was not recorded:
            <code className="ml-1 rounded bg-amber-100 px-1 py-0.5">{trackerStatus.reason ?? "unknown"}</code>
          </div>
        )}

        <div className="mt-10 overflow-hidden rounded-md border border-stone-200 bg-white">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-stone-100 text-stone-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Path</th>
                <th className="px-4 py-3">Region</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {visibleEvents.map((event) => (
                <tr key={event.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-500">
                    {new Date(event.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{event.email ?? "anonymous"}</td>
                  <td className="px-4 py-3 text-stone-600">{event.eventType}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-stone-800">{getSource(event)}</div>
                    <div className="max-w-[260px] truncate text-xs text-stone-400">
                      {attributionValue(event, "referrer") ?? metadataString(event, "documentReferrer") ?? event.referrer ?? ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--accent)]">{event.path ?? ""}</td>
                  <td className="px-4 py-3 text-stone-500">
                    {[event.city, event.region, event.country].filter(Boolean).join(", ") || "unknown"}
                  </td>
                </tr>
              ))}
              {visibleEvents.length === 0 && loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-stone-500">
                    Loading activity...
                  </td>
                </tr>
              )}
              {visibleEvents.length === 0 && !loading && storeConfigured !== false && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-stone-500">
                    No activity recorded yet.
                  </td>
                </tr>
              )}
              {visibleEvents.length === 0 && !loading && storeConfigured === false && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-stone-500">
                    Activity storage is not configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
