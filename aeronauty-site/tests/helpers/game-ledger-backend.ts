import {
  test as base,
  type BrowserContext,
  type Route,
} from "@playwright/test";

export const LEDGER_ACCOUNT_ID = "00000000-0000-4000-8000-000000000042";
export const LEDGER_AUTH_STORAGE_KEY = "aeronauty-tiletally-auth";

const FIXED_NOW = "2026-08-07T18:00:00.000Z";
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nAAAAABJRU5ErkJggg==",
  "base64",
);

type JsonRecord = Record<string, unknown>;

export type MockLedgerEntity = {
  id: string;
  owner_id: string;
  entity_type: string;
  name: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type MockLedgerGame = {
  id: string;
  owner_id: string;
  profile_id: string | null;
  profile_version: number | null;
  title: string;
  definition: JsonRecord;
  status: string;
  location: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MockLedgerParticipant = {
  id: string;
  owner_id: string;
  game_id: string;
  entity_id: string | null;
  label: string;
  seat: number;
  metadata: unknown;
  created_at: string;
};

export type MockLedgerEvent = {
  id: string;
  owner_id: string;
  game_id: string;
  actor_participant_id: string | null;
  seq: number;
  event_kind: string;
  event_data: JsonRecord;
  note: string | null;
  occurred_at: string;
  voids_event_id: string | null;
  created_at: string;
};

export type MockLedgerMedia = {
  id: string;
  owner_id: string;
  game_id: string;
  bucket_id: string;
  storage_path: string;
  media_kind: "photo" | "video";
  mime_type: string;
  byte_size: number;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  caption: string | null;
  media_data: unknown;
  captured_at: string;
  created_at: string;
  deleted_at: string | null;
};

export const ledgerSession = {
  access_token: "game-ledger-e2e-access-token",
  expires_at: 4_102_444_800,
  expires_in: 2_147_483_647,
  refresh_token: "game-ledger-e2e-refresh-token",
  token_type: "bearer",
  user: {
    app_metadata: { provider: "google", providers: ["google"] },
    aud: "authenticated",
    confirmed_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    email: "ledger-player@example.test",
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
    id: LEDGER_ACCOUNT_ID,
    identities: [],
    is_anonymous: false,
    last_sign_in_at: "2026-01-01T00:00:00.000Z",
    phone: "",
    role: "authenticated",
    updated_at: "2026-01-01T00:00:00.000Z",
    user_metadata: { full_name: "Ledger Player" },
  },
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function rowsBody(rows: unknown[]) {
  return {
    body: JSON.stringify(rows),
    contentType: "application/json",
    headers: { "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" },
    status: 200,
  };
}

async function postData(route: Route): Promise<JsonRecord> {
  try {
    return record(route.request().postDataJSON());
  } catch {
    return {};
  }
}

function tableFromPath(pathname: string) {
  return pathname.split("/rest/v1/")[1]?.split("/")[0] ?? "";
}

function idFor(prefix: number, sequence: number) {
  return `${String(prefix).padStart(8, "0")}-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

export class GameLedgerBackend {
  readonly entities: MockLedgerEntity[] = [];
  readonly games: MockLedgerGame[] = [];
  readonly participants: MockLedgerParticipant[] = [];
  readonly events: MockLedgerEvent[] = [];
  readonly media: MockLedgerMedia[] = [];
  readonly uploadedPaths: string[] = [];
  readonly removedPaths: string[] = [];
  readonly tombstonedMediaIds: string[] = [];
  readonly mediaReservationIds: string[] = [];
  readonly startOperationIds: string[] = [];
  readonly appendOperationIds: string[] = [];
  readonly finishOperationIds: string[] = [];
  failSignedUrls = false;
  failNextUpload = false;
  failNextRemove = false;
  loseNextStartResponse = false;
  loseNextAppendResponse = false;
  loseNextFinishResponse = false;
  loseNextMediaReservationResponse = false;

  private sequence = 1;

  private nextId(prefix: number) {
    const next = idFor(prefix, this.sequence);
    this.sequence += 1;
    return next;
  }

  private nextEventSequence(gameId: string) {
    return Math.max(0, ...this.events.filter((event) => event.game_id === gameId).map((event) => event.seq)) + 1;
  }

  async handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;

    if (pathname.includes("/rest/v1/rpc/")) {
      await this.handleRpc(route, pathname.split("/rest/v1/rpc/")[1] ?? "");
      return;
    }

    if (pathname.includes("/rest/v1/")) {
      await this.handleRest(route, tableFromPath(pathname));
      return;
    }

    if (pathname.includes("/storage/v1/")) {
      await this.handleStorage(route, pathname);
      return;
    }

    if (pathname.endsWith("/auth/v1/user")) {
      await route.fulfill({ body: JSON.stringify(ledgerSession.user), contentType: "application/json", status: 200 });
      return;
    }

    await route.fulfill({ body: "{}", contentType: "application/json", status: 200 });
  }

  private async handleRest(route: Route, table: string) {
    const method = route.request().method();

    if (method === "GET") {
      if (table === "gameledger_entities") await route.fulfill(rowsBody(this.entities));
      else if (table === "gameledger_games") await route.fulfill(rowsBody(this.games));
      else if (table === "gameledger_participants") await route.fulfill(rowsBody(this.participants));
      else if (table === "gameledger_events") await route.fulfill(rowsBody(this.events));
      else if (table === "gameledger_media") await route.fulfill(rowsBody(this.media.filter((item) => !item.deleted_at)));
      else await route.fulfill(rowsBody([]));
      return;
    }

    if (method === "POST" && table === "gameledger_entities") {
      const body = await postData(route);
      const entity: MockLedgerEntity = {
        id: this.nextId(1),
        owner_id: stringValue(body.owner_id, LEDGER_ACCOUNT_ID),
        entity_type: stringValue(body.entity_type, "other"),
        name: stringValue(body.name),
        metadata: body.metadata ?? {},
        created_at: FIXED_NOW,
        updated_at: FIXED_NOW,
      };
      this.entities.push(entity);
      await route.fulfill({ body: JSON.stringify(entity), contentType: "application/json", status: 201 });
      return;
    }

    if (method === "POST" && table === "gameledger_games") {
      const body = await postData(route);
      const game: MockLedgerGame = {
        id: this.nextId(2),
        owner_id: stringValue(body.owner_id, LEDGER_ACCOUNT_ID),
        profile_id: nullableString(body.profile_id),
        profile_version: typeof body.profile_version === "number" ? body.profile_version : null,
        title: stringValue(body.title),
        definition: record(body.definition),
        status: body.status === "complete" ? "complete" : "in_progress",
        location: nullableString(body.location),
        started_at: stringValue(body.started_at, FIXED_NOW),
        ended_at: null,
        created_at: FIXED_NOW,
        updated_at: FIXED_NOW,
      };
      this.games.push(game);
      await route.fulfill({ body: JSON.stringify(game), contentType: "application/json", status: 201 });
      return;
    }

    if (method === "POST" && table === "gameledger_participants") {
      const raw = route.request().postDataJSON() as unknown;
      const candidates = Array.isArray(raw) ? raw : [raw];
      for (const candidate of candidates) {
        const body = record(candidate);
        this.participants.push({
          id: this.nextId(3),
          owner_id: stringValue(body.owner_id, LEDGER_ACCOUNT_ID),
          game_id: stringValue(body.game_id),
          entity_id: nullableString(body.entity_id),
          label: stringValue(body.label),
          seat: numberValue(body.seat),
          metadata: body.metadata ?? {},
          created_at: FIXED_NOW,
        });
      }
      await route.fulfill({ body: "[]", contentType: "application/json", status: 201 });
      return;
    }

    if (method === "POST" && table === "gameledger_media") {
      const body = await postData(route);
      const mediaKind = body.media_kind === "video" ? "video" : "photo";
      const mediaId = stringValue(body.id, this.nextId(5));
      this.mediaReservationIds.push(mediaId);
      if (this.media.some((candidate) => candidate.id === mediaId)) {
        await route.fulfill({
          body: JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint" }),
          contentType: "application/json",
          status: 409,
        });
        return;
      }
      const item: MockLedgerMedia = {
        id: mediaId,
        owner_id: stringValue(body.owner_id, LEDGER_ACCOUNT_ID),
        game_id: stringValue(body.game_id),
        bucket_id: stringValue(body.bucket_id, "gameledger-media"),
        storage_path: stringValue(body.storage_path),
        media_kind: mediaKind,
        mime_type: stringValue(body.mime_type, mediaKind === "photo" ? "image/png" : "video/mp4"),
        byte_size: numberValue(body.byte_size),
        duration_ms: typeof body.duration_ms === "number" ? body.duration_ms : null,
        width: typeof body.width === "number" ? body.width : null,
        height: typeof body.height === "number" ? body.height : null,
        caption: nullableString(body.caption),
        media_data: body.media_data ?? {},
        captured_at: stringValue(body.captured_at, FIXED_NOW),
        created_at: FIXED_NOW,
        deleted_at: null,
      };
      this.media.push(item);
      if (this.loseNextMediaReservationResponse) {
        this.loseNextMediaReservationResponse = false;
        await route.abort("failed");
        return;
      }
      await route.fulfill({ body: JSON.stringify(item), contentType: "application/json", status: 201 });
      return;
    }

    if (method === "DELETE" && table === "gameledger_games") {
      const id = new URL(route.request().url()).searchParams.get("id")?.replace(/^eq\./, "");
      const index = this.games.findIndex((game) => game.id === id);
      if (index >= 0) this.games.splice(index, 1);
      await route.fulfill({ body: "[]", contentType: "application/json", status: 200 });
      return;
    }

    await route.fulfill({ body: "[]", contentType: "application/json", status: 200 });
  }

  private async handleRpc(route: Route, rpc: string) {
    const body = await postData(route);

    if (rpc === "gameledger_start_game") {
      const gameId = stringValue(body.p_game_id, this.nextId(2));
      this.startOperationIds.push(gameId);
      const existing = this.games.find((candidate) => candidate.id === gameId);
      if (existing) {
        await route.fulfill({
          body: JSON.stringify({
            idempotent: true,
            game: existing,
            participants: this.participants.filter((participant) => participant.game_id === gameId),
          }),
          contentType: "application/json",
          status: 200,
        });
        return;
      }

      const game: MockLedgerGame = {
        id: gameId,
        owner_id: LEDGER_ACCOUNT_ID,
        profile_id: nullableString(body.p_profile_id),
        profile_version: typeof body.p_profile_version === "number" ? body.p_profile_version : null,
        title: stringValue(body.p_title),
        definition: record(body.p_definition),
        status: "in_progress",
        location: nullableString(body.p_location),
        started_at: stringValue(body.p_started_at, FIXED_NOW),
        ended_at: null,
        created_at: FIXED_NOW,
        updated_at: FIXED_NOW,
      };
      this.games.push(game);

      const participantRows: MockLedgerParticipant[] = [];
      const candidates = Array.isArray(body.p_participants) ? body.p_participants : [];
      for (const candidate of candidates) {
        const participant = record(candidate);
        const row: MockLedgerParticipant = {
          id: stringValue(participant.id, this.nextId(3)),
          owner_id: LEDGER_ACCOUNT_ID,
          game_id: gameId,
          entity_id: nullableString(participant.entity_id),
          label: stringValue(participant.label),
          seat: numberValue(participant.seat),
          metadata: participant.metadata ?? {},
          created_at: FIXED_NOW,
        };
        participantRows.push(row);
        this.participants.push(row);
      }

      if (this.loseNextStartResponse) {
        this.loseNextStartResponse = false;
        await route.abort("failed");
        return;
      }

      await route.fulfill({
        body: JSON.stringify({ idempotent: false, game, participants: participantRows }),
        contentType: "application/json",
        status: 200,
      });
      return;
    }

    if (rpc === "gameledger_append_event") {
      const gameId = stringValue(body.p_game_id);
      const eventId = stringValue(body.p_event_id, this.nextId(4));
      this.appendOperationIds.push(eventId);
      const existing = this.events.find((candidate) => candidate.id === eventId);
      if (existing) {
        await route.fulfill({ body: JSON.stringify({ event: existing }), contentType: "application/json", status: 200 });
        return;
      }
      const ledgerEvent: MockLedgerEvent = {
        id: eventId,
        owner_id: LEDGER_ACCOUNT_ID,
        game_id: gameId,
        actor_participant_id: nullableString(body.p_actor_participant_id),
        seq: this.nextEventSequence(gameId),
        event_kind: stringValue(body.p_event_kind, "moment"),
        event_data: record(body.p_event_data),
        note: nullableString(body.p_note),
        occurred_at: stringValue(body.p_occurred_at, FIXED_NOW),
        voids_event_id: nullableString(body.p_voids_event_id),
        created_at: FIXED_NOW,
      };
      this.events.push(ledgerEvent);
      if (this.loseNextAppendResponse) {
        this.loseNextAppendResponse = false;
        await route.abort("failed");
        return;
      }
      await route.fulfill({ body: JSON.stringify({ event: ledgerEvent }), contentType: "application/json", status: 200 });
      return;
    }

    if (rpc === "gameledger_finish_game") {
      const gameId = stringValue(body.p_game_id);
      const eventId = stringValue(body.p_event_id, this.nextId(4));
      this.finishOperationIds.push(eventId);
      const game = this.games.find((candidate) => candidate.id === gameId);
      const existing = this.events.find((candidate) => candidate.id === eventId);
      if (existing) {
        await route.fulfill({ body: JSON.stringify({ game, event: existing }), contentType: "application/json", status: 200 });
        return;
      }
      if (game) {
        game.status = "complete";
        game.ended_at = stringValue(body.p_ended_at, FIXED_NOW);
        game.updated_at = FIXED_NOW;
      }
      const ledgerEvent: MockLedgerEvent = {
        id: eventId,
        owner_id: LEDGER_ACCOUNT_ID,
        game_id: gameId,
        actor_participant_id: null,
        seq: this.nextEventSequence(gameId),
        event_kind: "result",
        event_data: record(body.p_result),
        note: nullableString(body.p_note),
        occurred_at: game?.ended_at ?? FIXED_NOW,
        voids_event_id: null,
        created_at: FIXED_NOW,
      };
      this.events.push(ledgerEvent);
      if (this.loseNextFinishResponse) {
        this.loseNextFinishResponse = false;
        await route.abort("failed");
        return;
      }
      await route.fulfill({ body: JSON.stringify({ game, event: ledgerEvent }), contentType: "application/json", status: 200 });
      return;
    }

    if (rpc === "gameledger_mark_media_deleted") {
      this.tombstonedMediaIds.push(stringValue(body.p_media_id));
      const item = this.media.find((candidate) => candidate.id === body.p_media_id);
      if (item) item.deleted_at = FIXED_NOW;
      await route.fulfill({ body: JSON.stringify(item ?? null), contentType: "application/json", status: 200 });
      return;
    }

    await route.fulfill({ body: "{}", contentType: "application/json", status: 200 });
  }

  private async handleStorage(route: Route, pathname: string) {
    const method = route.request().method();

    if (method === "POST" && pathname.endsWith("/storage/v1/object/sign/gameledger-media")) {
      if (this.failSignedUrls) {
        await route.fulfill({
          body: JSON.stringify({ message: "Private preview signing is temporarily unavailable" }),
          contentType: "application/json",
          status: 503,
        });
        return;
      }
      const body = await postData(route);
      const paths = Array.isArray(body.paths) ? body.paths.filter((path): path is string => typeof path === "string") : [];
      const signed = paths.map((path) => ({
        path,
        signedURL: `/object/sign/gameledger-media/${path}?token=e2e-signed-media`,
      }));
      await route.fulfill({ body: JSON.stringify(signed), contentType: "application/json", status: 200 });
      return;
    }

    if (method === "GET" && pathname.includes("/storage/v1/object/sign/gameledger-media/")) {
      await route.fulfill({ body: TINY_PNG, contentType: "image/png", status: 200 });
      return;
    }

    if (method === "POST" && pathname.includes("/storage/v1/object/gameledger-media/")) {
      const path = decodeURIComponent(pathname.split("/storage/v1/object/gameledger-media/")[1] ?? "");
      if (this.failNextUpload) {
        this.failNextUpload = false;
        await route.fulfill({
          body: JSON.stringify({ message: "Simulated upload interruption" }),
          contentType: "application/json",
          status: 503,
        });
        return;
      }
      this.uploadedPaths.push(path);
      await route.fulfill({ body: JSON.stringify({ Key: `gameledger-media/${path}` }), contentType: "application/json", status: 200 });
      return;
    }

    if (method === "DELETE" && pathname.endsWith("/storage/v1/object/gameledger-media")) {
      const body = await postData(route);
      const prefixes = Array.isArray(body.prefixes) ? body.prefixes.filter((path): path is string => typeof path === "string") : [];
      if (this.failNextRemove) {
        this.failNextRemove = false;
        await route.fulfill({
          body: JSON.stringify({ message: "Simulated storage cleanup failure" }),
          contentType: "application/json",
          status: 503,
        });
        return;
      }
      this.removedPaths.push(...prefixes);
      await route.fulfill({ body: JSON.stringify(prefixes.map((name) => ({ name }))), contentType: "application/json", status: 200 });
      return;
    }

    await route.fulfill({ body: "{}", contentType: "application/json", status: 200 });
  }
}

async function seedAuthenticatedBrowser(context: BrowserContext) {
  await context.addInitScript(
    ({ authSession, storageKey }) => {
      localStorage.setItem(storageKey, JSON.stringify(authSession));
      localStorage.setItem("aeronauty-analytics-consent", "declined");
    },
    { authSession: ledgerSession, storageKey: LEDGER_AUTH_STORAGE_KEY },
  );
}

type LedgerFixtures = {
  ledgerBackend: GameLedgerBackend;
};

export const test = base.extend<LedgerFixtures>({
  ledgerBackend: async ({ context, page }, use) => {
    await seedAuthenticatedBrowser(context);
    const backend = new GameLedgerBackend();
    await page.route("**/__e2e_supabase__/**", (route) => backend.handle(route));
    await use(backend);
  },
});

export { expect } from "@playwright/test";
