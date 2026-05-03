import { NextRequest, NextResponse } from "next/server";
import { recordActivityEvent } from "@/lib/activity-store";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  if (body?.consent !== true) {
    return NextResponse.json({ ok: true });
  }

  await recordActivityEvent(req, {
    eventType: "page_view",
    path: typeof body.path === "string" ? body.path : null,
    pageTitle: typeof body.pageTitle === "string" ? body.pageTitle : null,
    metadata: typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {},
  }).catch((error) => {
    console.debug("Activity logging failed:", error);
  });

  return NextResponse.json({ ok: true });
}
