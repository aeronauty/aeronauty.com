import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  gameLedgerContextForPrompt,
  loadGameLedgerAiContext,
  validateAiCommands,
} from "@/lib/tiletally/gameLedgerAiContext";
import {
  GAME_LEDGER_CHAT_OUTPUT_JSON_SCHEMA,
  normalizeRawChatModelResponse,
} from "@/lib/tiletally/gameLedgerAiSchemas";
import type {
  GameLedgerAiChatMessage,
  GameLedgerAiChatProposal,
} from "@/lib/tiletally/gameLedgerAiTypes";
import { TileTallyHttpError } from "@/lib/tiletally/http";
import { reserveAiRequest } from "@/lib/tiletally/rate-limit";
import { callStructuredAi } from "@/lib/tiletally/structuredAi";

function systemInstructions(contextJson: string) {
  return `You are the private Game Ledger assistant for exactly one selected game.

The selected game context is authoritative JSON below. Never invent game IDs, participant IDs, counter IDs, field IDs, scores, results, moves, dates, or prior events. Answer questions only from this context. When the user asks to record something, return exactly one proposed command; the application will show it for editing and explicit confirmation. If the request would require multiple ledger events, ask the user which one to record first. Never claim a command has already been saved.

Rules for append_event:
- Use only participants, counters, and event fields present in the selected definition.
- For a counter whose aggregation is "sum", the value is a DELTA for this moment, not a new total. For latest/min/max, the value is the observed value.
- Counter values must be whole numbers when value_type is "integer", and must not be negative when input.allow_negative is false.
- Use participant_id null only for notes or game-scoped counters. Participant-scoped counters need the exact participant UUID.
- If the user gives an absolute total for a sum counter, subtract the current total only when both values are explicit and unambiguous; explain that conversion.
- Preserve the user's words in note/fields. Do not calculate game-specific points unless the user supplied them.
- Use event_kind note for prose only, score when counters change, and moment for fields or mixed entries.
- Always return occurred_at null. The ledger records the moment the user confirms the reviewed update.

Rules for finish_game:
- Propose it only when the user explicitly asks to finish/end/record a result.
- Respect allow_draw and allow_multiple_winners. An abandoned game has no winner.
- Never infer a final result merely because a target appears reached.
- Always return occurred_at null for a finish command too; the ledger records confirmation time.

If anything needed for a safe update is ambiguous, ask one concise question and return no commands. A normal informational answer also has no commands. Warnings should identify assumptions the user must check.

SELECTED GAME CONTEXT:
${contextJson}`;
}

export async function proposeGameLedgerChat(input: {
  client: SupabaseClient;
  gameId: string;
  messages: GameLedgerAiChatMessage[];
  userId: string;
}): Promise<GameLedgerAiChatProposal> {
  await reserveAiRequest(input.userId);
  const context = await loadGameLedgerAiContext(input.client, input.gameId);
  const result = await callStructuredAi({
    kind: "chat",
    userId: input.userId,
    requestAlreadyReserved: true,
    instructions: systemInstructions(gameLedgerContextForPrompt(context)),
    messages: input.messages,
    schemaName: "game_ledger_proposal",
    schema: GAME_LEDGER_CHAT_OUTPUT_JSON_SCHEMA as Record<string, unknown>,
  });
  let normalized: ReturnType<typeof normalizeRawChatModelResponse>;
  try {
    normalized = normalizeRawChatModelResponse(result.value);
    validateAiCommands(normalized, context);
  } catch (error) {
    if (error instanceof TileTallyHttpError) throw error;
    throw new TileTallyHttpError(502, "invalid_ai_action", "The assistant returned an unsafe game update.");
  }
  return {
    ...normalized,
    basis: {
      game_id: context.game.id,
      game_updated_at: context.game.updated_at,
      last_event_seq: context.lastEventSeq,
    },
    operation: {
      event_id: randomUUID(),
      source_id: randomUUID(),
      provider: result.provider,
      model: result.model,
    },
  };
}
