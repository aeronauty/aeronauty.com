import type {
  TileTallyGame,
  TileTallyGamePlayer,
  GameLedgerEvent,
  GameLedgerMedia,
  GameLedgerProfile,
  TileTallyPlayer,
  TileTallyScorePhoto,
  TileTallyTurn,
} from "@/lib/tiletally/types";

export type Player = TileTallyPlayer;
export type Game = TileTallyGame;
export type GamePlayer = TileTallyGamePlayer;
export type Turn = TileTallyTurn;
export type ScorePhoto = TileTallyScorePhoto;
export type LedgerEvent = GameLedgerEvent;
export type LedgerMedia = GameLedgerMedia;
export type LedgerProfile = GameLedgerProfile;

export type EntrySource = "manual" | "chat" | "voice" | "photo";
export type GameStatus = "in_progress" | "complete";

export type ProposedTurn = {
  player: string;
  score: number;
  word?: string | null;
  is_bingo?: boolean;
  kind?: "play" | "adjustment";
};

export type ProposedAdjustment = {
  player: string;
  points: number;
};

export type PendingActionPayload = {
  played_on?: string;
  location?: string | null;
  status?: GameStatus;
  game_ref?: string;
  players?: string[];
  turns?: ProposedTurn[];
  adjustments?: ProposedAdjustment[];
  [key: string]: unknown;
};

export type PendingAction = {
  type: "log_game" | "add_turn" | "finish_game";
  payload: PendingActionPayload;
};

export type PendingProposal = {
  action: PendingAction;
  eventId?: string;
  source: Exclude<EntrySource, "manual">;
  rawInput?: string;
  photoId?: string;
  storagePath?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type GameTotal = {
  gameId: string;
  playedOn: string;
  playerId: string;
  playerName: string;
  total: number;
};

export type CompletedSummary = {
  game: Game;
  totals: Array<{ player: Player; total: number }>;
};
