import type { GameLedgerCounter, GameLedgerField, GameLedgerProfile, JsonValue } from "./types";

export type GameProfilePresetId = "freeform" | "cribbage" | "chess" | "word_tiles" | "custom";

export type GameProfilePreset = {
  id: GameProfilePresetId;
  label: string;
  description: string;
  profile: GameLedgerProfile;
};

const pointsCounter = (overrides: Partial<GameLedgerCounter> = {}): GameLedgerCounter => ({
  id: "points",
  label: "Points",
  scope: "participant",
  value_type: "decimal",
  unit: "pts",
  initial: 0,
  target: null,
  aggregation: "sum",
  ranking: "highest",
  input: { mode: "delta", quick_values: [1, 2, 3, 5], allow_negative: true },
  ...overrides,
});

export const GAME_PROFILE_PRESETS: readonly GameProfilePreset[] = [
  {
    id: "freeform",
    label: "Open tally",
    description: "A simple running total you can rename or reshape.",
    profile: {
      version: 1,
      name: "Open tally",
      preset: "freeform",
      participant: { min: 0, max: 32 },
      counters: [pointsCounter()],
      event_fields: [],
      result_fields: [],
      result: { mode: "derived", winner_counter_id: "points", allow_draw: true },
    },
  },
  {
    id: "cribbage",
    label: "Cribbage",
    description: "Peg toward 121 while preserving every scoring hand.",
    profile: {
      version: 1,
      name: "Cribbage",
      preset: "cribbage",
      participant: { min: 2, max: 4 },
      counters: [pointsCounter({
        value_type: "integer",
        target: { operator: ">=", value: 121, finish: "suggest" },
        input: { mode: "delta", quick_values: [1, 2, 3, 4], allow_negative: true },
      })],
      event_fields: [
        { id: "hand", label: "Hand / note", type: "text", placeholder: "Pair royal, crib, heels…" },
      ],
      result_fields: [],
      result: { mode: "derived", winner_counter_id: "points", allow_draw: false },
    },
  },
  {
    id: "chess",
    label: "Chess / match",
    description: "Log positions, notes and a result without inventing a score.",
    profile: {
      version: 1,
      name: "Chess",
      preset: "chess",
      participant: {
        min: 2,
        max: 2,
        roles: [{ id: "white", label: "White" }, { id: "black", label: "Black" }],
      },
      counters: [],
      event_fields: [
        { id: "position", label: "Move / position", type: "text", placeholder: "18…Nxd4 or a quick note" },
      ],
      result_fields: [
        { id: "result", label: "Result", type: "select", required: true, options: ["1–0", "0–1", "½–½", "Other"] },
      ],
      result: { mode: "manual", allow_draw: true },
    },
  },
  {
    id: "word_tiles",
    label: "Word tiles",
    description: "Running points with optional word and seven-tile notes.",
    profile: {
      version: 1,
      name: "Word tiles",
      preset: "word_tiles",
      participant: { min: 1, max: 16 },
      counters: [pointsCounter({ value_type: "integer" })],
      event_fields: [
        { id: "word", label: "Word", type: "text", placeholder: "FRIENDS" },
        { id: "used_all_tiles", label: "Used every tile", type: "boolean" },
      ],
      result_fields: [
        { id: "final_note", label: "Final note", type: "text", placeholder: "Unused tiles or house-rule adjustment" },
      ],
      result: { mode: "derived", winner_counter_id: "points", allow_draw: true },
      tools: ["letter_tiles"],
    },
  },
  {
    id: "custom",
    label: "Build your own",
    description: "Define counters, units, targets and fields for any activity.",
    profile: {
      version: 1,
      name: "Custom game",
      preset: "custom",
      participant: { min: 0, max: 32 },
      counters: [pointsCounter()],
      event_fields: [],
      result_fields: [],
      result: { mode: "manual", allow_draw: true },
    },
  },
] as const;

function cloneField(field: GameLedgerField): GameLedgerField {
  return { ...field, options: field.options ? [...field.options] : undefined };
}

