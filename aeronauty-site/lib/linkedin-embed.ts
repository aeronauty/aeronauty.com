import "server-only";

/**
 * Checks whether a LinkedIn post can be rendered via its public embed.
 * Embeddable posts return 200 with the post text in <title>; non-embeddable
 * ones return 404 with a generic "LinkedIn" title. Best-effort + time-boxed.
 */
export async function isLinkedinEmbeddable(activityId: string): Promise<boolean> {
  if (!/^\d{6,}$/.test(activityId)) return false;
  const url = `https://www.linkedin.com/embed/feed/update/urn:li:activity:${activityId}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; aeronauty-embed-check)" },
      signal: AbortSignal.timeout(6000),
    });
    if (res.status !== 200) return false;
    const html = await res.text();
    const title = (/<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? "").trim();
    // A real embed's title is the post text; the not-found page is just "LinkedIn".
    if (!title || /^linkedin$/i.test(title) || /page not found/i.test(title)) return false;
    return true;
  } catch {
    return false;
  }
}
