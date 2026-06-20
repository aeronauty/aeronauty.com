// Client-safe types + helpers for posts (no Redis imports).

export type PostStatus = "draft" | "published";
export type PostFormat = "markdown" | "html";

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
