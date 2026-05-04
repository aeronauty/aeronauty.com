import { NextRequest, NextResponse } from "next/server";
import { getKnownUser, hasActivityStore, recordActivityEvent } from "@/lib/activity-store";

export async function POST(req: NextRequest) {
  const user = await getKnownUser(req);

  if (!user.email) {
    return NextResponse.json({ ok: true, recorded: false, reason: "no-known-user" });
  }

  if (!hasActivityStore()) {
    return NextResponse.json({ ok: true, recorded: false, reason: "activity-store-not-configured" });
  }

  const body = await req.json().catch(() => ({}));

  await recordActivityEvent(req, {
    eventType: "lab_access",
    path: typeof body.path === "string" ? body.path : null,
    pageTitle: typeof body.pageTitle === "string" ? body.pageTitle : null,
    metadata: typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {},
  }).catch((error) => {
    console.debug("Activity logging failed:", error);
  });

  return NextResponse.json({ ok: true, recorded: true });
}
