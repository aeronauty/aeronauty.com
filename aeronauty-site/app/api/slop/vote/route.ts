import { NextRequest, NextResponse } from "next/server";
import { castVote, hasSlopStore } from "@/lib/slop-store";

export async function POST(req: NextRequest) {
  if (!hasSlopStore()) {
    return NextResponse.json({ error: "Voting is not configured yet." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "Missing entry id." }, { status: 400 });
  }

  const result = await castVote(req, id);
  if (!result.ok) {
    return NextResponse.json({ error: "That entry isn't open for voting." }, { status: 400 });
  }

  return NextResponse.json({ votes: result.votes, alreadyVoted: result.alreadyVoted });
}
