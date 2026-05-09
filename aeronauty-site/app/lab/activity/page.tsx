"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type EngagementEvent = ActivityEvent & {
  sessionId: string | null;
  articleSlug: string | null;
  sectionId: string | null;
  sectionTitle: string | null;
  sectionType: string | null;
  activeMs: number;
  visibleMs: number;
  maxVisibilityRatio: number;
  maxScrollDepth: number;
  isFinal: boolean;
};

type PathSummary = {
  path: string;
  views: number;
  visitors: number;
};

type EngagementPathSummary = {
  path: string;
  visitors: number;
  activeMs: number;
  averageActiveMs: number;
  exits: number;
  maxScrollDepth: number;
};

type BlogSectionSummary = {
  key: string;
  articleSlug: string;
  sectionId: string;
  sectionTitle: string;
  sectionType: string;
  visitors: number;
  activeMs: number;
  averageActiveMs: number;
  medianActiveMs: number;
  skimRate: number;
  exitRate: number;
  maxScrollDepth: number;
  lastSeen: string;
};

type EngagementAggregates = {
  paths: Array<{
    key: string;
    path: string;
    pageTitle: string | null;
    sessions: number;
    activeMs: number;
    events: number;
    exits: number;
    maxScrollDepth: number;
    firstSeen: string | null;
    lastSeen: string | null;
  }>;
  sections: Array<{
    key: string;
    articleSlug: string;
    sectionId: string;
    sectionTitle: string;
    sectionType: string;
    sessions: number;
    activeMs: number;
    visibleMs: number;
    events: number;
    skims: number;
    exits: number;
    maxScrollDepth: number;
    firstSeen: string | null;
    lastSeen: string | null;
  }>;
};

