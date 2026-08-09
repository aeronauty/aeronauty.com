import { expect, test } from "@playwright/test";
import { presetProfile } from "../lib/tiletally/gameProfiles";
import {
  GAME_LEDGER_CHAT_OUTPUT_JSON_SCHEMA,
  GAME_LEDGER_VISION_OUTPUT_JSON_SCHEMA,
  MAX_LEDGER_AI_COUNTER_VALUE,
  MAX_LEDGER_AI_MESSAGES,
  MAX_LEDGER_AI_MESSAGE_CHARS,
  MAX_LEDGER_AI_REQUEST_BYTES,
  MAX_LEDGER_AI_TOTAL_CHARS,
  gameLedgerAiApplyRequestSchema,
  gameLedgerAiChatRequestSchema,
  gameLedgerBoardObservationSchema,
  gameLedgerVisionRequestSchema,
  isAllowedAiCounterValue,
  normalizeRawChatModelResponse,
  parseBoardObservation,
  rawGameLedgerChatModelResponseSchema,
} from "../lib/tiletally/gameLedgerAiSchemas";
import { validateAiCommands } from "../lib/tiletally/gameLedgerAiValidation";

const GAME_ID = "20000000-0000-4000-8000-000000000001";
const MEDIA_ID = "50000000-0000-4000-8000-000000000001";
const ALICE_ID = "30000000-0000-4000-8000-000000000001";

type JsonObject = Record<string, unknown>;

function rawField(overrides: JsonObject = {}) {
  return {
    field_id: "position",
    value_kind: "text",
    text_value: "18…Nxd4",
    number_value: null,
    boolean_value: null,
    ...overrides,
  };
}

function rawAppendCommand(overrides: JsonObject = {}) {
  return {
    type: "append_event",
    game_id: GAME_ID,
    participant_id: ALICE_ID,
    event_kind: "score",
    counter_updates: [{ counter_id: "points", value: 4 }],
    field_updates: [rawField()],
    outcome: "not_applicable",
    winner_participant_ids: [],
    note: null,
    occurred_at: "2026-08-09T12:30:00.000Z",
    explanation: "Alice scored four points.",
    ...overrides,
  };
}

function rawFinishCommand(overrides: JsonObject = {}) {
  return {
    type: "finish_game",
    game_id: GAME_ID,
    participant_id: null,
    event_kind: "not_applicable",
    counter_updates: [],
    field_updates: [rawField({ field_id: "result", text_value: "1–0" })],
    outcome: "completed",
    winner_participant_ids: [ALICE_ID],
    note: "Recorded after the final move.",
    occurred_at: "2026-08-09T13:00:00.000Z",
    explanation: "Finish the selected game with Alice as the winner.",
    ...overrides,
  };
}

function rawResponse(commands: unknown[] = [rawAppendCommand()]) {
  return {
    reply: "I prepared a proposed ledger update.",
    commands,
    warnings: [],
  };
}

function emptyBoardObservation(overrides: JsonObject = {}) {
  return {
    schema_version: 1,
    board_type: "unknown",
    summary: "The board is partly obscured.",
    overall_confidence: 0.35,
    orientation: "unknown",
    cribbage: { target: null, tracks: [] },
    chess: { piece_placement: null, side_to_move: "unknown", pieces: [] },
    word_tiles: { rows: null, columns: null, tiles: [], racks: [] },
    custom: { facts: [] },
    warnings: ["The top edge is cropped."],
    ...overrides,
  };
}

function chessObservation(overrides: JsonObject = {}) {
  return emptyBoardObservation({
    board_type: "chess",
    summary: "A complete upright chess board is visible.",
    overall_confidence: 0.92,
    orientation: "upright",
    chess: {
      piece_placement: null,
      side_to_move: "unknown",
      pieces: [
        { square: "e1", color: "white", piece: "king", confidence: 0.99 },
        { square: "e8", color: "black", piece: "king", confidence: 0.99 },
      ],
    },
    warnings: [],
    ...overrides,
  });
}

