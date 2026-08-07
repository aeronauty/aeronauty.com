"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Pencil, Plus, RotateCcw, Trophy, X } from "lucide-react";
import { formatPlayedOn, formatScore, gameTotals, playerIdsForGame, turnsForGame } from "./gameData";
import type { Game, GamePlayer, Player, Turn } from "./types";
import styles from "./tile-tally.module.css";

type Props = {
  players: Player[];
  games: Game[];
  gamePlayers: GamePlayer[];
  turns: Turn[];
  activeGame: Game | null;
  busy: boolean;
  onStartGame: (playerIds: string[], playedOn: string, location: string) => Promise<Game | null>;
  onResumeGame: (gameId: string) => void;
  onAddTurn: (gameId: string, playerId: string, score: number, word: string, isBingo: boolean) => Promise<void>;
  onUndo: (gameId: string) => Promise<void>;
  onFinish: (gameId: string, playerIds: string[], leftovers: Record<string, number>) => Promise<void>;
  onAddPlayer: (name: string) => Promise<void>;
  onRenamePlayer: (id: string, name: string) => Promise<void>;
};

function localToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function PlayerManager({
  players,
  busy,
  onAddPlayer,
  onRenamePlayer,
  onClose,
}: Pick<Props, "players" | "busy" | "onAddPlayer" | "onRenamePlayer"> & { onClose: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(players.map((player) => [player.id, player.name])),
  );
  const [newName, setNewName] = useState("");

  useEffect(() => {
    setDrafts(Object.fromEntries(players.map((player) => [player.id, player.name])));
  }, [players]);

  return (
    <section className={styles.panel} aria-labelledby="manage-players-heading">
      <div className={styles.panelHeadingRow}>
        <div>
          <p className={styles.kicker}>Players</p>
          <h2 id="manage-players-heading">Who is at the table?</h2>
        </div>
        <button className={styles.iconButton} type="button" onClick={onClose} aria-label="Close player settings">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.playerEditList}>
        {players.map((player) => (
          <form
            className={styles.inlineForm}
            key={player.id}
            onSubmit={(event) => {
              event.preventDefault();
              void onRenamePlayer(player.id, drafts[player.id] ?? player.name);
            }}
          >
            <label className={styles.srOnly} htmlFor={`rename-${player.id}`}>
              Rename {player.name}
            </label>
            <input
              id={`rename-${player.id}`}
              value={drafts[player.id] ?? ""}
              onChange={(event) => setDrafts((current) => ({ ...current, [player.id]: event.target.value }))}
              maxLength={50}
            />
            <button className={styles.smallButton} type="submit" disabled={busy || !drafts[player.id]?.trim()}>
              <Check size={15} aria-hidden="true" /> Save
            </button>
          </form>
        ))}
      </div>
      <form
        className={styles.inlineForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (!newName.trim()) return;
          void onAddPlayer(newName).then(() => setNewName(""));
        }}
      >
        <label className={styles.srOnly} htmlFor="new-player-name">
          New player name
        </label>
        <input
          id="new-player-name"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Add another player"
          maxLength={50}
        />
        <button className={styles.smallButton} type="submit" disabled={busy || !newName.trim()}>
          <Plus size={15} aria-hidden="true" /> Add
        </button>
      </form>
    </section>
  );
}

