import type { Locator, Page } from "@playwright/test";
import { presetProfile } from "../lib/tiletally/gameProfiles";
import {
  expect,
  LEDGER_ACCOUNT_ID,
  test,
  type GameLedgerBackend,
  type MockLedgerEntity,
  type MockLedgerEvent,
  type MockLedgerGame,
  type MockLedgerParticipant,
} from "./helpers/game-ledger-backend";

const APP_PATH = "/apps/tile-tally";
const CREATED_AT = "2026-08-07T18:00:00.000Z";

// These values deliberately have no natural wrapping opportunities. They are
// kept at the longest length accepted by the corresponding production fields.
const LONG_GAME_TITLE = `A${"G".repeat(99)}`;
const LONG_LOCATION = `L${"O".repeat(199)}`;
const LONG_COUNTER_LABEL = `C${"O".repeat(79)}`;
const LONG_COUNTER_UNIT = `U${"N".repeat(29)}`;
const LONG_EVENT_FIELD_LABEL = `E${"V".repeat(79)}`;
const LONG_RESULT_FIELD_LABEL = `R${"S".repeat(79)}`;
const LONG_REPLAY_NOTE = `N${"O".repeat(999)}`;
const LONG_FIELD_VALUE = `V${"A".repeat(999)}`;

const VIEWPORTS = [
  { label: "extreme reflow", width: 256, height: 480 },
  { label: "narrow phone", width: 320, height: 568 },
  { label: "modern phone", width: 390, height: 844 },
  { label: "wide phone / zoomed desktop", width: 512, height: 600 },
  { label: "phone landscape", width: 667, height: 375 },
  { label: "tablet / effective 200% zoom", width: 768, height: 600 },
  { label: "desktop", width: 1280, height: 720 },
] as const;

test.describe.configure({ timeout: 90_000 });

