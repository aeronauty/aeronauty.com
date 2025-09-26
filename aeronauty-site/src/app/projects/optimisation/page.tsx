export const metadata = { title: "Optimisation — Aeronauty" };

export default function OptPage() {
  return (
    <article className="prose prose-slate lg:prose-lg">
      <h1>Optimisation</h1>
      <p>
        Continuous & multi-objective optimization, sensitivity and trade studies. Plotly for Pareto fronts and sliders for parameter sweeps.
      </p>
      <h2>Demo Ideas</h2>
      <ul>
        <li>Pareto front for cost vs. performance with interactive hover</li>
        <li>Sensitivity sliders for key assumptions</li>
      </ul>
    </article>
  );
}
