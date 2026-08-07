import {
  counterTotals,
  effectiveVoidedEventIds,
  GAME_COUNTER_OWNER,
  normaliseGameProfile,
} from "./gameProfiles";
import type {
  GameLedgerCounter,
  GameLedgerEvent,
  GameLedgerGame,
  GameLedgerMedia,
  GameLedgerParticipant,
  GameLedgerProfile,
} from "./types";

export type HistoryAnalyticsInput = {
  games: readonly GameLedgerGame[];
  participants: readonly GameLedgerParticipant[];
  events: readonly GameLedgerEvent[];
  media?: readonly GameLedgerMedia[];
  /** Consistent per-game counts from the owner-scoped history snapshot RPC. */
  activeMediaCounts?: readonly { game_id: string; active_media_count: number }[];
};

export type HistoryAnalyticsOptions = {
  /** Current labels for stable entities. Game-local guest labels remain untouched. */
  entityLabels?: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
};

export type HistoryDecision = "win" | "draw" | "none";

export type HistoryExplicitResult = {
  eventId: string;
  /** A recognised, normalised value from the explicit result event. */
  outcome: "completed" | "winner" | "draw" | "abandoned" | "custom" | "no_contest" | "cancelled" | null;
  rawOutcome: string | null;
  decision: HistoryDecision;
  winnerParticipantIds: string[];
  winnerIdentityKeys: string[];
  /** Malformed result data is retained for inspection but never changes W/D/L. */
  malformed: boolean;
};

export type HistoryParticipantSummary = {
  participantId: string;
  identityKey: string;
  entityId: string | null;
  label: string;
  seat: number;
  counterTotals: Record<string, number>;
};

export type HistoryGameSummary = {
  id: string;
  title: string;
  status: string;
  isCompleted: boolean;
  preset: string | null;
  profile: GameLedgerProfile;
  rulesetKey: string;
  rulesetLabel: string;
  /** Precomputed from the original JSON so forward-compatible extras survive normalisation. */
  counterMetricKeys: Record<string, string>;
  /** Explicit history rollups, or the counter aggregation when no override is declared. */
  counterHistoryRollups: Record<string, HistoryRollup>;
  location: string | null;
  normalizedLocation: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  participants: HistoryParticipantSummary[];
  participantEntityIds: string[];
  gameCounterTotals: Record<string, number>;
  result: HistoryExplicitResult | null;
  eventCount: number;
  mediaCount: number;
  photoCount: number;
  videoCount: number;
};

export type HistoryRollup = "sum" | "latest" | "min" | "max";

export type HistoryFilter = {
  status?: "all" | "completed" | "open";
  /** `null` selects definitions without a preset; `undefined` does not filter. */
  preset?: string | null;
  /** A game must contain every selected entity ID. */
  entityIds?: readonly string[];
  /** Any selected structural ruleset may match. */
  rulesetKeys?: readonly string[];
  /** Compared after case folding, Unicode normalisation and whitespace folding. */
  location?: string | null;
  /** Inclusive. A bare YYYY-MM-DD is interpreted at 00:00 UTC. */
  dateFrom?: string | Date | null;
  /** Inclusive. A bare YYYY-MM-DD includes that entire UTC day. */
  dateTo?: string | Date | null;
  /** Applied after every other filter; results remain oldest-first. */
  recent?: number | null;
};

export type HistoryMetricOption = {
  key: string;
  counterId: string;
  label: string;
  scope: "participant" | "game";
  valueType: "integer" | "decimal" | "duration";
  unit: string | null;
  aggregation: GameLedgerCounter["aggregation"];
  /** How final per-game values combine across games; distinct from within-game aggregation. */
  historyRollup: HistoryRollup;
  ranking: "highest" | "lowest" | "none";
  initial: number;
  target: GameLedgerCounter["target"];
  gameCount: number;
  rulesetKeys: string[];
};

export type HistoryRulesetOption = {
  key: string;
  label: string;
  preset: string | null;
  gameCount: number;
};

export type HistoryIdentityMetric = {
  games: number;
  /** The value produced by the declared history rollup. */
  rollupValue: number;
  /** Arithmetic sample total, retained for averages and auditability. */
  total: number;
  average: number;
  best: number;
  bestGameId: string;
};

export type HistoryIdentityAnalytics = {
  identityKey: string;
  entityId: string | null;
  label: string;
  appearances: number;
  completedAppearances: number;
  wins: number;
  draws: number;
  losses: number;
  decidedGames: number;
  currentWinStreak: number;
  longestWinStreak: number;
  metric: HistoryIdentityMetric | null;
};

export type HistoryTimeSeriesPoint = {
  gameId: string;
  gameTitle: string;
  at: string;
  /** Values recorded in this game, keyed by stable identity. */
  samples: Record<string, number>;
  /** Running cross-game participant rollups after this game. */
  cumulative: Record<string, number>;
  /** Present for game-scoped counters. */
  gameValue: number | null;
  /** Present for game-scoped counters. */
  cumulativeGameValue: number | null;
};

export type HistoryMetricAnalytics = {
  option: HistoryMetricOption;
  sampleCount: number;
  /** The value produced by the declared history rollup over all samples. */
  rollupValue: number;
  /** Arithmetic sample total, retained for averages and auditability. */
  total: number;
  average: number;
  best: number;
  bestGameId: string;
  bestIdentityKey: string | null;
};

export type HistoryInterestingFact = {
  id: string;
  kind:
    | "most_appearances"
    | "most_wins"
    | "longest_win_streak"
    | "metric_leader"
    | "metric_total"
    | "best_single_game"
    | "closest_finish"
    | "busiest_month"
    | "frequent_lineup"
    | "media_memories"
    | "longest_game";
  text: string;
  identityKeys?: string[];
  gameId?: string;
  gameIds?: string[];
  sampleSize?: number;
  value?: number;
};

