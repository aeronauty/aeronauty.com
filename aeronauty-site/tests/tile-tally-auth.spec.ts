import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createHash } from "node:crypto";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000042";
const AUTH_STORAGE_KEY = "aeronauty-tiletally-auth";
const EXPIRED_SESSION_MESSAGE = "Your session expired. Continue with Google to sign in again.";
const EMPTY_HISTORY_SNAPSHOT = {
  schema_version: 1,
  entities: [],
  games: [],
  participants: [],
  events: [],
  active_media_counts: [],
};

const player = {
  created_at: "2026-01-01T00:00:00.000Z",
  id: "10000000-0000-4000-8000-000000000001",
  name: "Tile Player",
  owner_id: ACCOUNT_ID,
};

function session(expiresAt: number) {
  return {
    access_token: "auth-e2e-access-token",
    expires_at: expiresAt,
    expires_in: 3_600,
    refresh_token: "auth-e2e-refresh-token",
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
}

async function installGoogleIdentityMock(context: BrowserContext) {
  await context.addInitScript(() => {
    type GoogleTestState = {
      clientId: string | null;
      initialiseCount: number;
      nonce: string | null;
      nonceHistory: string[];
      renderLayouts: string[];
      renderWidths: number[];
    };
    type GoogleCredentialCallback = (response: { credential?: string }) => void;
    type GoogleTestWindow = Window & {
      __tileTallyGis: GoogleTestState;
      google: {
        accounts: {
          id: {
            initialize: (options: {
              callback: GoogleCredentialCallback;
              client_id: string;
              nonce: string;
            }) => void;
            renderButton: (parent: HTMLElement, options: { type: "icon" | "standard"; width?: number }) => void;
          };
        };
      };
    };

    const testWindow = window as unknown as GoogleTestWindow;
    let credentialCallback: GoogleCredentialCallback = () => undefined;
    testWindow.__tileTallyGis = {
      clientId: null,
      initialiseCount: 0,
      nonce: null,
      nonceHistory: [],
      renderLayouts: [],
      renderWidths: [],
    };
    testWindow.google = {
      accounts: {
        id: {
          initialize(options) {
            credentialCallback = options.callback;
            testWindow.__tileTallyGis.clientId = options.client_id;
            testWindow.__tileTallyGis.initialiseCount += 1;
            testWindow.__tileTallyGis.nonce = options.nonce;
            testWindow.__tileTallyGis.nonceHistory.push(options.nonce);
          },
          renderButton(parent, options) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = options.type === "icon" ? "G" : "Continue with Google";
            button.setAttribute("aria-label", "Continue with Google");
            button.dataset.googleIdentityServices = "true";
            button.dataset.googleButtonLayout = options.type;
            const requestedWidth = options.width ?? 44;
            // GIS documents width as a minimum. Mimic localized/personalized
            // copy expanding a narrow standard button so the component must
            // switch to Google's responsive icon variant instead of clipping.
            const renderedWidth = options.type === "standard" && requestedWidth < 400
              ? Math.min(400, requestedWidth + 96)
              : requestedWidth;
            button.dataset.renderedWidth = String(renderedWidth);
            button.style.width = `${renderedWidth}px`;
            button.addEventListener("click", () => {
              credentialCallback({ credential: "e2e-google-id-token" });
            });
            testWindow.__tileTallyGis.renderLayouts.push(options.type);
            testWindow.__tileTallyGis.renderWidths.push(requestedWidth);
            parent.appendChild(button);
          },
        },
      },
    };
  });
}

test.beforeEach(async ({ context }) => {
  await installGoogleIdentityMock(context);
});

