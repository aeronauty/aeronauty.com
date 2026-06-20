import Link from "next/link";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { LAB_SESSION_COOKIE, isLabOwnerEmail, verifyLabSessionToken } from "@/lib/lab-auth";
import { hasSlopStore, listNominees, listPending } from "@/lib/slop-store";
import SlopModerationList from "@/components/SlopModerationList";

export const dynamic = "force-dynamic";

async function getViewerEmail(): Promise<string | null> {
  const session = await auth().catch(() => null);
  if (session?.user?.email) {
    return session.user.email.toLowerCase();
  }
  const token = cookies().get(LAB_SESSION_COOKIE)?.value;
  return token ? verifyLabSessionToken(token) : null;
}

export default async function SlopAdminPage() {
  const viewerEmail = await getViewerEmail();
  const isOwner = Boolean(viewerEmail && isLabOwnerEmail(viewerEmail));

  if (!isOwner) {
    return (
      <main className="min-h-screen bg-[var(--paper)] text-stone-950">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
          <p className="eyebrow">Slop review</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Owner only</h1>
          <p className="mt-4 leading-7 text-stone-600">
            This is the moderation queue. Sign in with an owner account to review submissions.
          </p>
          <Link
            href="/lab/login"
            className="mt-8 inline-flex w-fit rounded-full bg-stone-950 px-5 py-3 font-semibold text-white transition hover:bg-stone-800"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const [held, live] = hasSlopStore()
    ? await Promise.all([listPending(), listNominees()])
    : [[], []];

  return (
    <main className="min-h-screen bg-[var(--paper)] text-stone-950">
      <div className="mx-auto w-full max-w-2xl px-6 py-16">
        <div className="mb-10 flex items-center justify-between">
          <Link href="/lab" className="text-sm font-semibold text-[var(--accent)] hover:text-stone-950">
            ← Lab
          </Link>
          <Link href="/slop/leaderboard" className="text-sm text-stone-500 hover:text-stone-950">
            Leaderboard →
          </Link>
        </div>

        <p className="eyebrow">Slop review</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Slop control</h1>
        <p className="mt-4 leading-7 text-stone-600">
          Clean submissions go live automatically. Anything the filter flags waits here for you, and
          you can pull a live entry off the board anytime.
        </p>

        {!hasSlopStore() ? (
          <div className="mt-10 rounded-md border border-amber-700/25 bg-amber-700/10 p-5 text-sm text-amber-900">
            Redis isn&apos;t configured, so there&apos;s no store to read.
          </div>
        ) : (
          <>
            <section className="mt-10">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                🚩 Held for review
                <span className="text-sm font-normal text-stone-400">{held.length}</span>
              </h2>
              <SlopModerationList
                initialItems={held}
                mode="held"
                emptyText="Nothing held — the filter is happy."
              />
            </section>

            <section className="mt-12">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                🟢 Live on the board
                <span className="text-sm font-normal text-stone-400">{live.length}</span>
              </h2>
              <SlopModerationList
                initialItems={live}
                mode="live"
                emptyText="Nothing on the board yet this week."
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
