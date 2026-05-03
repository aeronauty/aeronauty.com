import { NextRequest, NextResponse } from "next/server";
import {
  createLabMagicLinkToken,
  getRequestBaseUrl,
  isAllowedLabEmail,
} from "@/lib/lab-auth";
import { storeMagicLink } from "@/lib/lab-magic-link-store";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getTokenId(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf-8"));
    return typeof payload.jti === "string" ? payload.jti : null;
  } catch {
    return null;
  }
}

async function sendMagicLink(email: string, url: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AERONAUTY_MAGIC_LINK_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.log("Aeronauty lab magic link:", url);
      return;
    }
    throw new Error("Missing RESEND_API_KEY or AERONAUTY_MAGIC_LINK_FROM");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Your Aeronauty lab sign-in link",
      text: `Use this link to sign in to the Aeronauty lab:\n\n${url}\n\nThis link expires in 15 minutes and allows up to three visits, so corporate link scanners should not burn it immediately.`,
      html: `<p>Use this link to sign in to the Aeronauty lab:</p><p><a href="${url}">Sign in to Aeronauty lab</a></p><p>This link expires in 15 minutes and allows up to three visits, so corporate link scanners should not burn it immediately.</p>`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend email failed: ${response.status} ${body.slice(0, 300)}`);
  }
}

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({ email: "" }));
  const normalizedEmail = typeof email === "string" ? normalizeEmail(email) : "";

  // Do not disclose whether an email is on the allowlist.
  if (!normalizedEmail || !isAllowedLabEmail(normalizedEmail)) {
    return NextResponse.json({ ok: true });
  }

  try {
    const token = await createLabMagicLinkToken(normalizedEmail);
    const tokenId = getTokenId(token);
    if (tokenId) {
      await storeMagicLink(tokenId, normalizedEmail);
    }

    const baseUrl = getRequestBaseUrl(req);
    const url = `${baseUrl}/api/lab/verify?token=${encodeURIComponent(token)}`;

    await sendMagicLink(normalizedEmail, url);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Lab magic link error:", error);
    return NextResponse.json({ error: "Could not send sign-in link" }, { status: 500 });
  }
}
