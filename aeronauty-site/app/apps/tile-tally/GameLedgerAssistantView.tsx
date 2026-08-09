"use client";

import {
  AlertTriangle,
  BrainCircuit,
  Camera,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  Plus,
  RotateCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { normaliseGameProfile } from "@/lib/tiletally/gameProfiles";
import type {
  ChessPieceObservation,
  CribbagePegObservation,
  CustomBoardFact,
  GameLedgerAiChatMessage,
  GameLedgerAiChatProposal,
  GameLedgerAiCommand,
  GameLedgerAiApplyResponse,
  GameLedgerAiFieldUpdate,
  GameLedgerBoardMode,
  GameLedgerBoardObservation,
  GameLedgerVisionProposal,
  WordTileObservation,
  WordTileRackObservation,
} from "@/lib/tiletally/gameLedgerAiTypes";
import type { GameLedgerField, JsonValue } from "@/lib/tiletally/types";
import type {
  LedgerEvent,
  LedgerGame,
  LedgerParticipant,
} from "./gameLedgerTypes";
import styles from "./game-ledger-assistant.module.css";

const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_NORMALIZED_DIMENSION = 2_048;
const NORMALIZED_JPEG_QUALITY = 0.86;
const MAX_CHAT_MESSAGE_CHARS = 2_500;
const MAX_CHAT_MESSAGES = 20;
const MAX_CHAT_TOTAL_CHARS = 14_000;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type Props = {
  accessToken: string;
  games: LedgerGame[];
  participants: LedgerParticipant[];
  events: LedgerEvent[];
  busy: boolean;
  onUploadMedia: (
    gameId: string,
    kind: "photo" | "video",
    file: File,
    capturedAt: string,
    durationSeconds?: number,
    timestampKind?: "captured_at" | "imported_at",
  ) => Promise<string>;
  onRefresh: () => Promise<boolean>;
};

type UiMessage = GameLedgerAiChatMessage & { id: string };

type StagedPhoto = {
  file: File;
  previewUrl: string;
  mediaId: string | null;
  importedAt: string;
  sourceName: string;
};

type ApiErrorPayload = { error?: unknown };

class AssistantHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AssistantHttpError";
    this.status = status;
  }
}

const BOARD_MODE_OPTIONS: Array<{ value: GameLedgerBoardMode; label: string }> = [
  { value: "auto", label: "Automatic from this game" },
  { value: "cribbage", label: "Cribbage board" },
  { value: "chess", label: "Chess board" },
  { value: "word_tiles", label: "Word-tile board" },
  { value: "custom", label: "Custom board" },
];

const CHESS_COLORS: ChessPieceObservation["color"][] = ["white", "black", "unknown"];
const CHESS_PIECES: ChessPieceObservation["piece"][] = [
  "king",
  "queen",
  "rook",
  "bishop",
  "knight",
  "pawn",
  "unknown",
];

const CHESS_FEN_PIECES: Record<Exclude<ChessPieceObservation["piece"], "unknown">, string> = {
  king: "k",
  queen: "q",
  rook: "r",
  bishop: "b",
  knight: "n",
  pawn: "p",
};

function piecePlacementFromPieces(pieces: ChessPieceObservation[]): string | null {
  if (!pieces.length) return null;
  const bySquare = new Map<string, string>();
  for (const piece of pieces) {
    if (!/^[a-h][1-8]$/.test(piece.square) || piece.color === "unknown" || piece.piece === "unknown") {
      return null;
    }
    const letter = CHESS_FEN_PIECES[piece.piece];
    if (bySquare.has(piece.square)) return null;
    bySquare.set(piece.square, piece.color === "white" ? letter.toUpperCase() : letter);
  }

  const ranks: string[] = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let empty = 0;
    let value = "";
    for (let file = 0; file < 8; file += 1) {
      const square = `${String.fromCharCode(97 + file)}${rank}`;
      const piece = bySquare.get(square);
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty) value += String(empty);
      value += piece;
      empty = 0;
    }
    if (empty) value += String(empty);
    ranks.push(value);
  }
  return ranks.join("/");
}

function randomId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function message(role: UiMessage["role"], content: string, id = randomId()): UiMessage {
  return { id, role, content };
}

function welcomeMessage(game?: LedgerGame | null) {
  return message(
    "assistant",
    game
      ? `I can help update ${game.title}, read a board photo, or answer questions from its ledger. I will show every proposed change before anything is applied.`
      : "Choose a game and I can help update it, read a board photo, or answer questions from its ledger.",
    "welcome",
  );
}

function chatRequestMessages(messages: UiMessage[]): GameLedgerAiChatMessage[] {
  const requestMessages: GameLedgerAiChatMessage[] = [];
  let totalCharacters = 0;
  const candidates = messages
    .filter((item) => item.id !== "welcome")
    .map(({ role, content }) => ({ role, content: content.slice(0, MAX_CHAT_MESSAGE_CHARS) }));

  for (let index = candidates.length - 1; index >= 0 && requestMessages.length < MAX_CHAT_MESSAGES; index -= 1) {
    const candidate = candidates[index];
    if (!candidate.content.trim() || totalCharacters + candidate.content.length > MAX_CHAT_TOTAL_CHARS) continue;
    requestMessages.unshift(candidate);
    totalCharacters += candidate.content.length;
  }
  return requestMessages;
}

