import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { LAB_SESSION_COOKIE, isLabOwnerEmail, verifyLabSessionToken } from "@/lib/lab-auth";

export default async function middleware(req: NextRequest) {
  const authSession = await auth();

  // A NextAuth session is now obtainable by ANY Google account (for public
  // commenting), so private areas must gate on the allowlist flags — never on
  // "is logged in" alone.
  const labAllowedViaGoogle = Boolean(authSession?.user?.labAllowed);
  const isOwnerViaGoogle = Boolean(authSession?.user?.isOwner);

  if (req.nextUrl.pathname.startsWith("/lab")) {
    const isLoginPage = req.nextUrl.pathname === "/lab/login";
    const token = req.cookies.get(LAB_SESSION_COOKIE)?.value;
    const email = token ? await verifyLabSessionToken(token) : null;
    const labAllowed = Boolean(email) || labAllowedViaGoogle;

    if (labAllowed && isLoginPage) {
      return NextResponse.redirect(new URL("/lab", req.url));
    }

    if (!labAllowed && !isLoginPage) {
      const loginUrl = new URL("/lab/login", req.url);
      loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }

    const isOwner = Boolean(email && isLabOwnerEmail(email)) || isOwnerViaGoogle;
    if (req.nextUrl.pathname.startsWith("/lab/activity") && !isOwner) {
      return NextResponse.redirect(new URL("/lab", req.url));
    }

    return NextResponse.next();
  }

  const isDashboardLogin = req.nextUrl.pathname === "/dashboard/login";
  if (isDashboardLogin) return NextResponse.next();

  if (!labAllowedViaGoogle) {
    const loginUrl = new URL("/dashboard/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/lab/:path*"],
};
