import { NextRequest, NextResponse } from "next/server";
import {
  createSubmission,
  hasSlopStore,
  rateLimitSubmit,
  submissionInputSchema,
} from "@/lib/slop-store";
import { hasImageStore, uploadScreenshot } from "@/lib/supabase-storage";
import { fetchLinkPreview } from "@/lib/slop-unfurl";

// Kept under Vercel's ~4.5 MB serverless request-body limit; the file streams
// through this function. For larger uploads, switch to a signed direct-to-storage URL.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
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
    category: form.get("category"),
    reason: form.get("reason"),
    credit: form.get("credit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the link, category, and comment, then try again." },
      { status: 400 }
    );
  }

  // Optional screenshot upload.
  let imagePath: string | null = null;
  const screenshot = form.get("screenshot");
  if (screenshot instanceof File && screenshot.size > 0) {
    if (!ALLOWED_IMAGE_TYPES.has(screenshot.type)) {
      return NextResponse.json(
        { error: "Screenshot must be a PNG, JPEG, WebP, or GIF." },
        { status: 400 }
      );
    }
    if (screenshot.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Screenshot must be under 4 MB." }, { status: 400 });
    }
    if (hasImageStore()) {
      imagePath = await uploadScreenshot(screenshot);
      if (!imagePath) {
        return NextResponse.json({ error: "Could not save that screenshot." }, { status: 502 });
      }
    }
  }

  // Best-effort link unfurl — never blocks the submission.
  const preview = await fetchLinkPreview(parsed.data.url).catch(() => null);

  try {
    await createSubmission({
      ...parsed.data,
      imagePath,
      previewImageUrl: preview?.imageUrl ?? null,
      previewTitle: preview?.title ?? null,
      previewDescription: preview?.description ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Slop submission error:", error);
    return NextResponse.json({ error: "Could not save that submission." }, { status: 500 });
  }
}
