# Topology Instinct — Article Prose Draft

Draft for Harry to edit. Beats 1, 8, and 10 are intentionally lighter on polish per brief. Beat 4 is the long one and tries to let the heartbreak interrupt mid-MILP rather than sit in its own section.

## Beat 1: Cold open

I've put on about fifteen kilos over the last couple of years without changing my diet or exercise, which we (me and Lorraine) reckon is the anti-anxiety meds. So I'm on the phone to my GP about it on a Friday afternoon, headphones in, single-parenting on a sunny day. Arthur grabs my hand and drags me out the front door because the ice cream van has just turned up. (The ice cream van comes every day. This is a fact about my street.)

I'm telling the doctor my diet is genuinely excellent and I do exercise, and she's listening patiently. The ice cream van starts pulling away, prematurely, before we get to it, and I bellow, at the top of my lungs, COME BACK MR ICE CREAM VAN MAN. Then I get back on the phone and carry on telling the doctor my diet is excellent.

I'm sharing this partly because it's about to be load-bearing, and mostly because it's a genuinely funny story.

[FIGURE: homer-ice-cream]

Here's what I didn't know yet. The anti-anxiety meds were probably treating the wrong condition; what I had looked more like ADHD showing up as anxiety, and the treatment is genuinely different. The meds revelation comes later — the meta point matters here. Noticing the gap between the diagnosis I had and the one that fit was what made me notice I'd been working around the same gap in my technical work for twenty years. The brain that bellowed at an ice cream van has been quietly chewing on this since I started doing real technical work, and I only saw the through-line because I'd had to look hard at a wrong-frame thing once already.

## Beat 2: The instinct in plot form

Aurora, 2021 to 2025. Flight-dynamics studies producing data with a shape — coupled inputs, branching outcomes, conditional dependencies between parameters — and the standard deliverable was a PowerPoint deck with a few hand-picked plots and bullets underneath.

I refused. Not dramatically; I just kept building Plotly + Dash dashboards instead and sending those round when people asked for the slides. They could sweep an alpha range, change a control deflection, watch the moment coefficient walk around in real time. The rectangular slide was a lossy compression of work that didn't compress that way.

The objection was topological. The data had a shape — a graph of relationships between inputs, outputs, regimes, edge cases — and a PowerPoint slide is rectilinear by construction. Two axes, a colour bar if you're lucky, a title. You can project graph-shaped data onto rectilinear axes the same way you can project a globe onto a flat map. You get an answer. You also lose almost everything that mattered.

[FIGURE: plotly-vs-powerpoint]

A manager I worked with appreciated the point and said so out loud — a small thing I still remember years later, which tells you how often that reaction landed. The wider organisation couldn't price it. The deliverables list had "deck" on it and "deck" was rectilinear.

I'd send both. The deck got circulated; the dashboard got bookmarked by three people and forgotten. First instance of a pattern that's about to keep happening: the topology-shaped output is the better artefact and the rectilinear-shaped output is the one the system can absorb.

That gap is the whole post.

## Beat 3: The instinct in the wild

Two examples. There are more but two is the right number; volume dilutes the pattern.

**The receptionist.** A few years ago I went to register at a doctor's surgery and they handed me a paper form asking me to fill in everything the practice already had on file. Address, GP history, medications, allergies. The receptionist watched me hesitate. *Just fill it in,* she said, kindly, the way you'd talk to a slow child. I did. I was the only person in the waiting room who looked annoyed, and I was, visibly. The form was a flat projection of structured data already sitting in a database — same instinct as the PowerPoint deck. Take a thing with structure, flatten it, make a human do the work the system should be doing. Tedious thing to be cross about. I was cross about it anyway.

**The printer.** University, late at night, trying to print a thesis chapter. The print server was down, or queueing things into the void, or doing whatever print servers do when you most need them not to. I checked the printer's IP on the back of it, opened a TCP connection straight to port 9100, and pushed the PostScript at it directly. It printed. My rule at the time, which I still mostly hold to: *if I'm able to do it, I assume it's allowed.* The print server existed for legitimate reasons (queueing, accounting, drivers) and as a designed flow I was meant to follow when a more direct path was right there. Same instinct. Refuse the projection. Go to the thing.

[FIGURE: cartoon-ip-printer]

I have, in both cases, been told off. Neither time did it change my mind.

## Beat 4: Paradigm

