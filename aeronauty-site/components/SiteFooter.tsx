import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-stone-200 bg-[var(--paper)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <p>© 2026 Aeronauty. Built by Harry Smith.</p>
        <div className="flex gap-5">
          <Link href="/privacy" className="hover:text-stone-950">
            Privacy
          </Link>
          <Link href="/lab" className="hover:text-stone-950">
            Lab
          </Link>
        </div>
      </div>
    </footer>
  );
}