function NewGame({
  players,
  games,
  turns,
  busy,
  onStartGame,
  onResumeGame,
}: Pick<Props, "players" | "games" | "turns" | "busy" | "onStartGame" | "onResumeGame">) {
  const [playedOn, setPlayedOn] = useState(localToday);
  const [location, setLocation] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(() => players.map((player) => player.id));
  const inProgress = games.filter((game) => game.status === "in_progress");

  useEffect(() => {
    setSelectedIds((current) => {
      const valid = current.filter((id) => players.some((player) => player.id === id));
      return valid.length ? valid : players.map((player) => player.id);
    });
  }, [players]);

  return (
    <div className={styles.stack}>
      <section className={`${styles.panel} ${styles.newGamePanel}`} aria-labelledby="new-game-heading">
        <p className={styles.kicker}>Fresh rack</p>
        <h2 id="new-game-heading">Start a game</h2>
        <p className={styles.muted}>Choose everyone playing today. Every score will be kept as its own turn.</p>
        <form
          className={styles.formStack}
          onSubmit={(event) => {
            event.preventDefault();
            void onStartGame(selectedIds, playedOn, location);
          }}
        >
          <fieldset className={styles.playerPicker}>
            <legend>Players</legend>
            {players.map((player) => {
              const checked = selectedIds.includes(player.id);
              return (
                <label className={`${styles.playerChoice} ${checked ? styles.playerChoiceChecked : ""}`} key={player.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelectedIds((current) =>
                        current.includes(player.id)
                          ? current.filter((id) => id !== player.id)
                          : [...current, player.id],
                      )
                    }
                  />
                  <span>{player.name}</span>
                </label>
              );
            })}
          </fieldset>
          <div className={styles.twoColumns}>
            <label>
              <span>Date</span>
              <input type="date" value={playedOn} onChange={(event) => setPlayedOn(event.target.value)} required />
            </label>
            <label>
              <span>Location <em>optional</em></span>
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Kitchen table"
                maxLength={100}
              />
            </label>
          </div>
          <button className={styles.primaryButton} type="submit" disabled={busy || selectedIds.length < 2}>
            Start tallying
          </button>
        </form>
      </section>

      {inProgress.length > 0 && (
        <section className={styles.panel} aria-labelledby="unfinished-heading">
          <p className={styles.kicker}>Still on the board</p>
          <h2 id="unfinished-heading">Unfinished games</h2>
          <div className={styles.compactList}>
            {inProgress.map((game) => {
              const totalTurns = turns.filter((turn) => turn.game_id === game.id).length;
              return (
                <button className={styles.resumeRow} type="button" key={game.id} onClick={() => onResumeGame(game.id)}>
                  <span>
                    <strong>{formatPlayedOn(game.played_on)}</strong>
                    <small>{game.location || "No location"} · {totalTurns} turns</small>
                  </span>
                  <span aria-hidden="true">Resume →</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export default function ScoreView(props: Props) {
  const {
    players,
    games,
    gamePlayers,
    turns,
    activeGame,
    busy,
    onStartGame,
    onResumeGame,
    onAddTurn,
    onUndo,
    onFinish,
    onAddPlayer,
    onRenamePlayer,
  } = props;
  const [showPlayers, setShowPlayers] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [score, setScore] = useState("");
  const [word, setWord] = useState("");
  const [isBingo, setIsBingo] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [leftovers, setLeftovers] = useState<Record<string, number>>({});

  const activeTurns = useMemo(
    () => (activeGame ? turnsForGame(turns, activeGame.id) : []),
    [activeGame, turns],
  );
  const participantIds = useMemo(
    () => (activeGame ? playerIdsForGame(activeGame, turns, players, gamePlayers) : []),
    [activeGame, gamePlayers, players, turns],
  );
  const participants = participantIds
    .map((id) => players.find((player) => player.id === id))
    .filter((player): player is Player => Boolean(player));
  const totals = activeGame ? gameTotals(activeGame.id, turns) : new Map<string, number>();
  const isCorrection = Number(score) < 0;

  useEffect(() => {
    if (!participants.length) {
      setSelectedPlayerId(null);
      return;
    }
    setSelectedPlayerId((current) =>
      current && participants.some((player) => player.id === current) ? current : participants[0].id,
    );
  }, [activeGame?.id, participantIds.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const ledgerRows = useMemo(() => {
    const running = new Map<string, number>();
    return activeTurns.map((turn) => {
      const total = (running.get(turn.player_id) ?? 0) + turn.score;
      running.set(turn.player_id, total);
      return { turn, total };
    });
  }, [activeTurns]);

  async function submitTurn(event: FormEvent) {
    event.preventDefault();
    if (!activeGame || !selectedPlayerId || score.trim() === "") return;
    const numericScore = Number(score);
    if (!Number.isInteger(numericScore)) return;
    await onAddTurn(
      activeGame.id,
      selectedPlayerId,
      numericScore,
      isCorrection ? "" : word,
      isCorrection ? false : isBingo,
    );
    setScore("");
    setWord("");
    setIsBingo(false);
    const currentIndex = participants.findIndex((player) => player.id === selectedPlayerId);
    setSelectedPlayerId(participants[(currentIndex + 1) % participants.length]?.id ?? selectedPlayerId);
  }

  return (
    <div className={styles.stack}>
      <div className={styles.viewActions}>
        <button className={styles.textButton} type="button" onClick={() => setShowPlayers((current) => !current)}>
          <Pencil size={15} aria-hidden="true" /> Manage players
        </button>
      </div>
      {showPlayers && (
        <PlayerManager
          players={players}
          busy={busy}
          onAddPlayer={onAddPlayer}
          onRenamePlayer={onRenamePlayer}
          onClose={() => setShowPlayers(false)}
        />
      )}

      {!activeGame ? (
        <NewGame
          players={players}
          games={games}
          turns={turns}
          busy={busy}
          onStartGame={onStartGame}
          onResumeGame={onResumeGame}
        />
      ) : (
        <>
          <section className={styles.scoreHero} aria-labelledby="active-game-heading">
            <div className={styles.gameMeta}>
              <span>Game in progress</span>
              <span>{formatPlayedOn(activeGame.played_on)}{activeGame.location ? ` · ${activeGame.location}` : ""}</span>
            </div>
            <h2 className={styles.srOnly} id="active-game-heading">Running totals</h2>
            <div className={styles.scoreboard}>
              {participants.map((player) => (
                <button
                  className={`${styles.scoreCard} ${selectedPlayerId === player.id ? styles.scoreCardSelected : ""}`}
                  type="button"
                  key={player.id}
                  onClick={() => setSelectedPlayerId(player.id)}
                  aria-pressed={selectedPlayerId === player.id}
                >
                  <span>{player.name}</span>
                  <strong>{totals.get(player.id) ?? 0}</strong>
                  <small>{selectedPlayerId === player.id ? "Scoring next" : "Tap to select"}</small>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="add-turn-heading">
            <p className={styles.kicker}>Turn {activeTurns.length + 1}</p>
            <h2 id="add-turn-heading">
              {players.find((player) => player.id === selectedPlayerId)?.name ?? "Player"}&apos;s score
            </h2>
            <form className={styles.turnForm} onSubmit={submitTurn}>
              <label className={styles.scoreInputLabel}>
                <span>Points</span>
                <input
                  className={styles.scoreInput}
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={score}
                  onChange={(event) => {
                    const nextScore = event.target.value;
                    setScore(nextScore);
                    if (Number(nextScore) < 0) {
                      setWord("");
                      setIsBingo(false);
                    }
                  }}
                  placeholder="0"
                  autoFocus
                  required
                />
                <small>Use a minus sign for a correction.</small>
              </label>
              <label>
                <span>Word <em>optional</em></span>
                <input
                  value={word}
                  onChange={(event) => setWord(event.target.value.toUpperCase())}
                  placeholder="FRIENDS"
                  maxLength={30}
                  autoComplete="off"
                  disabled={isCorrection}
                />
                {isCorrection && <small>Corrections are stored as adjustment rows.</small>}
              </label>
              <label className={`${styles.checkboxRow} ${isBingo ? styles.checkboxRowChecked : ""}`}>
                <input
                  type="checkbox"
                  checked={isBingo}
                  disabled={isCorrection}
                  onChange={(event) => setIsBingo(event.target.checked)}
                />
                <span className={styles.tileMini}>7</span>
                Bingo — all seven tiles
              </label>
              <button className={styles.primaryButton} type="submit" disabled={busy || !selectedPlayerId || score === ""}>
                Add turn
              </button>
            </form>
          </section>

          <section className={styles.panel} aria-labelledby="ledger-heading">
            <div className={styles.panelHeadingRow}>
              <div>
                <p className={styles.kicker}>The ledger</p>
                <h2 id="ledger-heading">Every turn</h2>
              </div>
              <button
                className={styles.smallButton}
                type="button"
                onClick={() => void onUndo(activeGame.id)}
                disabled={busy || activeTurns.length === 0}
              >
                <RotateCcw size={15} aria-hidden="true" /> Undo last
              </button>
            </div>
            {ledgerRows.length === 0 ? (
              <div className={styles.emptyCompact}>The board is ready. Add the first score above.</div>
            ) : (
              <div className={styles.ledgerWrap}>
                <table className={styles.ledger}>
                  <thead>
                    <tr><th>#</th><th>Player</th><th>Word</th><th>Turn</th><th>Total</th></tr>
                  </thead>
                  <tbody>
                    {ledgerRows.map(({ turn, total }) => (
                      <tr key={turn.id}>
                        <td>{String(turn.seq).padStart(2, "0")}</td>
                        <td>{players.find((player) => player.id === turn.player_id)?.name ?? "Unknown"}</td>
                        <td>
                          {turn.kind === "adjustment" ? <em>adjustment</em> : turn.word || "—"}
                          {turn.is_bingo && <span className={styles.bingoMark} title="Bingo"> ★</span>}
                        </td>
                        <td className={turn.score < 0 ? styles.negative : ""}>{formatScore(turn.score)}</td>
                        <td>{total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {!showFinish ? (
            <button className={styles.finishButton} type="button" onClick={() => setShowFinish(true)}>
              <Trophy size={18} aria-hidden="true" /> Finish game
            </button>
          ) : (
            <section className={`${styles.panel} ${styles.finishPanel}`} aria-labelledby="finish-heading">
              <div className={styles.panelHeadingRow}>
                <div>
                  <p className={styles.kicker}>Final rack</p>
                  <h2 id="finish-heading">Points left on each rack</h2>
                </div>
                <button className={styles.iconButton} type="button" onClick={() => setShowFinish(false)} aria-label="Cancel finishing game">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <p className={styles.muted}>Enter each player&apos;s unused tile value. A player on zero receives the others&apos; points.</p>
              <form
                className={styles.formStack}
                onSubmit={(event) => {
                  event.preventDefault();
                  void onFinish(activeGame.id, participantIds, leftovers).then(() => setShowFinish(false));
                }}
              >
                <div className={styles.leftoverGrid}>
                  {participants.map((player) => (
                    <label key={player.id}>
                      <span>{player.name}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={leftovers[player.id] ?? 0}
                        onChange={(event) =>
                          setLeftovers((current) => ({ ...current, [player.id]: Number(event.target.value) }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <button className={styles.primaryButton} type="submit" disabled={busy}>
                  Calculate final scores
                </button>
              </form>
            </section>
          )}
        </>
      )}
    </div>
  );
}
