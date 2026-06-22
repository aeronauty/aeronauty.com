import crypto from "crypto";
import { z } from "zod";
import { getRedisClient, hasRedisConfig } from "@/lib/redis-config";
import { deleteScreenshots, getScreenshotUrls } from "@/lib/supabase-storage";
import {
  MAX_CUSTOM_TAGS,
  MAX_CUSTOM_TAG_LEN,
  MAX_COMMENT_LEN,
  isSlopTag,
  type SlopTag,
  type SlopSubmission,
  type SlopSubmissionView,
  type SlopNominee,
  type SlopComment,
  type VoteDirection,
} from "@/lib/slop-shared";

export {
  SLOP_TAGS,
  SLOP_TAG_LABELS,
  type SlopTag,
  type SlopStatus,
  type SlopSubmission,
  type SlopSubmissionView,
  type SlopNominee,
} from "@/lib/slop-shared";

const SUBMISSION_PREFIX = "aeronauty:slop:sub:v1:";
const PENDING_INDEX_KEY = "aeronauty:slop:index:pending:v1";
const WEEK_INDEX_PREFIX = "aeronauty:slop:index:week:v1:";
const WEEKS_KEY = "aeronauty:slop:index:weeks:v1";
// The active round/board. Sticky: changes ONLY when the owner starts a new
// round, never automatically on a calendar boundary.
const ACTIVE_ROUND_KEY = "aeronauty:slop:active-round:v1";
const VOTE_HASH_PREFIX = "aeronauty:slop:vote:v2:"; // <id> -> hash(voterKey -> "up" | "down")
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

/** Strips angle brackets + control chars and caps length for a free-text "Other" tag. */
export function sanitizeCustomTag(raw: string): string {
  const visible = Array.from(raw.replace(/[<>]/g, ""))
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127; // drop control chars
    })
    .join("");
  return visible.trim().slice(0, MAX_CUSTOM_TAG_LEN);
}

export const submissionInputSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .transform(normalizeSubmissionUrl)
    .refine(isValidHttpUrl, "Must be a valid web link"),
  tags: z
    .array(z.string())
    .default([])
    .transform((arr) => Array.from(new Set(arr.filter(isSlopTag))) as SlopTag[]),
  customTags: z
    .array(z.string())
    .default([])
    .transform((arr) => {
      const cleaned = arr.map(sanitizeCustomTag).filter((t) => t.length > 0);
      return Array.from(new Set(cleaned)).slice(0, MAX_CUSTOM_TAGS);
    }),
  reason: z.string().trim().min(3).max(600),
  credit: z.string().trim().max(80).optional(),
}).refine((data) => data.tags.length + data.customTags.length >= 1, {
  message: "Pick at least one tag",
  path: ["tags"],
});

export type SubmissionInput = z.infer<typeof submissionInputSchema>;

export type CreateSubmissionInput = SubmissionInput & {
  imagePaths?: string[];
  previewImageUrl?: string | null;
  previewTitle?: string | null;
  previewDescription?: string | null;
  embedActivityId?: string | null;
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

/**
 * The id of the active leaderboard round. This is deliberately STICKY — it
 * changes only when the owner calls startNewRound(), never on a week boundary —
 * so the board never resets itself on the calendar. Lazily seeded to the current
 * ISO week the first time it is read.
 */
export async function getActiveRound(): Promise<string> {
  const redis = getRedisClient();
  if (!redis) return currentWeekKey();
  const current = await redis.get<string>(ACTIVE_ROUND_KEY);
  if (typeof current === "string" && current.length > 0) return current;
  const init = currentWeekKey();
  await redis.set(ACTIVE_ROUND_KEY, init);
  await redis.sadd(WEEKS_KEY, init);
  return init;
}

/**
 * Starts a fresh, empty round and makes it active. The previous round's
 * nominees stay in Redis (archived under their round id) — nothing is deleted,
 * they just stop showing on the board. Returns the new round id. Owner-only.
 */
export async function startNewRound(): Promise<string | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  const id = `round-${Date.now().toString(36)}`;
  await redis.set(ACTIVE_ROUND_KEY, id);
  await redis.sadd(WEEKS_KEY, id);
  return id;
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // The platform proxy (Vercel) appends the real client IP LAST. The left-most
    // entries are attacker-controllable, so trust the right-most hop, not the first.
    const parts = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
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
  const row = await redis.get<SlopSubmission>(`${SUBMISSION_PREFIX}${id}`);
  return row ? normalizeSubmission(row) : null;
}

