import crypto from "crypto";
import { Redis } from "@upstash/redis";
import { LAB_SESSION_COOKIE, verifyLabSessionToken } from "@/lib/lab-auth";
import { auth } from "@/lib/auth";

const ACTIVITY_KEY = "aeronauty:activity:v1";
const MAX_ACTIVITY_EVENTS = 5000;

export type ActivityEvent = {
  id: string;
  eventType: "page_view" | "lab_login" | "lab_access";
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

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
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
  const session = await auth();
  if (session?.user?.email) {
    return { email: session.user.email.toLowerCase(), authMethod: "google" };
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
  const redis = getRedis();
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

export async function getRecentActivity(limit = 100): Promise<ActivityEvent[]> {
  const redis = getRedis();
  if (!redis) return [];

  const safeLimit = Math.max(1, Math.min(limit, 500));
  return redis.lrange<ActivityEvent>(ACTIVITY_KEY, 0, safeLimit - 1);
}