export function cloneGameProfile(profile: GameLedgerProfile): GameLedgerProfile {
  return {
    ...profile,
    participant: profile.participant ? {
      ...profile.participant,
      roles: profile.participant.roles?.map((role) => ({ ...role })),
    } : undefined,
    counters: profile.counters.map((counter) => ({
      ...counter,
      input: counter.input ? { ...counter.input, quick_values: counter.input.quick_values ? [...counter.input.quick_values] : undefined } : undefined,
      target: counter.target ? { ...counter.target } : null,
    })),
    event_fields: profile.event_fields.map(cloneField),
    result_fields: profile.result_fields.map(cloneField),
    result: profile.result ? { ...profile.result } : undefined,
    tools: profile.tools ? [...profile.tools] : undefined,
    extra: profile.extra ? { ...profile.extra } : undefined,
  };
}

export function presetProfile(id: GameProfilePresetId): GameLedgerProfile {
  const preset = GAME_PROFILE_PRESETS.find((candidate) => candidate.id === id) ?? GAME_PROFILE_PRESETS[0];
  return cloneGameProfile(preset.profile);
}

export function fieldIdFromLabel(label: string, fallback: string) {
  const candidate = label
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return candidate || fallback;
}

export function uniqueFieldId(label: string, existing: Iterable<string>, fallback = "field") {
  const used = new Set(existing);
  const base = fieldIdFromLabel(label, fallback);
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base}_${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}

function duplicateIds(items: Array<{ id: string }>) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) duplicates.add(item.id);
    seen.add(item.id);
  }
  return Array.from(duplicates);
}

/** Validate the constrained renderer vocabulary without restricting JSONB extensions. */
export function validateGameProfile(profile: GameLedgerProfile) {
  const problems: string[] = [];
  if (!Number.isInteger(profile.version) || profile.version < 1) problems.push("version must be a positive integer");
  if (!profile.name.trim() || profile.name.length > 100) problems.push("name must contain 1–100 characters");
  const participant = profile.participant ?? { min: 0, max: 32 };
  if (!Number.isInteger(participant.min) || !Number.isInteger(participant.max) || participant.min < 0 || participant.max < participant.min || participant.max > 32) {
    problems.push("participant limits must satisfy 0 ≤ min ≤ max ≤ 32");
  }
  if (profile.counters.length > 24) problems.push("at most 24 counters are supported");
  if (profile.event_fields.length > 48 || profile.result_fields.length > 48) problems.push("at most 48 fields per scope are supported");

  for (const [scope, items] of [
    ["counter", profile.counters],
    ["event field", profile.event_fields],
    ["result field", profile.result_fields],
  ] as const) {
    const duplicates = duplicateIds(items);
    if (duplicates.length) problems.push(`${scope} ids must be unique (${duplicates.join(", ")})`);
    for (const item of items) {
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(item.id)) problems.push(`${scope} id “${item.id}” is invalid`);
      if (!item.label.trim() || item.label.length > 80) problems.push(`${scope} “${item.id}” needs a 1–80 character label`);
    }
  }

  for (const counter of profile.counters) {
    if (counter.initial !== undefined && !Number.isFinite(counter.initial)) problems.push(`${counter.label} has an invalid starting value`);
    if (counter.target && !Number.isFinite(counter.target.value)) problems.push(`${counter.label} has an invalid target`);
    if (counter.input?.quick_values?.some((value) => !Number.isFinite(value))) problems.push(`${counter.label} has an invalid quick value`);
  }
  for (const field of [...profile.event_fields, ...profile.result_fields]) {
    if (field.type === "select" && (!field.options?.length || field.options.some((option) => !option.trim()))) {
      problems.push(`${field.label} needs at least one non-empty choice`);
    }
  }
  if (profile.result?.mode === "derived") {
    const counter = profile.counters.find((candidate) => candidate.id === profile.result?.winner_counter_id);
    if (!counter) problems.push("a derived result must reference an existing counter");
    else if (counter.scope === "game" || counter.ranking === "none") problems.push("a derived winner must use a ranked participant counter");
  }
  if (problems.length) throw new Error(`Invalid game definition: ${problems.join("; ")}.`);
  return profile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanNumber(value: unknown, fallback: number | null = null) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normaliseCounter(value: unknown, index: number): GameLedgerCounter | null {
  if (!isRecord(value)) return null;
  const label = cleanString(value.label, `Counter ${index + 1}`);
  const aggregation = ["sum", "latest", "min", "max"].includes(String(value.aggregation))
    ? value.aggregation as GameLedgerCounter["aggregation"]
    : "sum";
  const rankingCandidate = value.ranking ?? value.winner;
  const ranking = ["highest", "lowest", "none"].includes(String(rankingCandidate))
    ? rankingCandidate as GameLedgerCounter["ranking"]
    : "highest";
  const targetValue = isRecord(value.target) ? cleanNumber(value.target.value) : cleanNumber(value.target);
  const targetOperator = isRecord(value.target) && [">=", "<=", "="].includes(String(value.target.operator))
    ? value.target.operator as ">=" | "<=" | "="
    : ">=";
  const targetFinish = isRecord(value.target) && ["suggest", "automatic"].includes(String(value.target.finish))
    ? value.target.finish as "suggest" | "automatic"
    : "suggest";
  const input = isRecord(value.input) ? value.input : {};
  const inputMode = ["delta", "set", "both"].includes(String(input.mode))
    ? input.mode as "delta" | "set" | "both"
    : aggregation === "sum" ? "delta" : "set";
  const quickValues = Array.isArray(input.quick_values)
    ? input.quick_values.filter((candidate): candidate is number => typeof candidate === "number" && Number.isFinite(candidate)).slice(0, 12)
    : undefined;
  return {
    id: cleanString(value.id, fieldIdFromLabel(label, `counter_${index + 1}`)),
    label,
    scope: value.scope === "game" ? "game" : "participant",
    value_type: ["integer", "decimal", "duration"].includes(String(value.value_type))
      ? value.value_type as GameLedgerCounter["value_type"]
      : "decimal",
    unit: cleanString(value.unit) || undefined,
    initial: cleanNumber(value.initial, 0) ?? 0,
    target: targetValue == null ? null : { operator: targetOperator, value: targetValue, finish: targetFinish },
    aggregation,
    ranking,
    input: { mode: inputMode, quick_values: quickValues, allow_negative: input.allow_negative !== false },
  };
}

