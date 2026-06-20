import "server-only";
import { tagLabel, type SlopSubmission } from "@/lib/slop-shared";

const OWNER_EMAIL = process.env.SLOP_NOTIFY_TO || "smith.harry@gmail.com";
const SEND_TIMEOUT_MS = 5000;

function canSend(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.AERONAUTY_MAGIC_LINK_FROM);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function tagsLine(sub: SlopSubmission): string {
  const all = [...(sub.tags ?? []).map(tagLabel), ...(sub.customTags ?? [])];
  return all.length ? all.join(", ") : "untagged";
}

async function sendEmail(subject: string, html: string, text: string): Promise<boolean> {
  if (!canSend()) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[slop-notify] email not configured; would send:", subject);
    }
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.resend.com/emails", {
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
    if (!response.ok) {
      console.error("slop-notify send failed:", response.status, (await response.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (error) {
    console.error("slop-notify error:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

const WRAP = (inner: string) =>
  `<div style="font-family:ui-sans-serif,system-ui,sans-serif;color:#1c1917;max-width:560px">${inner}</div>`;

/** Instant email when a single submission lands. `held` = caught by the filter, awaiting review. */
export async function notifyNewSubmission(
  sub: SlopSubmission,
  baseUrl: string,
  opts: { held?: boolean } = {}
): Promise<boolean> {
  const held = Boolean(opts.held);
  const adminUrl = `${baseUrl}/slop/admin`;
  const boardUrl = `${baseUrl}/slop/leaderboard`;
  const reason = sub.reason.length > 240 ? `${sub.reason.slice(0, 240)}…` : sub.reason;
  const shots = sub.imagePaths?.length
    ? `${sub.imagePaths.length} screenshot${sub.imagePaths.length === 1 ? "" : "s"}`
    : "no screenshots";
  const credit = sub.credit ? `Spotted by ${escapeHtml(sub.credit)}` : "Anonymous";

  const heading = held ? "🚩 Held for review" : "🗑️ Now live on the board";
  const cta = held
    ? `<a href="${adminUrl}" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">Review it →</a>`
    : `<a href="${boardUrl}" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">See the board →</a> &nbsp; <a href="${adminUrl}" style="color:#78716c">manage</a>`;

  const subject = held ? `🚩 Slop held for review: ${tagsLine(sub)}` : `🗑️ New slop live: ${tagsLine(sub)}`;
  const html = WRAP(`
    <h2 style="margin:0 0 8px">${heading}</h2>
    <p style="margin:0 0 4px;color:#0f766e;font-weight:600">${escapeHtml(tagsLine(sub))}</p>
    <p style="margin:0 0 12px;line-height:1.5">${escapeHtml(reason)}</p>
    <p style="margin:0 0 4px"><a href="${escapeHtml(sub.url)}" style="color:#0f766e">${escapeHtml(sub.url)}</a></p>
    <p style="margin:0 0 16px;color:#78716c;font-size:13px">${shots} · ${credit}</p>
    ${cta}
  `);
  const text = `${heading}\n${tagsLine(sub)}\n\n${reason}\n${sub.url}\n${shots} · ${credit}\n\n${held ? `Review: ${adminUrl}` : `Board: ${boardUrl}`}`;
  return sendEmail(subject, html, text);
}

/** Daily roundup of everything still awaiting review. No email when the queue is empty. */
export async function sendDigest(
  pending: SlopSubmission[],
  baseUrl: string
): Promise<{ sent: boolean; count: number }> {
  if (pending.length === 0) return { sent: false, count: 0 };

  const adminUrl = `${baseUrl}/slop/admin`;
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const freshCount = pending.filter((s) => Date.parse(s.createdAt) >= dayAgo).length;

  const items = pending
    .slice(0, 25)
    .map((s) => {
      const reason = s.reason.length > 140 ? `${s.reason.slice(0, 140)}…` : s.reason;
      return `<li style="margin:0 0 10px">
        <span style="color:#0f766e;font-weight:600">${escapeHtml(tagsLine(s))}</span><br/>
        <span style="line-height:1.4">${escapeHtml(reason)}</span><br/>
        <a href="${escapeHtml(s.url)}" style="color:#78716c;font-size:13px">${escapeHtml(s.url)}</a>
      </li>`;
    })
    .join("");

  const subject = `🗑️ Slop queue: ${pending.length} awaiting review${freshCount ? ` (${freshCount} new)` : ""}`;
  const html = WRAP(`
    <h2 style="margin:0 0 8px">Slop queue digest</h2>
    <p style="margin:0 0 16px;color:#78716c">${pending.length} awaiting review${freshCount ? ` · ${freshCount} in the last 24h` : ""}.</p>
    <ul style="padding-left:18px;margin:0 0 16px">${items}</ul>
    ${pending.length > 25 ? `<p style="color:#78716c;font-size:13px">…and ${pending.length - 25} more.</p>` : ""}
    <a href="${adminUrl}" style="display:inline-block;background:#1c1917;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">Clear the queue →</a>
  `);
  const text = `Slop queue: ${pending.length} awaiting review${freshCount ? ` (${freshCount} new)` : ""}\n\n${pending
    .slice(0, 25)
    .map((s) => `- ${tagsLine(s)}: ${s.reason.slice(0, 140)} (${s.url})`)
    .join("\n")}\n\nReview: ${adminUrl}`;

  const ok = await sendEmail(subject, html, text);
  return { sent: ok, count: pending.length };
}
