import { NextRequest, NextResponse } from "next/server";
import {
  LAB_SESSION_COOKIE,
  createLabSessionToken,
  getLabSessionMaxAge,
  verifyLabMagicLinkToken,
} from "@/lib/lab-auth";
import { consumeMagicLinkClick, hasMagicLinkStore } from "@/lib/lab-magic-link-store";

function getTokenId(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf-8"));
    return typeof payload.jti === "string" ? payload.jti : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const email = token ? await verifyLabMagicLinkToken(token) : null;

  const tokenId = token ? getTokenId(token) : null;
  const clickAllowed =
    email && typeof tokenId === "string" && hasMagicLinkStore()
      ? await consumeMagicLinkClick(tokenId, email)
      : Boolean(email);

  if (!email || !clickAllowed) {
    return NextResponse.redirect(new URL("/lab/login?error=invalid-link", req.url));
  }

  const sessionToken = await createLabSessionToken(email);
  const response = NextResponse.redirect(new URL("/lab", req.url));

  response.cookies.set(LAB_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: getLabSessionMaxAge(),
  });

  return response;
}
