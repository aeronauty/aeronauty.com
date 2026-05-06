import crypto from "crypto";
import { LAB_SESSION_COOKIE, verifyLabSessionToken } from "@/lib/lab-auth";
import { auth } from "@/lib/auth";
import { getRedisClient, hasRedisConfig } from "@/lib/redis-config";

const ACTIVITY_KEY = "aeronauty:activity:v1";
const ENGAGEMENT_KEY = "aeronauty:engagement:v1";
const MAX_ACTIVITY_EVENTS = 5000;
const MAX_ENGAGEMENT_EVENTS = 5000;

export type ActivityEventType =
  | "page_view"
  | "lab_login"
  | "lab_access"
  | "session_start"
  | "page_engagement"
  | "section_engagement"
  | "article_progress"
  | "session_end";

export type ActivityEvent = {
  id: string;
  eventType: ActivityEventType;
  path: string | null;
  pageTitle: string | null;
  email: string | null;
  authMethod: string | null;
  referrer: string | null;
  userAgent: string | null;
  clientIpHash: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  vercelRegion: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type EngagementEvent = ActivityEvent & {
  eventType:
    | "session_start"
    | "page_engagement"
    | "section_engagement"
    | "article_progress"
    | "session_end";
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

export function hasActivityStore(): boolean {
  return hasRedisConfig();
}

function truncate(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.slice(0, max);
}

function getHeader(req: Request, name: string, max = 1024): string | null {
  return truncate(req.headers.get(name), max);
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip");
}

function hashClientIp(req: Request): string | null {
  const ip = getClientIp(req);
  if (!ip) return null;

  const secret = process.env.AERONAUTY_AUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) return null;

  return crypto.createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32);
}

export async function getKnownUser(req: Request): Promise<{ email: string | null; authMethod: string | null }> {
  try {
    const session = await auth();
    if (session?.user?.email) {
      return { email: session.user.email.toLowerCase(), authMethod: "google" };
    }
  } catch (error) {
    console.debug("NextAuth user lookup failed while recording activity:", error);
  }

  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`${LAB_SESSION_COOKIE}=([^;]+)`));
  const labToken = match?.[1] ? decodeURIComponent(match[1]) : null;
  const labEmail = labToken ? await verifyLabSessionToken(labToken) : null;

  return {
    email: labEmail,
    authMethod: labEmail ? "magic_link" : null,
  };
}

export async function recordActivityEvent(
  req: Request,
  input: {
    eventType: ActivityEvent["eventType"];
    path?: string | null;
    pageTitle?: string | null;
    email?: string | null;
    authMethod?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  const user = await getKnownUser(req);
  const event: ActivityEvent = {
    id: crypto.randomUUID(),
    eventType: input.eventType,
    path: truncate(input.path ?? null, 2048),
    pageTitle: truncate(input.pageTitle ?? null, 512),
    email: input.email ?? user.email,
    authMethod: input.authMethod ?? user.authMethod,
    referrer: getHeader(req, "referer"),
    userAgent: getHeader(req, "user-agent"),
    clientIpHash: hashClientIp(req),
    country: getHeader(req, "x-vercel-ip-country", 32),
    region: getHeader(req, "x-vercel-ip-country-region", 128),
    city: getHeader(req, "x-vercel-ip-city", 256),
    vercelRegion: getHeader(req, "x-vercel-id", 256),
    metadata: input.metadata ?? {},
    createdAt: new Date().toISOString(),
  };

  await redis.lpush(ACTIVITY_KEY, event);
  await redis.ltrim(ACTIVITY_KEY, 0, MAX_ACTIVITY_EVENTS - 1);
}

function clampNumber(value: unknown, min: number, max: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(min, Math.min(max, numeric));
}

function metadataObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function recordEngagementEvents(
  req: Request,
  input: {
    path?: string | null;
    pageTitle?: string | null;
    events: Array<{
      eventType: EngagementEvent["eventType"];
      sessionId?: string | null;
      articleSlug?: string | null;
      sectionId?: string | null;
      sectionTitle?: string | null;
      sectionType?: string | null;
      activeMs?: number;
      visibleMs?: number;
      maxVisibilityRatio?: number;
      maxScrollDepth?: number;
      isFinal?: boolean;
      metadata?: Record<string, unknown>;
    }>;
  }
): Promise<number> {
  const redis = getRedisClient();
  if (!redis || input.events.length === 0) return 0;

  const user = await getKnownUser(req);
  const base = {
    path: truncate(input.path ?? null, 2048),
    pageTitle: truncate(input.pageTitle ?? null, 512),
    email: user.email,
    authMethod: user.authMethod,
    referrer: getHeader(req, "referer"),
    userAgent: getHeader(req, "user-agent"),
    clientIpHash: hashClientIp(req),
    country: getHeader(req, "x-vercel-ip-country", 32),
    region: getHeader(req, "x-vercel-ip-country-region", 128),
    city: getHeader(req, "x-vercel-ip-city", 256),
    vercelRegion: getHeader(req, "x-vercel-id", 256),
  };

  const now = new Date().toISOString();
  const events: EngagementEvent[] = input.events.slice(0, 60).map((item) => ({
    id: crypto.randomUUID(),
    eventType: item.eventType,
    ...base,
    sessionId: truncate(item.sessionId ?? null, 96),
    articleSlug: truncate(item.articleSlug ?? null, 160),
    sectionId: truncate(item.sectionId ?? null, 220),
    sectionTitle: truncate(item.sectionTitle ?? null, 512),
    sectionType: truncate(item.sectionType ?? null, 80),
    activeMs: Math.round(clampNumber(item.activeMs, 0, 15 * 60 * 1000)),
    visibleMs: Math.round(clampNumber(item.visibleMs, 0, 15 * 60 * 1000)),
    maxVisibilityRatio: clampNumber(item.maxVisibilityRatio, 0, 1),
    maxScrollDepth: clampNumber(item.maxScrollDepth, 0, 1),
    isFinal: Boolean(item.isFinal),
    metadata: metadataObject(item.metadata),
    createdAt: now,
  }));

  await redis.lpush(ENGAGEMENT_KEY, ...events);
  await redis.ltrim(ENGAGEMENT_KEY, 0, MAX_ENGAGEMENT_EVENTS - 1);
  return events.length;
}

export async function getRecentActivity(limit = 100): Promise<ActivityEvent[]> {
  const redis = getRedisClient();
  if (!redis) return [];

  const safeLimit = Math.max(1, Math.min(limit, 500));
  return redis.lrange<ActivityEvent>(ACTIVITY_KEY, 0, safeLimit - 1);
}

export async function getRecentEngagement(limit = 500): Promise<EngagementEvent[]> {
  const redis = getRedisClient();
  if (!redis) return [];

  const safeLimit = Math.max(1, Math.min(limit, 1000));
  return redis.lrange<EngagementEvent>(ENGAGEMENT_KEY, 0, safeLimit - 1);
}