async function seedBrowser(context: BrowserContext, authSession?: ReturnType<typeof session>) {
  await context.addInitScript(
    ({ storageKey, value }) => {
      localStorage.setItem("aeronauty-analytics-consent", "declined");
      if (!sessionStorage.getItem("tile-tally:auth-e2e-seeded")) {
        if (value) localStorage.setItem(storageKey, JSON.stringify(value));
        else localStorage.removeItem(storageKey);
        sessionStorage.setItem("tile-tally:auth-e2e-seeded", "true");
      }
    },
    { storageKey: AUTH_STORAGE_KEY, value: authSession ?? null },
  );
}

async function expectRecoveredLogin(page: Page) {
  await expect(page.getByRole("button", { name: "Continue with Google", exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(EXPIRED_SESSION_MESSAGE, { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), AUTH_STORAGE_KEY)).toBeNull();
}

async function expectNoHorizontalDocumentOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  )).toBe(true);
}

test("breaks a refresh-rate-limit loop and offers a clean Google sign-in", async ({ context, page }) => {
  await seedBrowser(context, session(1));

  let refreshRequests = 0;
  await page.route("**/__e2e_supabase__/auth/v1/token?grant_type=refresh_token", async (route) => {
    refreshRequests += 1;
    await route.fulfill({
      body: JSON.stringify({ code: "over_request_rate_limit", message: "Too many requests" }),
      contentType: "application/json",
      status: 429,
    });
  });

  await page.goto("/apps/tile-tally");
  await expectRecoveredLogin(page);
  expect(refreshRequests).toBeGreaterThan(0);

  const requestsAfterRecovery = refreshRequests;
  await page.reload();
  await expect(page.getByRole("button", { name: "Continue with Google", exact: true })).toBeVisible();
  expect(refreshRequests).toBe(requestsAfterRecovery);
});

test("recovers when the ledger rejects a locally unexpired JWT", async ({ context, page }) => {
  await seedBrowser(context, session(4_102_444_800));

  await page.route("**/__e2e_supabase__/rest/v1/**", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ code: "PGRST301", details: null, hint: null, message: "JWT expired" }),
      contentType: "application/json",
      status: 401,
    });
  });

  await page.goto("/apps/tile-tally");
  await expectRecoveredLogin(page);
});

test("recovers from the permission error returned after an expired JWT loses its role", async ({
  context,
  page,
}) => {
  await seedBrowser(context, session(4_102_444_800));

  await page.route("**/__e2e_supabase__/auth/v1/user", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ code: "bad_jwt", message: "JWT expired" }),
      contentType: "application/json",
      status: 401,
    });
  });

  await page.route("**/__e2e_supabase__/rest/v1/**", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        code: "42501",
        details: null,
        hint: null,
        message: "permission denied for table tiletally_games",
      }),
      contentType: "application/json",
      status: 401,
    });
  });

  await page.goto("/apps/tile-tally");
  await expectRecoveredLogin(page);
});

