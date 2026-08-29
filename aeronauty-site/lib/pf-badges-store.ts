import "server-only";
import { getSupabaseAdmin, hasSupabase } from "@/lib/supabase-storage";
import {
  IMAGE_TYPES,
  LAYOUTS,
  MAX_BODY_LEN,
  MAX_IMAGE_BYTES,
  MAX_NAME_LEN,
  isLayoutId,
  normaliseHex,
  type BadgeFeedback,
  type BadgeSummary,
  type LayoutId,
} from "@/lib/pf-badges-shared";

const VOTES = "pf_badge_votes";
const FEEDBACK = "pf_badge_feedback";
const IMAGE_BUCKET = "pf-badge-images";
const FEEDBACK_LIMIT = 200;
const RATE_WINDOW_MINUTES = 60;
const RATE_MAX_FEEDBACK = 10;

export function hasBadgeStore(): boolean {
  return hasSupabase();
}

function trimOrNull(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

/* ------------------------------------------------------------------ votes */

/**
 * Replace this voter's whole ballot. Approval voting: they may back several
 * layouts, and re-submitting is an edit, not a second vote — hence delete-then-
 * insert against `voter_key` rather than appending rows.
 */
export async function setVotes(
  voterKey: string,
  layouts: LayoutId[],
  voterName: string | null
): Promise<boolean> {
  const sb = getSupabaseAdmin();
  if (!sb) return false;

  const wanted = Array.from(new Set(layouts.filter(isLayoutId)));

  const { error: delError } = await sb.from(VOTES).delete().eq("voter_key", voterKey);
  if (delError) {
    console.error("pf badge vote clear failed:", delError.message);
    return false;
  }
  if (wanted.length === 0) return true; // clearing your ballot is legitimate

  const { error } = await sb.from(VOTES).insert(
    wanted.map((layout) => ({
      voter_key: voterKey,
      layout,
      voter_name: trimOrNull(voterName, MAX_NAME_LEN),
    }))
  );
  if (error) {
    console.error("pf badge vote insert failed:", error.message);
    return false;
  }
  return true;
}

/* --------------------------------------------------------------- feedback */

/** True when this client is under the per-window feedback limit. Fails open. */
export async function rateLimitFeedback(ipHash: string | null): Promise<boolean> {
  if (!ipHash) return true;
  const sb = getSupabaseAdmin();
  if (!sb) return true;
  const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000).toISOString();
  const { count, error } = await sb
    .from(FEEDBACK)
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if (error) {
    console.error("pf badge feedback rate-limit check failed:", error.message);
    return true;
  }
  return (count ?? 0) < RATE_MAX_FEEDBACK;
}

/**
 * Sniff the real format from the first bytes. The declared content-type is
 * attacker-controlled, so it is never the thing we trust.
 */
function sniffImage(buf: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  const ascii = (i: number, s: string) =>
    s.split("").every((c, k) => buf[i + k] === c.charCodeAt(0));
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  return null;
}

export type UploadResult = { path: string } | { error: string };

