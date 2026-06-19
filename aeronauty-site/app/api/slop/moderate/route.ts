import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { LAB_SESSION_COOKIE, isLabOwnerEmail, verifyLabSessionToken } from "@/lib/lab-auth";
import { approveSubmission, rejectSubmission } from "@/lib/slop-store";

async function getViewerEmail(): Promise<string | null> {
  const session = await auth().catch(() => null);
  if (session?.user?.email) {
    return session.user.email.toLowerCase();
  }
  const token = cookies().get(LAB_SESSION_COOKIE)?.value;
  return token ? verifyLabSessionToken(token) : null;
}

export async function POST(req: NextRequest) {
  const email = await getViewerEmail();
  if (!email || !isLabOwnerEmail(email)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const action = body?.action;
  if (!id || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Invalid moderation request." }, { status: 400 });
  }

  if (action === "approve") {
    await approveSubmission(id);
  } else {
    await rejectSubmission(id);
  }

  return NextResponse.json({ ok: true });
}