export type HistoryAnalytics = {
  gameCount: number;
  completedGameCount: number;
  openGameCount: number;
  mediaCount: number;
  identities: HistoryIdentityAnalytics[];
  metric: HistoryMetricAnalytics | null;
  timeSeries: HistoryTimeSeriesPoint[];
  facts: HistoryInterestingFact[];
};

type UnknownRecord = Record<string, unknown>;

const RECOGNISED_OUTCOMES = new Map<string, NonNullable<HistoryExplicitResult["outcome"]>>([
  ["completed", "completed"],
  ["winner", "winner"],
  ["draw", "draw"],
  ["abandoned", "abandoned"],
  ["custom", "custom"],
  ["no_contest", "no_contest"],
  ["cancelled", "cancelled"],
  ["canceled", "cancelled"],
]);

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numericTimestamp(value: string | Date | null | undefined) {
  if (!value) return null;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareGames(left: HistoryGameSummary, right: HistoryGameSummary) {
  const leftTime = numericTimestamp(left.startedAt) ?? Number.NEGATIVE_INFINITY;
  const rightTime = numericTimestamp(right.startedAt) ?? Number.NEGATIVE_INFINITY;
  return leftTime - rightTime || compareText(left.id, right.id);
}

function canonicalValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : null;
  if (Array.isArray(value)) {
    if (seen.has(value)) return null;
    seen.add(value);
    const result = value.map((item) => canonicalValue(item, seen));
    seen.delete(value);
    return result;
  }
  if (isRecord(value)) {
    if (seen.has(value)) return null;
    seen.add(value);
    const result: UnknownRecord = {};
    for (const key of Object.keys(value).sort(compareText)) {
      if (value[key] !== undefined) result[key] = canonicalValue(value[key], seen);
    }
    seen.delete(value);
    return result;
  }
  return null;
}

function stableJson(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

function propertiesExcept(value: unknown, excluded: readonly string[]) {
  if (!isRecord(value)) return {};
  const excludedKeys = new Set(excluded);
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => !excludedKeys.has(key) && item !== undefined));
}

function rawItemsById(definition: unknown, field: "counters" | "event_fields" | "result_fields") {
  const result = new Map<string, UnknownRecord>();
  if (!isRecord(definition) || !Array.isArray(definition[field])) return result;
  for (const item of definition[field]) {
    if (isRecord(item) && typeof item.id === "string") result.set(item.id.trim(), item);
  }
  return result;
}

function semanticCounterShape(counter: GameLedgerCounter, rawValue: unknown) {
  const raw = isRecord(rawValue) ? rawValue : {};
  const rawInput = isRecord(raw.input) ? raw.input : {};
  const rawTarget = isRecord(raw.target) ? raw.target : {};
  return {
    id: counter.id,
    scope: counter.scope ?? "participant",
    value_type: counter.value_type ?? "decimal",
    unit: counter.unit ?? null,
    initial: counter.initial ?? 0,
    aggregation: counter.aggregation,
    ranking: counter.ranking ?? "highest",
    input: {
      mode: counter.input?.mode ?? (counter.aggregation === "sum" ? "delta" : "set"),
      allow_negative: counter.input?.allow_negative !== false,
      // quick_values are buttons, not rules. Unknown input keys are treated as
      // semantic so a future scoring control cannot silently merge histories.
      extensions: propertiesExcept(rawInput, ["mode", "allow_negative", "quick_values"]),
    },
    target: counter.target ? {
      operator: counter.target.operator,
      value: counter.target.value,
      finish: counter.target.finish,
      extensions: propertiesExcept(rawTarget, ["operator", "value", "finish"]),
    } : null,
    extra: raw.extra ?? counter.extra ?? null,
    // label is presentational; legacy winner is normalised into ranking.
    extensions: propertiesExcept(raw, [
      "id", "label", "scope", "value_type", "unit", "initial", "aggregation",
      "ranking", "winner", "input", "target", "extra",
    ]),
  };
}

function semanticFieldShape(field: GameLedgerProfile["event_fields"][number], rawValue: unknown) {
  const raw = isRecord(rawValue) ? rawValue : {};
  return {
    id: field.id,
    type: field.type,
    required: field.required === true,
    unit: field.unit ?? null,
    options: field.options ? Array.from(new Set(field.options)).sort(compareText) : null,
    extra: raw.extra ?? field.extra ?? null,
    // Labels and placeholders affect display only. Unknown keys are retained.
    extensions: propertiesExcept(raw, ["id", "label", "type", "required", "unit", "options", "placeholder", "extra"]),
  };
}

function semanticParticipantShape(profile: GameLedgerProfile, definition: unknown) {
  const raw = isRecord(definition) && isRecord(definition.participant) ? definition.participant : {};
  const rawRoles = Array.isArray(raw.roles) ? raw.roles : [];
  return {
    min: profile.participant?.min ?? 0,
    max: profile.participant?.max ?? 32,
    roles: (profile.participant?.roles ?? []).map((role, index) => ({
      id: role.id,
      // Role order can define seats; role labels are presentational.
      extensions: propertiesExcept(rawRoles[index], ["id", "label"]),
    })),
    extensions: propertiesExcept(raw, ["min", "max", "roles"]),
  };
}

function semanticResultShape(profile: GameLedgerProfile, definition: unknown) {
  const raw = isRecord(definition) && isRecord(definition.result) ? definition.result : {};
  return {
    mode: profile.result?.mode ?? "none",
    winner_counter_id: profile.result?.winner_counter_id ?? null,
    allow_draw: profile.result?.allow_draw !== false,
    allow_multiple_winners: profile.result?.allow_multiple_winners === true,
    extra: raw.extra ?? null,
    extensions: propertiesExcept(raw, [
      "mode", "winner_counter_id", "allow_draw", "allow_multiple_winners", "extra",
    ]),
  };
}

