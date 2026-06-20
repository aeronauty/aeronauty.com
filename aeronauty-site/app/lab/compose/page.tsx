import Link from "next/link";
import { hasPostsStore, listPosts } from "@/lib/posts-store";
import { isOwnerRequest } from "@/lib/owner";
import PostComposer from "@/components/PostComposer";

export const dynamic = "force-dynamic";

export default async function ComposePage() {
  const isOwner = await isOwnerRequest();

  if (!isOwner) {
    return (
      <main className="min-h-screen bg-[var(--paper)] text-stone-950">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
          <p className="eyebrow">Compose</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Owner only</h1>
          <p className="mt-4 leading-7 text-stone-600">Sign in as the owner to write posts.</p>
          <Link
            href="/lab/login"
            className="mt-8 inline-flex w-fit rounded-full bg-stone-950 px-5 py-3 font-semibold text-white transition hover:bg-stone-800"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const posts = hasPostsStore() ? await listPosts() : [];

  return (
    <main className="min-h-screen bg-[var(--paper)] text-stone-950">
      <div className="mx-auto w-full max-w-5xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/lab" className="text-sm font-semibold text-[var(--accent)] hover:text-stone-950">
            ← Lab
          </Link>
          <Link href="/posts" className="text-sm text-stone-500 hover:text-stone-950">
            View posts →
          </Link>
        </div>
        <p className="eyebrow">Compose</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Write a post</h1>
        <p className="mt-3 text-stone-600">
          Markdown supported. Save a draft to keep it private, or publish to put it live at /posts.
        </p>

        <div className="mt-8">
          {hasPostsStore() ? (
            <PostComposer initialPosts={posts} />
          ) : (
            <div className="rounded-md border border-amber-700/25 bg-amber-700/10 p-5 text-sm text-amber-900">
              Redis isn&apos;t configured, so posts can&apos;t be stored.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
