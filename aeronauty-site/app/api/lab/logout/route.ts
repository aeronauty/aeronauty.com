import { NextRequest, NextResponse } from "next/server";
import { LAB_SESSION_COOKIE } from "@/lib/lab-auth";

export async function GET(req: NextRequest) {
  const response = NextResponse.redirect(new URL("/lab/login", req.url));
  response.cookies.set(LAB_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
