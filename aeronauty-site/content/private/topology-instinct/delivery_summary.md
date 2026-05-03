# Delivery summary — Aeronauty article "Yelling at ice cream vans, data richness, ADHD, and why overlooked connections matter"

Drafted by an orchestrated swarm on 2026-05-01. Harry will edit heavily.

## What's here

```
public/articles/topology-instinct/
├── index.html                       ← THE ARTICLE (109 KB, single self-contained file)
├── build_article.py                 ← reproducible integration build
├── outline.md                       ← canonical 10-beat plan (Phase-1 doc)
├── style-cheatsheet.md              ← Harry-voice cheat sheet (Phase-1 doc)
├── prose-source.md                  ← prose draft (Markdown, with IP flags + agent notes)
├── delivery_summary.md              ← this file
├── data/
│   ├── milp_solutions.json          ← 1.4 MB precomputed solutions
│   ├── airports.csv                 ← 175 airports
│   ├── routes.csv                   ← 7,425 OD pairs
│   ├── README.md                    ← data provenance + methodology
│   ├── validation_report.md         ← MILP validation
│   └── build.py                     ← reproducible MILP build
└── figures/
    ├── adhd-flowchart-animated.html ← standalone preview of the rough.js flowchart
    ├── globe-demo.html              ← standalone preview of the globe demo
    ├── data-as-dag.svg              ← inline figure for beat 7
    └── README.md                    ← figure docs + dark-mode notes
```

The article is served at `https://aeronauty.com/articles/topology-instinct/index.html` once Next.js's static `out/` is rebuilt (it lives under `public/`, so a `next build` picks it up automatically).

To preview locally:
```bash
cd /Users/harry/aeronauty.com/aeronauty-site/public/articles/topology-instinct
python3 -m http.server 8770
open http://127.0.0.1:8770/index.html
```

## Decisions the swarm made that weren't explicit in the brief

For Harry's sign-off:

1. **Snowflake/Cirium fallback.** The Cirium Historical Emissions dataset isn't accessible from this environment (no Snowflake auth). The data agent fell back to OpenFlights with a frequency-weighted great-circle CO<sub>2</sub> proxy, calibrated so JFK–LHR lands around 388,000 tonnes/year. This is documented prominently in `data/README.md`. The pedagogical contrast (optimal beats greedy by 25–31% at intermediate K) is preserved; the absolute numbers should be read as "teaching demo, not a forecast." The article body doesn't claim Cirium-grade data anywhere — but if you want to swap in real Cirium numbers later, the build script regenerates everything from `data/build.py`.

2. **Top-N airport subset = 175** (the brief allowed 125–200). 150 produced 5,615 OD pairs; 175 yields 7,425, which gives more pedagogically interesting hub diversity. Trim the subset by editing `TOP_N` in `data/build.py` and re-running.

3. **MILP relaxation.** The agent relaxed `R_ij` to continuous in [0,1] (mathematically equivalent under the paired form `R ≤ A_i, R ≤ A_j` with positive objective coefficient — `R` is pinned to `min(A_i, A_j)` at the optimum, which is binary because `A` is binary). Cuts CBC's binary-variable count from ~22,275 to 525 and brings build time from 25+ minutes to ~5 minutes. Documented in `data/build.py`.

4. **Hybrid solver.** The densest-K-subgraph problem at low K is NP-hard; CBC was hitting >120s without proving optimality and sometimes returning incumbents *worse* than greedy_myopic. The agent added a 1-swap local-search step on top of greedy_myopic, then warmstarts CBC with that for 30s, and takes the best of (CBC, local search, greedy_myopic) per (K, t), enforcing monotonicity by union. Validation confirms optimal beats every baseline at every (K, t). Documented in `data/build.py` and `data/README.md`.

5. **Flowchart W15 revised mid-flight.** The original brief asked for static SVG variants. The revised brief (received during the run) replaced that with an animated rough.js + D3 + IntersectionObserver two-state flowchart. AI agent labels picked: `boilerplate`, `tests`, `data cleaning`, `lit review` (four from the suggested six; none invented).

6. **Article output location.** The brief's `Aeronauty/articles/topology-instinct/` was resolved to `/Users/harry/aeronauty.com/aeronauty-site/public/articles/topology-instinct/` so the file is served by the existing Next.js static handling at `aeronauty.com/articles/topology-instinct/`.

7. **Inter font** loaded from `https://rsms.me/inter/inter.css` — system fallback if offline. Switch to a self-hosted variant (in `aeronauty-site/public/fonts/`) if you'd rather not depend on rsms.me.

8. **Dark mode by default**, with a full `prefers-color-scheme: light` palette via CSS variables. The globe demo is dark-only (Globe.gl looks better dark); the rest of the article respects the system preference.

9. **Article eyebrow + deck.** Composed from the topic tags ("Topology, Paradigm, ADHD, AI") and a one-sentence deck. Easy to swap.

10. **Footer.** A single line linking to `aeronauty.com` and pointing at `data/README.md` for methodology. No social, no contact CTA, per Harry's "no series-cliffhanger framing" constraint.

## Sections the swarm recommends cutting on second read

