# Split Notes — `prose-source.md` → Article 1 + Article 2

## Final word counts

| File | Words | Target | Status |
|------|------:|-------:|--------|
| `article-1-i-dont-like-data-entry.md` | 3,620 | 3,500–5,000 | within range |
| `article-2-the-brain-that-was-a-tax.md` | 2,121 | 2,000–3,500 | within range |
| Source `prose-source.md` (for reference) | 4,316 | — | — |

Combined output is ~5,740 words, against ~4,316 in the source. The increase is almost entirely connective tissue (Article 1 intro/close, Article 2 opening, the orchestrator-role-as-PhD-supervisor expansion, and a clean `pandas → CSV → forgotten directory` failure case for the Thread section). I cut more than that figure suggests; the line count went up because the connective tissue is doing real work that the original buried.

## Beat-by-beat allocation

| Source beat | Destination | Notes |
|-------------|-------------|-------|
| Beat 1 — ice cream van / GP | Article 1, opening | Kept verbatim where possible. The "wrong-frame reflection" was compressed sharply (one paragraph instead of two) and re-pointed so it foreshadows the data-entry thesis rather than the AI/meds thesis. The full ADHD/meds discussion was moved to Article 2. |
| Beat 2 — Plotly vs PowerPoint | Article 1 | Verbatim, untouched. Includes both target phrases (`rectangular slide…lossy compression`, `topology-shaped output is the better artefact`). |
| Beat 3 — receptionist + printer | Article 1 | Verbatim, untouched. |
| Beat 4 — Paradigm | Article 1, compressed | Compressed per brief. The full MILP walkthrough (binary `A_i`, `R_ij`, the LP-relaxation aside about `(A_i + A_j)/2`, the prior-art mini-section, the cost-prediction subsection) is now mostly compressed into one paragraph plus a footnote. The bidirectional-coupling move and the No-Bull / ATF / "furious and heartbroken" lines are kept. The closing reframe was rewritten to point explicitly at the data-entry / coupled-systems thesis instead of "the MILP is the shape." |
| Beat 5 — storage migrations | Article 1 | Verbatim, plus a new paragraph after it ("The frustrating bit is that the tooling for not-being-the-join existed for most of those twenty years…") that re-routes the migrations beat into the data-entry thesis and seeds the "I have spent twenty years trying not to become the join" line. |
| Beat 6 — Vera | Article 1 | Verbatim, kept short per brief. |
| Beat 7 — Thread | Article 1 | Verbatim through the existing prose, plus two new paragraphs: a concrete `pandas → CSV → forgotten directory → engineer-can't-answer-where-it-came-from` failure case (per brief: "tighten it. One clean failure case is enough before Thread's DAG contrast"), and a "what changed across two runs / drop the cost per question" paragraph that grounds *why* the DAG is useful in practice. The "view is a projection; the DAG is the truth" line is preserved as a bolded line. |
| Beat 8 — ADHD braid | Article 2 (mostly) + Article 1 (one short paragraph) | Article 2 gets the full beat — meds revelation, "I'd drop tools when I was done with them like they ceased to exist", the unfinished-loop discussion, the flowchart figure, and the brain-doesn't-get-fixed-it-gets-supplemented line. Article 1 gets a one-paragraph "diagnostic" version explaining only that the diagnosis made the through-line legible, with an explicit handoff to "the next post." |
| Beat 9 — AI thesis / generalist orchestrator | Article 2 | Verbatim where possible. Both verbatim phrases (`the bridges live in the heads of generalists`, `the brain that was a tax is now an asset`) are present. Added one new paragraph defining what "cross-domain taste" means (mediocre-specialist-in-many-rooms framing) and one paragraph expanding the PhD-supervisor analogy, both per brief. |
| Beat 10 — meta-twist closer | Article 2 | Verbatim where possible. The "form follows content" / "this article was written this way" confession is preserved. The video-version P.S. (`Where did that plot come from?`) stays in Article 2 as the brief allocates it. Added one short paragraph noting that the *split-the-article-in-two* shape decision was the human bit, because that observation is now load-bearing for Article 2's thesis. |

## Verbatim target phrases — kept or adapted

