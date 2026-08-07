"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarRange,
  Camera,
  FilterX,
  Lightbulb,
  Medal,
  Sigma,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildHistoryGameSummaries,
  calculateHistoryAnalytics,
  filterHistoryGames,
  historyMetricRollupLabel,
  historyMetricOptions,
  historyRulesetOptions,
  type HistoryFilter,
  type HistoryMetricOption,
} from "@/lib/tiletally/historyAnalytics";
import type {
  LedgerEntity,
  LedgerEvent,
  LedgerGame,
  LedgerActiveMediaCount,
  LedgerMedia,
  LedgerParticipant,
} from "./gameLedgerTypes";
import styles from "./game-ledger-insights.module.css";

type RangeChoice = "all" | "year" | "30-days" | "latest" | "last-5" | "last-10" | "custom";

const RANGE_CHOICES: Array<{ id: RangeChoice; label: string }> = [
  { id: "all", label: "All time" },
  { id: "year", label: "This year" },
  { id: "30-days", label: "Last 30 days" },
  { id: "latest", label: "Latest game" },
  { id: "last-5", label: "Last 5" },
  { id: "last-10", label: "Last 10" },
  { id: "custom", label: "Custom dates" },
];

const CHART_COLORS = ["#315ee8", "#23a6a0", "#e65f55", "#8f58d9", "#c17916", "#2f7d43", "#c34482", "#607087"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function yearStartIso() {
  return `${new Date().getUTCFullYear()}-01-01`;
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function readablePreset(value: string | null) {
  if (!value) return "Custom rules";
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatNumber(value: number, metric?: HistoryMetricOption | null) {
  const maximumFractionDigits = metric?.valueType === "integer" ? 0 : 2;
  const number = new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);
  return metric?.unit ? `${number} ${metric.unit}` : number;
}

function formatDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "2-digit" }).format(timestamp);
}

function metricLabel(metric: HistoryMetricOption | null | undefined) {
  return metric ? historyMetricRollupLabel(metric) : "Cumulative score";
}

function metricOptionLabel(metric: HistoryMetricOption) {
  const rollup = metric.historyRollup === "sum" ? "" : ` · ${historyMetricRollupLabel(metric)}`;
  if (!metric.target) return `${metric.label}${metric.unit ? ` (${metric.unit})` : ""}${rollup}`;
  const operator = metric.target.operator === ">=" ? "to" : metric.target.operator === "<=" ? "down to" : "at";
  return `${metric.label} · ${operator} ${formatNumber(metric.target.value, metric)}${rollup}`;
}

type Props = {
  entities: LedgerEntity[];
  games: LedgerGame[];
  participants: LedgerParticipant[];
  events: LedgerEvent[];
  media: LedgerMedia[];
  activeMediaCounts: LedgerActiveMediaCount[];
};

