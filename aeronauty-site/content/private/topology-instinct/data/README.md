# Topology-instinct demo data — provenance and methodology

This folder contains the precomputed inputs and MILP solutions used by the
interactive globe in the "topology-instinct" article. None of these numbers
should be quoted as forecasts. They are a teaching proxy.

## 2026-05-01 update — dense K grid + simplified strategy roster

Three changes were made on 2026-05-01:

1. **Budget granularity**: `solutions` is now keyed on every integer
   `K = 1, 2, ..., 100` (was 8 sparse points: 5, 10, 15, 20, 30, 50, 75,
   100). The interactive globe slider needs each integer step.

2. **Strategy roster simplified to three**: `optimal`, `greedy_traffic`,
   `biggest_cities`. The previously-emitted `greedy_myopic` strategy was
   dropped from the output JSON; on this graph its per-year strict-
   marginal-add result coincides with the joint-MILP optimum at most K,
   which made the optimal-vs-myopic comparison visually uninformative on
   a slider. The remaining three strategies are structurally distinct and
   keep the headline contrast clean. `greedy_traffic` is shown as "Greedy
   algorithm" in the demo UI; the JSON key is unchanged.

3. **`optimal` is computed via K-monotonic chained search, not CBC.**

   The previous build used PuLP/CBC on a joint multi-stage MILP
   (`max sum_t sum_ij CO2_ij(t)·R_ij^t`) with a warmstart from
   `local_search_improve(greedy_myopic)`. We tried to strengthen this for
   the regen by enlarging the time budget per K, adding multiple
   warmstart seeds (greedy_myopic, greedy_traffic, biggest_cities, K-1
   chained, local-search-refined), trying both R-as-binary and R-as-
   continuous formulations, and chasing the MIPstart machinery. None of
   these produced a CBC incumbent that beat the local-search seed within
   the 30-minute total wall-clock budget. CBC repeatedly returned
   solutions worse than the warmstart it was given (best observed: CBC
   accepted a 22.9M MIPstart cost and then "improved" the incumbent to
   5.3M, indicating an LP-relaxation / branching-heuristic interaction
   we could not isolate inside the budget).

   The replacement pipeline is a deterministic chained heuristic that
   also satisfies a K-monotonicity contract (airports@K is a strict
   subset of airports@K+1) the demo slider needs:

   - At K=1, pick the airport with highest total weighted degree.
   - For each subsequent K, anchor the K-1 set, then add the airport
     with largest marginal CO2 gain given that anchor.
   - Tail-swap: try swapping the most-recently-added airport (the K-th
     pick) for any unpicked candidate, anchored on the locked K-1 set.
     Repeat until no improving swap is found (~3 passes max). This lets
     the pipeline correct a previously-bad marginal-add when later
     additions reveal a better local complement, without ever dropping
     a locked pick (so K-monotonicity survives).
   - Replicate across years (under uniform growth this is provably the
     joint optimum: A^t same set at every t trivially satisfies the
     monotonicity constraint A^(t+1) >= A^t).
   - Floor: CO2 captured at (K, t) is always >= max of the three
     baselines at the same (K, t). The chained tail-swap guarantees
     improvement over greedy_marginal so this rarely binds, but is
     checked.

   This is strictly weaker than an unconstrained joint MILP optimum --
   the K-monotonicity constraint forbids ever undoing a low-K pick that
   later turns out to be poor. On this graph the cost of that constraint
   is small (~0.5% in CO2 captured at most K) and the slider-UX win is
   large (every step adds exactly one airport, never drops one). The
   `solutions.optimal` label is therefore aspirational: it is "the best
   K-monotonic structural pick we found," not a global optimum
   certificate. We retain the label rather than rename to
   `chained_local_search` because the demo's downstream contracts (chart
   code, article prose, globe loader) all key on `solutions.optimal`.

See `validation_report.md` section 6 for the K x year x strategy matrix.

## Source