function wordTileObservation(overrides: JsonObject = {}) {
  return emptyBoardObservation({
    board_type: "word_tiles",
    summary: "Three joined tiles spell CAT across the centre.",
    overall_confidence: 0.96,
    orientation: "upright",
    word_tiles: {
      rows: 15,
      columns: 15,
      tiles: [
        { row: 8, column: 7, letter: "C", is_blank: false, confidence: 0.99 },
        { row: 8, column: 8, letter: "A", is_blank: false, confidence: 0.99 },
        { row: 8, column: 9, letter: "T", is_blank: false, confidence: 0.99 },
      ],
      racks: [{ owner_label: "Alice", participant_id: ALICE_ID, letters: ["E", "R"], confidence: 0.8 }],
    },
    warnings: [],
    ...overrides,
  });
}

function strictObjectSchemaProblems(value: unknown, path = "$", seen = new Set<unknown>()): string[] {
  if (!value || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => strictObjectSchemaProblems(item, `${path}[${index}]`, seen));
  }

  const row = value as JsonObject;
  const problems: string[] = [];
  if (row.type === "object" || row.properties) {
    const properties = row.properties && typeof row.properties === "object" && !Array.isArray(row.properties)
      ? Object.keys(row.properties as JsonObject).sort()
      : [];
    const required = Array.isArray(row.required)
      ? row.required.filter((item): item is string => typeof item === "string").sort()
      : [];
    if (row.additionalProperties !== false) problems.push(`${path} must set additionalProperties:false`);
    if (JSON.stringify(required) !== JSON.stringify(properties)) {
      problems.push(`${path} must require every property (${properties.join(", ")})`);
    }
  }
  for (const [key, child] of Object.entries(row)) {
    problems.push(...strictObjectSchemaProblems(child, `${path}.${key}`, seen));
  }
  return problems;
}

