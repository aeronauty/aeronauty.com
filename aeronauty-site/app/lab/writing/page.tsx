import Link from "next/link";
import { privatePosts } from "@/lib/private-writing";

export default function PrivateWritingPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto w-full max-w-4xl px-6 py-16">
        <div className="mb-12 flex items-center justify-between">
          <Link href="/lab" className="text-sm font-semibold text-blue-300 hover:text-blue-200">
            Aeronauty Lab
          </Link>
          <a href="/api/lab/logout" className="text-sm text-gray-400 hover:text-white">
            Sign out
          </a>
        </div>

        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-300">Private</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Private writing</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-gray-300">
          Behind-the-scenes notes, early drafts, and private technical write-ups.
        </p>

        <div className="mt-12 space-y-5">
          {privatePosts.map((post) => (
            <article key={post.slug} className="rounded-lg border border-gray-800 bg-gray-900/70 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm text-gray-500">{post.date}</p>
                  <h2 className="mt-2 text-2xl font-semibold">{post.title}</h2>
                  <p className="mt-3 leading-7 text-gray-400">{post.description}</p>
                </div>
                <span className="shrink-0 rounded-full bg-blue-500/15 px-3 py-1 text-sm font-semibold text-blue-200">
                  {post.status}
                </span>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-gray-800 px-3 py-1 text-sm text-gray-300">
                    {tag}
                  </span>
                ))}
              </div>

              <Link
                href={`/lab/writing/${post.slug}`}
                className="mt-6 inline-flex font-semibold text-blue-300 hover:text-blue-200"
              >
                Read private post →
              </Link>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