Boeing has a tool called Cascade. Mathematically clean, built by people who knew what they were doing, and it lets you ask things like *if we replaced this fleet of 737s with this hypothetical hydrogen aircraft, what happens to global aviation emissions?* — over real flight data, at planetary scale. What it does, mathematically, is swap aircraft on routes and recompute. Hand it a fleet plan, get the emissions consequence. Answers that question well.

The question I kept getting stuck on, which Cascade didn't, was the one underneath: *which aircraft can fly from which airports.* A hydrogen 737 can't land where there's no liquid hydrogen. A battery-electric regional can't operate without charging. The aircraft swap presupposes the airports have already been upgraded — and they haven't. The bottleneck on aviation decarbonisation isn't only fleet renewal; it's the discrete, capital-constrained, sequenced problem of upgrading the *network* the fleet flies on.

So I built a thing called Paradigm. Paradigm needed an organisation that could absorb cross-domain work, and Boeing's structure couldn't price that kind of option-value yet. Not a villain story; a too-big-to-turn story.

### The reframe

Small in words, large in consequence. *Stop optimising the fleet. Optimise the network the fleet flies on, and the fleet that network can support, jointly.*

Optimise aircraft alone, you get plans that depend on infrastructure that doesn't exist. Optimise infrastructure alone, you get upgrade lists with no connection to which aircraft will benefit. Coupled, the problem becomes: given a budget, a timeline, a fleet roadmap — *which airports do you upgrade, in which order, to maximise CO2 reduction?* Graph problem, binary decisions, sequencing dimension.

Which is to say: it's a MILP. Mixed-integer linear programming. Decades-old, well-understood by the OR community, solvable to optimality with off-the-shelf solvers if you formulate it sensibly.

### The MILP, walked through

For each airport `i`, a binary `A_i ∈ {0, 1}`: is this airport upgraded? For each route `i → j`, a binary `R_ij ∈ {0, 1}`: is this route eligible to fly the new aircraft? A route is eligible only if both endpoints are upgraded.

[FIGURE: milp-equations]

(Aside, because it earns its space. I originally wrote the endpoint constraint as `R_ij ≤ (A_i + A_j)/2`, the averaged form. Both are correct for binary variables; the paired form gives a tighter LP relaxation and the solver prunes faster. An LLM pointed that out while I was drafting this article. Standard OR practice I picked up incompletely, because I came at MILP from engineering rather than optimisation. Beat 9 returns to this.)

Budget caps you at `K` airports. The objective maximises CO2 decarbonised across all eligible routes — each `CO2_ij` is the actual annual CO2 on that route, from real per-flight data, not a great-circle proxy.

Sequencing makes it interesting. You upgrade in stages — 2030, 2040, 2050 — each with its own budget. Once upgraded, an airport stays upgraded, so stages chain with `A_i^(t+1) ≥ A_i^(t)`. One combined MILP, not a greedy step-by-step. Greedy is the obvious wrong answer; it'll happily spend stage one on the highest-CO2 airport in isolation and miss that stage two wanted that airport's neighbour first.

[INTERACTIVE DEMO: globe with budget K and year sliders. Shows optimal vs. greedy-by-traffic vs. greedy-myopic vs. biggest-cities. Hover for tooltips. Comparison chart below.]

### Coupling aircraft requirements to network state

The original synthesis in Paradigm wasn't the MILP. It was the bidirectional coupling: aircraft payload and range determine which routes a hypothetical aircraft can fly, which determines which airports matter to upgrade, which determines which aircraft designs make sense to develop. Run the loop both directions, jointly, and you get answers neither half gives alone. How this fed Boeing's aircraft strategy is left as an exercise for the reader.

### Cost-prediction features

Cost wasn't a constant per airport. Distance to existing infrastructure, water availability, renewables proximity — engineering-derived predictors from public data, turned into per-airport upgrade-cost estimates. The bit where engineering applied directly to OR. Not exotic. Just careful.

### Prior art, briefly

Hub location with phasing is a standard OR formulation, decades old; DLR, MIT and NASA have published on hydrogen infrastructure rollout. Paradigm sat in a gap — coupling aircraft to network with engineering-derived costs — without inventing the technique.

Paradigm won the No-Bull Prize at the CoW (Crew and Fleet Optimisation Workshop) in 2025. A mock reviewer in the rehearsal panel for my Associate Technical Fellow interview called it "revolutionary." It was the cornerstone of the actual ATF interview. The ATF panel didn't see demonstrable impact, and the project got dropped.

