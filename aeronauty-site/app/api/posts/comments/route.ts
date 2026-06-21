import { NextRequest, NextResponse } from "next/server";
import { hasPostCommentsStore, listPostComments } from "@/lib/post-comments-store";
import { getPostById, hasPostsStore } from "@/lib/posts-store";
import { getCommentViewer } from "@/lib/slop-viewer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const postId = req.nextUrl.searchParams.get("postId") ?? "";
  if (!postId) {
    return NextResponse.json({ error: "Missing postId." }, { status: 400 });
  }

  // Only expose comments for live posts.
  const post = hasPostsStore() ? await getPostById(postId) : null;
  const comments =
    post && post.status === "published" && hasPostCommentsStore()
      ? await listPostComments(postId)
      : [];
  const viewer = await getCommentViewer();
  return NextResponse.json({
    comments,
    viewer: { signedIn: viewer.signedIn, name: viewer.name, isOwner: viewer.isOwner },
  });
}
