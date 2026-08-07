"use client";

import { Plus, Save, Trash2, X } from "lucide-react";
import type { PendingAction, PendingActionPayload, Player, ProposedAdjustment, ProposedTurn } from "./types";
import styles from "./tile-tally.module.css";

type Props = {
  action: PendingAction;
  players: Player[];
  sourceLabel: string;
  busy: boolean;
  photoPreview?: string | null;
  onChange: (action: PendingAction) => void;
  onSave: () => void;
  onCancel: () => void;
};

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export default function ProposalEditor({
  action,
  players,
  sourceLabel,
  busy,
  photoPreview,
  onChange,
  onSave,
  onCancel,
}: Props) {
  const payload = action.payload;
  const updatePayload = (patch: Partial<PendingActionPayload>) =>
    onChange({ ...action, payload: { ...payload, ...patch } });
  const actionTitle =
    action.type === "log_game" ? "Log a game" : action.type === "add_turn" ? "Add a turn" : "Finish a game";

  const turns: ProposedTurn[] =
    action.type === "add_turn"
      ? [{
          player: typeof payload.player === "string" ? payload.player : "",
          score: Number(payload.score) || 0,
          word: typeof payload.word === "string" ? payload.word : "",
          is_bingo: Boolean(payload.is_bingo),
        }]
      : Array.isArray(payload.turns) ? payload.turns : [];
  const adjustments: ProposedAdjustment[] = Array.isArray(payload.adjustments) ? payload.adjustments : [];

  function logGameRows(nextTurns: ProposedTurn[], nextAdjustments = adjustments) {
    const proposedPlayers = Array.from(
      new Set(
        [...nextTurns.map((turn) => turn.player), ...nextAdjustments.map((adjustment) => adjustment.player)]
          .map((name) => name.trim())
          .filter(Boolean),
      ),
    );
    updatePayload({ turns: nextTurns, adjustments: nextAdjustments, players: proposedPlayers });
  }

  function setTurn(index: number, patch: Partial<ProposedTurn>) {
    const next = turns.map((turn, turnIndex) => (turnIndex === index ? { ...turn, ...patch } : turn));
    if (action.type === "add_turn") {
      const [turn] = next;
      updatePayload({
        player: turn.player,
        score: turn.score,
        word: turn.word || undefined,
        is_bingo: Boolean(turn.is_bingo),
      });
    } else {
      logGameRows(next);
    }
  }

  function removeTurn(index: number) {
    if (action.type === "add_turn") return;
    logGameRows(turns.filter((_turn, turnIndex) => turnIndex !== index));
  }

  function setAdjustment(index: number, patch: Partial<ProposedAdjustment>) {
    const next = adjustments.map((adjustment, adjustmentIndex) =>
      adjustmentIndex === index ? { ...adjustment, ...patch } : adjustment,
    );
    if (action.type === "log_game") logGameRows(turns, next);
    else updatePayload({ adjustments: next });
  }

  return (
    <section className={styles.proposal} aria-labelledby="proposal-heading">
      <div className={styles.proposalHeader}>
        <div>
          <p className={styles.kicker}>{sourceLabel} preview</p>
          <h3 id="proposal-heading">{actionTitle}</h3>
        </div>
        <button className={styles.iconButton} type="button" onClick={onCancel} aria-label="Discard proposed changes">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {photoPreview && (
        <figure className={styles.photoPreview}>
          {/* The object URL is local-only; the retained private original is the source of record. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoPreview} alt="Score sheet being deciphered" />
          <figcaption>The original is retained privately. Correct anything the handwriting reader missed.</figcaption>
        </figure>
      )}

      {action.type === "log_game" && (
        <div className={styles.twoColumns}>
          <label>
            <span>Date</span>
            <input
              type="date"
              value={typeof payload.played_on === "string" ? payload.played_on : today()}
              onChange={(event) => updatePayload({ played_on: event.target.value })}
            />
          </label>
          <label>
            <span>Location <em>optional</em></span>
            <input
              value={typeof payload.location === "string" ? payload.location : ""}
              onChange={(event) => updatePayload({ location: event.target.value === "" ? undefined : event.target.value })}
              placeholder="Kitchen table"
            />
          </label>
          <label>
            <span>Game status</span>
            <select
              value={payload.status === "in_progress" ? "in_progress" : "complete"}
              onChange={(event) => updatePayload({ status: event.target.value as "in_progress" | "complete" })}
            >
              <option value="complete">Complete</option>
              <option value="in_progress">In progress</option>
            </select>
          </label>
        </div>
      )}

      {(action.type === "add_turn" || action.type === "finish_game") && (
        <label>
          <span>Game reference</span>
          <input
            value={typeof payload.game_ref === "string" ? payload.game_ref : ""}
            readOnly
            aria-readonly="true"
          />
        </label>
      )}

      {action.type !== "finish_game" && (
        <fieldset className={styles.proposedRows}>
          <legend>{action.type === "add_turn" ? "Turn" : "Turns and final scores"}</legend>
          {turns.map((turn, index) => (
            <div className={styles.proposedTurn} key={`${index}-${turn.player}`}>
              <label>
                <span>Player</span>
                <input
                  list="tile-tally-player-names"
                  value={turn.player}
                  onChange={(event) => setTurn(index, { player: event.target.value })}
                  placeholder="Player name"
                />
              </label>
              <label>
                <span>Score</span>
                <input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={turn.score}
                  onChange={(event) => {
                    const nextScore = Number(event.target.value);
                    setTurn(index, {
                      score: nextScore,
                      ...(nextScore < 0 ? { word: undefined, is_bingo: false } : {}),
                    });
                  }}
                />
              </label>
              <label>
                <span>Word <em>optional</em></span>
                <input
                  value={turn.word ?? ""}
                  onChange={(event) => setTurn(index, { word: event.target.value.toUpperCase() })}
                  placeholder="FRIENDS"
                  disabled={turn.score < 0}
                />
                {turn.score < 0 && <small>Corrections are adjustment rows.</small>}
              </label>
              <label className={styles.miniCheckbox}>
                <input
                  type="checkbox"
                  checked={Boolean(turn.is_bingo)}
                  disabled={turn.score < 0}
                  onChange={(event) => setTurn(index, { is_bingo: event.target.checked })}
                />
                Bingo
              </label>
              {action.type === "log_game" && (
                <button className={styles.removeButton} type="button" onClick={() => removeTurn(index)} aria-label={`Remove turn ${index + 1}`}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          {action.type === "log_game" && (
            <button
              className={styles.smallButton}
              type="button"
              onClick={() => logGameRows([...turns, { player: players[0]?.name ?? "", score: 0, is_bingo: false }])}
            >
              <Plus size={15} aria-hidden="true" /> Add row
            </button>
          )}
        </fieldset>
      )}

      {(action.type === "finish_game" || adjustments.length > 0) && (
        <fieldset className={styles.proposedRows}>
          <legend>Adjustments</legend>
          {adjustments.map((adjustment, index) => (
            <div className={styles.adjustmentRow} key={`${index}-${adjustment.player}`}>
              <label>
                <span>Player</span>
                <input
                  list="tile-tally-player-names"
                  value={adjustment.player}
                  onChange={(event) => setAdjustment(index, { player: event.target.value })}
                />
              </label>
              <label>
                <span>Points</span>
                <input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={adjustment.points}
                  onChange={(event) => setAdjustment(index, { points: Number(event.target.value) })}
                />
              </label>
              <button
                className={styles.removeButton}
                type="button"
                onClick={() => {
                  const next = adjustments.filter((_row, rowIndex) => rowIndex !== index);
                  if (action.type === "log_game") logGameRows(turns, next);
                  else updatePayload({ adjustments: next });
                }}
                aria-label={`Remove adjustment ${index + 1}`}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
          <button
            className={styles.smallButton}
            type="button"
            onClick={() => {
              const next = [...adjustments, { player: players[0]?.name ?? "", points: 0 }];
              if (action.type === "log_game") logGameRows(turns, next);
              else updatePayload({ adjustments: next });
            }}
          >
            <Plus size={15} aria-hidden="true" /> Add adjustment
          </button>
        </fieldset>
      )}

      <datalist id="tile-tally-player-names">
        {players.map((player) => <option value={player.name} key={player.id} />)}
      </datalist>

      <div className={styles.confirmBar}>
        <p><strong>No game or turn rows have been written yet.</strong> Review the rows, then save explicitly.</p>
        <div>
          <button className={styles.secondaryButton} type="button" onClick={onCancel} disabled={busy}>Discard</button>
          <button className={styles.primaryButton} type="button" onClick={onSave} disabled={busy}>
            <Save size={17} aria-hidden="true" /> {busy ? "Saving…" : "Save to ledger"}
          </button>
        </div>
      </div>
    </section>
  );
}
