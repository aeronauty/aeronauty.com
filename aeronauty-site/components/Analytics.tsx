"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const CONSENT_KEY = "aeronauty-analytics-consent";
const ATTRIBUTION_KEY = "aeronauty-public-attribution";
const SESSION_KEY = "aeronauty-analytics-session";
const FLUSH_INTERVAL_MS = 15000;
const SAMPLE_INTERVAL_MS = 1000;
const IDLE_AFTER_MS = 15000;

type ConsentState = "unknown" | "accepted" | "declined";
type Attribution = {
  landingPath: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  capturedAt: string;
};

type EngagementEventType =
  | "session_start"
  | "page_engagement"
  | "section_engagement"
  | "article_progress"
  | "session_end";

type EngagementPayloadEvent = {
  eventType: EngagementEventType;
  sessionId: string;
  articleSlug: string | null;
  sectionId: string | null;
  sectionTitle: string | null;
  sectionType: string | null;
  activeMs: number;
  visibleMs: number;
  maxVisibilityRatio: number;
  maxScrollDepth: number;
  isFinal: boolean;
  metadata?: Record<string, unknown>;
};

type SectionStat = {
  id: string;
  title: string | null;
  type: string;
  element: Element;
  activeMs: number;
  visibleMs: number;
  maxVisibilityRatio: number;
  firstSeen: string | null;
  lastSeen: string | null;
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

function makeSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getSessionId() {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const next = makeSessionId();
    window.sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return makeSessionId();
  }
}

function articleSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/(?:lab\/articles|writing)\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function visibleRatio(element: Element, view: Window): number {
  const rect = element.getBoundingClientRect();
  const viewportHeight = view.innerHeight || 1;
  const viewportWidth = view.innerWidth || 1;
  if (rect.width <= 0 || rect.height <= 0) return 0;
  const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
  const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
  const area = visibleHeight * visibleWidth;
  const total = rect.width * rect.height;
  return Math.max(0, Math.min(1, area / total));
}

function scrollDepth(doc: Document): number {
  const root = doc.scrollingElement ?? doc.documentElement;
  const max = Math.max(1, root.scrollHeight - root.clientHeight);
  return Math.max(0, Math.min(1, root.scrollTop / max));
}

function textFrom(element: Element, selector: string): string | null {
  return element.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim().slice(0, 180) || null;
}

function sectionTitle(element: Element, type: string): string | null {
  if (type === "hero") return textFrom(element, "h1") ?? element.getAttribute("aria-label");
  if (type === "section") return textFrom(element, "h2,h3") ?? element.getAttribute("aria-label");
  if (type === "figure") return textFrom(element, "figcaption") ?? element.getAttribute("aria-label");
  if (type === "beat") return textFrom(element, "h4,.af-scroll-beat-eyebrow,p") ?? element.getAttribute("aria-label");
  return element.getAttribute("aria-label") ?? textFrom(element, "h2,h3,h4,p");
}

function sectionType(element: Element): string {
  if (element.matches(".ti-hero")) return "hero";
  if (element.matches(".ti-section")) return "section";
  if (element.matches(".ti-figure,figure")) return "figure";
  if (element.matches(".ti-flowchart-scrolly,.ti-orch-scrolly,.fv-scrolly,.wc-scroll,.ty-scroll")) return "scrolly";
  if (element.matches(".af-scroll-beat,.ti-orch-beat,.fv-scrolly-beat,.wc-step,.ty-beat")) return "beat";
  return "section";
}

function stableSectionId(element: Element, index: number, type: string): string {
  const explicit =
    element.getAttribute("id") ||
    element.getAttribute("data-node-id") ||
    element.getAttribute("data-af-step") ||
    element.getAttribute("data-step") ||
    element.getAttribute("aria-labelledby");
  if (explicit) return explicit;
  const title = sectionTitle(element, type);
  const slug = title?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return slug ? `${type}-${slug}` : `${type}-${index + 1}`;
}