function semanticDefinitionShape(definition: unknown) {
  const profile = normaliseGameProfile(definition);
  const raw = isRecord(definition) ? definition : {};
  const rawCounters = rawItemsById(definition, "counters");
  const rawEventFields = rawItemsById(definition, "event_fields");
  const rawResultFields = rawItemsById(definition, "result_fields");
  const counters = profile.counters.map((counter) => semanticCounterShape(counter, rawCounters.get(counter.id)))
    .sort((left, right) => compareText(left.id, right.id));
  const fields = (
    values: GameLedgerProfile["event_fields"],
    sources: Map<string, UnknownRecord>,
  ) => values.map((field) => semanticFieldShape(field, sources.get(field.id)))
    .sort((left, right) => compareText(left.id, right.id));

  return {
    version: profile.version,
    preset: profile.preset ?? null,
    participant: semanticParticipantShape(profile, definition),
    counters,
    event_fields: fields(profile.event_fields, rawEventFields),
    result_fields: fields(profile.result_fields, rawResultFields),
    result: semanticResultShape(profile, definition),
    tools: profile.tools ? Array.from(new Set(profile.tools)).sort(compareText) : null,
    extra: raw.extra ?? profile.extra ?? null,
    // name is presentational. Everything else unknown is conservatively
    // semantic until a future schema explicitly classifies it otherwise.
    extensions: propertiesExcept(raw, [
      "version", "name", "preset", "participant", "counters", "event_fields",
      "result_fields", "result", "tools", "extra",
    ]),
  };
}

/**
 * A structural ruleset key. It deliberately omits presentation-only profile
 * names, quick buttons and placeholders, while retaining every scoring rule and
 * declared JSON extension that can change the meaning of a game.
 */
export function historyRulesetKey(definition: unknown) {
  return `ruleset:${stableJson(semanticDefinitionShape(definition))}`;
}

export function historyRulesetLabel(definition: unknown) {
  const profile = normaliseGameProfile(definition);
  const presetLabels: Record<string, string> = {
    freeform: "Open tally",
    cribbage: "Cribbage",
    chess: "Chess",
    word_tiles: "Word tiles",
    custom: "Custom rules",
  };
  return (profile.preset && presetLabels[profile.preset])
    || profile.name.trim()
    || (profile.preset ? profile.preset.replace(/[_-]+/g, " ") : "Custom rules");
}

/** A null entity is unique to its participant row and is never name-merged. */
export function historyIdentityKey(participant: Pick<GameLedgerParticipant, "id" | "entity_id">) {
  return participant.entity_id ? `entity:${participant.entity_id}` : `participant:${participant.id}`;
}

export function normalizeHistoryLocation(location: string | null | undefined) {
  if (location == null) return null;
  const normalized = location.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  return normalized || null;
}

function normalizedOutcome(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return { raw: null, outcome: null };
  const raw = value.trim();
  const token = raw.toLowerCase().replace(/[\s-]+/g, "_");
  return { raw, outcome: RECOGNISED_OUTCOMES.get(token) ?? null };
}

function explicitWinnerIds(payload: UnknownRecord) {
  const arrayKeys = ["_winner_participant_ids", "winner_participant_ids"] as const;
  const scalarKeys = ["_winner_participant_id", "winner_participant_id"] as const;
  for (const key of arrayKeys) {
    if (!Object.hasOwn(payload, key)) continue;
    const value = payload[key];
    if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !id)) {
      return { ids: [] as string[], malformed: true };
    }
    return { ids: Array.from(new Set(value)), malformed: false };
  }
  for (const key of scalarKeys) {
    if (!Object.hasOwn(payload, key)) continue;
    const value = payload[key];
    if (value === null) return { ids: [] as string[], malformed: false };
    if (typeof value !== "string" || !value) return { ids: [] as string[], malformed: true };
    return { ids: [value], malformed: false };
  }
  return { ids: [] as string[], malformed: false };
}

function gameResult(
  events: readonly GameLedgerEvent[],
  participants: readonly HistoryParticipantSummary[],
): HistoryExplicitResult | null {
  const voided = effectiveVoidedEventIds([...events]);
  const resultEvent = [...events]
    .filter((event) => event.event_kind === "result" && !voided.has(event.id))
    .sort((left, right) => left.seq - right.seq || compareText(left.id, right.id))
    .at(-1);
  if (!resultEvent) return null;

  const payload = isRecord(resultEvent.event_data) ? resultEvent.event_data : null;
  const outcomeValue = normalizedOutcome(payload?._outcome ?? payload?.outcome);
  const winnerValue = payload ? explicitWinnerIds(payload) : { ids: [] as string[], malformed: true };
  const participantById = new Map(participants.map((participant) => [participant.participantId, participant]));
  const hasUnknownWinner = winnerValue.ids.some((id) => !participantById.has(id));
  const validatedWinnerIds = hasUnknownWinner ? [] : winnerValue.ids;
  const winnerIdentityKeys = Array.from(new Set(validatedWinnerIds.map((id) => participantById.get(id)!.identityKey)))
    .sort(compareText);

  let malformed = !payload || outcomeValue.outcome === null || winnerValue.malformed || hasUnknownWinner;
  let decision: HistoryDecision = "none";
  if (!malformed) {
    if (outcomeValue.outcome === "draw") {
      if (validatedWinnerIds.length) malformed = true;
      else decision = "draw";
    } else if (outcomeValue.outcome === "winner") {
      if (!validatedWinnerIds.length) malformed = true;
      else decision = "win";
    } else if (outcomeValue.outcome === "completed") {
      decision = validatedWinnerIds.length ? "win" : "none";
    } else if (validatedWinnerIds.length) {
      malformed = true;
    }
  }
  if (malformed) decision = "none";

  return {
    eventId: resultEvent.id,
    outcome: malformed ? null : outcomeValue.outcome,
    rawOutcome: outcomeValue.raw,
    decision,
    winnerParticipantIds: validatedWinnerIds,
    winnerIdentityKeys,
    malformed,
  };
}

