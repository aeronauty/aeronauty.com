import { NextRequest, NextResponse } from "next/server";
import { getKnownUser, hasActivityStore, recordActivityEvent } from "@/lib/activity-store";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const path = typeof body.path === "string" ? body.path : null;

  if (path === "/lab/activity") {
    return NextResponse.json({ ok: true, recorded: false, reason: "ignored-dashboard-self-view" });
  }

  const user = await getKnownUser(req);

  if (!user.email) {
    return NextResponse.json({ ok: true, recorded: false, reason: "no-known-user" });
  }

  if (!hasActivityStore()) {
    return NextResponse.json({ ok: true, recorded: false, reason: "activity-store-not-configured" });
  }

  try {
    await recordActivityEvent(req, {
      eventType: "lab_access",
      path,
      pageTitle: typeof body.pageTitle === "string" ? body.pageTitle : null,
      metadata: typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {},
    });
  } catch (error) {
    console.debug("Activity logging failed:", error);
    return NextResponse.json({ ok: true, recorded: false, reason: "activity-write-failed" });
  }

  return NextResponse.json({ ok: true, recorded: true });
}
