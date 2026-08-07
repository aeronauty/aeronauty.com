import { expect, test, type Locator, type Page } from "@playwright/test";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000042";
const OTHER_ACCOUNT_ID = "00000000-0000-4000-8000-000000000099";
const STORAGE_KEY = `tile-tally:tiles:v3:${ACCOUNT_ID}`;
const TILE_WIDTH = 54;
const TILE_HEIGHT = 58;
const JOIN_STEP = 58;

type FixtureBody = {
  blankAs?: string;
  id: string;
  letter: string;
  rotation: number;
  vr: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

type FixtureLink = { leftId: string; locked?: true; rightId: string };

type Pose = {
  joined: boolean;
  rotation: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

const session = {
  access_token: "e2e-access-token",
  expires_at: 4_102_444_800,
  expires_in: 2_147_483_647,
  refresh_token: "e2e-refresh-token",
  token_type: "bearer",
  user: {
    app_metadata: { provider: "google", providers: ["google"] },
    aud: "authenticated",
    confirmed_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    email: "tile-player@example.test",
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
    id: ACCOUNT_ID,
    identities: [],
    is_anonymous: false,
    last_sign_in_at: "2026-01-01T00:00:00.000Z",
    phone: "",
    role: "authenticated",
    updated_at: "2026-01-01T00:00:00.000Z",
    user_metadata: { full_name: "Tile Player" },
  },
};

const player = {
  created_at: "2026-01-01T00:00:00.000Z",
  id: "10000000-0000-4000-8000-000000000001",
  name: "Tile Player",
  owner_id: ACCOUNT_ID,
};

let fixtureSequence = 0;
let pointerSequence = 40;

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript(
    ({ accountId, authSession }) => {
      localStorage.setItem("aeronauty-tiletally-auth", JSON.stringify(authSession));
      localStorage.setItem("aeronauty-analytics-consent", "declined");
      if (!sessionStorage.getItem("tile-tally:e2e-initialized")) {
        for (const version of [1, 2, 3]) {
          localStorage.removeItem(`tile-tally:tiles:v${version}:${accountId}`);
        }
        sessionStorage.setItem("tile-tally:e2e-initialized", "true");
      }
    },
    { accountId: ACCOUNT_ID, authSession: session },
  );

  await page.route("**/__e2e_supabase__/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.includes("/rest/v1/tiletally_players")) {
      await route.fulfill({
        body: JSON.stringify([player]),
        contentType: "application/json",
        headers: { "content-range": "0-0/1" },
        status: 200,
      });
      return;
    }
    if (url.pathname.includes("/rest/v1/")) {
      await route.fulfill({
        body: "[]",
        contentType: "application/json",
        headers: { "content-range": "*/0" },
        status: 200,
      });
      return;
    }
    await route.fulfill({ body: "{}", contentType: "application/json", status: 200 });
  });

  await page.goto("/apps/tile-tally");
  await openTiles(page);
});

function fixtureBody(
  id: string,
  letter: string,
  x: number,
  y: number,
  overrides: Partial<FixtureBody> = {},
): FixtureBody {
  return {
    id,
    letter,
    rotation: 0,
    vr: 0,
    vx: 0,
    vy: 0,
    x,
    y,
    ...overrides,
  };
}

async function openTiles(page: Page) {
  const tilesTab = page.getByRole("button", { name: "Tile table", exact: true });
  await expect(tilesTab).toBeVisible();
  await tilesTab.click();
  await expect(page.getByTestId("tiles-workspace")).toBeVisible();
  await expect(page.getByTestId("tile-surface")).toBeVisible();
  await expect(page.getByText("tile-player@example.test")).toBeVisible();
}

async function addTiles(page: Page, value: string) {
  await page.locator("#rack-letters").fill(value);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const count = value.toUpperCase().split("").filter((character) => character === "?" || /^[A-Z]$/.test(character)).length;
  await expect(page.getByTestId("rack-tile")).toHaveCount(Math.min(40, count));
}

function tileById(page: Page, id: string): Locator {
  return page.locator(`[data-testid="rack-tile"][data-tile-id="${id}"]`);
}

function bodyById(page: Page, id: string): Locator {
  return page.locator(`[data-testid="tile-body"][data-tile-id="${id}"]`);
}

async function poses(page: Page): Promise<Record<string, Pose>> {
  return page.getByTestId("tile-body").evaluateAll((elements) => Object.fromEntries(elements.map((element) => {
    const node = element as HTMLElement;
    return [node.dataset.tileId ?? "", {
      joined: node.dataset.joined === "true",
      rotation: Number(node.dataset.rotation),
      vx: Number(node.dataset.vx),
      vy: Number(node.dataset.vy),
      x: Number(node.dataset.x),
      y: Number(node.dataset.y),
    }];
  })));
}