/** Store one image. Returns its object path, or a message safe to show a visitor. */
export async function uploadFeedbackImage(file: File): Promise<UploadResult> {
  const sb = getSupabaseAdmin();
  if (!sb) return { error: "Image uploads aren't configured." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "That image is too large." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImage(bytes);
  // Both must agree, and both must be on the allow-list.
  if (!sniffed || !IMAGE_TYPES.includes(sniffed as (typeof IMAGE_TYPES)[number])) {
    return { error: "That doesn't look like a JPEG, PNG or WebP." };
  }

  const ext = sniffed === "image/jpeg" ? "jpg" : sniffed === "image/png" ? "png" : "webp";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(IMAGE_BUCKET).upload(path, bytes, {
    contentType: sniffed,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) {
    console.error("pf badge image upload failed:", error.message);
    return { error: "Couldn't store that image." };
  }
  return { path };
}

function publicImageUrl(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>, path: string) {
  return sb.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function addFeedback(input: {
  kind: "comment" | "palette";
  authorName: unknown;
  body: unknown;
  paletteName?: unknown;
  paletteAccent?: unknown;
  parentId?: string | null;
  imagePath?: string | null;
  imageW?: number | null;
  imageH?: number | null;
  ipHash: string | null;
}): Promise<BadgeFeedback | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const authorName = trimOrNull(input.authorName, MAX_NAME_LEN);
  const body = trimOrNull(input.body, MAX_BODY_LEN);
  const accent = normaliseHex(input.paletteAccent);

  // A name is required on everything that lands in the feed. The committee is
  // reading this to work out who wants what — an anonymous pile of opinions is
  // not useful to them, and half-anonymous entries would just look broken.
  if (!authorName) return null;
  // A comment needs words OR a picture — an image on its own is a fair comment.
  if (input.kind === "comment" && !body && !input.imagePath) return null;
  if (input.kind === "palette" && !accent) return null;

  const { data, error } = await sb
    .from(FEEDBACK)
    .insert({
      kind: input.kind,
      author_name: authorName,
      body,
      palette:
        input.kind === "palette"
          ? { name: trimOrNull(input.paletteName, MAX_NAME_LEN), accent }
          : null,
      parent_id: input.parentId ?? null,
      image_path: input.imagePath ?? null,
      image_w: input.imageW ?? null,
      image_h: input.imageH ?? null,
      ip_hash: input.ipHash,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("pf badge feedback insert failed:", error?.message);
    return null;
  }
  return toFeedback(data as FeedbackRow, (path) => publicImageUrl(sb, path));
}

type FeedbackRow = {
  id: string;
  kind: string;
  author_name: string | null;
  body: string | null;
  palette: { name?: string | null; accent?: string | null } | null;
  parent_id: string | null;
  image_path: string | null;
  image_w: number | null;
  image_h: number | null;
  created_at: string;
};

function toFeedback(row: FeedbackRow, imageUrl: (p: string) => string): BadgeFeedback {
  return {
    id: row.id,
    kind: row.kind === "palette" ? "palette" : "comment",
    authorName: row.author_name,
    body: row.body,
    palette: row.palette
      ? { name: row.palette.name ?? undefined, accent: row.palette.accent ?? undefined }
      : null,
    image: row.image_path
      ? { url: imageUrl(row.image_path), w: row.image_w, h: row.image_h }
      : null,
    createdAt: row.created_at,
    replies: [],
  };
}

/**
 * Flat rows -> one level of threads.
 *
 * Top-level items stay newest-first (the feed reads as a feed), but replies run
 * oldest-first inside each thread, because a conversation should read downwards.
 * A reply whose parent is missing is promoted to top level rather than dropped —
 * losing someone's comment to a deleted parent would be worse than a stray one.
 */
function buildThreads(rows: FeedbackRow[], imageUrl: (p: string) => string): BadgeFeedback[] {
  const byId = new Map<string, BadgeFeedback>();
  for (const r of rows) byId.set(r.id, toFeedback(r, imageUrl));

  const top: BadgeFeedback[] = [];
  for (const r of rows) {
    const item = byId.get(r.id)!;
    const parent = r.parent_id ? byId.get(r.parent_id) : undefined;
    if (parent) parent.replies.push(item);
    else top.push(item);
  }
  for (const t of top) {
    t.replies.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return top;
}

/** A reply's parent must exist and must itself be top level. Returns the id to store. */
export async function resolveParent(parentId: unknown): Promise<string | null | "invalid"> {
  if (parentId === undefined || parentId === null || parentId === "") return null;
  if (typeof parentId !== "string") return "invalid";
  const sb = getSupabaseAdmin();
  if (!sb) return "invalid";
  const { data, error } = await sb
    .from(FEEDBACK)
    .select("id, parent_id")
    .eq("id", parentId)
    .maybeSingle();
  if (error || !data) return "invalid";
  // one level only — you cannot reply to a reply
  if ((data as { parent_id: string | null }).parent_id) return "invalid";
  return parentId;
}

/* ---------------------------------------------------------------- summary */

export async function getSummary(voterKey: string | null): Promise<BadgeSummary> {
  const empty: BadgeSummary = {
    tallies: LAYOUTS.map((l) => ({ layout: l.id, votes: 0 })),
    totalVoters: 0,
    feedback: [],
    yourVotes: [],
  };
  const sb = getSupabaseAdmin();
  if (!sb) return empty;

  const [votesRes, feedbackRes] = await Promise.all([
    sb.from(VOTES).select("layout, voter_key"),
    sb.from(FEEDBACK).select("*").order("created_at", { ascending: false }).limit(FEEDBACK_LIMIT),
  ]);

  if (votesRes.error) console.error("pf badge tally failed:", votesRes.error.message);
  if (feedbackRes.error) console.error("pf badge feedback list failed:", feedbackRes.error.message);

  const rows = (votesRes.data ?? []) as { layout: string; voter_key: string }[];
  const counts = new Map<string, number>();
  const voters = new Set<string>();
  const yours: LayoutId[] = [];
  for (const r of rows) {
    counts.set(r.layout, (counts.get(r.layout) ?? 0) + 1);
    voters.add(r.voter_key);
    if (voterKey && r.voter_key === voterKey && isLayoutId(r.layout)) yours.push(r.layout);
  }

  return {
    tallies: LAYOUTS.map((l) => ({ layout: l.id, votes: counts.get(l.id) ?? 0 })),
    totalVoters: voters.size,
    feedback: buildThreads((feedbackRes.data ?? []) as FeedbackRow[], (path) =>
      publicImageUrl(sb, path)
    ),
    yourVotes: yours,
  };
}
