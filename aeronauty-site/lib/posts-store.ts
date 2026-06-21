import crypto from "crypto";
import { getRedisClient, hasRedisConfig } from "@/lib/redis-config";
import { slugify, type Post, type PostStatus, type PostFormat } from "@/lib/posts-shared";

export { slugify, type Post, type PostStatus, type PostFormat } from "@/lib/posts-shared";

const POST_PREFIX = "aeronauty:post:v1:";
const SLUG_PREFIX = "aeronauty:postslug:v1:";
const INDEX_KEY = "aeronauty:posts:index:v1";

export function hasPostsStore(): boolean {
  return hasRedisConfig();
}

function orderScore(post: Post): number {
  return Date.parse(post.publishedAt ?? post.createdAt) || 0;
}

export async function getPostById(id: string): Promise<Post | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  return (await redis.get<Post>(`${POST_PREFIX}${id}`)) ?? null;
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  const id = await redis.get<string>(`${SLUG_PREFIX}${slug}`);
  return id ? getPostById(id) : null;
}

async function uniqueSlug(base: string): Promise<string> {
  const redis = getRedisClient();
  if (!redis) return base;
  if (!(await redis.exists(`${SLUG_PREFIX}${base}`))) return base;
  for (let i = 2; i < 50; i += 1) {
    const candidate = `${base}-${i}`;
    if (!(await redis.exists(`${SLUG_PREFIX}${candidate}`))) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

export type SavePostInput = {
  id?: string | null;
  title: string;
  summary?: string;
  body: string;
  format?: PostFormat;
  tags?: string[];
  status: PostStatus;
};

/** Creates a new post or updates an existing one (by id). Slug is fixed once created. */
export async function savePost(input: SavePostInput): Promise<Post | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  const now = new Date().toISOString();
  const existing = input.id ? await getPostById(input.id) : null;
  const id = existing?.id ?? crypto.randomUUID();
  const slug = existing?.slug ?? (await uniqueSlug(slugify(input.title)));

  const post: Post = {
    id,
    slug,
    title: input.title.trim().slice(0, 200),
    summary: (input.summary ?? "").trim().slice(0, 400),
    body: input.body,
    format: input.format === "html" ? "html" : "markdown",
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 8),
    status: input.status,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    publishedAt: input.status === "published" ? (existing?.publishedAt ?? now) : null,
  };

  await redis.set(`${POST_PREFIX}${id}`, post);
  await redis.set(`${SLUG_PREFIX}${slug}`, id);
  await redis.zadd(INDEX_KEY, { score: orderScore(post), member: id });
  return post;
}

export async function listPosts(opts: { publishedOnly?: boolean } = {}): Promise<Post[]> {
  const redis = getRedisClient();
  if (!redis) return [];
  const ids = await redis.zrange<string[]>(INDEX_KEY, 0, -1, { rev: true });
  if (!ids.length) return [];
  const rows = await redis.mget<(Post | null)[]>(...ids.map((id) => `${POST_PREFIX}${id}`));
  const posts = rows.filter((p): p is Post => Boolean(p));
  return opts.publishedOnly ? posts.filter((p) => p.status === "published") : posts;
}

/** Published posts carrying a given tag (case-insensitive), newest first. */
export async function listPostsByTag(tag: string): Promise<Post[]> {
  const needle = tag.toLowerCase();
  const posts = await listPosts({ publishedOnly: true });
  return posts.filter((post) => post.tags.some((t) => t.toLowerCase() === needle));
}

export async function deletePost(id: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  const post = await getPostById(id);
  if (!post) return;
  await redis.del(`${POST_PREFIX}${id}`);
  await redis.del(`${SLUG_PREFIX}${post.slug}`);
  await redis.zrem(INDEX_KEY, id);
}
