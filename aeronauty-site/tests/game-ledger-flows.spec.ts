import type { Locator, Page } from "@playwright/test";
import { expect, test, type GameLedgerBackend } from "./helpers/game-ledger-backend";

const APP_PATH = "/apps/tile-tally";

test.describe.configure({ timeout: 60_000 });

async function openEmptyLedger(page: Page) {
  await page.goto(APP_PATH);
  await expect(page.getByText("ledger-player@example.test", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What are we keeping track of?" })).toBeVisible();
}

async function addEntity(page: Page, name: string, type = "person") {
  const input = page.getByPlaceholder("Add a person or team");
  await page.getByLabel("New participant type").selectOption(type);
  await input.fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(input).toHaveValue("");
  const choice = page.locator("label").filter({ hasText: name }).filter({ has: page.locator('input[type="checkbox"]') });
  await expect(choice.getByRole("checkbox")).toBeChecked();
}

async function addTwoPeople(page: Page) {
  await addEntity(page, "Alice");
  await addEntity(page, "Harry");
}

async function choosePreset(page: Page, name: RegExp) {
  const preset = page.getByRole("radio", { name });
  await preset.click();
  await expect(preset).toHaveAttribute("aria-checked", "true");
}

async function startGame(page: Page, title: string) {
  await page.getByLabel("Game name", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Start game ledger" }).click();
  await expect(page.getByRole("heading", { name: title }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "All games" })).toBeVisible();
}

function scoreboardCard(page: Page, participant: string) {
  return page.locator('[aria-label="Running totals"]').getByRole("button").filter({ hasText: participant });
}

function sectionForHeading(page: Page, heading: string): Locator {
  return page.getByRole("heading", { name: heading, exact: true }).locator("xpath=ancestor::section[1]");
}

async function reopenAfterReload(page: Page, gameTitle: string) {
  await page.reload();
  await expect(page.getByRole("heading", { name: "Open games" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(gameTitle) }).click();
  await expect(page.getByRole("heading", { name: gameTitle }).first()).toBeVisible();
}

test("Cribbage keeps quick scores, targets, reloads, immutable voids and a final result", async ({
  page,
  ledgerBackend,
}) => {
  await openEmptyLedger(page);
  await addTwoPeople(page);
  await choosePreset(page, /^Cribbage/);
  await startGame(page, "Friday Cribbage");

  await page.getByLabel("Quick Points values").getByRole("button", { name: "+4", exact: true }).click();
  await page.getByRole("button", { name: "Save moment" }).click();
  await expect(scoreboardCard(page, "Alice").getByText("4", { exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Harry", exact: true })).toBeChecked();

  await page.getByLabel("Quick Points values").getByRole("button", { name: "+3", exact: true }).click();
  await page.getByRole("button", { name: "Save moment" }).click();
  await expect(scoreboardCard(page, "Harry").getByText("3", { exact: true })).toBeVisible();

  await page.getByRole("radio", { name: "Alice", exact: true }).check();
  await page.getByRole("spinbutton", { name: /Add Points/ }).fill("117");
  await page.getByRole("button", { name: "Save moment" }).click();
  await expect(scoreboardCard(page, "Alice").getByText("121", { exact: true })).toBeVisible();
  await expect(scoreboardCard(page, "Alice").getByText("target reached", { exact: true })).toBeVisible();

  await reopenAfterReload(page, "Friday Cribbage");
  await expect(scoreboardCard(page, "Alice").getByText("121", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Undo last" }).click();
  await expect(scoreboardCard(page, "Alice").getByText("4", { exact: true })).toBeVisible();
  await expect(page.getByText("Entry undone", { exact: true })).toBeVisible();
  const voidEvent = ledgerBackend.events.at(-1);
  expect(voidEvent).toMatchObject({ event_kind: "void" });
  expect(voidEvent?.voids_event_id).toBe(ledgerBackend.events[2]?.id);
  expect(ledgerBackend.events).toHaveLength(4);

  await page.getByRole("radio", { name: "Alice", exact: true }).check();
  await page.getByRole("spinbutton", { name: /Add Points/ }).fill("117");
  await page.getByRole("button", { name: "Save moment" }).click();
  await expect(scoreboardCard(page, "Alice").getByText("121", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Finish this game" }).click();
  await expect(page.getByRole("heading", { name: "Finish Friday Cribbage" })).toBeVisible();
  await expect(sectionForHeading(page, "Finish Friday Cribbage").getByRole("radio", { name: "Alice", exact: true })).toBeChecked();
  await page.getByLabel("Final note").fill("Alice pegged out on the final hand.");
  await page.getByRole("button", { name: "Save result and finish" }).click();

  await expect(page.getByText("Complete", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add what just happened" })).toHaveCount(0);
  await expect(page.getByLabel("Add a note")).toHaveCount(0);
  expect(ledgerBackend.games[0]).toMatchObject({ status: "complete" });
  expect(ledgerBackend.events.at(-1)).toMatchObject({
    event_kind: "result",
    note: "Alice pegged out on the final hand.",
    event_data: {
      _outcome: "completed",
      _winner_participant_ids: [ledgerBackend.participants[0]?.id],
    },
  });

  await page.getByRole("button", { name: "All games" }).click();
  await expect(page.getByRole("heading", { name: "Past games" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Friday Cribbage/ })).toContainText("Complete");
});

test("retries committed start, moment and finish operations with the same idempotency IDs", async ({
  page,
  ledgerBackend,
}) => {
  await openEmptyLedger(page);
  await addEntity(page, "Alice");

  ledgerBackend.loseNextStartResponse = true;
  await page.getByLabel("Game name", { exact: true }).fill("Resilient tally");
  const startButton = page.getByRole("button", { name: "Start game ledger" });
  await startButton.click();
  await expect.poll(() => ledgerBackend.games.length).toBe(1);
  await expect(startButton).toBeEnabled();
  await startButton.click();
  await expect(page.getByRole("heading", { name: "Resilient tally" }).first()).toBeVisible();
  expect(ledgerBackend.games).toHaveLength(1);
  expect(ledgerBackend.participants).toHaveLength(1);
  expect(ledgerBackend.startOperationIds).toHaveLength(2);
  expect(new Set(ledgerBackend.startOperationIds).size).toBe(1);

  ledgerBackend.loseNextAppendResponse = true;
  await page.getByRole("spinbutton", { name: /Add Points/ }).fill("5");
  const saveMoment = page.getByRole("button", { name: "Save moment" });
  await saveMoment.click();
  await expect.poll(() => ledgerBackend.events.length).toBe(1);
  await expect(saveMoment).toBeEnabled();
  await saveMoment.click();
  await expect(scoreboardCard(page, "Alice").getByText("5", { exact: true })).toBeVisible();
  expect(ledgerBackend.events).toHaveLength(1);
  expect(ledgerBackend.appendOperationIds).toHaveLength(2);
  expect(new Set(ledgerBackend.appendOperationIds).size).toBe(1);

  await page.getByRole("button", { name: "Finish this game" }).click();
  ledgerBackend.loseNextFinishResponse = true;
  const finishButton = page.getByRole("button", { name: "Save result and finish" });
  await finishButton.click();
  await expect.poll(() => ledgerBackend.games[0]?.status).toBe("complete");
  await expect(finishButton).toBeEnabled();
  await finishButton.click();
  await expect(page.getByText("Complete", { exact: true }).first()).toBeVisible();
  expect(ledgerBackend.events.filter((event) => event.event_kind === "result")).toHaveLength(1);
  expect(ledgerBackend.finishOperationIds).toHaveLength(2);
  expect(new Set(ledgerBackend.finishOperationIds).size).toBe(1);
});

test("Chess is a scoreless journal and stores an explicit result", async ({ page, ledgerBackend }) => {
  await openEmptyLedger(page);
  await addTwoPeople(page);
  await choosePreset(page, /^Chess \/ match/);
  const whiteSeat = page.getByRole("combobox", { name: "White", exact: true });
  const blackSeat = page.getByRole("combobox", { name: "Black", exact: true });
  await expect(whiteSeat).toHaveValue(ledgerBackend.entities[0]!.id);
  await expect(blackSeat).toHaveValue(ledgerBackend.entities[1]!.id);
  await whiteSeat.selectOption({ label: "Harry" });
  await expect(blackSeat).toHaveValue(ledgerBackend.entities[0]!.id);
  await startGame(page, "Kitchen Chess");

  await expect(page.getByText(/This game is a journal/)).toBeVisible();
  await expect(page.getByText("White: Harry", { exact: true })).toBeVisible();
  await expect(page.getByText("Black: Alice", { exact: true })).toBeVisible();
  const moment = sectionForHeading(page, "Add what just happened");
  await expect(moment.getByRole("spinbutton")).toHaveCount(0);
  await moment.getByLabel(/Move \/ position/).fill("18…Nxd4");
  await moment.getByLabel(/Note/).fill("The queens came off.");
  await moment.getByRole("button", { name: "Save moment" }).click();
  await expect(page.getByText("Move / position: 18…Nxd4 · The queens came off.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Finish this game" }).click();
  const finish = sectionForHeading(page, "Finish Kitchen Chess");
  await finish.getByRole("combobox", { name: "Result", exact: true }).selectOption({ label: "1–0" });
  await expect(finish.getByRole("combobox", { name: "Outcome", exact: true })).toHaveCount(0);
  await expect(finish.getByRole("checkbox", { name: "Alice", exact: true })).toHaveCount(0);
  await finish.getByLabel("Final note").fill("White won after 42 moves.");
  await finish.getByRole("button", { name: "Save result and finish" }).click();

  await expect(page.getByText("Complete", { exact: true }).first()).toBeVisible();
  expect(ledgerBackend.games[0]?.definition).toMatchObject({ preset: "chess", counters: [] });
  expect(ledgerBackend.participants).toMatchObject([
    { entity_id: ledgerBackend.entities[1]!.id, seat: 1, metadata: { role_id: "white", role_label: "White" } },
    { entity_id: ledgerBackend.entities[0]!.id, seat: 2, metadata: { role_id: "black", role_label: "Black" } },
  ]);
  expect(ledgerBackend.events[0]?.event_data).toEqual({
    fields: { position: "18…Nxd4" },
  });
  expect(ledgerBackend.events.at(-1)).toMatchObject({
    event_kind: "result",
    event_data: {
      result: "1–0",
      _outcome: "completed",
      _winner_participant_ids: [ledgerBackend.participants[0]?.id],
    },
  });
});

test("a no-draw definition never persists a tied or abandoned winner", async ({ page, ledgerBackend }) => {
  await openEmptyLedger(page);
  await addTwoPeople(page);
  await choosePreset(page, /^Cribbage/);
  await page.getByRole("button", { name: /Customize counters and fields/ }).click();
  await page.getByLabel(/Target optional/).fill("8");
  await startGame(page, "No-draw match");
  await expect(page.getByRole("heading", { name: "Race to 8" })).toBeVisible();

  await page.getByLabel("Quick Points values").getByRole("button", { name: "+4", exact: true }).click();
  await page.getByRole("button", { name: "Save moment" }).click();
  await page.getByLabel("Quick Points values").getByRole("button", { name: "+4", exact: true }).click();
  await page.getByRole("button", { name: "Save moment" }).click();

  await page.getByRole("button", { name: "Finish this game" }).click();
  const finish = sectionForHeading(page, "Finish No-draw match");
  await expect(finish.getByLabel("Outcome")).toHaveValue("completed");
  await expect(finish.getByRole("option", { name: "Draw" })).toHaveCount(0);
  const aliceWinner = finish.getByRole("radio", { name: "Alice", exact: true });
  await expect(aliceWinner).not.toBeChecked();
  await expect(finish.getByRole("radio", { name: "Harry", exact: true })).not.toBeChecked();

  await finish.locator("label").filter({ hasText: /^Alice$/ }).click();
  await expect(aliceWinner).toBeChecked();
  await finish.getByLabel("Outcome").selectOption("abandoned");
  await finish.getByRole("button", { name: "Save result and finish" }).click();
  expect(ledgerBackend.events.at(-1)?.event_data).toMatchObject({
    _outcome: "abandoned",
    _winner_participant_ids: [],
  });
});

test("a custom definition persists renamed decimal, game-wide counters and typed fields", async ({
  page,
  ledgerBackend,
}) => {
  await openEmptyLedger(page);
  await addTwoPeople(page);
  await choosePreset(page, /^Build your own/);

  const counters = page.getByRole("region", { name: "Counters" });
  await counters.getByLabel("Name", { exact: true }).first().fill("Quarter points");
  await counters.getByLabel(/Unit/).first().fill("stars");
  await counters.getByLabel(/Quick values/).first().fill("0.5, 1.25, -0.25");
  await counters.getByRole("button", { name: "Add counter" }).click();
  const secondCounterName = counters.getByLabel("Name", { exact: true }).nth(1);
  await secondCounterName.fill("Table pot");
  await counters.getByLabel(/Unit/).nth(1).fill("chips");
  const counterSelects = counters.locator("select");
  await counterSelects.nth(4).selectOption({ label: "The whole game" });
  await counterSelects.nth(5).selectOption({ label: "Use latest value" });
  await counterSelects.nth(6).selectOption({ label: "No winner" });
  await counters.getByLabel(/Quick values/).nth(1).fill("10, 42.5");

  const momentFields = sectionForHeading(page, "Fields on each moment");
  await momentFields.getByRole("button", { name: "Add field" }).click();
  await momentFields.getByLabel("Label", { exact: true }).fill("Table condition");
  await page.getByRole("combobox", { name: "Type", exact: true }).selectOption({ label: "Choice" });
  await page.getByLabel(/Choices/).fill("Dry, Damp, Flooded");

  const resultFields = sectionForHeading(page, "Fields when finishing");
  await resultFields.getByRole("button", { name: "Add field" }).click();
  await resultFields.getByLabel("Label", { exact: true }).fill("Match summary");

  await startGame(page, "Garden Championship");
  await page.getByRole("spinbutton", { name: /Quarter points/ }).fill("1.25");
  await page.getByRole("spinbutton", { name: /Table pot/ }).fill("42.5");
  await page.getByLabel(/Table condition/).selectOption({ label: "Damp" });
  await page.getByRole("button", { name: "Save moment" }).click();

  await expect(scoreboardCard(page, "Alice").getByText("1.25", { exact: true })).toBeVisible();
  const wholeGame = page.locator('[aria-label="Running totals"]').getByText("Whole game", { exact: true }).locator("..");
  await expect(wholeGame.getByText("42.5", { exact: true })).toBeVisible();
  await expect(page.getByText(/Table condition: Damp/).first()).toBeVisible();

  const storedCounters = ledgerBackend.games[0]?.definition.counters as JsonRecord[];
  expect(storedCounters).toEqual(expect.arrayContaining([
    expect.objectContaining({
      label: "Quarter points",
      scope: "participant",
      value_type: "decimal",
      unit: "stars",
      input: expect.objectContaining({ quick_values: [0.5, 1.25, -0.25] }),
    }),
    expect.objectContaining({
      label: "Table pot",
      scope: "game",
      aggregation: "latest",
      ranking: "none",
      unit: "chips",
    }),
  ]));
  expect(ledgerBackend.games[0]?.definition.event_fields).toEqual([
    expect.objectContaining({ label: "Table condition", type: "select", options: ["Dry", "Damp", "Flooded"] }),
  ]);
  expect(ledgerBackend.games[0]?.definition.result_fields).toEqual([
    expect.objectContaining({ label: "Match summary", type: "text" }),
  ]);
  expect(ledgerBackend.events[0]?.event_data).toEqual({
    values: { points: 1.25, counter: 42.5 },
    fields: { field: "Damp" },
  });

  await reopenAfterReload(page, "Garden Championship");
  await expect(scoreboardCard(page, "Alice").getByText("1.25", { exact: true })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: /Table pot/ })).toBeVisible();
});

test("required yes/no fields need an explicit answer for moments and results", async ({
  page,
  ledgerBackend,
}) => {
  await openEmptyLedger(page);
  await addEntity(page, "Alice");
  await choosePreset(page, /^Build your own/);

  const momentFields = sectionForHeading(page, "Fields on each moment");
  await momentFields.getByRole("button", { name: "Add field" }).click();
  await momentFields.getByLabel("Label", { exact: true }).fill("Clean play");
  await page.getByRole("combobox", { name: "Type", exact: true }).first().selectOption({ label: "Yes / no" });
  await page.getByRole("checkbox", { name: "Required", exact: true }).first().check();

  const resultFields = sectionForHeading(page, "Fields when finishing");
  await resultFields.getByRole("button", { name: "Add field" }).click();
  await resultFields.getByLabel("Label", { exact: true }).fill("Rules confirmed");
  await page.getByRole("combobox", { name: "Type", exact: true }).last().selectOption({ label: "Yes / no" });
  await page.getByRole("checkbox", { name: "Required", exact: true }).last().check();

  await startGame(page, "Boolean choices");
  const cleanPlay = page.getByRole("combobox", { name: "Clean play", exact: true });
  await page.getByRole("button", { name: "Save moment" }).click();
  await expect(cleanPlay).toHaveAttribute("required", "");
  expect(ledgerBackend.events).toHaveLength(0);
  await cleanPlay.selectOption({ label: "No" });
  await page.getByRole("button", { name: "Save moment" }).click();
  await expect(page.getByText("Clean play: No", { exact: true })).toBeVisible();
  expect(ledgerBackend.events[0]?.event_data).toEqual({ fields: { field: false } });

  await page.getByRole("button", { name: "Finish this game" }).click();
  const rulesConfirmed = page.getByRole("combobox", { name: "Rules confirmed", exact: true });
  await page.getByRole("button", { name: "Save result and finish" }).click();
  await expect(rulesConfirmed).toHaveAttribute("required", "");
  expect(ledgerBackend.games[0]?.status).toBe("in_progress");
  await rulesConfirmed.selectOption({ label: "Yes" });
  await page.getByRole("button", { name: "Save result and finish" }).click();
  expect(ledgerBackend.events.at(-1)?.event_data).toMatchObject({ field: true });
});

test("required text fields reject whitespace and store trimmed values", async ({
  page,
  ledgerBackend,
}) => {
  await openEmptyLedger(page);
  await addEntity(page, "Alice");
  await choosePreset(page, /^Build your own/);

  const momentFields = sectionForHeading(page, "Fields on each moment");
  await momentFields.getByRole("button", { name: "Add field" }).click();
  await momentFields.getByLabel("Label", { exact: true }).fill("Moment reason");
  await page.getByRole("checkbox", { name: "Required", exact: true }).first().check();

  const resultFields = sectionForHeading(page, "Fields when finishing");
  await resultFields.getByRole("button", { name: "Add field" }).click();
  await resultFields.getByLabel("Label", { exact: true }).fill("Final record");
  await page.getByRole("checkbox", { name: "Required", exact: true }).last().check();

  await startGame(page, "Trimmed fields");
  const momentReason = page.getByRole("textbox", { name: "Moment reason", exact: true });
  await momentReason.fill("   ");
  await page.getByRole("button", { name: "Save moment" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Moment reason is required." })).toBeVisible();
  expect(ledgerBackend.events).toHaveLength(0);
  await momentReason.fill("  fair play  ");
  await page.getByRole("button", { name: "Save moment" }).click();
  await expect(page.getByText("Moment reason: fair play", { exact: true })).toBeVisible();
  expect(ledgerBackend.events[0]?.event_data).toEqual({ fields: { field: "fair play" } });

  await page.getByRole("button", { name: "Finish this game" }).click();
  const finalRecord = page.getByRole("textbox", { name: "Final record", exact: true });
  await finalRecord.fill("   ");
  await page.getByRole("button", { name: "Save result and finish" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Final record is required." })).toBeVisible();
  expect(ledgerBackend.games[0]?.status).toBe("in_progress");
  await finalRecord.fill("  recorded  ");
  await page.getByRole("button", { name: "Save result and finish" }).click();
  expect(ledgerBackend.events.at(-1)?.event_data).toMatchObject({ field: "recorded" });
});

test("custom open workflow states remain visible without enabling in-progress writes", async ({
  page,
  ledgerBackend,
}) => {
  await openEmptyLedger(page);
  await addEntity(page, "Alice");
  await startGame(page, "Paused match");
  ledgerBackend.games[0]!.status = "awaiting_review";

  await page.reload();
  await expect(page.getByRole("heading", { name: "Open games" })).toBeVisible();
  const gameCard = page.getByRole("button", { name: /Paused match/ });
  await expect(gameCard).toContainText("Awaiting Review");
  await gameCard.click();
  await expect(page.getByText("Awaiting Review", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add what just happened" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Finish this game" })).toHaveCount(0);
});

test("mobile-safe capture gates on consent, enforces limits and replays private media", async ({
  page,
  ledgerBackend,
}) => {
  await openEmptyLedger(page);
  await addEntity(page, "Alice");
  await startGame(page, "Photo diary");

  const takePhoto = page.getByRole("button", { name: /Take photo/ });
  const recordClip = page.getByRole("button", { name: /Record clip/ });
  await expect(takePhoto).toBeDisabled();
  await expect(recordClip).toBeDisabled();
  await expect(page.getByText(/Nothing records in the background/)).toBeVisible();
  await expect(page.getByLabel("Take a photo")).toHaveAttribute("capture", "environment");
  await expect(page.getByLabel("Record a video clip")).toHaveAttribute("capture", "environment");
  await expect(page.getByText(/Videos ≤ 1:00 and 45 MB/)).toBeVisible();

  await page.getByRole("checkbox", { name: /Everyone being recorded has agreed/ }).check();
  await expect(takePhoto).toBeEnabled();
  await expect(recordClip).toBeEnabled();

  await page.getByLabel("Take a photo").setInputFiles({
    name: "withdrawn.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("staged-only"),
  });
  await expect(page.getByText("Photo preview", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: /Everyone being recorded has agreed/ }).uncheck();
  await expect(page.getByText("Photo preview", { exact: true })).toHaveCount(0);
  expect(ledgerBackend.media).toHaveLength(0);
  await page.getByRole("checkbox", { name: /Everyone being recorded has agreed/ }).check();

  const libraryInput = page.getByLabel("Choose a photo or video");
  await libraryInput.setInputFiles({
    name: "too-large.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.alloc(12 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert").filter({ hasText: "Choose one under 12 MB" })).toBeVisible();

  await page.getByLabel("Take a photo").setInputFiles({
    name: "camera-capture.jpg",
    mimeType: "",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await expect(page.getByText("Photo preview", { exact: true })).toBeVisible();
  await expect(page.getByText("camera-capture.jpg", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add to timeline" }).click();

  await expect.poll(() => ledgerBackend.uploadedPaths.length).toBe(1);
  await expect(page.getByText("Photo", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByText(/1\/20 media/)).toBeVisible();
  expect(ledgerBackend.media[0]).toMatchObject({
    game_id: ledgerBackend.games[0]?.id,
    media_kind: "photo",
    mime_type: "image/jpeg",
  });

  ledgerBackend.failSignedUrls = true;
  await reopenAfterReload(page, "Photo diary");
  await expect(page.getByText("Private photo unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: /private media previews are unavailable/i })).toBeVisible();
  ledgerBackend.failSignedUrls = false;
  await reopenAfterReload(page, "Photo diary");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.getByLabel("Add a note").fill("Alice reached the final corner.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Alice reached the final corner.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2 recorded moments" })).toBeVisible();

  await page.getByRole("button", { name: "Replay from start" }).click();
  const replay = page.getByRole("dialog", { name: "Replay Photo diary" });
  await expect(replay).toBeVisible();
  await expect(replay.getByText("Moment 1 of 2", { exact: true })).toBeVisible();
  await replay.getByRole("button", { name: "Next" }).click();
  await expect(replay.getByText("Alice reached the final corner.", { exact: true })).toBeVisible();
  await replay.getByRole("button", { name: "Done" }).click();
  await expect(replay).toHaveCount(0);

  await page.getByRole("button", { name: "Remove", exact: true }).click();
  const confirmation = page.getByRole("group", { name: "Confirm media removal" });
  await expect(confirmation).toContainText("Remove this photo from the session?");
  await confirmation.getByRole("button", { name: "Remove media" }).click();
  await expect(page.getByText("Photo", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/0\/20 media/)).toBeVisible();
  expect(ledgerBackend.removedPaths).toEqual([ledgerBackend.media[0]?.storage_path]);
  expect(ledgerBackend.media[0]?.deleted_at).not.toBeNull();
});

test("a lost media-reservation response recovers with one stable reservation", async ({
  page,
  ledgerBackend,
}) => {
  await openEmptyLedger(page);
  await addEntity(page, "Alice");
  await startGame(page, "Reservation retry");
  await page.getByRole("checkbox", { name: /Everyone being recorded has agreed/ }).check();
  ledgerBackend.loseNextMediaReservationResponse = true;

  await page.getByLabel("Take a photo").setInputFiles({
    name: "retry.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Add to timeline" }).click();
  await expect.poll(() => ledgerBackend.media.length).toBe(1);
  await expect.poll(() => ledgerBackend.uploadedPaths.length).toBe(1);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(ledgerBackend.media).toHaveLength(1);
  expect(ledgerBackend.mediaReservationIds).toHaveLength(1);
  expect(new Set(ledgerBackend.mediaReservationIds).size).toBe(1);
});

test("an interrupted upload removes partial bytes and releases its media reservation", async ({
  page,
  ledgerBackend,
}) => {
  await openEmptyLedger(page);
  await addEntity(page, "Alice");
  await startGame(page, "Cleanup check");
  await page.getByRole("checkbox", { name: /Everyone being recorded has agreed/ }).check();
  ledgerBackend.failNextUpload = true;

  await page.getByLabel("Choose a photo or video").setInputFiles({
    name: "interrupted.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Add to timeline" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Simulated upload interruption" }).first()).toBeVisible();
  await expect.poll(() => ledgerBackend.removedPaths.length).toBe(1);
  expect(ledgerBackend.media).toHaveLength(1);
  expect(ledgerBackend.media[0]?.deleted_at).not.toBeNull();
  await expect(page.getByText(/0\/20 media/)).toBeVisible();
});

test("an interrupted upload still tombstones its reservation when byte removal fails", async ({
  page,
  ledgerBackend,
}) => {
  await openEmptyLedger(page);
  await addEntity(page, "Alice");
  await startGame(page, "Cleanup fallback");
  await page.getByRole("checkbox", { name: /Everyone being recorded has agreed/ }).check();
  ledgerBackend.failNextUpload = true;
  ledgerBackend.failNextRemove = true;

  await page.getByLabel("Choose a photo or video").setInputFiles({
    name: "cleanup-fallback.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Add to timeline" }).click();

  await expect(page.getByRole("alert").filter({ hasText: /Automatic cleanup also failed.*storage removal/i }).first()).toBeVisible();
  await expect.poll(() => ledgerBackend.tombstonedMediaIds.length).toBe(1);
  expect(ledgerBackend.removedPaths).toHaveLength(0);
  expect(ledgerBackend.media).toHaveLength(1);
  expect(ledgerBackend.media[0]?.deleted_at).not.toBeNull();
  await expect(page.getByText(/0\/20 media/)).toBeVisible();
});

type JsonRecord = Record<string, unknown>;
