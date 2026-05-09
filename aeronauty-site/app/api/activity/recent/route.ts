import { NextRequest, NextResponse } from "next/server";
import {
  ActivityEvent,
  EngagementEvent,
  getKnownUser,
  getRecentActivity,
  getRecentEngagement,
  hasActivityStore,
} from "@/lib/activity-store";
import { isLabOwnerEmail } from "@/lib/lab-auth";

export const dynamic = "force-dynamic";

function isOwnerActivity(event: ActivityEvent): boolean {
  return Boolean(event.email && isLabOwnerEmail(event.email));
}

function isOwnerEngagement(event: EngagementEvent): boolean {
  return Boolean(event.email && isLabOwnerEmail(event.email));
}

export async function GET(req: NextRequest) {
  const { email } = await getKnownUser(req);

  if (!email || !isLabOwnerEmail(email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedLimit = Number(req.nextUrl.searchParams.get("limit") ?? 100);
  const safeLimit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 500)) : 100;
  const requestedEngagementLimit = Number(req.nextUrl.searchParams.get("engagementLimit") ?? 5000);
  const safeEngagementLimit = Number.isFinite(requestedEngagementLimit)
    ? Math.max(1, Math.min(requestedEngagementLimit, 5000))
    : 5000;
  const events = (await getRecentActivity(500)).filter((event) => !isOwnerActivity(event)).slice(0, safeLimit);
  const engagementEvents = (await getRecentEngagement(5000))
    .filter((event) => !isOwnerEngagement(event))
    .slice(0, safeEngagementLimit);

  return NextResponse.json({
    activityStoreConfigured: hasActivityStore(),
    ownerActivityFiltered: true,
    events,
    engagementEvents,
  });
}
