import { NextRequest, NextResponse } from "next/server";
import { applyReviewedGameLedgerProposal } from "@/lib/tiletally/gameLedgerApply";
import {
  gameLedgerAiApplyRequestSchema,
  MAX_LEDGER_AI_APPLY_BYTES,
} from "@/lib/tiletally/gameLedgerAiSchemas";
import { readBoundedJson, TileTallyHttpError, tileTallyErrorResponse } from "@/lib/tiletally/http";
import { requireTileTallyUser } from "@/lib/tiletally/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { client, user } = await requireTileTallyUser(req);
    const body = await readBoundedJson(req, MAX_LEDGER_AI_APPLY_BYTES);
    const parsed = gameLedgerAiApplyRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new TileTallyHttpError(400, "invalid_request", "Review a valid assistant suggestion before saving it.");
    }
    const result = await applyReviewedGameLedgerProposal({
      client,
      userId: user.id,
      request: parsed.data,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return tileTallyErrorResponse(error, "apply");
  }
}
