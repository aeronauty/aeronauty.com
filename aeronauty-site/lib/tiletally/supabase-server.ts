import "server-only";
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { TileTallyHttpError } from "@/lib/tiletally/http";

type TileTallySupabaseContext = {
  accessToken: string;
  client: SupabaseClient;
  user: User;
};

function getServerPublicConfig(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new TileTallyHttpError(
      503,
      "supabase_not_configured",
      "Tile Tally cloud storage is not configured yet."
    );
  }
  return { url, key };
}

function readBearerToken(req: Request): string {
  const authorization = req.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  const accessToken = match?.[1] ?? "";

  if (!accessToken || accessToken.length > 8_192) {
    throw new TileTallyHttpError(401, "unauthorized", "Sign in to use Tile Tally.");
  }
  return accessToken;
}

function createPublicServerClient(accessToken?: string): SupabaseClient {
  const config = getServerPublicConfig();
  return createClient(config.url, config.key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    ...(accessToken
      ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      : {}),
  });
}

/**
 * Authenticates the bearer token with Supabase Auth and returns a caller-scoped
 * client. This module intentionally has no privileged-credential fallback.
 */
export async function requireTileTallyUser(req: Request): Promise<TileTallySupabaseContext> {
  const accessToken = readBearerToken(req);
  const verifier = createPublicServerClient();
  const { data, error } = await verifier.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new TileTallyHttpError(401, "unauthorized", "Your session expired. Sign in again.");
  }

  return {
    accessToken,
    client: createPublicServerClient(accessToken),
    user: data.user,
  };
}

export type { TileTallySupabaseContext };
