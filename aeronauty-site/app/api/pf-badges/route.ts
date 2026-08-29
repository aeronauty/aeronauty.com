import { NextResponse } from "next/server";
import { getSummary, hasBadgeStore } from "@/lib/pf-badges-store";
import { ensureVoterKey, voterCookie } from "@/lib/pf-badges-voter";

export const dynamic = "force-dynamic";

/** Current tallies, feedback, and which layouts this browser has already backed. */
export async function GET() {
  if (!hasBadgeStore()) {
    return NextResponse.json({ error: "The badge vote isn't configured yet." }, { status: 503 });
  }

  // Mint the voter cookie on first read so the ballot is stable from the very
  // first page load, not only after someone votes.
  const { key, isNew } = ensureVoterKey();
  const summary = await getSummary(isNew ? null : key);

  const res = NextResponse.json(summary);
  if (isNew) res.cookies.set(voterCookie(key));
  return res;
}
