import Link from "next/link";

export default function TheodorsenArticlePage() {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-3 py-4 sm:px-5">
        <div className="mb-4 flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <Link href="/lab" className="text-sm font-semibold text-[var(--accent-deep)] hover:text-stone-950">
              Aeronauty Lab
            </Link>
            <Link href="/lab/theodorsen" className="text-sm text-stone-500 hover:text-stone-950">
              Widget workbench
            </Link>
          </div>
          <a href="/api/lab/logout" className="text-sm text-stone-500 hover:text-stone-950">
            Sign out
          </a>
        </div>
        <iframe
          title="Theodorsen scrollytelling article"
          src="/lab/theodorsen/article/assets/article.html"
          className="min-h-[calc(100vh-4rem)] w-full flex-1 rounded-md border border-stone-200 bg-white"
        />
      </div>
    </main>
  );
}
