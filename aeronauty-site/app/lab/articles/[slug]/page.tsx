import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrivateArticle, privateArticles } from "@/lib/private-articles";

export function generateStaticParams() {
  return privateArticles.map((a) => ({ slug: a.slug }));
}

export const dynamic = "force-dynamic";

export default function LabArticlePage({ params }: { params: { slug: string } }) {
  const article = getPrivateArticle(params.slug);
  if (!article) notFound();

  const src = `${article.assetPrefix}/${article.buildFile}`;

  return (
    <main className="flex min-h-screen flex-col bg-[var(--paper)] text-stone-950">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-stone-200 bg-[var(--paper)] px-6 py-3">
        <div className="flex items-center gap-4">
          <Link
            href="/lab/writing"
            className="text-sm font-semibold text-[var(--accent)] hover:text-stone-950"
          >
            Private writing
          </Link>
          <span className="text-sm text-stone-400">/</span>
          <span className="text-sm text-stone-500">{article.title}</span>
        </div>
        <a
          href="/api/lab/logout"
          className="text-sm text-stone-500 hover:text-stone-950"
        >
          Sign out
        </a>
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
