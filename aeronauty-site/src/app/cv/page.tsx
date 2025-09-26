import Link from "next/link";

export const metadata = { title: "CV — Aeronauty" };

export default function CVPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Person",
            name: "Harry Smith",
            jobTitle: "Decision Scientist / Aerospace Engineer",
            url: "https://aeronauty.com",
            sameAs: ["https://aircraftflightmechanics.com"],
            alumniOf: [],
            knowsAbout: ["Optimization", "Geospatial Analytics", "Decision Intelligence", "Aerospace"],
          }),
        }}
      />
      <article className="prose prose-slate lg:prose-lg">
        <h1>CV</h1>
        <p className="text-sm">Concise version. Full CV available on request.</p>

        <h2>Summary</h2>
        <p>
          Aerospace engineer specializing in decision science: <strong>discrete & continuous optimization</strong>,
          <strong> geospatial analytics</strong>, and <strong>interactive visualization</strong>. I build tools that
          turn complex trade-offs into clear decisions.
        </p>

        <h2>Selected Experience</h2>
        <ul>
          <li><strong>Decision Tools & Systems</strong> — PARADIGM platform (network-level aircraft + energy infra); division-adopted de-cambering method; system-of-systems studies.</li>
          <li><strong>Data & Visualization</strong> — Interactive dashboards, Plotly, map layers, and executive-ready visual narratives.</li>
          <li><strong>Product Prototyping</strong> — Fast MVPs with Next.js, MDX, and Python/JS solvers; AI-assisted build flow (Cursor).</li>
        </ul>

        <h2>Focus Areas</h2>
        <ul>
          <li>Geospatial optimization (routing, facility placement, coverage)</li>
          <li>Aerospace performance & flight mechanics visualization</li>
          <li>Decision intelligence (multi-objective trade studies)</li>
        </ul>

        <h2>Contact</h2>
        <p>For collaboration, speaking, or consulting: <Link href="/contact">contact me</Link>.</p>
      </article>
    </>
  );
}
