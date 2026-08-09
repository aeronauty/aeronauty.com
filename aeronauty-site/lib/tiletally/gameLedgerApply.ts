import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliseGameProfile } from "@/lib/tiletally/gameProfiles";
import { validateAiCommands } from "@/lib/tiletally/gameLedgerAiContext";
import { parseBoardObservation } from "@/lib/tiletally/gameLedgerAiSchemas";
import type {
  GameLedgerAiApplyRequest,
  GameLedgerAiApplyResponse,
  GameLedgerAiCommand,
  GameLedgerBoardObservation,
} from "@/lib/tiletally/gameLedgerAiTypes";
import { TileTallyHttpError } from "@/lib/tiletally/http";
import type { JsonValue } from "@/lib/tiletally/types";

const MAX_PERSISTED_EVENT_DATA_BYTES = 112 * 1024;

type ApplyContext = {
  game: {
    id: string;
    status: string;
    definition: ReturnType<typeof normaliseGameProfile>;
    updated_at: string;
  };
  participantIds: Set<string>;
  lastEventSeq: number;
  existingEvent: boolean;
};

type RpcError = {
  code?: string;
  message?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function eventDataSize(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function checkedEventData(value: Record<string, JsonValue>) {
  if (eventDataSize(value) > MAX_PERSISTED_EVENT_DATA_BYTES) {
    throw new TileTallyHttpError(
      413,
      "board_position_too_large",
      "That reviewed board position is too detailed to save as one timeline entry.",
    );
  }
  return value;
}

function sourceData(request: GameLedgerAiApplyRequest): Record<string, JsonValue> {
  return {
    schema_version: 1,
    client: "game_ledger_web",
    reviewed: true,
    user_reviewed: true,
    user_asserted: true,
    independently_attested: false,
    provider: request.operation.provider,
    model: request.operation.model,
    proposal_event_id: request.operation.event_id,
  };
}

function rpcFailure(error: RpcError | null) {
  if (!error) return;
  const message = error.message ?? "";
  if (error.code === "40001" || /game changed after this proposal/i.test(message)) {
    throw new TileTallyHttpError(
      409,
      "stale_proposal",
      "This game changed after you reviewed the suggestion. Run it again before saving.",
    );
  }
  if (
    error.code === "PGRST202"
    || error.code === "42883"
    || /gameledger_apply_reviewed_(?:event|finish).*(?:not find|not found|does not exist|schema cache)/i.test(message)
  ) {
    throw new TileTallyHttpError(
      503,
      "ai_apply_not_configured",
      "Reviewed assistant updates are not enabled on this deployment yet.",
    );
  }
  if (error.code === "23514" || error.code === "22023") {
    throw new TileTallyHttpError(422, "invalid_reviewed_update", "That reviewed update is not valid for this game.");
  }
  throw new TileTallyHttpError(502, "ledger_write_failed", "The reviewed update could not be saved.");
}

function responseFromRpc(value: unknown, expectedEventId: string): GameLedgerAiApplyResponse {
  if (!isRecord(value) || !isRecord(value.event) || value.event.id !== expectedEventId) {
    throw new TileTallyHttpError(502, "invalid_ledger_response", "The reviewed update was saved but could not be verified.");
  }
  return {
    applied: true,
    idempotent: value.idempotent === true,
    event_id: expectedEventId,
  };
}

function commandEventData(command: Extract<GameLedgerAiCommand, { type: "append_event" }>) {
  const values = Object.fromEntries(command.counter_updates.map((update) => [update.counter_id, update.value]));
  const fields = Object.fromEntries(command.field_updates.map((update) => [update.field_id, update.value]));
  return checkedEventData({
    ...(Object.keys(values).length ? { values } : {}),
    ...(Object.keys(fields).length ? { fields } : {}),
  });
}

function finishResult(command: Extract<GameLedgerAiCommand, { type: "finish_game" }>) {
  return checkedEventData({
    ...Object.fromEntries(command.result_fields.map((field) => [field.field_id, field.value])),
    _outcome: command.outcome,
    _winner_participant_ids: command.winner_participant_ids,
  });
}

function validateReviewedObservation(
  value: GameLedgerBoardObservation,
  participantIds?: Set<string>,
) {
  let observation: GameLedgerBoardObservation;
  try {
    observation = parseBoardObservation(value);
  } catch {
    throw new TileTallyHttpError(422, "invalid_board_position", "Correct the board position before saving it.");
  }
  const referencedParticipants = [
    ...observation.cribbage.tracks.map((track) => track.participant_id),
    ...observation.word_tiles.racks.map((rack) => rack.participant_id),
  ].filter((id): id is string => id !== null);
  if (participantIds && referencedParticipants.some((id) => !participantIds.has(id))) {
    throw new TileTallyHttpError(422, "invalid_board_participant", "The board position references someone outside this game.");
  }
  return observation;
}

async function loadApplyContext(input: {
  client: SupabaseClient;
  userId: string;
  gameId: string;
  eventId: string;
}): Promise<ApplyContext> {
  const { client, userId, gameId, eventId } = input;
  const [gameResult, participantResult, lastEventResult, existingEventResult] = await Promise.all([
    client
      .from("gameledger_games")
      .select("id,status,definition,updated_at")
      .eq("id", gameId)
      .eq("owner_id", userId)
      .maybeSingle(),
    client
      .from("gameledger_participants")
      .select("id")
      .eq("game_id", gameId)
      .eq("owner_id", userId),
    client
      .from("gameledger_events")
      .select("seq")
      .eq("game_id", gameId)
      .eq("owner_id", userId)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("gameledger_events")
      .select("id")
      .eq("game_id", gameId)
      .eq("owner_id", userId)
      .eq("id", eventId)
      .maybeSingle(),
  ]);
  if (gameResult.error || participantResult.error || lastEventResult.error || existingEventResult.error) {
    throw new TileTallyHttpError(502, "ledger_unavailable", "Could not verify that reviewed update.");
  }
  if (!gameResult.data) throw new TileTallyHttpError(404, "game_not_found", "That game was not found.");
  const game = gameResult.data as {
    id: string;
    status: string;
    definition: unknown;
    updated_at: string;
  };
  const lastEvent = lastEventResult.data as { seq?: unknown } | null;
  return {
    game: {
      id: game.id,
      status: game.status,
      definition: normaliseGameProfile(game.definition),
      updated_at: game.updated_at,
    },
    participantIds: new Set((participantResult.data ?? []).flatMap((participant) => (
      typeof (participant as { id?: unknown }).id === "string"
        ? [(participant as { id: string }).id]
        : []
    ))),
    lastEventSeq: typeof lastEvent?.seq === "number" && Number.isSafeInteger(lastEvent.seq)
      ? Math.max(0, lastEvent.seq)
      : 0,
    existingEvent: Boolean(existingEventResult.data),
  };
}

async function applyEvent(
  client: SupabaseClient,
  request: GameLedgerAiApplyRequest,
  input: {
    kind: string;
    participantId: string | null;
    data: Record<string, JsonValue>;
    note: string | null;
    occurredAt: string | null;
    sourceKind: "ai.chat" | "ai.vision";
    mediaId: string | null;
  },
) {
  const { data, error } = await client.rpc("gameledger_apply_reviewed_event", {
    p_game_id: request.basis.game_id,
    p_expected_last_seq: request.basis.last_event_seq,
    p_expected_game_updated_at: request.basis.game_updated_at,
    p_event_id: request.operation.event_id,
    p_event_kind: input.kind,
    p_actor_participant_id: input.participantId,
    p_event_data: input.data,
    p_note: input.note,
    p_occurred_at: input.occurredAt,
    p_source_id: request.operation.source_id,
    p_source_kind: input.sourceKind,
    p_source_data: sourceData(request),
    p_media_id: input.mediaId,
  });
  rpcFailure(error);
  return responseFromRpc(data, request.operation.event_id);
}

async function applyFinish(
  client: SupabaseClient,
  request: Extract<GameLedgerAiApplyRequest, { kind: "chat" }>,
  command: Extract<GameLedgerAiCommand, { type: "finish_game" }>,
) {
  const { data, error } = await client.rpc("gameledger_apply_reviewed_finish", {
    p_game_id: request.basis.game_id,
    p_expected_last_seq: request.basis.last_event_seq,
    p_expected_game_updated_at: request.basis.game_updated_at,
    p_event_id: request.operation.event_id,
    p_result: finishResult(command),
    p_note: command.note,
    // The review UI does not expose dates. Use the database confirmation time
    // rather than persisting an unreviewed model/client timestamp.
    p_ended_at: null,
    p_source_id: request.operation.source_id,
    p_source_kind: "ai.chat",
    p_source_data: sourceData(request),
  });
  rpcFailure(error);
  return responseFromRpc(data, request.operation.event_id);
}

export async function applyReviewedGameLedgerProposal(input: {
  client: SupabaseClient;
  userId: string;
  request: GameLedgerAiApplyRequest;
}): Promise<GameLedgerAiApplyResponse> {
  const { client, request } = input;
  const context = await loadApplyContext({
    client,
    userId: input.userId,
    gameId: request.basis.game_id,
    eventId: request.operation.event_id,
  });
  const existingEvent = context.existingEvent;

  // Committed network retries must reach the database's idempotent path even
  // after a finish changed the game status and updated_at value.
  if (!existingEvent) {
    if (new Date(context.game.updated_at).getTime() !== new Date(request.basis.game_updated_at).getTime()) {
      throw new TileTallyHttpError(
        409,
        "stale_proposal",
        "This game changed after you reviewed the suggestion. Run it again before saving.",
      );
    }
    if (context.lastEventSeq !== request.basis.last_event_seq) {
      throw new TileTallyHttpError(
        409,
        "stale_proposal",
        "This game changed after you reviewed the suggestion. Run it again before saving.",
      );
    }
  }

  if (request.kind === "chat") {
    if (!existingEvent) {
      try {
        validateAiCommands(
          { reply: "Reviewed update", commands: [request.command], warnings: [] },
          {
            game: context.game,
            participants: Array.from(context.participantIds, (id) => ({ id })),
          },
        );
      } catch (error) {
        if (error instanceof TileTallyHttpError && error.code === "game_complete") throw error;
        throw new TileTallyHttpError(422, "invalid_reviewed_update", "That reviewed update is not valid for this game.");
      }
    }
    if (request.command.type === "finish_game") return applyFinish(client, request, request.command);
    return applyEvent(client, request, {
      kind: request.command.event_kind,
      participantId: request.command.participant_id,
      data: commandEventData(request.command),
      note: request.command.note,
      occurredAt: null,
      sourceKind: "ai.chat",
      mediaId: null,
    });
  }

  const observation = validateReviewedObservation(
    request.observation,
    existingEvent ? undefined : context.participantIds,
  );
  if (!existingEvent) {
    const { data: media, error: mediaError } = await client
      .from("gameledger_media")
      .select("id")
      .eq("id", request.mediaId)
      .eq("game_id", context.game.id)
      .eq("owner_id", input.userId)
      .eq("media_kind", "photo")
      .is("deleted_at", null)
      .maybeSingle();
    if (mediaError) throw new TileTallyHttpError(502, "media_unavailable", "Could not verify that board photo.");
    if (!media) throw new TileTallyHttpError(404, "media_not_found", "That board photo is no longer available.");
  }
  const learningNote = request.learningOptIn ? request.learningNote.trim() : "";
  return applyEvent(client, request, {
    kind: "board_position",
    participantId: null,
    data: checkedEventData({
      board_observation: observation as unknown as JsonValue,
      vision: {
        schema_version: 1,
        media_id: request.mediaId,
        learning_opt_in: request.learningOptIn,
        learning_note: learningNote,
      },
    }),
    note: observation.summary,
    occurredAt: null,
    sourceKind: "ai.vision",
    mediaId: request.mediaId,
  });
}