export function buildHistoryGameSummaries(input: HistoryAnalyticsInput): HistoryGameSummary[] {
  const participantsByGame = new Map<string, GameLedgerParticipant[]>();
  const eventsByGame = new Map<string, GameLedgerEvent[]>();
  const mediaByGame = new Map<string, GameLedgerMedia[]>();
  const activeMediaCountByGame = new Map(
    (input.activeMediaCounts ?? [])
      .filter((item) => Number.isInteger(item.active_media_count) && item.active_media_count >= 0)
      .map((item) => [item.game_id, item.active_media_count] as const),
  );
  for (const participant of input.participants) {
    const bucket = participantsByGame.get(participant.game_id) ?? [];
    bucket.push(participant);
    participantsByGame.set(participant.game_id, bucket);
  }
  for (const event of input.events) {
    const bucket = eventsByGame.get(event.game_id) ?? [];
    bucket.push(event);
    eventsByGame.set(event.game_id, bucket);
  }
  for (const item of input.media ?? []) {
    const bucket = mediaByGame.get(item.game_id) ?? [];
    bucket.push(item);
    mediaByGame.set(item.game_id, bucket);
  }

  const summaries = input.games.map((game): HistoryGameSummary => {
    const profile = normaliseGameProfile(game.definition);
    const gameParticipants = [...(participantsByGame.get(game.id) ?? [])]
      .sort((left, right) => left.seat - right.seat || compareText(left.id, right.id));
    const gameEvents = [...(eventsByGame.get(game.id) ?? [])]
      .sort((left, right) => left.seq - right.seq || compareText(left.id, right.id));
    const totals = counterTotals(profile, gameParticipants.map((participant) => participant.id), gameEvents);
    const participantSummaries = gameParticipants.map((participant): HistoryParticipantSummary => ({
      participantId: participant.id,
      identityKey: historyIdentityKey(participant),
      entityId: participant.entity_id,
      label: participant.label,
      seat: participant.seat,
      counterTotals: { ...(totals.get(participant.id) ?? {}) },
    }));
    const activeMedia = (mediaByGame.get(game.id) ?? []).filter((item) => !item.deleted_at);
    const activeMediaCount = activeMediaCountByGame.get(game.id) ?? activeMedia.length;
    const started = numericTimestamp(game.started_at);
    const ended = numericTimestamp(game.ended_at);
    const location = game.location?.trim() || null;
    return {
      id: game.id,
      title: game.title,
      status: game.status,
      isCompleted: game.status === "complete",
      preset: profile.preset ?? null,
      profile,
      rulesetKey: historyRulesetKey(game.definition),
      rulesetLabel: historyRulesetLabel(game.definition),
      counterMetricKeys: Object.fromEntries(profile.counters.map((counter) => [
        counter.id,
        historyCounterCompatibilityFingerprint(counter, game.definition),
      ])),
      counterHistoryRollups: Object.fromEntries(profile.counters.map((counter) => [
        counter.id,
        historyCounterRollup(counter, game.definition),
      ])),
      location,
      normalizedLocation: normalizeHistoryLocation(location),
      startedAt: game.started_at,
      endedAt: game.ended_at,
      durationMs: started !== null && ended !== null && ended >= started ? ended - started : null,
      participants: participantSummaries,
      participantEntityIds: Array.from(new Set(participantSummaries.flatMap((participant) => participant.entityId ? [participant.entityId] : [])))
        .sort(compareText),
      gameCounterTotals: { ...(totals.get(GAME_COUNTER_OWNER) ?? {}) },
      result: gameResult(gameEvents, participantSummaries),
      eventCount: gameEvents.length,
      mediaCount: activeMediaCount,
      photoCount: activeMedia.filter((item) => item.media_kind === "photo").length,
      videoCount: activeMedia.filter((item) => item.media_kind === "video").length,
    };
  });
  return summaries.sort(compareGames);
}

function normalizedToken(value: string | null) {
  return value === null ? null : value.normalize("NFKC").trim().toLowerCase();
}

function dateBound(value: string | Date | null | undefined, endOfDay: boolean) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const start = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(start) ? start + (endOfDay ? 86_400_000 - 1 : 0) : null;
  }
  return numericTimestamp(value);
}

export function filterHistoryGames(
  summaries: readonly HistoryGameSummary[],
  filter: HistoryFilter = {},
): HistoryGameSummary[] {
  const entityIds = Array.from(new Set((filter.entityIds ?? []).filter(Boolean)));
  const rulesetKeys = new Set((filter.rulesetKeys ?? []).filter(Boolean));
  const normalizedPreset = filter.preset === undefined ? undefined : normalizedToken(filter.preset);
  const normalizedLocation = filter.location === undefined ? undefined : normalizeHistoryLocation(filter.location);
  const from = dateBound(filter.dateFrom, false);
  const to = dateBound(filter.dateTo, true);
  let result = [...summaries].sort(compareGames).filter((game) => {
    if (filter.status === "completed" && !game.isCompleted) return false;
    if (filter.status === "open" && game.isCompleted) return false;
    if (normalizedPreset !== undefined && normalizedToken(game.preset) !== normalizedPreset) return false;
    if (rulesetKeys.size && !rulesetKeys.has(game.rulesetKey)) return false;
    if (normalizedLocation !== undefined && game.normalizedLocation !== normalizedLocation) return false;
    if (entityIds.some((entityId) => !game.participantEntityIds.includes(entityId))) return false;
    const started = numericTimestamp(game.startedAt);
    if (from !== null && (started === null || started < from)) return false;
    if (to !== null && (started === null || started > to)) return false;
    return true;
  });
  if (filter.recent !== undefined && filter.recent !== null) {
    const recent = Math.max(0, Math.trunc(filter.recent));
    result = recent === 0 ? [] : result.slice(-recent);
  }
  return result;
}

