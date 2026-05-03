import { NextRequest, NextResponse } from "next/server";
import { getKnownUser, getRecentActivity } from "@/lib/activity-store";
import { isAllowedLabEmail } from "@/lib/lab-auth";

export async function GET(req: NextRequest) {
  const { email } = await getKnownUser(req);

  if (!email || !isAllowedLabEmail(email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 100);
  const events = await getRecentActivity(Number.isFinite(limit) ? limit : 100);

  return NextResponse.json({ events });
}
