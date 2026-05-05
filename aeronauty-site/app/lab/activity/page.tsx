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

type GeoSummary = {
  label: string;
  country: string | null;
  region: string | null;
  city: string | null;
  views: number;
  visitors: number;
  lastSeen: string;
  lat: number;
  lon: number;
};

type TrackerStatus = {
  recorded?: boolean;
  reason?: string;
} | null;

const COUNTRY_CENTRES: Record<string, { name: string; lat: number; lon: number }> = {
  AU: { name: "Australia", lat: -25.3, lon: 133.8 },
  BR: { name: "Brazil", lat: -14.2, lon: -51.9 },
  CA: { name: "Canada", lat: 56.1, lon: -106.3 },
  CH: { name: "Switzerland", lat: 46.8, lon: 8.2 },
  CN: { name: "China", lat: 35.9, lon: 104.2 },
  DE: { name: "Germany", lat: 51.2, lon: 10.5 },
  ES: { name: "Spain", lat: 40.5, lon: -3.7 },
  FR: { name: "France", lat: 46.2, lon: 2.2 },
  GB: { name: "United Kingdom", lat: 55.4, lon: -3.4 },
  IE: { name: "Ireland", lat: 53.4, lon: -8.2 },
  IN: { name: "India", lat: 20.6, lon: 78.9 },
  IT: { name: "Italy", lat: 41.9, lon: 12.6 },
  JP: { name: "Japan", lat: 36.2, lon: 138.3 },
  NL: { name: "Netherlands", lat: 52.1, lon: 5.3 },
  NZ: { name: "New Zealand", lat: -40.9, lon: 174.9 },
  SE: { name: "Sweden", lat: 60.1, lon: 18.6 },
  SG: { name: "Singapore", lat: 1.4, lon: 103.8 },
  US: { name: "United States", lat: 39.8, lon: -98.6 },
  ZA: { name: "South Africa", lat: -30.6, lon: 22.9 },
};

const COUNTRY_ALIASES: Record<string, string> = {
  UK: "GB",
};

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

function normaliseCountry(country: string | null): string | null {
  if (!country) return null;
  const code = country.trim().toUpperCase();
  return COUNTRY_ALIASES[code] ?? code;
}

function readableCountry(country: string | null): string {
  const code = normaliseCountry(country);
  if (!code) return "Unknown";
  return COUNTRY_CENTRES[code]?.name ?? code;
}

function geoPoint(country: string | null): { lat: number; lon: number } {
  const code = normaliseCountry(country);
  return (code ? COUNTRY_CENTRES[code] : null) ?? { lat: 0, lon: 0 };
}

function geoLabel(event: ActivityEvent): string {
  const country = readableCountry(event.country);
  const place = [event.city, event.region].filter(Boolean).join(", ");
  return place ? `${place}, ${country}` : country;
}

function mapPoint(lat: number, lon: number) {
  return {
    x: ((lon + 180) / 360) * 720,
    y: ((90 - lat) / 180) * 360,
  };
}

