import Link from "next/link";

const navItems = [
  { href: "/projects", label: "Projects" },
  { href: "/writing", label: "Writing" },
  { href: "/posts", label: "Posts" },
  { href: "/snippets", label: "Snippets" },
  { href: "/slop", label: "Slop" },
  { href: "/about", label: "About" },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-stone-200 bg-[var(--paper)]/92 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-8 lg:px-10">
        <Link href="/" className="shrink-0 font-semibold tracking-tight text-stone-950">
          Aeronauty
        </Link>
        <div className="flex max-w-[calc(100vw-7.5rem)] items-center gap-1 overflow-x-auto rounded-full border border-stone-200 bg-white px-1 py-1 sm:max-w-none">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-950"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
