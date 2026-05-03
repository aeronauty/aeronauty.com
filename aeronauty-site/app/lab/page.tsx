import Link from "next/link";

export default function LabPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
        <div className="mb-10 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-blue-300 hover:text-blue-200">
            Aeronauty
          </Link>
          <a href="/api/lab/logout" className="text-sm text-gray-400 hover:text-white">
            Sign out
          </a>
        </div>

        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-300">Private Lab</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Gated demos will live here.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-300">
          This route is protected by a signed magic-link session on Vercel. It lets us test private
          Aeronauty demos before moving the public domain away from GitHub Pages.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-800 bg-gray-900/70 p-5">
            <h2 className="font-semibold">Current purpose</h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              Prove the auth flow, cookie behavior, and Vercel deployment path.
            </p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900/70 p-5">
            <h2 className="font-semibold">Next use</h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              Drop in behind-the-scenes tools, work-in-progress demos, and private write-ups.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
