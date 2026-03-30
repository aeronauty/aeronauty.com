export { auth as middleware } from "@/lib/auth";

export const config = {
  // Matches /dashboard and all sub-paths.
  // NextAuth automatically skips redirecting from the signIn page itself.
  matcher: ["/dashboard/:path*"],
};
