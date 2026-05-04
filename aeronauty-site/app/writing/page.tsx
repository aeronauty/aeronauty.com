import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import { topologyArticles } from "@/lib/topology-articles";

const pieces = [
  ...topologyArticles.map((article) => ({
    title: article.title,
    description: article.description,
    tags: article.tags,
    link: `/writing/${article.slug}`,
    type: "Essay",
  })),
  {
    title: "Why choosing the right fit matters",
    description:
      "A critique of polynomial trendlines in aircraft fuel-efficiency analysis, with an embedded tool for comparing polynomial, spline, and power-law fits.",
    tags: ["Curve fitting", "Flight mechanics", "Policy", "Interactive"],
    link: "/apps/graph-fitting",
    type: "Essay + tool",
  },
  {
    title: "Porting XFOIL to Rust",
    description:
      "A long-form write-up on building FlexCompute Foil, with interactive validation sweeps against XFOIL.",
    tags: ["Rust", "WebAssembly", "XFOIL", "Validation"],
    link: "/projects/flexcompute-foil",
    type: "Article",
  },
  {
    title: "Porting XFOIL to Rust, Pt II",
    description:
      "The geometry problem: why a solver that matches XFOIL on clean airfoils falls apart with flap deflection, and how porting GDES FLAP fixed it.",
    tags: ["Rust", "XFOIL", "Splines", "Flap geometry"],
    link: "/projects/flexcompute-foil-pt2",
    type: "Article",
  },
];

export default function WritingPage() {
  return (
    <div className="min-h-screen bg-[var(--paper)] text-stone-950">
      <SiteNav />
      <main className="mx-auto max-w-5xl px-5 py-16 sm:px-8 lg:px-10">
        <header className="border-b border-stone-300 pb-12">
          <p className="eyebrow">Writing</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight sm:text-6xl">
            Notes from the argument.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-stone-600">
            Technical stories, critiques, and explanations. The aim is not to sound polished; the
            aim is to leave enough reasoning on the page that someone else can check the work.
          </p>
        </header>

        <div className="mt-12 space-y-5">
          {pieces.map((piece) => (
            <article key={piece.title} className="rounded-md border border-stone-200 bg-white p-6 transition hover:border-stone-400 hover:shadow-[0_18px_50px_rgba(28,25,23,0.08)] sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="eyebrow text-[0.65rem]">{piece.type}</p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
                    {piece.title}
                  </h2>
                  <p className="mt-4 leading-7 text-stone-600">{piece.description}</p>
                </div>
                <Link href={piece.link} className="button-secondary shrink-0">
                  Read
                </Link>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                {piece.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
