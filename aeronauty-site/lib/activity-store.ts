import crypto from "crypto";
import { LAB_SESSION_COOKIE, verifyLabSessionToken } from "@/lib/lab-auth";
import { auth } from "@/lib/auth";
import { getRedisClient, hasRedisConfig } from "@/lib/redis-config";

const ACTIVITY_KEY = "aeronauty:activity:v1";
const ENGAGEMENT_KEY = "aeronauty:engagement:v1";
const ENGAGEMENT_PATH_INDEX_KEY = "aeronauty:engagement:agg:path:index:v1";
const ENGAGEMENT_SECTION_INDEX_KEY = "aeronauty:engagement:agg:section:index:v1";
const ENGAGEMENT_PROCESSED_EVENTS_KEY = "aeronauty:engagement:agg:processed-events:v1";
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

export type EngagementPathAggregate = {
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
};

export type EngagementSectionAggregate = {
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

function aggregateKey(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function aggregateNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
}

function aggregateString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function estimatedWordsFromMetadata(metadata: Record<string, unknown>): number {
  const value = metadata.estimatedWords;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isSkim(event: EngagementEvent): boolean {
  const expectedReadMs = Math.max(3000, Math.min(20000, estimatedWordsFromMetadata(event.metadata) * 180));
  return event.visibleMs > 0 && event.activeMs < Math.min(5000, expectedReadMs * 0.35);
}

async function updateAggregateMax(hashKey: string, field: string, value: number): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  const current = aggregateNumber(await redis.hget(hashKey, field));
  if (value > current) {
    await redis.hset(hashKey, { [field]: value });
  }
}

async function updateEngagementAggregates(events: EngagementEvent[]): Promise<void> {
  const redis = getRedisClient();
  if (!redis || events.length === 0) return;

  const firstSeenWrites = new Map<string, string>();

  for (const event of events) {
    const newlyProcessed = await redis.sadd(ENGAGEMENT_PROCESSED_EVENTS_KEY, event.id);
    if (newlyProcessed === 0) continue;

    const sessionId = event.sessionId ?? event.email ?? event.clientIpHash ?? event.id;
    const timestamp = event.createdAt;

    if ((event.eventType === "page_engagement" || event.eventType === "session_end") && event.path) {
      const key = aggregateKey(event.path);
      const hashKey = `aeronauty:engagement:agg:path:${key}:v1`;
      const sessionKey = `aeronauty:engagement:agg:path:${key}:sessions:v1`;
      const exitKey = `aeronauty:engagement:agg:path:${key}:exits:v1`;

      await redis.sadd(ENGAGEMENT_PATH_INDEX_KEY, key);
      await redis.hset(hashKey, {
        path: event.path,
        pageTitle: event.pageTitle ?? "",
        lastSeen: timestamp,
      });
      if (!firstSeenWrites.has(hashKey)) firstSeenWrites.set(hashKey, timestamp);
      await redis.sadd(sessionKey, sessionId);
      await redis.hincrby(hashKey, "activeMs", event.activeMs);
      await redis.hincrby(hashKey, "events", 1);
      await updateAggregateMax(hashKey, "maxScrollDepth", Math.max(0, event.maxScrollDepth));
      if (event.eventType === "session_end") {
        await redis.sadd(exitKey, sessionId);
      }
    }

    if (event.eventType === "section_engagement" && event.articleSlug && event.sectionId) {
      const sectionIdentity = `${event.articleSlug}::${event.sectionId}`;
      const key = aggregateKey(sectionIdentity);
      const hashKey = `aeronauty:engagement:agg:section:${key}:v1`;
      const sessionKey = `aeronauty:engagement:agg:section:${key}:sessions:v1`;
      const skimKey = `aeronauty:engagement:agg:section:${key}:skims:v1`;

      await redis.sadd(ENGAGEMENT_SECTION_INDEX_KEY, key);
      await redis.hset(hashKey, {
        articleSlug: event.articleSlug,
        sectionId: event.sectionId,
        sectionTitle: event.sectionTitle ?? event.sectionId,
        sectionType: event.sectionType ?? "section",
        lastSeen: timestamp,
      });
      if (!firstSeenWrites.has(hashKey)) firstSeenWrites.set(hashKey, timestamp);
      await redis.sadd(sessionKey, sessionId);
      await redis.hincrby(hashKey, "activeMs", event.activeMs);
      await redis.hincrby(hashKey, "visibleMs", event.visibleMs);
      await redis.hincrby(hashKey, "events", 1);
      await updateAggregateMax(hashKey, "maxScrollDepth", Math.max(0, event.maxScrollDepth));
      if (isSkim(event)) {
        await redis.sadd(skimKey, sessionId);
      }
    }

    if (event.eventType === "session_end" && event.articleSlug && event.sectionId) {
      const key = aggregateKey(`${event.articleSlug}::${event.sectionId}`);
      await redis.sadd(`aeronauty:engagement:agg:section:${key}:exits:v1`, sessionId);
    }
  }

  await Promise.all(
    Array.from(firstSeenWrites.entries()).map(([hashKey, timestamp]) => redis.hsetnx(hashKey, "firstSeen", timestamp))
  );
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
  await updateEngagementAggregates(events);
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

  const safeLimit = Math.max(1, Math.min(limit, MAX_ENGAGEMENT_EVENTS));
  return redis.lrange<EngagementEvent>(ENGAGEMENT_KEY, 0, safeLimit - 1);
}

export async function getEngagementAggregates(): Promise<{
  paths: EngagementPathAggregate[];
  sections: EngagementSectionAggregate[];
}> {
  const redis = getRedisClient();
  if (!redis) return { paths: [], sections: [] };

  const recentEvents = await getRecentEngagement(MAX_ENGAGEMENT_EVENTS);
  await updateEngagementAggregates(recentEvents);

  const [pathKeys, sectionKeys] = await Promise.all([
    redis.smembers<string>(ENGAGEMENT_PATH_INDEX_KEY),
    redis.smembers<string>(ENGAGEMENT_SECTION_INDEX_KEY),
  ]);

  const paths = await Promise.all(
    (pathKeys ?? []).map(async (key) => {
      const hashKey = `aeronauty:engagement:agg:path:${key}:v1`;
      const [data, sessions, exits] = await Promise.all([
        redis.hgetall<Record<string, unknown>>(hashKey),
        redis.scard(`aeronauty:engagement:agg:path:${key}:sessions:v1`),
        redis.scard(`aeronauty:engagement:agg:path:${key}:exits:v1`),
      ]);
      return {
        key,
        path: aggregateString(data?.path) ?? "(unknown)",
        pageTitle: aggregateString(data?.pageTitle),
        sessions,
        activeMs: aggregateNumber(data?.activeMs),
        events: aggregateNumber(data?.events),
        exits,
        maxScrollDepth: aggregateNumber(data?.maxScrollDepth),
        firstSeen: aggregateString(data?.firstSeen),
        lastSeen: aggregateString(data?.lastSeen),
      };
    })
  );

  const sections = await Promise.all(
    (sectionKeys ?? []).map(async (key) => {
      const hashKey = `aeronauty:engagement:agg:section:${key}:v1`;
      const [data, sessions, skims, exits] = await Promise.all([
        redis.hgetall<Record<string, unknown>>(hashKey),
        redis.scard(`aeronauty:engagement:agg:section:${key}:sessions:v1`),
        redis.scard(`aeronauty:engagement:agg:section:${key}:skims:v1`),
        redis.scard(`aeronauty:engagement:agg:section:${key}:exits:v1`),
      ]);
      return {
        key,
        articleSlug: aggregateString(data?.articleSlug) ?? "(unknown)",
        sectionId: aggregateString(data?.sectionId) ?? key,
        sectionTitle: aggregateString(data?.sectionTitle) ?? aggregateString(data?.sectionId) ?? key,
        sectionType: aggregateString(data?.sectionType) ?? "section",
        sessions,
        activeMs: aggregateNumber(data?.activeMs),
        visibleMs: aggregateNumber(data?.visibleMs),
        events: aggregateNumber(data?.events),
        skims,
        exits,
        maxScrollDepth: aggregateNumber(data?.maxScrollDepth),
        firstSeen: aggregateString(data?.firstSeen),
        lastSeen: aggregateString(data?.lastSeen),
      };
    })
  );

  return { paths, sections };
}
