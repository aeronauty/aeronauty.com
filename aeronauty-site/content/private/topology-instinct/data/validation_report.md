# Validation report

_Generated for budgets K=1..100 (N=100 values), years [2030, 2040, 2050]._

## 0. Coverage
PASS: all 3 strategies (optimal, greedy_traffic, biggest_cities) have entries for every (K=1..100, year in [2030, 2040, 2050]). Total: 900 solutions.

## 1. Optimal >= baselines at every (K, t)
PASS: optimal beats or ties every baseline at every (K, t).

## 2. Optimal-vs-greedy_traffic gap
- Non-zero gaps: 297 / 300 (K, t) pairs.
- Mean optimal-vs-greedy gap: 24.46% (max: 80.24% at K=2, t=2030).

Intermediate-K detail (the pedagogical sweet spot):
| K | t | optimal (t) | greedy_traffic (t) | gap (t) | gap (%) |
|---|---|---:|---:|---:|---:|
| 5 | 2030 | 6,465,652 | 4,318,878 | 2,146,774 | 33.20% |
| 5 | 2050 | 8,816,799 | 5,889,379 | 2,927,420 | 33.20% |
| 10 | 2030 | 21,345,667 | 15,551,624 | 5,794,043 | 27.14% |
| 10 | 2050 | 29,107,728 | 21,206,760 | 7,900,967 | 27.14% |
| 20 | 2030 | 55,202,619 | 41,083,003 | 14,119,616 | 25.58% |
| 20 | 2050 | 75,276,299 | 56,022,276 | 19,254,022 | 25.58% |
| 30 | 2030 | 93,551,999 | 64,582,930 | 28,969,069 | 30.97% |
| 30 | 2050 | 127,570,908 | 88,067,632 | 39,503,275 | 30.97% |
| 50 | 2030 | 163,964,213 | 123,632,859 | 40,331,354 | 24.60% |
| 50 | 2050 | 223,587,563 | 168,590,262 | 54,997,301 | 24.60% |

## 3. Monotonicity

### 3a. Across years (year t+1 superset of year t) — every strategy
PASS: for every strategy, year t+1 is a superset of year t at every K.

### 3b. Across K (K+1 superset of K at fixed year) — optimal
PASS: optimal K+1 airport set is a superset of optimal K set for every (t, K=1..99). Slider transitions will be smooth.

## 4. Budget compliance
PASS: every solution respects |upgraded_airports| <= K.

## 5. Route endpoint eligibility
PASS: every upgraded route has both endpoints in upgraded_airports.

## 6. Headline comparison table — CO2 captured (tonnes/year)

K x year matrix at the values requested by the brief.

| K | year | optimal | greedy_traffic | biggest_cities | opt-vs-greedy gap |
|---|---|---:|---:|---:|---:|
| 5 | 2030 | 6,465,652 | 4,318,878 | 1,657,770 | +33.20% |
| 5 | 2050 | 8,816,799 | 5,889,379 | 2,260,595 | +33.20% |
| 10 | 2030 | 21,345,667 | 15,551,624 | 10,045,319 | +27.14% |
| 10 | 2050 | 29,107,728 | 21,206,760 | 13,698,162 | +27.14% |
| 20 | 2030 | 55,202,619 | 41,083,003 | 31,332,488 | +25.58% |
| 20 | 2050 | 75,276,299 | 56,022,276 | 42,726,120 | +25.58% |
| 30 | 2030 | 93,551,999 | 64,582,930 | 52,654,874 | +30.97% |
| 30 | 2050 | 127,570,908 | 88,067,632 | 71,802,100 | +30.97% |
| 50 | 2030 | 163,964,213 | 123,632,859 | 100,799,993 | +24.60% |
| 50 | 2050 | 223,587,563 | 168,590,262 | 137,454,536 | +24.60% |