async function linkPairs(page: Page) {
  return page.getByTestId("snap-link").evaluateAll((elements) => elements.map((element) => ({
    leftId: (element as HTMLElement).dataset.leftId ?? "",
    rightId: (element as HTMLElement).dataset.rightId ?? "",
  })));
}

function expectNoOverlaps(current: Record<string, Pose>) {
  const entries = Object.entries(current);
  for (let firstIndex = 0; firstIndex < entries.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < entries.length; secondIndex += 1) {
      const [firstId, first] = entries[firstIndex];
      const [secondId, second] = entries[secondIndex];
      const overlap = (
        first.x < second.x + TILE_WIDTH
        && first.x + TILE_WIDTH > second.x
        && first.y < second.y + TILE_HEIGHT
        && first.y + TILE_HEIGHT > second.y
      );
      expect(overlap, `${firstId} and ${secondId} overlap`).toBe(false);
    }
  }
}

async function installStoredFixture(
  page: Page,
  version: 1 | 2 | 3,
  value: Record<string, unknown>,
  accountId = ACCOUNT_ID,
) {
  const marker = `tile-tally:e2e-fixture:${fixtureSequence += 1}`;
  await page.addInitScript(({ accountId: targetAccount, marker: once, stored, version: targetVersion }) => {
    if (sessionStorage.getItem(once)) return;
    for (const candidateVersion of [1, 2, 3]) {
      localStorage.removeItem(`tile-tally:tiles:v${candidateVersion}:${targetAccount}`);
    }
    localStorage.setItem(
      `tile-tally:tiles:v${targetVersion}:${targetAccount}`,
      JSON.stringify(stored),
    );
    sessionStorage.setItem(once, "true");
  }, { accountId, marker, stored: value, version });
  await page.reload();
  await openTiles(page);
}

async function loadV3Scene(
  page: Page,
  bodies: FixtureBody[],
  links: FixtureLink[] = [],
  accountId = ACCOUNT_ID,
  orientationMode?: "free" | "upright",
) {
  const dimensions = await page.getByTestId("tile-surface").evaluate((element) => ({
    height: (element as HTMLElement).clientHeight,
    width: (element as HTMLElement).clientWidth,
  }));
  await installStoredFixture(page, 3, {
    version: 3,
    width: dimensions.width,
    height: dimensions.height,
    bodies,
    links,
    ...(orientationMode ? { orientationMode } : {}),
  }, accountId);
  await expect(page.getByTestId("tile-body")).toHaveCount(bodies.length);
}

async function dispatchPointerGesture(
  page: Page,
  tileId: string,
  moves: Array<{ time: number; x: number; y: number }>,
  options: { downTime?: number; pointerType?: "mouse" | "touch"; upTime?: number } = {},
) {
  const pointerId = pointerSequence += 1;
  await page.evaluate(({ downTime, moves, pointerId, pointerType, tileId, upTime }) => {
    const tile = document.querySelector<HTMLElement>(`[data-testid="rack-tile"][data-tile-id="${tileId}"]`);
    const body = document.querySelector<HTMLElement>(`[data-testid="tile-body"][data-tile-id="${tileId}"]`);
    const surface = document.querySelector<HTMLElement>("[data-testid='tile-surface']");
    if (!tile || !body || !surface || !moves.length) throw new Error("Pointer fixture target missing");
    const surfaceRect = surface.getBoundingClientRect();
    const startX = Number(body.dataset.x) + 27;
    const startY = Number(body.dataset.y) + 29;
    const dispatch = (
      target: EventTarget,
      type: string,
      localX: number,
      localY: number,
      time: number,
      buttons: number,
    ) => {
      const event = new PointerEvent(type, {
        bubbles: true,
        button: 0,
        buttons,
        cancelable: true,
        clientX: surfaceRect.left + localX,
        clientY: surfaceRect.top + localY,
        isPrimary: true,
        pointerId,
        pointerType,
      });
      Object.defineProperty(event, "timeStamp", { configurable: true, value: time });
      target.dispatchEvent(event);
    };
    dispatch(tile, "pointerdown", startX, startY, downTime, 1);
    for (const move of moves) dispatch(window, "pointermove", move.x + 27, move.y + 29, move.time, 1);
    const last = moves[moves.length - 1];
    // Dispatch on the capture owner and let the event bubble to the window
    // listener. This matches browsers that retain pointer capture through up.
    dispatch(tile, "pointerup", last.x + 27, last.y + 29, upTime, 0);
  }, {
    downTime: options.downTime ?? 1_000,
    moves,
    pointerId,
    pointerType: options.pointerType ?? "mouse",
    tileId,
    upTime: options.upTime ?? moves[moves.length - 1].time + 200,
  });
  await expect(page.getByTestId("tiles-workspace")).toHaveAttribute("data-drag-mode", "idle");
}

