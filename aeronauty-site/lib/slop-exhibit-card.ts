// Generates a self-contained SVG "exhibit card" for a slop nominee that has no
// screenshot (e.g. text-only items from the LinkedIn sweep). Keeps the focus on
// the CLAIM/quote, not the person. "The Standard Model" palette.

export type ExhibitCardInput = {
  headline?: string | null;
  excerpt: string;
  author?: string | null;
  authorHeadline?: string | null;
  severity?: number | null;
};

const W = 1200;
const H = 630;
const PAD = 80;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Word-wrap to at most `maxLines` lines of ~`maxChars`, appending … if clipped. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cand.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) {
        cur = "";
        break;
      }
    } else {
      cur = cand;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  const used = lines.join(" ").split(" ").filter(Boolean).length;
  if (used < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last.length > maxChars - 1) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last.replace(/[\s.,;:'"]+$/, "")}…`;
  }
  return lines;
}

function tspans(lines: string[], x: number, lineHeight: number): string {
  return lines
    .map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${esc(l)}</tspan>`)
    .join("");
}

export function buildExhibitCardSvg(input: ExhibitCardInput): string {
  const SERIF = "Georgia, 'Times New Roman', serif";
  const MONO = "'JetBrains Mono', 'SF Mono', ui-monospace, monospace";
  const SANS = "Inter, system-ui, -apple-system, sans-serif";

  const headline = (input.headline ?? "")
    .replace(/^\s*exhibit:\s*/i, "")
    .replace(/^["“']|["”']$/g, "")
    .trim();
  const quote = (input.excerpt ?? "").replace(/\s+/g, " ").trim();
  const author = (input.author ?? "").trim();
  const role = (input.authorHeadline ?? "").trim();
  const sev = typeof input.severity === "number" ? Math.max(1, Math.min(5, input.severity)) : null;

  const headlineLines = headline ? wrap(headline, 34, 2) : [];
  // Quote gets more room when there is no headline.
  const quoteMaxLines = headlineLines.length ? 4 : 6;
  const quoteLines = wrap(quote, 50, quoteMaxLines);

  const quoteTop = headlineLines.length ? 168 + headlineLines.length * 58 + 36 : 220;

  const sevDots = sev
    ? Array.from({ length: 5 }, (_, i) =>
        `<circle cx="${1120 - i * 26}" cy="86" r="7" fill="${i < sev ? "#d7263d" : "#d8d0c2"}"/>`
      )
        .reverse()
        .join("")
    : "";

  const byline = author
    ? `— ${author}${role ? ` · ${role.length > 42 ? `${role.slice(0, 41)}…` : role}` : ""}`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f4efe4"/>
  <rect width="${W}" height="12" fill="#d7263d"/>
  <text x="${PAD}" y="98" font-family="${MONO}" font-size="22" font-weight="700" letter-spacing="3" fill="#a81c2e">SLOP FORENSICS · EXHIBIT</text>
  ${sev ? `<text x="${1120 - 5 * 26 - 12}" y="92" text-anchor="end" font-family="${MONO}" font-size="16" letter-spacing="2" fill="#6b635a">SEVERITY ${sev}/5</text>${sevDots}` : ""}
  ${
    headlineLines.length
      ? `<text x="${PAD}" y="180" font-family="${SERIF}" font-size="46" font-weight="700" fill="#1a1714">${tspans(headlineLines, PAD, 58)}</text>`
      : ""
  }
  <rect x="${PAD}" y="${quoteTop - 30}" width="5" height="${quoteLines.length * 46 + 8}" fill="#d7263d"/>
  <text x="${PAD + 30}" y="${quoteTop}" font-family="${SERIF}" font-size="30" font-style="italic" fill="#2c2622">${tspans(quoteLines.map((l, i) => (i === 0 ? `“${l}` : l)).map((l, i) => (i === quoteLines.length - 1 ? `${l}”` : l)), PAD + 30, 46)}</text>
  <line x1="${PAD}" y1="${H - 96}" x2="${W - PAD}" y2="${H - 96}" stroke="#d8d0c2" stroke-width="1"/>
  ${byline ? `<text x="${PAD}" y="${H - 58}" font-family="${SANS}" font-size="22" fill="#6b635a">${esc(byline.length > 76 ? `${byline.slice(0, 75)}…` : byline)}</text>` : ""}
  <text x="${W - PAD}" y="${H - 58}" text-anchor="end" font-family="${MONO}" font-size="18" letter-spacing="1" fill="#a81c2e">aeronauty.com/slop</text>
</svg>`;
}
