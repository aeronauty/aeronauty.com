"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  clearTileTallyBrowserAuthStorage,
  getTileTallySupabaseClient,
  hasTileTallyBrowserAuthStorage,
} from "@/lib/tiletally/client";
import type {
  CompletedSummary,
  Game,
  GamePlayer,
  Player,
  ScorePhoto,
  Turn,
} from "./types";

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Something went wrong. Please try again.";
}

function isSessionAuthError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: unknown; message?: unknown; status?: unknown };
  const status = typeof candidate.status === "number" ? candidate.status : null;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";

  return (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 429 ||
    code === "PGRST301" ||
    code === "PGRST302" ||
    /(?:invalid|expired|missing|revoked).*(?:jwt|refresh token|session)|(?:jwt|refresh token|session).*(?:invalid|expired|missing|revoked)/i.test(message)
  );
}

function isLedgerSessionError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return (
    code === "PGRST301" ||
    code === "PGRST302" ||
    /(?:invalid|expired|missing|revoked).*(?:jwt|session)|(?:jwt|session).*(?:invalid|expired|missing|revoked)/i.test(message)
  );
}

function isAmbiguousLedgerPermissionError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return code === "42501" && /permission denied/i.test(message);
}

function isConfirmedInvalidSessionError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; status?: unknown };
  const status = typeof candidate.status === "number" ? candidate.status : null;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return (
    status === 401 ||
    status === 403 ||
    code === "PGRST301" ||
    code === "PGRST302" ||
    /(?:invalid|expired|missing|revoked).*(?:jwt|refresh token|session)|(?:jwt|refresh token|session).*(?:invalid|expired|missing|revoked)/i.test(message)
  );
}

const EXPIRED_SESSION_MESSAGE = "Your session expired. Continue with Google to sign in again.";

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

function clearOAuthCallbackErrorFromUrl() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  for (const key of [
    "access_token",
    "code",
    "error",
    "error_code",
    "error_description",
    "expires_at",
    "expires_in",
    "provider_refresh_token",
    "provider_token",
    "refresh_token",
    "token_type",
  ]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

function tidyName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

const PAGE_SIZE = 1_000;

type PageResult<T> = {
  data: T[] | null;
  error: unknown;
};

async function collectPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await loadPage(from, from + PAGE_SIZE - 1);
    if (page.error) throw page.error;
    const pageRows = page.data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) return rows;
  }
}

