import type { Page } from "@playwright/test";
import { presetProfile } from "../lib/tiletally/gameProfiles";
import type {
  GameLedgerAiChatProposal,
  GameLedgerBoardObservation,
  GameLedgerVisionProposal,
} from "../lib/tiletally/gameLedgerAiTypes";
import {
  expect,
  LEDGER_ACCOUNT_ID,
  test,
  type GameLedgerAiApiMock,
  type GameLedgerBackend,
  type MockLedgerGame,
} from "./helpers/game-ledger-backend";

const APP_PATH = "/apps/tile-tally";
const CREATED_AT = "2026-08-07T18:00:00.000Z";
const GAME_ID = "10000000-0000-4000-8000-000000000001";
const ALICE_ENTITY_ID = "20000000-0000-4000-8000-000000000001";
const HARRY_ENTITY_ID = "20000000-0000-4000-8000-000000000002";
const ALICE_PARTICIPANT_ID = "30000000-0000-4000-8000-000000000001";
const HARRY_PARTICIPANT_ID = "30000000-0000-4000-8000-000000000002";
const EXISTING_EVENT_ID = "40000000-0000-4000-8000-000000000001";

const CHAT_EVENT_ID = "50000000-0000-4000-8000-000000000001";
const CHAT_SOURCE_ID = "60000000-0000-4000-8000-000000000001";
const SECOND_CHAT_EVENT_ID = "50000000-0000-4000-8000-000000000002";
const SECOND_CHAT_SOURCE_ID = "60000000-0000-4000-8000-000000000002";
const VISION_EVENT_ID = "70000000-0000-4000-8000-000000000001";
const VISION_SOURCE_ID = "80000000-0000-4000-8000-000000000001";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==",
  "base64",
);

const VIEWPORTS = [
  { label: "extreme reflow", width: 256, height: 480 },
  { label: "narrow phone", width: 320, height: 568 },
  { label: "modern phone", width: 390, height: 844 },
  { label: "wide phone / zoomed desktop", width: 512, height: 600 },
  { label: "phone landscape", width: 667, height: 375 },
  { label: "tablet / effective 200% zoom", width: 768, height: 600 },
  { label: "desktop", width: 1280, height: 720 },
] as const;

test.describe.configure({ timeout: 120_000 });