export function historyCounterCompatibilityFingerprint(counterInput: GameLedgerCounter, definition?: unknown) {
  const profile = normaliseGameProfile({
    version: 1,
    name: "Metric",
    participant: { min: 0, max: 32 },
    counters: [counterInput],
    event_fields: [],
    result_fields: [],
    result: { mode: "none" },
  });
  const counter = profile.counters[0];
  const rawCounter = definition === undefined
    ? counterInput
    : rawItemsById(definition, "counters").get(counter.id) ?? counterInput;
  return `metric:${stableJson({
    counter: semanticCounterShape(counter, rawCounter),
    // A metric is combined conservatively: any semantic rule in the enclosing
    // profile may affect how its values were produced. Pure display fields have
    // already been removed from this canonical shape.
    ruleset: definition === undefined ? null : semanticDefinitionShape(definition),
  })}`;
}

export function historyCounterRollup(counter: GameLedgerCounter, definition?: unknown): HistoryRollup {
  const rawCounter = definition === undefined
    ? counter as unknown
    : rawItemsById(definition, "counters").get(counter.id) ?? counter;
  const raw = isRecord(rawCounter) ? rawCounter : {};
  const rawExtra = isRecord(raw.extra) ? raw.extra : {};
  const candidate = raw.history_rollup ?? rawExtra.history_rollup;
  return candidate === "sum" || candidate === "latest" || candidate === "min" || candidate === "max"
    ? candidate
    : counter.aggregation;
}

function preferredLabel(counts: Map<string, number>) {
  return Array.from(counts)
    .sort(([leftLabel, leftCount], [rightLabel, rightCount]) => rightCount - leftCount || compareText(leftLabel, rightLabel))[0]?.[0]
    ?? "Metric";
}

export function historyMetricOptions(summaries: readonly HistoryGameSummary[]): HistoryMetricOption[] {
  const candidates = new Map<string, {
    counter: GameLedgerCounter;
    historyRollup: HistoryRollup;
    labels: Map<string, number>;
    games: Set<string>;
    rulesets: Set<string>;
  }>();
  for (const game of [...summaries].sort(compareGames)) {
    for (const counter of game.profile.counters) {
      const key = game.counterMetricKeys[counter.id] ?? historyCounterCompatibilityFingerprint(counter, game.profile);
      const candidate = candidates.get(key) ?? {
        counter,
        historyRollup: game.counterHistoryRollups[counter.id] ?? historyCounterRollup(counter, game.profile),
        labels: new Map<string, number>(),
        games: new Set<string>(),
        rulesets: new Set<string>(),
      };
      candidate.labels.set(counter.label, (candidate.labels.get(counter.label) ?? 0) + 1);
      candidate.games.add(game.id);
      candidate.rulesets.add(game.rulesetKey);
      candidates.set(key, candidate);
    }
  }
  return Array.from(candidates.entries()).map(([key, candidate]): HistoryMetricOption => ({
    key,
    counterId: candidate.counter.id,
    label: preferredLabel(candidate.labels),
    scope: candidate.counter.scope ?? "participant",
    valueType: candidate.counter.value_type ?? "decimal",
    unit: candidate.counter.unit ?? null,
    aggregation: candidate.counter.aggregation,
    historyRollup: candidate.historyRollup,
    ranking: candidate.counter.ranking ?? "highest",
    initial: candidate.counter.initial ?? 0,
    target: candidate.counter.target ?? null,
    gameCount: candidate.games.size,
    rulesetKeys: Array.from(candidate.rulesets).sort(compareText),
  })).sort((left, right) => compareText(left.label, right.label) || compareText(left.key, right.key));
}

export function historyRulesetOptions(summaries: readonly HistoryGameSummary[]): HistoryRulesetOption[] {
  const options = new Map<string, { labels: Map<string, number>; presets: Map<string, number>; games: Set<string> }>();
  for (const game of summaries) {
    const option = options.get(game.rulesetKey) ?? {
      labels: new Map<string, number>(),
      presets: new Map<string, number>(),
      games: new Set<string>(),
    };
    option.labels.set(game.rulesetLabel, (option.labels.get(game.rulesetLabel) ?? 0) + 1);
    if (game.preset) option.presets.set(game.preset, (option.presets.get(game.preset) ?? 0) + 1);
    option.games.add(game.id);
    options.set(game.rulesetKey, option);
  }
  return Array.from(options.entries()).map(([key, option]) => ({
    key,
    label: preferredLabel(option.labels),
    preset: option.presets.size ? preferredLabel(option.presets) : null,
    gameCount: option.games.size,
  })).sort((left, right) => compareText(left.label, right.label) || compareText(left.key, right.key));
}

type MutableIdentity = Omit<HistoryIdentityAnalytics, "metric"> & {
  appearanceIds: Set<string>;
  completedAppearanceIds: Set<string>;
  metricValues: Array<{ gameId: string; value: number }>;
};

function metricCounter(game: HistoryGameSummary, key: string) {
  return game.profile.counters.find((counter) => game.counterMetricKeys[counter.id] === key) ?? null;
}

function applyHistoryRollup(current: number | undefined, value: number, rollup: HistoryRollup) {
  if (current === undefined || rollup === "latest") return value;
  if (rollup === "min") return Math.min(current, value);
  if (rollup === "max") return Math.max(current, value);
  return current + value;
}

function historyRollupValue(values: readonly number[], rollup: HistoryRollup) {
  return values.reduce<number | undefined>((current, value) => applyHistoryRollup(current, value, rollup), undefined);
}

export function historyMetricRollupLabel(option: HistoryMetricOption) {
  const label = option.label.toLowerCase();
  if (option.historyRollup === "latest") return `Latest ${label}`;
  if (option.historyRollup === "min") return `Lowest recorded ${label}`;
  if (option.historyRollup === "max") return `Highest recorded ${label}`;
  return `Cumulative ${label}`;
}