function normaliseField(value: unknown, index: number): GameLedgerField | null {
  if (!isRecord(value)) return null;
  const label = cleanString(value.label, `Field ${index + 1}`);
  const type = ["number", "text", "boolean", "select"].includes(String(value.type))
    ? value.type as GameLedgerField["type"]
    : "text";
  const options = Array.isArray(value.options)
    ? value.options.map((option) => cleanString(option)).filter(Boolean).slice(0, 50)
    : undefined;
  return {
    id: cleanString(value.id, fieldIdFromLabel(label, `field_${index + 1}`)),
    label,
    type,
    required: value.required === true,
    unit: cleanString(value.unit) || undefined,
    options,
    placeholder: cleanString(value.placeholder) || undefined,
  };
}

/**
 * Treat stored JSON as untrusted input. This supplies a usable legacy fallback
 * without removing unknown JSON from the database itself.
 */
export function normaliseGameProfile(value: unknown): GameLedgerProfile {
  if (!isRecord(value)) return presetProfile("freeform");
  const counters = Array.isArray(value.counters)
    ? value.counters.map(normaliseCounter).filter((item): item is GameLedgerCounter => Boolean(item)).slice(0, 24)
    : [];
  const eventFields = Array.isArray(value.event_fields)
    ? value.event_fields.map(normaliseField).filter((item): item is GameLedgerField => Boolean(item)).slice(0, 48)
    : [];
  const resultFields = Array.isArray(value.result_fields)
    ? value.result_fields.map(normaliseField).filter((item): item is GameLedgerField => Boolean(item)).slice(0, 48)
    : [];
  const participantValue = isRecord(value.participant) ? value.participant : {};
  const roles = Array.isArray(participantValue.roles)
    ? participantValue.roles.filter(isRecord).map((role, index) => ({
      id: cleanString(role.id, `role_${index + 1}`),
      label: cleanString(role.label, `Role ${index + 1}`),
    })).slice(0, 32)
    : undefined;
  const resultValue = isRecord(value.result) ? value.result : {};
  const resultMode = ["derived", "manual", "none"].includes(String(resultValue.mode))
    ? resultValue.mode as "derived" | "manual" | "none"
    : counters.length ? "derived" : "manual";
  return {
    version: Math.max(1, Math.trunc(cleanNumber(value.version, 1) ?? 1)),
    name: cleanString(value.name, "Game"),
    preset: cleanString(value.preset) || null,
    participant: {
      min: Math.max(0, Math.trunc(cleanNumber(participantValue.min, 0) ?? 0)),
      max: Math.max(1, Math.trunc(cleanNumber(participantValue.max, 32) ?? 32)),
      roles,
    },
    counters,
    event_fields: eventFields,
    result_fields: resultFields,
    result: {
      mode: resultMode,
      winner_counter_id: cleanString(resultValue.winner_counter_id) || undefined,
      allow_draw: resultValue.allow_draw !== false,
    },
    tools: Array.isArray(value.tools) ? value.tools.map((tool) => cleanString(tool)).filter(Boolean).slice(0, 24) : undefined,
    extra: isRecord(value.extra) ? value.extra as Record<string, JsonValue> : undefined,
  };
}

