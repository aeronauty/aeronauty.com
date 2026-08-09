import { isAllowedAiCounterValue } from "@/lib/tiletally/gameLedgerAiSchemas";
import type { GameLedgerAiChatProposal, GameLedgerAiCommand } from "@/lib/tiletally/gameLedgerAiTypes";
import { TileTallyHttpError } from "@/lib/tiletally/http-error";
import type {
  GameLedgerGame,
  GameLedgerParticipant,
  JsonValue,
} from "@/lib/tiletally/types";

type GameLedgerAiValidationContext = {
  game: Pick<GameLedgerGame, "id" | "status" | "definition">;
  participants: Array<Pick<GameLedgerParticipant, "id">>;
};

function valueMatchesField(value: JsonValue, type: string, options?: string[]) {
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (typeof value !== "string") return false;
  if (!value.trim()) return false;
  return type !== "select" || Boolean(options?.includes(value));
}

/**
 * Validate provider output and user-reviewed edits against the selected game's
 * authoritative definition before either can reach a ledger write.
 */
export function validateAiCommands(
  proposal: Omit<GameLedgerAiChatProposal, "basis" | "operation">,
  context: GameLedgerAiValidationContext,
): GameLedgerAiCommand[] {
  const profile = context.game.definition;
  const participantIds = new Set(context.participants.map((participant) => participant.id));
  const counters = new Map(profile.counters.map((counter) => [counter.id, counter]));
  const eventFields = new Map(profile.event_fields.map((field) => [field.id, field]));
  const resultFields = new Map(profile.result_fields.map((field) => [field.id, field]));
  if (context.game.status === "complete" && proposal.commands.length) {
    throw new TileTallyHttpError(409, "game_complete", "This game is complete, so the assistant cannot change it.");
  }

  for (const command of proposal.commands) {
    if (command.game_id !== context.game.id) {
      throw new TileTallyHttpError(502, "invalid_ai_action", "The assistant referenced the wrong game.");
    }
    if (command.type === "append_event") {
      if (command.participant_id && !participantIds.has(command.participant_id)) {
        throw new TileTallyHttpError(502, "invalid_ai_action", "The assistant referenced an unknown participant.");
      }
      const usedCounters = new Set<string>();
      for (const update of command.counter_updates) {
        const counter = counters.get(update.counter_id);
        if (
          !counter
          || usedCounters.has(update.counter_id)
          || !isAllowedAiCounterValue(counter, update.value)
        ) {
          throw new TileTallyHttpError(502, "invalid_ai_action", "The assistant proposed an invalid counter update.");
        }
        usedCounters.add(update.counter_id);
        if (counter.scope !== "game" && !command.participant_id) {
          throw new TileTallyHttpError(502, "invalid_ai_action", "A participant score needs a participant.");
        }
      }
      const usedFields = new Set<string>();
      for (const update of command.field_updates) {
        const field = eventFields.get(update.field_id);
        if (!field || usedFields.has(update.field_id) || !valueMatchesField(update.value, field.type, field.options)) {
          throw new TileTallyHttpError(502, "invalid_ai_action", "The assistant proposed an invalid game field.");
        }
        usedFields.add(update.field_id);
      }
      if (profile.event_fields.some((field) => field.required && !usedFields.has(field.id))) {
        throw new TileTallyHttpError(502, "invalid_ai_action", "The assistant omitted a required game field.");
      }
      if (!command.counter_updates.length && !command.field_updates.length && !command.note?.trim()) {
        throw new TileTallyHttpError(502, "invalid_ai_action", "The assistant proposed an empty game entry.");
      }
      continue;
    }

    const winners = new Set(command.winner_participant_ids);
    if (winners.size !== command.winner_participant_ids.length || Array.from(winners).some((id) => !participantIds.has(id))) {
      throw new TileTallyHttpError(502, "invalid_ai_action", "The assistant proposed an invalid winner.");
    }
    if ((command.outcome === "draw" || command.outcome === "abandoned") && winners.size) {
      throw new TileTallyHttpError(502, "invalid_ai_action", "A draw or abandoned game cannot have a winner.");
    }
    if (command.outcome === "draw" && profile.result?.allow_draw === false) {
      throw new TileTallyHttpError(502, "invalid_ai_action", "This game definition does not allow a draw.");
    }
    if (winners.size > 1 && profile.result?.allow_multiple_winners !== true) {
      throw new TileTallyHttpError(502, "invalid_ai_action", "This game definition does not allow co-winners.");
    }
    const usedFields = new Set<string>();
    for (const update of command.result_fields) {
      const field = resultFields.get(update.field_id);
      if (!field || usedFields.has(update.field_id) || !valueMatchesField(update.value, field.type, field.options)) {
        throw new TileTallyHttpError(502, "invalid_ai_action", "The assistant proposed an invalid result field.");
      }
      usedFields.add(update.field_id);
    }
    if (profile.result_fields.some((field) => field.required && !usedFields.has(field.id))) {
      throw new TileTallyHttpError(502, "invalid_ai_action", "The assistant omitted a required result field.");
    }
  }
  return proposal.commands;
}
