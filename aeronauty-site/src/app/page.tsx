import Link from "next/link";

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">{children}</span>;
}

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">Aeronauty</h1>
        <p className="text-lg text-slate-700 max-w-3xl">
          Hi, I'm <strong>Harry Smith</strong> — an aerospace engineer who builds{" "}
          <em>decision tools</em>: optimization, geospatial analytics, and visual storytelling.
          I turn messy systems into interactive apps people can actually use.
        </p>
        <div className="flex gap-4">
          <Link href="/projects" className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm">Explore Projects</Link>
          <a href="https://aircraftflightmechanics.com" className="rounded-lg border px-4 py-2 text-sm" target="_blank">AircraftFlightMechanics.com</a>
        </div>
      </section>

      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { href: "/projects/geospatial", title: "Geospatial", desc: "Interactive maps & algorithms." },
          { href: "/projects/flight", title: "Flight", desc: "Aero, performance, and visualization." },
          { href: "/projects/data-science", title: "Data Science (the real kind)", desc: "Registry + visualisation + quick applets." },
          { href: "/projects/deckide", title: "Deckide", desc: "Decision decks for trade-offs.", soon: true },
          { href: "/projects/sayvault", title: "SayVault", desc: "Structured memory & recall.", soon: true },
          { href: "/projects/discrete-optimisation", title: "Discrete Optimisation", desc: "MILP/CP, routing, placement." },
          { href: "/projects/optimisation", title: "Regular Optimisation", desc: "Continuous, multi-objective, sensitivity." },
        ].map(card => (
          <Link key={card.href} href={card.href} className="group rounded-2xl border p-5 hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{card.title}</h3>
              {card.soon && <Badge>Coming Soon</Badge>}
            </div>
            <p className="mt-2 text-sm text-slate-600">{card.desc}</p>
            <div className="mt-4 text-xs text-slate-500 group-hover:text-slate-700">Open →</div>
          </Link>
        ))}
      </section>
    </div>
  );
}