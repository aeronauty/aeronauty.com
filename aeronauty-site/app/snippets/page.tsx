import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";

export default function SnippetsPage() {
  return (
    <div className="min-h-screen bg-[var(--paper)] text-stone-950">
      <SiteNav />
      <main className="mx-auto max-w-5xl px-5 py-16 sm:px-8 lg:px-10">
        <header className="border-b border-stone-300 pb-12">
          <p className="eyebrow">Snippets</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight sm:text-6xl">
            Small reusable pieces.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-stone-600">
            This section is reserved for compact code patterns, utilities, and little fragments
            that are useful enough to keep but not large enough to become projects.
          </p>
        </header>

        <section className="mt-12 rounded-md border border-dashed border-stone-300 bg-white p-8 sm:p-10">
          <p className="eyebrow">Not populated yet</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">The drawer is labelled. The tools are coming.</h2>
          <p className="mt-4 max-w-2xl leading-7 text-stone-600">
            In the meantime, the interactive project pages are the best place to find the code that
            has escaped the drawer.
          </p>
          <Link href="/projects" className="button-secondary mt-8">
            Browse projects
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
