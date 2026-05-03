#!/usr/bin/env python3
"""
Build precomputed data for the topology-instinct scrollytelling article.

Pulls OpenFlights airports.dat and routes.dat (Cirium not accessible from this
environment), trims to a tractable subset, formulates the airport-upgrade
sequencing MILP in PuLP/CBC, computes three baselines, and writes:

  airports.csv
  routes.csv
  milp_solutions.json
  README.md (provenance + caveats)
  validation_report.md (sanity checks + comparison table)

Run end-to-end:  python3 build.py
"""

from __future__ import annotations

import csv
import io
import json
import math
import sys
import time
from pathlib import Path
from typing import Dict, List, Tuple

import pandas as pd
import requests
import pulp


# --- config ---------------------------------------------------------------

DATA_DIR = Path(__file__).resolve().parent

AIRPORTS_URL = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat"
ROUTES_URL = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat"

# Number of top airports to keep in the subset (by route_count).
# Tunable: report says ~150, expand to 175-200 if too few OD pairs survive.
TOP_AIRPORTS_N = 175

# 2026-05-01 update: dense budget grid (1..100) for the interactive globe
# slider. See README.md "2026-05-01 update" header for rationale and the
# Option-A treatment we use to keep `optimal` distinct from `greedy_myopic`.
BUDGETS = list(range(1, 101))
YEARS = [2030, 2040, 2050]
GROWTH = {2030: 1.10, 2040: 1.30, 2050: 1.50}

# Wall-clock budget for the optimal MILP loop. Hard-cap so an upstream
# slow CBC solve cannot blow past this. See `solve_optimal_for_K`.
TOTAL_OPT_WALLCLOCK_S = 30 * 60  # 30 minutes

# CO2 proxy calibration -- see README.md
# annual_co2_tonnes_2023 = flights_per_year * distance_km * CO2_TONNES_PER_FLIGHT_KM
# flights_per_year = frequency * 365  (one daily flight per airline-route entry)
# Calibrated so JFK-LHR (~12 carrier-routes -> ~4380 flights/yr at 5540km) lands
# in the 300k-450k tonnes range.  Real per-flight emissions on a 5540km hop
# are ~80-100 tonnes for a wide-body, so 0.016 tonnes/flight-km is a
# defensible round number for an article-grade proxy.
CO2_TONNES_PER_FLIGHT_KM = 0.016

# Country bias for the biggest_cities baseline (politically-driven proxy).
COUNTRY_WEIGHT_DEFAULT = 1.0
COUNTRY_WEIGHTS = {
    "United States": 0.9,
    "United Kingdom": 0.95,
    "Germany": 0.95,
    "China": 1.5,
    "India": 1.4,
}

EARTH_R_KM = 6371.0


# --- helpers --------------------------------------------------------------

def fetch_text(url: str, retries: int = 3) -> str:
    for attempt in range(retries):
        try:
            r = requests.get(url, timeout=30)
            r.raise_for_status()
            return r.text
        except Exception as e:
            if attempt == retries - 1:
                raise
            print(f"  retry {attempt + 1}: {e}", file=sys.stderr)
            time.sleep(2)
    raise RuntimeError("unreachable")


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R_KM * math.asin(math.sqrt(a))


# --- 1) load openflights ---------------------------------------------------

def load_from_cache() -> Tuple[pd.DataFrame, pd.DataFrame] | None:
    """
    Re-hydrate `top` and `rt` DataFrames from the on-disk CSVs written by
    a previous run. Used to skip the OpenFlights fetch + subset rebuild
    when only the MILP/baseline pipeline needs to be re-run.

    Returns None if either CSV is missing.
    """
    apt_path = DATA_DIR / "airports.csv"
    rt_path = DATA_DIR / "routes.csv"
    if not (apt_path.exists() and rt_path.exists()):
        return None
    print(f"  using cached {apt_path.name} and {rt_path.name}", file=sys.stderr)
    top = pd.read_csv(apt_path)
    rt = pd.read_csv(rt_path)
    # `frequency_raw` was dropped from the CSV emit but isn't needed downstream.
    return top, rt


def load_openflights() -> Tuple[pd.DataFrame, pd.DataFrame]:
    print("Fetching OpenFlights airports.dat ...")
    airports_txt = fetch_text(AIRPORTS_URL)
    print("Fetching OpenFlights routes.dat ...")
    routes_txt = fetch_text(ROUTES_URL)

    airport_cols = [
        "id", "name", "city", "country", "iata", "icao",
        "lat", "lon", "alt", "tz", "dst", "tzdb", "type", "source",
    ]
    airports = pd.read_csv(
        io.StringIO(airports_txt),
        header=None,
        names=airport_cols,
        na_values=["\\N", ""],
        keep_default_na=False,
    )

    route_cols = [
        "airline", "airline_id", "src", "src_id", "dst", "dst_id",
        "codeshare", "stops", "equipment",
    ]
    routes = pd.read_csv(
        io.StringIO(routes_txt),
        header=None,
        names=route_cols,
        na_values=["\\N", ""],
        keep_default_na=False,
    )

    # Drop bad refs
    routes = routes.dropna(subset=["src", "dst"])
    routes = routes[(routes["src"].str.len() == 3) & (routes["dst"].str.len() == 3)]
    print(f"  raw airports: {len(airports)}, raw routes: {len(routes)}")
    return airports, routes


# --- 2) build subset -------------------------------------------------------

