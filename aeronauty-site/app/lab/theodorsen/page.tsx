import Link from "next/link";

export default function TheodorsenPage() {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/lab" className="text-sm font-semibold text-[var(--accent-deep)] hover:text-stone-950">
            Aeronauty Lab
          </Link>
          <a href="/api/lab/logout" className="text-sm text-stone-500 hover:text-stone-950">
            Sign out
          </a>
        </div>
        <iframe
          title="Theodorsen private lab"
          src="/lab/theodorsen/assets/site/index.html"
          className="min-h-[calc(100vh-7rem)] w-full flex-1 rounded-md border border-stone-200 bg-white"
        />
      </div>
    </main>
  );
}
