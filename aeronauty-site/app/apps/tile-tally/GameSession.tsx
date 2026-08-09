"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Flag, RotateCcw, Sparkles } from "lucide-react";
import {
  counterTotals,
  effectiveVoidedEventIds,
  GAME_COUNTER_OWNER,
  hasReachedTarget,
  normaliseGameProfile,
  winnerIdsForCounter,
} from "@/lib/tiletally/gameProfiles";
import type { GameLedgerField, JsonValue } from "@/lib/tiletally/types";
import GameLedgerReplayView, {
  type GameLedgerReplayCapture,
  type GameLedgerReplayEntry,
  type GameLedgerReplayPhoto,
  type GameLedgerReplayVideo,
} from "./GameLedgerReplayView";
import type {
  AppendLedgerEventInput,
  FinishLedgerGameInput,
  LedgerEntity,
  LedgerEvent,
  LedgerGame,
  LedgerMedia,
  LedgerParticipant,
} from "./gameLedgerTypes";
import styles from "./game-ledger.module.css";

type Props = {
  game: LedgerGame;
  entities: LedgerEntity[];
  participants: LedgerParticipant[];
  events: LedgerEvent[];
  media: LedgerMedia[];
  busy: boolean;
  onBack: () => void;
  onAppendEvent: (input: AppendLedgerEventInput) => Promise<LedgerEvent | null>;
  onVoidEvent: (gameId: string, eventId: string) => Promise<void>;
  onFinishGame: (input: FinishLedgerGameInput) => Promise<void>;
  onUploadMedia: (
    gameId: string,
    kind: "photo" | "video",
    file: File,
    capturedAt: string,
    durationSeconds?: number,
  ) => Promise<string>;
  onDeleteMedia: (media: LedgerMedia) => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function stringifyValue(value: JsonValue | undefined) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function workflowStatusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function participantRole(participant: LedgerParticipant, fallback?: { id: string; label: string }) {
  if (isRecord(participant.metadata)) {
    const id = typeof participant.metadata.role_id === "string" ? participant.metadata.role_id : fallback?.id;
    const label = typeof participant.metadata.role_label === "string" ? participant.metadata.role_label : fallback?.label;
    if (id && label) return { id, label };
  }
  return fallback ?? null;
}

function missingRequiredField(fields: GameLedgerField[], values: Record<string, JsonValue>) {
  return fields.find((field) => {
    if (!field.required) return false;
    const value = values[field.id];
    return !Object.hasOwn(values, field.id)
      || value === ""
      || value === null
      || value === undefined
      || (field.type === "text" && typeof value === "string" && value.trim() === "");
  });
}

function cleanFieldValues(fields: GameLedgerField[], values: Record<string, JsonValue>) {
  return Object.fromEntries(fields.flatMap((field) => {
    let value = values[field.id];
    if (field.type === "text" && typeof value === "string") value = value.trim();
    return value === "" || value === null || value === undefined ? [] : [[field.id, value]];
  })) as Record<string, JsonValue>;
}

function CribbageTrack({
  participants,
  totals,
  counterId,
  target,
}: {
  participants: LedgerParticipant[];
  totals: Map<string, Record<string, number>>;
  counterId: string;
  target: number;
}) {
  return (
    <section className={styles.cribbageBoard} aria-labelledby="cribbage-board-heading">
      <div>
        <p className={styles.kicker}>Peg board</p>
        <h3 id="cribbage-board-heading">Race to {target}</h3>
      </div>
      <div className={styles.pegTracks}>
        {participants.map((participant, participantIndex) => {
          const score = Math.max(0, Math.min(target, Math.round(totals.get(participant.id)?.[counterId] ?? 0)));
          return (
            <div className={styles.pegTrackRow} key={participant.id} aria-label={`${participant.label}: ${score} of ${target}`}>
              <span>{participant.label}<strong>{score}</strong></span>
              <div className={styles.pegTrack} aria-hidden="true">
                {Array.from({ length: target + 1 }, (_item, index) => (
                  <i
                    className={`${index === score ? styles.pegCurrent : ""} ${index > 0 && index % 5 === 0 ? styles.pegFive : ""}`}
                    data-player={participantIndex % 4}
                    key={index}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: GameLedgerField;
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
}) {
  if (field.type === "boolean") {
    return (
      <label>
        <span>{field.label}{!field.required && <em> optional</em>}</span>
        <select
          value={typeof value === "boolean" ? String(value) : ""}
          onChange={(event) => onChange(event.target.value === "" ? "" : event.target.value === "true")}
          required={field.required}
        >
          <option value="">Choose…</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label>
        <span>{field.label}{!field.required && <em> optional</em>}</span>
        <select value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} required={field.required}>
          <option value="">Choose…</option>
          {(field.options ?? []).map((option) => <option value={option} key={option}>{option}</option>)}
        </select>
      </label>
    );
  }

  return (
    <label>
      <span>{field.label}{!field.required && <em> optional</em>}</span>
      <input
        type={field.type === "number" ? "number" : "text"}
        inputMode={field.type === "number" ? "decimal" : undefined}
        step={field.type === "number" ? "any" : undefined}
        value={typeof value === "string" || typeof value === "number" ? value : ""}
        onChange={(event) => onChange(field.type === "number"
          ? event.target.value === "" ? "" : Number(event.target.value)
          : event.target.value)}
        placeholder={field.placeholder}
        required={field.required}
      />
    </label>
  );
}

function eventDetail(event: LedgerEvent, game: LedgerGame) {
  const profile = normaliseGameProfile(game.definition);
  const payload = isRecord(event.event_data) ? event.event_data : {};
  const values = isRecord(payload.values) ? payload.values : {};
  const fields = isRecord(payload.fields) ? payload.fields : {};
  const result = event.event_kind === "result" ? payload : isRecord(payload.result) ? payload.result : {};
  const parts: string[] = [];

  for (const counter of profile.counters) {
    const value = values[counter.id];
    if (typeof value === "number") {
      parts.push(`${counter.label} ${counter.aggregation === "sum" && value > 0 ? "+" : ""}${formatNumber(value)}${counter.unit ? ` ${counter.unit}` : ""}`);
    }
  }
  const displayFields = event.event_kind === "result" ? profile.result_fields : profile.event_fields;
  for (const field of displayFields) {
    const value = (fields[field.id] ?? result[field.id]) as JsonValue | undefined;
    const formatted = stringifyValue(value);
    if (formatted) parts.push(`${field.label}: ${formatted}`);
  }
  if (event.event_kind === "result" && typeof result._outcome === "string") {
    parts.unshift(`Outcome: ${result._outcome.replace(/_/g, " ")}`);
  }
  if (event.note) parts.push(event.note);
  return parts.join(" · ");
}

export default function GameSession({
  game,
  entities,
  participants,
  events,
  media,
  busy,
  onBack,
  onAppendEvent,
  onVoidEvent,
  onFinishGame,
  onUploadMedia,
  onDeleteMedia,
}: Props) {
  const profile = useMemo(() => normaliseGameProfile(game.definition), [game.definition]);
  const sortedParticipants = useMemo(() => [...participants].sort((a, b) => a.seat - b.seat), [participants]);
  const participantIdSignature = sortedParticipants.map((participant) => participant.id).join("|");
  const sortedEvents = useMemo(() => [...events].sort((a, b) => a.seq - b.seq), [events]);
  const participantCounters = useMemo(() => profile.counters.filter((counter) => counter.scope !== "game"), [profile.counters]);
  const gameCounters = useMemo(() => profile.counters.filter((counter) => counter.scope === "game"), [profile.counters]);
  const cribbageCounter = profile.preset === "cribbage" ? participantCounters[0] : undefined;
  const cribbageTrackTarget = cribbageCounter?.target?.operator === ">="
    && Number.isFinite(cribbageCounter.target.value)
    && cribbageCounter.target.value >= 1
    && cribbageCounter.target.value <= 240
    ? Math.round(cribbageCounter.target.value)
    : null;
  const totals = useMemo(
    () => counterTotals(profile, sortedParticipants.map((participant) => participant.id), sortedEvents),
    [profile, sortedEvents, sortedParticipants],
  );
  const voidedEventIds = useMemo(() => effectiveVoidedEventIds(sortedEvents), [sortedEvents]);

  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(sortedParticipants[0]?.id ?? null);
  const [counterDraft, setCounterDraft] = useState<Record<string, string>>({});
  const [fieldDraft, setFieldDraft] = useState<Record<string, JsonValue>>({});
  const [note, setNote] = useState("");
  const [showFinish, setShowFinish] = useState(false);
  const [resultDraft, setResultDraft] = useState<Record<string, JsonValue>>({});
  const [outcome, setOutcome] = useState("completed");
  const [winnerParticipantIds, setWinnerParticipantIds] = useState<string[]>([]);
  const [finishNote, setFinishNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const participantIds = participantIdSignature ? participantIdSignature.split("|") : [];
    setSelectedParticipantId((current) => current && participantIds.includes(current)
      ? current
      : participantIds[0] ?? null);
    setCounterDraft({});
    setFieldDraft({});
    setNote("");
    setShowFinish(false);
    setResultDraft({});
    setOutcome("completed");
    setWinnerParticipantIds([]);
    setFinishNote("");
  }, [game.id, participantIdSignature]);

  const participantById = useMemo(
    () => new Map(sortedParticipants.map((participant) => [participant.id, participant])),
    [sortedParticipants],
  );

  const replayEntries = useMemo<GameLedgerReplayEntry[]>(() => {
    const eventEntries: GameLedgerReplayEntry[] = sortedEvents.map((event) => {
      const author = event.actor_participant_id ? participantById.get(event.actor_participant_id)?.label : null;
      if (event.event_kind === "note") {
        return {
          id: `event-${event.id}`,
          kind: "note",
          occurredAt: event.occurred_at,
          author,
          text: event.note || "Note",
        };
      }
      const title = event.event_kind === "void"
        ? "Entry undone"
        : event.event_kind === "result"
          ? "Game finished"
          : event.event_kind === "score"
            ? "Score recorded"
            : "Game moment";
      let detail = eventDetail(event, game);
      if (event.event_kind === "result" && isRecord(event.event_data) && Array.isArray(event.event_data._winner_participant_ids)) {
        const winners = event.event_data._winner_participant_ids
          .map((id) => typeof id === "string" ? participantById.get(id)?.label : null)
          .filter((label): label is string => Boolean(label));
        if (winners.length) detail = `${detail}${detail ? " · " : ""}Winner${winners.length > 1 ? "s" : ""}: ${winners.join(", ")}`;
      }
      return {
        id: `event-${event.id}`,
        kind: "event",
        occurredAt: event.occurred_at,
        author,
        title,
        detail: detail || (event.event_kind === "void" ? "The earlier moment remains visible but no longer affects totals." : null),
      };
    });
    const mediaEntries: GameLedgerReplayEntry[] = media
      .filter((item) => !item.deleted_at)
      .map((item) => ({
        id: `media-${item.id}`,
        kind: item.media_kind,
        occurredAt: item.captured_at,
        mediaUrl: item.signed_url,
        caption: item.caption,
        durationSeconds: item.duration_ms == null ? null : item.duration_ms / 1_000,
        transfer: item.transfer ?? { status: "ready" as const },
      } as GameLedgerReplayPhoto | GameLedgerReplayVideo));
    return [...eventEntries, ...mediaEntries];
  }, [game, media, participantById, sortedEvents]);

  async function submitMoment(event: FormEvent) {
    event.preventDefault();
    const missingField = missingRequiredField(profile.event_fields, fieldDraft);
    if (missingField) {
      setLocalError(`${missingField.label} is required.`);
      return;
    }
    const values = Object.fromEntries(
      profile.counters
        .map((counter) => [counter.id, counterDraft[counter.id]] as const)
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([id, value]) => [id, Number(value)]),
    );
    const fields = cleanFieldValues(profile.event_fields, fieldDraft);
    if (Object.keys(values).length === 0 && Object.keys(fields).length === 0 && !note.trim()) {
      setLocalError("Add a counter value, field or note for this moment.");
      return;
    }
    const hasParticipantValue = participantCounters.some((counter) => Object.hasOwn(values, counter.id));
    if (hasParticipantValue && !selectedParticipantId) {
      setLocalError("Choose who this score belongs to.");
      return;
    }
    setLocalError(null);
    try {
      await onAppendEvent({
        gameId: game.id,
        participantId: selectedParticipantId,
        kind: Object.keys(values).length ? "score" : note.trim() && Object.keys(fields).length === 0 ? "note" : "moment",
        values,
        fields,
        note: note.trim(),
      });
      setCounterDraft({});
      setFieldDraft({});
      setNote("");
      if (sortedParticipants.length > 1 && selectedParticipantId) {
        const index = sortedParticipants.findIndex((participant) => participant.id === selectedParticipantId);
        setSelectedParticipantId(sortedParticipants[(index + 1) % sortedParticipants.length].id);
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "That moment could not be saved.");
    }
  }

  async function finish(event: FormEvent) {
    event.preventDefault();
    const missingField = missingRequiredField(profile.result_fields, resultDraft);
    if (missingField) {
      setLocalError(`${missingField.label} is required.`);
      return;
    }
    setLocalError(null);
    try {
      const cleanedResult = cleanFieldValues(profile.result_fields, resultDraft);
      let finalOutcome = outcome === "draw" && profile.result?.allow_draw === false ? "completed" : outcome;
      let finalWinnerIds = profile.result?.mode === "none" || finalOutcome === "draw" || finalOutcome === "abandoned"
        ? []
        : winnerParticipantIds;
      if (profile.result?.allow_multiple_winners !== true) finalWinnerIds = finalWinnerIds.slice(0, 1);
      if (profile.preset === "chess") {
        const chessResult = cleanedResult.result;
        const white = sortedParticipants.find((participant, index) => participantRole(participant, profile.participant?.roles?.[index])?.id === "white")
          ?? sortedParticipants[0];
        const black = sortedParticipants.find((participant, index) => participantRole(participant, profile.participant?.roles?.[index])?.id === "black")
          ?? sortedParticipants[1];
        if (chessResult === "1–0") {
          finalOutcome = "completed";
          finalWinnerIds = white ? [white.id] : [];
        } else if (chessResult === "0–1") {
          finalOutcome = "completed";
          finalWinnerIds = black ? [black.id] : [];
        } else if (chessResult === "½–½") {
          finalOutcome = "draw";
          finalWinnerIds = [];
        } else {
          finalOutcome = "custom";
          finalWinnerIds = [];
        }
      }
      await onFinishGame({
        gameId: game.id,
        result: {
          ...cleanedResult,
          _outcome: finalOutcome,
          _winner_participant_ids: finalWinnerIds,
        },
        note: finishNote.trim(),
      });
      setShowFinish(false);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "The game could not be finished.");
    }
  }

  const lastUndoable = [...sortedEvents].reverse().find((event) =>
    !["void", "result"].includes(event.event_kind) && !voidedEventIds.has(event.id),
  );

  const suggestedWinnerIds = useMemo(() => {
    if (profile.result?.mode !== "derived") return [];
    const counter = profile.counters.find((candidate) => candidate.id === profile.result?.winner_counter_id);
    return counter ? winnerIdsForCounter(counter, totals) : [];
  }, [profile, totals]);

  async function addReplayNote(draft: { text: string; occurredAt: string }) {
    await onAppendEvent({ gameId: game.id, kind: "note", note: draft.text, occurredAt: draft.occurredAt });
  }

  async function addReplayMedia(capture: GameLedgerReplayCapture, kind: "photo" | "video") {
    await onUploadMedia(game.id, kind, capture.file, capture.capturedAt, capture.durationSeconds);
  }

  async function deleteReplayMedia(entry: GameLedgerReplayPhoto | GameLedgerReplayVideo) {
    const id = entry.id.replace(/^media-/, "");
    const item = media.find((candidate) => candidate.id === id);
    if (!item) throw new Error("That media item could not be found.");
    await onDeleteMedia(item);
  }

  return (
    <div className={styles.sessionStack}>
      <button className={styles.backButton} type="button" onClick={onBack}>
        <ArrowLeft size={17} aria-hidden="true" /> All games
      </button>

      <section className={styles.gameHero}>
        <div className={styles.gameHeroMeta}>
          <span className={game.status === "complete" ? styles.completeStatus : styles.liveStatus}>
            {game.status === "complete" ? <CheckCircle2 size={14} aria-hidden="true" /> : <span aria-hidden="true" />}
            {workflowStatusLabel(game.status)}
          </span>
          <span>{formatDateTime(game.started_at)}{game.location ? ` · ${game.location}` : ""}</span>
        </div>
        <h2>{game.title}</h2>
        <p>{profile.name}{profile.preset ? ` · started from ${profile.preset.replace(/_/g, " ")}` : ""}</p>
      </section>

      {(profile.participant?.roles?.length ?? 0) > 0 && (
        <div className={styles.roleSummary} aria-label="Participant roles">
          {sortedParticipants.map((participant, index) => {
            const role = participantRole(participant, profile.participant?.roles?.[index]);
            return <span key={participant.id}><strong>{role?.label ?? `Seat ${participant.seat}`}:</strong> {participant.label}</span>;
          })}
        </div>
      )}

      {profile.counters.length > 0 ? (
        <section className={styles.scoreboard} aria-label="Running totals">
          {gameCounters.length > 0 && (
            <div className={styles.gameCounterStrip}>
              <span>Whole game</span>
              <div className={styles.counterValues}>
                {gameCounters.map((counter) => {
                  const value = totals.get(GAME_COUNTER_OWNER)?.[counter.id] ?? counter.initial ?? 0;
                  const reached = hasReachedTarget(counter, value);
                  return (
                    <div key={counter.id}>
                      <strong>{formatNumber(value)}</strong>
                      <small>{counter.label}{counter.unit ? ` · ${counter.unit}` : ""}{counter.target ? ` · target ${counter.target.operator} ${formatNumber(counter.target.value)}` : ""}</small>
                      {reached && <i><Sparkles size={12} aria-hidden="true" /> target reached</i>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {participantCounters.length > 0 && sortedParticipants.map((participant) => (
            <button
              className={selectedParticipantId === participant.id ? styles.scoreCardSelected : styles.scoreCard}
              type="button"
              key={participant.id}
              onClick={() => setSelectedParticipantId(participant.id)}
              aria-pressed={selectedParticipantId === participant.id}
            >
              <span>{participant.label}</span>
              <div className={styles.counterValues}>
                {participantCounters.map((counter) => {
                  const value = totals.get(participant.id)?.[counter.id] ?? counter.initial ?? 0;
                  const reached = hasReachedTarget(counter, value);
                  return (
                    <div key={counter.id}>
                      <strong>{formatNumber(value)}</strong>
                      <small>{counter.label}{counter.unit ? ` · ${counter.unit}` : ""}{counter.target ? ` · target ${counter.target.operator} ${formatNumber(counter.target.value)}` : ""}</small>
                      {counter.target?.operator === ">=" && counter.target.value > 0 && (
                        <progress max={counter.target.value} value={Math.max(0, Math.min(value, counter.target.value))} aria-label={`${counter.label}: ${value} of ${counter.target.value}`} />
                      )}
                      {reached && <i><Sparkles size={12} aria-hidden="true" /> target reached</i>}
                    </div>
                  );
                })}
              </div>
            </button>
          ))}
        </section>
      ) : (
        <div className={styles.journalBanner}><Sparkles size={18} aria-hidden="true" /> This game is a journal: log moments, notes, photos and clips without forcing a score.</div>
      )}

      {cribbageCounter && cribbageTrackTarget && (
        <CribbageTrack participants={sortedParticipants} totals={totals} counterId={cribbageCounter.id} target={cribbageTrackTarget} />
      )}

      {game.status === "in_progress" && (
        <section className={styles.entryCard} aria-labelledby="add-game-moment-heading">
          <div className={styles.entryHeading}>
            <div>
              <p className={styles.kicker}>Moment {sortedEvents.filter((event) => event.event_kind !== "void").length + 1}</p>
              <h3 id="add-game-moment-heading">Add what just happened</h3>
            </div>
            <button
              className={styles.smallButton}
              type="button"
              disabled={busy || !lastUndoable}
              onClick={() => lastUndoable && void onVoidEvent(game.id, lastUndoable.id)}
            >
              <RotateCcw size={15} aria-hidden="true" /> Undo last
            </button>
          </div>

          <form className={styles.entryForm} onSubmit={submitMoment}>
            {sortedParticipants.length > 0 && (
              <fieldset className={styles.quickParticipants}>
                <legend>{profile.counters.length ? "Who scored?" : "Who is this about?"}</legend>
                {sortedParticipants.map((participant) => (
                  <label className={selectedParticipantId === participant.id ? styles.quickParticipantSelected : styles.quickParticipant} key={participant.id}>
                    <input
                      type="radio"
                      name="event-participant"
                      value={participant.id}
                      checked={selectedParticipantId === participant.id}
                      onChange={() => setSelectedParticipantId(participant.id)}
                    />
                    {participant.label}
                  </label>
                ))}
              </fieldset>
            )}
            {profile.counters.length > 0 && (
              <div className={styles.dynamicGrid}>
                {profile.counters.map((counter) => (
                  <label key={counter.id}>
                    <span>{counter.aggregation === "sum" ? "Add" : "Record"} {counter.label}{counter.scope === "game" ? <em> whole game</em> : null}{counter.unit ? <em> {counter.unit}</em> : null}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step={counter.value_type === "integer" ? "1" : "any"}
                      value={counterDraft[counter.id] ?? ""}
                      onChange={(event) => setCounterDraft((current) => ({ ...current, [counter.id]: event.target.value }))}
                      placeholder="0"
                    />
                    {(counter.input?.quick_values?.length ?? 0) > 0 && (
                      <span className={styles.quickValues} aria-label={`Quick ${counter.label} values`}>
                        {counter.input!.quick_values!.map((quickValue) => (
                          <button
                            type="button"
                            key={quickValue}
                            onClick={() => setCounterDraft((current) => ({ ...current, [counter.id]: String(quickValue) }))}
                          >
                            {quickValue > 0 && counter.aggregation === "sum" ? "+" : ""}{quickValue}
                          </button>
                        ))}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
            {profile.event_fields.length > 0 && (
              <div className={styles.dynamicGrid}>
                {profile.event_fields.map((field) => (
                  <FieldInput
                    field={field}
                    key={field.id}
                    value={fieldDraft[field.id]}
                    onChange={(value) => setFieldDraft((current) => ({ ...current, [field.id]: value }))}
                  />
                ))}
              </div>
            )}
            <label>
              <span>Note <em>optional</em></span>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1_000} placeholder="The story behind this moment" />
            </label>
            {localError && <div className={styles.inlineError} role="alert">{localError}</div>}
            <button className={styles.primaryButton} type="submit" disabled={busy}>Save moment</button>
          </form>
        </section>
      )}

      <GameLedgerReplayView
        session={{
          id: game.id,
          title: game.title,
          startedAt: game.started_at,
          endedAt: game.ended_at,
          status: game.status,
          subtitle: game.location,
        }}
        entries={replayEntries}
        onAddPhoto={(capture) => addReplayMedia(capture, "photo")}
        onAddVideo={(capture) => addReplayMedia(capture, "video")}
        onAddNote={game.status === "in_progress" ? (draft) => addReplayNote(draft) : undefined}
        onDeleteMedia={deleteReplayMedia}
        disabled={busy}
        limits={{ maxVideoBytes: 45 * 1024 * 1024, maxVideoSeconds: 60, maxImageBytes: 12 * 1024 * 1024, maxMediaItems: 20 }}
        privacyNotice={<>Photos and clips stay in private account-isolated storage. Nothing records in the background. Only a metadata-free copy of a photo you explicitly choose to analyze is sent to the configured AI service.</>}
      />

      {game.status === "in_progress" && !showFinish && (
        <button className={styles.finishButton} type="button" onClick={() => {
          const suggestedDraw = suggestedWinnerIds.length > 1;
          const drawAllowed = profile.result?.allow_draw !== false;
          const coWinnersAllowed = profile.result?.allow_multiple_winners === true;
          setWinnerParticipantIds(suggestedDraw
            ? drawAllowed ? [] : coWinnersAllowed ? suggestedWinnerIds : []
            : suggestedWinnerIds);
          setOutcome(suggestedDraw && drawAllowed ? "draw" : "completed");
          setShowFinish(true);
        }}>
          <Flag size={17} aria-hidden="true" /> Finish this game
        </button>
      )}

      {game.status === "in_progress" && showFinish && (
        <section className={styles.finishCard} aria-labelledby="finish-game-heading">
          <div className={styles.entryHeading}>
            <div><p className={styles.kicker}>Final record</p><h3 id="finish-game-heading">Finish {game.title}</h3></div>
            <button className={styles.secondaryButton} type="button" onClick={() => setShowFinish(false)}>Cancel</button>
          </div>
          <form className={styles.entryForm} onSubmit={finish}>
            {profile.result?.mode !== "none" && profile.preset !== "chess" && (
              <div className={styles.resultControls}>
                <label>
                  <span>Outcome</span>
                  <select value={outcome} onChange={(event) => {
                    const nextOutcome = event.target.value;
                    setOutcome(nextOutcome);
                    if (nextOutcome === "draw" || nextOutcome === "abandoned") setWinnerParticipantIds([]);
                  }}>
                    <option value="completed">Completed</option>
                    {profile.result?.allow_draw !== false && <option value="draw">Draw</option>}
                    <option value="abandoned">Abandoned</option>
                    <option value="custom">Other</option>
                  </select>
                </label>
                {outcome !== "draw" && outcome !== "abandoned" && sortedParticipants.length > 0 && (
                  <fieldset className={styles.winnerPicker}>
                    <legend>Winner <span>optional</span></legend>
                    {sortedParticipants.map((participant) => (
                      <label key={participant.id}>
                        <input
                          type={profile.result?.allow_multiple_winners === true ? "checkbox" : "radio"}
                          name={profile.result?.allow_multiple_winners === true ? undefined : "winner-participant"}
                          checked={winnerParticipantIds.includes(participant.id)}
                          onChange={() => setWinnerParticipantIds((current) => profile.result?.allow_multiple_winners !== true
                            ? [participant.id]
                            : current.includes(participant.id)
                              ? current.filter((id) => id !== participant.id)
                              : [...current, participant.id])}
                        />
                        {participant.label}
                      </label>
                    ))}
                  </fieldset>
                )}
              </div>
            )}
            {profile.result_fields.length > 0 && (
              <div className={styles.dynamicGrid}>
                {profile.result_fields.map((field) => (
                  <FieldInput
                    field={field}
                    key={field.id}
                    value={resultDraft[field.id]}
                    onChange={(value) => setResultDraft((current) => ({ ...current, [field.id]: value }))}
                  />
                ))}
              </div>
            )}
            <label>
              <span>Final note <em>optional</em></span>
              <textarea value={finishNote} onChange={(event) => setFinishNote(event.target.value)} maxLength={1_000} placeholder="How did it end?" />
            </label>
            <button className={styles.primaryButton} type="submit" disabled={busy}>Save result and finish</button>
          </form>
        </section>
      )}

      <p className={styles.provenanceNote}>Totals are derived from the chronological event rows above. Undo adds a visible void event; it never rewrites what happened.</p>
      <p className={styles.srOnly}>Known entities: {entities.map((entity) => entity.name).join(", ")}</p>
    </div>
  );
}
