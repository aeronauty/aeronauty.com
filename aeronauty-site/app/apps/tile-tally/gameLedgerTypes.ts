import type {
  GameLedgerEntity,
  GameLedgerEvent,
  GameLedgerGame,
  GameLedgerMedia,
  GameLedgerParticipant,
  GameLedgerProfile,
  JsonValue,
} from "@/lib/tiletally/types";

export type LedgerEntity = GameLedgerEntity;
export type LedgerGameStatus = GameLedgerGame["status"];
export type LedgerGame = GameLedgerGame;
export type LedgerParticipant = GameLedgerParticipant;
export type LedgerEvent = GameLedgerEvent;

export type LedgerMediaKind = "photo" | "video";
export type LedgerMediaTransferStatus = "queued" | "uploading" | "ready" | "error";

export type LedgerMedia = GameLedgerMedia & {
  transfer?: {
    status: LedgerMediaTransferStatus;
    progress?: number;
    error?: string;
  };
};

export type LedgerActiveMediaCount = {
  game_id: string;
  active_media_count: number;
};

export type CreateLedgerGameInput = {
  title: string;
  definition: GameLedgerProfile;
  entityIds: string[];
  startedAt: string;
  location?: string;
};

export type AppendLedgerEventInput = {
  gameId: string;
  participantId?: string | null;
  kind: string;
  /** Additional schema-driven event payload beyond the conventional values/fields keys. */
  data?: Record<string, JsonValue>;
  values?: Record<string, JsonValue>;
  fields?: Record<string, JsonValue>;
  note?: string;
  occurredAt?: string;
  voidsEventId?: string | null;
  source?: {
    kind: string;
    data?: Record<string, JsonValue>;
    mediaId?: string | null;
  };
};

export type FinishLedgerGameInput = {
  gameId: string;
  result: Record<string, JsonValue>;
  note?: string;
  endedAt?: string;
  source?: {
    kind: string;
    data?: Record<string, JsonValue>;
  };
};
