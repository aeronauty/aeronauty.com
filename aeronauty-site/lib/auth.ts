import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { isAllowedLabEmail } from "@/lib/lab-auth";

// Simple in-memory brute-force protection.
// Locks out an IP for 15 minutes after 10 failed attempts.
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = failedAttempts.get(ip);
  if (entry && entry.lockedUntil > now) return false; // locked
  return true;
}

function recordFailure(ip: string) {
  const now = Date.now();
  const entry = failedAttempts.get(ip) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) entry.lockedUntil = now + LOCKOUT_MS;
  failedAttempts.set(ip, entry);
}

function recordSuccess(ip: string) {
  failedAttempts.delete(ip);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Credentials({
      credentials: {
        password: { label: "Password", type: "password" },
      },
      authorize(credentials, request) {
        const ip =
          request?.headers?.get("x-forwarded-for")?.split(",")[0].trim() ??
          "unknown";

        if (!checkRateLimit(ip)) return null;

        if (
          credentials?.password &&
          credentials.password === process.env.DASHBOARD_PASSWORD
        ) {
          recordSuccess(ip);
          return { id: "owner", name: "Owner" };
        }

        recordFailure(ip);
        return null;
      },
    }),
  ],
  pages: {
    signIn: "/dashboard/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      return Boolean(user.email && isAllowedLabEmail(user.email));
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isLoginPage = nextUrl.pathname === "/dashboard/login";
      if (isLoginPage) return true; // Always allow the login page
      return isLoggedIn; // Redirect everything else if not logged in
    },
  },
});