async function pointerDownOnly(page: Page, tileId: string, pointerType: "mouse" | "touch" = "touch") {
  const pointerId = pointerSequence += 1;
  await page.evaluate(({ pointerId, pointerType, tileId }) => {
    const tile = document.querySelector<HTMLElement>(`[data-testid="rack-tile"][data-tile-id="${tileId}"]`);
    const body = document.querySelector<HTMLElement>(`[data-testid="tile-body"][data-tile-id="${tileId}"]`);
    const surface = document.querySelector<HTMLElement>("[data-testid='tile-surface']");
    if (!tile || !body || !surface) throw new Error("Pointer fixture target missing");
    const rect = surface.getBoundingClientRect();
    const event = new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      buttons: 1,
      clientX: rect.left + Number(body.dataset.x) + 27,
      clientY: rect.top + Number(body.dataset.y) + 29,
      isPrimary: true,
      pointerId,
      pointerType,
    });
    tile.dispatchEvent(event);
  }, { pointerId, pointerType, tileId });
  return pointerId;
}

async function pointerUpOnly(page: Page, tileId: string, pointerId: number, pointerType: "mouse" | "touch" = "touch") {
  await page.evaluate(({ pointerId, pointerType, tileId }) => {
    const tile = document.querySelector<HTMLElement>(`[data-testid="rack-tile"][data-tile-id="${tileId}"]`);
    if (!tile) throw new Error("Pointer fixture target missing");
    tile.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      buttons: 0,
      isPrimary: true,
      pointerId,
      pointerType,
    }));
  }, { pointerId, pointerType, tileId });
}

async function seedMathRandom(page: Page, seed: number) {
  await page.evaluate((initialSeed) => {
    let value = initialSeed >>> 0;
    Math.random = () => {
      value += 0x6d2b79f5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
    };
  }, seed);
}

async function freezeAnimationFrames(page: Page) {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __tileTallyCancelFrame?: typeof cancelAnimationFrame;
      __tileTallyRequestFrame?: typeof requestAnimationFrame;
    };
    target.__tileTallyRequestFrame = window.requestAnimationFrame.bind(window);
    target.__tileTallyCancelFrame = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (() => 2_147_000_000) as typeof requestAnimationFrame;
    window.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;
  });
}

async function restoreAnimationFrames(page: Page) {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __tileTallyCancelFrame?: typeof cancelAnimationFrame;
      __tileTallyRequestFrame?: typeof requestAnimationFrame;
    };
    if (target.__tileTallyRequestFrame) window.requestAnimationFrame = target.__tileTallyRequestFrame;
    if (target.__tileTallyCancelFrame) window.cancelAnimationFrame = target.__tileTallyCancelFrame;
    delete target.__tileTallyRequestFrame;
    delete target.__tileTallyCancelFrame;
  });
}

async function installGrantedMotion(page: Page) {
  await page.evaluate(() => {
    class MockDeviceMotionEvent extends Event {
      static requestPermission = async () => "granted" as const;
      acceleration: DeviceMotionEventAcceleration | null;
      accelerationIncludingGravity: DeviceMotionEventAcceleration | null;
      interval = 16;
      rotationRate = null;

      constructor(type: string, x = 0) {
        super(type);
        this.acceleration = null;
        this.accelerationIncludingGravity = { x, y: 0, z: 0 };
      }
    }
    Object.defineProperty(window, "DeviceMotionEvent", { configurable: true, value: MockDeviceMotionEvent });
  });
}

async function sendShake(page: Page) {
  await page.evaluate(() => {
    const Motion = window.DeviceMotionEvent as unknown as { new(type: string, x?: number): Event };
    window.dispatchEvent(new Motion("devicemotion", 0));
    window.dispatchEvent(new Motion("devicemotion", 30));
    window.dispatchEvent(new Motion("devicemotion", 0));
  });
}

test("parses physical tiles, ignores separators, and enforces the 40-tile cap", async ({ page }) => {
  await page.locator("#rack-letters").fill(`${"A".repeat(20)} ${"b".repeat(20)}, CCCCC`);
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByTestId("rack-tile")).toHaveCount(40);
  await expect(page.getByText("40 of 40 spaces used", { exact: false })).toBeVisible();
  await expect(page.locator("#rack-letters")).toBeDisabled();
  await expect(page.getByText("Added 40; the tabletop holds 40 tiles.")).toBeVisible();
  const letters = await page.getByTestId("rack-tile").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-letter") ?? "").sort().join(""));
  expect(letters).toBe(`${"A".repeat(20)}${"B".repeat(20)}`);
});

test("starts every added tile loose and non-overlapping on one surface with no group controls", async ({ page }) => {
  await addTiles(page, "ABCDEFGHIJ");
  await expect(page.getByTestId("snap-link")).toHaveCount(0);
  await expect(page.locator('[data-testid="tile-body"][data-joined="true"]')).toHaveCount(0);
  expectNoOverlaps(await poses(page));

  await expect(page.getByTestId("tile-group")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /move group|join group|select group|separate selected/i })).toHaveCount(0);
  await expect(page.getByText(/^Group \d+$/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "One open table" })).toBeVisible();
});

