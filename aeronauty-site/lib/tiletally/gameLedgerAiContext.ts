import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliseGameProfile } from "@/lib/tiletally/gameProfiles";
import { TileTallyHttpError } from "@/lib/tiletally/http";
import type {
  GameLedgerEvent,
  GameLedgerGame,
  GameLedgerParticipant,
} from "@/lib/tiletally/types";

export { validateAiCommands } from "@/lib/tiletally/gameLedgerAiValidation";

export type GameLedgerAiContext = {
  game: GameLedgerGame;
  participants: GameLedgerParticipant[];
  recentEvents: GameLedgerEvent[];
  eventCount: number;
  currentTotals: Array<{
    participantId: string | null;
    values: Record<string, number>;
  }>;
  lastEventSeq: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedJson(value: unknown, max = 80_000) {
  const serialized = JSON.stringify(value);
  if (serialized.length > max) {
    throw new TileTallyHttpError(413, "ai_context_too_large", "This game has too much detail for one assistant request.");
  }
  return serialized;
}

function finiteTotals(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, candidate]) => (
    typeof candidate === "number" && Number.isFinite(candidate) ? [[key, candidate]] : []
  )));
}

export async function loadGameLedgerAiContext(
  client: SupabaseClient,
  gameId: string,
): Promise<GameLedgerAiContext> {
  const { data, error } = await client.rpc("gameledger_ai_context", { p_game_id: gameId });
  if (error) {
    throw new TileTallyHttpError(502, "ledger_unavailable", "Could not load that game for the assistant.");
  }
  if (!isRecord(data)) throw new TileTallyHttpError(404, "game_not_found", "That game was not found.");
  if (data.schema_version !== 1 || !isRecord(data.game)) {
    throw new TileTallyHttpError(502, "ledger_unavailable", "Could not load that game for the assistant.");
  }
  const game = data.game as unknown as GameLedgerGame;
  game.definition = normaliseGameProfile(game.definition);
  const participants = Array.isArray(data.participants)
    ? data.participants.filter(isRecord) as unknown as GameLedgerParticipant[]
    : [];
  const recentEvents = Array.isArray(data.recent_events)
    ? data.recent_events.filter(isRecord) as unknown as GameLedgerEvent[]
    : [];
  const currentTotals = Array.isArray(data.current_totals)
    ? data.current_totals.flatMap((row) => {
        if (!isRecord(row)) return [];
        const participantId = typeof row.participant_id === "string" ? row.participant_id : null;
        return [{ participantId, values: finiteTotals(row.values) }];
      })
    : [];
  const lastEventSeq = typeof data.last_event_seq === "number" && Number.isSafeInteger(data.last_event_seq)
    ? Math.max(0, data.last_event_seq)
    : 0;
  const eventCount = typeof data.event_count === "number" && Number.isSafeInteger(data.event_count)
    ? Math.max(0, data.event_count)
    : lastEventSeq;
  return {
    game,
    participants,
    recentEvents,
    eventCount,
    currentTotals,
    lastEventSeq,
  };
}

export function gameLedgerContextForPrompt(context: GameLedgerAiContext) {
  const profile = context.game.definition;
  // Keep the provider contract to fields needed to answer or validate a ledger
  // update. In particular, do not forward location, participant metadata,
  // arbitrary definition extras, or unrelated UI tool configuration.
  const chatDefinition = {
    version: profile.version,
    name: profile.name,
    preset: profile.preset,
    participant: profile.participant,
    counters: profile.counters,
    event_fields: profile.event_fields,
    result_fields: profile.result_fields,
    result: profile.result,
  };
  const totalRows = context.currentTotals.map(({ participantId, values }) => ({
    participant_id: participantId,
    participant_label: participantId === null
      ? "Whole game"
      : context.participants.find((participant) => participant.id === participantId)?.label ?? "Unknown",
    values,
  }));
  const recentEvents = context.recentEvents.map((event) => {
    const serializedData = JSON.stringify(event.event_data);
    const compactData = serializedData.length <= 2_000
      ? event.event_data
      : isRecord(event.event_data) && isRecord(event.event_data.board_observation)
        ? {
            board_observation: {
              board_type: event.event_data.board_observation.board_type,
              summary: event.event_data.board_observation.summary,
            },
          }
        : { omitted: "Large event payload; current totals already include its counter values." };
    return {
    id: event.id,
    seq: event.seq,
    event_kind: event.event_kind,
    participant_id: event.actor_participant_id,
    event_data: compactData,
    note: event.note,
    occurred_at: event.occurred_at,
    voids_event_id: event.voids_event_id,
    };
  });
  return boundedJson({
    game: {
      id: context.game.id,
      title: context.game.title,
      status: context.game.status,
      started_at: context.game.started_at,
      definition: chatDefinition,
    },
    participants: context.participants.map((participant) => ({
      id: participant.id,
      label: participant.label,
      seat: participant.seat,
    })),
    current_totals: totalRows,
    recent_events: recentEvents,
    recent_events_are_complete: context.eventCount <= recentEvents.length,
  });
}

export type LearnedBoardExample = {
  board_type: string;
  summary: string;
  learning_note: string;
  corrected_observation: unknown;
};

export async function loadLearnedBoardExamples(
  client: SupabaseClient,
  context: GameLedgerAiContext,
): Promise<LearnedBoardExample[]> {
  const learningKey = typeof context.game.definition.extra?.vision_learning_key === "string"
    ? context.game.definition.extra.vision_learning_key.trim()
    : "";
  let relatedIds = [context.game.id];
  if (learningKey) {
    const { data: games, error: gamesError } = await client
      .from("gameledger_games")
      .select("id,definition")
      .order("started_at", { ascending: false })
      .limit(200);
    if (!gamesError) {
      relatedIds = (games ?? []).flatMap((game) => {
        const definition = normaliseGameProfile((game as { definition?: unknown }).definition);
        const candidateKey = typeof definition.extra?.vision_learning_key === "string"
          ? definition.extra.vision_learning_key.trim()
          : "";
        return candidateKey === learningKey && typeof (game as { id?: unknown }).id === "string"
          ? [(game as { id: string }).id]
          : [];
      }).slice(0, 50);
    }
  }
  if (!relatedIds.length) return [];
  const { data: events, error } = await client
    .from("gameledger_events")
    .select("event_data,note")
    .in("game_id", relatedIds)
    .eq("event_kind", "board_position")
    .contains("event_data", { vision: { learning_opt_in: true } })
    .order("occurred_at", { ascending: false })
    .limit(12);
  if (error) return [];
  return (events ?? []).flatMap((event) => {
    const data = isRecord((event as { event_data?: unknown }).event_data)
      ? (event as { event_data: Record<string, unknown> }).event_data
      : {};
    const vision = isRecord(data.vision) ? data.vision : {};
    const observation = isRecord(data.board_observation) ? data.board_observation : null;
    if (!observation || vision.learning_opt_in !== true) return [];
    return [{
      board_type: typeof observation.board_type === "string" ? observation.board_type : "custom",
      summary: typeof observation.summary === "string" ? observation.summary.slice(0, 1_000) : "",
      learning_note: typeof vision.learning_note === "string" ? vision.learning_note.slice(0, 2_000) : "",
      corrected_observation: observation,
    }];
  });
}