test.describe("Game Ledger AI request schemas", () => {
  test("accepts bounded chat and vision requests and applies safe defaults", () => {
    expect(gameLedgerAiChatRequestSchema.parse({
      gameId: GAME_ID,
      messages: [{ role: "user", content: "  Add four points for Alice.  " }],
    })).toEqual({
      gameId: GAME_ID,
      messages: [{ role: "user", content: "Add four points for Alice." }],
    });

    expect(gameLedgerVisionRequestSchema.parse({ gameId: GAME_ID, mediaId: MEDIA_ID })).toEqual({
      gameId: GAME_ID,
      mediaId: MEDIA_ID,
      boardMode: "auto",
      customInstructions: "",
    });
    expect(MAX_LEDGER_AI_REQUEST_BYTES).toBe(128 * 1024);
  });

  test("rejects overlong, structurally ambiguous, and unsafe requests", () => {
    const tooManyMessages = Array.from({ length: MAX_LEDGER_AI_MESSAGES + 1 }, (_value, index) => ({
      role: index === MAX_LEDGER_AI_MESSAGES ? "user" : index % 2 ? "assistant" : "user",
      content: "A",
    }));
    const oversizedConversationLength = Math.ceil(MAX_LEDGER_AI_TOTAL_CHARS / MAX_LEDGER_AI_MESSAGE_CHARS) + 1;
    const tooMuchConversation = Array.from({ length: oversizedConversationLength }, (_value, index) => ({
      role: index === oversizedConversationLength - 1 ? "user" : index % 2 ? "assistant" : "user",
      content: "X".repeat(MAX_LEDGER_AI_MESSAGE_CHARS),
    }));

    expect(gameLedgerAiChatRequestSchema.safeParse({
      gameId: GAME_ID,
      messages: [{ role: "assistant", content: "The user did not send the final turn." }],
    }).success).toBe(false);
    expect(gameLedgerAiChatRequestSchema.safeParse({ gameId: GAME_ID, messages: tooManyMessages }).success).toBe(false);
    expect(gameLedgerAiChatRequestSchema.safeParse({ gameId: GAME_ID, messages: tooMuchConversation }).success).toBe(false);
    expect(gameLedgerAiChatRequestSchema.safeParse({
      gameId: GAME_ID,
      messages: [{ role: "user", content: "X".repeat(MAX_LEDGER_AI_MESSAGE_CHARS + 1) }],
    }).success).toBe(false);
    expect(gameLedgerAiChatRequestSchema.safeParse({
      gameId: GAME_ID,
      messages: [{ role: "user", content: "Unsafe\u0000message" }],
    }).success).toBe(false);
    expect(gameLedgerAiChatRequestSchema.safeParse({
      gameId: GAME_ID,
      messages: [{ role: "user", content: "Hello" }],
      unexpected: true,
    }).success).toBe(false);

    expect(gameLedgerVisionRequestSchema.safeParse({ gameId: "not-a-uuid", mediaId: MEDIA_ID }).success).toBe(false);
    expect(gameLedgerVisionRequestSchema.safeParse({
      gameId: GAME_ID,
      mediaId: MEDIA_ID,
      boardMode: "scrabble",
    }).success).toBe(false);
    expect(gameLedgerVisionRequestSchema.safeParse({
      gameId: GAME_ID,
      mediaId: MEDIA_ID,
      customInstructions: "X".repeat(2_001),
    }).success).toBe(false);
  });

  test("accepts only complete reviewed-apply envelopes", () => {
    const basis = {
      game_id: GAME_ID,
      game_updated_at: "2026-08-09T12:00:00.000Z",
      last_event_seq: 4,
    };
    const operation = {
      event_id: "60000000-0000-4000-8000-000000000001",
      source_id: "70000000-0000-4000-8000-000000000001",
      provider: "openai",
      model: "gpt-5.6",
    };
    const normalizedCommand = normalizeRawChatModelResponse(rawResponse()).commands[0];

    expect(gameLedgerAiApplyRequestSchema.safeParse({
      kind: "chat",
      basis,
      operation,
      command: normalizedCommand,
    }).success).toBe(true);
    expect(gameLedgerAiApplyRequestSchema.safeParse({
      kind: "vision",
      basis,
      operation,
      mediaId: MEDIA_ID,
      observation: chessObservation(),
      learningOptIn: true,
      learningNote: "White is nearest the camera.",
    }).success).toBe(true);
    expect(gameLedgerAiApplyRequestSchema.safeParse({
      kind: "vision",
      basis,
      operation,
      mediaId: MEDIA_ID,
      observation: chessObservation(),
      learningNote: "Legacy implicit consent must not be accepted.",
    }).success).toBe(false);
    expect(gameLedgerAiApplyRequestSchema.safeParse({
      kind: "chat",
      basis,
      operation: { ...operation, provider: "untrusted" },
      command: normalizedCommand,
    }).success).toBe(false);
    expect(gameLedgerAiApplyRequestSchema.safeParse({
      kind: "vision",
      basis,
      operation,
      mediaId: MEDIA_ID,
      observation: chessObservation(),
      learningOptIn: false,
      learningNote: "x".repeat(2_001),
    }).success).toBe(false);

    const canonicalAppend = gameLedgerAiApplyRequestSchema.parse({
      kind: "chat",
      basis,
      operation,
      command: { ...normalizedCommand, occurred_at: "2026-08-09T07:00:00.000Z" },
    });
    expect(canonicalAppend.kind).toBe("chat");
    if (canonicalAppend.kind === "chat" && canonicalAppend.command.type === "append_event") {
      expect(canonicalAppend.command.occurred_at).toBeNull();
    }

    const finishCommand = normalizeRawChatModelResponse(rawResponse([rawFinishCommand()])).commands[0];
    const canonicalFinish = gameLedgerAiApplyRequestSchema.parse({
      kind: "chat",
      basis,
      operation,
      command: { ...finishCommand, ended_at: "2026-08-09T07:30:00.000Z" },
    });
    expect(canonicalFinish.kind).toBe("chat");
    if (canonicalFinish.kind === "chat" && canonicalFinish.command.type === "finish_game") {
      expect(canonicalFinish.command.ended_at).toBeNull();
    }
  });
});

