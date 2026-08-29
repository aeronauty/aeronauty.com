import "server-only";
import { getSupabaseAdmin, hasSupabase } from "@/lib/supabase-storage";
import {
  LAYOUTS,
  MAX_BODY_LEN,
  MAX_NAME_LEN,
  isLayoutId,
  normaliseHex,
  type BadgeFeedback,
  type BadgeSummary,
  type LayoutId,
} from "@/lib/pf-badges-shared";

const VOTES = "pf_badge_votes";
const FEEDBACK = "pf_badge_feedback";
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

export async function addFeedback(input: {
  kind: "comment" | "palette";
  authorName: unknown;
  body: unknown;
  paletteName?: unknown;
  paletteAccent?: unknown;
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
  if (input.kind === "comment" && !body) return null;
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
      ip_hash: input.ipHash,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("pf badge feedback insert failed:", error?.message);
    return null;
  }
  return toFeedback(data as FeedbackRow);
}

type FeedbackRow = {
  id: string;
  kind: string;
  author_name: string | null;
  body: string | null;
  palette: { name?: string | null; accent?: string | null } | null;
  created_at: string;
};

function toFeedback(row: FeedbackRow): BadgeFeedback {
  return {
    id: row.id,
    kind: row.kind === "palette" ? "palette" : "comment",
    authorName: row.author_name,
    body: row.body,
    palette: row.palette
      ? { name: row.palette.name ?? undefined, accent: row.palette.accent ?? undefined }
      : null,
    createdAt: row.created_at,
  };
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
    feedback: ((feedbackRes.data ?? []) as FeedbackRow[]).map(toFeedback),
    yourVotes: yours,
  };
}
