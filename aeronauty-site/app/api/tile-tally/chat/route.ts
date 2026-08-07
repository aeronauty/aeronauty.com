import { NextRequest, NextResponse } from "next/server";
import { proposeTileTallyChat } from "@/lib/tiletally/chat";
import {
  MAX_CHAT_REQUEST_BYTES,
  tileTallyChatRequestSchema,
} from "@/lib/tiletally/schemas";
import { readBoundedJson, TileTallyHttpError, tileTallyErrorResponse } from "@/lib/tiletally/http";
import {
  commitPendingIngestEvent,
  rejectPendingIngestEvent,
  revisePendingIngestEvent,
} from "@/lib/tiletally/ingest";
import { requireTileTallyUser } from "@/lib/tiletally/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { client, user } = await requireTileTallyUser(req);
    const body = await readBoundedJson(req, MAX_CHAT_REQUEST_BYTES);
    const parsed = tileTallyChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new TileTallyHttpError(400, "invalid_request", "Check the Tile Tally request.");
    }

    if (parsed.data.mode === "commit") {
      const result = await commitPendingIngestEvent(client, parsed.data.eventId);
      return NextResponse.json(
        { committed: true, result },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (parsed.data.mode === "revise") {
      const action = await revisePendingIngestEvent(
        client,
        user.id,
        parsed.data.eventId,
        parsed.data.action
      );
      return NextResponse.json(
        {
          reply: "Proposal updated. Review it once more, then choose Save.",
          action,
          eventId: parsed.data.eventId,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (parsed.data.mode === "reject") {
      await rejectPendingIngestEvent(client, user.id, parsed.data.eventId);
      return NextResponse.json(
        { rejected: true, eventId: parsed.data.eventId },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const proposal = await proposeTileTallyChat({
      client,
      request: parsed.data,
      userId: user.id,
    });
    return NextResponse.json(proposal, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return tileTallyErrorResponse(error, "chat");
  }
}
