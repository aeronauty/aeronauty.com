import { NextRequest, NextResponse } from "next/server";
import { hasIntakeStore, ingestCandidate } from "@/lib/slop-intake-store";

// Receives the daily LinkedIn-sweep run. Authorized by the SLOP_QUEUE_TOKEN bearer
// token (the scheduled task POSTs here same-origin from aeronauty.com).
export async function POST(req: NextRequest) {
  const token = process.env.SLOP_QUEUE_TOKEN;
  if (!token || req.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!hasIntakeStore()) {
    return NextResponse.json({ error: "Intake store not configured." }, { status: 503 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const queued_ids: string[] = [];
  for (const candidate of candidates) {
    try {
      const id = await ingestCandidate(candidate);
      if (id) queued_ids.push(id);
    } catch (error) {
      console.error("intake candidate error:", error instanceof Error ? error.message : error);
    }
  }

  return NextResponse.json({
    ok: true,
    accepted: queued_ids.length,
    queued_ids,
    duplicates: candidates.length - queued_ids.length,
    feed_scanned: typeof payload.feed_scanned === "number" ? payload.feed_scanned : null,
  });
}
