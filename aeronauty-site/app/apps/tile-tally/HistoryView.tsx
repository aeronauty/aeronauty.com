"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Clock3, Trophy } from "lucide-react";
import {
  formatPlayedOn,
  formatScore,
  gameTotals,
  playerIdsForGame,
  sourceLabel,
  turnsForGame,
  winnerIds,
} from "./gameData";
import type { Game, GamePlayer, Player, Turn } from "./types";
import styles from "./tile-tally.module.css";

type Props = {
  players: Player[];
  games: Game[];
  gamePlayers: GamePlayer[];
  turns: Turn[];
  onResume: (gameId: string) => void;
  onGoToScore: () => void;
};

export default function HistoryView({ players, games, gamePlayers, turns, onResume, onGoToScore }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (games.length === 0) {
    return (
      <section className={styles.emptyState}>
        <span className={styles.emptyTile}>0</span>
        <h2>No games in the ledger yet</h2>
        <p>Your finished and in-progress games will appear here, turn by turn.</p>
        <button className={styles.primaryButton} type="button" onClick={onGoToScore}>Start the first game</button>
      </section>
    );
  }

  return (
    <div className={styles.stack}>
      <header className={styles.viewHeader}>
        <p className={styles.kicker}>Game book</p>
        <h2>History</h2>
        <p>Totals are calculated from the turns below — never stored in their place.</p>
      </header>
      <div className={styles.historyList}>
        {games.map((game) => {
          const gameTurns = turnsForGame(turns, game.id);
          const participantIds = playerIdsForGame(game, turns, players, gamePlayers);
          const totals = gameTotals(game.id, turns);
          const winners = winnerIds(game.id, turns);
          const isExpanded = expandedId === game.id;
          return (
            <article className={styles.historyCard} key={game.id}>
              <div className={styles.historyTopline}>
                <div>
                  <span className={`${styles.statusChip} ${game.status === "complete" ? styles.completeChip : ""}`}>
                    {game.status === "complete" ? "Complete" : "In progress"}
                  </span>
                  <span className={styles.sourceChip}>{sourceLabel(game.source)}</span>
                </div>
                <time dateTime={game.played_on}>{formatPlayedOn(game.played_on)}</time>
              </div>
              <div className={styles.historyTitleRow}>
                <div>
                  <h3>{game.location || "Game at the table"}</h3>
                  <p>{gameTurns.length} {gameTurns.length === 1 ? "turn" : "turns"}</p>
                </div>
                {game.status === "in_progress" && (
                  <button
                    className={styles.smallButton}
                    type="button"
                    onClick={() => {
                      onResume(game.id);
                      onGoToScore();
                    }}
                  >
                    <Clock3 size={15} aria-hidden="true" /> Resume
                  </button>
                )}
              </div>
              <div className={styles.resultRows}>
                {participantIds.map((playerId) => {
                  const player = players.find((candidate) => candidate.id === playerId);
                  if (!player) return null;
                  const winner = game.status === "complete" && winners.includes(player.id) && winners.length === 1;
                  return (
                    <div className={`${styles.resultRow} ${winner ? styles.resultWinner : ""}`} key={player.id}>
                      <span>{winner && <Trophy size={15} aria-label="Winner" />} {player.name}</span>
                      <strong>{totals.get(player.id) ?? 0}</strong>
                    </div>
                  );
                })}
              </div>
              <button
                className={styles.disclosureButton}
                type="button"
                aria-expanded={isExpanded}
                onClick={() => setExpandedId(isExpanded ? null : game.id)}
              >
                {isExpanded ? "Hide turn ledger" : "Show turn ledger"}
                {isExpanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
              </button>
              {isExpanded && (
                <div className={styles.ledgerWrap}>
                  {gameTurns.length ? (
                    <table className={styles.ledger}>
                      <thead><tr><th>#</th><th>Player</th><th>Word</th><th>Score</th><th>Via</th></tr></thead>
                      <tbody>
                        {gameTurns.map((turn) => (
                          <tr key={turn.id}>
                            <td>{String(turn.seq).padStart(2, "0")}</td>
                            <td>{players.find((player) => player.id === turn.player_id)?.name ?? "Unknown"}</td>
                            <td>
                              {turn.kind === "adjustment" ? <em>adjustment</em> : turn.word || "—"}
                              {turn.is_bingo && <span className={styles.bingoMark}> ★</span>}
                            </td>
                            <td className={turn.score < 0 ? styles.negative : ""}>{formatScore(turn.score)}</td>
                            <td>{sourceLabel(turn.source)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className={styles.emptyCompact}>No turns have been recorded in this game.</div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
