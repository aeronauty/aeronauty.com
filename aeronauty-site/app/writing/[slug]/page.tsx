import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTopologyArticle, topologyArticles } from "@/lib/topology-articles";

export function generateStaticParams() {
  return topologyArticles.map((article) => ({ slug: article.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const article = getTopologyArticle(params.slug);
  if (!article) return {};

  const canonical = `https://www.aeronauty.com/writing/${article.slug}`;

  return {
    title: `${article.title} - Aeronauty`,
    description: article.description,
    alternates: { canonical },
    openGraph: {
      title: article.title,
      description: article.description,
      type: "article",
      url: canonical,
    },
  };
}

export default function PublicWritingArticlePage({ params }: { params: { slug: string } }) {
  const article = getTopologyArticle(params.slug);
  if (!article) notFound();

  const src = `${article.publicAssetPrefix}/${article.buildFile}`;

  return (
    <main className="flex min-h-screen flex-col bg-[var(--paper)] text-stone-950">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-stone-200 bg-[var(--paper)] px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/writing"
            className="shrink-0 text-sm font-semibold text-[var(--accent)] hover:text-stone-950"
          >
            Writing
          </Link>
          <span className="text-sm text-stone-400">/</span>
          <span className="truncate text-sm text-stone-500">{article.title}</span>
        </div>
      </header>

      <iframe
        src={src}
        title={article.title}
        className="block h-full w-full flex-1 border-0"
        style={{ minHeight: "calc(100vh - 49px)" }}
      />
    </main>
  );
}
