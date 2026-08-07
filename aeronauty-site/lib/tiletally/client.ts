import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let tileTallyBrowserClient: SupabaseClient | null = null;

export const TILE_TALLY_AUTH_STORAGE_KEY = "aeronauty-tiletally-auth";

export function hasTileTallyBrowserAuthStorage() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(TILE_TALLY_AUTH_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearTileTallyBrowserAuthStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TILE_TALLY_AUTH_STORAGE_KEY);
    window.localStorage.removeItem(`${TILE_TALLY_AUTH_STORAGE_KEY}-user`);
    window.localStorage.removeItem(`${TILE_TALLY_AUTH_STORAGE_KEY}-code-verifier`);
  } catch {
    // Supabase can fall back to its in-memory storage in restricted contexts.
  }
}

function getPublicConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return { url, key };
}

export function hasTileTallySupabaseConfig(): boolean {
  return getPublicConfig() !== null;
}

/**
 * Browser-only singleton. The publishable/anon key is intentionally public;
 * authorization is enforced by Supabase Auth plus the Game Ledger RLS policies.
 */
export function getTileTallySupabaseClient(): SupabaseClient {
  if (tileTallyBrowserClient) return tileTallyBrowserClient;

  const config = getPublicConfig();
  if (!config) {
    throw new Error("Game Ledger is not configured.");
  }

  tileTallyBrowserClient = createClient(config.url, config.key, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      storageKey: TILE_TALLY_AUTH_STORAGE_KEY,
    },
  });
  return tileTallyBrowserClient;
}
