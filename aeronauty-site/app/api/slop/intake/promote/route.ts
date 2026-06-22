import { NextRequest, NextResponse } from "next/server";
import { getIntakeRow, updateIntakeStatus } from "@/lib/slop-intake-store";
import { approveSubmission, createSubmission } from "@/lib/slop-store";
import { uploadScreenshotBuffer } from "@/lib/supabase-storage";
import { buildExhibitCardSvg } from "@/lib/slop-exhibit-card";
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

  // Sweep items are text-only (LinkedIn can't be unfurled), so when there's no
  // screenshot, generate an on-brand "exhibit card" from the quote as the preview.
  let imagePaths = row.image_path ? [row.image_path] : [];
  if (imagePaths.length === 0 && row.excerpt) {
    const svg = buildExhibitCardSvg({
      headline: row.draft_headline,
      excerpt: row.excerpt,
      author: row.author_name,
      authorHeadline: row.author_headline,
      severity: row.severity,
    });
    const path = await uploadScreenshotBuffer(Buffer.from(svg, "utf8"), "image/svg+xml");
    if (path) imagePaths = [path];
  }

  const created = await createSubmission({
    url: row.post_url,
    tags,
    customTags: row.custom_tags ?? [],
    reason,
    imagePaths,
    previewTitle: row.draft_headline,
    previewDescription: row.claim_summary,
  });

  await approveSubmission(created.id); // straight to the live board
  await updateIntakeStatus(id, "posted");

  return NextResponse.json({ ok: true, submissionId: created.id });
}