export function useTileTally() {
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
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [gamePlayers, setGamePlayers] = useState<GamePlayer[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [completedSummary, setCompletedSummary] = useState<CompletedSummary | null>(null);
  const authRecoveryVersion = useRef(0);

  const recoverExpiredSession = useCallback((message = EXPIRED_SESSION_MESSAGE) => {
    if (!supabase) return;

    // A retryable refresh failure (including HTTP 429) is intentionally left in
    // storage by Supabase. Clear it first so signOut cannot immediately retry
    // the same unusable refresh token.
    authRecoveryVersion.current += 1;
    clearTileTallyBrowserAuthStorage();
    setSession(null);
    setAuthLoading(false);
    setError(message);
    void supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) {
      if (oauthCallbackError) clearOAuthCallbackErrorFromUrl();
      setAuthLoading(false);
      return;
    }

    let alive = true;
    let recoveryTriggered = false;
    let authEventRevision = 0;
    const recover = (message?: string) => {
      recoveryTriggered = true;
      recoverExpiredSession(message);
    };
    const startedWithStoredSession = hasTileTallyBrowserAuthStorage();

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (oauthCallbackError) clearOAuthCallbackErrorFromUrl();
      if (!alive || recoveryTriggered) return;
      if (authEventRevision > 0) {
        setAuthLoading(false);
        return;
      }
      if (sessionError && isSessionAuthError(sessionError)) {
        recover(oauthCallbackError ?? undefined);
      } else if (startedWithStoredSession && !data.session) {
        recover(oauthCallbackError ?? undefined);
      } else {
        if (sessionError) setError(oauthCallbackError ?? messageFromError(sessionError));
        setSession(data.session);
      }
      if (alive) setAuthLoading(false);
    }).catch((sessionError: unknown) => {
      if (oauthCallbackError) clearOAuthCallbackErrorFromUrl();
      if (!alive || recoveryTriggered) return;
      if (authEventRevision > 0) {
        setAuthLoading(false);
        return;
      }
      if (isSessionAuthError(sessionError)) {
        recover(oauthCallbackError ?? undefined);
      } else {
        setError(oauthCallbackError ?? messageFromError(sessionError));
      }
      if (alive) setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      authEventRevision += 1;
      if (!alive) return;
      if (recoveryTriggered && nextSession) return;
      if (event === "INITIAL_SESSION" && startedWithStoredSession && !nextSession) {
        recover(oauthCallbackError ?? undefined);
        return;
      }
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [oauthCallbackError, recoverExpiredSession, supabase]);

  const refresh = useCallback(async () => {
    if (!supabase || !session) return;
    const recoveryVersionAtStart = authRecoveryVersion.current;
    setDataLoading(true);
    setError(null);
    try {
      const [nextPlayers, nextGames, nextGamePlayers, nextTurns] = await Promise.all([
        collectPages<Player>((from, to) =>
          supabase
            .from("tiletally_players")
            .select("*")
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        ),
        collectPages<Game>((from, to) =>
          supabase
            .from("tiletally_games")
            .select("*")
            .order("played_on", { ascending: false })
            .order("created_at", { ascending: false })
            .order("id", { ascending: true })
            .range(from, to),
        ),
        collectPages<GamePlayer>((from, to) =>
          supabase
            .from("tiletally_game_players")
            .select("*")
            .order("game_id", { ascending: true })
            .order("seat", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        ),
        collectPages<Turn>((from, to) =>
          supabase
            .from("tiletally_turns")
            .select("*")
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        ),
      ]);
      setPlayers(nextPlayers);
      setGames(nextGames);
      setGamePlayers(nextGamePlayers);
      setTurns(nextTurns);
      setActiveGameId((current) => {
        if (current && nextGames.some((game) => game.id === current && game.status === "in_progress")) {
          return current;
        }
        return nextGames.find((game) => game.status === "in_progress")?.id ?? null;
      });
    } catch (refreshError) {
      if (authRecoveryVersion.current !== recoveryVersionAtStart) {
        return;
      }
      if (isAmbiguousLedgerPermissionError(refreshError)) {
        // 42501 also represents a real database grant/RLS problem. Verify the
        // bearer with Auth before treating it as an expired login so a valid
        // user is never signed out because of a backend migration mistake.
        try {
          const { data, error: verificationError } = await supabase.auth.getUser(
            session.access_token,
          );
          if (authRecoveryVersion.current !== recoveryVersionAtStart) return;
          if (
            (verificationError && isConfirmedInvalidSessionError(verificationError)) ||
            (!verificationError && !data.user)
          ) {
            recoverExpiredSession();
          } else {
            setError(messageFromError(refreshError));
          }
        } catch {
          // A failed verification request is not proof that the token is bad.
          // Keep the session and surface the original ledger problem.
          setError(messageFromError(refreshError));
        }
      } else if (isLedgerSessionError(refreshError)) {
        await recoverExpiredSession();
      } else {
        setError(messageFromError(refreshError));
      }
    } finally {
      setDataLoading(false);
    }
  }, [recoverExpiredSession, session, supabase]);

  useEffect(() => {
    if (!session) {
      setPlayers([]);
      setGames([]);
      setGamePlayers([]);
      setTurns([]);
      setActiveGameId(null);
      return;
    }
    void refresh();
  }, [refresh, session]);

  const withMutation = useCallback(
    async <T,>(operation: () => Promise<T>) => {
      setBusy(true);
      setError(null);
      try {
        return await operation();
      } catch (mutationError) {
        const mutationMessage = messageFromError(mutationError);
        setError(mutationMessage);
        throw new Error(mutationMessage);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const signInWithGoogleToken = useCallback(async (credential: string, nonce: string) => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    clearTileTallyBrowserAuthStorage();
    try {
      const { data, error: signInError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: credential,
        nonce,
      });
      if (signInError) throw signInError;
      if (!data.session) throw new Error("Google sign-in completed without a session.");
      setSession(data.session);
    } catch (signInError) {
      const signInMessage = messageFromError(signInError);
      setError(signInMessage);
      throw new Error(signInMessage);
    } finally {
      setBusy(false);
    }
  }, [supabase]);

  const signInWithRedirect = useCallback(async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    clearTileTallyBrowserAuthStorage();
    try {
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/apps/tile-tally`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (signInError) setError(signInError.message);
    } catch (signInError) {
      setError(messageFromError(signInError));
    } finally {
      setBusy(false);
    }
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    setBusy(true);
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError && isSessionAuthError(signOutError)) {
      await recoverExpiredSession();
    } else if (signOutError) {
      setError(signOutError.message);
    }
    setBusy(false);
  }, [recoverExpiredSession, supabase]);

  const saveStarterPlayers = useCallback(
    async (names: string[]) => {
      if (!supabase || !session) return;
      const cleaned = Array.from(new Set(names.map(tidyName).filter(Boolean)));
      if (cleaned.length < 2) throw new Error("Add at least two different player names.");
      await withMutation(async () => {
        const { error: insertError } = await supabase
          .from("tiletally_players")
          .insert(cleaned.map((name) => ({ name, owner_id: session.user.id })));
        if (insertError) throw insertError;
        await refresh();
      });
    },
    [refresh, session, supabase, withMutation],
  );

  const addPlayer = useCallback(
    async (name: string) => {
      if (!supabase || !session) return;
      const cleaned = tidyName(name);
      if (!cleaned) throw new Error("Enter a player name.");
      await withMutation(async () => {
        const { error: insertError } = await supabase
          .from("tiletally_players")
          .insert({ name: cleaned, owner_id: session.user.id });
        if (insertError) throw insertError;
        await refresh();
      });
    },
    [refresh, session, supabase, withMutation],
  );

  const renamePlayer = useCallback(
    async (playerId: string, name: string) => {
      if (!supabase) return;
      const cleaned = tidyName(name);
      if (!cleaned) throw new Error("A player name cannot be blank.");
      await withMutation(async () => {
        const { error: updateError } = await supabase
          .from("tiletally_players")
          .update({ name: cleaned })
          .eq("id", playerId);
        if (updateError) throw updateError;
        await refresh();
      });
    },
    [refresh, supabase, withMutation],
  );

  const startGame = useCallback(
    async (playerIds: string[], playedOn: string, location: string) => {
      if (!supabase || !session) return null;
      const selected = Array.from(new Set(playerIds));
      if (selected.length < 2) throw new Error("Choose at least two players.");
      return withMutation(async () => {
        const { data, error: insertError } = await supabase
          .from("tiletally_games")
          .insert({
            owner_id: session.user.id,
            played_on: playedOn,
            location: location.trim() || null,
            status: "in_progress",
            source: "manual",
            source_detail: { player_ids: selected },
          })
          .select("*")
          .single();
        if (insertError) throw insertError;
        const game = data as unknown as Game;
        const { error: seatsError } = await supabase.from("tiletally_game_players").insert(
          selected.map((playerId, seat) => ({
            owner_id: session.user.id,
            game_id: game.id,
            player_id: playerId,
            seat: seat + 1,
          })),
        );
        if (seatsError) {
          await supabase.from("tiletally_games").delete().eq("id", game.id);
          throw seatsError;
        }
        setActiveGameId(game.id);
        await refresh();
        return game;
      });
    },
    [refresh, session, supabase, withMutation],
  );

  const addTurn = useCallback(
    async (gameId: string, playerId: string, score: number, word: string, isBingo: boolean) => {
      if (!supabase || !session) return;
      if (!Number.isInteger(score)) throw new Error("Score must be a whole number.");
      await withMutation(async () => {
        const { error: insertError } = await supabase.rpc("tiletally_add_turn", {
          p_game_id: gameId,
          p_player_id: playerId,
          p_score: score,
          p_word: word.trim() || null,
          p_is_bingo: isBingo,
          p_turn_id: crypto.randomUUID(),
        });
        if (insertError) throw insertError;
        await refresh();
      });
    },
    [refresh, session, supabase, withMutation],
  );

  const undoLastTurn = useCallback(
    async (gameId: string) => {
      if (!supabase || !session) return;
      const lastTurn = turns
        .filter((turn) => turn.game_id === gameId)
        .sort((a, b) => b.seq - a.seq)[0];
      if (!lastTurn) throw new Error("There is no turn to undo.");
      await withMutation(async () => {
        const { error: deleteError } = await supabase
          .from("tiletally_turns")
          .delete()
          .eq("id", lastTurn.id);
        if (deleteError) throw deleteError;
        await refresh();
      });
    },
    [refresh, session, supabase, turns, withMutation],
  );

  const finishGame = useCallback(
    async (gameId: string, playerIds: string[], leftovers: Record<string, number>) => {
      if (!supabase || !session) return;
      const game = games.find((candidate) => candidate.id === gameId);
      if (!game) throw new Error("That game could not be found.");

      const values = playerIds.map((playerId) => ({
        playerId,
        points: Math.max(0, Math.trunc(Number(leftovers[playerId]) || 0)),
      }));
      const rackOutPlayers = values.filter(({ points }) => points === 0);
      const totalLeft = values.reduce((total, { points }) => total + points, 0);
      const adjustmentValues: Array<{ playerId: string; score: number }> = values
        .filter(({ points }) => points > 0)
        .map(({ playerId, points }) => ({ playerId, score: -points }));
      if (rackOutPlayers.length === 1 && totalLeft > 0) {
        adjustmentValues.push({ playerId: rackOutPlayers[0].playerId, score: totalLeft });
      }

      await withMutation(async () => {
        const completedAt = new Date().toISOString();
        const { error: finishError } = await supabase.rpc("tiletally_finish_game", {
          p_game_id: gameId,
          p_adjustments: adjustmentValues.map(({ playerId, score: points }) => ({
            player_id: playerId,
            points,
          })),
        });
        if (finishError) throw finishError;

        const existingTotals = new Map<string, number>();
        turns
          .filter((turn) => turn.game_id === gameId)
          .forEach((turn) => existingTotals.set(turn.player_id, (existingTotals.get(turn.player_id) ?? 0) + turn.score));
        adjustmentValues.forEach(({ playerId, score }) =>
          existingTotals.set(playerId, (existingTotals.get(playerId) ?? 0) + score),
        );
        setCompletedSummary({
          game: { ...game, status: "complete", completed_at: completedAt },
          totals: playerIds
            .map((playerId) => ({
              player: players.find((player) => player.id === playerId),
              total: existingTotals.get(playerId) ?? 0,
            }))
            .filter((row): row is { player: Player; total: number } => Boolean(row.player))
            .sort((a, b) => b.total - a.total),
        });
        setActiveGameId(null);
        await refresh();
      });
    },
    [games, players, refresh, session, supabase, turns, withMutation],
  );

  const uploadScorePhoto = useCallback(
    async (file: File) => {
      if (!supabase || !session) throw new Error("Sign in before uploading a score sheet.");
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("Choose a JPEG, PNG or WebP image.");
      }
      if (file.size > 4 * 1024 * 1024) throw new Error("The image must be smaller than 4 MB.");

      return withMutation(async () => {
        const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const baseName = file.name
          .toLowerCase()
          .replace(/\.[^.]+$/, "")
          .replace(/[^a-z0-9_-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 64) || "scores";
        const safeName = `${baseName}.${extension}`;
        const storagePath = `${session.user.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("tiletally-score-photos")
          .upload(storagePath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;

        const { data, error: rowError } = await supabase
          .from("tiletally_score_photos")
          .insert({ owner_id: session.user.id, storage_path: storagePath })
          .select("*")
          .single();
        if (rowError) throw rowError;
        return data as unknown as ScorePhoto;
      });
    },
    [session, supabase, withMutation],
  );

  const activeGame = games.find((game) => game.id === activeGameId) ?? null;

  return {
    session,
    user: session?.user ?? null,
    accessToken: session?.access_token ?? null,
    authLoading,
    dataLoading,
    busy,
    error,
    configurationError: clientState.error,
    players,
    games,
    gamePlayers,
    turns,
    activeGame,
    activeGameId,
    completedSummary,
    setActiveGameId,
    setCompletedSummary,
    setError,
    refresh,
    signInWithGoogleToken,
    signInWithRedirect,
    signOut,
    saveStarterPlayers,
    addPlayer,
    renamePlayer,
    startGame,
    addTurn,
    undoLastTurn,
    finishGame,
    uploadScorePhoto,
  };
}
