import { NextRequest, NextResponse } from "next/server";
import { readBoundedJson, TileTallyHttpError, tileTallyErrorResponse } from "@/lib/tiletally/http";
import {
  MAX_CONTROL_REQUEST_BYTES,
  tileTallyVisionRequestSchema,
} from "@/lib/tiletally/schemas";
import { requireTileTallyUser } from "@/lib/tiletally/supabase-server";
import { proposeTileTallyVision } from "@/lib/tiletally/vision";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { client, user } = await requireTileTallyUser(req);
    const body = await readBoundedJson(req, MAX_CONTROL_REQUEST_BYTES);
    const parsed = tileTallyVisionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new TileTallyHttpError(400, "invalid_request", "Choose a valid score photo.");
    }

    const proposal = await proposeTileTallyVision({
      client,
      photoId: parsed.data.photoId,
      userId: user.id,
    });
    return NextResponse.json(proposal, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return tileTallyErrorResponse(error, "vision");
  }
}
