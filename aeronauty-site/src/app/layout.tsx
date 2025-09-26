import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Aeronauty — Harry Smith",
  description: "Decision science & visual storytelling from an aerospace engineer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased text-slate-900">
        <header className="border-b">
          <nav className="mx-auto max-w-5xl px-4 py-4 flex items-center gap-6 text-sm">
            <Link href="/" className="font-semibold">Aeronauty</Link>
            <Link href="/about">About</Link>
            <Link href="/cv">CV</Link>
            <Link href="/projects">Projects</Link>
            <Link href="/contact">Contact</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-10">{children}</main>
        <footer className="border-t">
          <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-slate-600 flex flex-col sm:flex-row justify-between gap-2">
            <div>© {new Date().getFullYear()} Harry Smith — Aeronauty. Aerospace roots, data-driven futures.</div>
            <div className="flex gap-4">
              <a href="https://github.com/aeronauty" target="_blank" className="hover:text-slate-900">GitHub</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}