"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  clearTileTallyBrowserAuthStorage,
  getTileTallySupabaseClient,
  hasTileTallyBrowserAuthStorage,
} from "@/lib/tiletally/client";
import { normaliseGameProfile, validateGameProfile } from "@/lib/tiletally/gameProfiles";
import type { JsonValue } from "@/lib/tiletally/types";
import type {
  AppendLedgerEventInput,
  CreateLedgerGameInput,
  FinishLedgerGameInput,
  LedgerActiveMediaCount,
  LedgerEntity,
  LedgerEvent,
  LedgerGame,
  LedgerMedia,
  LedgerParticipant,
} from "./gameLedgerTypes";

const PAGE_SIZE = 1_000;
const MEDIA_BUCKET = "gameledger-media";
const SIGNED_URL_SECONDS = 10 * 60;
const SIGNED_URL_REFRESH_MS = 8 * 60 * 1_000;
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 45 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

type PageResult<T> = { data: T[] | null; error: unknown };

type HistorySnapshot = {
  entities: LedgerEntity[];
  games: LedgerGame[];
  participants: LedgerParticipant[];
  events: LedgerEvent[];
  activeMediaCounts: LedgerActiveMediaCount[];
};

type PendingStartOperation = {
  gameId: string;
  participantIds: string[];
};

type PendingEventOperation = {
  eventId: string;
  sourceId: string;
  occurredAt: string;
};

type PendingFinishOperation = {
  eventId: string;
  sourceId: string;
  endedAt: string;
};

type PendingMediaOperation = {
  mediaId: string;
  storagePath: string;
};

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Something went wrong. Please try again.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMissingHistorySnapshotError(error: unknown) {
  if (!isRecord(error)) return false;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";
  return code === "PGRST202" || code === "42883" || /gameledger_history_snapshot.*(?:not find|not found|does not exist|schema cache)/i.test(message);
}

function historySnapshotRows(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((row) => !isRecord(row))) {
    throw new Error(`Game history snapshot has an invalid ${field} collection.`);
  }
  return value as Record<string, unknown>[];
}

function parseHistorySnapshot(value: unknown, ownerId: string): HistorySnapshot {
  if (!isRecord(value) || value.schema_version !== 1) {
    throw new Error("Game history snapshot has an unsupported shape.");
  }
  const withOwner = <T,>(rows: Record<string, unknown>[]) => rows.map((row) => ({ ...row, owner_id: ownerId }) as T);
  const activeMediaCounts = historySnapshotRows(value.active_media_counts, "media counts").map((row) => {
    if (typeof row.game_id !== "string" || typeof row.active_media_count !== "number") {
      throw new Error("Game history snapshot has an invalid media count.");
    }
    return { game_id: row.game_id, active_media_count: row.active_media_count };
  });
  return {
    entities: withOwner<LedgerEntity>(historySnapshotRows(value.entities, "entities")),
    games: withOwner<LedgerGame>(historySnapshotRows(value.games, "games")),
    participants: withOwner<LedgerParticipant>(historySnapshotRows(value.participants, "participants")),
    events: withOwner<LedgerEvent>(historySnapshotRows(value.events, "events")),
    activeMediaCounts,
  };
}

function isAuthError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; status?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return (
    candidate.status === 401
    || candidate.status === 403
    || code === "PGRST301"
    || code === "PGRST302"
    || /(?:invalid|expired|missing|revoked).*(?:jwt|refresh token|session)|(?:jwt|refresh token|session).*(?:invalid|expired|missing|revoked)/i.test(message)
  );
}

function isLedgerAuthError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return (
    code === "PGRST301"
    || code === "PGRST302"
    || /(?:invalid|expired|missing|revoked).*(?:jwt|session)|(?:jwt|session).*(?:invalid|expired|missing|revoked)/i.test(message)
  );
}

function isAmbiguousPermissionError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === "42501" && typeof candidate.message === "string" && /permission denied/i.test(candidate.message);
}

function readOAuthCallbackError() {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const error = url.searchParams.get("error") ?? hash.get("error");
  if (!error) return null;
  const description = url.searchParams.get("error_description") ?? hash.get("error_description");
  return description
    ? `Google sign-in could not finish: ${description}`
    : `Google sign-in could not finish (${error.replace(/_/g, " ")}).`;
}

