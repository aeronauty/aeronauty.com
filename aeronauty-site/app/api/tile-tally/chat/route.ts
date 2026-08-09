import { NextRequest, NextResponse } from "next/server";
import { proposeGameLedgerChat } from "@/lib/tiletally/gameLedgerChat";
import {
  gameLedgerAiChatRequestSchema,
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
    const parsed = gameLedgerAiChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new TileTallyHttpError(400, "invalid_request", "Send a valid assistant request.");
    }

    const proposal = await proposeGameLedgerChat({
      client,
      gameId: parsed.data.gameId,
      messages: parsed.data.messages,
      userId: user.id,
    });
    return NextResponse.json(proposal, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return tileTallyErrorResponse(error, "chat");
  }
}