function seedCribbageGame(
  backend: GameLedgerBackend,
  options: { maximalContent?: boolean } = {},
) {
  const title = options.maximalContent ? `G${"A".repeat(99)}` : "Friday cribbage";
  const alice = options.maximalContent ? `Alice${"A".repeat(75)}` : "Alice";
  const harry = options.maximalContent ? `Harry${"H".repeat(75)}` : "Harry";
  const profile = presetProfile("cribbage");
  if (options.maximalContent) {
    profile.name = `Cribbage${"P".repeat(91)}`;
    profile.counters[0]!.label = `Points${"C".repeat(74)}`;
    profile.event_fields[0]!.label = `Hand${"F".repeat(76)}`;
  }

  const game: MockLedgerGame = {
    id: GAME_ID,
    owner_id: LEDGER_ACCOUNT_ID,
    profile_id: null,
    profile_version: 1,
    title,
    definition: profile,
    status: "in_progress",
    location: options.maximalContent ? `L${"O".repeat(199)}` : "Kitchen table",
    started_at: CREATED_AT,
    ended_at: null,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  };
  backend.games.push(game);
  backend.entities.push(
    {
      id: ALICE_ENTITY_ID,
      owner_id: LEDGER_ACCOUNT_ID,
      entity_type: "person",
      name: alice,
      metadata: {},
      archived_at: null,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
    {
      id: HARRY_ENTITY_ID,
      owner_id: LEDGER_ACCOUNT_ID,
      entity_type: "person",
      name: harry,
      metadata: {},
      archived_at: null,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
  );
  backend.participants.push(
    {
      id: ALICE_PARTICIPANT_ID,
      owner_id: LEDGER_ACCOUNT_ID,
      game_id: GAME_ID,
      entity_id: ALICE_ENTITY_ID,
      label: alice,
      seat: 1,
      metadata: {},
      created_at: CREATED_AT,
    },
    {
      id: HARRY_PARTICIPANT_ID,
      owner_id: LEDGER_ACCOUNT_ID,
      game_id: GAME_ID,
      entity_id: HARRY_ENTITY_ID,
      label: harry,
      seat: 2,
      metadata: {},
      created_at: CREATED_AT,
    },
  );
  backend.events.push({
    id: EXISTING_EVENT_ID,
    owner_id: LEDGER_ACCOUNT_ID,
    game_id: GAME_ID,
    actor_participant_id: ALICE_PARTICIPANT_ID,
    seq: 1,
    event_kind: "score",
    event_data: { values: { points: 12 }, fields: { hand: "Opening hand" } },
    note: null,
    occurred_at: CREATED_AT,
    voids_event_id: null,
    created_at: CREATED_AT,
  });
  return game;
}

function operation(eventId: string, sourceId: string) {
  return {
    event_id: eventId,
    source_id: sourceId,
    provider: "openai" as const,
    model: "gpt-5-mini",
  };
}

function basis(game: MockLedgerGame, overrides: Partial<GameLedgerAiChatProposal["basis"]> = {}) {
  return {
    game_id: game.id,
    game_updated_at: game.updated_at,
    last_event_seq: 1,
    ...overrides,
  };
}

function chatProposal(
  game: MockLedgerGame,
  options: {
    eventId?: string;
    sourceId?: string;
    points?: number;
    reply?: string;
    warning?: string;
    explanation?: string;
    note?: string | null;
    proposalBasis?: GameLedgerAiChatProposal["basis"];
  } = {},
): GameLedgerAiChatProposal {
  return {
    reply: options.reply ?? "I read that as four points for Alice. Check it before saving.",
    warnings: options.warning ? [options.warning] : [],
    basis: options.proposalBasis ?? basis(game),
    operation: operation(
      options.eventId ?? CHAT_EVENT_ID,
      options.sourceId ?? CHAT_SOURCE_ID,
    ),
    commands: [{
      type: "append_event",
      game_id: game.id,
      participant_id: ALICE_PARTICIPANT_ID,
      event_kind: "score",
      counter_updates: [{ counter_id: "points", value: options.points ?? 4 }],
      field_updates: [{ field_id: "hand", value: "Pair and a run" }],
      note: options.note ?? null,
      occurred_at: null,
      explanation: options.explanation ?? "Add four points to Alice's running cribbage score.",
    }],
  };
}

function emptyObservation(
  overrides: Partial<GameLedgerBoardObservation> = {},
): GameLedgerBoardObservation {
  return {
    schema_version: 1,
    board_type: "custom",
    summary: "The red marker appears to show 12.",
    overall_confidence: 0.62,
    orientation: "upright",
    cribbage: { target: null, tracks: [] },
    chess: { piece_placement: null, side_to_move: "unknown", pieces: [] },
    word_tiles: { rows: null, columns: null, tiles: [], racks: [] },
    custom: {
      facts: [{
        label: "Red marker",
        value: "12",
        region: "upper track",
        confidence: 0.58,
      }],
    },
    warnings: ["The marker is partially obscured."],
    ...overrides,
  };
}

function visionProposal(
  game: MockLedgerGame,
  mediaId: string,
  options: {
    observation?: GameLedgerBoardObservation;
    proposalBasis?: GameLedgerVisionProposal["basis"];
    reply?: string;
  } = {},
): GameLedgerVisionProposal {
  return {
    reply: options.reply ?? "I found one board fact. Correct it before saving.",
    observation: options.observation ?? emptyObservation(),
    learned_from_count: 0,
    media_id: mediaId,
    basis: options.proposalBasis ?? basis(game),
    operation: operation(VISION_EVENT_ID, VISION_SOURCE_ID),
  };
}

async function openAssistant(page: Page, backend: GameLedgerBackend, maximalContent = false) {
  const game = seedCribbageGame(backend, { maximalContent });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(APP_PATH);
  await expect(page.getByText("ledger-player@example.test", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Game assistant", level: 1 })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Game to update", exact: true })).toHaveValue(game.id);
  return game;
}

async function sendAssistantMessage(page: Page, content: string) {
  await page.getByLabel("Message the Game Ledger assistant", { exact: true }).fill(content);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
}

async function stagePhoto(page: Page, name = "cribbage-board.png") {
  await page.locator('input[type="file"][aria-label="Choose a board photo"]').setInputFiles({
    name,
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await expect(page.getByRole("img", { name: "Normalized board photo ready for analysis" })).toBeVisible();
}

async function analyzeCustomPhoto(
  page: Page,
  ai: GameLedgerAiApiMock,
  game: MockLedgerGame,
  options: {
    observation?: GameLedgerBoardObservation;
    proposalBasis?: GameLedgerVisionProposal["basis"];
    reply?: string;
  } = {},
) {
  ai.enqueueVision((request) => {
    const requestBody = request.body as { mediaId?: unknown };
    expect(typeof requestBody.mediaId).toBe("string");
    return {
      body: visionProposal(game, requestBody.mediaId as string, options),
    };
  });
  await page.getByRole("button", { name: "Analyze board", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review board reading", level: 2 })).toBeVisible();
}

async function settleLayout(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function expectNoDocumentOverflow(page: Page, state: string) {
  await settleLayout(page);
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const viewportWidth = root.clientWidth;

    function isLocallyContained(element: HTMLElement) {
      let ancestor = element.parentElement;
      while (ancestor && ancestor !== body) {
        const style = getComputedStyle(ancestor);
        if (["auto", "scroll", "hidden", "clip"].includes(style.overflowX)) {
          const ancestorRect = ancestor.getBoundingClientRect();
          const elementRect = element.getBoundingClientRect();
          if (elementRect.left < ancestorRect.left - 1 || elementRect.right > ancestorRect.right + 1) return true;
        }
        ancestor = ancestor.parentElement;
      }
      return false;
    }

    const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ element, rect }) => (
        (rect.right > viewportWidth + 1 || rect.left < -1)
        && rect.width > 1
        && getComputedStyle(element).position !== "fixed"
        && !isLocallyContained(element)
      ))
      .sort((left, right) => Math.max(right.rect.right - viewportWidth, -right.rect.left) - Math.max(left.rect.right - viewportWidth, -left.rect.left))
      .slice(0, 8)
      .map(({ element, rect }) => ({
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === "string" ? element.className : "",
        text: (element.textContent ?? "").trim().slice(0, 72),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      }));

    return {
      bodyScrollWidth: body.scrollWidth,
      clientWidth: viewportWidth,
      offenders,
      rootScrollWidth: root.scrollWidth,
    };
  });

  expect(
    result.rootScrollWidth,
    `${state}: document overflowed ${result.rootScrollWidth - result.clientWidth}px; likely offenders: ${JSON.stringify(result.offenders)}`,
  ).toBeLessThanOrEqual(result.clientWidth + 1);
  expect(
    result.bodyScrollWidth,
    `${state}: body overflowed ${result.bodyScrollWidth - result.clientWidth}px; likely offenders: ${JSON.stringify(result.offenders)}`,
  ).toBeLessThanOrEqual(result.clientWidth + 1);
}

async function expectResponsiveAtEveryViewport(page: Page, state: string) {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expectNoDocumentOverflow(page, `${state} at ${viewport.label} (${viewport.width}x${viewport.height})`);
  }
}