test("slow aligned side placements snap into a CAT word in spatial order", async ({ page }) => {
  await loadV3Scene(page, [
    fixtureBody("C", "C", 40, 100),
    fixtureBody("A", "A", 190, 100),
    fixtureBody("T", "T", 260, 100),
  ]);

  await dispatchPointerGesture(page, "A", [{ x: 40 + JOIN_STEP, y: 100, time: 1_300 }], { upTime: 1_500 });
  await expect(page.getByTestId("snap-link")).toHaveCount(1);
  expect(await linkPairs(page)).toEqual([{ leftId: "C", rightId: "A" }]);

  await dispatchPointerGesture(page, "T", [{ x: 40 + JOIN_STEP * 2, y: 100, time: 2_300 }], {
    downTime: 2_000,
    upTime: 2_500,
  });
  await expect(page.getByTestId("snap-link")).toHaveCount(2);
  expect(await linkPairs(page)).toEqual([
    { leftId: "C", rightId: "A" },
    { leftId: "A", rightId: "T" },
  ]);
  await expect(page.getByTestId("word-candidate")).toHaveText("CAT");
  await expect(page.getByTestId("check-word")).toContainText("Check CAT");
  const current = await poses(page);
  expect(current.A.x - current.C.x).toBeCloseTo(JOIN_STEP, 1);
  expect(current.T.x - current.A.x).toBeCloseTo(JOIN_STEP, 1);
});

test("a slow placement outside tolerance and a fast aligned release both stay loose", async ({ page }) => {
  await loadV3Scene(page, [
    fixtureBody("A", "A", 40, 100),
    fixtureBody("B", "B", 230, 100),
  ]);
  await dispatchPointerGesture(page, "B", [{ x: 40 + JOIN_STEP + 24, y: 100, time: 1_300 }], { upTime: 1_500 });
  await expect(page.getByTestId("snap-link")).toHaveCount(0);
  await expect(bodyById(page, "B")).toHaveAttribute("data-joined", "false");

  await loadV3Scene(page, [
    fixtureBody("A", "A", 40, 100),
    fixtureBody("B", "B", 230, 100),
  ]);
  await dispatchPointerGesture(page, "B", [
    { x: 170, y: 100, time: 2_020 },
    { x: 40 + JOIN_STEP, y: 100, time: 2_040 },
  ], { downTime: 2_000, upTime: 2_042 });
  await expect(page.getByTestId("snap-link")).toHaveCount(0);
  await page.getByTestId("settle-tiles").click();
  await expect(bodyById(page, "B")).toHaveAttribute("data-vx", "0.00");
});

test("pulling a joined tile away detaches and leaves it loose", async ({ page }) => {
  await loadV3Scene(page, [
    fixtureBody("A", "A", 60, 100),
    fixtureBody("B", "B", 60 + JOIN_STEP, 100),
  ], [{ leftId: "A", rightId: "B" }]);
  await expect(page.getByTestId("snap-link")).toHaveCount(1);

  await dispatchPointerGesture(page, "B", [{ x: 180, y: 230, time: 1_300 }], { upTime: 1_500 });
  await expect(page.getByTestId("snap-link")).toHaveCount(0);
  await expect(bodyById(page, "A")).toHaveAttribute("data-joined", "false");
  await expect(bodyById(page, "B")).toHaveAttribute("data-joined", "false");
  expect((await poses(page)).B.y).toBeGreaterThan(180);
});

