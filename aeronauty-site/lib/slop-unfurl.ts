import "server-only";

export type LinkPreview = {
  imageUrl: string | null;
  title: string | null;
  description: string | null;
};

const EMPTY: LinkPreview = { imageUrl: null, title: null, description: null };

const FETCH_TIMEOUT_MS = 6000;
const MAX_BYTES = 512 * 1024; // 512 KB of HTML is plenty for <head> metadata
const USER_AGENT =
  "Mozilla/5.0 (compatible; AeronautyBot/1.0; +https://aeronauty.com/slop)";

/** Blocks loopback / private / link-local / reserved hosts to limit SSRF. */
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }
  if (host === "metadata.google.internal") return true;

  // IPv6 loopback / link-local / unique-local
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function safeUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (isBlockedHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, "/")
    .trim();
}

function metaContent(html: string, patterns: string[]): string | null {
  for (const property of patterns) {
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // property="og:image" content="..."  OR  content="..." property="og:image"
    const forward = new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*\\bcontent=["']([^"']+)["']`,
      "i"
    );
    const backward = new RegExp(
      `<meta[^>]+\\bcontent=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
      "i"
    );
    const match = html.match(forward) ?? html.match(backward);
    if (match?.[1]) return decodeEntities(match[1]);
  }
  return null;
}

/** Best-effort OG/Twitter-card preview. Returns nulls when blocked or unavailable. */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview> {
  const url = safeUrl(rawUrl);
  if (!url) return EMPTY;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    });

    if (!response.ok) return EMPTY;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return EMPTY;

    // Guard against huge bodies — read up to MAX_BYTES then stop.
    const reader = response.body?.getReader();
    if (!reader) return EMPTY;
    const decoder = new TextDecoder();
    let html = "";
    let received = 0;
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break; // metadata lives in <head>
    }
    await reader.cancel().catch(() => {});

    let imageUrl = metaContent(html, ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]);
    if (imageUrl) {
      // Resolve protocol-relative / relative image URLs against the page.
      try {
        imageUrl = new URL(imageUrl, url).toString();
      } catch {
        imageUrl = null;
      }
    }

    return {
      imageUrl,
      title: metaContent(html, ["og:title", "twitter:title"]),
      description: metaContent(html, ["og:description", "twitter:description", "description"]),
    };
  } catch {
    return EMPTY;
  } finally {
    clearTimeout(timeout);
  }
}