test("keeps a verified session when a database grant returns permission denied", async ({
  context,
  page,
}) => {
  const validSession = session(4_102_444_800);
  await seedBrowser(context, validSession);

  await page.route("**/__e2e_supabase__/auth/v1/user", async (route) => {
    await route.fulfill({
      body: JSON.stringify(validSession.user),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/__e2e_supabase__/rest/v1/**", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        code: "42501",
        details: null,
        hint: null,
        message: "permission denied for table tiletally_games",
      }),
      contentType: "application/json",
      status: 401,
    });
  });

  await page.goto("/apps/tile-tally");
  await expect(page.getByRole("heading", { name: "We could not open your game book" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(
    page.getByText("permission denied for table tiletally_games", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), AUTH_STORAGE_KEY))
    .not.toBeNull();
});

test("starts Google OAuth with the canonical Game Ledger return URL", async ({ context, page }) => {
  await seedBrowser(context);

  const authorizeRequest: { url?: URL } = {};
  let returnOrigin = "";
  await page.route("**/__e2e_supabase__/auth/v1/authorize?**", async (route) => {
    authorizeRequest.url = new URL(route.request().url());
    await route.fulfill({ body: "Google handoff", contentType: "text/plain", status: 200 });
  });

  await page.goto("/apps/tile-tally");
  returnOrigin = new URL(page.url()).origin;
  await page.getByRole("button", { name: "Use redirect sign-in instead", exact: true }).click();
  await page.waitForURL("**/__e2e_supabase__/auth/v1/authorize?**");

  expect(authorizeRequest.url).toBeDefined();
  expect(authorizeRequest.url?.searchParams.get("provider")).toBe("google");
  expect(authorizeRequest.url?.searchParams.get("prompt")).toBe("select_account");
  expect(authorizeRequest.url?.searchParams.get("redirect_to")).toBe(
    `${returnOrigin}/apps/tile-tally`,
  );
});

test("exchanges the Google Identity Services token with a bound nonce", async ({ context, page }) => {
  await seedBrowser(context);
  const tokenSession = session(4_102_444_800);
  let exchangeBody: { id_token?: string; nonce?: string; provider?: string } = {};

  await page.route("**/__e2e_supabase__/auth/v1/token?grant_type=id_token", async (route) => {
    exchangeBody = route.request().postDataJSON() as typeof exchangeBody;
    await route.fulfill({
      body: JSON.stringify(tokenSession),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/__e2e_supabase__/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/rpc/gameledger_history_snapshot")) {
      await route.fulfill({ body: JSON.stringify(EMPTY_HISTORY_SNAPSHOT), contentType: "application/json", status: 200 });
      return;
    }
    await route.fulfill({
      body: JSON.stringify(path.endsWith("/tiletally_players") ? [player] : []),
      contentType: "application/json",
      headers: { "content-range": path.endsWith("/tiletally_players") ? "0-0/1" : "*/0" },
      status: 200,
    });
  });

  await page.goto("/apps/tile-tally");
  await page.getByRole("button", { name: "Continue with Google", exact: true }).click();

  await expect(page.getByText("tile-player@example.test", { exact: true })).toBeVisible();
  expect(exchangeBody).toMatchObject({
    id_token: "e2e-google-id-token",
    provider: "google",
  });
  expect(exchangeBody.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);

  const gisState = await page.evaluate(() => {
    const testWindow = window as unknown as Window & {
      __tileTallyGis: { clientId: string | null; nonce: string | null };
    };
    return testWindow.__tileTallyGis;
  });
  expect(gisState.clientId).toBe("e2e-google-client.apps.googleusercontent.com");
  expect(gisState.nonce).toMatch(/^[a-f0-9]{64}$/);
  expect(createHash("sha256").update(exchangeBody.nonce ?? "").digest("hex")).toBe(
    gisState.nonce,
  );
});

test("uses the responsive Google icon when localized button text would overflow", async ({
  context,
  page,
}) => {
  await seedBrowser(context);
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto("/apps/tile-tally");

  const host = page.getByTestId("google-identity-button");
  const button = page.getByRole("button", { name: "Continue with Google", exact: true });
  await expect(button).toBeVisible();

  const expectCurrentRenderFits = async (expectedLayout: "icon" | "standard") => {
    await expect.poll(() => page.evaluate(() => {
      const testWindow = window as unknown as Window & {
        __tileTallyGis: { renderLayouts: string[]; renderWidths: number[] };
      };
      const buttonHost = document.querySelector<HTMLElement>('[data-testid="google-identity-button"]');
      const renderedButton = buttonHost?.querySelector<HTMLElement>('[data-google-identity-services="true"]');
      if (!buttonHost || !renderedButton) return null;
      const hostRect = buttonHost.getBoundingClientRect();
      const buttonRect = renderedButton.getBoundingClientRect();
      return {
        buttonInsideHost:
          buttonRect.left >= hostRect.left - 0.5
          && buttonRect.right <= hostRect.right + 0.5,
        layout: renderedButton.dataset.googleButtonLayout,
        hostLayout: buttonHost.dataset.googleButtonLayout,
        latestWidth: testWindow.__tileTallyGis.renderWidths.at(-1),
      };
    })).toMatchObject({
      buttonInsideHost: true,
      layout: expectedLayout,
      hostLayout: expectedLayout,
      latestWidth: expectedLayout === "standard"
        ? await host.evaluate((element) => Math.min(400, Math.floor(element.getBoundingClientRect().width)))
        : 44,
    });
    await expectNoHorizontalDocumentOverflow(page);
  };

  await expectCurrentRenderFits("standard");
  await page.setViewportSize({ width: 320, height: 700 });
  await expectCurrentRenderFits("icon");
  await page.setViewportSize({ width: 844, height: 900 });
  await expectCurrentRenderFits("standard");

  const renderWidths = await page.evaluate(() => {
    const testWindow = window as unknown as Window & {
      __tileTallyGis: { renderWidths: number[] };
    };
    return testWindow.__tileTallyGis.renderWidths;
  });
  expect(renderWidths[0]).toBe(400);
  expect(renderWidths.some((width) => width < 400)).toBe(true);
  expect(renderWidths.at(-1)).toBe(400);
});

test("visible media renews its signed URL without reloading ledger history", async ({ context, page }) => {
  const activeSession = session(4_102_444_800);
  const gameId = "20000000-0000-4000-8000-000000000078";
  const mediaPath = `${ACCOUNT_ID}/${gameId}/50000000-0000-4000-8000-000000000078/memory.png`;
  const game = {
    id: gameId,
    profile_id: null,
    profile_version: null,
    title: "Renewal proof",
    definition: {
      version: 1,
      name: "Renewal proof",
      preset: "freeform",
      participant: { min: 0, max: 32 },
      counters: [],
      event_fields: [],
      result_fields: [],
      result: { mode: "none", allow_draw: true },
    },
    status: "in_progress",
    location: null,
    started_at: "2026-08-07T18:00:00.000Z",
    ended_at: null,
    created_at: "2026-08-07T18:00:00.000Z",
    updated_at: "2026-08-07T18:00:00.000Z",
  };
  const media = {
    bucket_id: "gameledger-media",
    byte_size: 68,
    caption: null,
    captured_at: "2026-08-07T18:00:00.000Z",
    created_at: "2026-08-07T18:00:00.000Z",
    deleted_at: null,
    duration_ms: null,
    game_id: gameId,
    height: 1,
    id: "50000000-0000-4000-8000-000000000078",
    media_data: {},
    media_kind: "photo",
    mime_type: "image/png",
    owner_id: ACCOUNT_ID,
    storage_path: mediaPath,
    width: 1,
  };
  await seedBrowser(context, activeSession);

  let historySnapshotRequests = 0;
  let signedUrlRequests = 0;
  const ledgerTableReads: string[] = [];
  await page.route("**/__e2e_supabase__/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith("/rest/v1/rpc/gameledger_history_snapshot")) {
      historySnapshotRequests += 1;
      await route.fulfill({
        body: JSON.stringify({
          ...EMPTY_HISTORY_SNAPSHOT,
          games: [game],
          active_media_counts: [{ game_id: gameId, active_media_count: 1 }],
        }),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    if (url.pathname.includes("/rest/v1/")) {
      const table = url.pathname.split("/rest/v1/")[1]?.split("/")[0] ?? "unknown";
      if (request.method() === "GET") ledgerTableReads.push(table);
      const rows = table === "gameledger_media" ? [media] : [];
      await route.fulfill({
        body: JSON.stringify(rows),
        contentType: "application/json",
        headers: { "content-range": rows.length ? "0-0/1" : "*/0" },
        status: 200,
      });
      return;
    }
    if (request.method() === "POST" && url.pathname.endsWith("/storage/v1/object/sign/gameledger-media")) {
      signedUrlRequests += 1;
      const body = request.postDataJSON() as { paths?: string[] };
      await route.fulfill({
        body: JSON.stringify((body.paths ?? []).map((path) => ({
          path,
          signedURL: `/object/sign/gameledger-media/${path}?token=renewal-${signedUrlRequests}`,
        }))),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    if (request.method() === "GET" && url.pathname.includes("/storage/v1/object/sign/gameledger-media/")) {
      await route.fulfill({
        body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==", "base64"),
        contentType: "image/png",
        status: 200,
      });
      return;
    }
    await route.fulfill({ body: "{}", contentType: "application/json", status: 200 });
  });

  await page.goto("/apps/tile-tally");
  await page.getByRole("button", { name: /Renewal proof/ }).click();
  const photo = page.getByRole("img", { name: "Photo from this game" });
  await expect(photo).toHaveAttribute("src", /token=renewal-1/);
  expect(historySnapshotRequests).toBe(1);
  expect(ledgerTableReads).toEqual(["gameledger_media"]);
  expect(signedUrlRequests).toBe(1);

  const snapshotsBeforeRenewal = historySnapshotRequests;
  const tableReadsBeforeRenewal = [...ledgerTableReads];
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

  await expect.poll(() => signedUrlRequests).toBe(2);
  await expect(photo).toHaveAttribute("src", /token=renewal-2/);
  expect(historySnapshotRequests).toBe(snapshotsBeforeRenewal);
  expect(ledgerTableReads).toEqual(tableReadsBeforeRenewal);
});

test("a user switch cannot commit an older account's overlapping media renewal", async ({ context, page }) => {
  const firstSession = session(4_102_444_800);
  const secondAccountId = "00000000-0000-4000-8000-000000000099";
  const secondSession = {
    ...session(4_102_444_800),
    access_token: "second-account-access-token",
    refresh_token: "second-account-refresh-token",
    user: {
      ...session(4_102_444_800).user,
      id: secondAccountId,
      email: "second-player@example.test",
    },
  };
  const firstEntity = {
    created_at: "2026-08-07T18:00:00.000Z",
    entity_type: "person",
    id: "10000000-0000-4000-8000-000000000041",
    metadata: {},
    name: "First account secret",
    owner_id: ACCOUNT_ID,
    updated_at: "2026-08-07T18:00:00.000Z",
  };
  const secondEntity = {
    ...firstEntity,
    id: "10000000-0000-4000-8000-000000000099",
    name: "Second account player",
    owner_id: secondAccountId,
  };
  const firstMedia = {
    bucket_id: "gameledger-media",
    byte_size: 68,
    caption: null,
    captured_at: "2026-08-07T18:00:00.000Z",
    created_at: "2026-08-07T18:00:00.000Z",
    deleted_at: null,
    duration_ms: null,
    game_id: "20000000-0000-4000-8000-000000000041",
    height: 1,
    id: "50000000-0000-4000-8000-000000000041",
    media_data: {},
    media_kind: "photo",
    mime_type: "image/png",
    owner_id: ACCOUNT_ID,
    storage_path: `${ACCOUNT_ID}/20000000-0000-4000-8000-000000000041/50000000-0000-4000-8000-000000000041/secret.png`,
    width: 1,
  };
  await seedBrowser(context, firstSession);

  let holdFirstAccountRenewal = false;
  let heldRequests = 0;
  let releaseHeldRequests: () => void = () => undefined;
  const heldRequestGate = new Promise<void>((resolve) => {
    releaseHeldRequests = resolve;
  });

  await page.route("**/__e2e_supabase__/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const authorization = request.headers().authorization ?? "";

    if (url.pathname.endsWith("/auth/v1/token") && url.searchParams.get("grant_type") === "id_token") {
      await route.fulfill({ body: JSON.stringify(secondSession), contentType: "application/json", status: 200 });
      return;
    }
    if (url.pathname.endsWith("/auth/v1/logout")) {
      await route.fulfill({ body: "{}", contentType: "application/json", status: 200 });
      return;
    }
    if (url.pathname.includes("/rest/v1/")) {
      const isFirstAccount = authorization.includes(firstSession.access_token);
      if (url.pathname.endsWith("/rest/v1/rpc/gameledger_history_snapshot")) {
        const entity = isFirstAccount ? firstEntity : secondEntity;
        const { owner_id: _ownerId, ...snapshotEntity } = entity;
        await route.fulfill({
          body: JSON.stringify({ ...EMPTY_HISTORY_SNAPSHOT, entities: [snapshotEntity] }),
          contentType: "application/json",
          status: 200,
        });
        return;
      }
      const table = url.pathname.split("/rest/v1/")[1]?.split("/")[0];
      const rows = table === "gameledger_entities"
        ? [isFirstAccount ? firstEntity : secondEntity]
        : table === "gameledger_media" && isFirstAccount
          ? [firstMedia]
          : [];
      await route.fulfill({
        body: JSON.stringify(rows),
        contentType: "application/json",
        headers: { "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" },
        status: 200,
      });
      return;
    }
    if (url.pathname.endsWith("/storage/v1/object/sign/gameledger-media")) {
      const isFirstAccount = authorization.includes(firstSession.access_token);
      if (holdFirstAccountRenewal && isFirstAccount) {
        heldRequests += 1;
        await heldRequestGate;
      }
      const body = request.postDataJSON() as { paths?: string[] };
      await route.fulfill({
        body: JSON.stringify((body.paths ?? []).map((path) => ({
          path,
          signedURL: `/object/sign/gameledger-media/${path}?token=first-account-preview`,
        }))),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    await route.fulfill({ body: "{}", contentType: "application/json", status: 200 });
  });

  await page.goto("/apps/tile-tally");
  await expect(page.getByText("First account secret", { exact: true })).toBeVisible();

  holdFirstAccountRenewal = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => heldRequests).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Continue with Google", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
  await expect(page.getByText("second-player@example.test", { exact: true })).toBeVisible();
  await expect(page.getByText("Second account player", { exact: true })).toBeVisible();

  releaseHeldRequests();
  await expect.poll(() => heldRequests).toBe(1);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("First account secret", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Second account player", { exact: true })).toBeVisible();
});

test("reports a rejected ID-token exchange and rotates the nonce before retry", async ({
  context,
  page,
}) => {
  await seedBrowser(context);
  await page.route("**/__e2e_supabase__/auth/v1/token?grant_type=id_token", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ code: "bad_oauth_state", message: "The secure sign-in nonce did not match." }),
      contentType: "application/json",
      status: 400,
    });
  });

  await page.goto("/apps/tile-tally");
  await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
  await expect(page.getByText("The secure sign-in nonce did not match.", { exact: true })).toBeVisible();

  await expect.poll(() => page.evaluate(() => {
    const testWindow = window as unknown as Window & {
      __tileTallyGis: { initialiseCount: number };
    };
    return testWindow.__tileTallyGis.initialiseCount;
  })).toBeGreaterThanOrEqual(2);

  const nonceHistory = await page.evaluate(() => {
    const testWindow = window as unknown as Window & {
      __tileTallyGis: { nonceHistory: string[] };
    };
    return testWindow.__tileTallyGis.nonceHistory;
  });
  expect(nonceHistory.at(-1)).not.toBe(nonceHistory[0]);
});

test("shows a Google callback failure once and removes it from the address", async ({ context, page }) => {
  await seedBrowser(context);

  await page.goto(
    "/apps/tile-tally?error=access_denied&error_code=provider_error&error_description=The+Google+sign-in+was+cancelled",
  );

  await expect(
    page.getByText("Google sign-in could not finish: The Google sign-in was cancelled", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => new URL(page.url()).search).toBe("");

  await page.reload();
  await expect(
    page.getByText("Google sign-in could not finish: The Google sign-in was cancelled", { exact: true }),
  ).toHaveCount(0);
});

test("wraps a long unbroken Google callback error without widening a phone viewport", async ({
  context,
  page,
}) => {
  await seedBrowser(context);
  await page.setViewportSize({ width: 320, height: 568 });
  const callbackDetail = `provider_${"unbroken".repeat(48)}`;
  const expectedMessage = `Google sign-in could not finish: ${callbackDetail}`;

  await page.goto(
    `/apps/tile-tally?error=access_denied&error_code=provider_error&error_description=${encodeURIComponent(callbackDetail)}`,
  );

  const alert = page.getByRole("alert").filter({ hasText: expectedMessage });
  await expect(alert).toBeVisible();
  await expect(alert).toHaveText(expectedMessage);
  const geometry = await alert.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      clientWidth: element.clientWidth,
      left: rect.left,
      overflowWrap: getComputedStyle(element).overflowWrap,
      right: rect.right,
      scrollWidth: element.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.overflowWrap).toBe("anywhere");
  await expectNoHorizontalDocumentOverflow(page);
});

test("contains a long signed-in email without overlapping the mobile header", async ({
  context,
  page,
}) => {
  const longEmail = `${"long-account-identifier-".repeat(12)}@example.test`;
  const activeSession = {
    ...session(4_102_444_800),
    user: {
      ...session(4_102_444_800).user,
      email: longEmail,
    },
  };
  await seedBrowser(context, activeSession);
  await page.setViewportSize({ width: 320, height: 700 });

  await page.route("**/__e2e_supabase__/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/v1/user")) {
      await route.fulfill({
        body: JSON.stringify(activeSession.user),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    if (url.pathname.endsWith("/rest/v1/rpc/gameledger_history_snapshot")) {
      await route.fulfill({
        body: JSON.stringify(EMPTY_HISTORY_SNAPSHOT),
        contentType: "application/json",
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
  const wordmark = page.getByLabel("Aeronauty Game Ledger");
  const email = page.getByText(longEmail, { exact: true });
  const signOut = page.getByRole("button", { name: "Sign out", exact: true });
  await expect(email).toBeVisible();
  await expect(signOut).toBeVisible();

  const geometry = await page.evaluate((accountEmail) => {
    const wordmarkElement = document.querySelector<HTMLElement>('[aria-label="Aeronauty Game Ledger"]');
    const emailElement = Array.from(document.querySelectorAll<HTMLElement>("span"))
      .find((element) => element.textContent === accountEmail);
    const signOutElement = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .find((element) => element.textContent?.trim() === "Sign out");
    if (!wordmarkElement || !emailElement || !signOutElement) return null;
    const wordmarkRect = wordmarkElement.getBoundingClientRect();
    const emailRect = emailElement.getBoundingClientRect();
    const signOutRect = signOutElement.getBoundingClientRect();
    const overlaps = (first: DOMRect, second: DOMRect) =>
      first.left < second.right
      && first.right > second.left
      && first.top < second.bottom
      && first.bottom > second.top;
    return {
      emailClientWidth: emailElement.clientWidth,
      emailRight: emailRect.right,
      emailScrollWidth: emailElement.scrollWidth,
      emailTextOverflow: getComputedStyle(emailElement).textOverflow,
      signOutRight: signOutRect.right,
      viewportWidth: window.innerWidth,
      wordmarkOverlapsEmail: overlaps(wordmarkRect, emailRect),
      wordmarkOverlapsSignOut: overlaps(wordmarkRect, signOutRect),
    };
  }, longEmail);

  expect(geometry).not.toBeNull();
  expect(geometry?.emailScrollWidth).toBeGreaterThan(geometry?.emailClientWidth ?? 0);
  expect(geometry?.emailTextOverflow).toBe("ellipsis");
  expect(geometry?.emailRight).toBeLessThanOrEqual((geometry?.viewportWidth ?? 0) + 1);
  expect(geometry?.signOutRight).toBeLessThanOrEqual((geometry?.viewportWidth ?? 0) + 1);
  expect(geometry?.wordmarkOverlapsEmail).toBe(false);
  expect(geometry?.wordmarkOverlapsSignOut).toBe(false);
  await expect(wordmark).toBeVisible();
  await expectNoHorizontalDocumentOverflow(page);
});

test("keeps analytics consent controls reachable in short viewports", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("aeronauty-analytics-consent");
    localStorage.removeItem("aeronauty-tiletally-auth");
  });
  await page.setViewportSize({ width: 320, height: 240 });
  await page.goto("/apps/tile-tally");

  const banner = page.getByTestId("analytics-consent-banner");
  const buttons = [
    page.getByRole("button", { name: "No thanks", exact: true }),
    page.getByRole("button", { name: "That's fine", exact: true }),
  ];

  const expectBannerFits = async () => {
    await expect(banner).toBeVisible();
    const bannerGeometry = await banner.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        clientHeight: element.clientHeight,
        left: rect.left,
        overflowY: getComputedStyle(element).overflowY,
        right: rect.right,
        scrollHeight: element.scrollHeight,
        top: rect.top,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });
    expect(bannerGeometry.left).toBeGreaterThanOrEqual(-1);
    expect(bannerGeometry.right).toBeLessThanOrEqual(bannerGeometry.viewportWidth + 1);
    expect(bannerGeometry.top).toBeGreaterThanOrEqual(-1);
    expect(bannerGeometry.bottom).toBeLessThanOrEqual(bannerGeometry.viewportHeight + 1);
    if (bannerGeometry.scrollHeight > bannerGeometry.clientHeight + 1) {
      expect(bannerGeometry.overflowY).toBe("auto");
    }

    for (const button of buttons) {
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeVisible();
      const buttonGeometry = await button.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          viewportHeight: window.innerHeight,
          viewportWidth: window.innerWidth,
        };
      });
      expect(buttonGeometry.height).toBeGreaterThanOrEqual(44);
      expect(buttonGeometry.left).toBeGreaterThanOrEqual(-1);
      expect(buttonGeometry.right).toBeLessThanOrEqual(buttonGeometry.viewportWidth + 1);
      expect(buttonGeometry.top).toBeGreaterThanOrEqual(-1);
      expect(buttonGeometry.bottom).toBeLessThanOrEqual(buttonGeometry.viewportHeight + 1);
    }
    await expectNoHorizontalDocumentOverflow(page);
  };

  await expectBannerFits();
  await page.setViewportSize({ width: 844, height: 390 });
  await banner.evaluate((element) => { element.scrollTop = 0; });
  await expectBannerFits();
});

test("accepts a successful OAuth callback, stores the session, and opens the ledger", async ({
  context,
  page,
}) => {
  await seedBrowser(context);
  const callbackSession = session(4_102_444_800);

  await page.route("**/__e2e_supabase__/auth/v1/user", async (route) => {
    await route.fulfill({
      body: JSON.stringify(callbackSession.user),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/__e2e_supabase__/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/rpc/gameledger_history_snapshot")) {
      await route.fulfill({ body: JSON.stringify(EMPTY_HISTORY_SNAPSHOT), contentType: "application/json", status: 200 });
      return;
    }
    await route.fulfill({
      body: JSON.stringify(path.endsWith("/tiletally_players") ? [player] : []),
      contentType: "application/json",
      headers: { "content-range": path.endsWith("/tiletally_players") ? "0-0/1" : "*/0" },
      status: 200,
    });
  });

  await page.goto(
    "/apps/tile-tally#access_token=auth-e2e-access-token&expires_in=3600&refresh_token=auth-e2e-refresh-token&token_type=bearer",
  );

  await expect(page.getByText("tile-player@example.test", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { access_token?: string }).access_token : null;
  }, AUTH_STORAGE_KEY)).toBe("auth-e2e-access-token");
  await expect.poll(() => new URL(page.url()).hash).toBe("");

  await page.reload();
  await expect(page.getByText("tile-player@example.test", { exact: true })).toBeVisible();
});
