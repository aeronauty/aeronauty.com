import "server-only";
import { getSupabaseAdmin, hasSupabase } from "@/lib/supabase-storage";
import { MAX_COMMENT_LEN } from "@/lib/slop-shared";
import type { PostComment } from "@/lib/posts-shared";

const TABLE = "post_comments";
const RATE_WINDOW_MINUTES = 60;
const RATE_MAX = 12;
const LIST_LIMIT = 200;

export function hasPostCommentsStore(): boolean {
  return hasSupabase();
}

type Row = {
  id: string;
  body: string;
  author_name: string | null;
  verified: boolean;
  is_owner: boolean;
  created_at: string;
};

function toComment(row: Row): PostComment {
  return {
    id: row.id,
    body: row.body,
    authorName: row.author_name ?? null,
    verified: Boolean(row.verified),
    isOwner: Boolean(row.is_owner),
    createdAt: row.created_at,
  };
}

/** True when the client is under the per-window comment limit. Fails open on infra errors. */
export async function rateLimitPostComment(ipHash: string | null): Promise<boolean> {
  if (!ipHash) return true;
  const sb = getSupabaseAdmin();
  if (!sb) return true;
  const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000).toISOString();
  const { count, error } = await sb
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if (error) {
    console.error("post comment rate-limit check failed:", error.message);
    return true;
  }
  return (count ?? 0) < RATE_MAX;
}

export type NewPostComment = {
  postId: string;
  body: string;
  authorName: string | null;
  verified: boolean;
  isOwner: boolean;
  ipHash: string | null;
};

export async function addPostComment(input: NewPostComment): Promise<PostComment | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const body = input.body.trim().slice(0, MAX_COMMENT_LEN);
  if (!body) return null;

  const { data, error } = await sb
    .from(TABLE)
    .insert({
      post_id: input.postId,
      body,
      author_name: input.authorName?.trim() ? input.authorName.trim().slice(0, 80) : null,
      verified: input.verified,
      is_owner: input.isOwner,
      ip_hash: input.ipHash,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("addPostComment failed:", error?.message);
    return null;
  }
  return toComment(data as Row);
}

export async function listPostComments(postId: string): Promise<PostComment[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error || !data) {
    if (error) console.error("listPostComments failed:", error.message);
    return [];
  }
  return (data as Row[]).map(toComment);
}

export async function deletePostComment(id: string): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) console.error("deletePostComment failed:", error.message);
}
