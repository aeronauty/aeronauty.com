import Link from "next/link";

export const metadata = { title: "Projects — Aeronauty" };

const items = [
  { href: "/projects/geospatial", title: "Geospatial", desc: "Interactive maps & algorithms." },
  { href: "/projects/flight", title: "Flight", desc: "Aero, performance, and visualization." },
  { href: "/projects/specific-range", title: "Specific Range", desc: "Why SR curves bend above the optimum altitude." },
  { href: "/projects/data-science", title: "Data Science (the real kind)", desc: "Registry + visualisation + quick applets." },
  { href: "/projects/deckide", title: "Deckide", desc: "Decision decks for trade-offs.", soon: true },
  { href: "/projects/sayvault", title: "SayVault", desc: "Structured memory & recall.", soon: true },
  { href: "/projects/discrete-optimisation", title: "Discrete Optimisation", desc: "MILP/CP, routing, placement." },
  { href: "/projects/optimisation", title: "Regular Optimisation", desc: "Continuous, multi-objective, sensitivity." },
];

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">{children}</span>;
}

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Projects</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(i => (
          <Link key={i.href} href={i.href} className="rounded-2xl border p-5 hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{i.title}</h3>
              {i.soon && <Badge>Coming Soon</Badge>}
            </div>
            <p className="mt-2 text-sm text-slate-600">{i.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
