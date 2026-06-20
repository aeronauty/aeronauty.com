import { NextRequest, NextResponse } from "next/server";
import { castVote, hasSlopStore } from "@/lib/slop-store";

export async function POST(req: NextRequest) {
  if (!hasSlopStore()) {
    return NextResponse.json({ error: "Voting is not configured yet." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const direction = body?.direction === "up" || body?.direction === "down" ? body.direction : null;
  if (!id || !direction) {
    return NextResponse.json({ error: "Missing entry id or direction." }, { status: 400 });
  }

  const result = await castVote(req, id, direction);
  if (!result.ok) {
    return NextResponse.json({ error: "That entry isn't open for voting." }, { status: 400 });
  }

  return NextResponse.json({
    upvotes: result.upvotes,
    downvotes: result.downvotes,
    score: result.score,
    yourVote: result.yourVote,
  });
}