async function expectTextWraps(page: Page, text: string, label: string) {
  const locator = page.getByText(text, { exact: true }).first();
  await expect(locator, `${label} should be visible`).toBeVisible();
  const dimensions = await locator.evaluate((element) => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollWidth, `${label} should wrap rather than clip horizontally`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  expect(dimensions.scrollHeight, `${label} should not be clipped vertically`).toBeLessThanOrEqual(dimensions.clientHeight + 1);
}

test("chat writes only after explicit review, supports edits, discard, and one atomic apply", async ({
  page,
  ledgerAiApi,
  ledgerBackend,
}) => {
  const game = await openAssistant(page, ledgerBackend);
  const initialEventCount = ledgerBackend.events.length;

  await expect(page.getByText(/chat content or normalized photo copy is sent to the configured AI provider \(Anthropic or OpenAI\)/)).toBeVisible();

  const boardType = page.getByLabel(/^Board type/);
  await expect(boardType).toHaveValue("auto");
  await expect(boardType.locator("option")).toHaveText([
    "Automatic from this game",
    "Cribbage board",
    "Chess board",
    "Word-tile board",
    "Custom board",
  ]);
  await expect(page.getByText("Automatic will use the Cribbage reader.", { exact: true })).toBeVisible();

  ledgerAiApi.enqueueChat({ body: chatProposal(game) });
  await sendAssistantMessage(page, "Alice scored four points");

  const review = page.getByRole("heading", { name: "Review proposed changes", level: 2 }).locator("xpath=ancestor::section[1]");
  await expect(review).toBeVisible();
  await expect(review.getByText("No ledger rows have been written.", { exact: true })).toBeVisible();
  await expect(review.getByText(/your reviewed assertion; the AI provenance does not attest/)).toBeVisible();
  expect(ledgerAiApi.count("apply")).toBe(0);
  expect(ledgerBackend.events).toHaveLength(initialEventCount);

  const firstChatRequest = ledgerAiApi.requests.find((request) => request.endpoint === "chat");
  expect(firstChatRequest).toMatchObject({
    method: "POST",
    authorization: "Bearer game-ledger-e2e-access-token",
    body: {
      gameId: game.id,
      messages: [{ role: "user", content: "Alice scored four points" }],
    },
  });

  await review.getByLabel("Add Points", { exact: true }).fill("6");
  await review.getByLabel(/^Note/).fill("Corrected after checking the pegs");
  await review.getByRole("checkbox", { name: "Add a game moment", exact: true }).uncheck();
  await expect(review.getByRole("button", { name: "Apply 0 changes", exact: true })).toBeDisabled();
  await review.getByRole("checkbox", { name: "Add a game moment", exact: true }).check();

  await review.getByRole("button", { name: "Discard proposal", exact: true }).click();
  await expect(review).toBeHidden();
  expect(ledgerAiApi.count("apply")).toBe(0);
  expect(ledgerBackend.events).toHaveLength(initialEventCount);

  ledgerAiApi.enqueueChat({
    body: chatProposal(game, {
      eventId: SECOND_CHAT_EVENT_ID,
      sourceId: SECOND_CHAT_SOURCE_ID,
      points: 4,
    }),
  });
  await sendAssistantMessage(page, "Actually, please prepare that score again");
  await expect(review).toBeVisible();
  await review.getByLabel("Add Points", { exact: true }).fill("6");
  await review.getByLabel(/^Note/).fill("Corrected after checking the pegs");

  ledgerAiApi.enqueueApply({
    status: 200,
    delayMs: 250,
    body: { applied: true, idempotent: false, event_id: SECOND_CHAT_EVENT_ID },
  });
  await review.getByRole("button", { name: "Apply 1 change", exact: true }).click();
  await expect(review.getByRole("button", { name: "Applying…", exact: true })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: `1 change saved to ${game.title}.` })).toBeVisible();
  await expect(review).toBeHidden();

  expect(ledgerAiApi.count("apply")).toBe(1);
  const applyRequest = ledgerAiApi.requests.find((request) => request.endpoint === "apply");
  expect(applyRequest).toMatchObject({
    method: "POST",
    authorization: "Bearer game-ledger-e2e-access-token",
    body: {
      kind: "chat",
      basis: basis(game),
      operation: operation(SECOND_CHAT_EVENT_ID, SECOND_CHAT_SOURCE_ID),
      command: {
        type: "append_event",
        game_id: game.id,
        participant_id: ALICE_PARTICIPANT_ID,
        counter_updates: [{ counter_id: "points", value: 6 }],
        field_updates: [{ field_id: "hand", value: "Pair and a run" }],
        note: "Corrected after checking the pegs",
      },
    },
  });
  // The mocked apply endpoint is the only write boundary in this UI test.
  expect(ledgerBackend.events).toHaveLength(initialEventCount);
});

