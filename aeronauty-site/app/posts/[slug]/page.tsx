import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import { Markdown } from "@/components/Markdown";
import HtmlEmbed from "@/components/HtmlEmbed";
import PostComments from "@/components/PostComments";
import { getPostBySlug, hasPostsStore } from "@/lib/posts-store";
import { SLOP_SERIES_TAG } from "@/lib/posts-shared";
import { isOwnerRequest } from "@/lib/owner";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const post = hasPostsStore() ? await getPostBySlug(params.slug) : null;
  if (!post) return {};
  return { title: `${post.title} — Aeronauty`, description: post.summary || undefined };
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function PostPage({ params }: { params: { slug: string } }) {
  const post = hasPostsStore() ? await getPostBySlug(params.slug) : null;
  if (!post) notFound();

  // Drafts are visible only to the owner (with a banner).
  const isOwner = await isOwnerRequest();
  if (post.status !== "published" && !isOwner) notFound();

  return (
    <div className="min-h-screen bg-[var(--paper)] text-stone-950">
      <SiteNav />
      <main className="mx-auto max-w-2xl px-5 py-16 sm:px-8">
        <Link href="/posts" className="text-sm font-semibold text-[var(--accent)] hover:text-stone-950">
          ← Posts
        </Link>

        {post.status !== "published" && (
          <p className="mt-6 rounded-md border border-amber-700/25 bg-amber-700/10 px-4 py-2 text-sm text-amber-900">
            Draft — only you can see this.{" "}
            <Link href="/lab/compose" className="font-semibold underline">
              Edit
            </Link>
          </p>
        )}

        <header className="mt-6 border-b border-stone-200 pb-8">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{post.title}</h1>
          <p className="mt-4 text-sm text-stone-400">{formatDate(post.publishedAt ?? post.createdAt)}</p>
          {post.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        <article className="mt-8">
          {post.format === "html" ? (
            <HtmlEmbed html={post.body} title={post.title} />
          ) : (
            <Markdown>{post.body}</Markdown>
          )}
        </article>

        {post.tags.some((t) => t.toLowerCase() === SLOP_SERIES_TAG.toLowerCase()) && (
          <aside className="mt-12 rounded-md border border-stone-200 bg-white p-6">
            <p className="font-semibold text-stone-800">Spotted some slop of your own?</p>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Shit physics or AI slop in the wild — send it over. The worst gets the full forensic
              treatment.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/slop" className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800">
                Submit slop →
              </Link>
              <Link href="/slop#exhibits" className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-500">
                More exhibits
              </Link>
            </div>
          </aside>
        )}

        {post.status === "published" && <PostComments postId={post.id} />}
      </main>
      <SiteFooter />
    </div>
  );
}
