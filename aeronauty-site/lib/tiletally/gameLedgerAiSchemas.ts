import { z } from "zod";
import type {
  GameLedgerAiChatProposal,
  GameLedgerAiCommand,
  GameLedgerAiFieldUpdate,
  GameLedgerBoardObservation,
} from "@/lib/tiletally/gameLedgerAiTypes";
import type { GameLedgerCounter } from "@/lib/tiletally/types";

export const MAX_LEDGER_AI_MESSAGES = 20;
export const MAX_LEDGER_AI_MESSAGE_CHARS = 2_500;
export const MAX_LEDGER_AI_TOTAL_CHARS = 14_000;
export const MAX_LEDGER_AI_REQUEST_BYTES = 128 * 1024;
export const MAX_LEDGER_AI_APPLY_BYTES = 256 * 1024;
export const MAX_LEDGER_AI_COUNTER_VALUE = 1_000_000_000;

const noControlCharacters = (value: string) => !Array.from(value).some((character) => {
  const code = character.charCodeAt(0);
  return code < 32 || code === 127;
});

const noUnsafeMessageCharacters = (value: string) => !Array.from(value).some((character) => {
  const code = character.charCodeAt(0);
  return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
});

const safeText = (max: number) => z
  .string()
  .trim()
  .max(max)
  .refine(noControlCharacters, "Text contains unsupported control characters.");
const safeMessageText = (max: number) => z
  .string()
  .trim()
  .max(max)
  .refine(noUnsafeMessageCharacters, "Message contains unsupported control characters.");
const confidence = z.number().finite().min(0).max(1);
const nullableUuid = z.string().uuid().nullable();
const unreviewedTimestamp = z.string().datetime({ offset: true }).nullable().transform(() => null);

/** Profile-aware numeric guard shared by proposal and reviewed-apply validation. */
export function isAllowedAiCounterValue(
  counter: Pick<GameLedgerCounter, "value_type" | "input">,
  value: number,
) {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_LEDGER_AI_COUNTER_VALUE) return false;
  if (counter.value_type === "integer" && !Number.isInteger(value)) return false;
  if (counter.input?.allow_negative === false && value < 0) return false;
  return true;
}

export const gameLedgerAiChatRequestSchema = z
  .object({
    gameId: z.string().uuid(),
    messages: z
      .array(z.object({
        role: z.enum(["user", "assistant"]),
        content: safeMessageText(MAX_LEDGER_AI_MESSAGE_CHARS).min(1),
      }).strict())
      .min(1)
      .max(MAX_LEDGER_AI_MESSAGES),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.messages.at(-1)?.role !== "user") {
      context.addIssue({ code: "custom", path: ["messages"], message: "The final message must be from the user." });
    }
    const total = value.messages.reduce((sum, message) => sum + message.content.length, 0);
    if (total > MAX_LEDGER_AI_TOTAL_CHARS) {
      context.addIssue({ code: "custom", path: ["messages"], message: "Conversation is too long." });
    }
  });

export const gameLedgerVisionRequestSchema = z.object({
  gameId: z.string().uuid(),
  mediaId: z.string().uuid(),
  boardMode: z.enum(["auto", "cribbage", "chess", "word_tiles", "custom"]).default("auto"),
  customInstructions: safeMessageText(2_000).default(""),
}).strict();