test("stale proposal bases are blocked locally and an apply-time 409 never reports success", async ({
  page,
  ledgerAiApi,
  ledgerBackend,
}) => {
  const game = await openAssistant(page, ledgerBackend);
  const initialEventCount = ledgerBackend.events.length;
  const staleBasis = basis(game, { game_updated_at: "2026-08-07T18:00:01.000Z" });

  ledgerAiApi.enqueueChat({ body: chatProposal(game, { proposalBasis: staleBasis }) });
  await sendAssistantMessage(page, "Alice scored four");
  const review = page.getByRole("heading", { name: "Review proposed changes", level: 2 }).locator("xpath=ancestor::section[1]");
  await expect(review.getByRole("alert")).toContainText("This game changed after the proposal was prepared.");
  await expect(review.getByRole("button", { name: "Apply 1 change", exact: true })).toBeDisabled();
  expect(ledgerAiApi.count("apply")).toBe(0);
  await review.getByRole("button", { name: "Discard proposal", exact: true }).click();

  ledgerAiApi.enqueueChat({
    body: chatProposal(game, {
      eventId: SECOND_CHAT_EVENT_ID,
      sourceId: SECOND_CHAT_SOURCE_ID,
    }),
  });
  await sendAssistantMessage(page, "Prepare the score once more");
  await expect(review).toBeVisible();
  ledgerAiApi.enqueueApplyStale();
  await review.getByRole("button", { name: "Apply 1 change", exact: true }).click();

  await expect(page.getByRole("alert").filter({ hasText: "This game changed; ask the assistant again before applying anything." })).toBeVisible();
  await expect(review).toBeVisible();
  expect(ledgerAiApi.count("apply")).toBe(1);
  expect(ledgerBackend.events).toHaveLength(initialEventCount);
  await review.getByRole("button", { name: "Discard proposal", exact: true }).click();

  await page.getByLabel(/^Board type/).selectOption("custom");
  await stagePhoto(page, "stale-board.png");
  await analyzeCustomPhoto(page, ledgerAiApi, game, { proposalBasis: staleBasis });
  const boardReview = page.getByRole("heading", { name: "Review board reading", level: 2 }).locator("xpath=ancestor::section[1]");
  await expect(boardReview.getByRole("alert")).toContainText("This game changed after the photo was read.");
  await expect(boardReview.getByRole("button", { name: "Apply board position", exact: true })).toBeDisabled();
  expect(ledgerAiApi.count("apply")).toBe(1);
  expect(ledgerBackend.events).toHaveLength(initialEventCount);
});