| Phrase | Status | Location |
|--------|--------|----------|
| "the bridges live in the heads of generalists" | **kept verbatim** | Article 2, "The thing the swarm can't do" section |
| "the brain that was a tax is now an asset" | **kept verbatim** | Article 2, final line |
| "I'd drop tools when I was done with them like they ceased to exist" | **kept verbatim** | Article 2, "What the meds actually changed" section |
| "I was furious and heartbroken, and it took me a while to realise the system, not the work, was the problem" | **kept verbatim** | Article 1, Paradigm section |
| "The rectangular slide was a lossy compression of work that didn't compress that way" | **kept verbatim** | Article 1, "The instinct in plot form" |
| "the topology-shaped output is the better artefact and the rectilinear-shaped output is the one the system can absorb" | **kept verbatim** | Article 1, "The instinct in plot form" |
| "The view is a projection; the DAG is the truth" | **kept and bolded** | Article 1, Thread section. Existing prose-source.md had this idea split across two sentences; I tightened it to the target-shape line and bolded it for emphasis. |
| "I have spent twenty years trying not to become the join" | **newly written to target shape** | Article 1, end of "Twenty years…" section. The brief flagged this as one that "may need a fresh sentence written to that target shape if it doesn't already exist verbatim" — it didn't, so I wrote it. |
| "Data entry is what happens when the structure has fallen out of the system and landed on a person" | **newly written to target shape, then echoed** | Article 1, intro (bolded) and reused in different words in the close. |
| "Paradigm needed an organisation that could absorb cross-domain work, and Boeing's structure couldn't price that kind of option-value yet" | **kept verbatim** | Article 1, Paradigm section |
| "thanks Jeremy Harris for teaching me that's what I was doing" (paraphrasable) | **kept in adapted form** | Article 1, migrations section: "Thanks Jeremy Harris for explaining, calmly, that pickles weren't a database and never had been." (As in source — already an adaptation.) |
| "the answer was in my subconscious the whole time" | **kept verbatim** | Article 1, Thread section |

## Article 1 ending — closeness to target shape

The brief gave a target-shape ending that I closely tracked but didn't copy verbatim. The actual ending hits the same beats in the same order (these were separate stories → ADHD made them one → the thing isn't "topology" it's "I don't like data entry" → not because above it but because it's a symptom → enumerate the symptoms briefly → Thread is the latest version of the refusal → that is the thread). Inserted one extra paragraph before the final line ("I don't think this is a particularly profound observation…") to make the close land at slightly less than a sermon.

## Article 2 opening — closeness to target shape

The brief gave a target-shape opening. I tracked the structure but rewrote slightly so it reads as the *opener of a new article* rather than as a callback ("In an earlier version of this essay, this was the point where the article quietly became a different article. The first one was about data entry…"). The "I don't know how long the *for now* lasts" hook is a small new addition; the brief explicitly wanted that uncertainty stated up front.

## What was cut entirely

- The "IP review flags" / "Decisions made" / "Sentences I'm least confident in" appendices at the end of `prose-source.md` — those are scaffolding for Harry's editorial pass, not article content.
- The endpoint-constraint LP-relaxation aside in Beat 4 — moved to a footnote in Article 1.
- The "prior art briefly" section of Beat 4 (DLR / MIT / NASA on hydrogen rollout) — moved into the same footnote.
- The "Cost-prediction features" subsection of Beat 4 — compressed from a section to a single paragraph in the main body.
- The "Sequencing makes it interesting" walkthrough — compressed from a paragraph to a clause; the conceptual point ("greedy is the obvious wrong answer") is preserved.
- The bracketed `[INTERACTIVE DEMO: …]` line in Beat 4 — preserved, but I'd consider whether the demo still earns space in the compressed article. Flagging for Harry.

## Figure / asset allocation

### Article 1 (data-entry / Thread argument)

