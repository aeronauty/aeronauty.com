"use client";

import { useMemo } from "react";
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
import { Award, CalendarRange, Sparkles, Type } from "lucide-react";
import { formatPlayedOn, gameTotals, playerIdsForGame } from "./gameData";
import type { Game, GamePlayer, Player, Turn } from "./types";
import styles from "./tile-tally.module.css";

type Props = { players: Player[]; games: Game[]; gamePlayers: GamePlayer[]; turns: Turn[]; onGoToScore: () => void };

const COLORS = ["#f2cf68", "#c86b4b", "#77b7a6", "#9c8fc2", "#d4a85b", "#78a3c4"];

export default function TrendsView({ players, games, gamePlayers, turns, onGoToScore }: Props) {
  const stats = useMemo(() => {
    const completed = games
      .filter((game) => game.status === "complete")
      .sort((a, b) => a.played_on.localeCompare(b.played_on) || a.created_at.localeCompare(b.created_at));
    const perPlayerTotals = new Map<string, number[]>();
    const wins = new Map<string, number>();
    const appearances = new Map<string, number>();
    const chartData: Array<Record<string, string | number>> = [];

    completed.forEach((game, index) => {
      const totals = gameTotals(game.id, turns);
      const ids = playerIdsForGame(game, turns, players, gamePlayers).filter((id) => totals.has(id));
      const chartRow: Record<string, string | number> = {
        label: formatPlayedOn(game.played_on, { day: "numeric", month: "short" }),
        date: game.played_on,
        game: index + 1,
      };
      ids.forEach((id) => {
        const value = totals.get(id) ?? 0;
        chartRow[id] = value;
        perPlayerTotals.set(id, [...(perPlayerTotals.get(id) ?? []), value]);
        appearances.set(id, (appearances.get(id) ?? 0) + 1);
      });
      if (ids.length) {
        const top = Math.max(...ids.map((id) => totals.get(id) ?? 0));
        const leaders = ids.filter((id) => totals.get(id) === top);
        if (leaders.length === 1) wins.set(leaders[0], (wins.get(leaders[0]) ?? 0) + 1);
      }
      chartData.push(chartRow);
    });

    const pairs: Array<{ a: Player; b: Player; aWins: number; bWins: number; draws: number; games: number }> = [];
    for (let first = 0; first < players.length; first += 1) {
      for (let second = first + 1; second < players.length; second += 1) {
        const a = players[first];
        const b = players[second];
        let aWins = 0;
        let bWins = 0;
        let draws = 0;
        completed.forEach((game) => {
          const totals = gameTotals(game.id, turns);
          if (!totals.has(a.id) || !totals.has(b.id)) return;
          const aTotal = totals.get(a.id) ?? 0;
          const bTotal = totals.get(b.id) ?? 0;
          if (aTotal > bTotal) aWins += 1;
          else if (bTotal > aTotal) bWins += 1;
          else draws += 1;
        });
        const pairGames = aWins + bWins + draws;
        if (pairGames) pairs.push({ a, b, aWins, bWins, draws, games: pairGames });
      }
    }

    const playableTurns = turns.filter((turn) => turn.kind === "play");
    const bestTurn = playableTurns.reduce<Turn | null>(
      (best, turn) => (!best || turn.score > best.score ? turn : best),
      null,
    );
    const longestWordTurn = playableTurns
      .filter((turn) => turn.word?.trim())
      .reduce<Turn | null>((best, turn) => {
        if (!best) return turn;
        return (turn.word?.trim().length ?? 0) > (best.word?.trim().length ?? 0) ? turn : best;
      }, null);
    const bingoCount = playableTurns.filter((turn) => turn.is_bingo).length;
    const rolling = players.map((player) => {
      const values = perPlayerTotals.get(player.id) ?? [];
      const latest = values.slice(-5);
      return {
        player,
        games: appearances.get(player.id) ?? 0,
        wins: wins.get(player.id) ?? 0,
        average: latest.length ? latest.reduce((sum, value) => sum + value, 0) / latest.length : null,
      };
    });

    return { completed, chartData, pairs, bestTurn, longestWordTurn, bingoCount, rolling };
  }, [gamePlayers, games, players, turns]);

  if (stats.completed.length === 0) {
    return (
      <section className={styles.emptyState}>
        <span className={styles.emptyTile}>↗</span>
        <h2>Finish a game to reveal trends</h2>
        <p>Wins, averages, records and the score line all grow from the turn ledger.</p>
        <button className={styles.primaryButton} type="button" onClick={onGoToScore}>Go to scoring</button>
      </section>
    );
  }

  const bestPlayer = stats.bestTurn
    ? players.find((player) => player.id === stats.bestTurn?.player_id)?.name ?? "Unknown"
    : "—";
  const wordPlayer = stats.longestWordTurn
    ? players.find((player) => player.id === stats.longestWordTurn?.player_id)?.name ?? "Unknown"
    : "—";

  return (
    <div className={styles.stack}>
      <header className={styles.viewHeader}>
        <p className={styles.kicker}>From the ledger</p>
        <h2>Trends</h2>
        <p>These only exist because every turn was kept.</p>
      </header>

      <section className={styles.statGrid} aria-label="Headline records">
        <article className={styles.statCard}>
          <Award size={19} aria-hidden="true" />
          <span>Best single turn</span>
          <strong>{stats.bestTurn?.score ?? "—"}</strong>
          <small>{stats.bestTurn ? bestPlayer : "No scored turns"}</small>
        </article>
        <article className={styles.statCard}>
          <Type size={19} aria-hidden="true" />
          <span>Longest word</span>
          <strong className={styles.wordRecord}>{stats.longestWordTurn?.word || "—"}</strong>
          <small>{stats.longestWordTurn ? `${wordPlayer} · ${stats.longestWordTurn.word?.trim().length} letters` : "No words logged"}</small>
        </article>
        <article className={styles.statCard}>
          <Sparkles size={19} aria-hidden="true" />
          <span>Bingos</span>
          <strong>{stats.bingoCount}</strong>
          <small>Seven-tile turns</small>
        </article>
        <article className={styles.statCard}>
          <CalendarRange size={19} aria-hidden="true" />
          <span>Games recorded</span>
          <strong>{stats.completed.length}</strong>
          <small>Completed games</small>
        </article>
      </section>

      <section className={styles.panel} aria-labelledby="score-over-time-heading">
        <div className={styles.panelHeadingRow}>
          <div>
            <p className={styles.kicker}>Final totals</p>
            <h2 id="score-over-time-heading">Scores over time</h2>
          </div>
        </div>
        <div className={styles.chart} role="img" aria-label="Line chart of each player's final score over time">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.chartData} margin={{ top: 12, right: 10, left: -18, bottom: 4 }}>
              <CartesianGrid stroke="#ded6c4" strokeDasharray="2 5" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#696355", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#b7ad98" }} />
              <YAxis tick={{ fill: "#696355", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "#fffaf0", border: "1px solid #b7ad98", borderRadius: 4 }}
                labelStyle={{ color: "#1d3529", fontFamily: "var(--font-mono)" }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
              {players.map((player, index) => (
                <Line
                  key={player.id}
                  type="monotone"
                  dataKey={player.id}
                  name={player.name}
                  stroke={COLORS[index % COLORS.length]}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: COLORS[index % COLORS.length] }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className={styles.trendColumns}>
        <section className={styles.panel} aria-labelledby="form-heading">
          <p className={styles.kicker}>Recent form</p>
          <h2 id="form-heading">Rolling average</h2>
          <p className={styles.muted}>Average final score over each player&apos;s latest five games.</p>
          <div className={styles.metricRows}>
            {stats.rolling.map(({ player, games: gameCount, wins, average }) => (
              <div className={styles.metricRow} key={player.id}>
                <span><strong>{player.name}</strong><small>{wins} {wins === 1 ? "win" : "wins"} in {gameCount}</small></span>
                <b>{average === null ? "—" : Math.round(average)}</b>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="head-to-head-heading">
          <p className={styles.kicker}>Across the table</p>
          <h2 id="head-to-head-heading">Head to head</h2>
          {stats.pairs.length ? (
            <div className={styles.metricRows}>
              {stats.pairs.map((pair) => (
                <div className={styles.headToHead} key={`${pair.a.id}-${pair.b.id}`}>
                  <div><strong>{pair.a.name}</strong><b>{pair.aWins}</b></div>
                  <span>{pair.draws ? `${pair.draws} draw${pair.draws === 1 ? "" : "s"}` : `${pair.games} games`}</span>
                  <div><b>{pair.bWins}</b><strong>{pair.b.name}</strong></div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyCompact}>No two players have completed a game together yet.</div>
          )}
        </section>
      </div>
    </div>
  );
}