export async function createSubmission(input: CreateSubmissionInput): Promise<SlopSubmission> {
  const redis = getRedisClient();
  if (!redis) throw new Error("Slop store is not configured");

  const submission: SlopSubmission = {
    id: crypto.randomUUID(),
    url: input.url,
    tags: input.tags,
    customTags: input.customTags,
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
    embedActivityId: input.embedActivityId ?? null,
  };

  await redis.set(`${SUBMISSION_PREFIX}${submission.id}`, submission);
  await redis.sadd(PENDING_INDEX_KEY, submission.id);
  return submission;
}

/** Backfills newer fields for records stored under older shapes (single imagePath, single category). */
function normalizeSubmission(row: SlopSubmission): SlopSubmission {
  const next = { ...row };
  if (!Array.isArray(next.imagePaths)) {
    const legacy = (next as { imagePath?: string | null }).imagePath ?? null;
    next.imagePaths = legacy ? [legacy] : [];
  }
  if (!Array.isArray(next.tags)) {
    const legacyCategory = (next as { category?: string }).category;
    next.tags = legacyCategory && isSlopTag(legacyCategory) ? [legacyCategory] : [];
  }
  if (!Array.isArray(next.customTags)) next.customTags = [];
  if (next.embedActivityId === undefined) next.embedActivityId = null;
  return next;
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

  const weekKey = await getActiveRound();
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

/** Removes a submission whether it is held (pending) or live (approved). */
export async function rejectSubmission(id: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  const submission = await getSubmission(id);
  await redis.del(`${SUBMISSION_PREFIX}${id}`);
  await redis.srem(PENDING_INDEX_KEY, id);
  if (submission?.weekKey) {
    await redis.srem(`${WEEK_INDEX_PREFIX}${submission.weekKey}`, id);
  }
  await deleteScreenshots(submission ? normalizeSubmission(submission).imagePaths : []);
  await clearComments(id);
}

export async function listNominees(roundId?: string): Promise<SlopNominee[]> {
  const redis = getRedisClient();
  if (!redis) return [];

  const round = roundId ?? (await getActiveRound());
  const ids = await redis.smembers(`${WEEK_INDEX_PREFIX}${round}`);
  const submissions = await loadSubmissions(ids);
  if (submissions.length === 0) return [];

  const [views, tallies] = await Promise.all([
    attachScreenshots(submissions),
    Promise.all(submissions.map((submission) => tallyVotes(submission.id))),
  ]);

  const nominees: SlopNominee[] = views.map((view, index) => {
    const { up, down } = tallies[index];
    return { ...view, upvotes: up, downvotes: down, score: up - down };
  });

  return nominees.sort((a, b) => b.score - a.score || (a.createdAt < b.createdAt ? 1 : -1));
}

async function tallyVotes(id: string): Promise<{ up: number; down: number }> {
  const redis = getRedisClient();
  if (!redis) return { up: 0, down: 0 };
  const votes = (await redis.hgetall<Record<string, VoteDirection>>(`${VOTE_HASH_PREFIX}${id}`)) ?? {};
  let up = 0;
  let down = 0;
  for (const direction of Object.values(votes)) {
    if (direction === "up") up += 1;
    else if (direction === "down") down += 1;
  }
  return { up, down };
}

export async function castVote(
  req: Request,
  id: string,
  direction: VoteDirection
): Promise<{ ok: boolean; upvotes: number; downvotes: number; score: number; yourVote: VoteDirection | null }> {
  const redis = getRedisClient();
  const fail = { ok: false, upvotes: 0, downvotes: 0, score: 0, yourVote: null };
  if (!redis) return fail;

  const submission = await getSubmission(id);
  if (!submission || submission.status !== "approved") return fail;

  const voter = clientKey(req);
  const hashKey = `${VOTE_HASH_PREFIX}${id}`;
  let yourVote: VoteDirection | null = direction;

  if (voter) {
    const previous = await redis.hget<VoteDirection>(hashKey, voter);
    if (previous === direction) {
      await redis.hdel(hashKey, voter); // clicking the same arrow again clears the vote
      yourVote = null;
    } else {
      await redis.hset(hashKey, { [voter]: direction });
    }
  }

  const { up, down } = await tallyVotes(id);
  return { ok: true, upvotes: up, downvotes: down, score: up - down, yourVote };
}

// ---- Comments -------------------------------------------------------------

const COMMENTS_HASH_PREFIX = "aeronauty:slop:comments:v1:"; // <subId> -> hash(commentId -> json)
const COMMENTS_INDEX_PREFIX = "aeronauty:slop:comments:idx:v1:"; // <subId> -> zset(commentId by ts)
const COMMENT_RATE_PREFIX = "aeronauty:slop:crate:v1:";
const COMMENT_RATE_WINDOW_SECONDS = 60 * 60;
const COMMENT_MAX_PER_WINDOW = 12;
const MAX_COMMENTS_PER_SUBMISSION = 500;
const COMMENTS_DISPLAY_LIMIT = 200;

export type NewCommentInput = {
  submissionId: string;
  body: string;
  authorName: string | null;
  verified: boolean;
  isOwner: boolean;
};

/** True when the client is under the per-window comment limit. */
export async function rateLimitComment(req: Request): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return true;
  const key = clientKey(req);
  if (!key) return true;
  const rateKey = `${COMMENT_RATE_PREFIX}${key}`;
  const count = await redis.incr(rateKey);
  if (count === 1) await redis.expire(rateKey, COMMENT_RATE_WINDOW_SECONDS);
  return count <= COMMENT_MAX_PER_WINDOW;
}

