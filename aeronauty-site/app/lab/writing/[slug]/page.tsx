import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrivatePost, privatePosts } from "@/lib/private-writing";

export function generateStaticParams() {
  return privatePosts.map((post) => ({ slug: post.slug }));
}

export default function PrivatePostPage({ params }: { params: { slug: string } }) {
  const post = getPrivatePost(params.slug);

  if (!post) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[var(--paper)] text-stone-950">
      <article className="mx-auto w-full max-w-3xl px-6 py-16">
        <div className="mb-12 flex items-center justify-between">
          <Link href="/lab/writing" className="text-sm font-semibold text-[var(--accent)] hover:text-stone-950">
            Private writing
          </Link>
          <a href="/api/lab/logout" className="text-sm text-stone-500 hover:text-stone-950">
            Sign out
          </a>
        </div>

        <p className="text-sm text-stone-500">{post.date}</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight sm:text-6xl">{post.title}</h1>
        <p className="mt-5 text-lg leading-8 text-stone-600">{post.description}</p>

        <div className="mt-6 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-600">
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-12 border-t border-stone-300 pt-10">{post.body}</div>
      </article>
    </main>
  );
}