test.describe("strict model response normalization", () => {
  test("normalizes append and finish commands without retaining irrelevant scalar slots", () => {
    const normalizedAppend = normalizeRawChatModelResponse(rawResponse([
      rawAppendCommand({
        field_updates: [
          rawField(),
          rawField({
            field_id: "round",
            value_kind: "number",
            text_value: null,
            number_value: 6,
            boolean_value: null,
          }),
          rawField({
            field_id: "clean_play",
            value_kind: "boolean",
            text_value: null,
            number_value: null,
            boolean_value: false,
          }),
        ],
      }),
    ]));
    const normalizedFinish = normalizeRawChatModelResponse(rawResponse([rawFinishCommand()]));

    expect(normalizedAppend).toEqual({
      reply: "I prepared a proposed ledger update.",
      warnings: [],
      commands: [
        {
          type: "append_event",
          game_id: GAME_ID,
          participant_id: ALICE_ID,
          event_kind: "score",
          counter_updates: [{ counter_id: "points", value: 4 }],
          field_updates: [
            { field_id: "position", value: "18…Nxd4" },
            { field_id: "round", value: 6 },
            { field_id: "clean_play", value: false },
          ],
          note: null,
          occurred_at: null,
          explanation: "Alice scored four points.",
        },
      ],
    });
    expect(normalizedFinish).toEqual({
      reply: "I prepared a proposed ledger update.",
      warnings: [],
      commands: [
        {
          type: "finish_game",
          game_id: GAME_ID,
          outcome: "completed",
          winner_participant_ids: [ALICE_ID],
          result_fields: [{ field_id: "result", value: "1–0" }],
          note: "Recorded after the final move.",
          ended_at: null,
          explanation: "Finish the selected game with Alice as the winner.",
        },
      ],
    });
  });

  test("rejects mismatched or multiply populated scalar representations", () => {
    const mismatched = rawResponse([rawAppendCommand({
      field_updates: [rawField({
        value_kind: "number",
        text_value: "4",
        number_value: null,
      })],
    })]);
    const multiplyPopulated = rawResponse([rawAppendCommand({
      field_updates: [rawField({
        value_kind: "number",
        text_value: "four",
        number_value: 4,
      })],
    })]);

    expect(() => normalizeRawChatModelResponse(mismatched)).toThrow();
    expect(() => normalizeRawChatModelResponse(multiplyPopulated)).toThrow();
  });

  test("rejects unknown keys and contradictory discriminated-command fields", () => {
    expect(rawGameLedgerChatModelResponseSchema.safeParse({
      ...rawResponse(),
      hidden_write: { table: "gameledger_events" },
    }).success).toBe(false);
    expect(rawGameLedgerChatModelResponseSchema.safeParse(rawResponse([{
      ...rawAppendCommand(),
      direct_sql: "insert into gameledger_events",
    }])).success).toBe(false);
    expect(() => normalizeRawChatModelResponse(rawResponse([rawAppendCommand({
      outcome: "completed",
      winner_participant_ids: [ALICE_ID],
    })]))).toThrow();
    expect(() => normalizeRawChatModelResponse(rawResponse([rawFinishCommand({
      participant_id: ALICE_ID,
      event_kind: "score",
      counter_updates: [{ counter_id: "points", value: 121 }],
    })]))).toThrow();
    expect(() => normalizeRawChatModelResponse(rawResponse([rawFinishCommand({
      outcome: "draw",
      winner_participant_ids: [ALICE_ID],
    })]))).toThrow();
    expect(rawGameLedgerChatModelResponseSchema.safeParse(rawResponse([rawAppendCommand({
      explanation: "Unsafe\u0000explanation",
    })])).success).toBe(false);
  });
});

