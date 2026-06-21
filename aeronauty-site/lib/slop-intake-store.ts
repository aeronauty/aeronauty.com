import "server-only";
import { getSupabaseAdmin, hasSupabase, getScreenshotUrl, uploadScreenshotBuffer } from "@/lib/supabase-storage";
import { SLOP_TAGS, SLOP_TAG_LABELS, type SlopIntakeItem } from "@/lib/slop-shared";

const TABLE = "slop_intake";

export function hasIntakeStore(): boolean {
  return hasSupabase();
}

// ---- tag mapping (sweep sends human labels; map known ones to slugs) ----
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const LABEL_TO_SLUG = new Map<string, string>();
for (const slug of SLOP_TAGS) {
  LABEL_TO_SLUG.set(norm(slug), slug);
  LABEL_TO_SLUG.set(norm(SLOP_TAG_LABELS[slug]), slug);
}

function splitTags(raw: unknown): { tags: string[]; customTags: string[] } {
  const list = Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string") : [];
  const tags = new Set<string>();
  const custom = new Set<string>();
  for (const t of list) {
    const slug = LABEL_TO_SLUG.get(norm(t));
    if (slug) tags.add(slug);
    else if (t.trim()) custom.add(t.trim().slice(0, 40));
  }
  return { tags: Array.from(tags), customTags: Array.from(custom).slice(0, 8) };
}

function decodeDataUrl(value: unknown): { buffer: Buffer; contentType: string } | null {
  if (typeof value !== "string") return null;
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(value.trim());
  if (!match) return null;
  try {
    return { buffer: Buffer.from(match[2], "base64"), contentType: match[1].toLowerCase() };
  } catch {
    return null;
  }
}

function str(v: unknown, max = 2000): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

export type IntakeCandidate = Record<string, unknown>;

/** Ingests one candidate. Returns its id if newly stored, or null if a duplicate (by post_url). */
export async function ingestCandidate(c: IntakeCandidate): Promise<string | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const postUrl = str(c.post_url, 2000);
  const excerpt = str(c.excerpt, 600);
  if (!postUrl || !excerpt) return null; // contract: skip items without a permalink + verbatim excerpt

  // Dedup first so we don't upload an orphan screenshot for a re-seen post.
  const { data: existing } = await sb.from(TABLE).select("id").eq("post_url", postUrl).maybeSingle();
  if (existing) return null;

  let imagePath: string | null = null;
  const decoded = decodeDataUrl(c.screenshot_base64);
  if (decoded) imagePath = await uploadScreenshotBuffer(decoded.buffer, decoded.contentType);

  const { tags, customTags } = splitTags(c.tags);
  const draft = (c.draft_takedown ?? {}) as Record<string, unknown>;
  const severityRaw = typeof c.severity === "number" ? Math.round(c.severity) : null;

  const { data, error } = await sb
    .from(TABLE)
    .insert({
      post_url: postUrl,
      author_name: str(c.author_name, 200),
      author_headline: str(c.author_headline, 400),
      author_handle: str(c.author_handle, 200),
      posted_at: str(c.posted_at, 100),
      captured_at: str(c.captured_at, 60),
      excerpt,
      claim_summary: str(c.claim_summary, 600),
      why_slop: str(c.why_slop, 1200),
      tags,
      custom_tags: customTags,
      severity: severityRaw !== null ? Math.max(1, Math.min(5, severityRaw)) : null,
      priority_author: Boolean(c.priority_author),
      confidence: typeof c.confidence === "number" ? c.confidence : null,
      draft_headline: str(draft.headline, 300),
      draft_body: str(draft.body_markdown, 6000),
      image_path: imagePath,
    })
    .select("id")
    .single();

  if (error || !data) {
    // Unique-violation race => treat as duplicate; other errors surface as skip.
    if (error) console.error("ingestCandidate failed:", error.message);
    return null;
  }
  return data.id as string;
}

type Row = {
  id: string;
  post_url: string;
  author_name: string | null;
  author_headline: string | null;
  posted_at: string | null;
  excerpt: string;
  claim_summary: string | null;
  why_slop: string | null;
  tags: string[];
  custom_tags: string[];
  severity: number | null;
  priority_author: boolean;
  confidence: number | null;
  draft_headline: string | null;
  draft_body: string | null;
  image_path: string | null;
  status: string;
  created_at: string;
};

export async function listIntake(status = "new"): Promise<SlopIntakeItem[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("status", status)
    .order("severity", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) {
    if (error) console.error("listIntake failed:", error.message);
    return [];
  }
  const rows = data as Row[];
  const urls = await Promise.all(rows.map((r) => getScreenshotUrl(r.image_path)));
  return rows.map((r, i) => ({
    id: r.id,
    postUrl: r.post_url,
    authorName: r.author_name,
    authorHeadline: r.author_headline,
    postedAt: r.posted_at,
    excerpt: r.excerpt,
    claimSummary: r.claim_summary,
    whySlop: r.why_slop,
    tags: r.tags ?? [],
    customTags: r.custom_tags ?? [],
    severity: r.severity,
    priorityAuthor: Boolean(r.priority_author),
    confidence: r.confidence,
    draftHeadline: r.draft_headline,
    draftBody: r.draft_body,
    screenshotUrl: urls[i],
    status: r.status,
    createdAt: r.created_at,
  }));
}

export type IntakeRow = {
  post_url: string;
  tags: string[] | null;
  custom_tags: string[] | null;
  image_path: string | null;
  why_slop: string | null;
  claim_summary: string | null;
  draft_headline: string | null;
};

/** Raw fields needed to promote an intake item into a slop submission. */
export async function getIntakeRow(id: string): Promise<IntakeRow | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data } = await sb
    .from(TABLE)
    .select("post_url,tags,custom_tags,image_path,why_slop,claim_summary,draft_headline")
    .eq("id", id)
    .maybeSingle();
  return (data as IntakeRow) ?? null;
}

export async function updateIntakeStatus(id: string, status: string): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  if (!["new", "reviewed", "posted", "dismissed"].includes(status)) return;
  await sb.from(TABLE).update({ status }).eq("id", id);
}