const proposalBasisSchema = z.object({
  game_id: z.string().uuid(),
  game_updated_at: z.string().datetime({ offset: true }),
  last_event_seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict();

const proposalOperationSchema = z.object({
  event_id: z.string().uuid(),
  source_id: z.string().uuid(),
  provider: z.enum(["openai", "anthropic"]),
  model: safeText(120).min(1),
}).strict();

const normalizedFieldUpdateSchema = z.object({
  field_id: safeText(64).min(1),
  value: z.union([
    safeText(1_000),
    z.number().finite().min(-1_000_000_000).max(1_000_000_000),
    z.boolean(),
  ]),
}).strict();

const normalizedAppendCommandSchema = z.object({
  type: z.literal("append_event"),
  game_id: z.string().uuid(),
  participant_id: nullableUuid,
  event_kind: z.enum(["score", "moment", "note"]),
  counter_updates: z.array(z.object({
    counter_id: safeText(64).min(1),
    value: z.number().finite().min(-MAX_LEDGER_AI_COUNTER_VALUE).max(MAX_LEDGER_AI_COUNTER_VALUE),
  }).strict()).max(24),
  field_updates: z.array(normalizedFieldUpdateSchema).max(48),
  note: safeText(2_000).nullable(),
  // The review UI does not expose timestamps, so never accept a hidden model
  // timestamp at the persistence boundary. PostgreSQL supplies confirmation time.
  occurred_at: unreviewedTimestamp,
  explanation: safeText(1_000).min(1),
}).strict();

const normalizedFinishCommandSchema = z.object({
  type: z.literal("finish_game"),
  game_id: z.string().uuid(),
  outcome: z.enum(["completed", "draw", "abandoned", "other"]),
  winner_participant_ids: z.array(z.string().uuid()).max(32),
  result_fields: z.array(normalizedFieldUpdateSchema).max(48),
  note: safeText(2_000).nullable(),
  ended_at: unreviewedTimestamp,
  explanation: safeText(1_000).min(1),
}).strict();

export const gameLedgerAiCommandSchema = z.discriminatedUnion("type", [
  normalizedAppendCommandSchema,
  normalizedFinishCommandSchema,
]);

const rawFieldUpdateSchema = z.object({
  field_id: safeText(64).min(1),
  value_kind: z.enum(["text", "number", "boolean"]),
  text_value: safeText(1_000).nullable(),
  number_value: z.number().finite().min(-1_000_000_000).max(1_000_000_000).nullable(),
  boolean_value: z.boolean().nullable(),
}).strict();

const rawCommandSchema = z.object({
  type: z.enum(["append_event", "finish_game"]),
  game_id: z.string().uuid(),
  participant_id: nullableUuid,
  event_kind: z.enum(["score", "moment", "note", "not_applicable"]),
  counter_updates: z.array(z.object({
    counter_id: safeText(64).min(1),
    value: z.number().finite().min(-MAX_LEDGER_AI_COUNTER_VALUE).max(MAX_LEDGER_AI_COUNTER_VALUE),
  }).strict()).max(24),
  field_updates: z.array(rawFieldUpdateSchema).max(48),
  outcome: z.enum(["completed", "draw", "abandoned", "other", "not_applicable"]),
  winner_participant_ids: z.array(z.string().uuid()).max(32),
  note: safeText(2_000).nullable(),
  occurred_at: z.string().datetime({ offset: true }).nullable(),
  explanation: safeText(1_000).min(1),
}).strict();

export const rawGameLedgerChatModelResponseSchema = z.object({
  reply: safeText(4_000).min(1),
  commands: z.array(rawCommandSchema).max(1),
  warnings: z.array(safeText(500).min(1)).max(12),
}).strict();

const cribbageTrackSchema = z.object({
  track_label: safeText(120).min(1),
  participant_id: nullableUuid,
  score: z.number().int().min(0).max(1_000_000).nullable(),
  front_peg: z.number().int().min(0).max(1_000_000).nullable(),
  rear_peg: z.number().int().min(0).max(1_000_000).nullable(),
  confidence,
  note: safeText(500).nullable(),
}).strict();

const chessPieceSchema = z.object({
  square: z.string().trim().regex(/^[a-h][1-8]$/),
  color: z.enum(["white", "black", "unknown"]),
  piece: z.enum(["king", "queen", "rook", "bishop", "knight", "pawn", "unknown"]),
  confidence,
}).strict();

const wordTileSchema = z.object({
  row: z.number().int().min(1).max(100),
  column: z.number().int().min(1).max(100),
  letter: z.string().trim().min(1).max(3),
  is_blank: z.boolean(),
  confidence,
}).strict();

const wordRackSchema = z.object({
  owner_label: safeText(120).min(1),
  participant_id: nullableUuid,
  letters: z.array(z.string().trim().min(1).max(3)).max(40),
  confidence,
}).strict();

const customFactSchema = z.object({
  label: safeText(160).min(1),
  value: safeText(1_000),
  region: safeText(160).nullable(),
  confidence,
});

export const gameLedgerBoardObservationSchema = z.object({
  schema_version: z.literal(1),
  board_type: z.enum(["cribbage", "chess", "word_tiles", "custom", "unknown"]),
  summary: safeText(2_000).min(1),
  overall_confidence: confidence,
  orientation: z.enum(["upright", "rotated_left", "rotated_right", "upside_down", "unknown"]),
  cribbage: z.object({
    target: z.number().int().min(1).max(1_000_000).nullable(),
    tracks: z.array(cribbageTrackSchema).max(32),
  }).strict(),
  chess: z.object({
    piece_placement: safeText(100).nullable(),
    side_to_move: z.enum(["white", "black", "unknown"]),
    pieces: z.array(chessPieceSchema).max(64),
  }).strict(),
  word_tiles: z.object({
    rows: z.number().int().min(1).max(100).nullable(),
    columns: z.number().int().min(1).max(100).nullable(),
    tiles: z.array(wordTileSchema).max(1_000),
    racks: z.array(wordRackSchema).max(32),
  }).strict(),
  custom: z.object({
    facts: z.array(customFactSchema).max(100),
  }).strict(),
  warnings: z.array(safeText(500).min(1)).max(24),
}).strict();

export const gameLedgerAiApplyRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("chat"),
    basis: proposalBasisSchema,
    operation: proposalOperationSchema,
    command: gameLedgerAiCommandSchema,
  }).strict(),
  z.object({
    kind: z.literal("vision"),
    basis: proposalBasisSchema,
    operation: proposalOperationSchema,
    mediaId: z.string().uuid(),
    observation: gameLedgerBoardObservationSchema,
    learningOptIn: z.boolean(),
    learningNote: safeMessageText(2_000),
  }).strict(),
]);

