import { NextRequest, NextResponse } from "next/server";
import {
  approveSubmission,
  createSubmission,
  hasSlopStore,
  rateLimitSubmit,
  submissionInputSchema,
} from "@/lib/slop-store";
import { hasImageStore, uploadScreenshot } from "@/lib/supabase-storage";
import { fetchLinkPreview } from "@/lib/slop-unfurl";
import { isFlagged } from "@/lib/slop-wordfilter";
import { notifyNewSubmission } from "@/lib/slop-notify";
import { getRequestBaseUrl } from "@/lib/lab-auth";

// The whole multipart body streams through this function, so the total is kept
// under Vercel's ~4.5 MB serverless request-body limit. For more/larger files,
// switch to signed direct-to-storage uploads.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_ATTACHMENTS = 4;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function POST(req: NextRequest) {
  if (!hasSlopStore()) {
    return NextResponse.json({ error: "Submissions are not configured yet." }, { status: 503 });
  }

  const allowed = await rateLimitSubmit(req);
  if (!allowed) {
    return NextResponse.json(
      { error: "You're firing these in a bit fast. Try again in a little while." },
      { status: 429 }
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
  }

  const parsed = submissionInputSchema.safeParse({
    url: form.get("url"),
    tags: form.getAll("tags"),
    customTags: form.getAll("customTags"),
    reason: form.get("reason"),
    credit: form.get("credit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the link, pick at least one tag, and add a comment, then try again." },
      { status: 400 }
    );
  }

  // Optional screenshot/attachment uploads (multiple allowed).
  const files = form
    .getAll("screenshots")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length > MAX_ATTACHMENTS) {
    return NextResponse.json(
      { error: `Up to ${MAX_ATTACHMENTS} attachments, please.` },
      { status: 400 }
    );
  }

  let total = 0;
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Attachments must be PNG, JPEG, WebP, or GIF." },
        { status: 400 }
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Each attachment must be under 4 MB." }, { status: 400 });
    }
    total += file.size;
  }
  if (total > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: "Attachments are too large together — keep the total under 4 MB." },
      { status: 400 }
    );
  }

  let imagePaths: string[] = [];
  if (files.length > 0 && hasImageStore()) {
    const uploaded = await Promise.all(files.map((file) => uploadScreenshot(file)));
    imagePaths = uploaded.filter((path): path is string => Boolean(path));
    if (imagePaths.length !== files.length) {
      return NextResponse.json({ error: "Could not save those attachments." }, { status: 502 });
    }
  }

  // Best-effort link unfurl — never blocks the submission.
  const preview = await fetchLinkPreview(parsed.data.url).catch(() => null);

  try {
    const created = await createSubmission({
      ...parsed.data,
      imagePaths,
      previewImageUrl: preview?.imageUrl ?? null,
      previewTitle: preview?.title ?? null,
      previewDescription: preview?.description ?? null,
    });

    // Auto-publish unless the content trips the moderation blocklist, in which
    // case it stays held in the queue for manual review.
    const held = isFlagged([created.reason, ...created.customTags, created.url, created.credit]);
    if (!held) {
      await approveSubmission(created.id);
    }

    // Instant owner notification — never fails or noticeably delays the submit.
    await notifyNewSubmission(created, getRequestBaseUrl(req), { held }).catch(() => {});
    return NextResponse.json({ ok: true, held });
  } catch (error) {
    console.error("Slop submission error:", error);
    return NextResponse.json({ error: "Could not save that submission." }, { status: 500 });
  }
}
