import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./helpers/game-ledger-backend";

const APP_PATH = "/apps/tile-tally";

test.describe.configure({ timeout: 60_000 });

async function openEmptyLedger(page: Page) {
  await page.goto(APP_PATH);
  await expect(page.getByText("ledger-player@example.test", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What are we keeping track of?" })).toBeVisible();
}

async function addPerson(page: Page, name: string) {
  const input = page.getByPlaceholder("Add a person or team");
  await page.getByLabel("New participant type").selectOption("person");
  await input.fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(input).toHaveValue("");

  const choice = page.locator("label")
    .filter({ hasText: name })
    .filter({ has: page.locator('input[type="checkbox"]') });
  await expect(choice.getByRole("checkbox")).toBeChecked();
}

async function startOpenTally(page: Page, title: string, startedAt: string) {
  const openTally = page.getByRole("radio", { name: /^Open tally/ });
  await openTally.click();
  await expect(openTally).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("Game name", { exact: true }).fill(title);
  await page.getByLabel("Started", { exact: true }).fill(startedAt);
  await page.getByRole("button", { name: "Start game ledger" }).click();
  await expect(page.getByRole("heading", { name: title }).first()).toBeVisible();
}

function scoreboardCard(page: Page, participant: string) {
  return page.locator('[aria-label="Running totals"]')
    .getByRole("button")
    .filter({ hasText: participant });
}

async function recordScore(page: Page, participant: string, score: number) {
  const card = scoreboardCard(page, participant);
  await card.click();
  await page.getByRole("spinbutton", { name: /Add Points/ }).fill(String(score));
  await page.getByRole("button", { name: "Save moment" }).click();
  await expect(card.getByText(String(score), { exact: true })).toBeVisible();
}

function sectionForHeading(page: Page, heading: string): Locator {
  return page.getByRole("heading", { name: heading, exact: true }).locator("xpath=ancestor::section[1]");
}

async function finishWithWinner(page: Page, title: string, winner: string) {
  await page.getByRole("button", { name: "Finish this game" }).click();
  const finish = sectionForHeading(page, `Finish ${title}`);
  await finish.getByRole("radio", { name: winner, exact: true }).check();
  await expect(finish.getByRole("radio", { name: winner, exact: true })).toBeChecked();
  await finish.getByRole("button", { name: "Save result and finish" }).click();
  await expect(page.getByText("Complete", { exact: true }).first()).toBeVisible();
}

async function createSecondGame(page: Page) {
  await page.getByRole("button", { name: "All games" }).click();
  await expect(page.getByRole("heading", { name: "Past games" })).toBeVisible();
  await page.getByRole("button", { name: "New game" }).click();
  await expect(page.getByRole("heading", { name: "What are we keeping track of?" })).toBeVisible();
}

function historyRow(page: Page, entityId: string) {
  return page.getByTestId(`history-person-${entityId}`);
}

async function expectCareerRow(
  row: Locator,
  expected: {
    name: string;
    games: string;
    record: string;
    total: string;
    average: string;
    best: string;
    streak: string;
  },
) {
  await expect(row.getByRole("rowheader")).toContainText(expected.name);
  const cells = row.getByRole("cell");
  await expect(cells.nth(0)).toHaveText(expected.games);
  await expect(cells.nth(1)).toHaveText(expected.record);
  await expect(cells.nth(2)).toHaveText(expected.total);
  await expect(cells.nth(3)).toHaveText(expected.average);
  await expect(cells.nth(4)).toHaveText(expected.best);
  await expect(cells.nth(5)).toHaveText(expected.streak);
}

test("builds cumulative history, recalculates a subhistory and remains usable on a phone", async ({
  page,
  ledgerBackend,
}, testInfo) => {
  await openEmptyLedger(page);
  await addPerson(page, "Alice");
  await addPerson(page, "Harry");

  await startOpenTally(page, "Opening match", "2026-07-01T19:00");
  await recordScore(page, "Alice", 10);
  await recordScore(page, "Harry", 4);
  await finishWithWinner(page, "Opening match", "Alice");

  await createSecondGame(page);
  await startOpenTally(page, "Return match", "2026-07-08T19:00");
  await recordScore(page, "Alice", 3);
  await recordScore(page, "Harry", 8);
  await finishWithWinner(page, "Return match", "Harry");

  expect(ledgerBackend.games).toHaveLength(2);
  expect(ledgerBackend.events.filter((event) => event.event_kind === "result").map((event) => event.event_data)).toEqual([
    expect.objectContaining({
      _outcome: "completed",
      _winner_participant_ids: [ledgerBackend.participants[0]?.id],
    }),
    expect.objectContaining({
      _outcome: "completed",
      _winner_participant_ids: [ledgerBackend.participants[3]?.id],
    }),
  ]);

  const historyTab = page.getByRole("button", { name: "History & stats" });
  await historyTab.click();
  await expect(historyTab).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "History & stats", level: 1 })).toBeVisible();
  await expect(page.getByText("Totals and facts are deterministic—no AI guesses.")).toBeVisible();
  await expect(page.getByTestId("history-filter-count")).toHaveText("2 of 2 games in this subhistory");

  const table = page.getByTestId("history-career-table");
  await expect(table.getByRole("columnheader", { name: "W–D–L" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Cumulative points" })).toBeVisible();
  await expectCareerRow(historyRow(page, ledgerBackend.entities[0]!.id), {
    name: "Alice",
    games: "2",
    record: "1–0–1",
    total: "13 pts",
    average: "6.5 pts",
    best: "10 pts",
    streak: "0 now · 1 best",
  });
  await expectCareerRow(historyRow(page, ledgerBackend.entities[1]!.id), {
    name: "Harry",
    games: "2",
    record: "1–0–1",
    total: "12 pts",
    average: "6 pts",
    best: "8 pts",
    streak: "1 now · 1 best",
  });

  const chart = page.getByRole("img", { name: /Running Points totals over 2 games/ });
  await expect(chart).toBeVisible();
  const facts = page.getByRole("region", { name: "Interesting facts" });
  await expect(facts).toContainText("Alice has the highest cumulative points (13 pts).");
  await expect(facts).toContainText("The highest single-game points is 10 pts.");
  await expect(facts).toContainText("Alice, Harry have the most recorded wins (1).");

  const aliceFilter = page.getByRole("checkbox", { name: "Alice", exact: true });
  const harryFilter = page.getByRole("checkbox", { name: "Harry", exact: true });
  await aliceFilter.locator("xpath=ancestor::label[1]").click();
  await harryFilter.locator("xpath=ancestor::label[1]").click();
  await expect(aliceFilter).toBeChecked();
  await expect(harryFilter).toBeChecked();
  await expect(page.getByTestId("history-filter-count")).toHaveText("2 of 2 games in this subhistory");

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(aliceFilter).not.toBeChecked();
  await expect(harryFilter).not.toBeChecked();
  await page.getByLabel("History period").selectOption({ label: "Latest game" });
  await expect(page.getByTestId("history-filter-count")).toHaveText("1 of 2 games in this subhistory");
  await expectCareerRow(historyRow(page, ledgerBackend.entities[0]!.id), {
    name: "Alice",
    games: "1",
    record: "0–0–1",
    total: "3 pts",
    average: "3 pts",
    best: "3 pts",
    streak: "—",
  });
  await expectCareerRow(historyRow(page, ledgerBackend.entities[1]!.id), {
    name: "Harry",
    games: "1",
    record: "1–0–0",
    total: "8 pts",
    average: "8 pts",
    best: "8 pts",
    streak: "1 now · 1 best",
  });
  await expect(facts).toContainText("Harry has the highest cumulative points (8 pts).");
  await expect(page.getByRole("img", { name: /Running Points totals over 1 games/ })).toBeVisible();

  if (testInfo.project.name === "webkit-mobile") {
    const period = page.getByLabel("History period");
    const periodBox = await period.boundingBox();
    expect(periodBox?.height ?? 0).toBeGreaterThanOrEqual(40);

    // Keep overflow diagnostics attached to this assertion so a mobile regression
    // names the responsible element instead of only reporting a wide document.
    const pageOverflow = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map((element) => ({
          element,
          rect: element.getBoundingClientRect(),
        }))
        .filter(({ rect }) => rect.right > viewportWidth + 1 || rect.left < -1)
        .sort((left, right) => (right.rect.right - right.rect.left) - (left.rect.right - left.rect.left))
        .slice(0, 5)
        .map(({ element, rect }) => ({
          className: element.className,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          tag: element.tagName.toLowerCase(),
          width: Math.round(rect.width),
        }));
      return {
        clientWidth: viewportWidth,
        offenders,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });

    expect(pageOverflow, `Document-level overflow: ${JSON.stringify(pageOverflow.offenders)}`)
      .toMatchObject({ scrollWidth: pageOverflow.clientWidth });

    const tableScroller = table.locator("xpath=parent::*");
    expect(await tableScroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await tableScroller.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    expect(await tableScroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  }
});

test("keeps the deployed POC usable while the additive history RPC rolls out", async ({ page, ledgerBackend }) => {
  ledgerBackend.missingHistorySnapshot = true;
  await openEmptyLedger(page);
  await addPerson(page, "Alice");
  await expect(page.getByRole("checkbox", { name: /^Alice/ })).toBeChecked();
  await page.getByRole("button", { name: "History & stats" }).click();
  await expect(page.getByRole("heading", { name: "History & stats", level: 1 })).toBeVisible();
  await expect(page.getByText("Your history starts with the first finished game")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: /game history|could not|unavailable/i })).toHaveCount(0);
});
