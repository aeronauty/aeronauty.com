// Client-safe types and constants for the slop feature. No server/Redis imports
// here so this can be pulled into browser bundles without dragging in the store.

export const SLOP_CATEGORIES = ["shit-physics", "ai-slop"] as const;
export type SlopCategory = (typeof SLOP_CATEGORIES)[number];

export const SLOP_CATEGORY_LABELS: Record<SlopCategory, string> = {
  "shit-physics": "Shit physics",
  "ai-slop": "AI slop",
};

export type SlopStatus = "pending" | "approved";

export type SlopSubmission = {
  id: string;
  url: string;
  category: SlopCategory;
  reason: string;
  credit: string | null;
  status: SlopStatus;
  weekKey: string | null;
  createdAt: string;
  approvedAt: string | null;
  /** Storage path of the uploaded screenshot in the private bucket, if any. */
  imagePath: string | null;
  /** Best-effort link unfurl captured at submit time. */
  previewImageUrl: string | null;
  previewTitle: string | null;
  previewDescription: string | null;
};

/** A submission with its screenshot resolved to a short-lived signed URL for display. */
export type SlopSubmissionView = SlopSubmission & { screenshotUrl: string | null };

export type SlopNominee = SlopSubmissionView & { votes: number };