export default function GameLedgerInsightsView({ entities, games, participants, events, media, activeMediaCounts }: Props) {
  const [range, setRange] = useState<RangeChoice>("all");
  const [includeOpen, setIncludeOpen] = useState(false);
  const [rulesetKey, setRulesetKey] = useState("all");
  const [location, setLocation] = useState("all");
  const [entityIds, setEntityIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [metricKey, setMetricKey] = useState<string | null>(null);

  const summaries = useMemo(
    () => buildHistoryGameSummaries({ games, participants, events, media, activeMediaCounts }),
    [activeMediaCounts, events, games, media, participants],
  );
  const rulesets = useMemo(() => historyRulesetOptions(summaries), [summaries]);
  const locations = useMemo(() => {
    const values = new Map<string, string>();
    for (const game of summaries) {
      if (game.normalizedLocation && game.location && !values.has(game.normalizedLocation)) {
        values.set(game.normalizedLocation, game.location);
      }
    }
    return Array.from(values).sort((left, right) => left[1].localeCompare(right[1]));
  }, [summaries]);
  const referencedEntityIds = useMemo(
    () => new Set(summaries.flatMap((game) => game.participantEntityIds)),
    [summaries],
  );
  const historyEntities = useMemo(
    () => entities.filter((entity) => referencedEntityIds.has(entity.id)).sort((left, right) => left.name.localeCompare(right.name)),
    [entities, referencedEntityIds],
  );

  const filter = useMemo((): HistoryFilter => {
    const next: HistoryFilter = {
      status: includeOpen ? "all" : "completed",
      entityIds,
      ...(rulesetKey !== "all" ? { rulesetKeys: [rulesetKey] } : {}),
      ...(location !== "all" ? { location } : {}),
    };
    if (range === "year") {
      next.dateFrom = yearStartIso();
      next.dateTo = todayIso();
    } else if (range === "30-days") {
      next.dateFrom = daysAgoIso(29);
      next.dateTo = todayIso();
    } else if (range === "latest") {
      next.recent = 1;
    } else if (range === "last-5") {
      next.recent = 5;
    } else if (range === "last-10") {
      next.recent = 10;
    } else if (range === "custom") {
      next.dateFrom = dateFrom || null;
      next.dateTo = dateTo || null;
    }
    return next;
  }, [dateFrom, dateTo, entityIds, includeOpen, location, range, rulesetKey]);

  const filteredGames = useMemo(() => filterHistoryGames(summaries, filter), [filter, summaries]);
  const metrics = useMemo(() => historyMetricOptions(filteredGames), [filteredGames]);
  const selectedMetric = metrics.find((metric) => metric.key === metricKey) ?? metrics[0] ?? null;
  const currentEntityLabels = useMemo(
    () => new Map(entities.map((entity) => [entity.id, entity.name] as const)),
    [entities],
  );
  const analytics = useMemo(
    () => calculateHistoryAnalytics(filteredGames, selectedMetric?.key, { entityLabels: currentEntityLabels }),
    [currentEntityLabels, filteredGames, selectedMetric?.key],
  );
  const identityByKey = useMemo(
    () => new Map(analytics.identities.map((identity) => [identity.identityKey, identity])),
    [analytics.identities],
  );
  const chartIdentities = analytics.identities.filter((identity) => identity.metric);
  const decisionCount = filteredGames.filter((game) => game.result && !game.result.malformed && game.result.decision !== "none").length;
  const chartData = analytics.timeSeries.map((point, index) => ({
    index: index + 1,
    label: formatDate(point.at),
    title: point.gameTitle,
    cumulativeGameValue: point.cumulativeGameValue,
    ...point.cumulative,
  }));

  const hasFilters = range !== "all" || includeOpen || rulesetKey !== "all" || location !== "all" || entityIds.length > 0;
  const resetFilters = () => {
    setRange("all");
    setIncludeOpen(false);
    setRulesetKey("all");
    setLocation("all");
    setEntityIds([]);
    setDateFrom("");
    setDateTo("");
  };
  const toggleEntity = (entityId: string) => {
    setEntityIds((current) => current.includes(entityId)
      ? current.filter((candidate) => candidate !== entityId)
      : [...current, entityId]);
  };

  return (
    <section className={styles.insights} aria-labelledby="history-heading">
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>Your long game</p>
          <h1 id="history-heading">History &amp; stats</h1>
          <p>Every finished score joins a cumulative record. Narrow it to a season, matchup, place or ruleset without changing the original games.</p>
        </div>
        <div className={styles.trustNote}>
          <Sigma size={20} aria-hidden="true" />
          <span><strong>Worked out from your ledger</strong>Totals and facts are deterministic—no AI guesses.</span>
        </div>
      </header>

      <section className={styles.filterPanel} aria-labelledby="subhistory-heading">
        <div className={styles.filterHeading}>
          <div>
            <p className={styles.kicker}>A view, not a separate copy</p>
            <h2 id="subhistory-heading"><CalendarRange size={20} aria-hidden="true" /> Make a subhistory</h2>
          </div>
          <button type="button" className={styles.resetButton} onClick={resetFilters} disabled={!hasFilters}>
            <FilterX size={16} aria-hidden="true" /> Reset
          </button>
        </div>

        <div className={styles.filterGrid}>
          <label>
            <span>Period</span>
            <select value={range} onChange={(event) => setRange(event.target.value as RangeChoice)} aria-label="History period">
              {RANGE_CHOICES.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
            </select>
          </label>
          <label>
            <span>Ruleset</span>
            <select value={rulesetKey} onChange={(event) => setRulesetKey(event.target.value)} aria-label="History ruleset">
              <option value="all">All rulesets</option>
              {rulesets.map((option) => (
                <option key={option.key} value={option.key}>
                  {(() => {
                    const example = summaries.find((game) => game.rulesetKey === option.key);
                    const target = example?.profile.counters.find((counter) => counter.target)?.target;
                    const targetText = target ? ` · target ${target.value}` : "";
                    return `${readablePreset(option.preset)}${targetText} · ${option.gameCount} ${option.gameCount === 1 ? "game" : "games"}`;
                  })()}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Place</span>
            <select value={location} onChange={(event) => setLocation(event.target.value)} aria-label="History location">
              <option value="all">Everywhere</option>
              {locations.map(([normalized, display]) => <option key={normalized} value={normalized}>{display}</option>)}
            </select>
          </label>
          <label className={styles.openToggle}>
            <input type="checkbox" checked={includeOpen} onChange={(event) => setIncludeOpen(event.target.checked)} />
            <span>Include games still in progress</span>
          </label>
        </div>

        {range === "custom" && (
          <div className={styles.dateFields}>
            <label><span>From</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
            <label><span>Through</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
          </div>
        )}

        {historyEntities.length > 0 && (
          <fieldset className={styles.peopleFilter}>
            <legend>People <small>Every selected person must be in the game</small></legend>
            <div>
              {historyEntities.map((entity) => (
                <label key={entity.id} className={entityIds.includes(entity.id) ? styles.personSelected : styles.personChoice}>
                  <input type="checkbox" checked={entityIds.includes(entity.id)} onChange={() => toggleEntity(entity.id)} />
                  <span>{entity.name}</span>
                  {entity.archived_at && <small>Archived</small>}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <p className={styles.filterResult} data-testid="history-filter-count">
          <strong>{filteredGames.length}</strong> of {summaries.length} {summaries.length === 1 ? "game" : "games"} in this subhistory
        </p>
      </section>

      {filteredGames.length === 0 ? (
        <section className={styles.emptyState}>
          <BarChart3 size={38} aria-hidden="true" />
          <h2>{summaries.length ? "No games match this subhistory" : "Your history starts with the first finished game"}</h2>
          <p>{summaries.length ? "Widen the filters or include games still in progress." : "Record a game, choose an explicit result, and the cumulative record will build itself."}</p>
          {hasFilters && <button type="button" onClick={resetFilters}>Show all finished games</button>}
        </section>
      ) : (
        <>
          <section className={styles.summaryGrid} aria-label="Subhistory summary">
            <article><CalendarRange size={18} aria-hidden="true" /><span>Games</span><strong>{analytics.gameCount}</strong><small>{analytics.completedGameCount} finished{analytics.openGameCount ? ` · ${analytics.openGameCount} open` : ""}</small></article>
            <article><Users size={18} aria-hidden="true" /><span>People</span><strong>{analytics.identities.length}</strong><small>Stable identities, never merged by name</small></article>
            <article><Trophy size={18} aria-hidden="true" /><span>Decisions</span><strong>{decisionCount}</strong><small>Explicit results only</small></article>
            <article><Camera size={18} aria-hidden="true" /><span>Memories</span><strong>{analytics.mediaCount}</strong><small>Photos and videos attached</small></article>
          </section>

          <section className={styles.metricSection}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.kicker}>Like with like</p>
                <h2>Cumulative scoring</h2>
                <p>Compatible totals add up; latest, minimum and maximum counters keep that meaning across games. Different scoring rules stay separate.</p>
              </div>
              {metrics.length > 0 && (
                <label className={styles.metricPicker}>
                  <span>Metric</span>
                  <select value={selectedMetric?.key ?? ""} onChange={(event) => setMetricKey(event.target.value)} aria-label="Cumulative metric">
                    {metrics.map((metric) => (
                      <option key={metric.key} value={metric.key}>{metricOptionLabel(metric)}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {selectedMetric && analytics.metric ? (
              <>
                <div className={styles.metricCoverage}>
                  <span>{selectedMetric.gameCount} of {filteredGames.length} games use this exact counter definition</span>
                  {selectedMetric.gameCount !== filteredGames.length && <strong>Other scoring systems were excluded.</strong>}
                </div>

                {chartData.length > 0 && (
                  <div className={styles.chartCard} role="img" aria-label={`Running ${selectedMetric.label} totals over ${chartData.length} games. Exact values are repeated in the table below.`}>
                    <div className={styles.chartTitle}>
                      <span>{metricLabel(selectedMetric)}</span>
                      <small>Game by game</small>
                    </div>
                    <div className={styles.chartCanvas}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 10, right: 12, bottom: 4, left: -14 }}>
                          <CartesianGrid stroke="#e0e6ef" strokeDasharray="3 5" vertical={false} />
                          <XAxis dataKey="index" tickLine={false} axisLine={{ stroke: "#c6d0df" }} tick={{ fill: "#607087", fontSize: 11 }} />
                          <YAxis tickLine={false} axisLine={false} tick={{ fill: "#607087", fontSize: 11 }} width={55} />
                          <Tooltip
                            labelFormatter={(_, payload) => payload?.[0]?.payload ? `${payload[0].payload.title} · ${payload[0].payload.label}` : "Game"}
                            formatter={(value, name) => [formatNumber(Number(value), selectedMetric), identityByKey.get(String(name))?.label ?? String(name)]}
                            contentStyle={{ border: "1px solid #d8dfeb", borderRadius: 10, boxShadow: "0 12px 30px rgba(23,36,59,.12)" }}
                          />
                          {selectedMetric.scope === "participant" ? (
                            chartIdentities.map((identity, index) => (
                              <Line key={identity.identityKey} type="monotone" dataKey={identity.identityKey} name={identity.identityKey} stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                            ))
                          ) : (
                            <Line type="monotone" dataKey="cumulativeGameValue" name={selectedMetric.label} stroke={CHART_COLORS[0]} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                          )}
                          {selectedMetric.scope === "participant" && <Legend formatter={(value) => identityByKey.get(String(value))?.label ?? String(value)} />}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className={styles.noMetric}>This subhistory has no compatible numeric counter yet. Appearances and explicit results are still shown below.</div>
            )}
          </section>

          <section className={styles.tableSection} aria-labelledby="career-table-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.kicker}>Career book</p>
                <h2 id="career-table-heading">People in this subhistory</h2>
              </div>
            </div>
            <div className={styles.tableScroll}>
              <table data-testid="history-career-table">
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Games</th>
                    <th scope="col">W–D–L</th>
                    {selectedMetric?.scope === "participant" && <th scope="col">{metricLabel(selectedMetric)}</th>}
                    {selectedMetric?.scope === "participant" && <th scope="col">Average</th>}
                    {selectedMetric?.scope === "participant" && <th scope="col">Best game</th>}
                    <th scope="col">Win streak</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.identities.map((identity) => (
                    <tr key={identity.identityKey} data-testid={`history-person-${identity.entityId ?? identity.identityKey}`}>
                      <th scope="row"><span className={styles.personDot} />{identity.label}</th>
                      <td>{identity.appearances}</td>
                      <td>{identity.decidedGames ? `${identity.wins}–${identity.draws}–${identity.losses}` : "—"}</td>
                      {selectedMetric?.scope === "participant" && <td><strong>{identity.metric ? formatNumber(identity.metric.rollupValue, selectedMetric) : "—"}</strong></td>}
                      {selectedMetric?.scope === "participant" && <td>{identity.metric ? formatNumber(identity.metric.average, selectedMetric) : "—"}</td>}
                      {selectedMetric?.scope === "participant" && <td>{identity.metric ? formatNumber(identity.metric.best, selectedMetric) : "—"}</td>}
                      <td>{identity.longestWinStreak ? `${identity.currentWinStreak} now · ${identity.longestWinStreak} best` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.tableNote}>Wins, draws and losses come only from a valid result saved with the game. A score is never silently treated as a winner.</p>
          </section>

          <section className={styles.factsSection} aria-labelledby="facts-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.kicker}>Automatically worked out</p>
                <h2 id="facts-heading"><Sparkles size={21} aria-hidden="true" /> Interesting facts</h2>
                <p>Each statement is recalculated from exactly the games in this subhistory.</p>
              </div>
            </div>
            {analytics.facts.length ? (
              <div className={styles.factGrid}>
                {analytics.facts.map((fact, index) => (
                  <article key={fact.id}>
                    <span>{index % 3 === 0 ? <Medal size={20} /> : index % 3 === 1 ? <Lightbulb size={20} /> : <BarChart3 size={20} />}</span>
                    <p>{fact.text}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.noFacts}>A few more completed games will give the ledger something interesting to say.</div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