function collectSections(doc: Document): SectionStat[] {
  const selectors = [
    ".ti-hero",
    ".ti-section[id]",
    ".ti-figure",
    "figure",
    ".ti-flowchart-scrolly",
    ".ti-orch-scrolly",
    ".fv-scrolly",
    ".wc-scroll",
    ".ty-scroll",
    ".af-scroll-beat",
    ".ti-orch-beat",
    ".fv-scrolly-beat",
    ".wc-step",
    ".ty-beat",
    "main > section",
    "article > section",
  ].join(",");
  const seen = new Set<Element>();
  return Array.from(doc.querySelectorAll(selectors))
    .filter((element) => {
      if (seen.has(element)) return false;
      seen.add(element);
      return true;
    })
    .map((element, index) => {
      const type = sectionType(element);
      return {
        id: stableSectionId(element, index, type),
        title: sectionTitle(element, type),
        type,
        element,
        activeMs: 0,
        visibleMs: 0,
        maxVisibilityRatio: 0,
        firstSeen: null,
        lastSeen: null,
      };
    });
}

function sendEngagement(path: string, pageTitle: string, events: EngagementPayloadEvent[]) {
  if (events.length === 0) return;
  const body = JSON.stringify({ consent: true, path, pageTitle, events });
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon("/api/activity/engagement", blob)) return;
  }
  fetch("/api/activity/engagement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body,
  }).catch(() => {});
}

