/**
 * Token storage for connected Google accounts.
 *
 * Priority:
 *  1. Upstash Redis — when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set (Vercel).
 *     Set up via: vercel.com → Storage → Create Database → Upstash Redis
 *  2. Local JSON file — .data/google-tokens.json (dev only, survives hot reloads)
 */

import type { Redis } from "@upstash/redis";
import fs from "fs";
import path from "path";
import { getRedisClient, getRedisConfig } from "@/lib/redis-config";

export interface GoogleTokens {
  email: string;
  name?: string;
  picture?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix ms
}

const REDIS_KEY = "dashboard:google_tokens";
const LOCAL_FILE = path.join(process.cwd(), ".data", "google-tokens.json");

// --- Storage backends ---

function getRedis(): Redis | null {
  const config = getRedisConfig();

  if (!config) {
    const relevant = Object.keys(process.env).filter(
      (k) => /redis|kv_|upstash/i.test(k)
    );
    console.warn(
      "[token-store] No Redis REST URL/token found. Related env vars:",
      relevant.length ? relevant.join(", ") : "(none)"
    );
    return null;
  }

  console.log("[token-store] Using Redis config:", config.source);
  try {
    return getRedisClient();
  } catch (err) {
    console.error("[token-store] Redis init failed:", err);
    return null;
  }
}

function readFile(): GoogleTokens[] {
  try {
    const raw = fs.readFileSync(LOCAL_FILE, "utf-8");
    return JSON.parse(raw) as GoogleTokens[];
  } catch {
    return [];
  }
}

function writeFile(tokens: GoogleTokens[]) {
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(tokens, null, 2));
}

// --- Public API ---

export async function getStoredAccounts(): Promise<GoogleTokens[]> {
  const redis = getRedis();
  if (redis) {
    return (await redis.get<GoogleTokens[]>(REDIS_KEY)) ?? [];
  }
  return readFile();
}

export async function upsertAccount(tokens: GoogleTokens): Promise<void> {
  const redis = getRedis();
  if (redis) {
    const existing = (await redis.get<GoogleTokens[]>(REDIS_KEY)) ?? [];
    const updated = existing.filter((t) => t.email !== tokens.email);
    updated.push(tokens);
    await redis.set(REDIS_KEY, updated);
  } else {
    const existing = readFile();
    const updated = existing.filter((t) => t.email !== tokens.email);
    updated.push(tokens);
    writeFile(updated);
  }
}

export async function removeAccount(email: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    const existing = (await redis.get<GoogleTokens[]>(REDIS_KEY)) ?? [];
    await redis.set(REDIS_KEY, existing.filter((t) => t.email !== email));
  } else {
    const existing = readFile();
    writeFile(existing.filter((t) => t.email !== email));
  }
}