export type CounterEventLike = {
  id?: string;
  seq: number;
  player_id?: string | null;
  actor_participant_id?: string | null;
  kind?: string;
  event_kind?: string;
  data?: JsonValue;
  event_data?: JsonValue;
  voids_event_id?: string | null;
};

export function eventValues(event: CounterEventLike): Record<string, JsonValue> {
  const payload = event.event_data ?? event.data;
  if (!isRecord(payload)) return {};
  return isRecord(payload.values) ? payload.values as Record<string, JsonValue> : {};
}

/**
 * Resolve append-only undo/redo from newest to oldest. A live void suppresses its
 * target; a later live void of that void makes the earlier target effective again.
 */
export function effectiveVoidedEventIds(events: CounterEventLike[]) {
  const suppressed = new Set<string>();
  for (const event of [...events].sort((a, b) => b.seq - a.seq)) {
    if (event.id && suppressed.has(event.id)) continue;
    if ((event.event_kind ?? event.kind) !== "void") continue;
    const payload = event.event_data ?? event.data;
    const target = event.voids_event_id
      ?? (isRecord(payload) && typeof payload.voids_event_id === "string" ? payload.voids_event_id : null);
    if (target) suppressed.add(target);
  }
  return suppressed;
}

export function counterTotals(
  profile: GameLedgerProfile,
  participantIds: string[],
  events: CounterEventLike[],
) {
  const totals = new Map<string, Record<string, number>>();
  for (const playerId of participantIds) {
    totals.set(
      playerId,
      Object.fromEntries(profile.counters.filter((counter) => counter.scope !== "game").map((counter) => [counter.id, counter.initial ?? 0])),
    );
  }
  if (profile.counters.some((counter) => counter.scope === "game")) {
    totals.set(GAME_COUNTER_OWNER, Object.fromEntries(
      profile.counters.filter((counter) => counter.scope === "game").map((counter) => [counter.id, counter.initial ?? 0]),
    ));
  }
  const voidedIds = effectiveVoidedEventIds(events);
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if ((event.event_kind ?? event.kind) === "void" || (event.id && voidedIds.has(event.id))) continue;
    const values = eventValues(event);
    for (const counter of profile.counters) {
      const value = values[counter.id];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const participantId = counter.scope === "game"
        ? GAME_COUNTER_OWNER
        : event.actor_participant_id ?? event.player_id;
      if (!participantId || !totals.has(participantId)) continue;
      const participant = totals.get(participantId)!;
      const current = participant[counter.id] ?? counter.initial ?? 0;
      switch (counter.aggregation) {
        case "latest":
          participant[counter.id] = value;
          break;
        case "min":
          participant[counter.id] = Math.min(current, value);
          break;
        case "max":
          participant[counter.id] = Math.max(current, value);
          break;
        default:
          participant[counter.id] = current + value;
      }
    }
  }
  return totals;
}

export function winnerIdsForCounter(
  counter: GameLedgerCounter,
  totals: Map<string, Record<string, number>>,
) {
  if (counter.ranking === "none" || counter.scope === "game" || totals.size === 0) return [];
  const entries = Array.from(totals, ([playerId, values]) => [playerId, values[counter.id] ?? counter.initial ?? 0] as const)
    .filter(([playerId]) => playerId !== GAME_COUNTER_OWNER);
  if (!entries.length) return [];
  const winningValue = counter.ranking === "lowest"
    ? Math.min(...entries.map(([, value]) => value))
    : Math.max(...entries.map(([, value]) => value));
  return entries.filter(([, value]) => value === winningValue).map(([playerId]) => playerId);
}

export const GAME_COUNTER_OWNER = "__game__";

export function hasReachedTarget(counter: GameLedgerCounter, value: number) {
  if (!counter.target) return false;
  if (counter.target.operator === "<=") return value <= counter.target.value;
  if (counter.target.operator === "=") return value === counter.target.value;
  return value >= counter.target.value;
}
