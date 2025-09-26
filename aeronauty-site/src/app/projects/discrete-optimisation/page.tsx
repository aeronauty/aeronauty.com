export const metadata = { title: "Discrete Optimisation — Aeronauty" };

export default function DiscreteOptPage() {
  return (
    <article className="prose prose-slate lg:prose-lg">
      <h1>Discrete Optimisation</h1>
      <p>
        MILP/CP for facility location, routing, assignment, and scheduling. I prototype quickly in Python/JS and surface results as interactive visuals.
      </p>
      <h2>Demo Ideas</h2>
      <ul>
        <li>p-median siting for chargers or depots</li>
        <li>VRP with time windows (dashboards for dispatch)</li>
        <li>Bike rebalancing (heuristics vs. MILP comparison)</li>
      </ul>
    </article>
  );
}