function fixtureId(prefix: number, sequence: number) {
  return `${String(prefix).padStart(8, "0")}-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

function maximalName(index: number) {
  const prefix = `P${index}`;
  return `${prefix}${"N".repeat(80 - prefix.length)}`;
}

function profileForVisibilityTest() {
  const profile = presetProfile("custom");
  profile.name = `P${"R".repeat(99)}`;
  profile.participant = { min: 0, max: 32 };
  profile.counters = [
    {
      id: "long_participant_counter",
      label: LONG_COUNTER_LABEL,
      scope: "participant",
      value_type: "decimal",
      unit: LONG_COUNTER_UNIT,
      initial: 0,
      target: { operator: ">=", value: 10_000, finish: "suggest" },
      aggregation: "sum",
      ranking: "highest",
      input: { mode: "delta", quick_values: [1, 25, 1000, -1], allow_negative: true },
    },
    {
      id: "long_game_counter",
      label: `W${"H".repeat(79)}`,
      scope: "game",
      value_type: "decimal",
      unit: LONG_COUNTER_UNIT,
      initial: 0,
      target: null,
      aggregation: "latest",
      ranking: "none",
      input: { mode: "set", quick_values: [1, 1000], allow_negative: true },
    },
  ];
  profile.event_fields = [{
    id: "long_event_field",
    label: LONG_EVENT_FIELD_LABEL,
    type: "text",
    placeholder: LONG_FIELD_VALUE,
  }];
  profile.result_fields = [{
    id: "long_result_field",
    label: LONG_RESULT_FIELD_LABEL,
    type: "text",
    placeholder: LONG_FIELD_VALUE,
  }];
  profile.result = {
    mode: "manual",
    allow_draw: true,
    allow_multiple_winners: true,
  };
  return profile;
}

function seedMaximalLedger(backend: GameLedgerBackend) {
  const entities: MockLedgerEntity[] = Array.from({ length: 8 }, (_value, index) => ({
    id: fixtureId(10, index + 1),
    owner_id: LEDGER_ACCOUNT_ID,
    entity_type: index % 2 ? "team" : "person",
    name: maximalName(index + 1),
    metadata: {},
    archived_at: null,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  }));
  backend.entities.push(...entities);

  let participantSequence = 1;
  let eventSequence = 1;
  const profile = profileForVisibilityTest();

  for (let gameIndex = 0; gameIndex < 10; gameIndex += 1) {
    const gameId = fixtureId(20, gameIndex + 1);
    const active = gameIndex === 0;
    const titlePrefix = active ? "A" : String(gameIndex);
    const game: MockLedgerGame = {
      id: gameId,
      owner_id: LEDGER_ACCOUNT_ID,
      profile_id: null,
      profile_version: 1,
      title: active ? LONG_GAME_TITLE : `${titlePrefix}${"G".repeat(100 - titlePrefix.length)}`,
      definition: { ...profile },
      status: active ? "in_progress" : "complete",
      location: `${gameIndex}${LONG_LOCATION.slice(String(gameIndex).length)}`,
      started_at: `2026-07-${String(gameIndex + 1).padStart(2, "0")}T18:00:00.000Z`,
      ended_at: active ? null : `2026-07-${String(gameIndex + 1).padStart(2, "0")}T20:00:00.000Z`,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    };
    backend.games.push(game);

    const gameParticipants: MockLedgerParticipant[] = entities.map((entity, seatIndex) => ({
      id: fixtureId(30, participantSequence++),
      owner_id: LEDGER_ACCOUNT_ID,
      game_id: gameId,
      entity_id: entity.id,
      label: entity.name,
      seat: seatIndex + 1,
      metadata: {},
      created_at: CREATED_AT,
    }));
    backend.participants.push(...gameParticipants);

    const events: MockLedgerEvent[] = [
      {
        id: fixtureId(40, eventSequence++),
        owner_id: LEDGER_ACCOUNT_ID,
        game_id: gameId,
        actor_participant_id: gameParticipants[0]!.id,
        seq: 1,
        event_kind: "note",
        event_data: {},
        note: active ? LONG_REPLAY_NOTE : `RecordedMoment${"M".repeat(240)}`,
        occurred_at: game.started_at,
        voids_event_id: null,
        created_at: CREATED_AT,
      },
      {
        id: fixtureId(40, eventSequence++),
        owner_id: LEDGER_ACCOUNT_ID,
        game_id: gameId,
        actor_participant_id: gameParticipants[0]!.id,
        seq: 2,
        event_kind: "score",
        event_data: {
          values: { long_participant_counter: gameIndex + 10, long_game_counter: gameIndex + 100 },
          fields: { long_event_field: LONG_FIELD_VALUE },
        },
        note: active ? LONG_REPLAY_NOTE : null,
        occurred_at: `2026-07-${String(gameIndex + 1).padStart(2, "0")}T18:10:00.000Z`,
        voids_event_id: null,
        created_at: CREATED_AT,
      },
      {
        id: fixtureId(40, eventSequence++),
        owner_id: LEDGER_ACCOUNT_ID,
        game_id: gameId,
        actor_participant_id: gameParticipants[1]!.id,
        seq: 3,
        event_kind: "score",
        event_data: {
          values: { long_participant_counter: gameIndex + 5 },
          fields: { long_event_field: `F${"I".repeat(199)}` },
        },
        note: null,
        occurred_at: `2026-07-${String(gameIndex + 1).padStart(2, "0")}T18:20:00.000Z`,
        voids_event_id: null,
        created_at: CREATED_AT,
      },
    ];

    if (!active) {
      events.push({
        id: fixtureId(40, eventSequence++),
        owner_id: LEDGER_ACCOUNT_ID,
        game_id: gameId,
        actor_participant_id: null,
        seq: 4,
        event_kind: "result",
        event_data: {
          long_result_field: LONG_FIELD_VALUE,
          _outcome: "completed",
          _winner_participant_ids: [gameParticipants[0]!.id],
        },
        note: LONG_REPLAY_NOTE,
        occurred_at: game.ended_at!,
        voids_event_id: null,
        created_at: CREATED_AT,
      });
    }
    backend.events.push(...events);
  }
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

async function expectLocalHorizontalScroller(locator: Locator, label: string) {
  const dimensions = await locator.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollWidth, `${label} should own its wide content instead of widening the page`).toBeGreaterThan(dimensions.clientWidth + 1);

  const finalScrollLeft = await locator.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    return element.scrollLeft;
  });
  expect(finalScrollLeft, `${label} should be horizontally scrollable`).toBeGreaterThan(0);
  await locator.evaluate((element) => { element.scrollLeft = 0; });
}

async function expectFullyInViewport(locator: Locator, label: string) {
  await expect(locator, `${label} should be rendered`).toBeVisible();
  const geometry = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      width: rect.width,
    };
  });
  expect(geometry.width, `${label} should have a visible width`).toBeGreaterThan(0);
  expect(geometry.height, `${label} should have a visible height`).toBeGreaterThan(0);
  expect(geometry.left, `${label} should not be clipped on the left`).toBeGreaterThanOrEqual(-1);
  expect(geometry.right, `${label} should not be clipped on the right`).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.top, `${label} should not be above the viewport`).toBeGreaterThanOrEqual(-1);
  expect(geometry.bottom, `${label} should not be below the viewport`).toBeLessThanOrEqual(geometry.viewportHeight + 1);
}

async function expectTextNotClipped(locator: Locator, label: string) {
  await expect(locator, `${label} should be visible`).toBeVisible();
  const dimensions = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
      lineHeight: Number.parseFloat(style.lineHeight),
      scrollHeight: element.scrollHeight,
      scrollWidth: element.scrollWidth,
    };
  });
  expect(dimensions.scrollWidth, `${label} should wrap rather than clip horizontally`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  expect(dimensions.scrollHeight, `${label} should not be clipped vertically`).toBeLessThanOrEqual(dimensions.clientHeight + 1);
  expect(dimensions.clientHeight, `${label} should occupy multiple wrapped lines`).toBeGreaterThan(dimensions.lineHeight * 2);
}

async function openSeededLedger(page: Page, backend: GameLedgerBackend) {
  seedMaximalLedger(backend);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(APP_PATH);
  await expect(page.getByText("ledger-player@example.test", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open games", exact: true })).toBeVisible();
}

test("game library and expanded custom setup never widen the document", async ({ page, ledgerBackend }) => {
  await openSeededLedger(page, ledgerBackend);
  await expectResponsiveAtEveryViewport(page, "maximal game library");

  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What are we keeping track of?" })).toBeVisible();
  await page.getByRole("radio", { name: /^Build your own/ }).click();

  await page.getByLabel("Game name", { exact: true }).fill(`S${"E".repeat(99)}`);
  await page.getByLabel("Location").fill(LONG_LOCATION);

  const counterRegion = page.getByRole("region", { name: "Counters" });
  await counterRegion.getByLabel("Name", { exact: true }).first().fill(`C${"U".repeat(59)}`);
  await counterRegion.getByLabel(/Unit/).first().fill(LONG_COUNTER_UNIT);
  await counterRegion.getByRole("button", { name: "Add counter" }).click();
  await counterRegion.getByLabel("Name", { exact: true }).nth(1).fill(`D${"E".repeat(59)}`);

  const momentFields = page.getByRole("heading", { name: "Fields on each moment", exact: true }).locator("xpath=ancestor::section[1]");
  await momentFields.getByRole("button", { name: "Add field" }).click();
  await momentFields.getByLabel("Label", { exact: true }).fill(`M${"O".repeat(59)}`);

  const resultFields = page.getByRole("heading", { name: "Fields when finishing", exact: true }).locator("xpath=ancestor::section[1]");
  await resultFields.getByRole("button", { name: "Add field" }).click();
  await resultFields.getByLabel("Label", { exact: true }).fill(`F${"I".repeat(59)}`);

  await expectResponsiveAtEveryViewport(page, "expanded custom game setup");
});

test("active session, replay, finish panel and history keep maximal content contained", async ({ page, ledgerBackend }) => {
  await openSeededLedger(page, ledgerBackend);
  await page.getByRole("heading", { name: LONG_GAME_TITLE, level: 3, exact: true }).click();
  await expect(page.getByRole("heading", { name: LONG_GAME_TITLE, level: 2, exact: true }).first()).toBeVisible();

  await expectResponsiveAtEveryViewport(page, "active game and replay timeline");

  await page.setViewportSize({ width: 320, height: 568 });
  const replayNote = page.getByText(LONG_REPLAY_NOTE, { exact: true }).first();
  await expectTextNotClipped(replayNote, "max-length timeline note");

  const fileInputGeometry = await page.locator('input[type="file"]').evaluateAll((inputs) => inputs.map((input) => {
    const rect = input.getBoundingClientRect();
    const style = getComputedStyle(input);
    return {
      clip: style.clip,
      height: rect.height,
      overflow: style.overflow,
      position: style.position,
      width: rect.width,
    };
  }));
  expect(fileInputGeometry).toHaveLength(3);
  fileInputGeometry.forEach((geometry, index) => {
    expect(geometry.width, `hidden file input ${index + 1} width`).toBe(1);
    expect(geometry.height, `hidden file input ${index + 1} height`).toBe(1);
    expect(geometry.position, `hidden file input ${index + 1} positioning`).toBe("absolute");
    expect(["hidden", "clip"], `hidden file input ${index + 1} clipping`).toContain(geometry.overflow);
  });

  const consent = page.getByRole("checkbox", { name: /Everyone being recorded has agreed/ });
  const consentBox = await consent.boundingBox();
  expect(consentBox?.width).toBe(20);
  expect(consentBox?.height).toBe(20);

  await page.evaluate(() => {
    const probe = document.createElement("button");
    probe.id = "replay-background-probe";
    probe.textContent = "Background action";
    document.body.appendChild(probe);
  });
  const backgroundProbe = page.locator("#replay-background-probe");
  await page.setViewportSize({ width: 256, height: 480 });
  await page.getByRole("button", { name: "Replay from start" }).click();
  const replayDialog = page.getByRole("dialog", { name: new RegExp(`^Replay ${LONG_GAME_TITLE}$`) });
  await expect(replayDialog).toBeVisible();
  await expect(backgroundProbe).toHaveAttribute("inert", "");
  await expect(backgroundProbe).toHaveAttribute("aria-hidden", "true");
  await expectTextNotClipped(replayDialog.getByText(LONG_REPLAY_NOTE, { exact: true }), "max-length replay-dialog note");
  await expectFullyInViewport(replayDialog.getByRole("button", { name: "Close replay" }), "replay close button");
  await expectFullyInViewport(replayDialog.getByRole("button", { name: "Previous" }), "replay previous button");
  await expectFullyInViewport(replayDialog.getByRole("button", { name: "Next" }), "replay next button");
  await expectNoDocumentOverflow(page, "open replay dialog at 256x480");
  await replayDialog.getByRole("button", { name: "Close replay" }).click();
  await expect(backgroundProbe).not.toHaveAttribute("inert", "");
  await expect(backgroundProbe).not.toHaveAttribute("aria-hidden", "true");
  await backgroundProbe.evaluate((element) => element.remove());

  await page.getByRole("button", { name: "Finish this game" }).click();
  await expect(page.getByRole("heading", { name: `Finish ${LONG_GAME_TITLE}` })).toBeVisible();
  await expectResponsiveAtEveryViewport(page, "expanded finish panel");

  await page.getByRole("button", { name: "History & stats", exact: true }).click();
  await expect(page.getByRole("heading", { name: "History & stats", level: 1 })).toBeVisible();
  await expectResponsiveAtEveryViewport(page, "history and statistics");

  await page.setViewportSize({ width: 320, height: 568 });
  const historyTable = page.getByTestId("history-career-table");
  await expect(historyTable).toBeVisible();
  await expectLocalHorizontalScroller(historyTable.locator("xpath=parent::*"), "mobile career table");
  await expectNoDocumentOverflow(page, "history after scrolling its local table");
});

test("the physical tile table owns its horizontal space in normal and full-screen modes", async ({ page, ledgerBackend }) => {
  await openSeededLedger(page, ledgerBackend);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole("button", { name: "Tile table", exact: true }).click();
  await expect(page.getByTestId("tiles-workspace")).toBeVisible();

  const tileScroller = page.getByTestId("tile-rack");
  await expectLocalHorizontalScroller(tileScroller, "mobile tile surface");
  await tileScroller.evaluate((element) => {
    window.scrollTo({ left: 0, top: window.scrollY + element.getBoundingClientRect().top - 8 });
    element.scrollLeft = 0;
  });
  const emptyGuidance = page.getByText("Add your letters. Every tile starts loose on this single, low-friction surface.", { exact: true });
  await expectFullyInViewport(emptyGuidance, "empty tabletop guidance at initial scroll position");
  await expectNoDocumentOverflow(page, "empty mobile tile table");

  await page.locator("#rack-letters").fill("ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMN");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByTestId("rack-tile")).toHaveCount(40);
  await expectResponsiveAtEveryViewport(page, "40-tile physical table");

  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByTestId("fullscreen-toggle").click();
  const workspace = page.getByRole("dialog", { name: "Full-screen tile tabletop" });
  await expect(workspace).toHaveAttribute("data-fullscreen", "true");
  await expectFullyInViewport(workspace.getByTestId("orientation-toggle"), "full-screen orientation control");
  await expectFullyInViewport(workspace.getByTestId("shake-toggle"), "full-screen shake control");
  await expectFullyInViewport(workspace.getByTestId("fullscreen-toggle"), "full-screen exit control");
  await expectNoDocumentOverflow(page, "full-screen tile table at 320x568");

  await page.setViewportSize({ width: 667, height: 375 });
  await expectFullyInViewport(workspace.getByTestId("orientation-toggle"), "landscape full-screen orientation control");
  await expectFullyInViewport(workspace.getByTestId("shake-toggle"), "landscape full-screen shake control");
  await expectFullyInViewport(workspace.getByTestId("fullscreen-toggle"), "landscape full-screen exit control");
  await expectNoDocumentOverflow(page, "full-screen tile table at 667x375");

  await workspace.getByTestId("fullscreen-toggle").click();
  await expect(page.getByTestId("tiles-workspace")).toHaveAttribute("data-fullscreen", "false");
});
