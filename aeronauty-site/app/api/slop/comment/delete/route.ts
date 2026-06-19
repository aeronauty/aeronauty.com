import { NextRequest, NextResponse } from "next/server";
import { deleteComment } from "@/lib/slop-store";
import { getCommentViewer } from "@/lib/slop-viewer";

export async function POST(req: NextRequest) {
  const viewer = await getCommentViewer();
  if (!viewer.isOwner) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const submissionId = typeof body?.submissionId === "string" ? body.submissionId : "";
  const commentId = typeof body?.commentId === "string" ? body.commentId : "";
  if (!submissionId || !commentId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  await deleteComment(submissionId, commentId);
  return NextResponse.json({ ok: true });
}
