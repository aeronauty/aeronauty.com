import { NextRequest, NextResponse } from "next/server";
import {
  addFeedback,
  getSummary,
  hasBadgeStore,
  rateLimitFeedback,
  resolveParent,
  uploadFeedbackImage,
} from "@/lib/pf-badges-store";
import { readVoterKey } from "@/lib/pf-badges-voter";
import { clientKey } from "@/lib/slop-store";
import { MAX_IMAGE_BYTES } from "@/lib/pf-badges-shared";

export const dynamic = "force-dynamic";

type Payload = {
  kind: "comment" | "palette";
  name: unknown;
  body: unknown;
  paletteName: unknown;
  accent: unknown;
  parentId: unknown;
  image: File | null;
  imageW: unknown;
  imageH: unknown;
};

/**
 * A written suggestion, a reply, or a proposed colourway — optionally with one
 * image attached.
 *
 * There is deliberately NO standalone upload endpoint. An image can only be
 * created as part of a comment that has already passed the name requirement and
 * the rate limit, so the page never exposes bare "write to our storage bucket"
 * to the internet.
 */
export async function POST(req: NextRequest) {
  if (!hasBadgeStore()) {
    return NextResponse.json({ error: "The badge vote isn't configured yet." }, { status: 503 });
  }

  let p: Payload;
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Couldn't read that." }, { status: 400 });
    const file = form.get("image");
    p = {
      kind: form.get("kind") === "palette" ? "palette" : "comment",
      name: form.get("name"),
      body: form.get("body"),
      paletteName: form.get("paletteName"),
      accent: form.get("accent"),
      parentId: form.get("parentId"),
      image: file instanceof File && file.size > 0 ? file : null,
      imageW: form.get("imageW"),
      imageH: form.get("imageH"),
    };
  } else {
    const j = await req.json().catch(() => null);
    if (!j) return NextResponse.json({ error: "Couldn't read that." }, { status: 400 });
    p = {
      kind: j.kind === "palette" ? "palette" : "comment",
      name: j.name,
      body: j.body,
      paletteName: j.paletteName,
      accent: j.accent,
      parentId: j.parentId,
      image: null,
      imageW: null,
      imageH: null,
    };
  }

  // IP hashing is the right tool HERE — spam control, not identity. (Voter
  // identity is a cookie; see lib/pf-badges-voter.ts for why.)
  const ipHash = clientKey(req);
  if (!(await rateLimitFeedback(ipHash))) {
    return NextResponse.json(
      { error: "Steady on — that's a lot of suggestions at once. Try again shortly." },
      { status: 429 }
    );
  }

  const name = typeof p.name === "string" ? p.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Add your name first." }, { status: 400 });
  }

  const parentId = await resolveParent(p.parentId);
  if (parentId === "invalid") {
    return NextResponse.json(
      { error: "Couldn't find the comment you're replying to." },
      { status: 400 }
    );
  }

  // Reject oversize before spending time reading the body into memory.
  if (p.image && p.image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "That image is too large." }, { status: 413 });
  }

  let imagePath: string | null = null;
  if (p.image) {
    const up = await uploadFeedbackImage(p.image);
    if ("error" in up) return NextResponse.json({ error: up.error }, { status: 400 });
    imagePath = up.path;
  }

  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };

  const saved = await addFeedback({
    kind: p.kind,
    authorName: name,
    body: p.body,
    paletteName: p.paletteName,
    paletteAccent: p.accent,
    parentId,
    imagePath,
    imageW: imagePath ? num(p.imageW) : null,
    imageH: imagePath ? num(p.imageH) : null,
    ipHash,
  });

  if (!saved) {
    return NextResponse.json(
      {
        error:
          p.kind === "palette"
            ? "That colour didn't look like a hex value."
            : "Write something, or attach a picture.",
      },
      { status: 400 }
    );
  }

  return NextResponse.json(await getSummary(readVoterKey()));
}
