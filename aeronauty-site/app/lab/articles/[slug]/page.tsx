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
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-gray-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <Link
            href="/lab/writing"
            className="text-sm font-semibold text-blue-300 hover:text-blue-200"
          >
            ← Private writing
          </Link>
          <span className="text-sm text-gray-500">·</span>
          <span className="text-sm text-gray-400">{article.title}</span>
        </div>
        <a
          href="/api/lab/logout"
          className="text-sm text-gray-400 hover:text-white"
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
