import { NextResponse } from "next/server";
import { startNewRound } from "@/lib/slop-store";
import { isOwnerRequest } from "@/lib/owner";

// Owner-only: starts a fresh leaderboard round. The previous round's nominees
// are archived (kept in Redis), not deleted. The board resets ONLY via this.
export async function POST() {
  if (!(await isOwnerRequest())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const round = await startNewRound();
  if (!round) {
    return NextResponse.json({ error: "Store not configured." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, round });
}
