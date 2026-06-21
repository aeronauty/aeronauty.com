import { NextRequest, NextResponse } from "next/server";
import { addPostComment, hasPostCommentsStore, rateLimitPostComment } from "@/lib/post-comments-store";
import { getPostById } from "@/lib/posts-store";
import { getCommentViewer } from "@/lib/slop-viewer";
import { clientKey } from "@/lib/slop-store";
import { MAX_COMMENT_LEN } from "@/lib/slop-shared";

export async function POST(req: NextRequest) {
  if (!hasPostCommentsStore()) {
    return NextResponse.json({ error: "Comments are not configured yet." }, { status: 503 });
  }

  // Commenting requires a signed-in account.
  const viewer = await getCommentViewer();
  if (!viewer.signedIn) {
    return NextResponse.json({ error: "Sign in to comment." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const postId = typeof body?.postId === "string" ? body.postId : "";
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!postId || text.length < 1) {
    return NextResponse.json({ error: "Write something first." }, { status: 400 });
  }
  if (text.length > MAX_COMMENT_LEN) {
    return NextResponse.json({ error: "That comment is too long." }, { status: 400 });
  }

  // Comments only on live posts.
  const post = await getPostById(postId);
  if (!post || post.status !== "published") {
    return NextResponse.json({ error: "That post isn't open for comments." }, { status: 400 });
  }

  const ipHash = clientKey(req);
  if (!(await rateLimitPostComment(ipHash))) {
    return NextResponse.json(
      { error: "Easy there — too many comments too fast. Try again shortly." },
      { status: 429 }
    );
  }

  const comment = await addPostComment({
    postId,
    body: text,
    authorName: viewer.name,
    verified: viewer.verified,
    isOwner: viewer.isOwner,
    ipHash,
  });

  if (!comment) {
    return NextResponse.json({ error: "Couldn't post that." }, { status: 500 });
  }
  return NextResponse.json({ comment, viewer });
}