test("locks a snapped word, moves it as one rigid body, and breaks the active tile back out", async ({ page }) => {
  await loadV3Scene(page, [
    fixtureBody("A", "A", 60, 100),
    fixtureBody("B", "B", 60 + JOIN_STEP, 100),
    fixtureBody("C", "C", 60 + JOIN_STEP * 2, 100),
  ], [
    { leftId: "A", rightId: "B" },
    { leftId: "B", rightId: "C" },
  ]);

  await expect(page.getByTestId("word-lock-actions")).toContainText("Snapped, but pulls apart");
  await page.getByTestId("word-lock-toggle").click();
  await expect(page.getByTestId("word-lock-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-testid="snap-link"][data-locked="true"]')).toHaveCount(2);
  await expect(page.locator('[data-testid="tile-body"][data-locked="true"]')).toHaveCount(3);
  await expect.poll(() => page.evaluate((storageKey) => {
    const value = localStorage.getItem(storageKey);
    if (!value) return 0;
    return (JSON.parse(value).links as Array<{ locked?: boolean }>).filter((link) => link.locked).length;
  }, STORAGE_KEY)).toBe(2);

  const before = await poses(page);
  await dispatchPointerGesture(page, "B", [{ x: 260, y: 220, time: 1_300 }], { upTime: 1_500 });
  const after = await poses(page);
  await expect(page.getByTestId("snap-link")).toHaveCount(2);
  expect(after.B.x - after.A.x).toBeCloseTo(JOIN_STEP, 1);
  expect(after.C.x - after.B.x).toBeCloseTo(JOIN_STEP, 1);
  expect(after.A.y).toBeCloseTo(after.B.y, 1);
  expect(after.C.y).toBeCloseTo(after.B.y, 1);
  expect(after.A.x - before.A.x).toBeCloseTo(after.B.x - before.B.x, 1);
  expect(after.C.y - before.C.y).toBeCloseTo(after.B.y - before.B.y, 1);

  await page.getByTestId("break-active-tile").click();
  await expect(page.getByTestId("snap-link")).toHaveCount(0);
  await expect(page.locator('[data-testid="tile-body"][data-locked="true"]')).toHaveCount(0);
});

test("a touch hold on a locked word opens accessible break-apart actions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "webkit-mobile", "The touch-hold action is covered in mobile WebKit.");
  await loadV3Scene(page, [
    fixtureBody("A", "A", 60, 100),
    fixtureBody("B", "B", 60 + JOIN_STEP, 100),
  ], [{ leftId: "A", locked: true, rightId: "B" }]);

  await pointerDownOnly(page, "B", "touch");
  await page.waitForTimeout(650);
  await expect(page.getByTestId("locked-word-menu")).toBeVisible();
  await expect(page.getByTestId("break-held-tile")).toBeFocused();
  await page.getByTestId("break-held-tile").click();
  await expect(page.getByTestId("snap-link")).toHaveCount(0);
  await expect(page.getByTestId("locked-word-menu")).toHaveCount(0);
});

test("upright orientation is the default, while free rotation and straightening persist", async ({ page }) => {
  await loadV3Scene(
    page,
    [fixtureBody("A", "A", 80, 120, { rotation: 27 })],
    [],
    ACCOUNT_ID,
    "free",
  );
  await expect(page.getByTestId("tiles-workspace")).toHaveAttribute("data-orientation", "free");
  await expect(page.getByTestId("orientation-toggle")).toHaveAttribute("aria-pressed", "false");
  expect((await poses(page)).A.rotation).toBeCloseTo(27, 1);

  await page.getByTestId("straighten-tiles").click();
  await expect(bodyById(page, "A")).toHaveAttribute("data-rotation", "0.00");
  await page.getByTestId("orientation-toggle").click();
  await expect(page.getByTestId("tiles-workspace")).toHaveAttribute("data-orientation", "upright");
  await expect.poll(() => page.evaluate((storageKey) => {
    const value = localStorage.getItem(storageKey);
    return value ? JSON.parse(value).orientationMode : null;
  }, STORAGE_KEY)).toBe("upright");

  await page.reload();
  await openTiles(page);
  await expect(page.getByTestId("orientation-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(bodyById(page, "A")).toHaveAttribute("data-rotation", "0.00");
});

test("a held tile physically pushes a neighbour without creating a diagonal snap", async ({ page }) => {
  await loadV3Scene(page, [
    fixtureBody("A", "A", 50, 100),
    fixtureBody("B", "B", 125, 130),
  ]);
  const before = await poses(page);
  await dispatchPointerGesture(page, "A", [{ x: 92, y: 100, time: 1_300 }], { upTime: 1_500 });
  const after = await poses(page);

  expect(after.B.x).toBeGreaterThan(before.B.x);
  expect(after.A.x + TILE_WIDTH).toBeLessThanOrEqual(after.B.x + 0.1);
  await expect(page.getByTestId("snap-link")).toHaveCount(0);
});

test("a throw continues after release, loses speed, and can be settled", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "A wide desktop surface keeps this timing assertion away from walls.");
  await loadV3Scene(page, [fixtureBody("A", "A", 30, 120)]);
  await dispatchPointerGesture(page, "A", [
    { x: 50, y: 120, time: 1_050 },
    { x: 70, y: 120, time: 1_100 },
  ], { downTime: 1_000, upTime: 1_102 });

  const released = await poses(page);
  expect(released.A.vx).toBeGreaterThan(180);
  await expect(page.getByTestId("motion-hud")).toBeVisible();
  await page.waitForTimeout(280);
  const gliding = await poses(page);
  expect(gliding.A.x).toBeGreaterThan(released.A.x);
  expect(Math.abs(gliding.A.vx)).toBeLessThan(Math.abs(released.A.vx));

  await page.getByTestId("settle-tiles").click();
  await expect(bodyById(page, "A")).toHaveAttribute("data-vx", "0.00");
  await expect(page.getByTestId("tile-surface")).toHaveAttribute("data-moving", "false");
});

test("Scatter all clears every link and changes deterministic two-dimensional poses", async ({ page }) => {
  await loadV3Scene(page, [
    fixtureBody("A", "A", 30, 80),
    fixtureBody("B", "B", 30 + JOIN_STEP, 80),
    fixtureBody("C", "C", 30 + JOIN_STEP * 2, 80),
    fixtureBody("D", "D", 30 + JOIN_STEP * 3, 80),
    fixtureBody("E", "E", 30, 190),
  ], [
    { leftId: "A", rightId: "B" },
    { leftId: "B", rightId: "C" },
    { leftId: "C", rightId: "D" },
  ]);
  const before = await poses(page);
  await seedMathRandom(page, 42);
  await freezeAnimationFrames(page);
  await page.getByTestId("scatter-all").click();
  await expect(page.getByTestId("snap-link")).toHaveCount(0);
  const after = await poses(page);
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  expect(Object.keys(after).some((id) => after[id].x !== before[id].x)).toBe(true);
  expect(Object.keys(after).some((id) => after[id].y !== before[id].y)).toBe(true);
  expect(Object.values(after).every((pose) => !pose.joined)).toBe(true);
  await restoreAnimationFrames(page);
  await page.getByTestId("settle-tiles").click();
});

test("Scatter selected preserves every unselected pose at the instant of scattering", async ({ page }) => {
  await loadV3Scene(page, [
    fixtureBody("A", "A", 30, 80),
    fixtureBody("B", "B", 110, 80),
    fixtureBody("C", "C", 190, 80),
    fixtureBody("D", "D", 30, 190),
  ]);
  await tileById(page, "B").click();
  await tileById(page, "D").click();
  const before = await poses(page);
  await seedMathRandom(page, 9);
  await freezeAnimationFrames(page);
  await page.getByTestId("scatter-selected").click();
  const after = await poses(page);

  await expect.poll(async () => {
    const current = await poses(page);
    return current.B.x !== before.B.x || current.B.y !== before.B.y
      || current.D.x !== before.D.x || current.D.y !== before.D.y;
  }).toBe(true);
  const scattered = await poses(page);
  expect(scattered.A).toEqual(before.A);
  expect(scattered.C).toEqual(before.C);
  expect(scattered.B).not.toEqual(before.B);
  expect(scattered.D).not.toEqual(before.D);
  await restoreAnimationFrames(page);
  await page.getByTestId("settle-tiles").click();
});

test("shake permission needs two spikes, ignores an active pointer, scatters, and disables cleanly", async ({ page }) => {
  await loadV3Scene(page, [
    fixtureBody("A", "A", 40, 90),
    fixtureBody("B", "B", 40 + JOIN_STEP, 90),
    fixtureBody("C", "C", 40 + JOIN_STEP * 2, 90),
  ], [
    { leftId: "A", rightId: "B" },
    { leftId: "B", rightId: "C" },
  ]);
  await installGrantedMotion(page);
  await seedMathRandom(page, 17);
  await page.getByTestId("shake-toggle").click();
  await expect(page.getByTestId("shake-toggle")).toHaveAttribute("aria-pressed", "true");

  const before = await poses(page);
  const pointerId = await pointerDownOnly(page, "A");
  await sendShake(page);
  expect(await poses(page)).toEqual(before);
  await expect(page.getByTestId("snap-link")).toHaveCount(2);
  await pointerUpOnly(page, "A", pointerId);

  await freezeAnimationFrames(page);
  await sendShake(page);
  await expect(page.getByTestId("snap-link")).toHaveCount(0);
  expect(await poses(page)).not.toEqual(before);
  await restoreAnimationFrames(page);
  await page.getByTestId("settle-tiles").click();

  await page.getByTestId("shake-toggle").click();
  await expect(page.getByTestId("shake-toggle")).toHaveAttribute("aria-pressed", "false");
  const disabled = await poses(page);
  await sendShake(page);
  expect(await poses(page)).toEqual(disabled);
});

test("a denied motion request exposes Scatter all as a recoverable fallback", async ({ page }) => {
  await page.evaluate(() => {
    class DeniedDeviceMotionEvent extends Event {
      static requestPermission = async () => "denied" as const;
    }
    Object.defineProperty(window, "DeviceMotionEvent", { configurable: true, value: DeniedDeviceMotionEvent });
  });
  await page.getByTestId("shake-toggle").click();
  await expect(page.getByTestId("shake-toggle")).toHaveAttribute("data-state", "denied");
  await expect(page.getByTestId("shake-toggle")).toContainText("Motion denied");
  await expect(page.getByText("Allow motion in browser settings, or use Scatter all.")).toBeVisible();
  await expect(page.getByTestId("scatter-all")).toBeVisible();
});

test("a snapped v3 blank fixture only becomes CAT after assignment", async ({ page }) => {
  await loadV3Scene(page, [
    fixtureBody("C", "C", 40, 100),
    fixtureBody("blank", "?", 40 + JOIN_STEP, 100),
    fixtureBody("T", "T", 40 + JOIN_STEP * 2, 100),
  ], [
    { leftId: "C", rightId: "blank" },
    { leftId: "blank", rightId: "T" },
  ]);
  await expect(page.getByTestId("word-candidate")).toHaveText("Assign blanks first");
  await expect(page.getByTestId("check-word")).toBeDisabled();
  await page.getByLabel("Blank tile 1").selectOption("A");
  await expect(page.getByTestId("word-candidate")).toHaveText("CAT");
  await expect(page.getByTestId("check-word")).toHaveAttribute("href", "https://scrabble.collinsdictionary.com/check/");
});

test("v3 poses and links persist per account while transient velocity, selection, and fullscreen do not", async ({ page }) => {
  await loadV3Scene(page, [
    fixtureBody("A", "A", 50, 90, { rotation: 7, vx: 900, vy: -200 }),
    fixtureBody("B", "B", 50 + JOIN_STEP, 90),
  ], [{ leftId: "A", rightId: "B" }]);
  const restored = await poses(page);
  expect(restored.A.vx).toBe(0);
  expect(restored.A.vy).toBe(0);

  await page.evaluate(({ otherAccountId }) => {
    localStorage.setItem(`tile-tally:tiles:v3:${otherAccountId}`, JSON.stringify({
      version: 3,
      width: 500,
      height: 400,
      bodies: [fixtureBodyForBrowser("other-Z", "Z", 20, 20)],
      links: [],
    }));
    function fixtureBodyForBrowser(id: string, letter: string, x: number, y: number) {
      return { id, letter, rotation: 0, vr: 0, vx: 0, vy: 0, x, y };
    }
  }, { otherAccountId: OTHER_ACCOUNT_ID });

  await tileById(page, "A").click();
  await page.getByTestId("fullscreen-toggle").click();
  await expect(page.getByTestId("tiles-workspace")).toHaveAttribute("data-fullscreen", "true");
  await page.waitForTimeout(240);
  await page.reload();
  await openTiles(page);

  await expect(page.getByTestId("snap-link")).toHaveCount(1);
  await expect(page.getByTestId("rack-tile")).toHaveCount(2);
  await expect(tileById(page, "other-Z")).toHaveCount(0);
  await expect(page.getByTestId("tiles-workspace")).toHaveAttribute("data-fullscreen", "false");
  await expect(page.locator('[data-testid="rack-tile"][data-selected="true"]')).toHaveCount(0);
  const afterReload = await poses(page);
  expect(afterReload.A.vx).toBe(0);
  expect(afterReload.A.vy).toBe(0);
  expect(Math.abs((afterReload.B.x - afterReload.A.x) - JOIN_STEP)).toBeLessThan(1.5);
  expect(await page.evaluate((otherAccountId) => localStorage.getItem(`tile-tally:tiles:v3:${otherAccountId}`), OTHER_ACCOUNT_ID)).toContain("other-Z");
});

test("migrates a v1 flat rack into a persisted snapped v3 word", async ({ page }) => {
  await installStoredFixture(page, 1, {
    version: 1,
    tiles: [
      { id: "legacy-a", letter: "A" },
      { id: "legacy-blank", letter: "?", blankAs: "R" },
      { id: "legacy-t", letter: "T" },
    ],
  });
  await expect(page.getByTestId("rack-tile")).toHaveCount(3);
  await expect(page.getByTestId("snap-link")).toHaveCount(2);
  await expect(page.getByTestId("word-candidate")).toHaveText("ART");
  await expect.poll(() => page.evaluate((storageKey) => {
    const value = localStorage.getItem(storageKey);
    return value ? JSON.parse(value).version : null;
  }, STORAGE_KEY)).toBe(3);
});

test("migrates v2 groups into independent snapped rows without group chrome", async ({ page }) => {
  await installStoredFixture(page, 2, {
    version: 2,
    groups: [
      { id: "word-one", tiles: [{ id: "C", letter: "C" }, { id: "A", letter: "A" }, { id: "T", letter: "T" }] },
      { id: "word-two", tiles: [{ id: "D", letter: "D" }, { id: "O", letter: "O" }] },
    ],
  });
  await expect(page.getByTestId("rack-tile")).toHaveCount(5);
  await expect(page.getByTestId("snap-link")).toHaveCount(3);
  await expect(page.getByTestId("word-candidate")).toHaveText("CAT");
  await expect(page.getByTestId("tile-group")).toHaveCount(0);
  await expect.poll(() => page.evaluate((storageKey) => {
    const value = localStorage.getItem(storageKey);
    return value ? JSON.parse(value).version : null;
  }, STORAGE_KEY)).toBe(3);
});

test("keyboard focus follows spatial neighbours and Alt+Arrow nudges before Delete removes", async ({ page }) => {
  await loadV3Scene(page, [
    fixtureBody("A", "A", 30, 60),
    fixtureBody("B", "B", 190, 60),
    fixtureBody("C", "C", 30, 210),
  ]);
  await tileById(page, "A").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tileById(page, "B")).toBeFocused();
  await tileById(page, "A").focus();
  await page.keyboard.press("ArrowDown");
  await expect(tileById(page, "C")).toBeFocused();

  const before = await poses(page);
  await tileById(page, "A").focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(async () => (await poses(page)).A.x).toBeCloseTo(before.A.x + 12, 1);
  await expect(tileById(page, "A")).toBeFocused();
  await page.keyboard.press("Delete");
  await expect(tileById(page, "A")).toHaveCount(0);
  await expect(page.getByTestId("rack-tile")).toHaveCount(2);
  await expect(tileById(page, "B")).toBeFocused();
});

