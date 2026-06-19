import crypto from "crypto";
import { z } from "zod";
import { getRedisClient, hasRedisConfig } from "@/lib/redis-config";
import { deleteScreenshots, getScreenshotUrls } from "@/lib/supabase-storage";
import {
  SLOP_CATEGORIES,
  type SlopSubmission,
  type SlopSubmissionView,
  type SlopNominee,
} from "@/lib/slop-shared";

export {
  SLOP_CATEGORIES,
  SLOP_CATEGORY_LABELS,
  type SlopCategory,
  type SlopStatus,
  type SlopSubmission,
  type SlopSubmissionView,
  type SlopNominee,
} from "@/lib/slop-shared";

const SUBMISSION_PREFIX = "aeronauty:slop:sub:v1:";
const PENDING_INDEX_KEY = "aeronauty:slop:index:pending:v1";
const WEEK_INDEX_PREFIX = "aeronauty:slop:index:week:v1:";
const WEEKS_KEY = "aeronauty:slop:index:weeks:v1";
const VOTES_PREFIX = "aeronauty:slop:votes:v1:";
const VOTERS_PREFIX = "aeronauty:slop:voters:v1:";
const RATE_PREFIX = "aeronauty:slop:rate:v1:";

const SUBMIT_WINDOW_SECONDS = 60 * 60;
const SUBMIT_MAX_PER_WINDOW = 8;

/**
 * Forgiving link normalization: trims, strips stray leading junk, and prepends
 * https:// when the scheme is missing — so "linkedin.com/...", "www.x.com/...",
 * and "//example.com" all become valid URLs. Does not force www (that breaks
 * apex-only hosts).
 */
