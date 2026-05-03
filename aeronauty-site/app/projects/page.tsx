import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";

const projects = [
  {
    title: "Polynomial vs Power Fit Explorer",
    description:
      "Compare polynomial, spline, and power-law fits for aircraft fuel-efficiency data, including extrapolation behaviour.",
    tech: ["Plotly", "Least squares", "Flight mechanics", "Data viz"],
    link: "/apps/graph-fitting",
    status: "Live",
  },
  {
    title: "Specific Range Explorer",
    description:
      "An interactive analysis of why SR curves bend above the optimum altitude, fitted to published airline data.",
    tech: ["React", "Optimization", "Performance", "KaTeX"],
    link: "/apps/specific-range",
    status: "Live",
  },
  {
    title: "Panel Code / Kutta Demo",
    description:
      "A browser-based panel-method demonstration for explaining circulation, pressure, and the equal-transit-time myth.",
    tech: ["TypeScript", "Panel methods", "Aerodynamics"],
    link: "/apps/panel-code",
    status: "Live",
  },
  {
    title: "Wind Turbine Explainer",
    description:
      "A 3D turbine and accompanying physics model for blade loading, wake behaviour, and design intuition.",
    tech: ["Three.js", "WebGL", "Education"],
    link: "/apps/wind-turbine",
    status: "Live",
  },
  {
    title: "Blade Harmonics",
    description:
      "A compact mathematical visualisation of harmonic cancellation in equally spaced rotating blades.",
    tech: ["React", "Recharts", "Maths"],
    link: "/apps/blade-harmonics",
    status: "Live",
  },
  {
    title: "FlexCompute Foil",
    description:
      "Rust and WebAssembly airfoil tooling, with validation notes and the geometry problems that make solver work interesting.",
    tech: ["Rust", "WASM", "XFOIL", "Validation"],
    link: "/projects/flexcompute-foil",
    status: "Write-up",
  },
  {
    title: "PARADIGM",
    description:
      "A systems-of-systems optimisation platform for aircraft, energy, logistics, and infrastructure trade studies.",
    tech: ["Python", "Optimization", "Geospatial", "ROMs"],
    link: "#",
    status: "Archive",
  },
  {
    title: "Deckide",
    description:
      "Decision intelligence experiments for exploring multi-dimensional trade spaces without reducing them to one bad chart.",
    tech: ["TypeScript", "React", "Data viz"],
    link: "#",
    status: "Private",
  },
];

export default function ProjectsPage() {
  return (
    <div className="min-h-screen bg-[var(--paper)] text-stone-950">
      <SiteNav />
      <main className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
        <header className="grid gap-8 border-b border-stone-300 pb-12 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <p className="eyebrow">Projects</p>
            <h1 className="mt-4 text-5xl font-semibold tracking-tight sm:text-6xl">
              Things that run.
            </h1>
          </div>
          <p className="max-w-3xl text-lg leading-8 text-stone-600 lg:pt-10">
            Interactive models, engineering tools, and a few archived systems. The live ones open
            directly; the private ones are kept back until they are useful enough to survive a
            stranger clicking around.
          </p>
        </header>

        <section className="mt-12 divide-y divide-stone-200 border-y border-stone-200 bg-white">
          {projects.map((project) => (
            <article key={project.title} className="grid gap-6 p-6 transition hover:bg-stone-50 md:grid-cols-[1fr_1.5fr_0.42fr] md:p-8">
              <div>
                <span className="rounded-full border border-stone-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                  {project.status}
                </span>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight text-stone-950">
                  {project.title}
                </h2>
              </div>
              <div>
                <p className="leading-7 text-stone-600">{project.description}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {project.tech.map((tech) => (
                    <span key={tech} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-start md:justify-end">
                {project.link !== "#" ? (
                  <Link href={project.link} className="button-secondary">
                    Open
                  </Link>
                ) : (
                  <span className="text-sm font-medium text-stone-400">Not public</span>
                )}
              </div>
            </article>
          ))}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
