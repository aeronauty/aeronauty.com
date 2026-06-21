import "server-only";
import crypto from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SCREENSHOT_BUCKET = "slop-screenshots";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — pages that show screenshots are dynamic

function getConfig(): { url: string; secretKey: string } | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  // New-style secret key (sb_secret_...) preferred; legacy service_role JWT still works.
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) return null;
  return { url, secretKey };
}

export function hasImageStore(): boolean {
  return getConfig() !== null;
}

/** True when Supabase (url + secret key) is configured — for storage or DB use. */
export function hasSupabase(): boolean {
  return getConfig() !== null;
}

function getAdminClient(): SupabaseClient | null {
  const config = getConfig();
  if (!config) return null;
  return createClient(config.url, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Server-only Supabase client (secret key, bypasses RLS) — for DB tables too, not just storage. */
export function getSupabaseAdmin(): SupabaseClient | null {
  return getAdminClient();
}

/**
 * Uploads a screenshot to the private bucket and returns its storage path,
 * or null if the store is unconfigured / the upload fails.
 */
export async function uploadScreenshot(file: File): Promise<string | null> {
  const client = getAdminClient();
  if (!client) return null;

  const extension = (file.type.split("/")[1] ?? "png").replace(/[^a-z0-9]/gi, "") || "png";
  const path = `${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${extension}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await client.storage.from(SCREENSHOT_BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    console.error("Screenshot upload failed:", error.message);
    return null;
  }
  return path;
}

/** Uploads a raw image buffer (e.g. a decoded base64 screenshot from the sweep). */
export async function uploadScreenshotBuffer(
  buffer: Buffer,
  contentType: string
): Promise<string | null> {
  const client = getAdminClient();
  if (!client) return null;
  const extension = (contentType.split("/")[1] ?? "png").replace(/[^a-z0-9]/gi, "") || "png";
  const path = `${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage.from(SCREENSHOT_BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (error) {
    console.error("Screenshot buffer upload failed:", error.message);
    return null;
  }
  return path;
}

/** Generates a short-lived signed URL for a stored screenshot path. */
export async function getScreenshotUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const client = getAdminClient();
  if (!client) return null;

  const { data, error } = await client.storage
    .from(SCREENSHOT_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error("Signed URL failed:", error.message);
    return null;
  }
  return data.signedUrl;
}

/** Resolves signed URLs for many paths in one batch (null entries preserved). */
export async function getScreenshotUrls(paths: (string | null)[]): Promise<(string | null)[]> {
  const client = getAdminClient();
  if (!client) return paths.map(() => null);

  const present = paths.filter((path): path is string => Boolean(path));
  if (present.length === 0) return paths.map(() => null);

  const { data, error } = await client.storage
    .from(SCREENSHOT_BUCKET)
    .createSignedUrls(present, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    console.error("Batch signed URLs failed:", error?.message);
    return paths.map(() => null);
  }

  const urlByPath = new Map<string, string | null>();
  data.forEach((entry) => urlByPath.set(entry.path ?? "", entry.signedUrl ?? null));
  return paths.map((path) => (path ? urlByPath.get(path) ?? null : null));
}

export async function deleteScreenshots(paths: string[]): Promise<void> {
  const present = paths.filter((path): path is string => Boolean(path));
  if (present.length === 0) return;
  const client = getAdminClient();
  if (!client) return;
  const { error } = await client.storage.from(SCREENSHOT_BUCKET).remove(present);
  if (error) console.error("Screenshot delete failed:", error.message);
}
