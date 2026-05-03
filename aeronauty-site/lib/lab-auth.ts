import { SignJWT, jwtVerify } from "jose";

export const LAB_SESSION_COOKIE = "__Host-aeronauty-lab-session";

const MAGIC_LINK_TTL = "15m";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

type LabTokenPayload = {
  email: string;
  kind: "magic-link" | "session";
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeLabEmail(email: string): string {
  return normalizeEmail(email);
}

function getSecret(): Uint8Array {
  const secret = process.env.AERONAUTY_AUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Missing AERONAUTY_AUTH_SECRET or AUTH_SECRET");
  }
  return new TextEncoder().encode(secret);
}

export function isAllowedLabEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  const rawAllowlist = process.env.AERONAUTY_LAB_ALLOWED_EMAILS ?? "";
  const allowlist = rawAllowlist
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean);

  return allowlist.some((entry) => {
    if (entry.startsWith("*@")) {
      return normalized.endsWith(entry.slice(1));
    }
    return entry === normalized;
  });
}

export async function createLabMagicLinkToken(email: string): Promise<string> {
  const normalized = normalizeEmail(email);

  return new SignJWT({ email: normalized, kind: "magic-link" } satisfies LabTokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(MAGIC_LINK_TTL)
    .setJti(crypto.randomUUID())
    .sign(getSecret());
}

export async function createLabSessionToken(email: string): Promise<string> {
  const normalized = normalizeEmail(email);

  return new SignJWT({ email: normalized, kind: "session" } satisfies LabTokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setJti(crypto.randomUUID())
    .sign(getSecret());
}

async function verifyLabToken(token: string, expectedKind: LabTokenPayload["kind"]): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.kind !== expectedKind || typeof payload.email !== "string") {
      return null;
    }
    return normalizeEmail(payload.email);
  } catch {
    return null;
  }
}

export async function verifyLabMagicLinkToken(token: string): Promise<string | null> {
  return verifyLabToken(token, "magic-link");
}

export async function verifyLabSessionToken(token: string): Promise<string | null> {
  return verifyLabToken(token, "session");
}

export function getLabSessionMaxAge(): number {
  return SESSION_TTL_SECONDS;
}

export function getRequestBaseUrl(req: Request): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  if (process.env.AUTH_URL) {
    return process.env.AUTH_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}
