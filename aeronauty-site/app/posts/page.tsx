import Link from "next/link";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import { hasPostsStore, listPosts } from "@/lib/posts-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Posts — Aeronauty",
  description: "Short posts, debunks, and notes.",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function PostsPage() {
  const posts = hasPostsStore() ? await listPosts({ publishedOnly: true }) : [];

  return (
    <div className="min-h-screen bg-[var(--paper)] text-stone-950">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8 lg:px-10">
        <header className="border-b border-stone-300 pb-10">
          <p className="eyebrow">Posts</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight sm:text-6xl">Posts &amp; debunks.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">
            Shorter notes — the debunks, the asides, the things that don&apos;t need a whole essay.
          </p>
        </header>

        {posts.length === 0 ? (
          <p className="mt-12 text-stone-500">Nothing published yet.</p>
        ) : (
          <div className="mt-10 space-y-3">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/posts/${post.slug}`}
                className="block rounded-md border border-stone-200 bg-white p-6 transition hover:border-stone-400 hover:shadow-[0_18px_50px_rgba(28,25,23,0.08)]"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {post.title}
                    {post.format === "html" && (
                      <span className="ml-2 align-middle rounded-full bg-teal-700/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-teal-800">
                        Interactive
                      </span>
                    )}
                  </h2>
                  <span className="shrink-0 text-sm text-stone-400">{formatDate(post.publishedAt)}</span>
                </div>
                {post.summary && <p className="mt-3 leading-7 text-stone-600">{post.summary}</p>}
                {post.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {post.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
