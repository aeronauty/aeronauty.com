import { NextRequest, NextResponse } from "next/server";
import { deletePost, hasPostsStore, savePost } from "@/lib/posts-store";
import { isOwnerRequest } from "@/lib/owner";

/** Programmatic publishing path: a bearer token (POSTS_API_KEY) acts as owner-equivalent. */
function hasValidApiKey(req: NextRequest): boolean {
  const key = process.env.POSTS_API_KEY;
  if (!key) return false;
  return req.headers.get("authorization") === `Bearer ${key}`;
}

async function authorized(req: NextRequest): Promise<boolean> {
  return hasValidApiKey(req) || (await isOwnerRequest());
}

export async function POST(req: NextRequest) {
  // /api/* isn't covered by middleware, so authorize at the resource —
  // an owner session (UI) or the POSTS_API_KEY bearer token (automation).
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!hasPostsStore()) {
    return NextResponse.json({ error: "Posts store not configured." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const action = body?.action;

  if (action === "delete") {
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
    await deletePost(id);
    return NextResponse.json({ ok: true });
  }

  if (action === "save") {
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const content = typeof body?.body === "string" ? body.body : "";
    const status = body?.status === "published" ? "published" : "draft";
    if (!title || !content.trim()) {
      return NextResponse.json({ error: "Title and body are required." }, { status: 400 });
    }
    const post = await savePost({
      id: typeof body?.id === "string" ? body.id : null,
      title,
      summary: typeof body?.summary === "string" ? body.summary : "",
      body: content,
      format: body?.format === "html" ? "html" : "markdown",
      tags: Array.isArray(body?.tags) ? body.tags.filter((t: unknown) => typeof t === "string") : [],
      status,
    });
    if (!post) return NextResponse.json({ error: "Could not save." }, { status: 500 });
    return NextResponse.json({ ok: true, post });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