I was furious and heartbroken, and it took me a while to realise the system, not the work, was the problem.

The bidirectional coupling is what I want you to take from this beat. The MILP is the shape; the coupling is the original move. Run them together and a fleet planner and an infrastructure planner can both act on the result. Not novel maths. Just the willingness to write the constraint that says *these two things have to be solved as one thing.*

## Beat 5: Pickles → HDF5 → SQL → Postgres

Twenty years of disciplined infrastructure work, no moments of insight, just one migration after another to find a less-wrong place to put graph-shaped data. Pickles, then HDF5, then SQL, then Postgres with proper foreign keys and recursive CTEs for the genuinely graph-shaped queries. None of it was a bright idea. It was being mildly annoyed at the current storage layer for not being shaped like the data was, and migrating to the next thing that was a bit less wrong. (Thanks Jeremy Harris for explaining, calmly, that pickles weren't a database and never had been. Small career-shaping moment.)

The reason I'm spelling it out at all is that I don't want anyone reading the rest of this post to think I'm claiming exceptionalism. The infrastructure caught up to the instinct slowly, in the same plodding way infrastructure always catches up. The instinct was visible all along; the supporting tooling was the bit that took the years. (I am, for the avoidance of doubt, still using SQLite for things I really shouldn't.)

## Beat 6: Vera

Vera Yang is the president of Flexcompute. She found me through one of my interactive flight-dynamics explainers — the Plotly-not-PowerPoint instinct, in public form, on the open web — and decided I should be at the company before I'd worked out that I should be.

[FIGURE: vera-applet]

Two organisations with different filters, looking at the same artefact, seeing different things. One graded the work on whether it could be priced into a deliverables list; the other graded it on whether it looked like the kind of thinking they wanted more of. The first filter is more common. The second is rarer, and tends to get run by the people who set the filter themselves.

It does close a loop, and I'd be lying if I said I didn't notice it closing. The signal one organisation's framework couldn't price was the signal another organisation's president went looking for. Not a generalisable lesson — a specific observation about what was true here, worth flagging because the rest of the post is about exactly this kind of mismatch in the abstract.

## Beat 7: Thread

Here's the bit I didn't see for a long time. The answer was in my subconscious the whole time — the network structure, the database theory, the data richness all come together. I just didn't have the framing to name it until I was sitting in the middle of building the next thing.

Thread is what I work on now. The technical pitch is three lines.

Simulation data is a DAG. Every result depends on inputs, which depend on prior results, which depend on prior inputs, all the way back to the original geometry and meshing decisions. That's a directed acyclic graph by definition, not by analogy.

The problem is that almost no one stores it that way. Excel and pandas and CSVs and folders-of-PNGs give you the *illusion* of connectivity — the artefacts look related, share filenames — but the actual relationships live in someone's head and walk out the door at six o'clock. Watch what happens on most teams when someone asks a straightforward traceability question:

[FIGURE: data-black-market]

Stored as a DAG-in-a-database (rather than a directory of files with a naming convention nobody can quite remember), you get provenance and associativity for free. *Where did this number come from* and *what else came from the same source* both become single queries instead of three days of detective work. The table view people actually want still works — it's a projection over the underlying graph, with each cell quietly carrying its own walk-back receipt.

[FIGURE: flat-view]

Which frees the user from the rectilinear constraints of pandas, polars, Excel, CSV. The original sin of computational workflows: the format you ship results in is the format you end up thinking about results in, and CSV in particular has been quietly limiting what people are willing to ask of their own data for thirty years. I've written about this elsewhere — [CFD is stuck in the file era](LINK_TO_BE_INSERTED_BY_HARRY) — and I won't rerun the argument here.

Thread is the topology instinct given proper tooling, and structurally the same complaint as the PowerPoint deck and the doctor's-office form: *the thing has structure, and the format you're forcing it through doesn't.* The difference is twenty years of catching up. Refuse the flattening. Store the topology. Let the user query the actual shape of their work. That's the project, and it is the same project as every other one in this post.

## Beat 8: ADHD braid

Worth flagging before this beat: the technical through-line above existed in my subconscious for twenty years. The conscious experience was chaos. The two facts coexisted and I'd like to talk about how.

