import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { google } from "googleapis";
import { upsertAccount } from "@/lib/token-store";

function getBaseUrl(req: NextRequest): string {
  // Prefer explicit env var (most reliable on Vercel)
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  if (process.env.AUTH_URL) return process.env.AUTH_URL.replace(/\/$/, "");
  // Vercel auto-set vars
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  // Fall back to request headers
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.labAllowed) return NextResponse.redirect(new URL("/dashboard/login", req.url));

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
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Google OAuth callback error:", msg, "baseUrl:", baseUrl);
    return NextResponse.redirect(
      new URL(`/dashboard/settings?error=token_exchange&detail=${encodeURIComponent(msg.slice(0, 200))}`, req.url)
    );
  }
}
