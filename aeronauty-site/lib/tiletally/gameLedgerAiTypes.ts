import type { JsonValue } from "@/lib/tiletally/types";

export const GAME_LEDGER_BOARD_MODES = [
  "auto",
  "cribbage",
  "chess",
  "word_tiles",
  "custom",
] as const;

export type GameLedgerBoardMode = (typeof GAME_LEDGER_BOARD_MODES)[number];
export type GameLedgerBoardType = Exclude<GameLedgerBoardMode, "auto"> | "unknown";

export type BoardObservationConfidence = number;

export type CribbagePegObservation = {
  track_label: string;
  participant_id: string | null;
  score: number | null;
  front_peg: number | null;
  rear_peg: number | null;
  confidence: BoardObservationConfidence;
  note: string | null;
};

export type ChessPieceObservation = {
  square: string;
  color: "white" | "black" | "unknown";
  piece: "king" | "queen" | "rook" | "bishop" | "knight" | "pawn" | "unknown";
  confidence: BoardObservationConfidence;
};

export type WordTileObservation = {
  row: number;
  column: number;
  letter: string;
  is_blank: boolean;
  confidence: BoardObservationConfidence;
};

export type WordTileRackObservation = {
  owner_label: string;
  participant_id: string | null;
  letters: string[];
  confidence: BoardObservationConfidence;
};

export type CustomBoardFact = {
  label: string;
  value: string;
  region: string | null;
  confidence: BoardObservationConfidence;
};

export type GameLedgerBoardObservation = {
  schema_version: 1;
  board_type: GameLedgerBoardType;
  summary: string;
  overall_confidence: BoardObservationConfidence;
  orientation: "upright" | "rotated_left" | "rotated_right" | "upside_down" | "unknown";
  cribbage: {
    target: number | null;
    tracks: CribbagePegObservation[];
  };
  chess: {
    /** The first FEN field only; a photo cannot establish turn/castling/clock state. */
    piece_placement: string | null;
    side_to_move: "white" | "black" | "unknown";
    pieces: ChessPieceObservation[];
  };
  word_tiles: {
    rows: number | null;
    columns: number | null;
    tiles: WordTileObservation[];
    racks: WordTileRackObservation[];
  };
  custom: {
    facts: CustomBoardFact[];
  };
  warnings: string[];
};

export type GameLedgerAiFieldUpdate = {
  field_id: string;
  value: JsonValue;
};

export type GameLedgerAiCounterUpdate = {
  counter_id: string;
  value: number;
};

export type GameLedgerAiAppendCommand = {
  type: "append_event";
  game_id: string;
  participant_id: string | null;
  event_kind: "score" | "moment" | "note";
  counter_updates: GameLedgerAiCounterUpdate[];
  field_updates: GameLedgerAiFieldUpdate[];
  note: string | null;
  occurred_at: string | null;
  explanation: string;
};

export type GameLedgerAiFinishCommand = {
  type: "finish_game";
  game_id: string;
  outcome: "completed" | "draw" | "abandoned" | "other";
  winner_participant_ids: string[];
  result_fields: GameLedgerAiFieldUpdate[];
  note: string | null;
  ended_at: string | null;
  explanation: string;
};

export type GameLedgerAiCommand = GameLedgerAiAppendCommand | GameLedgerAiFinishCommand;

export type GameLedgerAiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type GameLedgerAiChatProposal = {
  reply: string;
  commands: GameLedgerAiCommand[];
  warnings: string[];
  basis: {
    game_id: string;
    game_updated_at: string;
    last_event_seq: number;
  };
  operation: {
    event_id: string;
    source_id: string;
    provider: "openai" | "anthropic";
    model: string;
  };
};

export type GameLedgerVisionProposal = {
  reply: string;
  observation: GameLedgerBoardObservation;
  learned_from_count: number;
  media_id: string;
  basis: {
    game_id: string;
    game_updated_at: string;
    last_event_seq: number;
  };
  operation: {
    event_id: string;
    source_id: string;
    provider: "openai" | "anthropic";
    model: string;
  };
};

export type GameLedgerAiApplyRequest =
  | {
      kind: "chat";
      basis: GameLedgerAiChatProposal["basis"];
      operation: GameLedgerAiChatProposal["operation"];
      command: GameLedgerAiCommand;
    }
  | {
      kind: "vision";
      basis: GameLedgerVisionProposal["basis"];
      operation: GameLedgerVisionProposal["operation"];
      mediaId: string;
      observation: GameLedgerBoardObservation;
      learningOptIn: boolean;
      learningNote: string;
    };

export type GameLedgerAiApplyResponse = {
  applied: true;
  idempotent: boolean;
  event_id: string;
};