function defaultGameId(games: LedgerGame[]) {
  return games.find((game) => game.status !== "complete")?.id ?? games[0]?.id ?? "";
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

async function postJson<T>(path: string, accessToken: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & ApiErrorPayload;
  if (!response.ok) {
    throw new AssistantHttpError(
      response.status,
      typeof data.error === "string" ? data.error : "The Game Ledger assistant could not complete that request.",
    );
  }
  return data;
}

function nullableNumber(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function confidenceLabel(value: number) {
  const percentage = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return percentage < 70 ? `Needs review · ${percentage}% confidence` : `${percentage}% confidence`;
}

function readableId(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function lastEventSeq(events: LedgerEvent[], gameId: string) {
  return events.reduce((highest, event) => event.game_id === gameId ? Math.max(highest, event.seq) : highest, 0);
}

function basisIsCurrent(
  basis: GameLedgerAiChatProposal["basis"] | GameLedgerVisionProposal["basis"],
  game: LedgerGame,
  events: LedgerEvent[],
) {
  return basis.game_id === game.id
    && basis.game_updated_at === game.updated_at
    && basis.last_event_seq === lastEventSeq(events, game.id);
}

function gameBoardHint(game: LedgerGame | null) {
  if (!game) return "Choose a game first.";
  const preset = normaliseGameProfile(game.definition).preset;
  if (preset === "cribbage") return "Automatic will use the Cribbage reader.";
  if (preset === "chess") return "Automatic will use the Chess reader.";
  if (preset === "word_tiles") return "Automatic will use the word-tile reader.";
  return "Automatic will inspect the board and use your game definition as context.";
}

function normalizedFileName(originalName: string) {
  const stem = originalName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "board";
  return `${stem}-analysis.jpg`;
}

async function decodeImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The selected image could not be decoded."));
      image.src = objectUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("The selected image has no readable dimensions.");
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function normalizeBoardPhoto(file: File): Promise<File> {
  const image = await decodeImage(file);
  const scale = Math.min(1, MAX_NORMALIZED_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("This browser could not prepare the image for analysis.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", NORMALIZED_JPEG_QUALITY));
  if (!blob?.size) throw new Error("This browser could not export a safe analysis copy of the image.");
  return new File([blob], normalizedFileName(file.name), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function jsonValueForInput(value: JsonValue) {
  if (value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function scalarValue(raw: string, current: JsonValue, field?: GameLedgerField): JsonValue {
  if (field?.type === "number" || typeof current === "number") {
    const number = Number(raw);
    return Number.isFinite(number) ? number : 0;
  }
  if (field?.type === "boolean" || typeof current === "boolean") return raw === "true";
  if (typeof current === "object" && current !== null) {
    try {
      return JSON.parse(raw) as JsonValue;
    } catch {
      return raw;
    }
  }
  return raw;
}

function FieldValueEditor({
  update,
  field,
  onChange,
}: {
  update: GameLedgerAiFieldUpdate;
  field?: GameLedgerField;
  onChange: (value: JsonValue) => void;
}) {
  const label = field?.label ?? readableId(update.field_id);
  if (field?.type === "boolean" || typeof update.value === "boolean") {
    return (
      <label>
        <span>{label}</span>
        <select value={String(update.value)} onChange={(event) => onChange(event.currentTarget.value === "true")}>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </label>
    );
  }
  if (field?.type === "select" && field.options?.length) {
    return (
      <label>
        <span>{label}</span>
        <select value={String(update.value)} onChange={(event) => onChange(event.currentTarget.value)}>
          {field.options.map((option) => <option value={option} key={option}>{option}</option>)}
        </select>
      </label>
    );
  }
  const objectValue = typeof update.value === "object" && update.value !== null;
  return (
    <label>
      <span>{label}</span>
      {objectValue ? (
        <textarea
          rows={3}
          value={jsonValueForInput(update.value)}
          onChange={(event) => onChange(scalarValue(event.currentTarget.value, update.value, field))}
        />
      ) : (
        <input
          type={field?.type === "number" || typeof update.value === "number" ? "number" : "text"}
          inputMode={field?.type === "number" || typeof update.value === "number" ? "decimal" : undefined}
          step="any"
          value={jsonValueForInput(update.value)}
          onChange={(event) => onChange(scalarValue(event.currentTarget.value, update.value, field))}
        />
      )}
    </label>
  );
}

function CommandEditor({
  command,
  game,
  participants,
  enabled,
  onEnabledChange,
  onChange,
}: {
  command: GameLedgerAiCommand;
  game: LedgerGame;
  participants: LedgerParticipant[];
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onChange: (command: GameLedgerAiCommand) => void;
}) {
  const profile = normaliseGameProfile(game.definition);
  const gameParticipants = participants.filter((participant) => participant.game_id === game.id).sort((a, b) => a.seat - b.seat);
  const fieldDefinitions = command.type === "append_event" ? profile.event_fields : profile.result_fields;
  const fieldById = new Map(fieldDefinitions.map((field) => [field.id, field]));

  function updateField(index: number, value: JsonValue) {
    if (command.type === "append_event") {
      const fieldUpdates = command.field_updates.map((field, candidateIndex) => candidateIndex === index ? { ...field, value } : field);
      onChange({ ...command, field_updates: fieldUpdates });
      return;
    }
    const resultFields = command.result_fields.map((field, candidateIndex) => candidateIndex === index ? { ...field, value } : field);
    onChange({ ...command, result_fields: resultFields });
  }

  return (
    <article className={`${styles.commandCard} ${!enabled ? styles.commandDisabled : ""}`}>
      <label className={styles.commandToggle}>
        <input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.currentTarget.checked)} />
        <span>{command.type === "append_event" ? "Add a game moment" : "Finish this game"}</span>
      </label>
      <p className={styles.explanation}>{command.explanation}</p>

      {command.type === "append_event" ? (
        <div className={styles.editorGrid} aria-disabled={!enabled}>
          <label>
            <span>Participant</span>
            <select
              disabled={!enabled}
              value={command.participant_id ?? ""}
              onChange={(event) => onChange({ ...command, participant_id: event.currentTarget.value || null })}
            >
              <option value="">Whole game / no participant</option>
              {gameParticipants.map((participant) => <option value={participant.id} key={participant.id}>{participant.label}</option>)}
            </select>
          </label>
          <label>
            <span>Moment type</span>
            <select
              disabled={!enabled}
              value={command.event_kind}
              onChange={(event) => onChange({ ...command, event_kind: event.currentTarget.value as typeof command.event_kind })}
            >
              <option value="score">Score</option>
              <option value="moment">Moment</option>
              <option value="note">Note</option>
            </select>
          </label>
          {command.counter_updates.map((counterUpdate, index) => {
            const counter = profile.counters.find((candidate) => candidate.id === counterUpdate.counter_id);
            return (
              <label key={`${counterUpdate.counter_id}-${index}`}>
                <span>{counter?.aggregation === "sum" ? "Add " : "Record "}{counter?.label ?? readableId(counterUpdate.counter_id)}</span>
                <input
                  disabled={!enabled}
                  type="number"
                  inputMode="decimal"
                  step={counter?.value_type === "integer" ? 1 : "any"}
                  value={counterUpdate.value}
                  onChange={(event) => {
                    const value = Number(event.currentTarget.value);
                    const counterUpdates = command.counter_updates.map((candidate, candidateIndex) => candidateIndex === index
                      ? { ...candidate, value: Number.isFinite(value) ? value : 0 }
                      : candidate);
                    onChange({ ...command, counter_updates: counterUpdates });
                  }}
                />
              </label>
            );
          })}
          {command.field_updates.map((fieldUpdate, index) => (
            <FieldValueEditor
              key={`${fieldUpdate.field_id}-${index}`}
              update={fieldUpdate}
              field={fieldById.get(fieldUpdate.field_id)}
              onChange={(value) => updateField(index, value)}
            />
          ))}
          <label className={styles.wideField}>
            <span>Note <em>optional</em></span>
            <textarea
              disabled={!enabled}
              maxLength={2_000}
              rows={3}
              value={command.note ?? ""}
              onChange={(event) => onChange({ ...command, note: event.currentTarget.value || null })}
            />
          </label>
        </div>
      ) : (
        <div className={styles.editorGrid} aria-disabled={!enabled}>
          <label>
            <span>Outcome</span>
            <select
              disabled={!enabled}
              value={command.outcome}
              onChange={(event) => onChange({ ...command, outcome: event.currentTarget.value as typeof command.outcome })}
            >
              <option value="completed">Completed</option>
              <option value="draw">Draw</option>
              <option value="abandoned">Abandoned</option>
              <option value="other">Other</option>
            </select>
          </label>
          <fieldset className={styles.winnerPicker} disabled={!enabled || command.outcome === "draw" || command.outcome === "abandoned"}>
            <legend>Winner or winners</legend>
            {gameParticipants.map((participant) => (
              <label key={participant.id}>
                <input
                  type="checkbox"
                  checked={command.winner_participant_ids.includes(participant.id)}
                  onChange={() => onChange({
                    ...command,
                    winner_participant_ids: command.winner_participant_ids.includes(participant.id)
                      ? command.winner_participant_ids.filter((id) => id !== participant.id)
                      : [...command.winner_participant_ids, participant.id],
                  })}
                />
                {participant.label}
              </label>
            ))}
          </fieldset>
          {command.result_fields.map((fieldUpdate, index) => (
            <FieldValueEditor
              key={`${fieldUpdate.field_id}-${index}`}
              update={fieldUpdate}
              field={fieldById.get(fieldUpdate.field_id)}
              onChange={(value) => updateField(index, value)}
            />
          ))}
          <label className={styles.wideField}>
            <span>Final note <em>optional</em></span>
            <textarea
              disabled={!enabled}
              maxLength={2_000}
              rows={3}
              value={command.note ?? ""}
              onChange={(event) => onChange({ ...command, note: event.currentTarget.value || null })}
            />
          </label>
        </div>
      )}
    </article>
  );
}

function CribbageReview({
  observation,
  participants,
  gameId,
  onChange,
}: {
  observation: GameLedgerBoardObservation;
  participants: LedgerParticipant[];
  gameId: string;
  onChange: (observation: GameLedgerBoardObservation) => void;
}) {
  const gameParticipants = participants.filter((participant) => participant.game_id === gameId).sort((a, b) => a.seat - b.seat);

  function setTrack(index: number, patch: Partial<CribbagePegObservation>) {
    onChange({
      ...observation,
      cribbage: {
        ...observation.cribbage,
        tracks: observation.cribbage.tracks.map((track, candidateIndex) => candidateIndex === index
          ? { ...track, ...patch, confidence: 1 }
          : track),
      },
    });
  }

  return (
    <section className={styles.boardSection} aria-labelledby="cribbage-reading-heading">
      <div className={styles.sectionHeading}>
        <div><p className={styles.kicker}>Cribbage</p><h4 id="cribbage-reading-heading">Peg positions</h4></div>
        <button
          className={styles.smallButton}
          type="button"
          onClick={() => onChange({
            ...observation,
            cribbage: {
              ...observation.cribbage,
              tracks: [...observation.cribbage.tracks, {
                track_label: `Track ${observation.cribbage.tracks.length + 1}`,
                participant_id: null,
                score: null,
                front_peg: null,
                rear_peg: null,
                confidence: 1,
                note: null,
              }],
            },
          })}
        ><Plus size={16} aria-hidden="true" /> Add track</button>
      </div>
      <label className={styles.compactField}>
        <span>Board target</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={observation.cribbage.target ?? ""}
          onChange={(event) => onChange({ ...observation, cribbage: { ...observation.cribbage, target: nullableNumber(event.currentTarget.value) } })}
        />
      </label>
      <div className={styles.editList}>
        {observation.cribbage.tracks.map((track, index) => (
          <article className={styles.editRow} key={`${track.track_label}-${index}`}>
            <div className={styles.rowMeta}>
              <span className={track.confidence < 0.7 ? styles.needsReview : styles.confidence}>{confidenceLabel(track.confidence)}</span>
              <button
                className={styles.iconButton}
                type="button"
                onClick={() => onChange({ ...observation, cribbage: { ...observation.cribbage, tracks: observation.cribbage.tracks.filter((_item, itemIndex) => itemIndex !== index) } })}
                aria-label={`Remove ${track.track_label}`}
              ><Trash2 size={17} aria-hidden="true" /></button>
            </div>
            <div className={styles.editorGrid}>
              <label><span>Track label</span><input value={track.track_label} onChange={(event) => setTrack(index, { track_label: event.currentTarget.value })} /></label>
              <label>
                <span>Participant</span>
                <select value={track.participant_id ?? ""} onChange={(event) => setTrack(index, { participant_id: event.currentTarget.value || null })}>
                  <option value="">Not assigned</option>
                  {gameParticipants.map((participant) => <option value={participant.id} key={participant.id}>{participant.label}</option>)}
                </select>
              </label>
              <label><span>Score / position</span><input type="number" inputMode="numeric" min={0} value={track.score ?? ""} onChange={(event) => setTrack(index, { score: nullableNumber(event.currentTarget.value) })} /></label>
              <label><span>Front peg</span><input type="number" inputMode="numeric" min={0} value={track.front_peg ?? ""} onChange={(event) => setTrack(index, { front_peg: nullableNumber(event.currentTarget.value) })} /></label>
              <label><span>Rear peg</span><input type="number" inputMode="numeric" min={0} value={track.rear_peg ?? ""} onChange={(event) => setTrack(index, { rear_peg: nullableNumber(event.currentTarget.value) })} /></label>
              <label><span>Note</span><input value={track.note ?? ""} onChange={(event) => setTrack(index, { note: event.currentTarget.value || null })} /></label>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ChessReview({ observation, onChange }: { observation: GameLedgerBoardObservation; onChange: (observation: GameLedgerBoardObservation) => void }) {
  function setPieces(pieces: ChessPieceObservation[]) {
    onChange({
      ...observation,
      chess: {
        ...observation.chess,
        pieces,
        piece_placement: piecePlacementFromPieces(pieces),
      },
    });
  }

  function setPiece(index: number, patch: Partial<ChessPieceObservation>) {
    setPieces(observation.chess.pieces.map((piece, candidateIndex) => candidateIndex === index
      ? { ...piece, ...patch, confidence: 1 }
      : piece));
  }

  return (
    <section className={styles.boardSection} aria-labelledby="chess-reading-heading">
      <div className={styles.sectionHeading}>
        <div><p className={styles.kicker}>Chess</p><h4 id="chess-reading-heading">Position</h4></div>
        <button
          className={styles.smallButton}
          type="button"
          onClick={() => setPieces([...observation.chess.pieces, { square: "a1", color: "unknown", piece: "unknown", confidence: 1 }])}
        ><Plus size={16} aria-hidden="true" /> Add piece</button>
      </div>
      <div className={styles.editorGrid}>
        <label className={styles.wideField}>
          <span>Piece placement <em>FEN board field only</em></span>
          <input
            className={styles.monospaceInput}
            value={observation.chess.piece_placement ?? ""}
            readOnly
            placeholder="8/8/8/8/8/8/8/8"
          />
          <small>Calculated from the reviewed piece list. A photo cannot establish castling rights, en-passant, move clocks, or whose turn it is.</small>
        </label>
        <label>
          <span>Side to move <em>only if known</em></span>
          <select
            value={observation.chess.side_to_move}
            onChange={(event) => onChange({ ...observation, chess: { ...observation.chess, side_to_move: event.currentTarget.value as typeof observation.chess.side_to_move } })}
          >
            <option value="unknown">Unknown</option>
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
        </label>
      </div>
      <div className={styles.editList}>
        {observation.chess.pieces.map((piece, index) => (
          <article className={styles.pieceRow} key={`${piece.square}-${piece.color}-${piece.piece}-${index}`}>
            <span className={piece.confidence < 0.7 ? styles.needsReview : styles.confidence}>{confidenceLabel(piece.confidence)}</span>
            <label><span>Square</span><input pattern="[a-h][1-8]" maxLength={2} value={piece.square} onChange={(event) => setPiece(index, { square: event.currentTarget.value.toLowerCase() })} /></label>
            <label><span>Color</span><select value={piece.color} onChange={(event) => setPiece(index, { color: event.currentTarget.value as ChessPieceObservation["color"] })}>{CHESS_COLORS.map((color) => <option value={color} key={color}>{readableId(color)}</option>)}</select></label>
            <label><span>Piece</span><select value={piece.piece} onChange={(event) => setPiece(index, { piece: event.currentTarget.value as ChessPieceObservation["piece"] })}>{CHESS_PIECES.map((kind) => <option value={kind} key={kind}>{readableId(kind)}</option>)}</select></label>
            <button
              className={styles.iconButton}
              type="button"
              onClick={() => setPieces(observation.chess.pieces.filter((_item, itemIndex) => itemIndex !== index))}
              aria-label={`Remove ${piece.color} ${piece.piece} on ${piece.square}`}
            ><Trash2 size={17} aria-hidden="true" /></button>
          </article>
        ))}
      </div>
    </section>
  );
}

function WordTilesReview({
  observation,
  participants,
  gameId,
  onChange,
}: {
  observation: GameLedgerBoardObservation;
  participants: LedgerParticipant[];
  gameId: string;
  onChange: (observation: GameLedgerBoardObservation) => void;
}) {
  const gameParticipants = participants.filter((participant) => participant.game_id === gameId).sort((a, b) => a.seat - b.seat);

  function setTile(index: number, patch: Partial<WordTileObservation>) {
    onChange({
      ...observation,
      word_tiles: {
        ...observation.word_tiles,
        tiles: observation.word_tiles.tiles.map((tile, candidateIndex) => candidateIndex === index
          ? { ...tile, ...patch, confidence: 1 }
          : tile),
      },
    });
  }

  function setRack(index: number, patch: Partial<WordTileRackObservation>) {
    onChange({
      ...observation,
      word_tiles: {
        ...observation.word_tiles,
        racks: observation.word_tiles.racks.map((rack, candidateIndex) => candidateIndex === index
          ? { ...rack, ...patch, confidence: 1 }
          : rack),
      },
    });
  }

  return (
    <section className={styles.boardSection} aria-labelledby="word-tiles-reading-heading">
      <div className={styles.sectionHeading}>
        <div><p className={styles.kicker}>Word tiles</p><h4 id="word-tiles-reading-heading">Grid and tiles</h4></div>
        <button
          className={styles.smallButton}
          type="button"
          onClick={() => onChange({ ...observation, word_tiles: { ...observation.word_tiles, tiles: [...observation.word_tiles.tiles, { row: 1, column: 1, letter: "?", is_blank: false, confidence: 1 }] } })}
        ><Plus size={16} aria-hidden="true" /> Add tile</button>
      </div>
      <div className={styles.dimensionGrid}>
        <label><span>Rows</span><input type="number" inputMode="numeric" min={1} max={100} value={observation.word_tiles.rows ?? ""} onChange={(event) => onChange({ ...observation, word_tiles: { ...observation.word_tiles, rows: nullableNumber(event.currentTarget.value) } })} /></label>
        <label><span>Columns</span><input type="number" inputMode="numeric" min={1} max={100} value={observation.word_tiles.columns ?? ""} onChange={(event) => onChange({ ...observation, word_tiles: { ...observation.word_tiles, columns: nullableNumber(event.currentTarget.value) } })} /></label>
      </div>
      <div className={styles.editList}>
        {observation.word_tiles.tiles.map((tile, index) => (
          <article className={styles.tileRow} key={`${tile.row}-${tile.column}-${index}`}>
            <span className={tile.confidence < 0.7 ? styles.needsReview : styles.confidence}>{confidenceLabel(tile.confidence)}</span>
            <label><span>Row</span><input type="number" inputMode="numeric" min={1} max={100} value={tile.row} onChange={(event) => setTile(index, { row: Number(event.currentTarget.value) || 1 })} /></label>
            <label><span>Column</span><input type="number" inputMode="numeric" min={1} max={100} value={tile.column} onChange={(event) => setTile(index, { column: Number(event.currentTarget.value) || 1 })} /></label>
            <label><span>Letter</span><input maxLength={3} value={tile.letter} onChange={(event) => setTile(index, { letter: event.currentTarget.value.toUpperCase() })} /></label>
            <label className={styles.inlineCheck}><input type="checkbox" checked={tile.is_blank} onChange={(event) => setTile(index, { is_blank: event.currentTarget.checked })} />Blank</label>
            <button className={styles.iconButton} type="button" onClick={() => onChange({ ...observation, word_tiles: { ...observation.word_tiles, tiles: observation.word_tiles.tiles.filter((_item, itemIndex) => itemIndex !== index) } })} aria-label={`Remove tile at row ${tile.row}, column ${tile.column}`}><Trash2 size={17} aria-hidden="true" /></button>
          </article>
        ))}
      </div>

      {(observation.word_tiles.racks.length > 0) && (
        <div className={styles.rackList}>
          <h5>Visible racks</h5>
          {observation.word_tiles.racks.map((rack, index) => (
            <article className={styles.rackRow} key={`${rack.owner_label}-${index}`}>
              <label><span>Owner</span><input value={rack.owner_label} onChange={(event) => setRack(index, { owner_label: event.currentTarget.value })} /></label>
              <label><span>Participant</span><select value={rack.participant_id ?? ""} onChange={(event) => setRack(index, { participant_id: event.currentTarget.value || null })}><option value="">Not assigned</option>{gameParticipants.map((participant) => <option value={participant.id} key={participant.id}>{participant.label}</option>)}</select></label>
              <label><span>Letters</span><input value={rack.letters.join(" ")} onChange={(event) => setRack(index, { letters: event.currentTarget.value.toUpperCase().split(/\s+/).filter(Boolean).slice(0, 40) })} /></label>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CustomReview({ observation, onChange }: { observation: GameLedgerBoardObservation; onChange: (observation: GameLedgerBoardObservation) => void }) {
  function setFact(index: number, patch: Partial<CustomBoardFact>) {
    onChange({
      ...observation,
      custom: {
        facts: observation.custom.facts.map((fact, candidateIndex) => candidateIndex === index
          ? { ...fact, ...patch, confidence: 1 }
          : fact),
      },
    });
  }

  return (
    <section className={styles.boardSection} aria-labelledby="custom-reading-heading">
      <div className={styles.sectionHeading}>
        <div><p className={styles.kicker}>Custom board</p><h4 id="custom-reading-heading">Visible facts</h4></div>
        <button className={styles.smallButton} type="button" onClick={() => onChange({ ...observation, custom: { facts: [...observation.custom.facts, { label: "New fact", value: "", region: null, confidence: 1 }] } })}><Plus size={16} aria-hidden="true" /> Add fact</button>
      </div>
      <div className={styles.editList}>
        {observation.custom.facts.map((fact, index) => (
          <article className={styles.editRow} key={`${fact.label}-${index}`}>
            <div className={styles.rowMeta}>
              <span className={fact.confidence < 0.7 ? styles.needsReview : styles.confidence}>{confidenceLabel(fact.confidence)}</span>
              <button className={styles.iconButton} type="button" onClick={() => onChange({ ...observation, custom: { facts: observation.custom.facts.filter((_item, itemIndex) => itemIndex !== index) } })} aria-label={`Remove ${fact.label}`}><Trash2 size={17} aria-hidden="true" /></button>
            </div>
            <div className={styles.editorGrid}>
              <label><span>Label</span><input value={fact.label} onChange={(event) => setFact(index, { label: event.currentTarget.value })} /></label>
              <label><span>Region <em>optional</em></span><input value={fact.region ?? ""} onChange={(event) => setFact(index, { region: event.currentTarget.value || null })} /></label>
              <label className={styles.wideField}><span>Value</span><textarea rows={2} value={fact.value} onChange={(event) => setFact(index, { value: event.currentTarget.value })} /></label>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function VisionReview({
  observation,
  participants,
  game,
  onChange,
}: {
  observation: GameLedgerBoardObservation;
  participants: LedgerParticipant[];
  game: LedgerGame;
  onChange: (observation: GameLedgerBoardObservation) => void;
}) {
  return (
    <div className={styles.visionEditor}>
      <div className={styles.summaryEditor}>
        <label>
          <span>Summary</span>
          <textarea maxLength={2_000} rows={3} value={observation.summary} onChange={(event) => onChange({ ...observation, summary: event.currentTarget.value })} />
        </label>
        <label>
          <span>Photo orientation</span>
          <select value={observation.orientation} onChange={(event) => onChange({ ...observation, orientation: event.currentTarget.value as typeof observation.orientation })}>
            <option value="upright">Upright</option>
            <option value="rotated_left">Rotated left</option>
            <option value="rotated_right">Rotated right</option>
            <option value="upside_down">Upside down</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
      </div>
      {observation.warnings.length > 0 && (
        <div className={styles.warningBox} role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          <div><strong>Check these uncertainties</strong><ul>{observation.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div>
        </div>
      )}
      {observation.board_type === "cribbage" && <CribbageReview observation={observation} participants={participants} gameId={game.id} onChange={onChange} />}
      {observation.board_type === "chess" && <ChessReview observation={observation} onChange={onChange} />}
      {observation.board_type === "word_tiles" && <WordTilesReview observation={observation} participants={participants} gameId={game.id} onChange={onChange} />}
      {(observation.board_type === "custom" || observation.board_type === "unknown") && <CustomReview observation={observation} onChange={onChange} />}
    </div>
  );
}

export default function GameLedgerAssistantView({
  accessToken,
  games,
  participants,
  events,
  busy,
  onUploadMedia,
  onRefresh,
}: Props) {
  const [selectedGameId, setSelectedGameId] = useState(() => defaultGameId(games));
  const selectedGame = games.find((game) => game.id === selectedGameId) ?? null;
  const gameParticipants = useMemo(
    () => participants.filter((participant) => participant.game_id === selectedGameId).sort((a, b) => a.seat - b.seat),
    [participants, selectedGameId],
  );

  const [messages, setMessages] = useState<UiMessage[]>(() => [welcomeMessage(selectedGame)]);
  const [input, setInput] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [syncNeeded, setSyncNeeded] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [chatProposal, setChatProposal] = useState<GameLedgerAiChatProposal | null>(null);
  const [chatCommands, setChatCommands] = useState<GameLedgerAiCommand[]>([]);
  const [commandEnabled, setCommandEnabled] = useState<boolean[]>([]);

  const [boardMode, setBoardMode] = useState<GameLedgerBoardMode>("auto");
  const [customInstructions, setCustomInstructions] = useState("");
  const [normalizingPhoto, setNormalizingPhoto] = useState(false);
  const [photo, setPhoto] = useState<StagedPhoto | null>(null);
  const [visionProposal, setVisionProposal] = useState<GameLedgerVisionProposal | null>(null);
  const [visionDraft, setVisionDraft] = useState<GameLedgerBoardObservation | null>(null);
  const [rememberCorrections, setRememberCorrections] = useState(false);

  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const selectedGameRef = useRef(selectedGameId);
  const resetGameIdRef = useRef(selectedGameId);
  selectedGameRef.current = selectedGameId;

  useEffect(() => {
    if (selectedGameId && games.some((game) => game.id === selectedGameId)) return;
    setSelectedGameId(defaultGameId(games));
  }, [games, selectedGameId]);

  useEffect(() => {
    if (resetGameIdRef.current === selectedGameId) return;
    resetGameIdRef.current = selectedGameId;
    const game = games.find((candidate) => candidate.id === selectedGameId) ?? null;
    setMessages([welcomeMessage(game)]);
    setInput("");
    setChatProposal(null);
    setChatCommands([]);
    setCommandEnabled([]);
    setBoardMode("auto");
    setCustomInstructions("");
    setPhoto(null);
    setVisionProposal(null);
    setVisionDraft(null);
    setRememberCorrections(false);
    setRequestError(null);
    setStatusMessage(null);
  }, [games, selectedGameId]);

  useEffect(() => {
    const log = chatLogRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, requestBusy]);

  const previewUrl = photo?.previewUrl;
  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const working = busy || requestBusy || applyBusy || normalizingPhoto || syncNeeded;
  const selectedCommandCount = commandEnabled.filter(Boolean).length;
  const chatProposalCurrent = Boolean(chatProposal && selectedGame && basisIsCurrent(chatProposal.basis, selectedGame, events));
  const visionProposalCurrent = Boolean(visionProposal && selectedGame && basisIsCurrent(visionProposal.basis, selectedGame, events));

  function clearChatProposal() {
    setChatProposal(null);
    setChatCommands([]);
    setCommandEnabled([]);
    setRequestError(null);
  }

  function clearVisionProposal(clearStagedPhoto = false) {
    setVisionProposal(null);
    setVisionDraft(null);
    setRememberCorrections(false);
    setRequestError(null);
    if (clearStagedPhoto) setPhoto(null);
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || !selectedGame || requestBusy || applyBusy || syncNeeded) return;
    const userMessage = message("user", content);
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setRequestBusy(true);
    setRequestError(null);
    setStatusMessage(null);
    try {
      const proposal = await postJson<GameLedgerAiChatProposal>("/api/tile-tally/chat", accessToken, {
        gameId: selectedGame.id,
        messages: chatRequestMessages(nextMessages),
      });
      if (selectedGameRef.current !== selectedGame.id) return;
      setMessages((current) => [...current, message("assistant", proposal.reply)]);
      if (proposal.commands.length > 0) {
        setChatProposal(proposal);
        setChatCommands(cloneValue(proposal.commands));
        setCommandEnabled(proposal.commands.map(() => true));
      } else {
        setChatProposal(null);
        setChatCommands([]);
        setCommandEnabled([]);
      }
    } catch (error) {
      if (selectedGameRef.current === selectedGame.id) {
        setRequestError(errorMessage(error, "The assistant could not answer."));
      }
    } finally {
      setRequestBusy(false);
    }
  }

  async function applyChatProposal() {
    if (!chatProposal || !selectedGame || !chatProposalCurrent || selectedCommandCount === 0 || applyBusy || syncNeeded) return;
    const selected = chatCommands.filter((_command, index) => commandEnabled[index]);
    if (selected.some((command) => command.game_id !== selectedGame.id)) {
      setRequestError("This proposal refers to a different game. Discard it and ask again.");
      return;
    }
    if (selectedGame.status === "complete") {
      setRequestError("A completed game cannot accept new ledger changes.");
      return;
    }
    if (selected.length !== 1) {
      setRequestError("Apply one reviewed change at a time. Discard this proposal and ask the assistant to prepare one change.");
      return;
    }

    setApplyBusy(true);
    setRequestError(null);
    setStatusMessage(null);
    try {
      await postJson<GameLedgerAiApplyResponse>("/api/tile-tally/apply", accessToken, {
        kind: "chat",
        basis: chatProposal.basis,
        operation: chatProposal.operation,
        command: selected[0],
      });
      const refreshed = await onRefresh();
      const savedMessage = refreshed
        ? `1 change saved to ${selectedGame.title}.`
        : `1 change was saved to ${selectedGame.title}, but the latest ledger could not be reloaded. Retry sync before making another assistant change.`;
      setMessages((current) => [...current, message("assistant", savedMessage)]);
      setStatusMessage(savedMessage);
      setSyncNeeded(!refreshed);
      clearChatProposal();
    } catch (error) {
      setRequestError(error instanceof AssistantHttpError && error.status === 409
        ? "This game changed; ask the assistant again before applying anything."
        : errorMessage(error, "The proposed change could not be applied."));
    } finally {
      setApplyBusy(false);
    }
  }

  async function stagePhoto(event: ChangeEvent<HTMLInputElement>) {
    const source = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!source) return;
    setRequestError(null);
    setStatusMessage(null);
    setVisionProposal(null);
    setVisionDraft(null);
    if (!ACCEPTED_IMAGE_TYPES.has(source.type)) {
      setRequestError("Choose a JPEG, PNG, or WebP board photo.");
      return;
    }
    if (source.size < 1 || source.size > MAX_SOURCE_IMAGE_BYTES) {
      setRequestError("Choose a board photo smaller than 20 MB.");
      return;
    }
    setNormalizingPhoto(true);
    try {
      const normalized = await normalizeBoardPhoto(source);
      if (normalized.size > 8 * 1024 * 1024) throw new Error("The prepared analysis copy is still too large. Choose a smaller image.");
      setPhoto({
        file: normalized,
        previewUrl: URL.createObjectURL(normalized),
        mediaId: null,
        importedAt: new Date().toISOString(),
        sourceName: source.name,
      });
    } catch (error) {
      setPhoto(null);
      setRequestError(errorMessage(error, "The image could not be prepared safely. No file was uploaded."));
    } finally {
      setNormalizingPhoto(false);
    }
  }

  async function analyzePhoto() {
    if (!photo || !selectedGame || requestBusy || applyBusy || syncNeeded) return;
    if (selectedGame.status === "complete") {
      setRequestError("Choose an open game before analyzing a new board position.");
      return;
    }
    const gameId = selectedGame.id;
    setRequestBusy(true);
    setRequestError(null);
    setStatusMessage(null);
    try {
      const mediaId = photo.mediaId ?? await onUploadMedia(
        gameId,
        "photo",
        photo.file,
        photo.importedAt,
        undefined,
        "imported_at",
      );
      if (selectedGameRef.current !== gameId) return;
      setPhoto((current) => current ? { ...current, mediaId } : current);
      const proposal = await postJson<GameLedgerVisionProposal>("/api/tile-tally/vision", accessToken, {
        gameId,
        mediaId,
        boardMode,
        customInstructions: customInstructions.trim(),
      });
      if (selectedGameRef.current !== gameId) return;
      setVisionProposal(proposal);
      setVisionDraft(cloneValue(proposal.observation));
      setRememberCorrections(false);
      setMessages((current) => [...current, message("assistant", proposal.reply)]);
    } catch (error) {
      if (selectedGameRef.current === gameId) {
        setRequestError(errorMessage(error, "The board photo could not be analyzed."));
      }
    } finally {
      setRequestBusy(false);
    }
  }

  async function applyVisionProposal() {
    if (!visionProposal || !visionDraft || !selectedGame || !visionProposalCurrent || applyBusy || syncNeeded) return;
    if (selectedGame.status === "complete") {
      setRequestError("A completed game cannot accept a new board position.");
      return;
    }
    const mediaId = visionProposal.media_id;
    const learningNote = rememberCorrections
      ? customInstructions.trim() || "Use this user-reviewed board observation as a corrected example."
      : "";
    setApplyBusy(true);
    setRequestError(null);
    setStatusMessage(null);
    try {
      await postJson<GameLedgerAiApplyResponse>("/api/tile-tally/apply", accessToken, {
        kind: "vision",
        basis: visionProposal.basis,
        operation: visionProposal.operation,
        mediaId,
        observation: visionDraft,
        learningOptIn: rememberCorrections,
        learningNote,
      });
      const refreshed = await onRefresh();
      const savedMessage = refreshed
        ? `Reviewed board position saved to ${selectedGame.title}.`
        : `The reviewed board position was saved to ${selectedGame.title}, but the latest ledger could not be reloaded. Retry sync before making another assistant change.`;
      setMessages((current) => [...current, message("assistant", savedMessage)]);
      setStatusMessage(savedMessage);
      setSyncNeeded(!refreshed);
      clearVisionProposal(true);
    } catch (error) {
      setRequestError(error instanceof AssistantHttpError && error.status === 409
        ? "This game changed; analyze the board again before applying anything."
        : errorMessage(error, "The reviewed board position could not be applied."));
    } finally {
      setApplyBusy(false);
    }
  }

  async function retryLedgerSync() {
    if (!syncNeeded || applyBusy) return;
    setApplyBusy(true);
    setRequestError(null);
    try {
      const refreshed = await onRefresh();
      if (!refreshed) {
        setRequestError("The saved change is safe, but the ledger still could not be reloaded. Check your connection and retry sync.");
        return;
      }
      setSyncNeeded(false);
      setStatusMessage("The latest ledger is loaded. You can continue using the assistant.");
    } catch (error) {
      setRequestError(errorMessage(error, "The saved change is safe, but the ledger still could not be reloaded."));
    } finally {
      setApplyBusy(false);
    }
  }

  return (
    <div className={styles.assistant}>
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>Ask, photograph, review</p>
          <h1>Game assistant</h1>
          <p>Describe what happened or show the board. Every proposed ledger change waits for your explicit approval.</p>
        </div>
        <BrainCircuit size={38} aria-hidden="true" />
      </header>

      <p className={styles.providerNotice}>
        <ShieldCheck size={17} aria-hidden="true" />
        When you send a message or tap Analyze board, that chat content or normalized photo copy is sent to the configured AI provider (Anthropic or OpenAI).
      </p>

      <section className={styles.contextCard} aria-labelledby="assistant-context-heading">
        <div className={styles.sectionHeading}>
          <div><p className={styles.kicker}>Working context</p><h2 id="assistant-context-heading">Choose the game</h2></div>
          {selectedGame && <span className={selectedGame.status === "complete" ? styles.completePill : styles.openPill}>{selectedGame.status === "complete" ? "Complete" : "Open"}</span>}
        </div>
        {games.length ? (
          <label>
            <span>Game to update</span>
            <select value={selectedGameId} onChange={(event) => setSelectedGameId(event.currentTarget.value)} disabled={working}>
              <optgroup label="Open games">
                {games.filter((game) => game.status !== "complete").map((game) => <option value={game.id} key={game.id}>{game.title}</option>)}
              </optgroup>
              <optgroup label="Past games — questions only">
                {games.filter((game) => game.status === "complete").map((game) => <option value={game.id} key={game.id}>{game.title}</option>)}
              </optgroup>
            </select>
          </label>
        ) : (
          <div className={styles.emptyState}><Sparkles size={22} aria-hidden="true" /><p>Create a game first, then the assistant can read or update its ledger.</p></div>
        )}
        {selectedGame && (
          <p className={styles.contextSummary}>
            {normaliseGameProfile(selectedGame.definition).name} · {gameParticipants.length ? gameParticipants.map((participant) => participant.label).join(", ") : "No participants"}
          </p>
        )}
      </section>

      <section className={styles.chatCard} aria-labelledby="assistant-chat-heading">
        <div className={styles.sectionHeading}>
          <div><p className={styles.kicker}>Natural updates</p><h2 id="assistant-chat-heading">Chat with the ledger</h2></div>
          <Sparkles size={22} aria-hidden="true" />
        </div>
        <div className={styles.chatLog} ref={chatLogRef} role="log" aria-live="polite" aria-relevant="additions" aria-label="Game assistant conversation">
          {messages.map((item) => (
            <div className={item.role === "user" ? styles.userBubble : styles.assistantBubble} key={item.id}>
              {item.role === "assistant" && <Sparkles size={15} aria-hidden="true" />}
              <p>{item.content}</p>
            </div>
          ))}
          {requestBusy && (
            <div className={styles.assistantBubble} role="status">
              <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" />
              <p>{photo ? "Assistant is analyzing the board…" : "Assistant is thinking…"}</p>
            </div>
          )}
        </div>
        <form className={styles.composer} onSubmit={sendMessage}>
          <label className={styles.srOnly} htmlFor="game-ledger-assistant-message">Message the Game Ledger assistant</label>
          <textarea
            id="game-ledger-assistant-message"
            maxLength={MAX_CHAT_MESSAGE_CHARS}
            rows={3}
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder={selectedGame?.status === "complete" ? "Ask about this completed game…" : "“Alice scored 8” or “What is the score now?”"}
            disabled={!selectedGame || working}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className={styles.composerFooter}>
            <span>Enter to send · Shift+Enter for a new line</span>
            <button className={styles.primaryButton} type="submit" disabled={!selectedGame || working || !input.trim()}><Send size={17} aria-hidden="true" /> Send message</button>
          </div>
        </form>
      </section>

      {chatProposal && selectedGame && (
        <section className={styles.reviewCard} aria-labelledby="chat-proposal-heading">
          <div className={styles.reviewHeader}>
            <div><p className={styles.kicker}>Not saved yet</p><h2 id="chat-proposal-heading">Review proposed changes</h2></div>
            <button className={styles.iconButton} type="button" onClick={clearChatProposal} aria-label="Discard proposed chat changes"><X size={19} aria-hidden="true" /></button>
          </div>
          {chatProposal.warnings.length > 0 && <div className={styles.warningBox}><AlertTriangle size={18} aria-hidden="true" /><ul>{chatProposal.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div>}
          {!chatProposalCurrent && <div className={styles.staleNotice} role="alert">This game changed after the proposal was prepared. Discard it and ask again before applying anything.</div>}
          <div className={styles.commandList}>
            {chatCommands.map((command, index) => (
              <CommandEditor
                command={command}
                game={selectedGame}
                participants={participants}
                enabled={commandEnabled[index] ?? false}
                onEnabledChange={(enabled) => setCommandEnabled((current) => current.map((value, candidateIndex) => candidateIndex === index ? enabled : value))}
                onChange={(next) => setChatCommands((current) => current.map((value, candidateIndex) => candidateIndex === index ? next : value))}
                key={`${command.type}-${index}`}
              />
            ))}
          </div>
          <div className={styles.reviewActions}>
            <p><strong>No ledger rows have been written.</strong> Apply records your reviewed assertion; the AI provenance does not attest that it is correct.</p>
            <div>
              <button className={styles.secondaryButton} type="button" onClick={clearChatProposal} disabled={applyBusy}>Discard proposal</button>
              <button className={styles.primaryButton} type="button" onClick={() => void applyChatProposal()} disabled={applyBusy || !chatProposalCurrent || selectedCommandCount === 0 || selectedGame.status === "complete"}>
                {applyBusy ? <LoaderCircle className={styles.spinner} size={17} aria-hidden="true" /> : <CheckCircle2 size={17} aria-hidden="true" />}
                {applyBusy ? "Applying…" : `Apply ${selectedCommandCount} ${selectedCommandCount === 1 ? "change" : "changes"}`}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className={styles.photoCard} aria-labelledby="board-photo-heading">
        <div className={styles.sectionHeading}>
          <div><p className={styles.kicker}>Board position</p><h2 id="board-photo-heading">Read a board photo</h2></div>
          <Camera size={24} aria-hidden="true" />
        </div>
        <p className={styles.introCopy}>Choose or take a photo, then inspect and correct the reading before saving one board-position event.</p>
        <div className={styles.photoSettings}>
          <label>
            <span>Board type</span>
            <select value={boardMode} onChange={(event) => setBoardMode(event.currentTarget.value as GameLedgerBoardMode)} disabled={working || Boolean(visionProposal)}>
              {BOARD_MODE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
            <small>{gameBoardHint(selectedGame)}</small>
          </label>
          <label>
            <span>Guidance for this board <em>optional</em></span>
            <textarea
              maxLength={2_000}
              rows={3}
              value={customInstructions}
              onChange={(event) => setCustomInstructions(event.currentTarget.value)}
              disabled={working || Boolean(visionProposal)}
              placeholder="Red peg is Alice; the outer track runs clockwise…"
            />
          </label>
        </div>
        <div className={styles.photoActions}>
          <button className={styles.secondaryButton} type="button" onClick={() => captureInputRef.current?.click()} disabled={!selectedGame || working || Boolean(visionProposal)}><Camera size={18} aria-hidden="true" /> Take board photo</button>
          <button className={styles.secondaryButton} type="button" onClick={() => libraryInputRef.current?.click()} disabled={!selectedGame || working || Boolean(visionProposal)}><ImagePlus size={18} aria-hidden="true" /> Choose board photo</button>
        </div>
        <input ref={captureInputRef} className={styles.srOnly} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Take a board photo" tabIndex={-1} onChange={(event) => void stagePhoto(event)} />
        <input ref={libraryInputRef} className={styles.srOnly} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a board photo" tabIndex={-1} onChange={(event) => void stagePhoto(event)} />
        {normalizingPhoto && <div className={styles.preparing} role="status"><LoaderCircle className={styles.spinner} size={17} aria-hidden="true" /> Preparing a private, metadata-free analysis copy…</div>}

        {photo && (
          <div className={styles.photoPreview}>
            <div className={styles.previewImage}>
              {/* This object URL is a local preview of the normalized upload copy. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.previewUrl} alt="Normalized board photo ready for analysis" />
            </div>
            <div className={styles.previewDetails}>
              <span><ShieldCheck size={16} aria-hidden="true" /> Safe analysis copy</span>
              <strong title={photo.file.name}>{photo.file.name}</strong>
              <p>Decoded, resized to at most 2048 px, converted to JPEG, and stripped of embedded metadata. Only this copy is previewed and sent.</p>
              {photo.mediaId && <small>Private analysis copy stored with its import time as an audit trail, not proof of when the board was observed.</small>}
              {!visionProposal && (
                <div className={styles.previewActions}>
                  <button className={styles.secondaryButton} type="button" onClick={() => setPhoto(null)} disabled={working}>Choose another</button>
                  <button className={styles.primaryButton} type="button" onClick={() => void analyzePhoto()} disabled={working || selectedGame?.status === "complete"}>
                    {requestBusy ? <LoaderCircle className={styles.spinner} size={17} aria-hidden="true" /> : <BrainCircuit size={17} aria-hidden="true" />}
                    {requestBusy ? "Analyzing board…" : "Analyze board"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        <p className={styles.privacyNote}><ShieldCheck size={16} aria-hidden="true" /> Analyze stores the normalized photo privately with this game so the server can read it. No score, position, or learning example is saved until you explicitly Apply the reviewed result.</p>
      </section>

      {visionProposal && visionDraft && selectedGame && (
        <section className={styles.reviewCard} aria-labelledby="vision-proposal-heading">
          <div className={styles.reviewHeader}>
            <div>
              <p className={styles.kicker}>Correct before saving</p>
              <h2 id="vision-proposal-heading">Review board reading</h2>
              <span className={visionDraft.overall_confidence < 0.7 ? styles.needsReview : styles.confidence}>{confidenceLabel(visionDraft.overall_confidence)}</span>
            </div>
            <button className={styles.iconButton} type="button" onClick={() => clearVisionProposal(false)} aria-label="Discard board reading"><X size={19} aria-hidden="true" /></button>
          </div>
          {!visionProposalCurrent && <div className={styles.staleNotice} role="alert">This game changed after the photo was read. Discard the reading and analyze again.</div>}
          <VisionReview observation={visionDraft} participants={participants} game={selectedGame} onChange={setVisionDraft} />
          <label className={styles.learningChoice}>
            <input type="checkbox" checked={rememberCorrections} onChange={(event) => setRememberCorrections(event.currentTarget.checked)} />
            <span><strong>Remember my guidance and corrected reading</strong><small>Future photos for boards like this may use the reviewed observation. Discarding this proposal learns nothing.</small></span>
          </label>
          <div className={styles.reviewActions}>
            <p><strong>No board-position event has been written.</strong> Apply saves this as your reviewed assertion, not an independently attested board state.</p>
            <div>
              <button className={styles.secondaryButton} type="button" onClick={() => clearVisionProposal(false)} disabled={applyBusy}>Discard proposal</button>
              <button className={styles.primaryButton} type="button" onClick={() => void applyVisionProposal()} disabled={applyBusy || !visionProposalCurrent || selectedGame.status === "complete" || !visionDraft.summary.trim()}>
                {applyBusy ? <LoaderCircle className={styles.spinner} size={17} aria-hidden="true" /> : <CheckCircle2 size={17} aria-hidden="true" />}
                {applyBusy ? "Applying…" : "Apply board position"}
              </button>
            </div>
          </div>
        </section>
      )}

      {requestError && <div className={styles.errorBanner} role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>{requestError}</span><button className={styles.iconButton} type="button" onClick={() => setRequestError(null)} aria-label="Dismiss error"><X size={17} aria-hidden="true" /></button></div>}
      {statusMessage && (
        <div className={styles.successBanner} role="status">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>{statusMessage}</span>
          {syncNeeded && (
            <button className={styles.secondaryButton} type="button" onClick={() => void retryLedgerSync()} disabled={applyBusy}>
              {applyBusy ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" /> : <RotateCw size={16} aria-hidden="true" />}
              {applyBusy ? "Syncing…" : "Retry sync"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
