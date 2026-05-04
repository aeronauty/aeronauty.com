# I Don't Like Data Entry

I've put on a bit of weight over the last couple of years despite eating less and working out more [asterisk: Yes, I'm 39. It happens - but I've legitimately run marathons, deadlift > 2x my increasing bodyweight, and eat clean and healthy. Something is wrong in the calculus of my waistline.]. My wife (who is an NP) had the epiphany that it's probably the anti-anxiety meds I've been on for...about two years. Cut to me on the phone to my GP[asterisk: PCM for Americans] about it on a Friday afternoon, on the call with headphones in, single-crewed-parenting our son Arthur on a sunny day.

Arthur grabs my hand and drags me out the front door because the ice cream van has just turned up. (The ice cream van comes every day, and negotiations about getting ice cream happen every day.)

I'm midway through telling the doctor my diet is genuinely excellent and I do exercise, and she's listening patiently[asterisk: whilst I have the unfounded suspicion that she doubts me]. The ice cream van starts pulling away before we get to it and I bellow, at the top of my lungs, "COME BACK MR ICE CREAM VAN MAN." Then I get back on the phone and carry on telling the doctor my diet is excellent.

[EPIQUOTE]
COME BACK MR ICE CREAM VAN MAN.
[/EPIQUOTE]

I'm sharing this partly because it's about to become load-bearing for everything that follows, and partly because it's the life event that set all of this in motion. Mostly, though, I'm sharing it because it's a genuinely funny story and I know I need to tell it.

[FIGURE: homer-ice-cream]

We (me, wife, doctor) figured out that the anti-anxiety meds were probably treating the wrong condition; what I had looked more like ADHD showing up as anxiety. The reason it matters here is because it forced me to understand how my brain works, and how it doesn't. Seeing the effect of Adderall has made it easier to notice the pattern and thread of work that I've been solving in my subconscious for the last decade in various forms - and how it led to Flexcompute Thread.

Fundamentally, I've realised that my career has included one long attempt to avoid pointless data entry. Not because I'm above it, but because **data entry is boring, humans are error-prone, and there's almost always a better way.** I love Autofill on my iPhone - especially because we move a lot as a military family and I've had four zip codes with 6's, 0's, and 1's and I find it hard to remember which one was which on forms.

In engineering systems, it's annoying because data and its relationship to other data has a shape[asterisk: that should be datums and relationship to other datums, perhaps. I don't know, I'm not a dictionary.]. That shape got lost somewhere between two tools, or two teams, or two formats, and a human got handed the reconstruction job and lost the shape and context at the same time. This is what's going on when you find yourself typing the same thing into a second box, or hard coding a constant, or exporting to file and re-importing into another tool, or filling your name and telephone number back out on a repeat visit to the doctor.

There's a smaller, more personal version of this realisation that I had years before any of it got technical. I've always tried to automate tasks that I knew didn't interest me — because boredom produces errors, and because the *challenge* of figuring out an automation is *fun*. Data entry is the worst case: both boring and error-prone. Richer data[asterisk: by which I mean data that contains more information than you see in any particular view] is the opposite. Richer data is *more interesting*, and when there's structure, wrong answers look and feel wrong, because they break the structure - which you can _only_ do when you have the ability to observe all data together. Contrastingly, if you typo a number into a CSV or an Excel spreadsheet, the mutated data is just as happy as it would have been with the right number[asterisk: not to mention that the manual transfer makes it out of date the moment you do it].

My ADHD diagnosis didn't tell me that. It just made it obvious to me: avoiding boring error-prone work hadn't been laziness[asterisk: why copy some numbers into a spreadsheet when I can spend twice as long automating it?], it had been my brain's natural response to a class of work that uses none of the things my brain is good at.

This is a post about that pattern, and my personal realisation. It ends, for now, at a thing called Flexcompute Thread - and I give a glimpse at why it's magical. There's also a [Part 2/sister article about why AI agents are ideal for generalists](/writing/the-brain-that-was-a-tax).

I am also aware that this writing is long and not everyone[asterisk: or anyone, barring my father (thanks, Dad)] will read it in full. The act of writing this and publishing it is really for me, because it's helping me to get my thoughts out and forcing me to structure them.

## The instinct in plot form