test.describe("profile-aware counter value validation", () => {
  test("rejects fractional integer and disallowed negative updates through validateAiCommands", () => {
    const integerCounter = {
      value_type: "integer" as const,
      input: { mode: "delta" as const, allow_negative: true },
    };
    const nonNegativeDecimalCounter = {
      value_type: "decimal" as const,
      input: { mode: "set" as const, allow_negative: false },
    };

    expect(isAllowedAiCounterValue(integerCounter, 4)).toBe(true);
    expect(isAllowedAiCounterValue(integerCounter, -4)).toBe(true);
    expect(isAllowedAiCounterValue(integerCounter, 4.5)).toBe(false);
    expect(isAllowedAiCounterValue(nonNegativeDecimalCounter, 4.5)).toBe(true);
    expect(isAllowedAiCounterValue(nonNegativeDecimalCounter, 0)).toBe(true);
    expect(isAllowedAiCounterValue(nonNegativeDecimalCounter, -0.25)).toBe(false);

    const profile = presetProfile("cribbage");
    const validationContext = {
      game: { id: GAME_ID, status: "in_progress", definition: profile },
      participants: [{ id: ALICE_ID }],
    };
    const commandWithValue = (value: number) => normalizeRawChatModelResponse(rawResponse([
      rawAppendCommand({ counter_updates: [{ counter_id: "points", value }], field_updates: [] }),
    ]));

    expect(validateAiCommands(commandWithValue(4), validationContext)).toHaveLength(1);
    expect(() => validateAiCommands(commandWithValue(4.5), validationContext)).toThrow("invalid_ai_action");

    profile.counters[0]!.value_type = "decimal";
    profile.counters[0]!.input = { ...profile.counters[0]!.input, allow_negative: false };
    expect(validateAiCommands(commandWithValue(0.25), validationContext)).toHaveLength(1);
    expect(() => validateAiCommands(commandWithValue(-0.25), validationContext)).toThrow("invalid_ai_action");
  });

  test("retains the finite, bounded numeric contract for every counter type", () => {
    const decimalCounter = {
      value_type: "decimal" as const,
      input: { mode: "delta" as const, allow_negative: true },
    };

    expect(isAllowedAiCounterValue(decimalCounter, MAX_LEDGER_AI_COUNTER_VALUE)).toBe(true);
    expect(isAllowedAiCounterValue(decimalCounter, -MAX_LEDGER_AI_COUNTER_VALUE)).toBe(true);
    expect(isAllowedAiCounterValue(decimalCounter, MAX_LEDGER_AI_COUNTER_VALUE + 1)).toBe(false);
    expect(isAllowedAiCounterValue(decimalCounter, Number.NaN)).toBe(false);
    expect(isAllowedAiCounterValue(decimalCounter, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

test.describe("board observation validation", () => {
  test("accepts cautious unknown, cribbage, chess, word-tile and custom readings", () => {
    expect(parseBoardObservation(emptyBoardObservation()).board_type).toBe("unknown");
    expect(parseBoardObservation(emptyBoardObservation({
      board_type: "cribbage",
      summary: "Two tracks and four pegs are visible.",
      overall_confidence: 0.88,
      orientation: "rotated_left",
      cribbage: {
        target: 121,
        tracks: [{
          track_label: "Blue",
          participant_id: ALICE_ID,
          score: 42,
          front_peg: 42,
          rear_peg: 38,
          confidence: 0.9,
          note: null,
        }],
      },
      warnings: [],
    }))).toMatchObject({ board_type: "cribbage", cribbage: { target: 121 } });
    expect(parseBoardObservation(chessObservation()).chess.pieces).toHaveLength(2);
    expect(parseBoardObservation(wordTileObservation()).word_tiles.tiles.map((tile) => tile.letter)).toEqual(["C", "A", "T"]);
    expect(parseBoardObservation(emptyBoardObservation({
      board_type: "custom",
      summary: "A red marker is on space twelve.",
      custom: { facts: [{ label: "Red marker", value: "12", region: "outer track", x: 0.3, y: 0.7, confidence: 0.84 }] },
    }))).toEqual(expect.objectContaining({
      board_type: "custom",
      custom: { facts: [{ label: "Red marker", value: "12", region: "outer track", confidence: 0.84 }] },
    }));
  });

  test("rejects invalid confidence, identifiers, bounds and extra top-level keys", () => {
    expect(gameLedgerBoardObservationSchema.safeParse(emptyBoardObservation({ overall_confidence: 1.01 })).success).toBe(false);
    expect(gameLedgerBoardObservationSchema.safeParse(chessObservation({
      chess: { piece_placement: null, side_to_move: "unknown", pieces: [{ square: "i9", color: "white", piece: "king", confidence: 1 }] },
    })).success).toBe(false);
    expect(gameLedgerBoardObservationSchema.safeParse(wordTileObservation({
      word_tiles: { rows: 15, columns: 15, tiles: [{ row: 0, column: 1, letter: "A", is_blank: false, confidence: 1 }], racks: [] },
    })).success).toBe(false);
    expect(gameLedgerBoardObservationSchema.safeParse(emptyBoardObservation({
      cribbage: {
        target: 121,
        tracks: [{ track_label: "Blue", participant_id: "not-a-uuid", score: 1, front_peg: 1, rear_peg: 0, confidence: 1, note: null }],
      },
    })).success).toBe(false);
    expect(gameLedgerBoardObservationSchema.safeParse({ ...emptyBoardObservation(), provider_debug: "secret" }).success).toBe(false);
  });

  test("drops unreviewed custom coordinates and canonicalizes every inactive board section", () => {
    const completeInput = {
      ...emptyBoardObservation(),
      summary: "Several valid readings were returned across the shared schema.",
      cribbage: {
        target: 121,
        tracks: [{
          track_label: "Blue",
          participant_id: ALICE_ID,
          score: 42,
          front_peg: 42,
          rear_peg: 38,
          confidence: 0.9,
          note: null,
        }],
      },
      chess: chessObservation().chess,
      word_tiles: wordTileObservation().word_tiles,
      custom: {
        facts: [{
          label: "Red marker",
          value: "12",
          region: "outer track",
          x: 0.3,
          y: 0.7,
          confidence: 0.84,
        }],
      },
    };

    const expectedEmpty = {
      cribbage: { target: null, tracks: [] },
      chess: { piece_placement: null, side_to_move: "unknown", pieces: [] },
      word_tiles: { rows: null, columns: null, tiles: [], racks: [] },
      custom: { facts: [] },
    };

    const cribbage = parseBoardObservation({ ...completeInput, board_type: "cribbage" });
    expect(cribbage.cribbage.tracks).toHaveLength(1);
    expect(cribbage).toMatchObject({
      chess: expectedEmpty.chess,
      word_tiles: expectedEmpty.word_tiles,
      custom: expectedEmpty.custom,
    });

    const chess = parseBoardObservation({ ...completeInput, board_type: "chess" });
    expect(chess.chess.pieces).toHaveLength(2);
    expect(chess).toMatchObject({
      cribbage: expectedEmpty.cribbage,
      word_tiles: expectedEmpty.word_tiles,
      custom: expectedEmpty.custom,
    });

    const wordTiles = parseBoardObservation({ ...completeInput, board_type: "word_tiles" });
    expect(wordTiles.word_tiles.tiles).toHaveLength(3);
    expect(wordTiles).toMatchObject({
      cribbage: expectedEmpty.cribbage,
      chess: expectedEmpty.chess,
      custom: expectedEmpty.custom,
    });

    for (const boardType of ["custom", "unknown"] as const) {
      const custom = parseBoardObservation({ ...completeInput, board_type: boardType });
      expect(custom.custom.facts).toEqual([{
        label: "Red marker",
        value: "12",
        region: "outer track",
        confidence: 0.84,
      }]);
      expect(custom).toMatchObject({
        cribbage: expectedEmpty.cribbage,
        chess: expectedEmpty.chess,
        word_tiles: expectedEmpty.word_tiles,
      });
    }
  });

  test("rejects duplicate occupied squares and empty or unsafe tile shapes", () => {
    const duplicateChess = chessObservation({
      chess: {
        piece_placement: null,
        side_to_move: "unknown",
        pieces: [
          { square: "e1", color: "white", piece: "king", confidence: 1 },
          { square: "e1", color: "white", piece: "queen", confidence: 0.7 },
        ],
      },
    });
    const duplicateTiles = wordTileObservation({
      word_tiles: {
        rows: 15,
        columns: 15,
        tiles: [
          { row: 8, column: 8, letter: "A", is_blank: false, confidence: 1 },
          { row: 8, column: 8, letter: "B", is_blank: false, confidence: 0.7 },
        ],
        racks: [],
      },
    });
    const emptyTile = wordTileObservation({
      word_tiles: {
        rows: 15,
        columns: 15,
        tiles: [{ row: 8, column: 8, letter: "", is_blank: false, confidence: 1 }],
        racks: [],
      },
    });
    const emptyRackLetter = wordTileObservation({
      word_tiles: {
        rows: 15,
        columns: 15,
        tiles: [],
        racks: [{ owner_label: "Alice", participant_id: ALICE_ID, letters: [""], confidence: 1 }],
      },
    });
    const outsideDeclaredGrid = wordTileObservation({
      word_tiles: {
        rows: 15,
        columns: 15,
        tiles: [{ row: 16, column: 8, letter: "A", is_blank: false, confidence: 1 }],
        racks: [],
      },
    });
    const invalidPiecePlacement = chessObservation({
      chess: {
        piece_placement: "8/8/8/8/8/8/8/9",
        side_to_move: "unknown",
        pieces: [],
      },
    });
    const placementMissingListedPiece = chessObservation({
      chess: {
        piece_placement: "4k3/8/8/8/8/8/8/4K3",
        side_to_move: "unknown",
        pieces: [{ square: "e1", color: "white", piece: "king", confidence: 1 }],
      },
    });
    const placementDisagreesWithListedPiece = chessObservation({
      chess: {
        piece_placement: "4k3/8/8/8/8/8/8/4K3",
        side_to_move: "unknown",
        pieces: [
          { square: "e1", color: "white", piece: "queen", confidence: 1 },
          { square: "e8", color: "black", piece: "king", confidence: 1 },
        ],
      },
    });

    expect(() => parseBoardObservation(duplicateChess)).toThrow();
    expect(() => parseBoardObservation(duplicateTiles)).toThrow();
    expect(() => parseBoardObservation(emptyTile)).toThrow();
    expect(() => parseBoardObservation(emptyRackLetter)).toThrow();
    expect(() => parseBoardObservation(outsideDeclaredGrid)).toThrow();
    expect(() => parseBoardObservation(invalidPiecePlacement)).toThrow();
    expect(() => parseBoardObservation(placementMissingListedPiece)).toThrow(/does not match/);
    expect(() => parseBoardObservation(placementDisagreesWithListedPiece)).toThrow(/does not match/);
    expect(parseBoardObservation(chessObservation({
      chess: {
        piece_placement: "4k3/8/8/8/8/8/8/4K3",
        side_to_move: "unknown",
        pieces: [
          { square: "e1", color: "white", piece: "king", confidence: 1 },
          { square: "e8", color: "black", piece: "king", confidence: 1 },
        ],
      },
    })).chess.piece_placement).toBe("4k3/8/8/8/8/8/8/4K3");
  });
});

test("provider JSON schemas recursively close and require every object property", () => {
  expect(strictObjectSchemaProblems(GAME_LEDGER_CHAT_OUTPUT_JSON_SCHEMA)).toEqual([]);
  expect(strictObjectSchemaProblems(GAME_LEDGER_VISION_OUTPUT_JSON_SCHEMA)).toEqual([]);
});