- `[FIGURE: homer-ice-cream]` — opening
- `[FIGURE: plotly-vs-powerpoint]` — Plotly section
- `[FIGURE: cartoon-ip-printer]` — printer anecdote
- `[FIGURE: milp-equations]` — Paradigm
- `[INTERACTIVE DEMO: globe…]` — Paradigm (bracketed placeholder, as in source)
- `[FIGURE: cartoon-storage-migrations]` — pickle/HDF5/SQL/Postgres lineup. **Newly added back** per brief permission ("currently NOT in prose-source.md but PNG exists; you can re-add the placeholder if it earns space"). Earns space here.
- `[FIGURE: vera-applet]` — Vera section
- `[FIGURE: data-black-market]` — illusion-of-connectivity scrolly, in Thread section
- `[FIGURE: flat-view]` — Thread section, after the table-as-projection paragraph

### Article 2 (ADHD / agents / orchestrator argument)

- `[FIGURE: subverted-adhd-flowchart]` — meds section
- `[FIGURE: cartoon-orchestrator]` — orchestrator section
- `[FIGURE: cartoon-normal-things]` — friends-and-AI aside
- `[FIGURE: harry-plot-video]` — closing P.S.

### Unused or optional assets

None right now. Every figure from the source manifest landed in one of the two articles, and the storage-migrations cartoon was re-added per brief permission.

## What was newly written (connective tissue)

1. **Article 1 intro**, after the ice cream van, replacing the long Beat 1 "wrong-frame" passage. New text lays out the data-entry thesis explicitly and points the article at Thread.
2. **Article 1 transition** out of Beat 5 ("The frustrating bit is that the tooling for not-being-the-join existed for most of those twenty years…") — needed to make the migrations beat land on the data-entry thesis instead of being an aside.
3. **Article 1 Thread section additions** — the `pandas DataFrame → forgotten upstream CSV` failure case, and the "drop the cost per question" paragraph.
4. **Article 1 short ADHD bridge** — one paragraph acknowledging the diagnosis and explicitly handing off to Article 2.
5. **Article 1 close** — full new section ending with "That is the thread. It was there the whole time."
6. **Article 2 opening** — references "the first one was about data entry" and states the Article 2 thesis up front.
7. **Article 2 cross-domain-taste paragraph** — definition of what *cross-domain taste* means, written to ground a phrase the brief was worried might read loosely.
8. **Article 2 PhD-supervisor analogy expansion** — one paragraph extending the brief's verbatim "exactly the role my PhD supervisor played" into a working description.
9. **Article 2 "two things changed at roughly the same time" paragraph** — clarifies the specific claim that *neither meds nor agents alone* produced the configuration.
10. **Article 2 close** — short, hits the brief's target-shape ending.

## Tension I couldn't fully resolve

- **The Vera section is in Article 1 but it's about the worker, not the work.** It earned its place there because the source has it sitting between Beat 5 and Beat 7, and pulling it would have meant either deleting it (the brief lists Flexcompute under "keep short, don't let it become résumé vindication") or moving it to Article 2 (where it doesn't fit the meds/agents argument). I kept it short, in Article 1, and re-pointed the close of the section at the "specific observation about what was true here" disclaimer Harry already wrote, which I think defuses most of the résumé-vindication risk. **Flagging for Harry**: if the Vera section still feels self-congratulatory in Article 1's compressed shape, it's the most droppable beat in the article. The article works without it.
- **Article 1's brief ADHD acknowledgment ("The thread" sub-section, before the close)** is doing two things at once — closing the loop with Article 2 and providing the "diagnosis made the pattern legible" observation. It's the bit closest to bleeding the two articles into each other. I kept it because Article 1's argument is genuinely incomplete without naming why the through-line became visible *now* rather than five years ago. Open to it being cut if Harry wants Article 1 to stay strictly within the work.
- **The "footnote" form of the Beat 4 LP-relaxation aside.** I wrote it as Markdown footnote syntax. If the build pipeline doesn't render footnotes, the alternative is to delete it (the brief permits this) or to fold the prior-art mention back into the main body in one short sentence. **Flagging for Harry.**
- **The `[INTERACTIVE DEMO: globe…]` placeholder in Article 1's Paradigm section** is preserved verbatim from the source, but Article 1's Paradigm section is now meaningfully tighter and the demo is doing more proportional work in a shorter article. It still earns its space, but Harry should sanity-check that against the actual rendered version, since the build_article.py pipeline is the only thing that knows how big the demo actually is on the page.
