// Client-safe types and constants for the slop feature. No server/Redis imports
// here so this can be pulled into browser bundles without dragging in the store.

export const SLOP_TAGS = [
  "shit-physics",
  "ai-slop",
  "barely-veiled-bigotry",
  "sir-this-is-a-wendys",
] as const;
export type SlopTag = (typeof SLOP_TAGS)[number];

export const SLOP_TAG_LABELS: Record<SlopTag, string> = {
  "shit-physics": "Shit physics",
  "ai-slop": "AI slop",
  "barely-veiled-bigotry": "Barely-veiled bigotry",
  "sir-this-is-a-wendys": "Sir, this is a Wendy's",
};

export const MAX_CUSTOM_TAGS = 3;
export const MAX_CUSTOM_TAG_LEN = 40;

export function isSlopTag(value: string): value is SlopTag {
  return (SLOP_TAGS as readonly string[]).includes(value);
}

/** Human label for a stored tag slug; predefined → label, otherwise the raw custom value. */
export function tagLabel(tag: string): string {
  return isSlopTag(tag) ? SLOP_TAG_LABELS[tag] : tag;
}

export type SlopStatus = "pending" | "approved";

export type SlopSubmission = {
  id: string;
  url: string;
  /** Predefined tag slugs. */
  tags: SlopTag[];
  /** Free-text "Other" tags (already sanitized at submit time). */
  customTags: string[];
  reason: string;
  credit: string | null;
  status: SlopStatus;
  weekKey: string | null;
  createdAt: string;
  approvedAt: string | null;
  /** Storage paths of uploaded screenshots/attachments in the private bucket. */
  imagePaths: string[];
  /** Best-effort link unfurl captured at submit time. */
  previewImageUrl: string | null;
  previewTitle: string | null;
  previewDescription: string | null;
  /** LinkedIn activity id when the post embeds cleanly — renders the live post. */
  embedActivityId?: string | null;
};

/** Extracts a LinkedIn activity id from a post URL (feed/update urn or /posts/ slug). */
export function linkedinActivityId(url: string | null | undefined): string | null {
  const match = /activity[:-](\d{6,})/.exec(url ?? "");
  return match ? match[1] : null;
}

/** A submission with its screenshots resolved to short-lived signed URLs for display. */
export type SlopSubmissionView = SlopSubmission & { screenshotUrls: string[] };

export type SlopNominee = SlopSubmissionView & {
  upvotes: number;
  downvotes: number;
  /** Net score (upvotes − downvotes); the board ranks by this. */
  score: number;
};

export type VoteDirection = "up" | "down";

/** Rotating microcopy for the up/down buttons — keeps the board playful. Edit freely. */
export const VOTE_LABELS: { up: string; down: string }[] = [
  { up: "More of this", down: "Actually… it's fine" },
  { up: "Crown it 👑", down: "Spare us" },
  { up: "Peak slop", down: "Leave it alone" },
  { up: "Send it ⬆️", down: "Nah" },
  { up: "Gloriously wrong", down: "It's… okay" },
  { up: "Museum-grade", down: "Move along" },
  { up: "Chef's kiss of nonsense", down: "Not it" },
  { up: "Frame it", down: "Pardon it" },
];

/** Deterministic label pick per entry, so the copy is stable for a given nominee. */
export function voteLabelFor(id: string): { up: string; down: string } {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return VOTE_LABELS[hash % VOTE_LABELS.length];
}

export type SlopComment = {
  id: string;
  body: string;
  /** Display name (typed, or from a Google profile), or null for anonymous. */
  authorName: string | null;
  /** True when posted by a signed-in (Google) account. */
  verified: boolean;
  /** True when posted by the site owner. */
  isOwner: boolean;
  createdAt: string;
};

export type CommentViewer = {
  signedIn: boolean;
  name: string | null;
  isOwner: boolean;
};

export const MAX_COMMENT_LEN = 1000;

/** A candidate captured by the daily LinkedIn sweep, awaiting owner review. */
export type SlopIntakeItem = {
  id: string;
  postUrl: string;
  authorName: string | null;
  authorHeadline: string | null;
  postedAt: string | null;
  excerpt: string;
  claimSummary: string | null;
  whySlop: string | null;
  tags: string[];
  customTags: string[];
  severity: number | null;
  priorityAuthor: boolean;
  confidence: number | null;
  draftHeadline: string | null;
  draftBody: string | null;
  screenshotUrl: string | null;
  status: string;
  createdAt: string;
};
