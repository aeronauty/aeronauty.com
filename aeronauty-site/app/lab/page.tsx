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
          This route is protected by a signed magic-link session on Vercel. Private writing,
          behind-the-scenes tools, and work-in-progress demos live here.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Link href="/lab/writing" className="rounded-lg border border-gray-800 bg-gray-900/70 p-5 transition hover:border-blue-400 hover:bg-gray-900">
            <h2 className="font-semibold">Private writing</h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              Early drafts, private notes, and behind-the-scenes technical posts.
            </p>
          </Link>
          <div className="rounded-lg border border-gray-800 bg-gray-900/70 p-5">
            <h2 className="font-semibold">Private demos</h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              Work-in-progress tools and demos can be added here as they become useful.
            </p>
          </div>
          <Link href="/lab/activity" className="rounded-lg border border-gray-800 bg-gray-900/70 p-5 transition hover:border-blue-400 hover:bg-gray-900">
            <h2 className="font-semibold">Activity</h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              See which private posts and demos are actually being used.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
