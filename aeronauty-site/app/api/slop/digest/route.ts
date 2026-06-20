import { NextRequest, NextResponse } from "next/server";
import { hasSlopStore, listPending } from "@/lib/slop-store";
import { sendDigest } from "@/lib/slop-notify";
import { getRequestBaseUrl } from "@/lib/lab-auth";

export const dynamic = "force-dynamic";

// Invoked daily by Vercel Cron. Vercel attaches `Authorization: Bearer ${CRON_SECRET}`
// when CRON_SECRET is set, so we fail closed unless it matches.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  if (!hasSlopStore()) {
    return NextResponse.json({ ok: true, sent: false, count: 0, reason: "store not configured" });
  }

  const pending = await listPending();
  const result = await sendDigest(pending, getRequestBaseUrl(req));
  return NextResponse.json({ ok: true, ...result });
}
