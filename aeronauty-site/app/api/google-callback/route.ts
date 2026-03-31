import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { google } from "googleapis";
import { upsertAccount } from "@/lib/token-store";

function getBaseUrl(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.redirect(new URL("/dashboard/login", req.url));

  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/dashboard/settings?error=${error ?? "no_code"}`, req.url)
    );
  }

  const baseUrl = getBaseUrl(req);

  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
    `${baseUrl}/api/google-callback`
  );

  try {
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    // Get the account's email
    const people = google.oauth2({ version: "v2", auth: oauth2 });
    const { data } = await people.userinfo.get();

    await upsertAccount({
      email: data.email!,
      name: data.name ?? undefined,
      picture: data.picture ?? undefined,
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiresAt: (tokens.expiry_date as number) ?? Date.now() + 3600 * 1000,
    });

    return NextResponse.redirect(new URL("/dashboard/settings?connected=1", req.url));
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return NextResponse.redirect(new URL("/dashboard/settings?error=token_exchange", req.url));
  }
}