function fieldValue(raw: z.infer<typeof rawFieldUpdateSchema>): GameLedgerAiFieldUpdate | null {
  const populatedValueCount = [
    raw.text_value !== null,
    raw.number_value !== null,
    raw.boolean_value !== null,
  ].filter(Boolean).length;
  if (populatedValueCount !== 1) return null;
  if (raw.value_kind === "text" && raw.text_value !== null) return { field_id: raw.field_id, value: raw.text_value };
  if (raw.value_kind === "number" && raw.number_value !== null) return { field_id: raw.field_id, value: raw.number_value };
  if (raw.value_kind === "boolean" && raw.boolean_value !== null) return { field_id: raw.field_id, value: raw.boolean_value };
  return null;
}

export function normalizeRawChatModelResponse(value: unknown): Omit<GameLedgerAiChatProposal, "basis" | "operation"> {
  const parsed = rawGameLedgerChatModelResponseSchema.parse(value);
  const commands: GameLedgerAiCommand[] = parsed.commands.map((command) => {
    const fields = command.field_updates.map((field) => {
      const normalized = fieldValue(field);
      if (!normalized) throw new Error(`Field ${field.field_id} has a mismatched scalar value.`);
      return normalized;
    });
    if (command.type === "finish_game") {
      if (
        command.participant_id !== null
        || command.event_kind !== "not_applicable"
        || command.counter_updates.length > 0
        || command.outcome === "not_applicable"
      ) throw new Error("Finish command contains append-only fields.");
      if (
        (command.outcome === "draw" || command.outcome === "abandoned")
        && command.winner_participant_ids.length > 0
      ) throw new Error("A draw or abandoned game cannot have a winner.");
      return {
        type: "finish_game" as const,
        game_id: command.game_id,
        outcome: command.outcome,
        winner_participant_ids: command.winner_participant_ids,
        result_fields: fields,
        note: command.note,
        ended_at: null,
        explanation: command.explanation,
      };
    }
    if (command.outcome !== "not_applicable" || command.winner_participant_ids.length > 0) {
      throw new Error("Append command contains result-only fields.");
    }
    return {
      type: "append_event" as const,
      game_id: command.game_id,
      participant_id: command.participant_id,
      event_kind: command.event_kind === "not_applicable" ? "moment" : command.event_kind,
      counter_updates: command.counter_updates,
      field_updates: fields,
      note: command.note,
      occurred_at: null,
      explanation: command.explanation,
    };
  });
  return { reply: parsed.reply, commands, warnings: parsed.warnings };
}

const FEN_CHESS_PIECES = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
} as const;

