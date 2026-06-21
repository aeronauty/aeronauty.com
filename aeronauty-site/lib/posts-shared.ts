// Client-safe types + helpers for posts (no Redis imports).

export type PostStatus = "draft" | "published";
export type PostFormat = "markdown" | "html";

/** Posts tagged with this show up in the "Slop Forensics" archive on /slop. */
export const SLOP_SERIES_TAG = "Slop Forensics";

export type Post = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  /** Markdown, or a self-contained HTML fragment/document when format === "html". */
  body: string;
  format: PostFormat;
  tags: string[];
  status: PostStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type PostComment = {
  id: string;
  body: string;
  authorName: string | null;
  verified: boolean;
  isOwner: boolean;
  createdAt: string;
};

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "post";
}
