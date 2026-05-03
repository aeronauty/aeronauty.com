import Link from "next/link";
import { privatePosts } from "@/lib/private-writing";
import { privateArticles } from "@/lib/private-articles";

export default function PrivateWritingPage() {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-stone-950">
      <div className="mx-auto w-full max-w-4xl px-6 py-16">
        <div className="mb-12 flex items-center justify-between">
          <Link href="/lab" className="text-sm font-semibold text-[var(--accent)] hover:text-stone-950">
            Aeronauty Lab
          </Link>
          <a href="/api/lab/logout" className="text-sm text-stone-500 hover:text-stone-950">
            Sign out
          </a>
        </div>

        <p className="eyebrow">Private</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight sm:text-6xl">Private writing</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-600">
          Behind-the-scenes notes, early drafts, and private technical write-ups.
        </p>

        {privateArticles.length > 0 && (
          <section className="mt-14">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
              Longform articles
            </h2>
            <div className="mt-5 space-y-5">
              {privateArticles.map((article) => (
                <article
                  key={article.slug}
                  className="rounded-md border border-stone-200 bg-white p-6"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm text-stone-500">{article.date}</p>
                      <h3 className="mt-2 text-2xl font-semibold">{article.title}</h3>
                      <p className="mt-3 leading-7 text-stone-600">{article.description}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-stone-300 px-3 py-1 text-sm font-semibold text-stone-600">
                      {article.status}
                    </span>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {article.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <Link
                    href={`/lab/articles/${article.slug}`}
                    className="mt-6 inline-flex font-semibold text-stone-950 underline decoration-stone-300 underline-offset-4 hover:decoration-[var(--accent)]"
                  >
                    Read private article →
                  </Link>
                </article>
              ))}
            </div>
          </section>
        )}

        {privatePosts.length > 0 && (
          <section className="mt-14">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
              Notes &amp; short posts
            </h2>
            <div className="mt-5 space-y-5">
              {privatePosts.map((post) => (
                <article
                  key={post.slug}
                  className="rounded-md border border-stone-200 bg-white p-6"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm text-stone-500">{post.date}</p>
                      <h3 className="mt-2 text-2xl font-semibold">{post.title}</h3>
                      <p className="mt-3 leading-7 text-stone-600">{post.description}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-stone-300 px-3 py-1 text-sm font-semibold text-stone-600">
                      {post.status}
                    </span>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <Link
                    href={`/lab/writing/${post.slug}`}
                    className="mt-6 inline-flex font-semibold text-stone-950 underline decoration-stone-300 underline-offset-4 hover:decoration-[var(--accent)]"
                  >
                    Read private post →
                  </Link>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
