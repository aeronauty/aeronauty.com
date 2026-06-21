import { NextRequest, NextResponse } from "next/server";
import { addComment, hasSlopStore, rateLimitComment } from "@/lib/slop-store";
import { getCommentViewer } from "@/lib/slop-viewer";
import { MAX_COMMENT_LEN } from "@/lib/slop-shared";

export async function POST(req: NextRequest) {
  if (!hasSlopStore()) {
    return NextResponse.json({ error: "Comments are not configured yet." }, { status: 503 });
  }

  // Commenting requires a signed-in account.
  const viewer = await getCommentViewer();
  if (!viewer.signedIn) {
    return NextResponse.json({ error: "Sign in to comment." }, { status: 401 });
  }

  const allowed = await rateLimitComment(req);
  if (!allowed) {
    return NextResponse.json(
      { error: "Easy there — too many comments too fast. Try again shortly." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const submissionId = typeof body?.submissionId === "string" ? body.submissionId : "";
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!submissionId || text.length < 1) {
    return NextResponse.json({ error: "Write something first." }, { status: 400 });
  }
  if (text.length > MAX_COMMENT_LEN) {
    return NextResponse.json({ error: "That comment is too long." }, { status: 400 });
  }

  const comment = await addComment({
    submissionId,
    body: text,
    authorName: viewer.name,
    verified: viewer.verified,
    isOwner: viewer.isOwner,
  });

  if (!comment) {
    return NextResponse.json({ error: "That entry isn't open for comments." }, { status: 400 });
  }

  return NextResponse.json({ comment, viewer });
}