function entityLabel(options: HistoryAnalyticsOptions, entityId: string | null) {
  if (!entityId || !options.entityLabels) return null;
  const labels = options.entityLabels;
  const mapGetter = (labels as ReadonlyMap<string, string>).get;
  const label = typeof mapGetter === "function"
    ? mapGetter.call(labels, entityId)
    : (labels as Readonly<Record<string, string>>)[entityId];
  return typeof label === "string" && label.trim() ? label.trim() : null;
}

function isBetter(value: number, current: number, ranking: HistoryMetricOption["ranking"]) {
  return ranking === "lowest" ? value < current : value > current;
}

function bestSample(
  samples: Array<{ gameId: string; identityKey?: string; value: number }>,
  ranking: HistoryMetricOption["ranking"],
) {
  return samples.reduce((best, sample) => {
    if (!best || isBetter(sample.value, best.value, ranking)) return sample;
    return best;
  }, null as { gameId: string; identityKey?: string; value: number } | null);
}

function labelsFor(identities: HistoryIdentityAnalytics[], value: (identity: HistoryIdentityAnalytics) => number) {
  const maximum = Math.max(...identities.map(value));
  return identities.filter((identity) => value(identity) === maximum)
    .sort((left, right) => compareText(left.label, right.label) || compareText(left.identityKey, right.identityKey));
}

function formattedMetric(value: number, option: HistoryMetricOption) {
  const rounded = Number(value.toFixed(3));
  return `${rounded}${option.unit ? ` ${option.unit}` : ""}`;
}

function joinedNames(identities: readonly HistoryIdentityAnalytics[]) {
  return identities.map((identity) => identity.label).join(", ");
}

