import { NextRequest, NextResponse } from "next/server";
import { getIntakeRow, updateIntakeStatus } from "@/lib/slop-intake-store";
import { approveSubmission, createSubmission } from "@/lib/slop-store";
import { isOwnerRequest } from "@/lib/owner";
import { isSlopTag, type SlopTag } from "@/lib/slop-shared";

// Owner promotes a swept candidate straight onto the leaderboard (live + votable).
export async function POST(req: NextRequest) {
  if (!(await isOwnerRequest())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const row = await getIntakeRow(id);
  if (!row) return NextResponse.json({ error: "Intake item not found." }, { status: 404 });

  const tags = (row.tags ?? []).filter(isSlopTag) as SlopTag[];
  const reason = (row.why_slop || row.claim_summary || "Flagged from the daily sweep").slice(0, 600);

  const created = await createSubmission({
    url: row.post_url,
    tags,
    customTags: row.custom_tags ?? [],
    reason,
    imagePaths: row.image_path ? [row.image_path] : [],
    previewTitle: row.draft_headline,
    previewDescription: row.claim_summary,
  });

  await approveSubmission(created.id); // straight to the live board
  await updateIntakeStatus(id, "posted");

  return NextResponse.json({ ok: true, submissionId: created.id });
}