I was annoyed during my PhD at having to embed PNG figures into a PDF, and my small act of 'rebellion' to that fact was to spend _weeks_ learning how to use PDF_TEX and LaTeX to ensure that typography matched the rest of the document, and that captions and annotations in figures were text-searchable[asterisk: Me: *Why wouldn't this be a good use of my time?*]. At ARA[asterisk: where there's actually a _wonderful_ data graphing system for live data written in Fortran, from the 1980s], I battled the CTO[asterisk: We're friends now, thanks <a href="https://uk.linkedin.com/in/blucad">Peter</a>.] about why I had to use Microsoft Word when it's clearly the wrong tool for engineering reports. At IIT, I wrote and proselytised with scripts to automate grade submission to the Senate[asterisk: in lieu of hand-submitting via a form, which every other faculty member was happy with]. At Aurora, I authored flight-dynamics studies and was expected to put the results into PowerPoint. I refused. Not dramatically; I just kept building Plotly + Dash dashboards and sending those round when people asked for the slides. They could interrogate the data without using _me_ as an intermediary.

I'd send both. The deck got circulated; the dashboard got bookmarked by three people and forgotten.

I realise now, that my recalcitrant objection was philosophical and topological[asterisk: Not sure I have to phrase it like such a wanker, though]. Data has a shape — a graph of relationships between inputs, outputs, regimes, edge cases — and a PowerPoint slide is a flat projection that loses everything that makes data _rich_. You can project any data onto rectilinear axes the same way you can project a globe onto a flat map. You cannot reverse this projection, and you cannot recover what is lost.

[FIGURE: plotly-vs-powerpoint]

[VIDEO: plotly-vs-powerpoint-morph]

This is the first instance of a pattern that's about to keep happening: the topologically-guided output is the better way to keep data alive and the rectilinear-shaped output is the one that most systems can absorb, including human beings.

That gap between them and what a crude transfer throws away is the whole post.

## Paradigm

The bigger version of this, the one that mattered most professionally, was a project called Paradigm[asterisk: I tried to shoehorn a backronym for Predicting Aviation Routes and Decision Intelligence for Global Mobility, but even I had to accept that it was contrived and that I just wanted the cool name of Paradigm]. I had been at Aurora for a couple of years and got seconded to Boeing's Sustainability and Future Mobility team, working on Future Aircraft Conceptual Design. I was brought in to do Stability and Control Estimates[asterisk: I actually think/know that Dom wanted me to be there to do whatever it is I'm good at...which at the time he called Data Storytelling.] and finished that quickly, but questioned "how do we know our requirements are right for design of something that's never been designed before and doesn't fit into the niches currently there for aviation?"

[EPIQUOTE]
How do we know our requirements are right for design of something that's never been designed before and doesn't fit into the niches currently there for aviation?
[/EPIQUOTE]