function naturalList(values: readonly string[]) {
  if (values.length < 2) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function calendarMonth(value: string) {
  const timestamp = numericTimestamp(value);
  if (timestamp === null) return null;
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return { key: `${year}-${String(month + 1).padStart(2, "0")}`, label: `${MONTH_NAMES[month]} ${year}` };
}

function addFrequentLineupFact(
  facts: HistoryInterestingFact[],
  games: readonly HistoryGameSummary[],
  identities: readonly HistoryIdentityAnalytics[],
) {
  const identityLabels = new Map(identities.map((identity) => [identity.identityKey, identity.label]));
  const lineups = new Map<string, { identityKeys: string[]; gameIds: string[] }>();
  for (const game of games) {
    const identityKeys = Array.from(new Set(game.participants.map((participant) => participant.identityKey))).sort(compareText);
    if (identityKeys.length < 2) continue;
    const key = stableJson(identityKeys);
    const lineup = lineups.get(key) ?? { identityKeys, gameIds: [] };
    lineup.gameIds.push(game.id);
    lineups.set(key, lineup);
  }
  const frequent = Array.from(lineups.values())
    .filter((lineup) => lineup.gameIds.length > 1)
    .sort((left, right) => right.gameIds.length - left.gameIds.length || compareText(stableJson(left.identityKeys), stableJson(right.identityKeys)))[0];
  if (!frequent) return;
  const labels = frequent.identityKeys.map((key) => identityLabels.get(key) ?? "Guest");
  facts.push({
    id: `frequent-lineup:${stableJson(frequent.identityKeys)}`,
    kind: "frequent_lineup",
    text: `${naturalList(labels)} ${labels.length === 2 ? "are your most frequent pairing" : "form your most frequent lineup"} (${frequent.gameIds.length} games together).`,
    identityKeys: frequent.identityKeys,
    gameIds: [...frequent.gameIds],
    sampleSize: frequent.gameIds.length,
    value: frequent.gameIds.length,
  });
}

function addBusiestMonthFact(facts: HistoryInterestingFact[], games: readonly HistoryGameSummary[]) {
  const months = new Map<string, { label: string; gameIds: string[] }>();
  for (const game of games) {
    const month = calendarMonth(game.startedAt);
    if (!month) continue;
    const bucket = months.get(month.key) ?? { label: month.label, gameIds: [] };
    bucket.gameIds.push(game.id);
    months.set(month.key, bucket);
  }
  const busiest = Array.from(months.entries())
    .filter(([, bucket]) => bucket.gameIds.length > 1)
    .sort(([leftKey, left], [rightKey, right]) => right.gameIds.length - left.gameIds.length || compareText(rightKey, leftKey))[0];
  if (!busiest) return;
  facts.push({
    id: `busiest-month:${busiest[0]}`,
    kind: "busiest_month",
    text: `${busiest[1].label} is the busiest recorded month in this subhistory (${busiest[1].gameIds.length} games).`,
    gameIds: [...busiest[1].gameIds],
    sampleSize: busiest[1].gameIds.length,
    value: busiest[1].gameIds.length,
  });
}

function addClosestFinishFact(
  facts: HistoryInterestingFact[],
  games: readonly HistoryGameSummary[],
  metric: HistoryMetricAnalytics,
  identities: readonly HistoryIdentityAnalytics[],
) {
  if (metric.option.scope !== "participant" || metric.option.ranking === "none") return;
  const finishes = games.flatMap((game) => {
    const counter = metricCounter(game, metric.option.key);
    if (!counter) return [];
    const ranked = game.participants
      .flatMap((participant) => {
        const value = participant.counterTotals[counter.id];
        return typeof value === "number" && Number.isFinite(value) ? [{ participant, value }] : [];
      })
      .sort((left, right) => {
        const difference = metric.option.ranking === "lowest" ? left.value - right.value : right.value - left.value;
        return difference || compareText(left.participant.identityKey, right.participant.identityKey);
      });
    if (ranked.length < 2) return [];
    return [{ game, leaders: ranked.slice(0, 2), margin: Math.abs(ranked[0].value - ranked[1].value) }];
  }).sort((left, right) => left.margin - right.margin || compareGames(left.game, right.game));
  const closest = finishes[0];
  if (!closest) return;
  const currentLabels = new Map(identities.map((identity) => [identity.identityKey, identity.label]));
  const labels = closest.leaders.map(({ participant }) => currentLabels.get(participant.identityKey) ?? participant.label);
  facts.push({
    id: `closest-finish:${metric.option.key}:${closest.game.id}`,
    kind: "closest_finish",
    text: closest.margin === 0
      ? `${closest.game.title} is the closest ${metric.option.label.toLowerCase()} finish: ${naturalList(labels)} finished level.`
      : `${closest.game.title} is the closest ${metric.option.label.toLowerCase()} finish: ${naturalList(labels)} were separated by ${formattedMetric(closest.margin, metric.option)}.`,
    identityKeys: closest.leaders.map(({ participant }) => participant.identityKey),
    gameId: closest.game.id,
    gameIds: [closest.game.id],
    sampleSize: finishes.length,
    value: closest.margin,
  });
}

function buildFacts(
  games: readonly HistoryGameSummary[],
  identities: HistoryIdentityAnalytics[],
  metric: HistoryMetricAnalytics | null,
): HistoryInterestingFact[] {
  const facts: HistoryInterestingFact[] = [];
  if (identities.length) {
    const mostAppearances = labelsFor(identities, (identity) => identity.appearances);
    if (mostAppearances[0].appearances > 0) {
      facts.push({
        id: `most-appearances:${mostAppearances.map((identity) => identity.identityKey).join(",")}`,
        kind: "most_appearances",
        text: `${joinedNames(mostAppearances)} ${mostAppearances.length === 1 ? "has" : "have"} the most appearances (${mostAppearances[0].appearances}).`,
        identityKeys: mostAppearances.map((identity) => identity.identityKey),
        value: mostAppearances[0].appearances,
      });
    }
    const mostWins = labelsFor(identities, (identity) => identity.wins);
    if (mostWins[0].wins > 0) {
      facts.push({
        id: `most-wins:${mostWins.map((identity) => identity.identityKey).join(",")}`,
        kind: "most_wins",
        text: `${joinedNames(mostWins)} ${mostWins.length === 1 ? "has" : "have"} the most recorded wins (${mostWins[0].wins}).`,
        identityKeys: mostWins.map((identity) => identity.identityKey),
        value: mostWins[0].wins,
      });
    }
    const longest = labelsFor(identities, (identity) => identity.longestWinStreak);
    if (longest[0].longestWinStreak > 0) {
      facts.push({
        id: `longest-streak:${longest.map((identity) => identity.identityKey).join(",")}`,
        kind: "longest_win_streak",
        text: `${joinedNames(longest)} ${longest.length === 1 ? "has" : "have"} the longest win streak (${longest[0].longestWinStreak}).`,
        identityKeys: longest.map((identity) => identity.identityKey),
        value: longest[0].longestWinStreak,
      });
    }
  }
  if (metric) {
    if (metric.option.scope === "participant") {
      const withMetric = identities.filter((identity) => identity.metric);
      if (withMetric.length) {
        const ranked = [...withMetric].sort((left, right) => {
          const leftValue = left.metric!.rollupValue;
          const rightValue = right.metric!.rollupValue;
          return metric.option.ranking === "lowest"
            ? leftValue - rightValue || compareText(left.identityKey, right.identityKey)
            : rightValue - leftValue || compareText(left.identityKey, right.identityKey);
        });
        const leadingValue = ranked[0].metric!.rollupValue;
        const leaders = ranked.filter((identity) => identity.metric!.rollupValue === leadingValue);
        facts.push({
          id: `metric-leader:${metric.option.key}:${leaders.map((identity) => identity.identityKey).join(",")}`,
          kind: "metric_leader",
          text: `${joinedNames(leaders)} ${leaders.length === 1 ? "has" : "have"} the ${metric.option.ranking === "lowest" ? "lowest" : "highest"} ${historyMetricRollupLabel(metric.option).toLowerCase()} (${formattedMetric(leadingValue, metric.option)}).`,
          identityKeys: leaders.map((identity) => identity.identityKey),
          value: leadingValue,
        });
      }
    } else {
      facts.push({
        id: `metric-total:${metric.option.key}`,
        kind: "metric_total",
        text: `The ${historyMetricRollupLabel(metric.option).toLowerCase()} is ${formattedMetric(metric.rollupValue, metric.option)} across ${metric.sampleCount} games.`,
        value: metric.rollupValue,
      });
    }
    facts.push({
      id: `best-game:${metric.option.key}:${metric.bestGameId}`,
      kind: "best_single_game",
      text: `The ${metric.option.ranking === "lowest" ? "lowest" : "highest"} single-game ${metric.option.label.toLowerCase()} is ${formattedMetric(metric.best, metric.option)}.`,
      gameId: metric.bestGameId,
      value: metric.best,
      ...(metric.bestIdentityKey ? { identityKeys: [metric.bestIdentityKey] } : {}),
    });
    addClosestFinishFact(facts, games, metric, identities);
  }
  addFrequentLineupFact(facts, games, identities);
  addBusiestMonthFact(facts, games);
  const mediaCount = games.reduce((sum, game) => sum + game.mediaCount, 0);
  if (mediaCount) {
    facts.push({
      id: "media-memories",
      kind: "media_memories",
      text: `${mediaCount} photo${mediaCount === 1 ? " or video is" : "s or videos are"} attached to this history.`,
      value: mediaCount,
    });
  }
  const durationGames = games.filter((game) => game.durationMs !== null)
    .sort((left, right) => right.durationMs! - left.durationMs! || compareGames(left, right));
  if (durationGames.length && durationGames[0].durationMs! > 0) {
    facts.push({
      id: `longest-game:${durationGames[0].id}`,
      kind: "longest_game",
      text: `${durationGames[0].title} is the longest recorded game (${Math.round(durationGames[0].durationMs! / 60_000)} minutes).`,
      gameId: durationGames[0].id,
      value: durationGames[0].durationMs!,
    });
  }
  return facts;
}

export function calculateHistoryAnalytics(
  summaries: readonly HistoryGameSummary[],
  metricKey?: string | null,
  options: HistoryAnalyticsOptions = {},
): HistoryAnalytics {
  const games = [...summaries].sort(compareGames);
  const option = metricKey ? historyMetricOptions(games).find((candidate) => candidate.key === metricKey) ?? null : null;
  const identities = new Map<string, MutableIdentity>();

  for (const game of games) {
    const gameIdentityKeys = new Set<string>();
    for (const participant of game.participants) {
      gameIdentityKeys.add(participant.identityKey);
      const displayLabel = entityLabel(options, participant.entityId) ?? participant.label;
      const identity = identities.get(participant.identityKey) ?? {
        identityKey: participant.identityKey,
        entityId: participant.entityId,
        label: displayLabel,
        appearances: 0,
        completedAppearances: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        decidedGames: 0,
        currentWinStreak: 0,
        longestWinStreak: 0,
        appearanceIds: new Set<string>(),
        completedAppearanceIds: new Set<string>(),
        metricValues: [],
      };
      // Stable entities use their current name when supplied. Otherwise the
      // newest immutable participant snapshot is the best available label.
      identity.label = displayLabel;
      identity.appearanceIds.add(game.id);
      if (game.isCompleted) identity.completedAppearanceIds.add(game.id);
      identities.set(participant.identityKey, identity);
    }
    const result = game.result;
    if (!result || result.malformed || result.decision === "none") continue;
    const winnerKeys = new Set(result.winnerIdentityKeys);
    for (const identityKey of Array.from(gameIdentityKeys)) {
      const identity = identities.get(identityKey)!;
      identity.decidedGames += 1;
      if (result.decision === "draw") {
        identity.draws += 1;
        identity.currentWinStreak = 0;
      } else if (winnerKeys.has(identityKey)) {
        identity.wins += 1;
        identity.currentWinStreak += 1;
        identity.longestWinStreak = Math.max(identity.longestWinStreak, identity.currentWinStreak);
      } else {
        identity.losses += 1;
        identity.currentWinStreak = 0;
      }
    }
  }

  const timeSeries: HistoryTimeSeriesPoint[] = [];
  const allMetricSamples: Array<{ gameId: string; identityKey?: string; value: number }> = [];
  const running = new Map<string, number>();
  let runningGameValue: number | undefined;
  if (option) {
    for (const game of games) {
      const counter = metricCounter(game, option.key);
      if (!counter) continue;
      const samples: Record<string, number> = {};
      let gameValue: number | null = null;
      let cumulativeGameValue: number | null = null;
      if (option.scope === "participant") {
        for (const participant of game.participants) {
          const value = participant.counterTotals[counter.id];
          if (typeof value !== "number" || !Number.isFinite(value)) continue;
          samples[participant.identityKey] = (samples[participant.identityKey] ?? 0) + value;
        }
        for (const identityKey of Object.keys(samples).sort(compareText)) {
          const value = samples[identityKey];
          running.set(identityKey, applyHistoryRollup(running.get(identityKey), value, option.historyRollup));
          identities.get(identityKey)?.metricValues.push({ gameId: game.id, value });
          allMetricSamples.push({ gameId: game.id, identityKey, value });
        }
      } else {
        const value = game.gameCounterTotals[counter.id];
        if (typeof value === "number" && Number.isFinite(value)) {
          gameValue = value;
          runningGameValue = applyHistoryRollup(runningGameValue, value, option.historyRollup);
          cumulativeGameValue = runningGameValue;
          allMetricSamples.push({ gameId: game.id, value });
        }
      }
      timeSeries.push({
        gameId: game.id,
        gameTitle: game.title,
        at: game.startedAt,
        samples,
        cumulative: Object.fromEntries(Array.from(running).sort(([left], [right]) => compareText(left, right))),
        gameValue,
        cumulativeGameValue,
      });
    }
  }

  const identityAnalytics = Array.from(identities.values()).map((identity): HistoryIdentityAnalytics => {
    const best = option && identity.metricValues.length ? bestSample(identity.metricValues, option.ranking) : null;
    const total = identity.metricValues.reduce((sum, sample) => sum + sample.value, 0);
    const rollupValue = option ? historyRollupValue(identity.metricValues.map((sample) => sample.value), option.historyRollup) : undefined;
    return {
      identityKey: identity.identityKey,
      entityId: identity.entityId,
      label: identity.label,
      appearances: identity.appearanceIds.size,
      completedAppearances: identity.completedAppearanceIds.size,
      wins: identity.wins,
      draws: identity.draws,
      losses: identity.losses,
      decidedGames: identity.decidedGames,
      currentWinStreak: identity.currentWinStreak,
      longestWinStreak: identity.longestWinStreak,
      metric: best ? {
        games: identity.metricValues.length,
        rollupValue: rollupValue!,
        total,
        average: total / identity.metricValues.length,
        best: best.value,
        bestGameId: best.gameId,
      } : null,
    };
  }).sort((left, right) => compareText(left.label, right.label) || compareText(left.identityKey, right.identityKey));

  const best = option ? bestSample(allMetricSamples, option.ranking) : null;
  const sampleTotal = allMetricSamples.reduce((sum, sample) => sum + sample.value, 0);
  const rollupValue = option ? historyRollupValue(allMetricSamples.map((sample) => sample.value), option.historyRollup) : undefined;
  const metric = option && best ? {
    option,
    sampleCount: allMetricSamples.length,
    rollupValue: rollupValue!,
    total: sampleTotal,
    average: sampleTotal / allMetricSamples.length,
    best: best.value,
    bestGameId: best.gameId,
    bestIdentityKey: best.identityKey ?? null,
  } : null;

  return {
    gameCount: games.length,
    completedGameCount: games.filter((game) => game.isCompleted).length,
    openGameCount: games.filter((game) => !game.isCompleted).length,
    mediaCount: games.reduce((sum, game) => sum + game.mediaCount, 0),
    identities: identityAnalytics,
    metric,
    timeSeries,
    facts: buildFacts(games, identityAnalytics, metric),
  };
}