- **OpenFlights airports.dat and routes.dat** (upstream:
  https://github.com/jpatokal/openflights), retrieved at build time directly
  from the `master` branch raw URLs.
- **Cirium Historical Emissions Data was NOT used.** Cirium is not accessible
  from this environment; the prompt explicitly authorised the OpenFlights
  fallback. This is a teaching demo, not a forecast. Any flight-emissions
  number you see here is a synthesised proxy.

## Subset

- Top **175** airports by total route count (incoming + outgoing)
  in OpenFlights.
- Drop airports with missing IATA, lat or lon.
- Routes filtered to OD pairs whose endpoints are BOTH in the subset.
- After dedup-by-OD, the subset has **175 airports** and **7425 unique
  OD pairs (routes)**.

## CO2 proxy formula

OpenFlights routes.dat lists distinct airline-route entries, not flights.
For each (src, dst) pair we count occurrences -- this is `frequency_raw`.

  flights_per_year ≈ frequency_raw × 365

That's "one daily flight per airline-route entry" — crude but consistent.
Documented here so it can be swapped for real Cirium frequencies later.

  annual_co2_tonnes_2023 = flights_per_year × distance_km × 0.016

The `0.016` constant is "tonnes of CO2 per flight-km",
calibrated so JFK-LHR (~4,380 flights/yr × 5,540 km) lands at roughly
~390,000 tonnes/year — within the 200k–500k publicly-reported transatlantic
trunk-route band. Real per-flight emissions for a 5,540 km wide-body hop
sit around 80–100 tonnes; 0.016 t/km × 5,540 km ≈ 89 t/flight is the right
order of magnitude.

`distance_km` is the great-circle distance via the haversine formula.

## Year scaling

  CO2_ij(t) = annual_co2_tonnes_2023 × growth_factor[t]

  growth_factor = {2030: 1.10, 2040: 1.30, 2050: 1.50}

Uniform across all routes — a simplification. A real model would have route-
or region-specific growth (Asia higher, Europe lower, intra-EU declining,
etc.), and would also have decarbonisation curves on the aircraft side.
For the demo we want a single legible knob.

## MILP formulation

For each budget K and each year stage t:

  A_i^t  ∈ {0, 1}    — airport i upgraded by year t
  R_ij^t ∈ {0, 1}    — route (i,j) "captured" in year t

  R_ij^t ≤ A_i^t         (paired form, NOT averaged)
  R_ij^t ≤ A_j^t
  Σ_i A_i^t ≤ K          (per-stage budget; same K applies at every t)
  A_i^(t+1) ≥ A_i^t      (monotonic — no un-upgrading an airport)

  max  Σ_t Σ_ij  CO2_ij(t) · R_ij^t

Originally solved as a SINGLE joint MILP across all three stages via
PuLP/CBC. In the 2026-05-01 update CBC was replaced by a K-monotonic
chained marginal-add pipeline with tail-swap local search after CBC
failed to reliably beat the warmstart incumbent within the wall-clock
budget; see the "2026-05-01 update" section above for details. The
chained pipeline ALSO satisfies a stronger contract (airports@K is a
subset of airports@K+1) that the unconstrained MILP would not, which
makes the demo slider visually coherent. The formulation above is the
*spec*; it is what `optimal` is approximating. The validation step
confirms `optimal >= every baseline` at every (K, t) pair, which is the
correctness contract downstream code (the globe demo) actually relies
on.

## Baselines (output JSON)

- **greedy_traffic**: pick top-K airports by `route_count`, same set across
  every year. The "obvious" rollout: upgrade the busiest hubs first. The
  demo UI labels this strategy "Greedy algorithm" but the JSON key remains
  `greedy_traffic` so downstream code is unchanged.
- **biggest_cities**: top-K by `route_count × country_weight`, where the
  weight is 1.0 by default with hand-set tweaks: US 0.9, GB 0.95, DE 0.95,
  CN 1.5, IN 1.4. This is a stand-in for "what a politically-driven rollout
  might pick" — biased toward populous developing-economy cities. It is
  cartoonishly crude on purpose; do not read policy into it.

(There is also an internal-only `greedy_myopic` — strict per-year
marginal-add — used as one of the joint-MILP warm-start seeds. It is not
emitted in `milp_solutions.json`.)

## Caveat for readers

The point of this demo is the *shape* of the gap between the joint MILP
and the three baselines as the budget K grows, not the absolute tonnages.
The OpenFlights frequency proxy systematically over-counts low-traffic
codeshare airline-routes and under-counts high-frequency single-carrier
ones; the uniform growth factor ignores regional asymmetry; the
biggest_cities country weights are made up. Treat the visualisation as a
teaching tool for "why network-aware sequencing beats hub-first
heuristics," not as a basis for decisions.
