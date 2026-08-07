const SMALL_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

export function parseSpokenScore(value: string): number | null {
  const numeric = value.trim().match(/^[+-]?\d{1,4}$/);
  if (numeric) {
    const parsed = Number(numeric[0]);
    return Math.abs(parsed) <= 1_000 ? parsed : null;
  }

  const tokens = value
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return null;

  let sign = 1;
  if (tokens[0] === "minus" || tokens[0] === "negative") {
    sign = -1;
    tokens.shift();
  } else if (tokens[0] === "plus" || tokens[0] === "positive") {
    tokens.shift();
  }
  if (!tokens.length) return null;

  const digitValue = (token: string) => {
    if (token === "oh") return 0;
    const value = SMALL_NUMBERS[token];
    return value !== undefined && value <= 9 ? value : null;
  };

  if (tokens.length >= 2 && tokens.length <= 4) {
    const digits = tokens.map(digitValue);
    if (digits.every((digit): digit is number => digit !== null)) {
      const parsed = sign * Number(digits.join(""));
      return Math.abs(parsed) <= 1_000 ? parsed : null;
    }
  }

  const leadingDigit = digitValue(tokens[0]);
  const middleTens = TENS[tokens[1]];
  const trailingDigit = tokens.length === 3 ? digitValue(tokens[2]) : 0;
  if (
    (tokens.length === 2 || tokens.length === 3) &&
    leadingDigit !== null &&
    leadingDigit > 0 &&
    middleTens !== undefined &&
    trailingDigit !== null
  ) {
    const parsed = sign * (leadingDigit * 100 + middleTens + trailingDigit);
    return Math.abs(parsed) <= 1_000 ? parsed : null;
  }

  let total = 0;
  let group = 0;
  let sawNumber = false;
  for (const token of tokens) {
    if (token === "and") continue;
    if (token in SMALL_NUMBERS) {
      group += SMALL_NUMBERS[token];
      sawNumber = true;
      continue;
    }
    if (token in TENS) {
      group += TENS[token];
      sawNumber = true;
      continue;
    }
    if (token === "hundred") {
      group = Math.max(1, group) * 100;
      sawNumber = true;
      continue;
    }
    if (token === "thousand") {
      total += Math.max(1, group) * 1_000;
      group = 0;
      sawNumber = true;
      continue;
    }
    return null;
  }

  const parsed = sign * (total + group);
  return sawNumber && Math.abs(parsed) <= 1_000 ? parsed : null;
}

/** Preserve the literal transcript while adding an unambiguous local parse. */
export function formatSpokenScoreTranscript(value: string): string {
  const transcript = value.trim();
  if (!transcript) return "";
  const parsed = parseSpokenScore(transcript);
  return parsed === null ? transcript : `${transcript} (parsed score: ${parsed})`;
}
