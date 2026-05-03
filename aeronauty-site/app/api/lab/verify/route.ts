import { NextRequest, NextResponse } from "next/server";
import {
  LAB_SESSION_COOKIE,
  createLabSessionToken,
  getLabSessionMaxAge,
  verifyLabMagicLinkToken,
} from "@/lib/lab-auth";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const email = token ? await verifyLabMagicLinkToken(token) : null;

  if (!email) {
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
