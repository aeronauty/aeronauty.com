import { z } from "zod";

export const MAX_CHAT_MESSAGES = 16;
export const MAX_CHAT_MESSAGE_CHARS = 2_000;
export const MAX_CHAT_TOTAL_CHARS = 10_000;
export const MAX_CHAT_REQUEST_BYTES = 128 * 1024;
export const MAX_CONTROL_REQUEST_BYTES = 16 * 1024;
export const MAX_PLAYERS_PER_GAME = 8;
export const MAX_TURNS_PER_ACTION = 500;

const noControlCharacters = (value: string) =>
  !Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });

const noUnsafeMessageCharacters = (value: string) =>
  !Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
  });

const trimmedText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} is too long.`)
    .refine(noControlCharacters, `${label} contains unsupported characters.`);

export const tileTallyPlayerNameSchema = trimmedText("Player name", 80);
export const tileTallyWordSchema = trimmedText("Word", 80);

export const tileTallyDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "That date is not valid.");

export const tileTallyScoreSchema = z.number().int().min(-1_000).max(1_000);

export const tileTallyAdjustmentSchema = z
  .object({
    player: tileTallyPlayerNameSchema,
    points: tileTallyScoreSchema,
  })
  .strict();

function requireAdjustmentShape(
  value: { score: number; word?: string; is_bingo?: boolean },
  context: z.RefinementCtx,
) {
  if (value.score >= 0) return;
  if (value.word) {
    context.addIssue({
      code: "custom",
      path: ["word"],
      message: "A negative correction cannot include a word.",
    });
  }
  if (value.is_bingo) {
    context.addIssue({
      code: "custom",
      path: ["is_bingo"],
      message: "A negative correction cannot be a bingo.",
    });
  }
}

export const tileTallyTurnInputSchema = z
  .object({
    player: tileTallyPlayerNameSchema,
    score: tileTallyScoreSchema,
    word: tileTallyWordSchema.optional(),
    is_bingo: z.boolean().optional().default(false),
  })
  .strict()
  .superRefine(requireAdjustmentShape);

export const tileTallyLogGamePayloadSchema = z
  .object({
    played_on: tileTallyDateSchema.optional(),
    location: trimmedText("Location", 160).optional(),
    players: z
      .array(tileTallyPlayerNameSchema)
      .min(1)
      .max(MAX_PLAYERS_PER_GAME),
    turns: z.array(tileTallyTurnInputSchema).max(MAX_TURNS_PER_ACTION),
    adjustments: z.array(tileTallyAdjustmentSchema).max(MAX_PLAYERS_PER_GAME * 2).optional(),
    status: z.enum(["in_progress", "complete"]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.turns.length + (value.adjustments?.length ?? 0) === 0) {
      context.addIssue({
        code: "custom",
        path: ["turns"],
        message: "A game needs at least one turn or adjustment.",
      });
    }
    const normalizedPlayers = value.players.map((player) => player.toLowerCase());
    if (new Set(normalizedPlayers).size !== normalizedPlayers.length) {
      context.addIssue({
        code: "custom",
        path: ["players"],
        message: "Player names must be unique within a game.",
      });
    }

    const players = new Set(normalizedPlayers);
    value.turns.forEach((turn, index) => {
      if (!players.has(turn.player.toLowerCase())) {
        context.addIssue({
          code: "custom",
          path: ["turns", index, "player"],
          message: "Every turn must reference a listed player.",
        });
      }
    });
    value.adjustments?.forEach((adjustment, index) => {
      if (!players.has(adjustment.player.toLowerCase())) {
        context.addIssue({
          code: "custom",
          path: ["adjustments", index, "player"],
          message: "Every adjustment must reference a listed player.",
        });
      }
    });
  });

export const tileTallyGameRefSchema = z
  .string()
  .trim()
  .uuid("Choose an existing game before saving.");

export const tileTallyAddTurnPayloadSchema = z
  .object({
    game_ref: tileTallyGameRefSchema,
    player: tileTallyPlayerNameSchema,
    score: tileTallyScoreSchema,
    word: tileTallyWordSchema.optional(),
    is_bingo: z.boolean().optional().default(false),
  })
  .strict()
  .superRefine(requireAdjustmentShape);

export const tileTallyFinishGamePayloadSchema = z
  .object({
    game_ref: tileTallyGameRefSchema,
    adjustments: z.array(tileTallyAdjustmentSchema).max(MAX_PLAYERS_PER_GAME * 2).optional(),
  })
  .strict();

export const tileTallyPendingActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("log_game"), payload: tileTallyLogGamePayloadSchema }).strict(),
  z.object({ type: z.literal("add_turn"), payload: tileTallyAddTurnPayloadSchema }).strict(),
  z.object({ type: z.literal("finish_game"), payload: tileTallyFinishGamePayloadSchema }).strict(),
]);

export const tileTallyChatMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z
      .string()
      .trim()
      .min(1, "Message is required.")
      .max(MAX_CHAT_MESSAGE_CHARS, "Message is too long.")
      .refine(noUnsafeMessageCharacters, "Message contains unsupported characters."),
  })
  .strict();

export const tileTallyChatContextSchema = z
  .object({
    players: z.array(tileTallyPlayerNameSchema).max(20).optional().default([]),
  })
  .strict();

export const tileTallyChatProposeRequestSchema = z
  .object({
    mode: z.literal("propose").optional().default("propose"),
    source: z.enum(["chat", "voice"]).optional().default("chat"),
    messages: z.array(tileTallyChatMessageSchema).min(1).max(MAX_CHAT_MESSAGES),
    context: tileTallyChatContextSchema.optional().default({ players: [] }),
    rawInput: z
      .string()
      .min(1, "Voice transcript is required.")
      .max(MAX_CHAT_MESSAGE_CHARS, "Voice transcript is too long.")
      .refine((value) => value.trim().length > 0, "Voice transcript is required.")
      .refine(noUnsafeMessageCharacters, "Voice transcript contains unsupported characters.")
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const total = value.messages.reduce((sum, message) => sum + message.content.length, 0);
    if (total > MAX_CHAT_TOTAL_CHARS) {
      context.addIssue({ code: "custom", path: ["messages"], message: "Conversation is too long." });
    }
    if (value.messages[value.messages.length - 1]?.role !== "user") {
      context.addIssue({
        code: "custom",
        path: ["messages"],
        message: "The final message must be from the user.",
      });
    }
    if (value.source === "voice" && !value.rawInput) {
      context.addIssue({
        code: "custom",
        path: ["rawInput"],
        message: "Preserve the original voice transcript.",
      });
    }
    if (value.source === "chat" && value.rawInput !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["rawInput"],
        message: "rawInput is only accepted for voice transcripts.",
      });
    }
  });

export const tileTallyChatCommitRequestSchema = z
  .object({
    mode: z.literal("commit"),
    eventId: z.string().uuid(),
  })
  .strict();

export const tileTallyChatReviseRequestSchema = z
  .object({
    mode: z.literal("revise"),
    eventId: z.string().uuid(),
    action: tileTallyPendingActionSchema,
  })
  .strict();

export const tileTallyChatRejectRequestSchema = z
  .object({
    mode: z.literal("reject"),
    eventId: z.string().uuid(),
  })
  .strict();

export const tileTallyChatRequestSchema = z.union([
  tileTallyChatCommitRequestSchema,
  tileTallyChatReviseRequestSchema,
  tileTallyChatRejectRequestSchema,
  tileTallyChatProposeRequestSchema,
]);

export const tileTallyVisionRequestSchema = z
  .object({
    photoId: z.string().uuid(),
  })
  .strict();

export const tileTallyListGamesFilterSchema = z
  .object({
    played_from: tileTallyDateSchema.optional(),
    played_to: tileTallyDateSchema.optional(),
    player: tileTallyPlayerNameSchema.optional(),
    status: z.enum(["in_progress", "complete"]).optional(),
    limit: z.number().int().min(1).max(50).optional().default(20),
  })
  .strict()
  .refine(
    (value) => !value.played_from || !value.played_to || value.played_from <= value.played_to,
    { path: ["played_to"], message: "End date must not be before start date." }
  );

export type ParsedPendingAction = z.infer<typeof tileTallyPendingActionSchema>;
export type ParsedChatProposeRequest = z.infer<typeof tileTallyChatProposeRequestSchema>;
export type ParsedListGamesFilter = z.infer<typeof tileTallyListGamesFilterSchema>;
