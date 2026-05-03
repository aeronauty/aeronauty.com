# Outline — "Yelling at Ice Cream Vans, Data Richness, ADHD, and Why Overlooked Connections Matter"

Working title — the version on Aeronauty may be shorter. Don't lose "ice cream vans"; that's the cold-open hook.

## Thesis

The through-line in twenty years of work has been an instinct for **network topology** — relationships between things being first-class, not derivable later from the things themselves. The supporting infrastructure (visualisation, optimisation, storage, simulation provenance) has had to catch up to that instinct. AI in 2026 is a swarm of fast cheap specialists; the rare and valuable role is the generalist orchestrator who crosses community boundaries that the corpus can't cross for them. **The bridges live in the heads of generalists.**

## Beat plan (10 beats, ~5,000 words + interactive demo)

| # | Beat | Target words | Key content |
|---|---|---|---|
| 1 | Cold open: ice cream van | ~150 | Bellowing MR ICE CREAM VAN MAN at the doctor mid-call about anti-anxiety meds and weight gain. No setup. Pivot at the end: *anyway, this is going to be about how the brain that did that has been quietly working on the same problem for twenty years.* |
| 2 | The instinct in plot form (Plotly/Dash) | ~400 | Aurora-era refusal to flatten data into PowerPoint. Wasn't aesthetic preference; it was an objection to projecting graph-shaped data onto rectilinear axes. Reader leaves with "topology-shaped data" as a category. |
| 3 | The instinct generalised | ~300 | Two examples: receptionist (form forcing flat re-entry of structured data the practice already had) and printer (IP-direct printing at university; "if I'm able to do it, I assume it's allowed"). Two examples, not four. The pattern is the argument; volume dilutes it. |
| 4 | Paradigm — instinct at industrial scale | ~1500 + demo | Cascade context (Boeing's tool, respectful framing). Reframe: airports need upgrading too, not just aircraft. MILP formulation walked through with the interactive demo. Paired form `R_ij ≤ A_i` and `R_ij ≤ A_j`. Sequencing as chained MILP with monotonic-subset constraints. Coupling aircraft requirements to network state. Cost-prediction features (brief mention). Honest prior-art acknowledgement (one sentence). **Heartbreak interrupts mid-section** — won the No-Bull Prize at the CoW (Crew and Fleet Optimisation Workshop) 2025; cornerstone of the Associate Technical Fellow interview; ATF panel didn't see demonstrable impact; Paradigm got dropped. *I was furious and heartbroken, and it took me a while to realise the system, not the work, was the problem.* Form follows content. |
| 5 | Pickles → HDF5 → SQL → Postgres | ~500 | The unglamorous infrastructure-catching-up beat. Each migration was finding more graph-shaped storage for an inherently graph-shaped problem. Credit Jeremy Harris explicitly ("thanks Jeremy Harris for teaching me that's what I was doing"). Disarms the exceptionalism worry. |
| 6 | Vera + Flexcompute | ~250 | Vera (not technical) found Harry through an interactive flight-dynamics explainer — the Plotly-not-PowerPoint instinct. The exact signal Boeing's impact framework couldn't price was the signal that got him found. Loop closes. Don't oversell the irony. |
| 7 | Thread — the synthesis | ~400 | *The answer was in my subconscious the whole time — the network structure, the database theory, the data richness all come together.* Three lines: simulation data is a DAG; stored as a DAG-in-a-database, you get provenance and associativity for free; this frees the user from the rectilinear constraints of pandas, polars, Excel, CSV — the original sin. Link to the earlier Aeronauty post on CFD being stuck in the file era. |
| 8 | The ADHD braid | ~600 | Lands AFTER the technical synthesis, not before. *The technical through-line existed in the subconscious; the conscious experience was chaos.* Meds revelation: friend's Vyvanse, prescribed slow-release Adderall, feels like a different person. *I always thought ADHD meds would stop me jumping between things; what I learned is I was never that good at it. I'd drop tools when I was done with them like they ceased to exist.* Subverted ADHD flowchart figure. Medication didn't kill the through-line; it turned down the chaos so the through-line became visible. |
| 9 | The AI thesis (humble version) | ~700 | Generalist orchestrator + specialist swarm. Right now in 2026 the configuration is one person with cross-domain taste running a swarm of fast cheap specialists. Whether permanent is unclear — AI may develop something taste-shaped. **Use this conversation as the worked example**: I told the LLM about Plotly, Paradigm, Postgres, Thread; it saw the surface pattern (refusing to flatten); it didn't see the deeper one (topology as first-class) until I named it. The connection lived in my head, and nowhere else, including in a model that has read more about both graph theory and CFD provenance than I ever will. **Verbatim lines required: "the bridges live in the heads of generalists"** and **"the brain that was a tax is now an asset"**. |
| 10 | Meta-twist closer | ~150 | This article was written this way. Research as swarm, draft pass, edit pass, voice preserved (point at `Writing Style - Harry Smith.md`). One paragraph. Don't oversell. Continuous with beat 9, not a separate cute wink. |

## Hard constraints

- **First person** throughout. Harry voice strictly per `Writing Style - Harry Smith.md`.
- **No naming** former colleagues in any context — positive references stay unnamed ("a manager who appreciated the insight," "a mock reviewer who called Paradigm revolutionary").
- **Boeing IP boundary**: MILP formulation is fine (Trinity public talk). Cost-prediction feature list general only — mention infrastructure distance, water, renewables, trucking; don't go beyond. Internal Boeing tools/processes/decision-makers not named. Cascade is named (publicly discussed at Boeing conferences).
- **Banned phrases**: synergy, leverage (verb), touch base, paradigm shift, unlock, journey, cutting-edge, revolutionary (about Harry's own work — fine when describing the mock reviewer's word), superpower, game-changer, disrupt, "moreover," "furthermore," "in conclusion," "as an AI language model."
- **British spellings**: colour, programme, realise, behaviour, optimised, recognise.
- **Contractions** always.
- **Parentheticals** are load-bearing — use for context, dry humour, side observations.
- **Profanity sparingly** — "every fucking day" calibration in the ice cream van anecdote; once or twice across the whole article max.
- **Prior-art acknowledgement** in beat 4: hub location with phasing is a standard OR formulation, decades old — DLR, MIT, NASA have published on hydrogen aviation infrastructure rollout. Paradigm sat in a gap (coupling aircraft to network with engineering-derived costs) but didn't invent the technique. **One sentence is enough.**

## What to avoid

- Do not lean on "everything is a graph!!" aesthetic.
- No ADHD-influencer cadence. Defence: technical content earns the personal beats; personal beats are structurally tied to the technical argument.
- No claim that Harry invented the MILP technique.
- No hedge-laden sentences. No padding. If a section doesn't earn its space, recommend cutting.
- Beat 8 must not drift into self-help register.

## The interactive demo

Centrepiece in beat 4. Globe.gl-based. Shows airport upgrade sequencing optimised by MILP vs. three baselines (greedy-by-traffic, greedy-myopic, biggest-cities-first). Sliders for budget K and year (2030 / 2040 / 2050). The pedagogical payoff is watching the optimal solution diverge from naive strategies as budget increases.

## Output

`Aeronauty/articles/topology-instinct/`:
- `index.html` — single self-contained file, all CSS/JS inline except CDN deps (Globe.gl, D3 v7, Tailwind via Play CDN)
- `data/milp_solutions.json` — precomputed
- `data/airports.csv`, `data/routes.csv`
- `data/README.md` — provenance and methodology
- `data/validation_report.md`
- `figures/*.svg` — ADHD flowchart and DAG diagram
- `delivery_summary.md`

Resolved: actual filesystem location is `/Users/harry/aeronauty.com/aeronauty-site/public/articles/topology-instinct/`. Will be served at `https://aeronauty.com/articles/topology-instinct/`.
