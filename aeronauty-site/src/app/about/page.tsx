export const metadata = { title: "About — Aeronauty" };

export default function AboutPage() {
  return (
    <article className="prose prose-slate lg:prose-lg">
      <h1>About Harry</h1>
      <p>
        I&rsquo;m an aerospace engineer turned decision technologist. I design and ship interactive tools that blend
        <strong> optimization</strong>, <strong>geospatial analytics</strong>, and <strong>visual storytelling</strong>,
        so teams can reason about complex systems faster.
      </p>
      <p>
        Highlights: a division-adopted <em>de-cambering</em> method; PARADIGM (network-level aircraft design + energy
        infrastructure modeling); and system-of-systems analyses that informed program decisions. Lately I build with
        modern JS (React/Next) and Python/JS solvers, and I prototype at high speed using AI-assisted tooling (Cursor).
      </p>
      <p>
        I&rsquo;m currently developing <strong>Deckide</strong> (decision decks for trade-offs) and <strong>SayVault</strong>
        (structured memory + semantic recall). When I post interactive demos, people engage — because the story is clear.
      </p>
      <h2>What I&rsquo;m best at</h2>
      <ul>
        <li>Framing ambiguous problems as solvable optimization models.</li>
        <li>Making results <em>interactive</em> so decisions are obvious.</li>
        <li>Shipping fast: geospatial apps, dashboards, and explainers.</li>
      </ul>
    </article>
  );
}
