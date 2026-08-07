import "server-only";
import type { AnthropicToolDefinition } from "@/lib/tiletally/anthropic";
import {
  tileTallyAddTurnPayloadSchema,
  tileTallyFinishGamePayloadSchema,
  tileTallyListGamesFilterSchema,
  tileTallyLogGamePayloadSchema,
} from "@/lib/tiletally/schemas";
import type { TileTallyPendingAction } from "@/lib/tiletally/types";

const PLAYER_NAME = { type: "string", minLength: 1, maxLength: 80 } as const;
const SCORE = { type: "integer", minimum: -1000, maximum: 1000 } as const;
const ADJUSTMENTS = {
  type: "array",
  maxItems: 16,
  items: {
    type: "object",
    additionalProperties: false,
    properties: { player: PLAYER_NAME, points: SCORE },
    required: ["player", "points"],
  },
} as const;

// Anthropic strict tool mode rejects several JSON Schema constraints used here
// (including numeric bounds). Keep the rich schemas as model guidance and rely
// on the Zod parsers below as the authoritative boundary before any write.
export const TILE_TALLY_TOOLS: AnthropicToolDefinition[] = [
  {
    name: "log_game",
    description:
      "Propose one new Tile Tally game. Use each supplied score as a turn; never invent intermediate turns. This is only a proposal until the user confirms it.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        played_on: { type: "string", format: "date" },
        location: { type: "string", minLength: 1, maxLength: 160 },
        players: { type: "array", minItems: 1, maxItems: 8, items: PLAYER_NAME },
        turns: {
          type: "array",
          maxItems: 500,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              player: PLAYER_NAME,
              score: SCORE,
              word: { type: "string", minLength: 1, maxLength: 80 },
              is_bingo: { type: "boolean" },
            },
            required: ["player", "score"],
          },
        },
        adjustments: ADJUSTMENTS,
        status: { type: "string", enum: ["in_progress", "complete"] },
      },
      required: ["players", "turns", "status"],
    },
  },
  {
    name: "add_turn",
    description:
      "Propose one turn for an existing game. Obtain the exact game id with list_games first. This is only a proposal until the user confirms it.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        game_ref: { type: "string", format: "uuid" },
        player: PLAYER_NAME,
        score: SCORE,
        word: { type: "string", minLength: 1, maxLength: 80 },
        is_bingo: { type: "boolean" },
      },
      required: ["game_ref", "player", "score"],
    },
  },
  {
    name: "finish_game",
    description:
      "Propose finishing an existing in-progress game, optionally with leftover-tile adjustment rows. Obtain its exact id with list_games first. This is only a proposal until confirmed.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        game_ref: { type: "string", format: "uuid" },
        adjustments: ADJUSTMENTS,
      },
      required: ["game_ref"],
    },
  },
  {
    name: "list_games",
    description:
      "Read the signed-in user's real games and turn-level data. Use this before answering statistics questions or choosing an existing game. Never guess a statistic.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        played_from: { type: "string", format: "date" },
        played_to: { type: "string", format: "date" },
        player: PLAYER_NAME,
        status: { type: "string", enum: ["in_progress", "complete"] },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
  },
];

export const TILE_TALLY_VISION_TOOLS = TILE_TALLY_TOOLS.filter(
  (tool) => tool.name === "log_game"
);

export type TileTallyWriteToolName = "log_game" | "add_turn" | "finish_game";

export function isTileTallyWriteTool(name: string): name is TileTallyWriteToolName {
  return name === "log_game" || name === "add_turn" || name === "finish_game";
}

export function parseTileTallyWriteAction(
  type: TileTallyWriteToolName,
  payload: unknown
): TileTallyPendingAction | null {
  if (type === "log_game") {
    const parsed = tileTallyLogGamePayloadSchema.safeParse(payload);
    return parsed.success ? { type, payload: parsed.data } : null;
  }
  if (type === "add_turn") {
    const parsed = tileTallyAddTurnPayloadSchema.safeParse(payload);
    return parsed.success ? { type, payload: parsed.data } : null;
  }
  const parsed = tileTallyFinishGamePayloadSchema.safeParse(payload);
  return parsed.success ? { type, payload: parsed.data } : null;
}

export function parseListGamesFilter(input: unknown) {
  return tileTallyListGamesFilterSchema.safeParse(input);
}
