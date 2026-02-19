export const metadata = { title: "Data Science (the real kind) — Aeronauty" };

export default function DataSciencePage() {
  return (
    <article className="prose prose-slate lg:prose-lg">
      <h1>Data Science (the real kind)</h1>
      <p><em>Actual data science — not just doing a regression analysis and kidding yourself you&rsquo;re a savant.</em></p>
      <p>I build reusable data infrastructure + exploratory tools that make complex systems understandable:</p>
      
      <h2>Parameter Registries</h2>
      <p>Structured stores for classes of technologies (methane trucks, LNG carriers, aircraft variants). Add a new class and the framework instantly knows how to compare it.</p>
      
      <h2>Exploratory Visualisation</h2>
      <p>Automated pair plots, scatter matrices, and trade-off charts with Plotly that reveal structure in messy datasets.</p>
      
      <h2>Lightweight Applets</h2>
      <p>Quick-turn interactive apps like <a href="https://github.com/aeronauty/DataVisualiser" target="_blank">DataVisualiser</a>, proving ideas in hours, not weeks.</p>
    </article>
  );
}