function createEngagementTracker(options: {
  view: Window;
  doc: Document;
  path: string;
  sessionId: string;
  articleSlug: string | null;
  pageTitle: string;
  source: "page" | "iframe";
}) {
  const { view, doc, path, sessionId, articleSlug, pageTitle, source } = options;
  let lastActivity = Date.now();
  let pageActiveMs = 0;
  let pageMaxScrollDepth = scrollDepth(doc);
  let lastDeepestSectionId: string | null = null;
  let stopped = false;
  let sections = collectSections(doc);

  function isVisibleAndActive() {
    return doc.visibilityState !== "hidden" && Date.now() - lastActivity <= IDLE_AFTER_MS;
  }

  function markActivity() {
    lastActivity = Date.now();
  }

  function sample() {
    if (stopped) return;
    const active = isVisibleAndActive();
    pageMaxScrollDepth = Math.max(pageMaxScrollDepth, scrollDepth(doc));
    if (active) pageActiveMs += SAMPLE_INTERVAL_MS;

    if (sections.length === 0) sections = collectSections(doc);
    for (const section of sections) {
      const ratio = visibleRatio(section.element, view);
      section.maxVisibilityRatio = Math.max(section.maxVisibilityRatio, ratio);
      if (ratio > 0.05) {
        const now = new Date().toISOString();
        section.visibleMs += SAMPLE_INTERVAL_MS;
        section.firstSeen ??= now;
        section.lastSeen = now;
        lastDeepestSectionId = section.id;
        if (active) section.activeMs += SAMPLE_INTERVAL_MS;
      }
    }
  }

  function drainSections(final: boolean): EngagementPayloadEvent[] {
    const sectionEvents = sections
      .filter((section) => section.activeMs > 0 || section.visibleMs > 0 || (final && section.firstSeen))
      .map((section) => ({
        eventType: "section_engagement" as const,
        sessionId,
        articleSlug,
        sectionId: section.id,
        sectionTitle: section.title,
        sectionType: section.type,
        activeMs: section.activeMs,
        visibleMs: section.visibleMs,
        maxVisibilityRatio: section.maxVisibilityRatio,
        maxScrollDepth: pageMaxScrollDepth,
        isFinal: final,
        metadata: {
          source,
          firstSeen: section.firstSeen,
          lastSeen: section.lastSeen,
          estimatedWords: section.element.textContent?.trim().split(/\s+/).filter(Boolean).length ?? 0,
        },
      }));

    for (const section of sections) {
      section.activeMs = 0;
      section.visibleMs = 0;
      section.maxVisibilityRatio = 0;
    }
    return sectionEvents;
  }

  function flush(final = false) {
    if (stopped && !final) return;
    sample();
    const events: EngagementPayloadEvent[] = [];
    if (pageActiveMs > 0 || final) {
      events.push({
        eventType: final ? "session_end" : "page_engagement",
        sessionId,
        articleSlug,
        sectionId: lastDeepestSectionId,
        sectionTitle: null,
        sectionType: "page",
        activeMs: pageActiveMs,
        visibleMs: pageActiveMs,
        maxVisibilityRatio: 1,
        maxScrollDepth: pageMaxScrollDepth,
        isFinal: final,
        metadata: { source, deepestSectionId: lastDeepestSectionId },
      });
    }
    events.push(...drainSections(final));
    if (articleSlug && (final || pageMaxScrollDepth > 0)) {
      events.push({
        eventType: "article_progress",
        sessionId,
        articleSlug,
        sectionId: lastDeepestSectionId,
        sectionTitle: null,
        sectionType: "article",
        activeMs: 0,
        visibleMs: 0,
        maxVisibilityRatio: 1,
        maxScrollDepth: pageMaxScrollDepth,
        isFinal: final,
        metadata: { source, deepestSectionId: lastDeepestSectionId },
      });
    }
    pageActiveMs = 0;
    if (events.length > 0) sendEngagement(path, pageTitle, events);
  }

  sendEngagement(path, pageTitle, [
    {
      eventType: "session_start",
      sessionId,
      articleSlug,
      sectionId: null,
      sectionTitle: null,
      sectionType: "page",
      activeMs: 0,
      visibleMs: 0,
      maxVisibilityRatio: 1,
      maxScrollDepth: pageMaxScrollDepth,
      isFinal: false,
      metadata: { source },
    },
  ]);

  const sampleTimer = window.setInterval(sample, SAMPLE_INTERVAL_MS);
  const flushTimer = window.setInterval(() => flush(false), FLUSH_INTERVAL_MS);
  const activityEvents = ["scroll", "pointermove", "pointerdown", "keydown", "touchstart"] as const;
  activityEvents.forEach((event) => view.addEventListener(event, markActivity, { passive: true }));
  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState === "hidden") flush(false);
    else markActivity();
  });
  view.addEventListener("pagehide", () => flush(true));

  return () => {
    stopped = true;
    window.clearInterval(sampleTimer);
    window.clearInterval(flushTimer);
    activityEvents.forEach((event) => view.removeEventListener(event, markActivity));
    flush(true);
  };
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

  useEffect(() => {
    if (consent !== "accepted") return;
    if (pathname === "/lab/activity") return;

    const sessionId = getSessionId();
    const articleSlug = articleSlugFromPath(pathname);
    const cleanups: Array<() => void> = [
      createEngagementTracker({
        view: window,
        doc: document,
        path,
        sessionId,
        articleSlug,
        pageTitle: document.title,
        source: "page",
      }),
    ];

    const iframeCleanups = new Map<HTMLIFrameElement, () => void>();

    function attachIframe(iframe: HTMLIFrameElement) {
      if (iframeCleanups.has(iframe)) return;
      try {
        const iframeWindow = iframe.contentWindow;
        const iframeDocument = iframe.contentDocument;
        if (!iframeWindow || !iframeDocument || iframeDocument.readyState === "loading") return;
        const cleanup = createEngagementTracker({
          view: iframeWindow,
          doc: iframeDocument,
          path,
          sessionId,
          articleSlug,
          pageTitle: iframe.title || iframeDocument.title || document.title,
          source: "iframe",
        });
        iframeCleanups.set(iframe, cleanup);
      } catch {
        // Cross-origin iframes are deliberately ignored.
      }
    }

    function attachCurrentIframes() {
      document.querySelectorAll("iframe").forEach((iframe) => attachIframe(iframe));
    }

    const iframeLoadHandlers: Array<{ iframe: HTMLIFrameElement; handler: () => void }> = [];
    document.querySelectorAll("iframe").forEach((iframe) => {
      const handler = () => attachIframe(iframe);
      iframe.addEventListener("load", handler);
      iframeLoadHandlers.push({ iframe, handler });
    });
    attachCurrentIframes();

    const observer = new MutationObserver(() => {
      document.querySelectorAll("iframe").forEach((iframe) => {
        if (iframeLoadHandlers.some((item) => item.iframe === iframe)) return;
        const handler = () => attachIframe(iframe);
        iframe.addEventListener("load", handler);
        iframeLoadHandlers.push({ iframe, handler });
        attachIframe(iframe);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      iframeLoadHandlers.forEach(({ iframe, handler }) => iframe.removeEventListener("load", handler));
      iframeCleanups.forEach((cleanup) => cleanup());
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [consent, path, pathname]);

  function choose(next: Exclude<ConsentState, "unknown">) {
    window.localStorage.setItem(CONSENT_KEY, next);
    setConsent(next);
  }

  if (consent !== "unknown") return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] border-t border-gray-800 bg-gray-950/95 px-4 py-4 text-white shadow-2xl backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-gray-300">
          I track first-party page views, approximate region, active dwell time, scroll depth, and
          article-section attention so I know which drafts and demos are worth keeping alive.
          Servers need paying for; electrons do not throw themselves into the furnace. See the{" "}
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
