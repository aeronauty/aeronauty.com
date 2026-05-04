import Link from "next/link";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { LAB_SESSION_COOKIE, isLabOwnerEmail, verifyLabSessionToken } from "@/lib/lab-auth";

async function getViewerEmail(): Promise<string | null> {
  const session = await auth().catch(() => null);
  if (session?.user?.email) {
    return session.user.email.toLowerCase();
  }

  const token = cookies().get(LAB_SESSION_COOKIE)?.value;
  return token ? verifyLabSessionToken(token) : null;
}

export default async function LabPage() {
  const viewerEmail = await getViewerEmail();
  const isOwner = Boolean(viewerEmail && isLabOwnerEmail(viewerEmail));

  return (
    <main className="min-h-screen bg-[var(--paper)] text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
        <div className="mb-10 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-[var(--accent)] hover:text-stone-950">
            Aeronauty
          </Link>
          <a href="/api/lab/logout" className="text-sm text-stone-500 hover:text-stone-950">
            Sign out
          </a>
        </div>

        <p className="eyebrow">Private lab</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight sm:text-6xl">
          Work in public. Draft in private.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">
          This route is protected by a signed magic-link session on Vercel. Private writing,
          behind-the-scenes tools, and work-in-progress demos live here.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Link href="/lab/writing" className="rounded-md border border-stone-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-[0_18px_50px_rgba(28,25,23,0.08)]">
            <h2 className="font-semibold">Private writing</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Early drafts, private notes, and behind-the-scenes technical posts.
            </p>
          </Link>
          <div className="rounded-md border border-stone-200 bg-white p-5">
            <h2 className="font-semibold">Private demos</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Work-in-progress tools and demos can be added here as they become useful.
            </p>
          </div>
          {isOwner && (
            <Link href="/lab/activity" className="rounded-md border border-stone-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-[0_18px_50px_rgba(28,25,23,0.08)]">
              <h2 className="font-semibold">Activity</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                See which private posts and demos are actually being used.
              </p>
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