function summarizeGeo(events: ActivityEvent[]): GeoSummary[] {
  const byLocation = new Map<string, { event: ActivityEvent; views: number; visitors: Set<string>; lastSeen: string }>();

  for (const event of events) {
    const key = [event.country ?? "unknown", event.region ?? "", event.city ?? ""].join("|");
    const summary = byLocation.get(key) ?? {
      event,
      views: 0,
      visitors: new Set<string>(),
      lastSeen: event.createdAt,
    };
    summary.views += 1;
    summary.visitors.add(getVisitorKey(event));
    if (new Date(event.createdAt).getTime() > new Date(summary.lastSeen).getTime()) {
      summary.lastSeen = event.createdAt;
    }
    byLocation.set(key, summary);
  }

  return Array.from(byLocation.values())
    .map((summary) => {
      const point = geoPoint(summary.event.country);
      return {
        label: geoLabel(summary.event),
        country: normaliseCountry(summary.event.country),
        region: summary.event.region,
        city: summary.event.city,
        views: summary.views,
        visitors: summary.visitors.size,
        lastSeen: summary.lastSeen,
        lat: point.lat,
        lon: point.lon,
      };
    })
    .sort((a, b) => b.views - a.views || a.label.localeCompare(b.label));
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
  const topLocations = summarizeGeo(visibleEvents);
  const maxLocationViews = Math.max(1, ...topLocations.map((location) => location.views));
  const countryCount = new Set(topLocations.map((location) => location.country ?? "unknown")).size;
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

        {topLocations.length > 0 && (
          <section className="mt-6 rounded-md border border-stone-200 bg-white p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Geography</h2>
                <p className="mt-2 text-sm text-stone-500">
                  Approximate locations from Vercel country/region/city headers.
                </p>
              </div>
              <p className="text-sm text-stone-500">
                {topLocations.length} location{topLocations.length === 1 ? "" : "s"} · {countryCount}{" "}
                {countryCount === 1 ? "country" : "countries"}
              </p>
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
              <div className="overflow-hidden rounded-md border border-stone-200 bg-[#f8fafc]">
                <svg viewBox="0 0 720 360" role="img" aria-label="Approximate visitor source map" className="h-auto w-full">
                  <rect width="720" height="360" fill="#f8fafc" />
                  <path d="M68 94 C104 58 164 54 214 74 C250 88 267 120 238 150 C217 172 186 166 154 182 C118 200 88 186 70 154 C58 132 50 112 68 94Z" fill="#e7ecef" />
                  <path d="M214 206 C248 194 284 212 294 248 C304 286 280 326 244 322 C214 318 198 288 204 254 C207 234 198 218 214 206Z" fill="#e7ecef" />
                  <path d="M330 92 C384 58 462 72 498 112 C526 142 514 176 468 174 C426 172 400 148 360 158 C324 166 294 144 300 118 C303 106 314 98 330 92Z" fill="#e7ecef" />
                  <path d="M364 182 C396 166 446 174 468 210 C488 242 474 300 438 316 C402 332 370 306 374 262 C376 232 338 202 364 182Z" fill="#e7ecef" />
                  <path d="M516 154 C560 126 626 132 660 168 C684 194 668 222 622 218 C576 214 550 224 522 204 C502 190 492 172 516 154Z" fill="#e7ecef" />
                  <path d="M574 252 C610 240 654 258 668 292 C680 322 644 336 602 328 C566 320 544 276 574 252Z" fill="#e7ecef" />
                  {[60, 120, 180, 240, 300].map((y) => (
                    <line key={`lat-${y}`} x1="0" x2="720" y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                  ))}
                  {[120, 240, 360, 480, 600].map((x) => (
                    <line key={`lon-${x}`} x1={x} x2={x} y1="0" y2="360" stroke="#e2e8f0" strokeWidth="1" />
                  ))}
                  {topLocations.map((location) => {
                    const point = mapPoint(location.lat, location.lon);
                    const radius = 5 + (location.views / maxLocationViews) * 13;
                    return (
                      <g key={`${location.label}-${location.lastSeen}`}>
                        <circle cx={point.x} cy={point.y} r={radius + 5} fill="#0e7490" opacity="0.12" />
                        <circle cx={point.x} cy={point.y} r={radius} fill="#0891b2" opacity="0.78" />
                        <circle cx={point.x} cy={point.y} r="2.5" fill="#0f172a" opacity="0.65" />
                        <title>
                          {location.label}: {location.views} events, {location.visitors} visitors
                        </title>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="divide-y divide-stone-200">
                {topLocations.slice(0, 8).map((location) => (
                  <div key={`${location.label}-${location.lastSeen}`} className="grid grid-cols-[1fr_auto] gap-3 py-3 text-sm">
                    <div>
                      <p className="font-medium text-stone-800">{location.label}</p>
                      <p className="mt-1 text-xs text-stone-400">Last seen {new Date(location.lastSeen).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-stone-700">{location.views} events</p>
                      <p className="mt-1 text-xs text-stone-400">{location.visitors} visitors</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
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