function chessPiecesFromPlacement(piecePlacement: string) {
  const ranks = piecePlacement.split("/");
  const pieces: string[] = [];
  const placementIsValid = ranks.length === 8 && ranks.every((rank, rankIndex) => {
    if (!/^[prnbqkPRNBQK1-8]+$/.test(rank)) return false;
    let fileIndex = 0;
    for (const character of rank) {
      if (/[1-8]/.test(character)) {
        fileIndex += Number(character);
        continue;
      }
      if (fileIndex >= 8) return false;
      const lower = character.toLowerCase() as keyof typeof FEN_CHESS_PIECES;
      pieces.push([
        `${String.fromCharCode(97 + fileIndex)}${8 - rankIndex}`,
        character === lower ? "black" : "white",
        FEN_CHESS_PIECES[lower],
      ].join(":"));
      fileIndex += 1;
    }
    return fileIndex === 8;
  });
  if (!placementIsValid) {
    throw new Error("The chess piece placement is not a valid eight-rank FEN board field.");
  }
  return pieces.sort();
}

export function parseBoardObservation(value: unknown): GameLedgerBoardObservation {
  const parsed = gameLedgerBoardObservationSchema.parse(value) as GameLedgerBoardObservation;
  const emptyCribbage: GameLedgerBoardObservation["cribbage"] = { target: null, tracks: [] };
  const emptyChess: GameLedgerBoardObservation["chess"] = {
    piece_placement: null,
    side_to_move: "unknown",
    pieces: [],
  };
  const emptyWordTiles: GameLedgerBoardObservation["word_tiles"] = {
    rows: null,
    columns: null,
    tiles: [],
    racks: [],
  };
  const emptyCustom: GameLedgerBoardObservation["custom"] = { facts: [] };

  // Only the section the user can see and edit survives normalization. This
  // prevents hidden model output in another board mode from being persisted or
  // becoming a learned example later.
  const observation: GameLedgerBoardObservation = {
    ...parsed,
    cribbage: parsed.board_type === "cribbage" ? parsed.cribbage : emptyCribbage,
    chess: parsed.board_type === "chess" ? parsed.chess : emptyChess,
    word_tiles: parsed.board_type === "word_tiles" ? parsed.word_tiles : emptyWordTiles,
    custom: parsed.board_type === "custom" || parsed.board_type === "unknown" ? parsed.custom : emptyCustom,
  };
  const chessSquares = new Set<string>();
  for (const piece of observation.chess.pieces) {
    if (chessSquares.has(piece.square)) {
      throw new Error(`The board observation contains more than one chess piece on ${piece.square}.`);
    }
    chessSquares.add(piece.square);
  }
  if (observation.chess.piece_placement !== null) {
    const placementPieces = chessPiecesFromPlacement(observation.chess.piece_placement);
    const listedPieces = observation.chess.pieces.map((piece) => (
      `${piece.square}:${piece.color}:${piece.piece}`
    )).sort();
    if (
      placementPieces.length !== listedPieces.length
      || placementPieces.some((piece, index) => piece !== listedPieces[index])
    ) {
      throw new Error("The chess piece list does not match the piece-placement field.");
    }
  }
  const wordTileSquares = new Set<string>();
  for (const tile of observation.word_tiles.tiles) {
    if (
      (observation.word_tiles.rows !== null && tile.row > observation.word_tiles.rows)
      || (observation.word_tiles.columns !== null && tile.column > observation.word_tiles.columns)
    ) {
      throw new Error(`The word-tile observation contains a tile outside its declared grid at ${tile.row}:${tile.column}.`);
    }
    const square = `${tile.row}:${tile.column}`;
    if (wordTileSquares.has(square)) {
      throw new Error(`The board observation contains more than one word tile on ${square}.`);
    }
    wordTileSquares.add(square);
  }
  return observation;
}

export const GAME_LEDGER_CHAT_OUTPUT_JSON_SCHEMA = z.toJSONSchema(
  rawGameLedgerChatModelResponseSchema,
  { target: "draft-7", unrepresentable: "throw" },
);

export const GAME_LEDGER_VISION_OUTPUT_JSON_SCHEMA = z.toJSONSchema(
  gameLedgerBoardObservationSchema,
  { target: "draft-7", unrepresentable: "throw" },
);