type SessionSummary = {
  sessionId: string;
  visitor: string;
  source: string;
  location: string;
  entryPath: string;
  exitPath: string;
  activeMs: number;
  deepestSection: string;
  maxScrollDepth: number;
  lastSeen: string;
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

type PlotlyStatic = NonNullable<Window["Plotly"]>;

const PLOTLY_SCRIPT_ID = "plotly-js-cdn";
const PLOTLY_SRC = "https://cdn.plot.ly/plotly-2.32.0.min.js";

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

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function engagementVisitorKey(event: EngagementEvent): string {
  return event.sessionId ?? event.email ?? event.clientIpHash ?? event.id;
}

function summarizeEngagementPaths(events: EngagementEvent[]): EngagementPathSummary[] {
  const byPath = new Map<string, { visitors: Set<string>; activeMs: number; exits: number; maxScrollDepth: number }>();

  for (const event of events) {
    if (event.eventType !== "page_engagement" && event.eventType !== "session_end") continue;
    const path = event.path ?? "(unknown)";
    const summary = byPath.get(path) ?? { visitors: new Set<string>(), activeMs: 0, exits: 0, maxScrollDepth: 0 };
    summary.visitors.add(engagementVisitorKey(event));
    summary.activeMs += event.activeMs;
    summary.maxScrollDepth = Math.max(summary.maxScrollDepth, event.maxScrollDepth);
    if (event.eventType === "session_end") summary.exits += 1;
    byPath.set(path, summary);
  }

  return Array.from(byPath.entries())
    .map(([path, summary]) => ({
      path,
      visitors: summary.visitors.size,
      activeMs: summary.activeMs,
      averageActiveMs: summary.visitors.size ? summary.activeMs / summary.visitors.size : 0,
      exits: summary.exits,
      maxScrollDepth: summary.maxScrollDepth,
    }))
    .sort((a, b) => b.activeMs - a.activeMs || a.path.localeCompare(b.path))
    .slice(0, 8);
}

function summarizeAggregatePaths(aggregates: EngagementAggregates["paths"]): EngagementPathSummary[] {
  return aggregates
    .map((item) => ({
      path: item.path,
      visitors: item.sessions,
      activeMs: item.activeMs,
      averageActiveMs: item.sessions ? item.activeMs / item.sessions : 0,
      exits: item.exits,
      maxScrollDepth: item.maxScrollDepth,
    }))
    .sort((a, b) => b.activeMs - a.activeMs || a.path.localeCompare(b.path))
    .slice(0, 8);
}

function estimatedWords(event: EngagementEvent): number {
  const value = event.metadata?.estimatedWords;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function summarizeBlogSections(events: EngagementEvent[]): BlogSectionSummary[] {
  const exitsBySection = new Map<string, Set<string>>();
  for (const event of events) {
    if (event.eventType !== "session_end" || !event.articleSlug || !event.sectionId) continue;
    const key = `${event.articleSlug}::${event.sectionId}`;
    const visitors = exitsBySection.get(key) ?? new Set<string>();
    visitors.add(engagementVisitorKey(event));
    exitsBySection.set(key, visitors);
  }

  const bySection = new Map<
    string,
    {
      articleSlug: string;
      sectionId: string;
      sectionTitle: string;
      sectionType: string;
      visitors: Set<string>;
      activeByVisitor: Map<string, number>;
      skimVisitors: Set<string>;
      activeMs: number;
      maxScrollDepth: number;
      lastSeen: string;
    }
  >();

  for (const event of events) {
    if (event.eventType !== "section_engagement" || !event.articleSlug || !event.sectionId) continue;
    const key = `${event.articleSlug}::${event.sectionId}`;
    const visitor = engagementVisitorKey(event);
    const summary =
      bySection.get(key) ??
      {
        articleSlug: event.articleSlug,
        sectionId: event.sectionId,
        sectionTitle: event.sectionTitle ?? event.sectionId,
        sectionType: event.sectionType ?? "section",
        visitors: new Set<string>(),
        activeByVisitor: new Map<string, number>(),
        skimVisitors: new Set<string>(),
        activeMs: 0,
        maxScrollDepth: 0,
        lastSeen: event.createdAt,
      };
    summary.visitors.add(visitor);
    summary.activeMs += event.activeMs;
    summary.activeByVisitor.set(visitor, (summary.activeByVisitor.get(visitor) ?? 0) + event.activeMs);
    summary.maxScrollDepth = Math.max(summary.maxScrollDepth, event.maxScrollDepth);
    if (new Date(event.createdAt).getTime() > new Date(summary.lastSeen).getTime()) summary.lastSeen = event.createdAt;

    const expectedReadMs = Math.max(3000, Math.min(20000, estimatedWords(event) * 180));
    if (event.visibleMs > 0 && event.activeMs < Math.min(5000, expectedReadMs * 0.35)) {
      summary.skimVisitors.add(visitor);
    }
    bySection.set(key, summary);
  }

  return Array.from(bySection.entries())
    .map(([key, summary]) => {
      const activeValues = Array.from(summary.activeByVisitor.values());
      const exits = exitsBySection.get(key)?.size ?? 0;
      return {
        key,
        articleSlug: summary.articleSlug,
        sectionId: summary.sectionId,
        sectionTitle: summary.sectionTitle,
        sectionType: summary.sectionType,
        visitors: summary.visitors.size,
        activeMs: summary.activeMs,
        averageActiveMs: summary.visitors.size ? summary.activeMs / summary.visitors.size : 0,
        medianActiveMs: median(activeValues),
        skimRate: summary.visitors.size ? summary.skimVisitors.size / summary.visitors.size : 0,
        exitRate: summary.visitors.size ? exits / summary.visitors.size : 0,
        maxScrollDepth: summary.maxScrollDepth,
        lastSeen: summary.lastSeen,
      };
    })
    .sort((a, b) => b.averageActiveMs - a.averageActiveMs || b.visitors - a.visitors)
    .slice(0, 16);
}

function summarizeAggregateBlogSections(aggregates: EngagementAggregates["sections"]): BlogSectionSummary[] {
  return aggregates
    .map((section) => ({
      key: section.key,
      articleSlug: section.articleSlug,
      sectionId: section.sectionId,
      sectionTitle: section.sectionTitle,
      sectionType: section.sectionType,
      visitors: section.sessions,
      activeMs: section.activeMs,
      averageActiveMs: section.sessions ? section.activeMs / section.sessions : 0,
      medianActiveMs: 0,
      skimRate: section.sessions ? section.skims / section.sessions : 0,
      exitRate: section.sessions ? section.exits / section.sessions : 0,
      maxScrollDepth: section.maxScrollDepth,
      lastSeen: section.lastSeen ?? section.firstSeen ?? "",
    }))
    .sort((a, b) => b.averageActiveMs - a.averageActiveMs || b.visitors - a.visitors)
    .slice(0, 16);
}

function summarizeSessions(events: EngagementEvent[]): SessionSummary[] {
  const bySession = new Map<string, SessionSummary>();

  for (const event of [...events].reverse()) {
    const sessionId = engagementVisitorKey(event);
    const existing =
      bySession.get(sessionId) ??
      {
        sessionId,
        visitor: event.email ?? "anonymous",
        source: getSource(event as ActivityEvent),
        location: [event.city, event.region, event.country].filter(Boolean).join(", ") || "unknown",
        entryPath: event.path ?? "(unknown)",
        exitPath: event.path ?? "(unknown)",
        activeMs: 0,
        deepestSection: event.sectionTitle ?? event.sectionId ?? "none",
        maxScrollDepth: 0,
        lastSeen: event.createdAt,
      };
    existing.exitPath = event.path ?? existing.exitPath;
    existing.activeMs += event.eventType === "page_engagement" || event.eventType === "session_end" ? event.activeMs : 0;
    existing.maxScrollDepth = Math.max(existing.maxScrollDepth, event.maxScrollDepth);
    if (event.sectionTitle || event.sectionId) existing.deepestSection = event.sectionTitle ?? event.sectionId ?? existing.deepestSection;
    if (new Date(event.createdAt).getTime() > new Date(existing.lastSeen).getTime()) existing.lastSeen = event.createdAt;
    bySession.set(sessionId, existing);
  }

  return Array.from(bySession.values())
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
    .slice(0, 12);
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

function loadPlotly(): Promise<PlotlyStatic> {
  if (window.Plotly) return Promise.resolve(window.Plotly);

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(PLOTLY_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => (window.Plotly ? resolve(window.Plotly) : reject(new Error("Plotly failed to load"))), { once: true });
      existing.addEventListener("error", () => reject(new Error("Plotly failed to load")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = PLOTLY_SCRIPT_ID;
    script.src = PLOTLY_SRC;
    script.async = true;
    script.onload = () => (window.Plotly ? resolve(window.Plotly) : reject(new Error("Plotly failed to load")));
    script.onerror = () => reject(new Error("Plotly failed to load"));
    document.head.appendChild(script);
  });
}

function LabActivityMap({ locations }: { locations: GeoSummary[] }) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  const mapLocations = useMemo(
    () => locations.filter((location) => Number.isFinite(location.lat) && Number.isFinite(location.lon)),
    [locations]
  );

  useEffect(() => {
    let cancelled = false;
    const element = mapRef.current;
    if (!element || mapLocations.length === 0) return;

    const maxViews = Math.max(1, ...mapLocations.map((location) => location.views));

    loadPlotly()
      .then((Plotly) => {
        if (cancelled || !mapRef.current) return;
        return Plotly.react(
          mapRef.current,
          [
            {
              type: "scattermapbox",
              mode: "markers",
              lat: mapLocations.map((location) => location.lat),
              lon: mapLocations.map((location) => location.lon),
              text: mapLocations.map((location) => location.label),
              customdata: mapLocations.map((location) => [location.views, location.visitors, new Date(location.lastSeen).toLocaleString()]),
              hovertemplate: "<b>%{text}</b><br>%{customdata[0]} events<br>%{customdata[1]} visitors<br>Last seen %{customdata[2]}<extra></extra>",
              marker: {
                size: mapLocations.map((location) => 9 + (location.views / maxViews) * 18),
                color: "#0891b2",
                opacity: 0.82,
              },
            },
          ],
          {
            autosize: true,
            height: 380,
            margin: { l: 0, r: 0, t: 0, b: 0 },
            paper_bgcolor: "#f8fafc",
            plot_bgcolor: "#f8fafc",
            showlegend: false,
            mapbox: {
              style: "open-street-map",
              center: { lat: 24, lon: 0 },
              zoom: 0.65,
            },
          },
          {
            responsive: true,
            displayModeBar: false,
          }
        );
      })
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
      element.replaceChildren();
    };
  }, [mapLocations]);

  return (
    <div className="relative min-h-[380px] overflow-hidden rounded-md border border-stone-200 bg-[#f8fafc]">
      <div ref={mapRef} className="h-[380px] w-full" />
      {status !== "ready" && (
        <div className="absolute inset-0 grid place-items-center bg-[#f8fafc] text-sm text-stone-500">
          {status === "failed" ? "Map failed to load." : "Loading map..."}
        </div>
      )}
    </div>
  );
}

export default function LabActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [engagementEvents, setEngagementEvents] = useState<EngagementEvent[]>([]);
  const [engagementAggregates, setEngagementAggregates] = useState<EngagementAggregates>({ paths: [], sections: [] });
  const [storeConfigured, setStoreConfigured] = useState<boolean | null>(null);
  const [ownerActivityFiltered, setOwnerActivityFiltered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus>(null);

  const visibleEvents = events.filter((event) => !isDashboardSelfEvent(event));
  const visitorCount = new Set(visibleEvents.map(getVisitorKey)).size;
  const publicPageViews = visibleEvents.filter((event) => event.eventType === "page_view").length;
  const labEvents = visibleEvents.filter((event) => event.eventType === "lab_access" || event.eventType === "lab_login").length;
  const topPaths = summarizePaths(visibleEvents);
  const visibleEngagementEvents = engagementEvents.filter((event) => event.path !== "/lab/activity");
  const hasAggregateEngagement = engagementAggregates.paths.length > 0 || engagementAggregates.sections.length > 0;
  const engagementPaths = engagementAggregates.paths.length > 0
    ? summarizeAggregatePaths(engagementAggregates.paths)
    : summarizeEngagementPaths(visibleEngagementEvents);
  const blogSections = engagementAggregates.sections.length > 0
    ? summarizeAggregateBlogSections(engagementAggregates.sections)
    : summarizeBlogSections(visibleEngagementEvents);
  const sessions = summarizeSessions(visibleEngagementEvents);
  const totalActiveMs = hasAggregateEngagement
    ? engagementAggregates.paths.reduce((sum, path) => sum + path.activeMs, 0)
    : visibleEngagementEvents
        .filter((event) => event.eventType === "page_engagement" || event.eventType === "session_end")
        .reduce((sum, event) => sum + event.activeMs, 0);
  const averageActiveMs = hasAggregateEngagement
    ? totalActiveMs / Math.max(1, engagementAggregates.paths.reduce((sum, path) => sum + path.sessions, 0))
    : sessions.length ? totalActiveMs / sessions.length : 0;
  const bounceLikeExits = sessions.filter((session) => session.maxScrollDepth < 0.18 && session.activeMs < 10000).length;
  const topSources = summarizeSources(visibleEvents);
  const topLocations = summarizeGeo(visibleEvents);
  const countryCount = new Set(topLocations.map((location) => location.country ?? "unknown")).size;
  const externalSourceEvents = visibleEvents.filter((event) => {
    const source = getSource(event);
    return source !== "Direct / unknown" && source !== "Direct / internal" && source !== "Internal";
  }).length;
  const topSource = topSources.find((source) => source.source !== "Direct / unknown" && source.source !== "Direct / internal") ?? topSources[0];

  const loadRecentActivity = useCallback(() => {
    setLoading(true);
    fetch("/api/activity/recent?limit=300&engagementLimit=5000", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { events: [] }))
      .then((body) => {
        setEvents(body.events ?? []);
        setEngagementEvents(body.engagementEvents ?? []);
        setEngagementAggregates(body.engagementAggregates ?? { paths: [], sections: [] });
        setStoreConfigured(body.activityStoreConfigured ?? null);
        setOwnerActivityFiltered(Boolean(body.ownerActivityFiltered));
      })
      .catch(() => {
        setEvents([]);
        setEngagementEvents([]);
        setEngagementAggregates({ paths: [], sections: [] });
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

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-stone-200 bg-white p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Active time</p>
            <p className="mt-3 text-4xl font-semibold">{loading ? "..." : formatDuration(totalActiveMs)}</p>
            <p className="mt-2 text-sm text-stone-500">Visible, non-idle time from consented sessions.</p>
          </div>
          <div className="rounded-md border border-stone-200 bg-white p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Avg session</p>
            <p className="mt-3 text-4xl font-semibold">{loading ? "..." : formatDuration(averageActiveMs)}</p>
            <p className="mt-2 text-sm text-stone-500">{sessions.length} recent engagement sessions.</p>
          </div>
          <div className="rounded-md border border-stone-200 bg-white p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Quick exits</p>
            <p className="mt-3 text-4xl font-semibold">{loading ? "..." : bounceLikeExits}</p>
            <p className="mt-2 text-sm text-stone-500">Under 10s active time and under 18% scroll depth.</p>
          </div>
        </div>

        {engagementPaths.length > 0 && (
          <section className="mt-6 rounded-md border border-stone-200 bg-white p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Engaged paths</h2>
                <p className="mt-2 text-sm text-stone-500">Ranked by active dwell time, not page views.</p>
              </div>
              <p className="text-sm text-stone-500">
                {hasAggregateEngagement ? "Durable aggregate totals" : `${visibleEngagementEvents.length} recent engagement records`}
              </p>
            </div>
            <div className="mt-4 divide-y divide-stone-200">
              {engagementPaths.map((item) => (
                <div key={item.path} className="grid gap-3 py-3 text-sm sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                  <span className="break-all font-medium text-stone-800">{item.path}</span>
                  <span className="text-stone-500">{formatDuration(item.activeMs)} active</span>
                  <span className="text-stone-500">{formatDuration(item.averageActiveMs)} avg</span>
                  <span className="text-stone-500">{formatPercent(item.maxScrollDepth)} depth</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {blogSections.length > 0 && (
          <section className="mt-6 rounded-md border border-stone-200 bg-white p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Blog attention and drop-off</h2>
                <p className="mt-2 text-sm text-stone-500">Sections and scrolly beats with the strongest linger, skim, and exit signals.</p>
              </div>
              <p className="text-sm text-stone-500">
                {hasAggregateEngagement ? "Aggregate active dwell, skim, and exit totals by section." : "Median and average active dwell by section."}
              </p>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-stone-200 text-stone-500">
                  <tr>
                    <th className="py-3 pr-4">Article</th>
                    <th className="py-3 pr-4">Section</th>
                    <th className="py-3 pr-4">Type</th>
                    <th className="py-3 pr-4">Sessions</th>
                    <th className="py-3 pr-4">Avg</th>
                    <th className="py-3 pr-4">Median</th>
                    <th className="py-3 pr-4">Skim</th>
                    <th className="py-3 pr-4">Exit</th>
                    <th className="py-3">Depth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {blogSections.map((section) => (
                    <tr key={section.key}>
                      <td className="py-3 pr-4 text-stone-500">{section.articleSlug}</td>
                      <td className="py-3 pr-4">
                        <div className="font-medium text-stone-800">{section.sectionTitle}</div>
                        <div className="text-xs text-stone-400">{section.sectionId}</div>
                      </td>
                      <td className="py-3 pr-4 text-stone-500">{section.sectionType}</td>
                      <td className="py-3 pr-4 text-stone-500">{section.visitors}</td>
                      <td className="py-3 pr-4 text-stone-500">{formatDuration(section.averageActiveMs)}</td>
                      <td className="py-3 pr-4 text-stone-500">
                        {hasAggregateEngagement ? "n/a" : formatDuration(section.medianActiveMs)}
                      </td>
                      <td className="py-3 pr-4 text-stone-500">{formatPercent(section.skimRate)}</td>
                      <td className="py-3 pr-4 text-stone-500">{formatPercent(section.exitRate)}</td>
                      <td className="py-3 text-stone-500">{formatPercent(section.maxScrollDepth)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {sessions.length > 0 && (
          <section className="mt-6 rounded-md border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Recent sessions</h2>
            <div className="mt-4 divide-y divide-stone-200">
              {sessions.map((session) => (
                <div key={session.sessionId} className="grid gap-3 py-3 text-sm lg:grid-cols-[1fr_1fr_auto_auto] lg:items-center">
                  <div>
                    <p className="font-medium text-stone-800">{session.source}</p>
                    <p className="mt-1 text-xs text-stone-400">{session.location} · {session.visitor}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-stone-600">{session.entryPath}</p>
                    <p className="mt-1 truncate text-xs text-stone-400">Deepest: {session.deepestSection}</p>
                  </div>
                  <span className="text-stone-500">{formatDuration(session.activeMs)}</span>
                  <span className="text-stone-500">{formatPercent(session.maxScrollDepth)} depth</span>
                </div>
              ))}
            </div>
          </section>
        )}

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
              <div>
                <LabActivityMap locations={topLocations} />
                <p className="mt-2 text-[11px] leading-none text-stone-400">
                  Plotly map using OpenStreetMap tiles. Map data © OpenStreetMap contributors.
                </p>
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
