/**
 * Shared types + constants for the P&F badge design vote.
 *
 * Context: the Parents & Friends association at International School Westpfalz
 * needed to pick a "my name is" badge design. The committee tried to do it in a
 * WhatsApp thread and split five ways, so this is the tie-break — public, no
 * account needed, because the voters are parents on a phone link.
 *
 * Safe for the client bundle: no secrets, no server-only imports.
 */

export const LAYOUTS = [
  { id: "a", name: "Header band", blurb: "Colour band on top, open writing area." },
  { id: "b", name: "Side panel", blurb: "Colour spine carries the QR. Biggest QR of the five." },
  { id: "c", name: "Outline", blurb: "White label, coloured frame. Least ink, easiest to write on." },
  { id: "d", name: "Full colour", blurb: "Colour flood with a white writing card. Boldest." },
  { id: "e", name: "Rule", blurb: "A single coloured hairline. Lets the logo do the talking." },
] as const;

export type LayoutId = (typeof LAYOUTS)[number]["id"];

export const LAYOUT_IDS: readonly string[] = LAYOUTS.map((l) => l.id);

export function isLayoutId(v: unknown): v is LayoutId {
  return typeof v === "string" && LAYOUT_IDS.includes(v);
}

/** The school's own palette, read off is-westpfalz.de. */
export const ISW = {
  red: "#EA0C03",
  ink: "#3C3C3C",
  greyMid: "#6E6E6E",
  greyLine: "#C8C8C8",
  greyBg: "#ECECEC",
} as const;

export const MAX_NAME_LEN = 60;
export const MAX_BODY_LEN = 1200;

/** #RGB or #RRGGBB, normalised to uppercase #RRGGBB. Null if it isn't a colour. */
export function normaliseHex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(s);
  if (!m) return null;
  const h = m[1];
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return `#${full.toUpperCase()}`;
}

export type BadgeTally = { layout: LayoutId; votes: number };

export type BadgeImage = { url: string; w: number | null; h: number | null };

export type BadgeFeedback = {
  id: string;
  kind: "comment" | "palette";
  authorName: string | null;
  body: string | null;
  palette: { name?: string; accent?: string } | null;
  image: BadgeImage | null;
  createdAt: string;
  /** Replies to this item. One level only — see MAX_THREAD_DEPTH. */
  replies: BadgeFeedback[];
};

/**
 * Replies nest exactly one level. Arbitrary nesting is unreadable on a phone,
 * which is where most of these parents will be reading it, and it invites
 * threads that wander off the question being asked.
 */
export const MAX_THREAD_DEPTH = 1;

/** What the browser may upload. Kept deliberately narrow. */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
/** Longest edge after the browser downscales, before upload. */
export const IMAGE_MAX_EDGE = 1600;

export type BadgeSummary = {
  tallies: BadgeTally[];
  totalVoters: number;
  feedback: BadgeFeedback[];
  /** Layouts this particular visitor has already voted for. */
  yourVotes: LayoutId[];
};
