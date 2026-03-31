import { NextResponse } from "next/server";
import { SignJWT, importPKCS8 } from "jose";

export async function GET() {
  const keyId = process.env.APPLE_MUSIC_KEY_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const privateKey = process.env.APPLE_MUSIC_PRIVATE_KEY;

  if (!keyId || !teamId || !privateKey) {
    return NextResponse.json(
      { error: "Apple Music not configured. Set APPLE_MUSIC_KEY_ID, APPLE_TEAM_ID, and APPLE_MUSIC_PRIVATE_KEY." },
      { status: 501 }
    );
  }

  try {
    // The private key from Apple comes as a .p8 file (PKCS8 PEM format)
    // In env vars, newlines are often replaced with \n literal strings
    const pemKey = privateKey.replace(/\\n/g, "\n");
    const key = await importPKCS8(pemKey, "ES256");

    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      origin: [
        "https://aeronauty.com",
        "https://www.aeronauty.com",
        "http://localhost:3000",
        "http://localhost",
      ],
    })
      .setProtectedHeader({ alg: "ES256", kid: keyId })
      .setIssuer(teamId)
      .setIssuedAt(now)
      .setExpirationTime(now + 15777000) // ~6 months max
      .sign(key);

    return NextResponse.json({ token });
  } catch (err) {
    console.error("MusicKit token error:", err);
    return NextResponse.json({ error: "Failed to generate token" }, { status: 500 });
  }
}
