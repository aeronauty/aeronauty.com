import { NextRequest, NextResponse } from "next/server";
import { getSubmission, hasSlopStore, listComments } from "@/lib/slop-store";
import { getCommentViewer } from "@/lib/slop-viewer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const submissionId = req.nextUrl.searchParams.get("submissionId") ?? "";
  if (!submissionId) {
    return NextResponse.json({ error: "Missing submissionId." }, { status: 400 });
  }

  // Only expose comments for entries that are actually public (approved nominees).
  const submission = hasSlopStore() ? await getSubmission(submissionId) : null;
  const comments =
    submission && submission.status === "approved" ? await listComments(submissionId) : [];
  const viewer = await getCommentViewer();
  return NextResponse.json({
    comments,
    viewer: { signedIn: viewer.signedIn, name: viewer.name, isOwner: viewer.isOwner },
  });
}