test("full screen fills the safe viewport, isolates the page, and exits cleanly", async ({ page }, testInfo) => {
  await loadV3Scene(page, [fixtureBody("A", "A", 30, 80), fixtureBody("B", "B", 110, 80)]);
  await page.getByTestId("fullscreen-toggle").click();
  const workspace = page.getByTestId("tiles-workspace");
  await expect(workspace).toHaveAttribute("data-fullscreen", "true");
  await expect(workspace).toHaveCSS("position", "fixed");
  await expect(page.getByTestId("fullscreen-toggle")).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await expect(page.locator('nav[aria-label="Game Ledger sections"]')).toHaveAttribute("inert", "");
  await expect(page.locator('nav[aria-label="Game Ledger sections"]')).toHaveAttribute("aria-hidden", "true");

  const dimensions = await workspace.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top, viewportHeight: innerHeight, viewportWidth: innerWidth };
  });
  expect(dimensions.left).toBeLessThanOrEqual(1);
  expect(dimensions.top).toBeLessThanOrEqual(1);
  expect(dimensions.right).toBeGreaterThanOrEqual(dimensions.viewportWidth - 1);
  expect(dimensions.bottom).toBeGreaterThanOrEqual(dimensions.viewportHeight - 1);

  if (testInfo.project.name === "webkit-mobile") {
    const actionHeight = await page.getByTestId("fullscreen-toggle").evaluate((element) => element.getBoundingClientRect().height);
    expect(actionHeight).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press("Escape");
  await expect(workspace).toHaveAttribute("data-fullscreen", "false");
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
  await expect(page.locator('nav[aria-label="Game Ledger sections"]')).not.toHaveAttribute("inert", "");
});

