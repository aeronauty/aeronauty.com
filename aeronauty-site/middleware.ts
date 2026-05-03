import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { LAB_SESSION_COOKIE, verifyLabSessionToken } from "@/lib/lab-auth";

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/lab")) {
    const isLoginPage = req.nextUrl.pathname === "/lab/login";
    const token = req.cookies.get(LAB_SESSION_COOKIE)?.value;
    const email = token ? await verifyLabSessionToken(token) : null;

    if (email && isLoginPage) {
      return NextResponse.redirect(new URL("/lab", req.url));
    }

    if (!email && !isLoginPage) {
      const loginUrl = new URL("/lab/login", req.url);
      loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  return (auth as unknown as (request: NextRequest) => ReturnType<typeof NextResponse.next> | Promise<ReturnType<typeof NextResponse.next>>)(req);
}

export const config = {
  matcher: ["/dashboard/:path*", "/lab/:path*"],
};