/** Adds a comment to an approved nominee. Returns the stored comment, or null if not allowed. */
export async function addComment(input: NewCommentInput): Promise<SlopComment | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  const submission = await getSubmission(input.submissionId);
  if (!submission || submission.status !== "approved") return null;

  const body = input.body.trim().slice(0, MAX_COMMENT_LEN);
  if (!body) return null;

  const comment: SlopComment = {
    id: crypto.randomUUID(),
    body,
    authorName: input.authorName?.trim() ? input.authorName.trim().slice(0, 80) : null,
    verified: input.verified,
    isOwner: input.isOwner,
    createdAt: new Date().toISOString(),
  };

  const hashKey = `${COMMENTS_HASH_PREFIX}${input.submissionId}`;
  const indexKey = `${COMMENTS_INDEX_PREFIX}${input.submissionId}`;
  const score = Date.parse(comment.createdAt);

  await redis.hset(hashKey, { [comment.id]: comment });
  await redis.zadd(indexKey, { score, member: comment.id });

  // Trim oldest beyond the cap.
  const total = await redis.zcard(indexKey);
  if (total > MAX_COMMENTS_PER_SUBMISSION) {
    const excess = total - MAX_COMMENTS_PER_SUBMISSION;
    const oldest = await redis.zrange<string[]>(indexKey, 0, excess - 1);
    if (oldest.length) {
      await redis.zrem(indexKey, ...oldest);
      await redis.hdel(hashKey, ...oldest);
    }
  }

  return comment;
}

/** Lists a nominee's comments, newest first. */
export async function listComments(submissionId: string): Promise<SlopComment[]> {
  const redis = getRedisClient();
  if (!redis) return [];

  const indexKey = `${COMMENTS_INDEX_PREFIX}${submissionId}`;
  const ids = await redis.zrange<string[]>(indexKey, 0, COMMENTS_DISPLAY_LIMIT - 1, { rev: true });
  if (!ids.length) return [];

  const hashKey = `${COMMENTS_HASH_PREFIX}${submissionId}`;
  const rows = await redis.hmget<Record<string, SlopComment>>(hashKey, ...ids);
  if (!rows) return [];

  return ids
    .map((id) => rows[id])
    .filter((row): row is SlopComment => Boolean(row));
}

export async function countComments(submissionId: string): Promise<number> {
  const redis = getRedisClient();
  if (!redis) return 0;
  return redis.zcard(`${COMMENTS_INDEX_PREFIX}${submissionId}`);
}

export async function deleteComment(submissionId: string, commentId: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  await redis.hdel(`${COMMENTS_HASH_PREFIX}${submissionId}`, commentId);
  await redis.zrem(`${COMMENTS_INDEX_PREFIX}${submissionId}`, commentId);
}

/** Removes a submission's entire comment thread (used when a submission is rejected/removed). */
export async function clearComments(submissionId: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  await redis.del(`${COMMENTS_HASH_PREFIX}${submissionId}`);
  await redis.del(`${COMMENTS_INDEX_PREFIX}${submissionId}`);
}
