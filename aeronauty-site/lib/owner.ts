import "server-only";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { LAB_SESSION_COOKIE, isLabOwnerEmail, verifyLabSessionToken } from "@/lib/lab-auth";

/** True only for the site owner — via a Google session flag or the lab magic-link cookie. */
export async function isOwnerRequest(): Promise<boolean> {
  const session = await auth().catch(() => null);
  if (session?.user?.isOwner) return true;

  const token = cookies().get(LAB_SESSION_COOKIE)?.value;
  const email = token ? await verifyLabSessionToken(token) : null;
  return Boolean(email && isLabOwnerEmail(email));
}
