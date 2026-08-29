import { NextRequest, NextResponse } from "next/server";
import { addFeedback, getSummary, hasBadgeStore, rateLimitFeedback } from "@/lib/pf-badges-store";
import { readVoterKey } from "@/lib/pf-badges-voter";
import { clientKey } from "@/lib/slop-store";

export const dynamic = "force-dynamic";

/** A written suggestion, or a proposed colourway with a swatch. */
export async function POST(req: NextRequest) {
  if (!hasBadgeStore()) {
    return NextResponse.json({ error: "The badge vote isn't configured yet." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const kind = body?.kind === "palette" ? "palette" : "comment";

  // IP hashing is the right tool HERE — spam control, not identity. (Voter
  // identity is a cookie; see lib/pf-badges-voter.ts for why.)
  const ipHash = clientKey(req);
  if (!(await rateLimitFeedback(ipHash))) {
    return NextResponse.json(
      { error: "Steady on — that's a lot of suggestions at once. Try again shortly." },
      { status: 429 }
    );
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Add your name first." }, { status: 400 });
  }

  const saved = await addFeedback({
    kind,
    authorName: body?.name,
    body: body?.body,
    paletteName: body?.paletteName,
    paletteAccent: body?.accent,
    ipHash,
  });

  if (!saved) {
    return NextResponse.json(
      {
        error:
          kind === "palette"
            ? "That colour didn't look like a hex value."
            : "Write something first.",
      },
      { status: 400 }
    );
  }

  return NextResponse.json(await getSummary(readVoterKey()));
}
