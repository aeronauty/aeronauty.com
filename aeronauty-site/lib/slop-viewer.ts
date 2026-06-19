import "server-only";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { LAB_SESSION_COOKIE, isLabOwnerEmail, verifyLabSessionToken } from "@/lib/lab-auth";

export type CommentViewerContext = {
  signedIn: boolean;
  name: string | null;
  isOwner: boolean;
  /** True when posting from a real (Google / lab) account rather than anonymously. */
  verified: boolean;
};

/** Resolves the current viewer's comment identity from the Google session or lab cookie. */
export async function getCommentViewer(): Promise<CommentViewerContext> {
  const session = await auth().catch(() => null);
  if (session?.user && (session.user.name || session.user.email)) {
    const fallback = session.user.email ? session.user.email.split("@")[0] : null;
    return {
      signedIn: true,
      name: session.user.name ?? fallback,
      isOwner: Boolean(session.user.isOwner),
      verified: true,
    };
  }

  const token = cookies().get(LAB_SESSION_COOKIE)?.value;
  const email = token ? await verifyLabSessionToken(token) : null;
  if (email) {
    return {
      signedIn: true,
      name: email.split("@")[0],
      isOwner: isLabOwnerEmail(email),
      verified: true,
    };
  }

  return { signedIn: false, name: null, isOwner: false, verified: false };
}