test("raw Chromium touch input moves a tile without an accidental post-drag selection", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "CDP raw touch input is Chromium-specific.");
  await loadV3Scene(page, [fixtureBody("A", "A", 40, 100)]);
  const source = await tileById(page, "A").boundingBox();
  if (!source) throw new Error("Expected a visible touch tile");
  const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const destination = { x: start.x + 90, y: start.y + 70 };
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await cdp.send("Input.dispatchTouchEvent", {
    touchPoints: [{ id: 1, radiusX: 6, radiusY: 6, x: start.x, y: start.y }],
    type: "touchStart",
  });
  await cdp.send("Input.dispatchTouchEvent", {
    touchPoints: [{ id: 1, radiusX: 6, radiusY: 6, x: destination.x, y: destination.y }],
    type: "touchMove",
  });
  await cdp.send("Input.dispatchTouchEvent", { touchPoints: [], type: "touchEnd" });

  await expect.poll(async () => (await poses(page)).A.y).toBeGreaterThan(130);
  await expect(tileById(page, "A")).toHaveAttribute("data-selected", "false");
  await expect(bodyById(page, "A")).toHaveAttribute("data-held", "false");
});

test("mobile WebKit accepts a real touch tap and a synthetic touch-pointer manipulation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "webkit-mobile", "This covers the mobile WebKit project.");
  await loadV3Scene(page, [
    fixtureBody("M", "M", 30, 80),
    fixtureBody("O", "O", 140, 80),
  ]);
  // Locator.tap uses the emulated touchscreen and first scrolls the target into
  // the mobile viewport; raw coordinates can otherwise land below the fold.
  await tileById(page, "M").tap();
  await expect(tileById(page, "M")).toHaveAttribute("data-selected", "true");
  await tileById(page, "M").tap();
  await expect(tileById(page, "M")).toHaveAttribute("data-selected", "false");

  await dispatchPointerGesture(page, "O", [{ x: 150, y: 220, time: 1_300 }], {
    pointerType: "touch",
    upTime: 1_500,
  });
  await expect.poll(async () => (await poses(page)).O.y).toBeGreaterThan(180);
  await expect(tileById(page, "O")).toHaveAttribute("data-selected", "false");
  await expect(bodyById(page, "O")).toHaveAttribute("data-held", "false");
});
