import { NextRequest, NextResponse } from "next/server";
import { deletePostComment } from "@/lib/post-comments-store";
import { isOwnerRequest } from "@/lib/owner";

export async function POST(req: NextRequest) {
  if (!(await isOwnerRequest())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const commentId = typeof body?.commentId === "string" ? body.commentId : "";
  if (!commentId) {
    return NextResponse.json({ error: "Missing commentId." }, { status: 400 });
  }
  await deletePostComment(commentId);
  return NextResponse.json({ ok: true });
}
