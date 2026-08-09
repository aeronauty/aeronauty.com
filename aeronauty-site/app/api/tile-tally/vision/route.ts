import { NextRequest, NextResponse } from "next/server";
import { proposeGameLedgerBoardVision } from "@/lib/tiletally/boardVision";
import {
  gameLedgerVisionRequestSchema,
  MAX_LEDGER_AI_REQUEST_BYTES,
} from "@/lib/tiletally/gameLedgerAiSchemas";
import { readBoundedJson, TileTallyHttpError, tileTallyErrorResponse } from "@/lib/tiletally/http";
import { requireTileTallyUser } from "@/lib/tiletally/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { client, user } = await requireTileTallyUser(req);
    const body = await readBoundedJson(req, MAX_LEDGER_AI_REQUEST_BYTES);
    const parsed = gameLedgerVisionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new TileTallyHttpError(400, "invalid_request", "Choose a valid game and board photo.");
    }

    const proposal = await proposeGameLedgerBoardVision({
      client,
      gameId: parsed.data.gameId,
      mediaId: parsed.data.mediaId,
      boardMode: parsed.data.boardMode,
      customInstructions: parsed.data.customInstructions,
      userId: user.id,
    });
    return NextResponse.json(proposal, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return tileTallyErrorResponse(error, "vision");
  }
}
