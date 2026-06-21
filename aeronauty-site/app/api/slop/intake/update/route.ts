import { NextRequest, NextResponse } from "next/server";
import { updateIntakeStatus } from "@/lib/slop-intake-store";
import { isOwnerRequest } from "@/lib/owner";

export async function POST(req: NextRequest) {
  if (!(await isOwnerRequest())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const status = typeof body?.status === "string" ? body.status : "";
  if (!id || !["new", "reviewed", "posted", "dismissed"].includes(status)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  await updateIntakeStatus(id, status);
  return NextResponse.json({ ok: true });
}