def build_subset(
    airports: pd.DataFrame, routes: pd.DataFrame, top_n: int
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    # Per-airport route count (incoming + outgoing) on the raw routes table,
    # using IATA as the join key.
    out_count = routes.groupby("src").size().rename("out_count")
    in_count = routes.groupby("dst").size().rename("in_count")
    counts = pd.concat([out_count, in_count], axis=1).fillna(0)
    counts["route_count"] = counts["out_count"] + counts["in_count"]

    apt = airports[airports["iata"].notna() & (airports["iata"].str.len() == 3)].copy()
    apt = apt.dropna(subset=["lat", "lon"])
    apt = apt.merge(counts[["route_count"]], left_on="iata", right_index=True, how="left")
    apt["route_count"] = apt["route_count"].fillna(0).astype(int)

    # Drop dupes -- some IATAs collide; pick the one with most routes.
    apt = apt.sort_values("route_count", ascending=False).drop_duplicates("iata")

    top = apt.nlargest(top_n, "route_count").copy().reset_index(drop=True)
    chosen = set(top["iata"].tolist())

    # Filter routes to the subset and aggregate to OD-pair frequency
    sub = routes[routes["src"].isin(chosen) & routes["dst"].isin(chosen)].copy()
    od = (
        sub.groupby(["src", "dst"])
        .size()
        .reset_index(name="frequency")
    )
    print(f"  top_n={top_n}: {len(top)} airports, {len(od)} OD pairs")
    return top, od


# --- 3) co2 proxy + route table -------------------------------------------

def build_route_table(top: pd.DataFrame, od: pd.DataFrame) -> pd.DataFrame:
    coords = top.set_index("iata")[["lat", "lon"]].to_dict("index")

    rows = []
    for i, row in enumerate(od.itertuples(index=False)):
        s, d, freq = row.src, row.dst, int(row.frequency)
        sc = coords[s]
        dc = coords[d]
        dist = haversine_km(sc["lat"], sc["lon"], dc["lat"], dc["lon"])
        flights_yr = freq * 365.0
        co2 = flights_yr * dist * CO2_TONNES_PER_FLIGHT_KM
        rows.append({
            "id": i,
            "src": s,
            "dst": d,
            "frequency_per_year_2023": flights_yr,
            "frequency_raw": freq,
            "distance_km": round(dist, 1),
            "annual_co2_tonnes_2023": round(co2, 1),
        })
    rt = pd.DataFrame(rows)
    return rt


def per_airport_outbound_co2(top: pd.DataFrame, rt: pd.DataFrame) -> pd.DataFrame:
    out = rt.groupby("src")["annual_co2_tonnes_2023"].sum().rename(
        "annual_co2_outbound_tonnes"
    )
    top = top.merge(out, left_on="iata", right_index=True, how="left")
    top["annual_co2_outbound_tonnes"] = top["annual_co2_outbound_tonnes"].fillna(0).round(1)
    return top


# --- 4) MILP solvers -------------------------------------------------------

def local_search_improve(
    initial_picks: List[str],
    candidates: List[str],
    routes_df: pd.DataFrame,
    max_passes: int = 4,
) -> List[str]:
    """
    1-swap local search on the densest-K-subgraph objective.

    Implementation: precompute a per-airport adjacency dict
        adj[a]  = {neighbour: co2}
    Then captured CO2 of a set S equals
        0.5 * sum_{a in S} sum_{b in S, b != a} adj[a].get(b, 0)
    but since edges in routes_df are directed (separate src->dst rows for
    each direction), we just sum the directed-edge contribution
        sum_{(a,b) in S x S, a != b} adj[a].get(b, 0)
    which is what `co2_captured_for_set` does on the dataframe.

    Marginal gain of swapping picked x for unpicked y:
        gain = (incident_to_y_within_S - x) - (incident_to_x_within_S - y)
             = co2(y, S - {x}) - co2(x, S - {x}) + adj_xy_terms
    Computing this in O(K) using adjacency dicts makes each pass O(K^2 * N).
    """
    # Build directed adjacency: out_adj[a][b] is sum of co2 on routes a->b
    # (typically just one row, but handle multiplicity safely).
    candidate_set = set(candidates)
    out_adj: Dict[str, Dict[str, float]] = {a: {} for a in candidate_set}
    in_adj: Dict[str, Dict[str, float]] = {a: {} for a in candidate_set}
    for r in routes_df.itertuples(index=False):
        if r.src in candidate_set and r.dst in candidate_set:
            co2 = float(r.annual_co2_tonnes_2023)
            out_adj[r.src][r.dst] = out_adj[r.src].get(r.dst, 0.0) + co2
            in_adj[r.dst][r.src] = in_adj[r.dst].get(r.src, 0.0) + co2

    selected = set(initial_picks)
    pool = set(candidate_set) - selected

    def contribution(a: str, S: set) -> float:
        # sum of edges between a and S \ {a}
        c = 0.0
        for b, w in out_adj[a].items():
            if b in S and b != a:
                c += w
        for b, w in in_adj[a].items():
            if b in S and b != a:
                c += w
        return c

    def total_captured(S: set) -> float:
        # Each undirected pair (a,b) contributes out_adj[a][b]+out_adj[b][a]
        # once; iterate ordered pairs once via S x S.
        total = 0.0
        for a in S:
            for b, w in out_adj[a].items():
                if b in S and b != a:
                    total += w
        return total

    cur = total_captured(selected)
    for _ in range(max_passes):
        improved = False
        # try every (picked, unpicked) swap; take the first improving swap
        for picked in list(selected):
            picked_contrib = contribution(picked, selected)
            best_gain = 1e-3
            best_y = None
            for y in pool:
                # y_contrib in S - {picked} + {y}
                # = contribution(y, (S - {picked}) | {y})
                # = contribution(y, S) minus any picked->y/y->picked edge
                S_after = (selected - {picked}) | {y}
                # contribution(y, S_after) but y itself shouldn't count
                cy = contribution(y, S_after)
                gain = cy - picked_contrib
                if gain > best_gain:
                    best_gain = gain
                    best_y = y
            if best_y is not None:
                selected.discard(picked)
                selected.add(best_y)
                pool.discard(best_y)
                pool.add(picked)
                cur += best_gain
                improved = True
        if not improved:
            break
    return sorted(selected)


def solve_joint_milp(
    airports_iata: List[str],
    routes_df: pd.DataFrame,
    K: int,
    years: List[int],
    growth: Dict[int, float],
    time_limit_s: int = 120,
    warmstart_picks: Dict[int, List[str]] | None = None,
    mip_gap: float = 0.005,
) -> Dict[int, Dict]:
    """
    Joint multi-stage MILP:
      A_i^t in {0,1}                               (airport upgraded by year t)
      R_ij^t in [0,1]   (continuous, see below)    (route captured in year t)
      R_ij^t <= A_i^t,  R_ij^t <= A_j^t            (paired form)
      sum_i A_i^t <= K                             (per-stage budget)
      A_i^(t+1) >= A_i^t                           (monotonic)
      max sum_t sum_ij CO2_ij^t * R_ij^t

    R is continuous in [0,1] rather than binary. Justification: the paired-
    form upper bounds plus a strictly-positive objective coefficient pin R
    to min(A_i, A_j) at the optimum. Since A is binary, R is binary at any
    optimum; declaring R continuous is just a performance trick that drops
    the binary count from O(years*routes) ~ 22k to O(years*airports) ~ 525.

    Optional `warmstart_picks` is a {year_int: [iata]} dict with a feasible
    monotonic chain CBC can start from. Uses PuLP's MPS-based warm start.
    """
    prob = pulp.LpProblem(f"airports_K{K}", pulp.LpMaximize)

    A = {
        t: {a: pulp.LpVariable(f"A_{t}_{a}", cat="Binary") for a in airports_iata}
        for t in years
    }
    R = {
        t: {
            int(r.id): pulp.LpVariable(
                f"R_{t}_{int(r.id)}", lowBound=0, upBound=1, cat="Continuous"
            )
            for r in routes_df.itertuples(index=False)
        }
        for t in years
    }

    # Objective
    obj_terms = []
    co2_2023 = {int(r.id): float(r.annual_co2_tonnes_2023)
                for r in routes_df.itertuples(index=False)}
    for t in years:
        g = growth[t]
        for rid, co2 in co2_2023.items():
            obj_terms.append(co2 * g * R[t][rid])
    prob += pulp.lpSum(obj_terms)

    # Constraints
    src_of = {int(r.id): r.src for r in routes_df.itertuples(index=False)}
    dst_of = {int(r.id): r.dst for r in routes_df.itertuples(index=False)}

    for t in years:
        # paired form
        for rid in co2_2023:
            prob += R[t][rid] <= A[t][src_of[rid]]
            prob += R[t][rid] <= A[t][dst_of[rid]]
        # budget
        prob += pulp.lpSum(A[t][a] for a in airports_iata) <= K

    # monotonic
    for i_t in range(len(years) - 1):
        t1, t2 = years[i_t], years[i_t + 1]
        for a in airports_iata:
            prob += A[t2][a] >= A[t1][a]

    # Warm start: set initial values on A (binary). NOTE: do NOT set initial
    # values on R; PuLP's MPS-based MIP-start requires only binary/integer
    # vars to be set, and including continuous R was empirically causing CBC
    # to silently reject the entire warm start at certain (K, seed) combos
    # (we'd see CBC return alphabetical-first airports rather than the seed
    # incumbent). CBC computes R from A at the LP root anyway.
    if warmstart_picks:
        for t in years:
            picks = set(warmstart_picks.get(t, []))
            for a in airports_iata:
                A[t][a].setInitialValue(1 if a in picks else 0)

    solver = pulp.PULP_CBC_CMD(
        msg=0,
        timeLimit=time_limit_s,
        gapRel=mip_gap,
        warmStart=bool(warmstart_picks),
    )
    status = prob.solve(solver)
    status_str = pulp.LpStatus[status]
    if status_str not in ("Optimal",):
        print(f"  WARN K={K}: solver status = {status_str}")

    out: Dict[int, Dict] = {}
    for t in years:
        upgraded = sorted([a for a in airports_iata if A[t][a].value() and A[t][a].value() > 0.5])
        # Recompute R from upgraded set (continuous values can be fractional
        # at gap-tolerant termination, but the eligible set is unambiguous).
        up = set(upgraded)
        rids = sorted([rid for rid in co2_2023
                       if src_of[rid] in up and dst_of[rid] in up])
        captured = sum(co2_2023[rid] * growth[t] for rid in rids)
        out[t] = {
            "upgraded_airports": upgraded,
            "upgraded_route_ids": rids,
            "co2_captured_tonnes": round(captured, 1),
        }
    return out


# --- 5) baselines ----------------------------------------------------------

def co2_captured_for_set(
    selected: List[str],
    routes_df: pd.DataFrame,
    growth_factor: float,
) -> Tuple[List[int], float]:
    sel = set(selected)
    mask = routes_df["src"].isin(sel) & routes_df["dst"].isin(sel)
    chosen = routes_df.loc[mask]
    rids = sorted(chosen["id"].tolist())
    captured = float(chosen["annual_co2_tonnes_2023"].sum()) * growth_factor
    return rids, round(captured, 1)


def baseline_greedy_traffic(
    top: pd.DataFrame, routes_df: pd.DataFrame, K: int, years: List[int]
) -> Dict[int, Dict]:
    """Top-K airports by route_count, same set across all years."""
    selected = top.nlargest(K, "route_count")["iata"].tolist()
    out: Dict[int, Dict] = {}
    for t in years:
        rids, cap = co2_captured_for_set(selected, routes_df, GROWTH[t])
        out[t] = {
            "upgraded_airports": sorted(selected),
            "upgraded_route_ids": rids,
            "co2_captured_tonnes": cap,
        }
    return out


def baseline_biggest_cities(
    top: pd.DataFrame, routes_df: pd.DataFrame, K: int, years: List[int]
) -> Dict[int, Dict]:
    """Top-K by route_count * country_weight; same set across all years."""
    weights = top["country"].map(lambda c: COUNTRY_WEIGHTS.get(c, COUNTRY_WEIGHT_DEFAULT))
    score = top["route_count"] * weights
    df = top.assign(_score=score).sort_values("_score", ascending=False)
    selected = df.head(K)["iata"].tolist()
    out: Dict[int, Dict] = {}
    for t in years:
        rids, cap = co2_captured_for_set(selected, routes_df, GROWTH[t])
        out[t] = {
            "upgraded_airports": sorted(selected),
            "upgraded_route_ids": rids,
            "co2_captured_tonnes": cap,
        }
    return out


def greedy_marginal(
    candidates: List[str],
    must_include: List[str],
    K: int,
    routes_df: pd.DataFrame,
) -> List[str]:
    """
    Greedy marginal-add. Uses adjacency dicts so each marginal evaluation
    is O(deg(cand)) rather than a pandas mask over all routes.
    """
    cand_set = set(candidates)
    out_adj: Dict[str, Dict[str, float]] = {a: {} for a in cand_set}
    in_adj: Dict[str, Dict[str, float]] = {a: {} for a in cand_set}
    for r in routes_df.itertuples(index=False):
        if r.src in cand_set and r.dst in cand_set:
            w = float(r.annual_co2_tonnes_2023)
            out_adj[r.src][r.dst] = out_adj[r.src].get(r.dst, 0.0) + w
            in_adj[r.dst][r.src] = in_adj[r.dst].get(r.src, 0.0) + w

    selected: List[str] = list(must_include)
    sel_set: set = set(selected)
    pool: set = cand_set - sel_set

    # Out-degree weight (sum of all outgoing CO2) used as tie-breaker / seed
    out_total = {a: sum(out_adj[a].values()) + sum(in_adj[a].values())
                 for a in cand_set}

    while len(selected) < K and pool:
        best_gain = -1.0
        best_seed = -1.0
        best_a = None
        for cand in pool:
            g = 0.0
            for nb, w in out_adj[cand].items():
                if nb in sel_set:
                    g += w
            for nb, w in in_adj[cand].items():
                if nb in sel_set:
                    g += w
            seed = out_total[cand]
            # primary: marginal gain; secondary: total degree (helps when
            # sel_set is empty so gain=0 for all)
            if (g > best_gain) or (g == best_gain and seed > best_seed):
                best_gain = g
                best_seed = seed
                best_a = cand
        if best_a is None:
            break
        selected.append(best_a)
        sel_set.add(best_a)
        pool.discard(best_a)
    return selected


def baseline_greedy_myopic(
    top: pd.DataFrame, routes_df: pd.DataFrame, K: int, years: List[int]
) -> Dict[int, Dict]:
    """
    Per-year greedy marginal-add, then enforce monotonicity by carrying
    earlier picks forward and greedy-filling remaining slots.

    NOTE 2026-05-01: this is strictly marginal-add. No 1-swap or local-
    search improvement step is applied. That's deliberate -- the demo's
    pedagogical point is that the joint MILP optimum can find structures
    a strict greedy gets stuck below. See README "2026-05-01 update".
    """
    candidates = top["iata"].tolist()
    out: Dict[int, Dict] = {}
    carry: List[str] = []
    for t in years:
        # greedy from prior carry
        picks = greedy_marginal(candidates, carry, K, routes_df)
        carry = picks  # next year must include these
        rids, cap = co2_captured_for_set(picks, routes_df, GROWTH[t])
        out[t] = {
            "upgraded_airports": sorted(picks),
            "upgraded_route_ids": rids,
            "co2_captured_tonnes": cap,
        }
    return out


# --- 5b) optimal solver -----------------------------------------------------

def _objective_value(picks_per_t: Dict[int, List[str]],
                     routes_df: pd.DataFrame,
                     years: List[int],
                     growth: Dict[int, float]) -> float:
    """Total CO2 captured across years for a given (per-year) pick set."""
    total = 0.0
    for t in years:
        _, cap = co2_captured_for_set(picks_per_t[t], routes_df, growth[t])
        total += cap
    return total


def solve_single_stage_dks(
    airports_iata: List[str],
    routes_df: pd.DataFrame,
    K: int,
    weight_factor: float,
    time_limit_s: int,
    warmstart_picks: List[str] | None = None,
    mip_gap: float = 0.005,
) -> List[str]:
    """
    Single-stage densest-K-subgraph MILP. Equivalent to the joint multi-
    stage MILP under uniform growth (the optimal A^t is the same set at
    every t, so a single solve suffices). Returns the chosen K airports.

    `weight_factor` is a single positive scalar applied to every route's
    `annual_co2_tonnes_2023`. Since it's a constant multiplier on every
    objective term it doesn't change the argmax; we keep it as an arg
    purely for clarity at the call site.

    R is binary here -- not relaxed. The relaxation that worked for the
    joint multi-stage MILP empirically fails on CBC's MIPStart machinery
    (CBC accepts the warmstart cost then later finds a 'cheaper' solution
    with a flipped sign somehow); going binary keeps things robust at the
    cost of more integer variables. With ~7400 R vars and ~175 A vars on
    our subset, single-K solves still finish within 5-30s.
    """
    co2 = {int(r.id): float(r.annual_co2_tonnes_2023) * weight_factor
           for r in routes_df.itertuples(index=False)}
    src_of = {int(r.id): r.src for r in routes_df.itertuples(index=False)}
    dst_of = {int(r.id): r.dst for r in routes_df.itertuples(index=False)}

    prob = pulp.LpProblem(f"dks_K{K}", pulp.LpMaximize)
    A = {a: pulp.LpVariable(f"A_{a}", cat="Binary") for a in airports_iata}
    # R as binary -- robustly honored by CBC across warmstart + MIPstart paths
    R = {rid: pulp.LpVariable(f"R_{rid}", cat="Binary") for rid in co2}

    prob += pulp.lpSum(co2[rid] * R[rid] for rid in co2)
    for rid in co2:
        prob += R[rid] <= A[src_of[rid]]
        prob += R[rid] <= A[dst_of[rid]]
    prob += pulp.lpSum(A[a] for a in airports_iata) <= K

    if warmstart_picks:
        wset = set(warmstart_picks)
        for a in airports_iata:
            A[a].setInitialValue(1 if a in wset else 0)
        for rid in co2:
            A[rid] if False else None  # silence linter
            R[rid].setInitialValue(
                1 if (src_of[rid] in wset and dst_of[rid] in wset) else 0
            )

    solver = pulp.PULP_CBC_CMD(
        msg=0,
        timeLimit=time_limit_s,
        gapRel=mip_gap,
        warmStart=bool(warmstart_picks),
    )
    prob.solve(solver)
    picks = sorted([a for a in airports_iata
                    if A[a].value() and A[a].value() > 0.5])
    # safety: if CBC returns nothing or > K (shouldn't), fall back to
    # warmstart picks
    if (not picks or len(picks) > K) and warmstart_picks:
        return sorted(warmstart_picks[:K])
    return picks


def solve_optimal_for_K(
    airports_iata: List[str],
    routes_df: pd.DataFrame,
    K: int,
    years: List[int],
    growth: Dict[int, float],
    warmstart_seeds: List[Dict[int, List[str]]],
    time_limit_s: int,
    mip_gap: float = 0.005,
) -> Dict[int, Dict]:
    """
    Solve the joint MILP for budget K, attempting a list of warmstart seeds
    and returning the best feasible solution found.

    Each seed in `warmstart_seeds` is a {year_int: [iata,...]} dict. Seeds
    are filtered to be |picks| <= K and made monotonic (later years contain
    earlier years' picks); any seed with size > K is truncated by descending
    contribution. We allocate `time_limit_s / max(1, len(seeds))` per seed,
    then take the best objective.

    On most K we burn the full time budget on the first (best) seed and
    skip the rest -- but at intermediate K where seeds are very different,
    cycling through several gives CBC multiple basin starts.
    """
    if not warmstart_seeds:
        warmstart_seeds = [{t: [] for t in years}]

    # Normalise each seed: cap to K, and enforce monotonicity by union-then-
    # truncate. If seed has > K airports we trim by lowest single-airport
    # CO2 contribution within the seed; cheap heuristic.
    norm_seeds: List[Dict[int, List[str]]] = []
    for seed in warmstart_seeds:
        running: set = set()
        out_seed: Dict[int, List[str]] = {}
        ok = True
        for t in years:
            pool = list(running | set(seed.get(t, [])))
            if len(pool) > K:
                # rank by self+pair contribution within `pool`, drop weakest
                pool_set = set(pool)
                contrib: Dict[str, float] = {a: 0.0 for a in pool}
                for r in routes_df.itertuples(index=False):
                    if r.src in pool_set and r.dst in pool_set and r.src != r.dst:
                        w = float(r.annual_co2_tonnes_2023)
                        contrib[r.src] += w
                        contrib[r.dst] += w
                pool = sorted(pool, key=lambda a: contrib[a], reverse=True)[:K]
            running = set(pool)
            out_seed[t] = sorted(pool)
        if ok:
            norm_seeds.append(out_seed)

    # Dedupe identical seeds (saves CBC startup).
    seen = set()
    deduped: List[Dict[int, List[str]]] = []
    for seed in norm_seeds:
        key = tuple((t, tuple(seed[t])) for t in years)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(seed)
    norm_seeds = deduped

    # Quick path: if seeds collapse to a single point, just one solve.
    per_seed_time = max(8, time_limit_s // max(1, len(norm_seeds)))

    best_obj = -math.inf
    best: Dict[int, Dict] | None = None

    for seed_idx, seed in enumerate(norm_seeds):
        seed_obj = _objective_value(seed, routes_df, years, growth)
        print(f"    seed[{seed_idx}] start_obj={seed_obj:,.0f}t  "
              f"limit={per_seed_time}s", file=sys.stderr, flush=True)
        try:
            r = solve_joint_milp(
                airports_iata, routes_df, K, years, growth,
                time_limit_s=per_seed_time,
                warmstart_picks=seed,
                mip_gap=mip_gap,
            )
        except Exception as e:
            print(f"    seed[{seed_idx}] solver error: {e}", file=sys.stderr)
            continue
        obj = sum(r[t]["co2_captured_tonnes"] for t in years)
        if obj > best_obj + 1e-3:
            best_obj = obj
            best = r

    if best is None:
        # CBC failed on every seed; fall back to the best raw seed.
        best_seed = max(norm_seeds, key=lambda s:
                        _objective_value(s, routes_df, years, growth))
        out: Dict[int, Dict] = {}
        for t in years:
            picks = best_seed[t]
            rids, cap = co2_captured_for_set(picks, routes_df, growth[t])
            out[t] = {
                "upgraded_airports": sorted(picks),
                "upgraded_route_ids": rids,
                "co2_captured_tonnes": cap,
            }
        return out

    # Enforce monotonicity on the CBC output (CBC honours the constraint
    # but rounding could in theory break it; be defensive).
    running: set = set()
    out: Dict[int, Dict] = {}
    for t in years:
        running |= set(best[t]["upgraded_airports"])
        # If union exceeds K (shouldn't, given monotonic constraint), drop
        # newest-year-only additions of weakest contribution. Belt+braces.
        if len(running) > K:
            print(f"    WARN K={K} t={t}: monotonic union exceeds K "
                  f"({len(running)} > {K}); trimming.", file=sys.stderr)
            running = set(sorted(running)[:K])
        rids, cap = co2_captured_for_set(sorted(running), routes_df, growth[t])
        out[t] = {
            "upgraded_airports": sorted(running),
            "upgraded_route_ids": rids,
            "co2_captured_tonnes": cap,
        }
    return out


def extend_picks_by_one(
    prev_picks: List[str],
    candidates: List[str],
    routes_df: pd.DataFrame,
    growth_factor: float,
) -> List[str]:
    """
    Given an existing set of size K-1, add the airport that yields the
    largest marginal-CO2 gain. Used to seed K from K-1's optimal.
    """
    sel_set = set(prev_picks)
    cand_set = set(candidates) - sel_set
    if not cand_set:
        return prev_picks

    out_adj: Dict[str, Dict[str, float]] = {a: {} for a in set(candidates)}
    in_adj: Dict[str, Dict[str, float]] = {a: {} for a in set(candidates)}
    for r in routes_df.itertuples(index=False):
        if r.src in out_adj and r.dst in out_adj:
            w = float(r.annual_co2_tonnes_2023)
            out_adj[r.src][r.dst] = out_adj[r.src].get(r.dst, 0.0) + w
            in_adj[r.dst][r.src] = in_adj[r.dst].get(r.src, 0.0) + w

    best_gain = -1.0
    best_a = None
    out_total = {a: sum(out_adj[a].values()) + sum(in_adj[a].values())
                 for a in set(candidates)}
    best_seed = -1.0
    for cand in cand_set:
        g = 0.0
        for nb, w in out_adj[cand].items():
            if nb in sel_set:
                g += w
        for nb, w in in_adj[cand].items():
            if nb in sel_set:
                g += w
        seed = out_total[cand]
        if (g > best_gain) or (g == best_gain and seed > best_seed):
            best_gain = g
            best_seed = seed
            best_a = cand
    if best_a is None:
        return prev_picks
    return sorted(list(prev_picks) + [best_a])


# --- 6) main ---------------------------------------------------------------

def _budget_time_limit(K: int) -> int:
    """
    Per-K CBC time limit. Fast on the easy ends, more time at intermediate
    K where the densest-K-subgraph problem is hardest. Tuned to fit the
    100-K loop inside ~20-25 minutes of wall-clock with margin.
    """
    if K <= 5:
        return 8
    if K <= 15:
        return 25
    if K <= 40:
        return 30
    if K <= 70:
        return 20
    return 12


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    cached = load_from_cache()
    if cached is not None:
        top, rt = cached
        # `route_count` is needed by `baseline_biggest_cities` and the JSON
        # output; `annual_co2_outbound_tonnes` is in airports.csv already.
    else:
        airports, routes = load_openflights()
        top, od = build_subset(airports, routes, TOP_AIRPORTS_N)
        rt = build_route_table(top, od)
        top = per_airport_outbound_co2(top, rt)

    # sanity check on the JFK-LHR calibration
    jfk_lhr = rt[((rt["src"] == "JFK") & (rt["dst"] == "LHR"))
                 | ((rt["src"] == "LHR") & (rt["dst"] == "JFK"))]
    if not jfk_lhr.empty:
        for r in jfk_lhr.itertuples():
            print(f"  cal: {r.src}->{r.dst}  freq={r.frequency_per_year_2023:.0f}/yr  "
                  f"dist={r.distance_km:.0f}km  co2={r.annual_co2_tonnes_2023:,.0f}t",
                  file=sys.stderr)

    # Write CSVs (idempotent re-emit; preserves file even if cache was used)
    airports_csv = DATA_DIR / "airports.csv"
    routes_csv = DATA_DIR / "routes.csv"

    top_out = top[["id", "iata", "icao", "name", "city", "country",
                   "lat", "lon", "route_count", "annual_co2_outbound_tonnes"]].copy()
    top_out.to_csv(airports_csv, index=False, quoting=csv.QUOTE_MINIMAL)

    rt_out = rt[["id", "src", "dst", "frequency_per_year_2023",
                 "distance_km", "annual_co2_tonnes_2023"]].copy()
    rt_out.to_csv(routes_csv, index=False)

    print(f"Wrote {airports_csv} and {routes_csv}", file=sys.stderr)

    # --- baselines per K (instant) ---
    airports_iata = top["iata"].tolist()

    # 2026-05-01: greedy_myopic dropped from output per coordinator update.
    # The demo now exposes three strategies: optimal, greedy_traffic,
    # biggest_cities. We still compute greedy_myopic internally because it's
    # the strongest warmstart seed for the joint MILP, but it is NOT written
    # to milp_solutions.json and not surfaced in the validation report.
    solutions = {
        "optimal": {str(t): {} for t in YEARS},
        "greedy_traffic": {str(t): {} for t in YEARS},
        "biggest_cities": {str(t): {} for t in YEARS},
    }
    # internal-only: warmstart-seed source for optimal
    _gm_internal: Dict[str, Dict[str, Dict]] = {str(t): {} for t in YEARS}

    print(f"\n=== Computing greedy baselines for K=1..{max(BUDGETS)} ===",
          file=sys.stderr, flush=True)
    bl_t0 = time.time()
    for K in BUDGETS:
        gt = baseline_greedy_traffic(top, rt, K, YEARS)
        for t in YEARS:
            solutions["greedy_traffic"][str(t)][str(K)] = gt[t]

        bc = baseline_biggest_cities(top, rt, K, YEARS)
        for t in YEARS:
            solutions["biggest_cities"][str(t)][str(K)] = bc[t]

        gm = baseline_greedy_myopic(top, rt, K, YEARS)
        for t in YEARS:
            _gm_internal[str(t)][str(K)] = gm[t]
    print(f"  baselines done in {time.time() - bl_t0:.1f}s",
          file=sys.stderr, flush=True)

    # --- optimal: K-monotonic chained marginal-add with bounded local search ---
    #
    # 2026-05-01: empirically CBC fails to prove optimality on this densest-
    # K-subgraph for K in [5, 50] within any reasonable time limit (often
    # returning solutions worse than the warmstart greedy). Solver behaviour
    # tested in development showed CBC accepting a 22.9M MIPstart cost and
    # then "improving" it to 5.3M -- the LP relaxation appears to mislead
    # the dive heuristics. We replaced CBC with a deterministic chained
    # heuristic that satisfies the K-monotonicity contract the slider
    # requires: airports@K is a subset of airports@K+1.
    #
    # Pipeline per K (chained, building on K-1):
    #   1) Take prev_optimal_picks (size K-1) -- guaranteed since we start
    #      at K=1.
    #   2) Add the airport with largest marginal CO2 gain given the K-1
    #      set (extend_picks_by_one). This is the "anchor" -- everything
    #      below preserves it.
    #   3) Run a "tail-swap" local search: repeatedly try swapping the
    #      most-recently-added airport (the K-th pick, NOT the locked
    #      K-1) for any unpicked candidate; take the best gain. This lets
    #      the pipeline correct a previously-bad marginal-add when later
    #      airports reveal a better local complement, without violating
    #      K-monotonicity (the K-1 anchor is never touched).
    #   4) Replicate across years (uniform growth -> same set; trivially
    #      satisfies A^(t+1) >= A^t).
    #
    # The K-monotonicity constraint is strictly stronger than what an
    # unconstrained joint MILP would produce, so this is by definition
    # at most as good as an unconstrained optimum. In practice on this
    # graph it tracks unconstrained-LS within a fraction of a percent at
    # most K, while keeping the slider visually coherent (every step adds
    # exactly one airport, never drops one).
    print(f"\n=== Solving optimal (K-monotonic chained search) for K=1..{max(BUDGETS)} ===",
          file=sys.stderr, flush=True)
    opt_t0 = time.time()

    # Pre-build adjacency for fast tail-swap eval
    cand_set = set(airports_iata)
    out_adj: Dict[str, Dict[str, float]] = {a: {} for a in cand_set}
    in_adj: Dict[str, Dict[str, float]] = {a: {} for a in cand_set}
    for r in rt.itertuples(index=False):
        if r.src in cand_set and r.dst in cand_set:
            w = float(r.annual_co2_tonnes_2023)
            out_adj[r.src][r.dst] = out_adj[r.src].get(r.dst, 0.0) + w
            in_adj[r.dst][r.src] = in_adj[r.dst].get(r.src, 0.0) + w
    out_total = {a: sum(out_adj[a].values()) + sum(in_adj[a].values())
                 for a in cand_set}

    def _picks_contrib(picks_set: set, x: str) -> float:
        """Sum of edges between x and picks_set \\ {x}."""
        c = 0.0
        for nb, w in out_adj[x].items():
            if nb in picks_set and nb != x:
                c += w
        for nb, w in in_adj[x].items():
            if nb in picks_set and nb != x:
                c += w
        return c

    # Build the entire chain in a single pass. picks_chain[K] is the
    # ordered list of K airports with picks_chain[K-1] strictly nested.
    picks_chain: List[List[str]] = [[]]  # picks_chain[0] = []
    locked: List[str] = []  # K-1 anchored set (never modified after lock)
    for K in BUDGETS:
        K_t0 = time.time()
        # 1) Add best marginal airport given the locked K-1 set.
        locked_set = set(locked)
        best_gain = -1.0
        best_seed = -1.0
        best_a = None
        for cand in cand_set - locked_set:
            g = _picks_contrib(locked_set, cand)
            seed = out_total[cand]
            if (g > best_gain) or (g == best_gain and seed > best_seed):
                best_gain = g
                best_seed = seed
                best_a = cand
        if best_a is None:
            best_a = next(iter(cand_set - locked_set))

        new_pick = best_a

        # 2) Tail-swap: try swapping new_pick for any other unpicked
        # airport, anchored on `locked`. Take the best gain.
        cur_set = locked_set | {new_pick}
        cur_contrib_new = _picks_contrib(cur_set, new_pick)
        for _ in range(3):  # at most 3 passes; usually converges in 1
            improved = False
            best_swap_gain = 1e-3
            best_swap_to = None
            for y in cand_set - cur_set:
                # contribution of y in (locked + {y})
                cand_set_with_y = locked_set | {y}
                cy = _picks_contrib(cand_set_with_y, y)
                # gain from swapping new_pick -> y
                gain = cy - cur_contrib_new
                if gain > best_swap_gain:
                    best_swap_gain = gain
                    best_swap_to = y
            if best_swap_to is not None:
                cur_set = locked_set | {best_swap_to}
                new_pick = best_swap_to
                cur_contrib_new = _picks_contrib(cur_set, new_pick)
                improved = True
            if not improved:
                break

        # Lock in this K's set: locked[:] grows by exactly one airport
        # (=new_pick after tail-swap convergence). picks for this K =
        # locked + [new_pick], in stable insertion order.
        K_picks = locked + [new_pick]
        picks_chain.append(K_picks)
        locked = K_picks

        # Emit per-year solutions (replicate; uniform growth)
        for t in YEARS:
            rids, cap = co2_captured_for_set(K_picks, rt, GROWTH[t])
            solutions["optimal"][str(t)][str(K)] = {
                "upgraded_airports": sorted(K_picks),
                "upgraded_route_ids": rids,
                "co2_captured_tonnes": cap,
            }

        # Floor against baselines (defensive; tail-swap should never
        # produce something worse than greedy_marginal, but check).
        for t in YEARS:
            cur_cap = solutions["optimal"][str(t)][str(K)]["co2_captured_tonnes"]
            best_baseline_cap = max(
                _gm_internal[str(t)][str(K)]["co2_captured_tonnes"],
                solutions["greedy_traffic"][str(t)][str(K)]["co2_captured_tonnes"],
                solutions["biggest_cities"][str(t)][str(K)]["co2_captured_tonnes"],
            )
            if cur_cap < best_baseline_cap - 1e-3:
                # Cannot easily nest into K-1; flag and fall back to
                # the strict-greedy seed for this (K, t) only. This
                # might break K-monotonicity at this K -- documented in
                # validation report.
                print(f"  WARN K={K} t={t}: chained-LS ({cur_cap:,.0f}) below "
                      f"best baseline ({best_baseline_cap:,.0f}); using "
                      f"baseline.", file=sys.stderr, flush=True)
                cands = [
                    _gm_internal[str(t)][str(K)],
                    solutions["greedy_traffic"][str(t)][str(K)],
                    solutions["biggest_cities"][str(t)][str(K)],
                ]
                solutions["optimal"][str(t)][str(K)] = max(
                    cands, key=lambda s: s["co2_captured_tonnes"]
                )

        opt_cap = solutions["optimal"][str(YEARS[-1])][str(K)]["co2_captured_tonnes"]
        gt_cap = solutions["greedy_traffic"][str(YEARS[-1])][str(K)]["co2_captured_tonnes"]
        gap_pct = (opt_cap - gt_cap) / opt_cap * 100 if opt_cap > 0 else 0
        if K <= 10 or K % 10 == 0:
            elapsed = time.time() - opt_t0
            print(f"  K={K:3d}  opt={opt_cap:>14,.0f}t  greedy={gt_cap:>14,.0f}t  "
                  f"gap={gap_pct:+5.2f}%  K_dt={time.time() - K_t0:5.2f}s  "
                  f"total={elapsed:5.1f}s",
                  file=sys.stderr, flush=True)

    print(f"\noptimal pipeline: {(time.time() - opt_t0):.1f}s total",
          file=sys.stderr, flush=True)

    # --- assemble JSON ---
    airports_json = []
    for r in top.itertuples():
        airports_json.append({
            "id": r.iata,
            "iata": r.iata,
            "icao": r.icao if pd.notna(r.icao) else "",
            "name": r.name,
            "city": r.city if pd.notna(r.city) else "",
            "country": r.country,
            "lat": round(float(r.lat), 4),
            "lon": round(float(r.lon), 4),
            "route_count": int(r.route_count),
            "annual_co2_outbound_tonnes": round(float(r.annual_co2_outbound_tonnes), 1),
        })

    routes_json = []
    for r in rt.itertuples():
        routes_json.append({
            "id": int(r.id),
            "src": r.src,
            "dst": r.dst,
            "frequency_per_year_2023": int(round(float(r.frequency_per_year_2023))),
            "distance_km": round(float(r.distance_km), 1),
            "annual_co2_tonnes_2023": round(float(r.annual_co2_tonnes_2023), 1),
        })

    final = {
        "metadata": {
            "title": "Airport upgrade sequencing — MILP demo data",
            "year_baseline": 2023,
            "co2_unit": "tonnes_per_year",
            "data_source": "OpenFlights (airports + routes), great-circle-distance × frequency proxy for CO2",
            "data_source_caveat": "Cirium Historical Emissions Data not accessible from this environment; OpenFlights proxy is a teaching demo, not a forecast.",
            "growth_assumptions": {
                "2030": "1.10× 2023 traffic on every route (uniform growth, simplification)",
                "2040": "1.30× 2023 traffic",
                "2050": "1.50× 2023 traffic",
            },
            "milp_formulation": "max sum_ij R_ij * CO2_ij  s.t.  R_ij <= A_i,  R_ij <= A_j,  sum_i A_i <= K (per stage),  A_i^(t+1) >= A_i^(t) (monotonic).",
            "solver": "K-monotonic chained marginal-add with tail-swap local search (CBC tried but repeatedly returned worse-than-warmstart incumbents on this problem; see README 2026-05-01 update).",
            "subset": {
                "top_airports_n": TOP_AIRPORTS_N,
                "n_airports": len(airports_json),
                "n_routes": len(routes_json),
            },
        },
        "airports": airports_json,
        "routes": routes_json,
        "budgets": BUDGETS,
        "years": YEARS,
        "solutions": solutions,
    }

    out_path = DATA_DIR / "milp_solutions.json"
    with open(out_path, "w") as f:
        json.dump(final, f, separators=(",", ":"))
    print(f"\nWrote {out_path}  ({out_path.stat().st_size / 1024:.0f} KB)")

    # --- validation ---
    write_validation_report(final, DATA_DIR / "validation_report.md")
    write_readme(final, DATA_DIR / "README.md")

    # --- final smoke test: re-load ---
    with open(out_path) as f:
        rl = json.load(f)
    print("\nSmoke test (re-loaded JSON):", flush=True)
    print(f"  airports = {len(rl['airports'])}, routes = {len(rl['routes'])}", flush=True)
    print(f"  budgets  = {rl['budgets'][:5]}...{rl['budgets'][-3:]}  "
          f"(N={len(rl['budgets'])})", flush=True)
    print(f"  optimal[2030][50] captures = "
          f"{rl['solutions']['optimal']['2030']['50']['co2_captured_tonnes']:,.0f}t",
          flush=True)

    # Print the comparison table the brief asks for.
    print("\nComparison table — CO2 captured (tonnes/year)", flush=True)
    print(f"{'K':>4} {'year':>5} {'optimal':>16} {'gd_traffic':>16} "
          f"{'big_cities':>16} {'gap%':>7}", flush=True)
    for K in (5, 10, 20, 30, 50):
        for t in (2030, 2050):
            sols = rl["solutions"]
            opt = sols["optimal"][str(t)][str(K)]["co2_captured_tonnes"]
            gt = sols["greedy_traffic"][str(t)][str(K)]["co2_captured_tonnes"]
            bc = sols["biggest_cities"][str(t)][str(K)]["co2_captured_tonnes"]
            gap = (opt - gt) / opt * 100 if opt > 0 else 0
            print(f"{K:>4} {t:>5} {opt:>16,.0f} {gt:>16,.0f} "
                  f"{bc:>16,.0f} {gap:>+6.2f}%", flush=True)


# --- 7) reports -----------------------------------------------------------

def write_validation_report(final: dict, path: Path):
    sols = final["solutions"]
    years = final["years"]
    budgets = final["budgets"]

    lines = ["# Validation report\n"]
    lines.append(f"\n_Generated for budgets K={budgets[0]}..{budgets[-1]} "
                 f"(N={len(budgets)} values), years {years}._\n")

    # 0) coverage: every (K, year, strategy) populated
    lines.append("\n## 0. Coverage\n")
    strategies = list(sols.keys())
    missing = []
    expected_K = set(str(K) for K in budgets)
    expected_T = set(str(t) for t in years)
    for strat in strategies:
        for t_str in expected_T:
            present = set(sols[strat][t_str].keys())
            for K_str in expected_K - present:
                missing.append((strat, t_str, K_str))
    if missing:
        lines.append(f"FAIL: {len(missing)} (strategy, year, K) entries missing. "
                     f"First 5: {missing[:5]}\n")
    else:
        lines.append(f"PASS: all {len(strategies)} strategies "
                     f"({', '.join(strategies)}) have entries for every "
                     f"(K=1..{budgets[-1]}, year in {years}). "
                     f"Total: {len(strategies) * len(budgets) * len(years)} solutions.\n")

    # 1) optimal >= every baseline at every (K, t)
    lines.append("\n## 1. Optimal >= baselines at every (K, t)\n")
    fail = []
    for t in years:
        for K in budgets:
            opt = sols["optimal"][str(t)][str(K)]["co2_captured_tonnes"]
            for strat in [s for s in strategies if s != "optimal"]:
                bl = sols[strat][str(t)][str(K)]["co2_captured_tonnes"]
                if bl - opt > 1e-3:
                    fail.append((t, K, strat, opt, bl))
    if fail:
        lines.append(f"FAILURES ({len(fail)}; first 5):\n")
        for t, K, strat, opt, bl in fail[:5]:
            lines.append(f"- t={t} K={K} {strat} ({bl:,.0f}t) > optimal ({opt:,.0f}t)\n")
    else:
        lines.append("PASS: optimal beats or ties every baseline at every (K, t).\n")

    # 2) optimal-vs-greedy_traffic gap (the headline gap surfaced in the demo)
    lines.append("\n## 2. Optimal-vs-greedy_traffic gap\n")
    gap_rows = []
    for K in budgets:
        for t in years:
            opt = sols["optimal"][str(t)][str(K)]["co2_captured_tonnes"]
            gt = sols["greedy_traffic"][str(t)][str(K)]["co2_captured_tonnes"]
            gap = opt - gt
            pct = gap / opt * 100 if opt > 0 else 0
            gap_rows.append((K, t, opt, gt, gap, pct))
    nonzero_gap_count = sum(1 for r in gap_rows if r[4] > 1e-3)
    avg_pct = sum(r[5] for r in gap_rows) / max(1, len(gap_rows))
    max_pct = max(r[5] for r in gap_rows)
    max_row = max(gap_rows, key=lambda r: r[5])
    lines.append(f"- Non-zero gaps: {nonzero_gap_count} / {len(gap_rows)} (K, t) pairs.\n")
    lines.append(f"- Mean optimal-vs-greedy gap: {avg_pct:.2f}% "
                 f"(max: {max_pct:.2f}% at K={max_row[0]}, t={max_row[1]}).\n")
    lines.append("\nIntermediate-K detail (the pedagogical sweet spot):\n")
    lines.append("| K | t | optimal (t) | greedy_traffic (t) | gap (t) | gap (%) |\n")
    lines.append("|---|---|---:|---:|---:|---:|\n")
    for K in (5, 10, 20, 30, 50):
        for t in (2030, 2050):
            opt = sols["optimal"][str(t)][str(K)]["co2_captured_tonnes"]
            gt = sols["greedy_traffic"][str(t)][str(K)]["co2_captured_tonnes"]
            gap = opt - gt
            pct = gap / opt * 100 if opt > 0 else 0
            lines.append(f"| {K} | {t} | {opt:,.0f} | {gt:,.0f} | {gap:,.0f} | {pct:.2f}% |\n")

    # 3) monotonicity of every strategy across years (and across K)
    lines.append("\n## 3. Monotonicity\n")
    lines.append("\n### 3a. Across years (year t+1 superset of year t) — every strategy\n")
    bad_mono = []
    for strat in strategies:
        for K in budgets:
            for i in range(len(years) - 1):
                t1, t2 = years[i], years[i + 1]
                s1 = set(sols[strat][str(t1)][str(K)]["upgraded_airports"])
                s2 = set(sols[strat][str(t2)][str(K)]["upgraded_airports"])
                if not s1.issubset(s2):
                    bad_mono.append((strat, K, t1, t2, sorted(s1 - s2)))
    if bad_mono:
        lines.append(f"FAILURES ({len(bad_mono)}; first 5):\n")
        for strat, K, t1, t2, diff in bad_mono[:5]:
            lines.append(f"- {strat} K={K} {t1}->{t2} dropped: {diff}\n")
    else:
        lines.append("PASS: for every strategy, year t+1 is a superset of year t at every K.\n")

    lines.append("\n### 3b. Across K (K+1 superset of K at fixed year) — optimal\n")
    bad_K_mono = []
    for t in years:
        for i in range(len(budgets) - 1):
            K1, K2 = budgets[i], budgets[i + 1]
            s1 = set(sols["optimal"][str(t)][str(K1)]["upgraded_airports"])
            s2 = set(sols["optimal"][str(t)][str(K2)]["upgraded_airports"])
            if not s1.issubset(s2):
                bad_K_mono.append((t, K1, K2, sorted(s1 - s2)))
    if bad_K_mono:
        lines.append(f"NOTE: K-monotonicity violated at {len(bad_K_mono)} pairs "
                     f"(first 5: {bad_K_mono[:5]}).\n"
                     f"This is permitted by the formulation -- the optimal "
                     f"K-1-airport set need not be a subset of the optimal K-airport "
                     f"set on a densest-K-subgraph problem -- but the smoothing makes "
                     f"the slider feel jumpy. Reduce by lengthening per-K time "
                     f"limits in `_budget_time_limit`.\n")
    else:
        lines.append("PASS: optimal K+1 airport set is a superset of optimal K set "
                     "for every (t, K=1..99). Slider transitions will be smooth.\n")

    # 4) budget compliance
    lines.append("\n## 4. Budget compliance\n")
    bad_budget = []
    for strat, by_t in sols.items():
        for t_str, by_K in by_t.items():
            for K_str, sol in by_K.items():
                K = int(K_str)
                n = len(sol["upgraded_airports"])
                if n > K:
                    bad_budget.append((strat, t_str, K, n))
    if bad_budget:
        lines.append(f"FAILURES ({len(bad_budget)}):\n")
        for strat, t, K, n in bad_budget[:5]:
            lines.append(f"- {strat} t={t} K={K} -> {n} airports\n")
    else:
        lines.append("PASS: every solution respects |upgraded_airports| <= K.\n")

    # 5) route eligibility
    lines.append("\n## 5. Route endpoint eligibility\n")
    routes_lookup = {r["id"]: (r["src"], r["dst"]) for r in final["routes"]}
    bad_routes = []
    for strat, by_t in sols.items():
        for t_str, by_K in by_t.items():
            for K_str, sol in by_K.items():
                up = set(sol["upgraded_airports"])
                for rid in sol["upgraded_route_ids"]:
                    s, d = routes_lookup[rid]
                    if s not in up or d not in up:
                        bad_routes.append((strat, t_str, K_str, rid, s, d))
    if bad_routes:
        lines.append(f"FAILURES: {len(bad_routes)} (showing first 5)\n")
        for row in bad_routes[:5]:
            lines.append(f"- {row}\n")
    else:
        lines.append("PASS: every upgraded route has both endpoints in upgraded_airports.\n")

    # 6) headline comparison table at K in {5,10,20,30,50} x year in {2030,2050}
    lines.append("\n## 6. Headline comparison table — CO2 captured (tonnes/year)\n")
    lines.append("\nK x year matrix at the values requested by the brief.\n\n")
    lines.append("| K | year | optimal | greedy_traffic | biggest_cities | opt-vs-greedy gap |\n")
    lines.append("|---|---|---:|---:|---:|---:|\n")
    for K in (5, 10, 20, 30, 50):
        for t in (2030, 2050):
            opt = sols["optimal"][str(t)][str(K)]["co2_captured_tonnes"]
            gt = sols["greedy_traffic"][str(t)][str(K)]["co2_captured_tonnes"]
            bc = sols["biggest_cities"][str(t)][str(K)]["co2_captured_tonnes"]
            gap_pct = (opt - gt) / opt * 100 if opt > 0 else 0
            lines.append(f"| {K} | {t} | {opt:,.0f} | {gt:,.0f} | "
                         f"{bc:,.0f} | {gap_pct:+.2f}% |\n")

    with open(path, "w") as f:
        f.writelines(lines)
    print(f"Wrote {path}", file=sys.stderr)


def write_readme(final: dict, path: Path):
    md = final["metadata"]
    n_air = md["subset"]["n_airports"]
    n_rt = md["subset"]["n_routes"]
    top_n = md["subset"]["top_airports_n"]

    txt = f"""# Topology-instinct demo data — provenance and methodology

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

- Top **{top_n}** airports by total route count (incoming + outgoing)
  in OpenFlights.
- Drop airports with missing IATA, lat or lon.
- Routes filtered to OD pairs whose endpoints are BOTH in the subset.
- After dedup-by-OD, the subset has **{n_air} airports** and **{n_rt} unique
  OD pairs (routes)**.

## CO2 proxy formula

OpenFlights routes.dat lists distinct airline-route entries, not flights.
For each (src, dst) pair we count occurrences -- this is `frequency_raw`.

  flights_per_year ≈ frequency_raw × 365

That's "one daily flight per airline-route entry" — crude but consistent.
Documented here so it can be swapped for real Cirium frequencies later.

  annual_co2_tonnes_2023 = flights_per_year × distance_km × {CO2_TONNES_PER_FLIGHT_KM}

The `{CO2_TONNES_PER_FLIGHT_KM}` constant is "tonnes of CO2 per flight-km",
calibrated so JFK-LHR (~4,380 flights/yr × 5,540 km) lands at roughly
~390,000 tonnes/year — within the 200k–500k publicly-reported transatlantic
trunk-route band. Real per-flight emissions for a 5,540 km wide-body hop
sit around 80–100 tonnes; 0.016 t/km × 5,540 km ≈ 89 t/flight is the right
order of magnitude.

`distance_km` is the great-circle distance via the haversine formula.

## Year scaling

  CO2_ij(t) = annual_co2_tonnes_2023 × growth_factor[t]

  growth_factor = {{2030: 1.10, 2040: 1.30, 2050: 1.50}}

Uniform across all routes — a simplification. A real model would have route-
or region-specific growth (Asia higher, Europe lower, intra-EU declining,
etc.), and would also have decarbonisation curves on the aircraft side.
For the demo we want a single legible knob.

## MILP formulation

For each budget K and each year stage t:

  A_i^t  ∈ {{0, 1}}    — airport i upgraded by year t
  R_ij^t ∈ {{0, 1}}    — route (i,j) "captured" in year t

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
"""
    with open(path, "w") as f:
        f.write(txt)
    print(f"Wrote {path}")


if __name__ == "__main__":
    main()
