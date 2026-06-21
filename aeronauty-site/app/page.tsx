import Link from "next/link";
import { Hero } from "@/components/Hero";
import { ProjectCard } from "@/components/ProjectCard";
import { Reveal } from "@/components/Reveal";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";

const featured = [
  {
    title: "Polynomial vs power-law fitting",
    description:
      "A small interactive argument about why the function you choose can matter more than the R-squared you report.",
    link: "/apps/graph-fitting",
    kicker: "Tool + essay",
    tags: ["Curve fitting", "DfT", "Flight mechanics"],
  },
  {
    title: "Specific range explorer",
    description:
      "A fitted performance model showing why specific-range curves bend above the optimum altitude.",
    link: "/apps/specific-range",
    kicker: "Interactive model",
    tags: ["Performance", "Optimization", "Lufthansa data"],
  },
  {
    title: "FlexCompute Foil",
    description:
      "A long-form look at porting XFOIL ideas into Rust and WebAssembly without losing the aerodynamic bits that matter.",
    link: "/projects/flexcompute-foil",
    kicker: "Project write-up",
    tags: ["Rust", "WASM", "Airfoils"],
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--paper)] text-stone-950">
      <SiteNav />
      <Hero />

      <main>
        <section className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:px-10">
          <div>
            <p className="eyebrow">Start here</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">
              Projects are the point. Writing is the record of the argument.
            </h2>
            <p className="mt-5 leading-8 text-stone-600">
              The site is split deliberately: working tools and demos live under projects; essays
              and technical stories live under writing. Some things are public, some are in the lab
              while they are still half-built.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Projects", "Runnable tools, demos, and engineering interfaces.", "/projects"],
              ["Writing", "Technical notes, postmortems, and longer explanations.", "/writing"],
              ["Lab", "Private drafts and behind-the-scenes prototypes.", "/lab"],
            ].map(([title, body, href]) => (
              <Link key={title} href={href} className="card p-5">
                <h3 className="font-display text-lg font-semibold text-[var(--ink)]">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{body}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="border-y border-stone-200 bg-white/65">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow">Selected work</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-stone-950">
                  Things worth opening first.
                </h2>
              </div>
              <Link href="/projects" className="text-sm font-semibold text-stone-950 underline decoration-stone-300 underline-offset-4 hover:decoration-[var(--accent)]">
                All projects
              </Link>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {featured.map((item, i) => (
                <Reveal key={item.title} delay={i * 0.08} className="h-full">
                  <ProjectCard {...item} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
          <div className="grid gap-10 border-y border-stone-300 py-12 lg:grid-cols-[0.85fr_1.15fr]">
            <h2 className="text-3xl font-semibold tracking-tight text-stone-950">
              A small site, but not a neutral one.
            </h2>
            <div className="space-y-5 text-lg leading-8 text-stone-600">
              <p>
                I like engineering tools that reveal their assumptions. I dislike plots that hide
                bad fits behind smooth lines. Most of the work here follows from those two
                preferences.
              </p>
              <p>
                If something looks unfinished, it probably is. That is better than pretending every
                useful thought arrives fully polished.
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