function clearOAuthCallbackFields() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const keys = [
    "access_token", "code", "error", "error_code", "error_description", "expires_at", "expires_in",
    "provider_refresh_token", "provider_token", "refresh_token", "token_type",
  ];
  keys.forEach((key) => url.searchParams.delete(key));
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  keys.forEach((key) => hash.delete(key));
  const nextHash = hash.toString();
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${nextHash ? `#${nextHash}` : ""}`);
}

async function collectPages<T>(loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await loadPage(from, from + PAGE_SIZE - 1);
    if (page.error) throw page.error;
    const next = page.data ?? [];
    rows.push(...next);
    if (next.length < PAGE_SIZE) return rows;
  }
}

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function cleanSlug(value: string, fallback: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || fallback;
}

function stableOperationKey(value: unknown): string {
  function normalise(candidate: unknown): unknown {
    if (Array.isArray(candidate)) return candidate.map(normalise);
    if (candidate && typeof candidate === "object") {
      return Object.fromEntries(
        Object.entries(candidate as Record<string, unknown>)
          .filter(([, entry]) => entry !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, normalise(entry)]),
      );
    }
    return candidate;
  }

  return JSON.stringify(normalise(value));
}

function mimeTypeFor(file: File, kind: "photo" | "video") {
  const supplied = file.type.trim().toLowerCase();
  if (supplied) return supplied;
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1];
  const byExtension: Record<string, string> = {
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
  };
  return (extension && byExtension[extension]) || (kind === "photo" ? "image/jpeg" : "video/mp4");
}

function extensionFor(file: File, kind: "photo" | "video", mimeType = mimeTypeFor(file, kind)) {
  const typeMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
  };
  const byType = typeMap[mimeType];
  if (byType) return byType;
  const byName = file.name.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1];
  return byName || (kind === "photo" ? "jpg" : "mp4");
}

function parseRpcEvent(data: unknown): LedgerEvent | null {
  if (!data || typeof data !== "object" || !("event" in data)) return null;
  const event = (data as { event?: unknown }).event;
  return event && typeof event === "object" ? event as LedgerEvent : null;
}

export function useGameLedger() {
  const oauthCallbackError = useMemo(readOAuthCallbackError, []);
  const clientState = useMemo(() => {
    try {
      return { client: getTileTallySupabaseClient(), error: null as string | null };
    } catch (error) {
      return { client: null, error: messageFromError(error) };
    }
  }, []);
  const supabase = clientState.client;

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(oauthCallbackError);
  const [entities, setEntities] = useState<LedgerEntity[]>([]);
  const [games, setGames] = useState<LedgerGame[]>([]);
  const [participants, setParticipants] = useState<LedgerParticipant[]>([]);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [media, setMedia] = useState<LedgerMedia[]>([]);
  const [activeMediaCounts, setActiveMediaCounts] = useState<LedgerActiveMediaCount[]>([]);
  const authRevision = useRef(0);
  const refreshGeneration = useRef(0);
  const activeUserId = useRef<string | null>(null);
  const pendingStartOperations = useRef(new Map<string, PendingStartOperation>());
  const pendingEventOperations = useRef(new Map<string, PendingEventOperation>());
  const pendingFinishOperations = useRef(new Map<string, PendingFinishOperation>());
  const pendingMediaOperations = useRef(new Map<string, PendingMediaOperation>());

  const clearPrivateData = useCallback(() => {
    setEntities([]);
    setGames([]);
    setParticipants([]);
    setEvents([]);
    setMedia([]);
    setActiveMediaCounts([]);
  }, []);

  const applySession = useCallback((nextSession: Session | null, forceClear = false) => {
    const nextUserId = nextSession?.user.id ?? null;
    const identityChanged = activeUserId.current !== nextUserId;
    authRevision.current += 1;
    refreshGeneration.current += 1;
    activeUserId.current = nextUserId;
    if (forceClear || identityChanged) {
      clearPrivateData();
      pendingStartOperations.current.clear();
      pendingEventOperations.current.clear();
      pendingFinishOperations.current.clear();
      pendingMediaOperations.current.clear();
    }
    setDataLoading(false);
    setSession(nextSession);
    setAuthLoading(false);
  }, [clearPrivateData]);

  const recoverSession = useCallback((message = "Your session expired. Continue with Google to sign in again.") => {
    if (!supabase) return;
    clearTileTallyBrowserAuthStorage();
    applySession(null, true);
    setError(message);
    void supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  }, [applySession, supabase]);

  useEffect(() => {
    if (!supabase) {
      if (oauthCallbackError) clearOAuthCallbackFields();
      setAuthLoading(false);
      return;
    }

    let alive = true;
    let eventRevision = 0;
    const startedWithStoredSession = hasTileTallyBrowserAuthStorage();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      eventRevision += 1;
      if (!alive) return;
      if (event === "INITIAL_SESSION" && startedWithStoredSession && !nextSession) {
        recoverSession(oauthCallbackError ?? undefined);
        return;
      }
      applySession(nextSession, event === "SIGNED_OUT");
    });

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (oauthCallbackError) clearOAuthCallbackFields();
      if (!alive || eventRevision > 0) return;
      if (sessionError && isAuthError(sessionError)) {
        recoverSession(oauthCallbackError ?? undefined);
      } else if (startedWithStoredSession && !data.session) {
        recoverSession(oauthCallbackError ?? undefined);
      } else {
        if (sessionError) setError(oauthCallbackError ?? messageFromError(sessionError));
        applySession(data.session);
      }
    }).catch((sessionError: unknown) => {
      if (!alive || eventRevision > 0) return;
      if (isAuthError(sessionError)) recoverSession(oauthCallbackError ?? undefined);
      else setError(oauthCallbackError ?? messageFromError(sessionError));
      setAuthLoading(false);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [applySession, oauthCallbackError, recoverSession, supabase]);

  const refresh = useCallback(async () => {
    if (!supabase || !session) return;
    const revision = authRevision.current;
    const userId = session.user.id;
    if (activeUserId.current !== userId) return;
    const generation = refreshGeneration.current + 1;
    refreshGeneration.current = generation;
    const isCurrent = () => (
      authRevision.current === revision
      && refreshGeneration.current === generation
      && activeUserId.current === userId
    );
    setDataLoading(true);
    setError(null);
    try {
      const [snapshotResult, nextMedia] = await Promise.all([
        supabase.rpc("gameledger_history_snapshot"),
        collectPages<LedgerMedia>((from, to) => supabase
          .from("gameledger_media")
          .select("*")
          .is("deleted_at", null)
          .order("captured_at")
          .order("created_at")
          .order("id")
          .range(from, to)),
      ]);
      let snapshot: HistorySnapshot;
      if (snapshotResult.error) {
        if (!isMissingHistorySnapshotError(snapshotResult.error)) throw snapshotResult.error;
        // A short-lived compatibility path keeps an already-deployed POC usable
        // while the additive snapshot RPC migration is being rolled out.
        const [nextEntities, nextGames, nextParticipants, nextEvents] = await Promise.all([
          collectPages<LedgerEntity>((from, to) => supabase.from("gameledger_entities").select("*").order("created_at").order("id").range(from, to)),
          collectPages<LedgerGame>((from, to) => supabase.from("gameledger_games").select("*").order("started_at").order("created_at").order("id").range(from, to)),
          collectPages<LedgerParticipant>((from, to) => supabase.from("gameledger_participants").select("*").order("game_id").order("seat").order("id").range(from, to)),
          collectPages<LedgerEvent>((from, to) => supabase.from("gameledger_events").select("*").order("game_id").order("seq").order("id").range(from, to)),
        ]);
        const mediaCounts = new Map<string, number>();
        nextMedia.forEach((item) => mediaCounts.set(item.game_id, (mediaCounts.get(item.game_id) ?? 0) + 1));
        snapshot = {
          entities: nextEntities,
          games: nextGames,
          participants: nextParticipants,
          events: nextEvents,
          activeMediaCounts: Array.from(mediaCounts, ([game_id, active_media_count]) => ({ game_id, active_media_count })),
        };
      } else {
        snapshot = parseHistorySnapshot(snapshotResult.data, userId);
      }
      if (!isCurrent()) return;
      const paths = nextMedia.map((item) => item.storage_path);
      let signedByPath = new Map<string, string>();
      let signingMessage: string | null = null;
      if (paths.length) {
        const { data: signedRows, error: signingError } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
        if (signingError) signingMessage = messageFromError(signingError);
        signedByPath = new Map((signedRows ?? []).flatMap((row) =>
          row.path && row.signedUrl ? [[row.path, row.signedUrl] as const] : [],
        ));
        if (!signingMessage && signedByPath.size !== paths.length) {
          signingMessage = "One or more private media previews could not be renewed.";
        }
      }
      if (!isCurrent()) return;
      setEntities(snapshot.entities);
      setGames(snapshot.games
        .map((game) => ({ ...game, definition: normaliseGameProfile(game.definition) }))
        .sort((left, right) => Date.parse(right.started_at) - Date.parse(left.started_at) || right.id.localeCompare(left.id)));
      setParticipants(snapshot.participants);
      setEvents(snapshot.events);
      setActiveMediaCounts(snapshot.activeMediaCounts);
      setMedia(nextMedia.map((item) => ({
        ...item,
        signed_url: signedByPath.get(item.storage_path) ?? null,
        transfer: signedByPath.has(item.storage_path)
          ? { status: "ready" }
          : {
              status: "error",
              error: signingMessage || "This private preview link is temporarily unavailable. Reopen the game to retry.",
            },
      })));
      if (signingMessage) setError(`Your game loaded, but some private media previews are unavailable: ${signingMessage}`);
    } catch (refreshError) {
      if (!isCurrent()) return;
      if (isAmbiguousPermissionError(refreshError)) {
        try {
          const { data, error: verificationError } = await supabase.auth.getUser(session.access_token);
          if (!isCurrent()) return;
          if ((verificationError && isAuthError(verificationError)) || (!verificationError && !data.user)) recoverSession();
          else setError(messageFromError(refreshError));
        } catch {
          if (isCurrent()) setError(messageFromError(refreshError));
        }
      } else if (isLedgerAuthError(refreshError)) recoverSession();
      else setError(messageFromError(refreshError));
    } finally {
      if (isCurrent()) setDataLoading(false);
    }
  }, [recoverSession, session, supabase]);

  useEffect(() => {
    if (!session) {
      setEntities([]);
      setGames([]);
      setParticipants([]);
      setEvents([]);
      setMedia([]);
      setActiveMediaCounts([]);
      return;
    }
    void refresh();
  }, [refresh, session]);

  const renewMediaPreviews = useCallback(async () => {
    if (!supabase || !session || media.length === 0) return;
    const revision = authRevision.current;
    const userId = session.user.id;
    const paths = media.map((item) => item.storage_path);
    try {
      const { data: signedRows, error: signingError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_SECONDS);
      if (signingError) throw signingError;
      if (authRevision.current !== revision || activeUserId.current !== userId) return;
      const signedByPath = new Map((signedRows ?? []).flatMap((row) =>
        row.path && row.signedUrl ? [[row.path, row.signedUrl] as const] : [],
      ));
      setMedia((current) => current.map((item) => ({
        ...item,
        signed_url: signedByPath.get(item.storage_path) ?? item.signed_url ?? null,
        transfer: signedByPath.has(item.storage_path)
          ? { status: "ready" }
          : {
              status: "error",
              error: "This private preview link could not be renewed. Reopen the game to retry.",
            },
      })));
      if (signedByPath.size !== paths.length) {
        setError("Your game is available, but one or more private media previews could not be renewed.");
      }
    } catch (renewalError) {
      if (authRevision.current !== revision || activeUserId.current !== userId) return;
      if (isLedgerAuthError(renewalError)) recoverSession();
      else setError(`Your game is available, but private media previews could not be renewed: ${messageFromError(renewalError)}`);
    }
  }, [media, recoverSession, session, supabase]);

  useEffect(() => {
    if (!session || media.length === 0) return;
    const timer = window.setInterval(() => void renewMediaPreviews(), SIGNED_URL_REFRESH_MS);
    const renewWhenVisible = () => {
      if (document.visibilityState === "visible") void renewMediaPreviews();
    };
    document.addEventListener("visibilitychange", renewWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", renewWhenVisible);
    };
  }, [media.length, renewMediaPreviews, session]);

  const mutate = useCallback(async <T,>(operation: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    try {
      return await operation();
    } catch (mutationError) {
      const message = messageFromError(mutationError);
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }, []);

  const signInWithGoogleToken = useCallback(async (credential: string, nonce: string) => {
    if (!supabase) return;
    await mutate(async () => {
      clearTileTallyBrowserAuthStorage();
      applySession(null, true);
      const { data, error: signInError } = await supabase.auth.signInWithIdToken({ provider: "google", token: credential, nonce });
      if (signInError) throw signInError;
      if (!data.session) throw new Error("Google sign-in completed without a session.");
      applySession(data.session);
    });
  }, [applySession, mutate, supabase]);

  const signInWithRedirect = useCallback(async () => {
    if (!supabase) return;
    await mutate(async () => {
      clearTileTallyBrowserAuthStorage();
      applySession(null, true);
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/apps/tile-tally`, queryParams: { prompt: "select_account" } },
      });
      if (signInError) throw signInError;
    });
  }, [applySession, mutate, supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await mutate(async () => {
      clearTileTallyBrowserAuthStorage();
      applySession(null, true);
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError && isAuthError(signOutError)) recoverSession();
      else if (signOutError) throw signOutError;
    });
  }, [applySession, mutate, recoverSession, supabase]);

  const addEntity = useCallback(async (name: string, entityType: string) => {
    if (!supabase || !session) return null;
    const cleaned = cleanName(name);
    if (!cleaned) throw new Error("Enter a participant name.");
    return mutate(async () => {
      const { data, error: insertError } = await supabase.from("gameledger_entities").insert({
        owner_id: session.user.id,
        entity_type: cleanSlug(entityType, "other"),
        name: cleaned,
        metadata: {},
      }).select("*").single();
      if (insertError) throw insertError;
      await refresh();
      return data as LedgerEntity;
    });
  }, [mutate, refresh, session, supabase]);

  const startGame = useCallback(async (input: CreateLedgerGameInput) => {
    if (!supabase || !session) return null;
    const title = cleanName(input.title);
    if (!title) throw new Error("Give the game a name.");
    validateGameProfile(input.definition);
    const encodedDefinition = JSON.stringify(input.definition);
    if (encodedDefinition.length > 128_000) throw new Error("That game definition is too large.");
    const selected = Array.from(new Set(input.entityIds));
    const selectedEntities = selected
      .map((id) => entities.find((entity) => entity.id === id && !entity.archived_at))
      .filter((entity): entity is LedgerEntity => Boolean(entity));
    if (selectedEntities.length !== selected.length) throw new Error("One of those participants no longer exists.");
    const location = cleanName(input.location ?? "") || null;
    const operationKey = stableOperationKey({
      definition: input.definition,
      entityIds: selected,
      location,
      ownerId: session.user.id,
      startedAt: input.startedAt,
      title,
    });
    let operation = pendingStartOperations.current.get(operationKey);
    if (!operation) {
      operation = {
        gameId: crypto.randomUUID(),
        participantIds: selectedEntities.map(() => crypto.randomUUID()),
      };
      pendingStartOperations.current.set(operationKey, operation);
    }

    return mutate(async () => {
      const { data, error: gameError } = await supabase.rpc("gameledger_start_game", {
        p_game_id: operation.gameId,
        p_title: title,
        p_definition: input.definition,
        p_started_at: input.startedAt,
        p_location: location,
        p_participants: selectedEntities.map((entity, seat) => {
          const role = input.definition.participant?.roles?.[seat];
          return {
            id: operation.participantIds[seat],
            entity_id: entity.id,
            label: entity.name,
            seat: seat + 1,
            metadata: role ? { role_id: role.id, role_label: role.label } : {},
          };
        }),
        p_profile_id: null,
        p_profile_version: null,
      });
      if (gameError) throw gameError;
      const rawGame = data && typeof data === "object" && "game" in data
        ? (data as { game: LedgerGame }).game
        : null;
      if (!rawGame) throw new Error("The game was created without a readable game row.");
      const game = { ...rawGame, definition: normaliseGameProfile(rawGame.definition) };
      if (pendingStartOperations.current.get(operationKey) === operation) {
        pendingStartOperations.current.delete(operationKey);
      }
      await refresh();
      return game;
    });
  }, [entities, mutate, refresh, session, supabase]);

  const appendEvent = useCallback(async (input: AppendLedgerEventInput) => {
    if (!supabase || !session) return null;
    const eventData: Record<string, JsonValue> = {};
    if (input.values && Object.keys(input.values).length) eventData.values = input.values;
    if (input.fields && Object.keys(input.fields).length) eventData.fields = input.fields;
    const eventKind = cleanSlug(input.kind, "moment");
    const note = cleanName(input.note ?? "") || null;
    const operationKey = stableOperationKey({
      actorParticipantId: input.participantId ?? null,
      eventData,
      eventKind,
      gameId: input.gameId,
      note,
      occurredAt: input.occurredAt ?? null,
      ownerId: session.user.id,
      voidsEventId: input.voidsEventId ?? null,
    });
    let operation = pendingEventOperations.current.get(operationKey);
    if (!operation) {
      operation = {
        eventId: crypto.randomUUID(),
        sourceId: crypto.randomUUID(),
        occurredAt: input.occurredAt ?? new Date().toISOString(),
      };
      pendingEventOperations.current.set(operationKey, operation);
    }

    return mutate(async () => {
      const { data, error: rpcError } = await supabase.rpc("gameledger_append_event", {
        p_game_id: input.gameId,
        p_event_id: operation.eventId,
        p_event_kind: eventKind,
        p_actor_participant_id: input.participantId ?? null,
        p_event_data: eventData,
        p_note: note,
        p_occurred_at: operation.occurredAt,
        p_voids_event_id: input.voidsEventId ?? null,
        p_source_id: operation.sourceId,
        p_source_kind: "manual",
        p_source_data: { client: "game_ledger_web" },
      });
      if (rpcError) throw rpcError;
      const created = parseRpcEvent(data);
      if (pendingEventOperations.current.get(operationKey) === operation) {
        pendingEventOperations.current.delete(operationKey);
      }
      await refresh();
      return created;
    });
  }, [mutate, refresh, session, supabase]);

  const voidEvent = useCallback(async (gameId: string, eventId: string) => {
    await appendEvent({ gameId, kind: "void", voidsEventId: eventId, note: "Undid the previous entry" });
  }, [appendEvent]);

  const finishGame = useCallback(async (input: FinishLedgerGameInput) => {
    if (!supabase || !session) return;
    const note = cleanName(input.note ?? "") || null;
    const operationKey = stableOperationKey({
      endedAt: input.endedAt ?? null,
      gameId: input.gameId,
      note,
      ownerId: session.user.id,
      result: input.result,
    });
    let operation = pendingFinishOperations.current.get(operationKey);
    if (!operation) {
      operation = {
        eventId: crypto.randomUUID(),
        sourceId: crypto.randomUUID(),
        endedAt: input.endedAt ?? new Date().toISOString(),
      };
      pendingFinishOperations.current.set(operationKey, operation);
    }

    await mutate(async () => {
      const { error: rpcError } = await supabase.rpc("gameledger_finish_game", {
        p_game_id: input.gameId,
        p_event_id: operation.eventId,
        p_result: input.result,
        p_note: note,
        p_ended_at: operation.endedAt,
        p_source_id: operation.sourceId,
        p_source_kind: "manual",
        p_source_data: { client: "game_ledger_web" },
      });
      if (rpcError) throw rpcError;
      if (pendingFinishOperations.current.get(operationKey) === operation) {
        pendingFinishOperations.current.delete(operationKey);
      }
      await refresh();
    });
  }, [mutate, refresh, session, supabase]);

  const uploadMedia = useCallback(async (
    gameId: string,
    kind: "photo" | "video",
    file: File,
    capturedAt: string,
    durationSeconds?: number,
  ) => {
    if (!supabase || !session) throw new Error("Sign in before adding media.");
    const mimeType = mimeTypeFor(file, kind);
    if (kind === "photo" && !PHOTO_TYPES.includes(mimeType)) {
      throw new Error("Choose a JPEG, PNG, WebP, HEIC or HEIF image.");
    }
    if (kind === "video" && !VIDEO_TYPES.includes(mimeType)) {
      throw new Error("Choose an MP4, WebM or QuickTime video.");
    }
    const maxBytes = kind === "photo" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
    if (file.size > maxBytes) throw new Error(`${kind === "photo" ? "Photos" : "Videos"} must be smaller than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    if (kind === "video" && durationSeconds !== undefined && durationSeconds > 60.25) throw new Error("Keep clips to 60 seconds or less.");

    const durationMs = durationSeconds === undefined ? null : Math.round(durationSeconds * 1_000);
    const safeBaseName = file.name
      .toLowerCase()
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || kind;
    const operationKey = stableOperationKey({
      capturedAt,
      durationMs,
      fileLastModified: file.lastModified,
      fileName: file.name,
      fileSize: file.size,
      gameId,
      kind,
      mimeType,
      ownerId: session.user.id,
    });
    let operation = pendingMediaOperations.current.get(operationKey);
    if (!operation) {
      const mediaId = crypto.randomUUID();
      operation = {
        mediaId,
        storagePath: `${session.user.id}/${gameId}/${mediaId}/${safeBaseName}.${extensionFor(file, kind, mimeType)}`,
      };
      pendingMediaOperations.current.set(operationKey, operation);
    }

    await mutate(async () => {
      const { error: rowError } = await supabase.from("gameledger_media").insert({
        id: operation.mediaId,
        owner_id: session.user.id,
        game_id: gameId,
        storage_path: operation.storagePath,
        media_kind: kind,
        mime_type: mimeType,
        byte_size: file.size,
        duration_ms: durationMs,
        width: null,
        height: null,
        captured_at: capturedAt,
        caption: null,
        media_data: { original_name: file.name, last_modified: file.lastModified },
      });
      if (rowError) {
        const { data: existingRows, error: lookupError } = await supabase
          .from("gameledger_media")
          .select("*")
          .eq("id", operation.mediaId)
          .limit(1);
        const existing = (existingRows?.[0] ?? null) as LedgerMedia | null;
        const capturedAtMatches = existing
          ? new Date(existing.captured_at).getTime() === new Date(capturedAt).getTime()
          : false;
        if (
          lookupError
          || !existing
          || existing.deleted_at
          || existing.owner_id !== session.user.id
          || existing.game_id !== gameId
          || existing.storage_path !== operation.storagePath
          || existing.media_kind !== kind
          || existing.mime_type !== mimeType
          || existing.byte_size !== file.size
          || existing.duration_ms !== durationMs
          || !capturedAtMatches
        ) {
          throw rowError;
        }
      }
      const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(operation.storagePath, file, {
        contentType: mimeType,
        upsert: false,
        cacheControl: "3600",
      });
      if (uploadError) {
        const cleanupFailures: string[] = [];
        let reservationReleased = false;
        try {
          const { error: removeError } = await supabase.storage.from(MEDIA_BUCKET).remove([operation.storagePath]);
          if (removeError) cleanupFailures.push(`storage removal: ${messageFromError(removeError)}`);
        } catch (removeError) {
          cleanupFailures.push(`storage removal: ${messageFromError(removeError)}`);
        }
        try {
          const { error: tombstoneError } = await supabase.rpc("gameledger_mark_media_deleted", { p_media_id: operation.mediaId });
          if (tombstoneError) cleanupFailures.push(`reservation release: ${messageFromError(tombstoneError)}`);
          else reservationReleased = true;
        } catch (tombstoneError) {
          cleanupFailures.push(`reservation release: ${messageFromError(tombstoneError)}`);
        }
        if (reservationReleased && pendingMediaOperations.current.get(operationKey) === operation) {
          pendingMediaOperations.current.delete(operationKey);
        }
        if (cleanupFailures.length) {
          throw new Error(`${messageFromError(uploadError)} Automatic cleanup also failed (${cleanupFailures.join("; ")}).`);
        }
        throw uploadError;
      }
      if (pendingMediaOperations.current.get(operationKey) === operation) {
        pendingMediaOperations.current.delete(operationKey);
      }
      await refresh();
    });
  }, [mutate, refresh, session, supabase]);

  const deleteMedia = useCallback(async (item: LedgerMedia) => {
    if (!supabase || !session) return;
    await mutate(async () => {
      const { error: storageError } = await supabase.storage.from(MEDIA_BUCKET).remove([item.storage_path]);
      if (storageError) throw storageError;
      const { error: rowError } = await supabase.rpc("gameledger_mark_media_deleted", { p_media_id: item.id });
      if (rowError) throw rowError;
      await refresh();
    });
  }, [mutate, refresh, session, supabase]);

  return {
    session,
    user: session?.user ?? null,
    authLoading,
    dataLoading,
    busy,
    error,
    configurationError: clientState.error,
    entities,
    games,
    participants,
    events,
    media,
    activeMediaCounts,
    setError,
    refresh,
    signInWithGoogleToken,
    signInWithRedirect,
    signOut,
    addEntity,
    startGame,
    appendEvent,
    voidEvent,
    finishGame,
    uploadMedia,
    deleteMedia,
  };
}