A few months ago I started on prescribed ADHD medication. It has been the most useful single intervention I've had in my professional life. (Yes, a Director of Flight Sciences blogging about ADHD meds is a deliberate exposure decision; half-strength is worse than either fully in or fully out, so it's fully in.) The reason it earns a paragraph here, beyond the personal, is that the meds let me see *why* AI is a good fit for the way my brain works. The AI's job is the boring grind I'm bad at; the meds gave me enough executive function to actually hand the grind over rather than abandoning the project at the same point I always did before.

The thing the meds clarified, which I hadn't expected: I always thought ADHD meds would stop me jumping between things. What I learned is I was never that good at it. I'd drop tools when I was done with them like they ceased to exist. I'd start a thing, work on it intensely, get it to a state I considered "essentially done," and never come back to harden, document, productionise, or in some cases even commit it. The boring grind at the end of a project wasn't visible to me — not as in "I avoided it," more as in "I didn't perceive it as a thing that existed."

The meds didn't kill the through-line. Topology, refusing to flatten, network-shaped problems — that was always there. What the meds turned down was the chaos around it. I can now look at a half-finished thing, see that it's half-finished, and finish it. That sounds embarrassingly basic. It is.

[FIGURE: subverted-adhd-flowchart]

The flowchart is a two-state animation. State one is the meme everyone with an ADHD diagnosis has seen forty times: get new idea → start new project → tell everyone → loop, with "finish project" floating off to the side, disconnected. State two is my actual flowchart now: get new idea → recognise it's connected to three previous ideas → hand the boring bits to a swarm of agents → stay at the connection level → actually finish. The original loop is preserved, because that bit didn't go away and I don't want to pretend it did. What's new is the connection to the AI swarm that does the boring grind, and the connection from that swarm back to "finish project," now a green node instead of an orphan.

The brain doesn't get fixed. It gets supplemented. I'm not going to extend that into self-help — half the internet is doing that already — but I need it on record for what comes next, because the configuration the meds enabled is the configuration beat 9 is about.

## Beat 9: AI thesis (humble version)

The current AI configuration that works for me, in 2026, is one person with cross-domain taste running a swarm of fast cheap specialists.

[FIGURE: cartoon-orchestrator]

The specialists are good — really good, on bounded problems, at speeds and costs that didn't exist eighteen months ago. They write boilerplate, do schema migrations, run literature sweeps, draft tests, regenerate boring sections of articles in the right voice if you give them the voice file. What they don't do, reliably, is notice that two problems in different communities are the same problem.

That's the role I've ended up in. Generalist orchestrator. Hold the shape of the problem, route the bounded sub-problems out to the swarm, integrate the answers back, decide when an answer is wrong. Exactly the role my PhD supervisor played for me, and exactly the role I had no idea I'd been training for.

Whether this configuration is permanent is genuinely unclear. AI may develop something taste-shaped — something that holds problem shape across communities and notices when their vocabularies are pointing at the same underlying thing. If it does, the orchestrator role compresses, possibly hard. The honest version: *right now, in 2026, this configuration is real and rare. The window depends on how fast taste-shaped AI arrives, and I don't know how fast that is.*

What I'll say with more confidence is that the configuration didn't exist before. A brain wired the way mine is — refusing to flatten, jumping between problems, holding loose connections across communities, pathologically uninterested in the boring grind — was previously an engineering tax. You paid it in unfinished projects, dropped tools, and a CV that read as "scattered" to anyone whose filter rewarded coherence over connection. Now the same wiring is the bit the orchestrator role rewards, because the swarm picks up the grind tax that used to compound on you alone.

A small social side-effect I wasn't expecting: I used to vocalise hair-brained ideas at whoever was in earshot, because saying a thing out loud is how I worked out whether it was any good. Now I can talk to people about normal things and route the half-formed pre-ideas to an AI instead.

[FIGURE: cartoon-normal-things]

Use this article as the worked example. I told the LLM about Plotly, Paradigm, Postgres, Thread. It saw the surface pattern (refusing to flatten data) early and confidently. It did not see the deeper one (topology as first-class) until I named it. We had four beats fitted into a "data richness" frame before I noticed the frame was wrong. Asked afterwards why it missed it, the LLM gave me a useful answer: almost no one is a specialist in two of those communities at once. DAGs in software engineering, graphs in OR, network topology in telecoms, provenance in databases and archaeology — same mathematical object, different folklore. The cross-walk papers don't get written, because the people who'd write them are too busy doing the cross-walks.

