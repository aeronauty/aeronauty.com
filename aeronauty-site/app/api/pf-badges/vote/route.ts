import { NextRequest, NextResponse } from "next/server";
import { getSummary, hasBadgeStore, setVotes } from "@/lib/pf-badges-store";
import { ensureVoterKey, voterCookie } from "@/lib/pf-badges-voter";
import { isLayoutId, LAYOUT_IDS, type LayoutId } from "@/lib/pf-badges-shared";

export const dynamic = "force-dynamic";

/** Replace this browser's ballot. Approval voting — back as many as you like. */
export async function POST(req: NextRequest) {
  if (!hasBadgeStore()) {
    return NextResponse.json({ error: "The badge vote isn't configured yet." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const raw = Array.isArray(body?.layouts) ? body.layouts : null;
  if (!raw) {
    return NextResponse.json({ error: "Send a `layouts` array." }, { status: 400 });
  }
  // Cap before validating so a huge array can't cost anything.
  const layouts: LayoutId[] = raw.slice(0, LAYOUT_IDS.length).filter(isLayoutId);
  if (layouts.length !== new Set(raw.slice(0, LAYOUT_IDS.length)).size) {
    return NextResponse.json({ error: "That isn't one of the designs." }, { status: 400 });
  }

  const { key, isNew } = ensureVoterKey();
  const name = typeof body?.name === "string" ? body.name : null;

  const ok = await setVotes(key, layouts, name);
  if (!ok) {
    return NextResponse.json({ error: "Couldn't record that vote." }, { status: 500 });
  }

  const res = NextResponse.json(await getSummary(key));
  if (isNew) res.cookies.set(voterCookie(key));
  return res;
}
