import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE = "pf_voter";
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Who is voting.
 *
 * Deliberately a COOKIE, not an IP hash. The audience is parents at one school,
 * a good number of them on the school's own wifi or a shared home connection —
 * behind NAT they all present the same IP, so IP-keyed identity would let the
 * first voter silently occupy the ballot for everyone else on that network.
 * A cookie is per-browser, which is as close to per-person as this needs.
 *
 * It buys no security, and it isn't meant to: someone determined can clear it
 * and vote again. This is a parents' association picking a name badge, so the
 * bar is "stops accidental double-voting", not "resists ballot stuffing".
 * IP hashing still does the job it is actually good at — rate-limiting spam.
 */
export function readVoterKey(): string | null {
  return cookies().get(COOKIE)?.value ?? null;
}

/** Existing key, or a fresh one the caller must persist via {@link voterCookie}. */
export function ensureVoterKey(): { key: string; isNew: boolean } {
  const existing = readVoterKey();
  if (existing) return { key: existing, isNew: false };
  return { key: crypto.randomUUID(), isNew: true };
}

export function voterCookie(key: string) {
  return {
    name: COOKIE,
    value: key,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  };
}
