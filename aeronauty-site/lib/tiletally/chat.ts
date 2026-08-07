import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  anthropicText,
  anthropicToolUses,
  callTileTallyClaude,
  getTileTallyClaudeModel,
  type AnthropicContentBlock,
  type AnthropicMessage,
} from "@/lib/tiletally/anthropic";
import { listGamesForTileTally } from "@/lib/tiletally/games";
import { TileTallyHttpError } from "@/lib/tiletally/http";
import {
  createPendingIngestEvent,
  recordNonWriteIngestEvent,
} from "@/lib/tiletally/ingest";
import type { ParsedChatProposeRequest } from "@/lib/tiletally/schemas";
import {
  isTileTallyWriteTool,
  parseListGamesFilter,
  parseTileTallyWriteAction,
  TILE_TALLY_TOOLS,
} from "@/lib/tiletally/tools";
import type { TileTallyProposal } from "@/lib/tiletally/types";

const MAX_TOOL_ROUNDS = 5;
const MAX_TOOL_RESULT_CHARS = 120_000;

function localDate(): string {
  const timeZone = process.env.TILETALLY_TIME_ZONE ?? "Europe/Berlin";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function chatSystemPrompt(players: string[]): string {
  return `You are the Tile Tally scorekeeper. Today is ${localDate()}.

You may read only real data returned by list_games. Never invent games, totals, turns, dates, words, player ids, or statistics. For add_turn and finish_game, call list_games first and copy the exact game id into game_ref.

When the user asks to record data, emit exactly one of log_game, add_turn, or finish_game. A write tool is only a PROPOSAL: the application will show it for editing and explicit confirmation. Never claim it was saved. If the user gives only final scores, preserve those values as one turn per player; do not fabricate intermediate turns. Preserve stated words and bingo flags. Use adjustments only for explicit score corrections or leftover-tile adjustments. If important information is ambiguous, ask a short question instead of guessing.

For a question about history or statistics, call list_games and calculate the answer solely from its structured rows. Totals are sums of turn scores, including adjustment rows. Mention when a result is based on a limited filter.

Known player names for context: ${JSON.stringify(players)}.`;
}

function asAssistantBlocks(content: AnthropicContentBlock[]): Array<Record<string, unknown>> {
  return content.map((block) => ({ ...block }));
}

function toolResultBlock(toolUseId: string, content: string, isError = false) {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content,
    ...(isError ? { is_error: true } : {}),
  };
}

function normalizeProviderMessages(
  messages: ParsedChatProposeRequest["messages"]
): AnthropicMessage[] {
  const firstUser = messages.findIndex((message) => message.role === "user");
  const normalized: AnthropicMessage[] = [];
  for (const message of messages.slice(Math.max(0, firstUser))) {
    const previous = normalized[normalized.length - 1];
    if (previous?.role === message.role && typeof previous.content === "string") {
      previous.content = `${previous.content}\n\n${message.content}`;
    } else {
      normalized.push({ role: message.role, content: message.content });
    }
  }
  return normalized;
}

export async function proposeTileTallyChat(input: {
  client: SupabaseClient;
  request: ParsedChatProposeRequest;
  userId: string;
}): Promise<TileTallyProposal> {
  const model = getTileTallyClaudeModel("chat");
  const providerMessages = normalizeProviderMessages(input.request.messages);
  const rawInput =
    input.request.source === "voice"
      ? input.request.rawInput!
      : input.request.messages[input.request.messages.length - 1].content;
  let inputTokens = 0;
  let outputTokens = 0;
  let usedModel = model;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await callTileTallyClaude({
        userId: input.userId,
        model,
        system: chatSystemPrompt(input.request.context.players),
        messages: providerMessages,
        tools: TILE_TALLY_TOOLS,
      });
      inputTokens += response.inputTokens;
      outputTokens += response.outputTokens;
      usedModel = response.model || model;

      const reply = anthropicText(response.content);
      const toolUses = anthropicToolUses(response.content);
      if (toolUses.length === 0) {
        if (!reply) {
          throw new TileTallyHttpError(502, "ai_empty_response", "Tile Tally AI returned no answer.");
        }
        await recordNonWriteIngestEvent(input.client, {
          inputTokens,
          model: usedModel,
          outputTokens,
          ownerId: input.userId,
          rawInput,
          source: input.request.source,
          status: "answered",
        });
        return { reply };
      }

      const readUses = toolUses.filter((tool) => tool.name === "list_games");
      const writeUses = toolUses.filter((tool) => isTileTallyWriteTool(tool.name));

      // A write emitted in parallel with a read could not have seen that read's
      // result. Execute the read and require a fresh, informed proposal.
      if (readUses.length === 0 && writeUses.length > 0) {
        if (writeUses.length !== 1 || toolUses.length !== 1) {
          throw new TileTallyHttpError(
            502,
            "ambiguous_ai_action",
            "Tile Tally AI proposed more than one change."
          );
        }
        const write = writeUses[0];
        if (!isTileTallyWriteTool(write.name)) {
          throw new TileTallyHttpError(502, "invalid_ai_action", "Tile Tally AI proposed invalid data.");
        }
        const action = parseTileTallyWriteAction(write.name, write.input);
        if (!action) {
          throw new TileTallyHttpError(502, "invalid_ai_action", "Tile Tally AI proposed invalid data.");
        }
        const eventId = await createPendingIngestEvent(input.client, {
          action,
          inputTokens,
          model: usedModel,
          outputTokens,
          ownerId: input.userId,
          rawInput,
          source: input.request.source,
        });
        return {
          reply: reply || "I prepared this entry. Check it carefully, then choose Save.",
          action,
          eventId,
        };
      }

      const results: Array<Record<string, unknown>> = [];
      for (const tool of toolUses) {
        if (tool.name !== "list_games") {
          results.push(
            toolResultBlock(
              tool.id,
              "That write proposal was made before the requested game data was available. Read the result, then propose exactly one write tool.",
              true
            )
          );
          continue;
        }

        const filter = parseListGamesFilter(tool.input);
        if (!filter.success) {
          results.push(toolResultBlock(tool.id, "Invalid list_games filter.", true));
          continue;
        }

        const listed = await listGamesForTileTally(input.client, filter.data);
        const serialized = JSON.stringify(listed);
        if (serialized.length > MAX_TOOL_RESULT_CHARS) {
          results.push(
            toolResultBlock(
              tool.id,
              "The result is too large. Call list_games again with a narrower date, player, status, or limit filter.",
              true
            )
          );
        } else {
          results.push(toolResultBlock(tool.id, serialized));
        }
      }

      providerMessages.push({ role: "assistant", content: asAssistantBlocks(response.content) });
      providerMessages.push({ role: "user", content: results });
    }

    throw new TileTallyHttpError(
      502,
      "ai_tool_loop_limit",
      "Tile Tally AI could not finish that request safely."
    );
  } catch (error) {
    if (inputTokens + outputTokens > 0) {
      await recordNonWriteIngestEvent(input.client, {
        inputTokens,
        model: usedModel,
        outputTokens,
        ownerId: input.userId,
        rawInput,
        source: input.request.source,
        status: "failed",
      }).catch(() => undefined);
    }
    throw error;
  }
}