export function normalizeSubmissionUrl(raw: string): string {
  let value = raw.trim().replace(/^[@<]+/, "").replace(/[>]+$/, "").trim();
  if (!value) return value;
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value.replace(/^\/+/, "")}`;
  }
  return value;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname.includes(".")
    );
  } catch {
    return false;
  }
}

export const submissionInputSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .transform(normalizeSubmissionUrl)
    .refine(isValidHttpUrl, "Must be a valid web link"),
  category: z.enum(SLOP_CATEGORIES),
  reason: z.string().trim().min(3).max(600),
  credit: z.string().trim().max(80).optional(),
});

export type SubmissionInput = z.infer<typeof submissionInputSchema>;

export type CreateSubmissionInput = SubmissionInput & {
  imagePaths?: string[];
  previewImageUrl?: string | null;
  previewTitle?: string | null;
  previewDescription?: string | null;
};

export function hasSlopStore(): boolean {
  return hasRedisConfig();
}

/** ISO-8601 week key, e.g. "2026-W25". UTC-based so it is stable across regions. */
export function currentWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // shift to the Thursday of this week
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7;
  const week =
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + firstThursdayDayNum) / 7
    );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip");
}

/** Stable, non-reversible per-client key used for rate limiting and one-vote-per-person. */
export function clientKey(req: Request): string | null {
  const ip = getClientIp(req);
  if (!ip) return null;

  const secret = process.env.AERONAUTY_AUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) return null;

  return crypto.createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32);
}

/** Returns true when the submission is allowed, false when the client is over the window limit. */
export async function rateLimitSubmit(req: Request): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return true;

  const key = clientKey(req);
  if (!key) return true; // cannot identify the client (e.g. local dev) — let it through

  const rateKey = `${RATE_PREFIX}${key}`;
  const count = await redis.incr(rateKey);
  if (count === 1) {
    await redis.expire(rateKey, SUBMIT_WINDOW_SECONDS);
  }
  return count <= SUBMIT_MAX_PER_WINDOW;
}

export async function getSubmission(id: string): Promise<SlopSubmission | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  return (await redis.get<SlopSubmission>(`${SUBMISSION_PREFIX}${id}`)) ?? null;
}

export async function createSubmission(input: CreateSubmissionInput): Promise<SlopSubmission> {
  const redis = getRedisClient();
  if (!redis) throw new Error("Slop store is not configured");

  const submission: SlopSubmission = {
    id: crypto.randomUUID(),
    url: input.url,
    category: input.category,
    reason: input.reason,
    credit: input.credit?.trim() ? input.credit.trim() : null,
    status: "pending",
    weekKey: null,
    createdAt: new Date().toISOString(),
    approvedAt: null,
    imagePaths: input.imagePaths ?? [],
    previewImageUrl: input.previewImageUrl ?? null,
    previewTitle: input.previewTitle ?? null,
    previewDescription: input.previewDescription ?? null,
  };

  await redis.set(`${SUBMISSION_PREFIX}${submission.id}`, submission);
  await redis.sadd(PENDING_INDEX_KEY, submission.id);
  return submission;
}

/** Backfills imagePaths[] for any record stored under the old single-path shape. */
function normalizeSubmission(row: SlopSubmission): SlopSubmission {
  if (Array.isArray(row.imagePaths)) return row;
  const legacy = (row as { imagePath?: string | null }).imagePath ?? null;
  return { ...row, imagePaths: legacy ? [legacy] : [] };
}

async function loadSubmissions(ids: string[]): Promise<SlopSubmission[]> {
  const redis = getRedisClient();
  if (!redis || ids.length === 0) return [];
  const keys = ids.map((id) => `${SUBMISSION_PREFIX}${id}`);
  const rows = await redis.mget<(SlopSubmission | null)[]>(...keys);
  return rows
    .filter((row): row is SlopSubmission => Boolean(row))
    .map(normalizeSubmission);
}

/** Resolves each submission's stored screenshot paths into signed display URLs. */
async function attachScreenshots(submissions: SlopSubmission[]): Promise<SlopSubmissionView[]> {
  const allPaths = submissions.flatMap((submission) => submission.imagePaths);
  const signed = await getScreenshotUrls(allPaths);

  let cursor = 0;
  return submissions.map((submission) => {
    const urls = submission.imagePaths
      .map(() => signed[cursor++])
      .filter((url): url is string => Boolean(url));
    return { ...submission, screenshotUrls: urls };
  });
}

export async function listPending(): Promise<SlopSubmissionView[]> {
  const redis = getRedisClient();
  if (!redis) return [];
  const ids = await redis.smembers(PENDING_INDEX_KEY);
  const submissions = await loadSubmissions(ids);
  submissions.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return attachScreenshots(submissions);
}

export async function approveSubmission(id: string): Promise<SlopSubmission | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  const submission = await getSubmission(id);
  if (!submission || submission.status === "approved") return submission;

  const weekKey = currentWeekKey();
  const updated: SlopSubmission = {
    ...submission,
    status: "approved",
    weekKey,
    approvedAt: new Date().toISOString(),
  };

  await redis.set(`${SUBMISSION_PREFIX}${id}`, updated);
  await redis.srem(PENDING_INDEX_KEY, id);
  await redis.sadd(`${WEEK_INDEX_PREFIX}${weekKey}`, id);
  await redis.sadd(WEEKS_KEY, weekKey);
  return updated;
}

export async function rejectSubmission(id: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  const submission = await getSubmission(id);
  await redis.del(`${SUBMISSION_PREFIX}${id}`);
  await redis.srem(PENDING_INDEX_KEY, id);
  await deleteScreenshots(submission ? normalizeSubmission(submission).imagePaths : []);
}

export async function listNominees(weekKey = currentWeekKey()): Promise<SlopNominee[]> {
  const redis = getRedisClient();
  if (!redis) return [];

  const ids = await redis.smembers(`${WEEK_INDEX_PREFIX}${weekKey}`);
  const submissions = await loadSubmissions(ids);
  if (submissions.length === 0) return [];

  const voteKeys = submissions.map((submission) => `${VOTES_PREFIX}${submission.id}`);
  const voteValues = await redis.mget<(number | null)[]>(...voteKeys);
  const views = await attachScreenshots(submissions);

  const nominees: SlopNominee[] = views.map((view, index) => ({
    ...view,
    votes: Number(voteValues[index] ?? 0),
  }));

  return nominees.sort((a, b) => b.votes - a.votes || (a.createdAt < b.createdAt ? 1 : -1));
}

export async function castVote(
  req: Request,
  id: string
): Promise<{ ok: boolean; votes: number; alreadyVoted: boolean }> {
  const redis = getRedisClient();
  if (!redis) return { ok: false, votes: 0, alreadyVoted: false };

  const submission = await getSubmission(id);
  if (!submission || submission.status !== "approved") {
    return { ok: false, votes: 0, alreadyVoted: false };
  }

  const voter = clientKey(req);
  const votersKey = `${VOTERS_PREFIX}${id}`;
  const votesKey = `${VOTES_PREFIX}${id}`;

  if (voter) {
    const alreadyVoted = await redis.sismember(votersKey, voter);
    if (alreadyVoted) {
      const votes = (await redis.get<number>(votesKey)) ?? 0;
      return { ok: true, votes: Number(votes), alreadyVoted: true };
    }
    await redis.sadd(votersKey, voter);
  }

  const votes = await redis.incr(votesKey);
  return { ok: true, votes: Number(votes), alreadyVoted: false };
}