test("a committed assistant write exposes retry sync without risking a duplicate apply", async ({
  page,
  ledgerAiApi,
  ledgerBackend,
}) => {
  const game = await openAssistant(page, ledgerBackend);
  ledgerAiApi.enqueueChat({ body: chatProposal(game) });
  await sendAssistantMessage(page, "Alice scored four points");

  ledgerBackend.failNextHistorySnapshot = true;
  ledgerAiApi.enqueueApplySuccess({ applied: true, idempotent: false, event_id: CHAT_EVENT_ID });
  const review = page.getByRole("heading", { name: "Review proposed changes", level: 2 }).locator("xpath=ancestor::section[1]");
  await review.getByRole("button", { name: "Apply 1 change", exact: true }).click();

  await expect(page.getByRole("status").filter({ hasText: "1 change was saved" })).toContainText("Retry sync before making another assistant change.");
  await expect(page.getByRole("button", { name: "Retry sync", exact: true })).toBeVisible();
  await expect(page.getByLabel("Message the Game Ledger assistant", { exact: true })).toBeDisabled();
  expect(ledgerAiApi.count("apply")).toBe(1);

  await page.getByRole("button", { name: "Retry sync", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "The latest ledger is loaded." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry sync", exact: true })).toBeHidden();
  await expect(page.getByLabel("Message the Game Ledger assistant", { exact: true })).toBeEnabled();
  expect(ledgerAiApi.count("apply")).toBe(1);
});

test("a board photo remains local until Analyze, then edited facts and opt-in learning are applied", async ({
  page,
  ledgerAiApi,
  ledgerBackend,
}) => {
  const game = await openAssistant(page, ledgerBackend);
  const initialEventCount = ledgerBackend.events.length;
  const guidance = "The red marker belongs to Alice; read the upper track clockwise.";

  await page.getByLabel(/^Board type/).selectOption("custom");
  await page.getByLabel(/^Guidance for this board/).fill(guidance);
  await stagePhoto(page);

  await expect(page.getByText("Safe analysis copy", { exact: true })).toBeVisible();
  await expect(page.getByText(/Only this copy is previewed and sent\./)).toBeVisible();
  expect(ledgerBackend.media).toHaveLength(0);
  expect(ledgerBackend.uploadedPaths).toHaveLength(0);
  expect(ledgerAiApi.count()).toBe(0);

  await analyzeCustomPhoto(page, ledgerAiApi, game);
  expect(ledgerBackend.media).toHaveLength(1);
  expect(ledgerBackend.uploadedPaths).toHaveLength(1);
  expect(ledgerBackend.media[0]).toMatchObject({
    game_id: game.id,
    media_kind: "photo",
    mime_type: "image/jpeg",
    media_data: {
      timeline_timestamp_kind: "imported_at",
      imported_at: expect.any(String),
    },
  });
  expect(ledgerBackend.media[0]!.media_data).not.toHaveProperty("captured_at");
  expect(ledgerBackend.media[0]!.storage_path).toMatch(/\/cribbage-board-analysis\.jpg$/);
  expect(ledgerAiApi.count("vision")).toBe(1);
  expect(ledgerAiApi.count("apply")).toBe(0);
  expect(ledgerBackend.events).toHaveLength(initialEventCount);

  const visionRequest = ledgerAiApi.requests.find((request) => request.endpoint === "vision");
  expect(visionRequest).toMatchObject({
    method: "POST",
    authorization: "Bearer game-ledger-e2e-access-token",
    body: {
      gameId: game.id,
      mediaId: ledgerBackend.media[0]!.id,
      boardMode: "custom",
      customInstructions: guidance,
    },
  });

  const boardReview = page.getByRole("heading", { name: "Review board reading", level: 2 }).locator("xpath=ancestor::section[1]");
  await expect(boardReview.getByText("Needs review · 62% confidence", { exact: true })).toBeVisible();
  await expect(boardReview.getByText("The marker is partially obscured.", { exact: true })).toBeVisible();
  await expect(boardReview.getByText(/your reviewed assertion, not an independently attested board state/)).toBeVisible();
  await boardReview.getByRole("textbox", { name: "Value", exact: true }).fill("14");
  await boardReview.getByRole("textbox", { name: "Summary", exact: true }).fill("Alice's corrected red-marker position is 14.");
  await boardReview.getByRole("checkbox", { name: /Remember my guidance and corrected reading/ }).check();
  expect(ledgerAiApi.count("apply")).toBe(0);
  expect(ledgerBackend.events).toHaveLength(initialEventCount);

  ledgerAiApi.enqueueApplySuccess({
    applied: true,
    idempotent: false,
    event_id: VISION_EVENT_ID,
  });
  await boardReview.getByRole("button", { name: "Apply board position", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: `Reviewed board position saved to ${game.title}.` })).toBeVisible();
  await expect(boardReview).toBeHidden();

  const applyRequest = ledgerAiApi.requests.find((request) => request.endpoint === "apply");
  expect(applyRequest).toMatchObject({
    method: "POST",
    authorization: "Bearer game-ledger-e2e-access-token",
    body: {
      kind: "vision",
      basis: basis(game),
      operation: operation(VISION_EVENT_ID, VISION_SOURCE_ID),
      mediaId: ledgerBackend.media[0]!.id,
      learningOptIn: true,
      learningNote: guidance,
      observation: {
        board_type: "custom",
        summary: "Alice's corrected red-marker position is 14.",
        custom: {
          facts: [{
            label: "Red marker",
            value: "14",
            region: "upper track",
            confidence: 1,
          }],
        },
      },
    },
  });
  expect(ledgerAiApi.count("apply")).toBe(1);
  expect(ledgerBackend.events).toHaveLength(initialEventCount);
});

test("editing a chess piece regenerates the read-only FEN before apply", async ({
  page,
  ledgerAiApi,
  ledgerBackend,
}) => {
  const game = await openAssistant(page, ledgerBackend);
  const observation = emptyObservation({
    board_type: "chess",
    summary: "Both kings are visible on a complete board.",
    overall_confidence: 0.95,
    chess: {
      piece_placement: "4k3/8/8/8/8/8/8/4K3",
      side_to_move: "unknown",
      pieces: [
        { square: "e8", color: "black", piece: "king", confidence: 0.99 },
        { square: "e1", color: "white", piece: "king", confidence: 0.8 },
      ],
    },
    custom: { facts: [] },
    warnings: [],
  });

  await page.getByLabel(/^Board type/).selectOption("chess");
  await stagePhoto(page, "chess-board.png");
  await analyzeCustomPhoto(page, ledgerAiApi, game, { observation });

  const review = page.getByRole("heading", { name: "Review board reading", level: 2 }).locator("xpath=ancestor::section[1]");
  const placement = review.getByLabel(/^Piece placement/);
  await expect(placement).toHaveAttribute("readonly", "");
  await review.getByLabel("Square", { exact: true }).nth(1).fill("d1");
  await expect(placement).toHaveValue("4k3/8/8/8/8/8/8/3K4");

  ledgerAiApi.enqueueApplySuccess({ applied: true, idempotent: false, event_id: VISION_EVENT_ID });
  await review.getByRole("button", { name: "Apply board position", exact: true }).click();
  const applyRequest = ledgerAiApi.requests.findLast((request) => request.endpoint === "apply");
  expect(applyRequest?.body).toMatchObject({
    kind: "vision",
    observation: {
      chess: {
        piece_placement: "4k3/8/8/8/8/8/8/3K4",
        pieces: expect.arrayContaining([
          expect.objectContaining({ square: "d1", color: "white", piece: "king" }),
        ]),
      },
    },
  });
});

test("an apply-time stale response keeps an edited board reading unsaved for review", async ({
  page,
  ledgerAiApi,
  ledgerBackend,
}) => {
  const game = await openAssistant(page, ledgerBackend);
  const initialEventCount = ledgerBackend.events.length;
  await page.getByLabel(/^Board type/).selectOption("custom");
  await stagePhoto(page, "race-board.png");
  await analyzeCustomPhoto(page, ledgerAiApi, game);

  const boardReview = page.getByRole("heading", { name: "Review board reading", level: 2 }).locator("xpath=ancestor::section[1]");
  await boardReview.getByRole("textbox", { name: "Value", exact: true }).fill("15");
  ledgerAiApi.enqueueApplyStale("A newer event changed the board basis.");
  await boardReview.getByRole("button", { name: "Apply board position", exact: true }).click();

  await expect(page.getByRole("alert").filter({ hasText: "This game changed; analyze the board again before applying anything." })).toBeVisible();
  await expect(boardReview).toBeVisible();
  await expect(boardReview.getByRole("textbox", { name: "Value", exact: true })).toHaveValue("15");
  expect(ledgerAiApi.count("apply")).toBe(1);
  expect(ledgerAiApi.requests.findLast((request) => request.endpoint === "apply")?.body).toMatchObject({
    kind: "vision",
    learningOptIn: false,
    learningNote: "",
  });
  expect(ledgerBackend.events).toHaveLength(initialEventCount);
});

test("maximal assistant replies, proposals, warnings, and edited board facts never widen the page", async ({
  page,
  ledgerAiApi,
  ledgerBackend,
}) => {
  const game = await openAssistant(page, ledgerBackend, true);
  const longReply = `R${"E".repeat(3_999)}`;
  const longWarning = `W${"A".repeat(999)}`;
  const longExplanation = `X${"P".repeat(1_999)}`;
  const longNote = `N${"O".repeat(1_999)}`;

  ledgerAiApi.enqueueChat({
    body: chatProposal(game, {
      reply: longReply,
      warning: longWarning,
      explanation: longExplanation,
      note: longNote,
    }),
  });
  await sendAssistantMessage(page, `U${"S".repeat(3_999)}`);
  await expect(page.getByRole("heading", { name: "Review proposed changes", level: 2 })).toBeVisible();
  await expectResponsiveAtEveryViewport(page, "maximal chat proposal");
  await page.setViewportSize({ width: 256, height: 480 });
  await expectTextWraps(page, longReply, "max-length assistant reply");
  await expectTextWraps(page, longWarning, "max-length assistant warning");
  await expectTextWraps(page, longExplanation, "max-length command explanation");

  await page.getByRole("button", { name: "Discard proposal", exact: true }).click();
  await page.getByLabel(/^Board type/).selectOption("custom");
  await page.getByLabel(/^Guidance for this board/).fill(`G${"U".repeat(1_999)}`);
  await stagePhoto(page, `B${"O".repeat(58)}.png`);

  const longSummary = `S${"U".repeat(1_999)}`;
  const longFactLabel = `F${"A".repeat(159)}`;
  const longFactValue = `V${"A".repeat(1_999)}`;
  const longRegion = `R${"G".repeat(159)}`;
  const observation = emptyObservation({
    summary: longSummary,
    warnings: [longWarning],
    custom: {
      facts: [{
        label: longFactLabel,
        value: longFactValue,
        region: longRegion,
        confidence: 0.01,
      }],
    },
  });
  await analyzeCustomPhoto(page, ledgerAiApi, game, {
    observation,
    reply: `P${"H".repeat(3_999)}`,
  });
  await expectResponsiveAtEveryViewport(page, "maximal board-reading review");
  await page.setViewportSize({ width: 256, height: 480 });
  await expectTextWraps(page, longWarning, "max-length board warning");
  await expectNoDocumentOverflow(page, "edited maximal board reading at 256x480");
});
