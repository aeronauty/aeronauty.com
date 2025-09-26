import Link from "next/link";

export const metadata = { title: "Geospatial — Aeronauty" };

export default function GeoPage() {
  return (
    <article className="prose prose-slate lg:prose-lg">
      <h1>Geospatial</h1>
      <p>
        Interactive maps, routing, siting, and coverage analysis. I use deck.gl + MapLibre/Mapbox and Plotly for quick, compelling geospatial stories.
      </p>
      <h2>Examples</h2>
      <ul>
        <li>EV charging placement (coverage vs. cost vs. demand)</li>
        <li>UAV route planning with constraints (no-fly zones, battery swaps)</li>
        <li>Bike sharing rebalancing heuristics + MILP for nightly plans</li>
      </ul>
      <p>
        See also: <Link href="/projects/discrete-optimisation">Discrete Optimisation</Link>.
      </p>
    </article>
  );
}
