import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** True for allowlisted lab/dashboard accounts (or the password owner). */
      labAllowed?: boolean;
      /** True only for the site owner. */
      isOwner?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    labAllowed?: boolean;
    isOwner?: boolean;
  }
}