The prose agent flagged three least-confident sentences (preserved in `prose-source.md`):

1. **Beat 1, the doctor-as-character parenthetical** — "She is a good doctor and she did not, to her credit, write anything about ice cream vans into the notes (that I'm aware of)." Might be a beat too cute. Cut if the cold open feels like it's leaning too hard on the doctor character.
2. **Beat 4, the post-heartbreak technical resumption** — "But the bidirectional coupling is what I want you to take from this beat..." The transition back into the technical thread after the verbatim heartbreak line is sitting in a tonally tricky spot. The full paragraph might want to be one sentence shorter.
3. **Beat 9, the framing around "the bridges live in the heads of generalists"** — already revised once; the verbatim phrase is intact but the sentence framing it ("I want to be clear that I'm not flexing about that. The opposite — ...") is doing too much. Probably wants Harry to write the landing himself.

In addition, beat 6 (Vera) is short at 135 words. The brief said "don't oversell the irony — let it do its own work," so I held the agent to that, but it might want one more sentence of context.

## Sentences flagged as potentially Boeing-IP-sensitive (for Qiqi review)

All in beat 4 (Paradigm). Reproduced from `prose-source.md`:

1. **Cascade as "swap aircraft on routes and recompute"** — public-talk-level description, but worth a glance to confirm it doesn't drift into internal-process territory.
2. **Cost-prediction features** — "feature pipeline that pulled engineering-derived cost predictors from public data" is intentionally generic; flag in case the level of specificity (water, renewables, trucking metrics, distance-to-infrastructure) is too close to internal feature lists.
3. **"Fed Boeing's aircraft strategy"** — hedged with the "left as an exercise for the reader" line, but flag in case even that framing is too suggestive.
4. **No-Bull Prize / CoW 2025 / ATF interview details** — personal-career facts but involve Boeing's internal review process; worth a glance to confirm the framing is fine to publish.

## Sections where the personal-beat draft is particularly unconfident

The brief flagged beats 1, 8, 10 as "competent but not over-polished — Harry will rewrite." The prose agent honored that.

- **Beat 1 (cold open / ice cream van):** the dialogue with the doctor, especially "Was that you?", is a guess. Harry may want to rewrite it from his actual memory of the call.
- **Beat 8 (ADHD braid):** the "I tried a friend's Vyvanse" framing is the fact, but the surrounding paragraph might want Harry's hand. The "Director of Flight Sciences who blogs about Adderall" parenthetical aside is in — flag it for Harry's call on whether it lands or reads performative.
- **Beat 10 (meta-twist closer):** intentionally short and slightly under-polished. Easy to rewrite if Harry wants more from it.

## What's intact (for reassurance)

All required-verbatim phrases verified present:
- "the bridges live in the heads of generalists" (beat 9, ×1)
- "the brain that was a tax is now an asset" (beat 9; also in the flowchart final caption — total ×2)
- "I'd drop tools when I was done with them like they ceased to exist" (beat 8, ×1)
- "I was furious and heartbroken, and it took me a while to realise the system, not the work, was the problem" (beat 4, ×1)
- "MR ICE CREAM VAN MAN" (beat 1, ×1)
- "Paradigm needed an organisation that could absorb cross-domain work, and Boeing's structure couldn't price that kind of option-value yet" (beat 4, ×1)
- "thanks Jeremy Harris for teaching me that's what I was doing" (beat 5, ×1)
- "if I'm able to do it, I assume it's allowed" (beat 3, ×1)
- "the answer was in my subconscious the whole time" (beat 7, ×1)
- "I always thought ADHD meds would stop me jumping between things" (beat 8, ×1)

Banned phrases verified absent: synergy, leverage (verb), paradigm shift, unlock, journey, cutting-edge, superpower, game-changer, disrupt, "moreover", "furthermore", "in conclusion", "deep dive", "let's unpack", "circle back", "low-hanging fruit". "Revolutionary" appears only in the mock-reviewer quote, which the brief allows.

## Outstanding items for Harry

1. **Update the link in beat 7** — `[CFD is stuck in the file era](LINK_TO_BE_INSERTED_BY_HARRY)` needs the actual URL of the earlier Aeronauty post.
2. **Final IP review with Qiqi** — see the four flagged items above.
3. **No-Bull Prize / CoW name verification** — the daily note from 2026-05-01 said the name was confirmed, but worth a final check before publication ("getting an award name wrong would undermine credibility of everything around it").
4. **Decide on the Adderall parenthetical** — beat 8, "(yes, I'm aware that being a Director of Flight Sciences who blogs about Adderall is a deliberate exposure decision; half-strength is worse than either fully in or fully out, so it's fully in)".
5. **Consider one use of "fucking"** — the cap was twice across the article; the agent didn't deploy any. Beat 4's heartbreak line or beat 8's meds reveal could carry one if Harry wants the cadence.

## How to regenerate

If you change anything in `prose-source.md` or any of the figure files:

```bash
cd /Users/harry/aeronauty.com/aeronauty-site/public/articles/topology-instinct
python3 build_article.py
```

That re-stitches `index.html` from the current sources. The MILP regenerates from `data/build.py` (about 5 minutes).
