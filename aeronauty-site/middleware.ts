import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { LAB_SESSION_COOKIE, isLabOwnerEmail, verifyLabSessionToken } from "@/lib/lab-auth";

export default async function middleware(req: NextRequest) {
  const authSession = await auth();

  if (req.nextUrl.pathname.startsWith("/lab")) {
    const isLoginPage = req.nextUrl.pathname === "/lab/login";
    const token = req.cookies.get(LAB_SESSION_COOKIE)?.value;
    const email = token ? await verifyLabSessionToken(token) : null;
    const googleEmail = authSession?.user?.email?.toLowerCase() ?? null;
    const isGoogleLoggedIn = Boolean(googleEmail);
    const viewerEmail = email ?? googleEmail;

    if ((email || isGoogleLoggedIn) && isLoginPage) {
      return NextResponse.redirect(new URL("/lab", req.url));
    }

    if (!email && !isGoogleLoggedIn && !isLoginPage) {
      const loginUrl = new URL("/lab/login", req.url);
      loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (req.nextUrl.pathname.startsWith("/lab/activity") && (!viewerEmail || !isLabOwnerEmail(viewerEmail))) {
      return NextResponse.redirect(new URL("/lab", req.url));
    }

    return NextResponse.next();
  }

  const isDashboardLogin = req.nextUrl.pathname === "/dashboard/login";
  if (isDashboardLogin) return NextResponse.next();

  if (!authSession?.user) {
    const loginUrl = new URL("/dashboard/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/lab/:path*"],
};