Boeing has a tool called [Cascade](https://boeing.mediaroom.com/2023-05-17-Boeing-Publicly-Launches-Cascade-to-Support-Aviations-Net-Zero-Goal), built by the sister team of the one I was on. Mathematically clean, built by people who knew what they were doing, and it lets you ask things like *if we replaced this fleet of 737s with this hypothetical hydrogen aircraft, what happens to global aviation emissions?* — over real flight data, at planetary scale. What it does, mathematically, is swap aircraft on routes and recompute. Hand it a fleet plan, get the emissions consequence. Answers that question well, and provides as answer that people understand.

The question I kept getting stuck on, which Cascade didn't, was the one underneath: *which aircraft can fly from which airports?* A hydrogen 737 can't land where there's no liquid hydrogen. A battery-electric regional can't operate without charging. These factors affect the design requirements of next-gen aircraft in a way that they do not for Kerosene-powered aircraft. The bottleneck on aviation decarbonisation isn't only fleet renewal; it's the discrete, capital-constrained, sequenced problem of upgrading the *network* the fleet flies on.

My conjecture was that the sequence in which airports were upgraded would change the impact that new aircraft could make on emissions, and accordingly, the most efficacious upgrade sequence would determine the best design requirements for future aircraft.

So I built Paradigm. The reframe was small in words and large in consequence.

[EPIQUOTE]
Stop optimising the fleet in isolation. Optimise the network the new fleet will fly on, and the fleet that network can support, jointly.
— The Paradigm reframe
[/EPIQUOTE]

Optimise aircraft alone, you get plans that depend on infrastructure that doesn't exist. Optimise infrastructure alone, you get upgrade lists with no connection to which aircraft will benefit. Coupled, the problem becomes: given a budget, a timeline, a fleet roadmap — *which airports do you upgrade, in which order, to maximise CO2 reduction?*

Which is to say: it's a problem well-suited for MILP. Mixed-integer linear programming. Decades-old, well-understood by the OR[asterisk: Operations Research] community, solvable to optimality with off-the-shelf solvers if you formulate it sensibly - these solvers were originally designed to solve things like _The Travelling Salesman Problem_[asterisk: The canonical combinatorial optimisation chestnut: <a href="https://en.wikipedia.org/wiki/Travelling_salesman_problem">given a list of cities and distances, find the shortest possible tour that visits each once and returns home</a>.]. Binary variables for whether each airport is upgraded; binary variables for whether each route is eligible (a route is eligible only if both endpoints are upgraded); a budget cap; an objective that maximises CO2 decarbonised across all eligible routes, using actual annual per-route CO2 from real flight data, not a great-circle proxy. Sequencing makes it interesting — you upgrade in stages, each with its own budget, and once an airport is upgraded it stays upgraded — so the stages chain into one combined MILP rather than a greedy step-by-step. Greedy is the obvious wrong answer; it'll happily spend stage one on the highest-CO2 airport in isolation and miss that stage two wanted that airport's neighbour first.

[CALLOUT: milp-relaxation]

Later on, under advisement from a specialist smarter than me[asterisk: Thanks <a href="https://www.linkedin.com/in/jeremy-harris1">Jeremy Harris</a>.] moved to CP-SAT, which enabled a LOT more that I won't bore you with.

[FIGURE: milp-equations]

[INTERACTIVE DEMO: globe with budget K and year sliders. Shows optimal vs. greedy-by-traffic vs. greedy-myopic vs. biggest-cities. Hover for tooltips. Comparison chart below.]

The _really_ fun thing[asterisk: if you're a massive nerd like me] is that it proved the conjecture I had. Aircraft payload and range determine which routes a hypothetical aircraft can fly, which determines which airports matter to upgrade, which determines which aircraft designs make sense to develop. Run the loop both directions, jointly, and you get answers neither half gives alone. How this fed Boeing's aircraft strategy is left as an exercise for the reader[asterisk: I have presented the method in detail publicly, at academic lectures, but I don't want to spell out how to do all this in one place - but my still-unproven thesis is that there's a danger a company introduces a new aircraft that requires international infrastructure that inadvertently allows a competitor to flourish using design requirements optimal for that airport set.].

The cost predictors weren't a constant per airport either[asterisk: after the proof of concept]. The infrastructure cost was a complex set of models based on distance to existing infrastructure, water availability, renewables proximity — engineering-derived predictors from public data, turned into per-airport upgrade-cost estimates. Honestly, this was a whole load of fun - solving problems using geospatial algorithms, routing (for land and air vehicles), and large-scale search trees.

Paradigm formed the backbone of my Associate Technical Fellow (ATF)[asterisk: Not Alcohol, Tobacco, and Firearms - though that would be cool.] application for Boeing. I had accomplishments in traditional engineering fields at Aurora and from previous employers, but Paradigm really _felt_ like something powerful - if you _got it_ then you understood that it could change how we picked which aircraft to build. The tagline could be summarised as "stop drawing pictures of cool-looking future aircraft...start figuring out what sort of aircraft we _should_ draw pictures of."

[FIGURE: atf-looking-cool]

[EPIQUOTE]
Stop drawing pictures of cool-looking future aircraft. Start figuring out what sort of aircraft we should draw pictures of.
[/EPIQUOTE]

Paradigm needed an organisation that could reward and acknowledge cross-domain work, and Boeing's structure whilst great at building aircraft, was not set up to celebrate that at the time. Paradigm won the No-Bull Prize at the international Crew and Fleet Optimisation Workshop[asterisk: CoW Workshop...COW, No-Bull, Nobel...geddit? _Sigh_.] hosted by Jeppesen in 2025, credited as the work presented that was "most economically valuable to Boeing." A mock reviewer in the rehearsal panel for my Associate Technical Fellow interview called it "revolutionary," and told me I was a shoo-in for ATF.

[EPIQUOTE]
Most economically valuable to Boeing.
— No-Bull Prize citation
[/EPIQUOTE]

[FIGURE: jeppesen-no-bull-award]

The ATF panel didn't see demonstrable impact to Boeing and gave me a "sorry, no", and around the same time the project got dropped[asterisk: My manager, Dom Barone, always saw the value and gave me aircover, for which I am eternally thankful - but it could only last so long.]. I was furious and heartbroken. It took me a while to realise the system, not the work, was the problem - and it was hard not to take this as a personal failure.

The bit I want you to take from Paradigm isn't the equation. It's the same complaint as the PowerPoint deck and the doctor's-office form, scaled up. Two coupled systems — aircraft and airports — were being analysed separately, and someone was meant to manually reconcile the results. The MILP just put the coupling in the model so a human didn't have to - and that, compared to a solver built for that purpose, a human is laughably shit at.

[EPIQUOTE]
These two seemingly-separate things have to be solved as one big thing, and here's how.
[/EPIQUOTE]

That sentence is the whole project.

<aside class="ti-bridge-link">
  <p class="ti-bridge-eyebrow">The personal version</p>
  <p class="ti-bridge-copy">The companion essay picks up this exact move — refusing to decouple a problem that only makes sense when solved jointly — and asks why that kind of problem has always felt native to my brain.</p>
  <p class="ti-bridge-action"><a href="/writing/the-brain-that-was-a-tax#problem-class">Read the ADHD/aeroelasticity link</a></p>
</aside>

## Twenty years of trying not to be the human join operation

The plot stuff and Paradigm are the visible bits. Most of the work was invisible.

Twenty years of disciplined infrastructure work, no moments of insight, just one migration after another to find a less-wrong place to put graph-shaped data. Pickles, then HDF5, then SQL, then Postgres with proper foreign keys and recursive CTEs for the genuinely graph-shaped queries. None of it was a bright idea. It was being mildly annoyed at the current storage layer for not being shaped like the data was, and migrating to the next thing that was a bit less wrong. [asterisk: Thanks Jeremy Harris for explaining, calmly, that pickles weren't a database and never had been. "You're abusing pickles" was the phrase that without context is hilarious.]

[FIGURE: cartoon-storage-migrations]

[VIDEO: data-drift]

The reason I'm spelling it out at all is that I don't want anyone reading the rest of this post to think I'm claiming exceptionalism - quite the opposite. My understanding of infrastructure caught up to my instinct slowly, and I had many wrong steps along the way. The instinct was visible all along; the supporting tooling was the bit that took the years.

If I had to put the through-line on a t-shirt: I have spent over a decade trying not to become the `join`. The join between two formats. The join between a database and a paper form. The join between a fleet model and an airport model. The join between an analysis tool and a slide deck. Every time the system can't connect two things itself, a person has to. That person is an engineer who usually has to do this in lieu of their actual job, and it's the mundane bullshit that you're not taught in an actual engineering degree[asterisk: Case-in-point, my most watched YouTube video is <a href="https://www.youtube.com/watch?v=uhz_RKgCqe4">"How to loop over files in a directory using Python"</a>.]...because it's not engineering, it's administration.

[FIGURE: twenty-years]

The frustrating bit is that the tooling for not-being-the-join existed for most of those twenty years. Foreign keys are not new. Graph databases are not new. Provenance tracking is not new. What was missing wasn't the technology; it was anyone willing to sit in the gap between the engineers who had the data and the database people who knew how to store it properly. The OR community had MILP. The CFD community had file formats. Neither group routinely picked up the other one's tools, so the engineer in the middle ended up doing the picking up — which is, again, the same complaint. Two systems that should be coupled aren't, and a human ends up holding the coupling. Every time I migrated a storage layer, it was because nobody else had decided that the engineering data deserved the database treatment that the rest of the world had been using for decades. It wasn't a frontier. It was just a gap nobody had stepped into.

## Flexcompute

[Vera Yang](https://www.linkedin.com/in/vera-yang-54767959/) is the president of Flexcompute. She somehow found me through one of my interactive flight-dynamics explainers — the Plotly-not-PowerPoint instinct, in a [LinkedIn post](https://www.linkedin.com/posts/smithharry_flightdynamics-aislop-cursor-activity-7376916528644026368-kM7c) — and decided I should be at her company.

[FIGURE: vera-applet]

Two organisations with different filters, looking at the same instinct in me, seeing different things. One graded the work on whether it could be priced into a deliverables list; the other graded it on whether it looked like the kind of thinking they wanted more of. This isn't a slight on Boeing - they're a big and successful company for a reason.

So - thank you, [Vera](https://www.linkedin.com/in/vera-yang-54767959/). And thank you, [Dom](https://www.linkedin.com/in/dominicbarone/) - for keeping the project alive when the system around it wasn't built to reward that kind of work.

## Thread

Here's the bit I didn't see for a long time. The answer was in my subconscious the whole time — the network structure, the database theory, the data richness all come together. I just didn't have the framing to name it until I was sitting in the middle of building the next thing.

Thread is what I work on now. The technical pitch is three lines.

1. Simulation and modelling data is connected.
2. Every result depends on inputs, which depend on prior results, which depend on prior inputs, all the way back to the original geometry and meshing decisions. The connections aren't an analogy — they're literal. This number came from *that* run, which consumed *those* settings, which themselves were the output of some earlier step.
3. Each link is specific and recoverable, in principle.

The problem is that almost no one stores it that way. Excel and pandas and CSVs and folders-of-PNGs give you the *illusion* of connectivity — the artefacts look related, share filenames — but the actual relationships live in someone's head, or in a spreadsheet so complex it verges on AGI[asterisk: The _Pricing Spreadsheet_ at ARA had so many compounded formulas that it would look like a train station clackerboard when you did _anything_.], and walk out the door at six o'clock.

[VIDEO: excel-solari]

Watch what happens on most teams when someone asks a straightforward traceability question:

[FIGURE: data-black-market]

You get engineering archaeology. Someone digs through three project folders, finds a spreadsheet from a previous version, opens a screenshot whose filename references a deleted directory, and reconstructs — by hand, badly — what should have been a single query. The reconstruction job is the data-entry job. The structure was there once. It got lost in the flatten, and data became _stale_, immediately.

The clean version of the failure looks like this. An engineer has a pandas DataFrame open. The columns are run IDs, lift coefficients, drag coefficients, a comment column, maybe a timestamp. Someone in another meeting asks where one row came from — what mesh, what solver settings, what geometry version, what upstream study fed it. The DataFrame doesn't know.

If you do manage to pull all of that information into a spreadsheet or Excel, and you're using those to compare different simulation models, then you can end up with accidental misalignment - where an Excel lookup or a Pandas `where` tells you that your panel method has a mesh, your CFD results have an AIC, and your data row was produced by one person where it may have been many. This may seem like a trite _not-really-a-problem_ problem, but if you don't do these things properly (and no-one really does), then you end up in the mess that resonated when I spelled it out a couple of months ago in [Why CFD is Stuck in the File Era](https://hs.flexcompute.com/blog/why-cfd-is-stuck-in-the-file-era-and-what-comes-next).

Stored properly — rather than scattered across a directory of files with a naming convention nobody can quite remember — you get provenance and associativity for free. *Where did this number come from* and *what else came from the same source* both become single queries instead of three days of detective work. The flat table view people actually want to read still works. You can see, at a glance, which cells in a row are genuinely related, and which are sitting next to each other only because they share a row label and are thus comparable in the view you've chosen to see.

[FIGURE: flat-view]

**The view is a projection. The connections are the truth.** The flat table is a perfectly good thing to look at, and Thread will render it for you — without quietly throwing the structure away to do so. You can ask it questions a flat table can't answer.

The same trick lights up on a plot. A scatter chart is a projection of two columns; the rest — which mesh, which solver, which run, which actor, when — has nowhere to go on the page. In Thread it stays attached to the dot. *Hover the dot, ask the question, get the answer that wasn't on the chart.* And because each plot ships with a QR code and the Thread URL embedded in the PNG metadata, the chart can wander into a deck or a memo or a Slack thread and the connection back to the data still works.

[FIGURE: ask-the-plot]

That frees the user from the rectilinear constraints of pandas, polars, Excel, CSV. The original sin of computational workflows: the format you ship results in is the format you end up thinking about results in, and CSV in particular has been quietly limiting what people are willing to ask of their own data for thirty years.

There's a second thing this buys you, harder to demonstrate in a screenshot but the bit users notice after a week of using it. *What changed* becomes a real question with a real answer. Two runs differ — and instead of squinting at numbers and filenames to guess why, you get *why* directly. That kind of query was technically possible before, in the same way that recovering the structure manually from a stack of CSVs is technically possible — but the cost per question was too high. Drop the cost per question and people start asking better questions, and that's most of the value.

[EPIQUOTE]
Drop the cost per question and people start asking better questions.
[/EPIQUOTE]

The bit that lands harder than the question, though, is the inverse: when something upstream changes, *every plot that depends on it gets flagged stale, automatically, in every place it's been used.* The structures group reinforces a wing spar; the inertia tensor moves; some short-period-frequency plot from three weeks ago, sitting in two slide decks and a memo, is now answering the wrong question. With Thread holding the connections, that's not "did anyone notice" — that's a notification, before the next review, on the plot itself.

[FIGURE: what-changed]

Thread is the topology instinct given proper tooling, and structurally the same complaint as the PowerPoint deck refusal: *data has structure, and the format you're forcing it through doesn't.* The difference is twenty years of catching up. Refuse the flattening. Store the topology. Let the user query the actual shape of their work. Stop making humans re-enter structure the system should have kept.

[VIDEO: connections-by-hand]

## The thread

A short note before the close. The reason I could finally see all of this as one thing rather than as twenty separate annoyances is that I got an ADHD diagnosis and started medication a few months ago. I'll write about that properly in the next post — there's more to say than fits here. The relevant bit for this article is small: the diagnosis made the through-line legible, and the meds made it easier to finish the project rather than abandon it at the same point I always did before. The instinct didn't change. The visibility did.

So.

I used to think these were separate stories. Getting annoyed at filling in my name and phone number on _every visit to the GP_, the PowerPoint decks, Paradigm, the database migrations, Thread. They sat in different folders in my head — one for engineering, one for software, one for personal grievance — and I treated them like unrelated things[asterisk: I use the word 'thing' a lot, and I like it - even if it sounds inelegant.] I happened to have opinions about.

They are one thing, really.

The thing is not "I like topology," though eventually that became the technical language. The thing is simpler and more embarrassing: I don't like data entry.

Not because I'm above it. Because data entry is usually a symptom. It means the system had structure, lost it somewhere, and handed the reconstruction job to a person. The PowerPoint deck flattens a graph and asks the audience to imagine the connections back. The paper form ignores a database and asks the new patient to retype it. The Cascade-shaped fleet model and the airport-shaped infrastructure model sit in different rooms and ask a strategist to hold the coupling in their head. The CSV strips the provenance and asks an engineer to reconstruct it from filenames three months later. Different systems, same move. *Drop the structure. Make a human put it back, if it's done all.*

Thread is the latest and most literal version of that refusal. Store the shape. Preserve the provenance. Let the flat view be a view, not the truth. Stop making humans re-enter structure the system should have kept.

I don't think this is a particularly profound observation. It is, if anything, the opposite — most of the people I admire technically have an instinctive version of the same complaint, and the tooling response (databases, type systems, dependency graphs, build tools, even the version-control history of a file) is largely the same response across very different fields. The bit that took me two decades wasn't *having* the instinct. It was finding the right place to put it down. Plot dashboards were a place to put it down for a project. Paradigm was a place to put it down for a year. Postgres was a place to put it down with decent structure. Thread is, I think, the right place to put it down for the work I want to spend the next chunk of my career on.

That is the thread. It was there the whole time, and I'd love to talk to you about it.

<aside class="ti-sister-link">
  <p class="ti-sister-eyebrow">Companion piece</p>
  <p class="ti-sister-title"><a href="/writing/the-brain-that-was-a-tax">The Brain That Was a Tax Is Now an Asset</a></p>
  <p class="ti-sister-blurb">The same instinct, the other way round: from coupled engineering problems to the ADHD-shaped brain that kept being drawn to them.</p>
</aside>
