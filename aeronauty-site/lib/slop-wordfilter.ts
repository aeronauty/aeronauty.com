// Moderation blocklist for auto-publishing. A match HOLDS a submission for manual
// review (it is never silently dropped), so the bar favours precision: catch the
// clearly-unacceptable, let edge cases through and rely on owner-removal.
//
// The built-in list is intentionally small. Extend it privately via the
// SLOP_BLOCKLIST env var (comma-separated terms) rather than growing this file.

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "@": "a",
  "$": "s",
  "!": "i",
};

/** Lowercases and folds common leetspeak, keeping word boundaries intact. */
function leetFold(text: string): string {
  return text
    .toLowerCase()
    .split("")
    .map((ch) => LEET[ch] ?? ch)
    .join("");
}

// Unambiguous slurs (leet-folded forms are matched too). Kept minimal on purpose.
const SLUR_TERMS = [
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "tranny",
  "chink",
  "spic",
  "kike",
  "coon",
  "wetback",
];

// Obvious spam/scam markers.
const SPAM_TERMS = ["viagra", "casino bonus", "free crypto", "get rich quick", "forex signals"];

function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getBlocklist(): string[] {
  const fromEnv = (process.env.SLOP_BLOCKLIST ?? "")
    .split(",")
    .map((t) => leetFold(t.trim()))
    .filter(Boolean);
  return [...SLUR_TERMS, ...SPAM_TERMS, ...fromEnv];
}

/** Returns the matched blocklist term if any part trips the filter, else null. */
export function flaggedTerm(parts: Array<string | null | undefined>): string | null {
  const haystack = leetFold(parts.filter(Boolean).join(" "));
  if (!haystack.trim()) return null;
  for (const term of getBlocklist()) {
    if (!term) continue;
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(term)}(?:[^a-z0-9]|$)`);
    if (re.test(haystack)) return term;
  }
  return null;
}

export function isFlagged(parts: Array<string | null | undefined>): boolean {
  return flaggedTerm(parts) !== null;
}
