import Image from "next/image";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";

const skills = [
  ["Flight physics", "Stability and control, aero derivatives, wind-tunnel data, certification-facing analysis."],
  ["Optimization", "MILP, CP-SAT, routing, capacity planning, mission and infrastructure trade studies."],
  ["Software", "Python, TypeScript, React, Rust, SQL, data pipelines, interactive engineering interfaces."],
  ["Communication", "Technical writing, teaching, dashboards, demos, and making hidden assumptions inspectable."],
];

const roles = [
  {
    title: "Lead Flight Physics & Optimization Engineer",
    company: "Aurora Flight Sciences / Boeing",
    period: "2021-present",
    body:
      "Flight dynamics, aerodynamics, and system-of-systems optimization for advanced aircraft programs, including eVTOL, LTA, HSVTOL, and decision-analysis platforms.",
  },
  {
    title: "Industry Assistant Professor",
    company: "Illinois Institute of Technology",
    period: "2018-2021",
    body:
      "Graduate flight mechanics and experimental aerodynamics, with a bias toward interactive tools and practical understanding.",
  },
  {
    title: "Senior Aerodynamics Engineer",
    company: "Aircraft Research Association",
    period: "2014-2018",
    body:
      "Rotary- and fixed-wing testing in a 30 MW transonic tunnel, data systems, and customer-facing technical delivery.",
  },
  {
    title: "Postgraduate Flight Mechanics Engineer",
    company: "AgustaWestland",
    period: "2010-2011",
    body: "Handling-qualities automation and certification support for AW159 Wildcat work.",
  },
];

const recognition = [
  "Boeing Innovation Award for PARADIGM system-of-systems optimization work.",
  "Provost's Teaching Award at IIT for graduate aerospace education.",
  "PhD in Aerospace Engineering, University of Glasgow.",
  "MEng in Aeronautical Engineering, University of Glasgow.",
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[var(--paper)] text-stone-950">
      <SiteNav />
      <main>
        <section className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-10">
          <div>
            <div className="relative aspect-[4/5] max-w-sm overflow-hidden rounded-md border border-stone-300 bg-stone-200">
              <Image
                src="/harry-photo.jpg"
                alt="Harry Smith"
                fill
                sizes="(max-width: 1024px) 90vw, 360px"
                className="object-cover"
                priority
              />
            </div>
          </div>
          <div className="self-end">
            <p className="eyebrow">About</p>
            <h1 className="mt-4 text-5xl font-semibold leading-tight tracking-tight sm:text-6xl">
              Harry Smith, aerospace engineer and reluctant simplifier.
            </h1>
            <div className="mt-8 space-y-5 text-lg leading-8 text-stone-600">
              <p>
                I work where flight physics, optimization, and software meet: stability and
                control, wind-tunnel data, reduced-order modelling, and tools that help people
                make better engineering decisions.
              </p>
              <p>
                Aeronauty is where I keep public experiments and longer explanations. It is a
                workshop more than a portfolio: useful things, sharp edges, and enough context to
                understand why a tool exists.
              </p>
            </div>
          </div>
        </section>

        <section className="border-y border-stone-200 bg-white/65">
          <div className="mx-auto grid max-w-7xl gap-5 px-5 py-16 sm:grid-cols-2 sm:px-8 lg:grid-cols-4 lg:px-10">
            {skills.map(([title, body]) => (
              <article key={title} className="rounded-md border border-stone-200 bg-white p-5">
                <h2 className="font-semibold text-stone-950">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-stone-600">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.45fr_1fr] lg:px-10">
          <div>
            <p className="eyebrow">Experience</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">The through-line.</h2>
            <p className="mt-5 leading-7 text-stone-600">
              Mostly aircraft, mostly decisions, mostly turning messy engineering data into
              something people can reason with.
            </p>
          </div>
          <div className="divide-y divide-stone-200 border-y border-stone-200 bg-white">
            {roles.map((role) => (
              <article key={`${role.company}-${role.title}`} className="grid gap-4 p-6 sm:grid-cols-[0.28fr_1fr]">
                <p className="text-sm font-semibold text-stone-500">{role.period}</p>
                <div>
                  <h3 className="text-xl font-semibold tracking-tight">{role.title}</h3>
                  <p className="mt-1 font-medium text-[var(--accent)]">{role.company}</p>
                  <p className="mt-3 leading-7 text-stone-600">{role.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-10 px-5 pb-20 sm:px-8 lg:grid-cols-[1fr_1fr] lg:px-10">
          <div className="rounded-md border border-stone-200 bg-white p-8">
            <p className="eyebrow">Recognition</p>
            <ul className="mt-6 space-y-4 text-stone-600">
              {recognition.map((item) => (
                <li key={item} className="border-t border-stone-200 pt-4 leading-7 first:border-t-0 first:pt-0">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-stone-200 bg-white p-8">
            <p className="eyebrow">Links</p>
            <div className="mt-6 grid gap-3">
              {[
                ["GitHub", "https://github.com/aeronauty"],
                ["YouTube", "https://youtube.com/@aircraftflightmechanics"],
                ["LinkedIn", "https://linkedin.com/in/smithharry"],
                ["Email", "mailto:smith.harry@gmail.com"],
              ].map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="flex items-center justify-between border-t border-stone-200 pt-3 font-semibold text-stone-950 first:border-t-0 first:pt-0"
                >
                  {label}
                  <span className="text-stone-400">-&gt;</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
