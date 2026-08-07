import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createHash } from "node:crypto";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000042";
const AUTH_STORAGE_KEY = "aeronauty-tiletally-auth";
const EXPIRED_SESSION_MESSAGE = "Your session expired. Continue with Google to sign in again.";

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
            renderButton: (parent: HTMLElement) => void;
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
          renderButton(parent) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "Continue with Google";
            button.dataset.googleIdentityServices = "true";
            button.addEventListener("click", () => {
              credentialCallback({ credential: "e2e-google-id-token" });
            });
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

test("a user switch cannot commit an older account's overlapping refresh", async ({ context, page }) => {
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

  let holdFirstAccountRefresh = false;
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
      if (holdFirstAccountRefresh && isFirstAccount) {
        heldRequests += 1;
        await heldRequestGate;
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

  holdFirstAccountRefresh = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => heldRequests).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Continue with Google", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue with Google", exact: true }).click();
  await expect(page.getByText("second-player@example.test", { exact: true })).toBeVisible();
  await expect(page.getByText("Second account player", { exact: true })).toBeVisible();

  releaseHeldRequests();
  await expect.poll(() => heldRequests).toBe(5);
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
