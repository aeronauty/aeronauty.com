import { NextRequest, NextResponse } from "next/server";
import { addComment, hasSlopStore, rateLimitComment } from "@/lib/slop-store";
import { getCommentViewer } from "@/lib/slop-viewer";
import { MAX_COMMENT_LEN } from "@/lib/slop-shared";

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = Array.from(raw.replace(/[<>]/g, ""))
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim()
    .slice(0, 80);
  return cleaned || null;
}

export async function POST(req: NextRequest) {
  if (!hasSlopStore()) {
    return NextResponse.json({ error: "Comments are not configured yet." }, { status: 503 });
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

  // Identity is server-determined: signed-in users get their session name (and
  // any owner badge); anonymous users may only supply a plain display name.
  const viewer = await getCommentViewer();
  const authorName = viewer.signedIn ? viewer.name : sanitizeName(body?.name);

  const comment = await addComment({
    submissionId,
    body: text,
    authorName,
    verified: viewer.verified,
    isOwner: viewer.isOwner,
  });

  if (!comment) {
    return NextResponse.json({ error: "That entry isn't open for comments." }, { status: 400 });
  }

  return NextResponse.json({ comment, viewer });
}
