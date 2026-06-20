import "server-only";

const OWNER_EMAIL = process.env.SLOP_NOTIFY_TO || "smith.harry@gmail.com";
const TIMEOUT_MS = 5000;

export function canEmail(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.AERONAUTY_MAGIC_LINK_FROM);
}

/** Sends an email to the site owner via Resend (the same config that sends lab magic links). */
export async function sendOwnerEmail(subject: string, html: string, text: string): Promise<boolean> {
  if (!canEmail()) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.AERONAUTY_MAGIC_LINK_FROM,
        to: OWNER_EMAIL,
        subject,
        html,
        text,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error("owner email failed:", res.status, (await res.text()).slice(0, 160));
      return false;
    }
    return true;
  } catch (error) {
    console.error("owner email error:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
