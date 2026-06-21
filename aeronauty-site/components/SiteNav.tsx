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
    <header className="sticky top-0 z-50 bg-[var(--paper)]/92 backdrop-blur">
      <div className="border-b border-[var(--rule)] py-1.5 text-center font-mono text-[0.6rem] uppercase tracking-[0.16em] text-[var(--muted)] sm:text-[0.66rem]">
        Aeronauty — field notes on bad physics &amp; AI slop — est. 2026
      </div>
      <nav className="mx-auto flex h-16 max-w-container items-center justify-between gap-3 border-b border-[var(--rule)] px-4 sm:px-8 lg:px-10">
        <Link
          href="/"
          className="shrink-0 font-display text-xl font-extrabold tracking-tight text-[var(--ink)]"
        >
          Aeronauty<span className="text-[var(--accent)]">.</span>
        </Link>
        <div className="flex max-w-[calc(100vw-9rem)] items-center gap-5 overflow-x-auto font-mono text-xs uppercase tracking-[0.06em] sm:max-w-none">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="an-link shrink-0 text-[var(--foreground)]">
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
