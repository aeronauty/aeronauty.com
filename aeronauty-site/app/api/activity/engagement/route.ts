import { NextRequest, NextResponse } from "next/server";
import { EngagementEvent, hasActivityStore, recordEngagementEvents } from "@/lib/activity-store";

const EVENT_TYPES = new Set<EngagementEvent["eventType"]>([
  "session_start",
  "page_engagement",
  "section_engagement",
  "article_progress",
  "session_end",
]);

function stringValue(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function numberValue(value: unknown, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, value));
}

function metadataValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const path = stringValue(body.path, 2048);

  if (body?.consent !== true) {
    return NextResponse.json({ ok: true, recorded: false, reason: "no-consent" });
  }

  if (path === "/lab/activity") {
    return NextResponse.json({ ok: true, recorded: false, reason: "ignored-dashboard-self-view" });
  }

  if (!hasActivityStore()) {
    return NextResponse.json({ ok: true, recorded: false, reason: "activity-store-not-configured" });
  }

  const rawEvents = Array.isArray(body.events) ? body.events : [];
  const events = rawEvents
    .slice(0, 60)
    .map((item: unknown) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const eventType = stringValue(record.eventType, 80) as EngagementEvent["eventType"] | null;
      if (!eventType || !EVENT_TYPES.has(eventType)) return null;
      return {
        eventType,
        sessionId: stringValue(record.sessionId, 96),
        articleSlug: stringValue(record.articleSlug, 160),
        sectionId: stringValue(record.sectionId, 220),
        sectionTitle: stringValue(record.sectionTitle, 512),
        sectionType: stringValue(record.sectionType, 80),
        activeMs: numberValue(record.activeMs, 15 * 60 * 1000),
        visibleMs: numberValue(record.visibleMs, 15 * 60 * 1000),
        maxVisibilityRatio: numberValue(record.maxVisibilityRatio, 1),
        maxScrollDepth: numberValue(record.maxScrollDepth, 1),
        isFinal: Boolean(record.isFinal),
        metadata: metadataValue(record.metadata),
      };
    })
    .filter((event): event is NonNullable<typeof event> => Boolean(event));

  if (events.length === 0) {
    return NextResponse.json({ ok: true, recorded: false, reason: "no-valid-events" });
  }

  try {
    const recorded = await recordEngagementEvents(req, {
      path,
      pageTitle: stringValue(body.pageTitle, 512),
      events,
    });
    return NextResponse.json({ ok: true, recorded: recorded > 0, count: recorded });
  } catch (error) {
    console.debug("Engagement logging failed:", error);
    return NextResponse.json({ ok: true, recorded: false, reason: "engagement-write-failed" });
  }
}