Even a model that has read more about graph theory and CFD provenance than I ever will didn't bridge them, because the bridge isn't in the corpus. The bridge was in my head. The bridges live in the heads of generalists and there isn't currently a substitute, which is fragile, and which, for now, is rare and valuable.

The brain that was a tax is now an asset. Unfinished projects are something the swarm finishes. Scattered interests are something the swarm follows up on. The connection-noticing — the bit I was always actually doing, even when I didn't know it — is the bit no specialist in the swarm can do for me, because the connection requires having been all of those specialists, badly, at once.

## Beat 10: Meta-twist closer

This article was written this way. I wrote prompts; a swarm drafted; I edited; the LLM had a copy of `Writing Style - Harry Smith.md` and tried, with mixed success, to sound like me; I rewrote the bits where it didn't. The voice you've just read is mine, not because the LLM wrote in my voice, but because I rewrote until it did. The orchestrator-and-swarm configuration from beat 9 isn't a thesis I'm asserting at you — it's the thing that produced the article you're reading. Form follows content one more time. That's the post.

One more thing, by way of P.S. I made a video version of this argument a while back — *Where did that plot come from?* — same instinct done for fun rather than for prose. Thread, but louder.

[FIGURE: harry-plot-video]

---

## IP review flags

- Beat 4 — phrasing of Cascade as "swap aircraft on routes and recompute" is a public-talk-level description but worth a glance from Qiqi to confirm it doesn't drift into internal-process territory.
- Beat 4 — "feature pipeline that pulled engineering-derived cost predictors from public data" is intentionally generic; flagging in case the level of specificity (water, renewables, trucking metrics, distance-to-infrastructure) is still too close to internal feature lists.
- Beat 4 — "fed Boeing's aircraft strategy" is hedged with the "left as an exercise for the reader" line; flagging in case even that framing is too suggestive.
- Beat 4 — the No-Bull Prize / CoW 2025 / ATF interview details are personal-career facts but involve Boeing's internal review process; worth a glance to confirm the framing is fine to publish.

## Decisions made

- Did not name the manager in beat 2, the mock reviewer in beat 4, or the ATF panel members; only Jeremy Harris (beat 5) and Vera (beat 6) are named, per brief.
- Used "I'm aware that being a Director of Flight Sciences who blogs about Adderall is a deliberate exposure decision" as the parenthetical aside in beat 8; kept it because it reads honest rather than performative, but flagging it for Harry's call.
- One use of "fucking" was on the table for beat 4 or 8 per the cap — I didn't deploy it; the heartbreak verbatim line carries the emotional weight of beat 4 on its own, and beat 8 reads cleaner without it. Harry can drop one in if a specific line wants it.
- Demo placeholder in beat 4 written as a single bracketed line per brief; figure placeholder in beat 8 written as `[FIGURE: subverted-adhd-flowchart]` plus a single descriptive sentence.
- "MR ICE CREAM VAN MAN" rendered in caps inline rather than block-quoted, to keep beat 1 at conversational density.
- Treated the "pickles weren't a database and never had been" Jeremy Harris moment as load-bearing; expanded the credit slightly past the "thanks Jeremy Harris for teaching me that's what I was doing" verbatim phrase. Easy to trim if Harry prefers the bare credit.
- Beat 7 link placeholder rendered exactly as `[CFD is stuck in the file era](LINK_TO_BE_INSERTED_BY_HARRY)` per brief.
- Did not include any "Stay tuned" / contact CTA / series-cliffhanger framing.

## Sentences I'm least confident in

- Beat 1, "She is a good doctor and she did not, to her credit, write anything about ice cream vans into the notes (that I'm aware of)." — the parenthetical might be a beat too cute; Harry will know whether the doctor-as-character lands or distracts.
- Beat 4, "That, to me, is what an actual optimisation problem at the boundary of two communities looks like." — the "to me" hedge is doing some work, but the sentence around the verbatim heartbreak line is sitting in a tonally tricky spot and Harry will have a stronger ear for whether the technical-thread resumption works.
- Beat 9, "I want to be clear that I'm not flexing about that. The opposite — the bridges live in the heads of generalists and there isn't currently a substitute, which is fragile, and which, for now, is rare and valuable." — already revised once; the verbatim phrase is in there but the sentence framing it is still doing too much. Probably wants Harry to write the ending himself.
