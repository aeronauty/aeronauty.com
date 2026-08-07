import { expect, test } from "@playwright/test";
import {
  buildHistoryGameSummaries,
  calculateHistoryAnalytics,
  filterHistoryGames,
  historyCounterCompatibilityFingerprint,
  historyMetricOptions,
  historyRulesetKey,
  historyRulesetOptions,
} from "../lib/tiletally/historyAnalytics";
import type {
  GameLedgerCounter,
  GameLedgerEvent,
  GameLedgerGame,
  GameLedgerMedia,
  GameLedgerParticipant,
  GameLedgerProfile,
  JsonValue,
} from "../lib/tiletally/types";

const OWNER = "owner-1";

function profile(overrides: Partial<GameLedgerProfile> = {}): GameLedgerProfile {
  return {
    version: 1,
    name: "Open tally",
    preset: "freeform",
    participant: { min: 0, max: 32 },
    counters: [{
      id: "points",
      label: "Points",
      scope: "participant",
      value_type: "integer",
      unit: "pts",
      initial: 0,
      aggregation: "sum",
      ranking: "highest",
      input: { mode: "delta", quick_values: [1, 2], allow_negative: true },
      target: null,
    }],
    event_fields: [],
    result_fields: [],
    result: { mode: "manual", allow_draw: true },
    ...overrides,
  };
}

function game(
  id: string,
  startedAt: string,
  definition: GameLedgerProfile = profile(),
  overrides: Partial<GameLedgerGame> = {},
): GameLedgerGame {
  return {
    id,
    owner_id: OWNER,
    profile_id: null,
    profile_version: definition.version,
    title: `Game ${id}`,
    definition,
    status: "complete",
    location: null,
    started_at: startedAt,
    ended_at: new Date(Date.parse(startedAt) + 60 * 60_000).toISOString(),
    created_at: startedAt,
    updated_at: startedAt,
    ...overrides,
  };
}

function participant(
  gameId: string,
  id: string,
  entityId: string | null,
  label: string,
  seat: number,
): GameLedgerParticipant {
  return {
    id,
    owner_id: OWNER,
    game_id: gameId,
    entity_id: entityId,
    label,
    seat,
    metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

function event(
  gameId: string,
  id: string,
  seq: number,
  actorId: string | null,
  values: Record<string, number> = {},
  overrides: Partial<GameLedgerEvent> = {},
): GameLedgerEvent {
  const occurredAt = `2026-01-01T00:00:${String(seq).padStart(2, "0")}.000Z`;
  return {
    id,
    owner_id: OWNER,
    game_id: gameId,
    actor_participant_id: actorId,
    seq,
    event_kind: "score",
    event_data: { values },
    note: null,
    occurred_at: occurredAt,
    voids_event_id: null,
    created_at: occurredAt,
    ...overrides,
  };
}

function resultEvent(
  gameId: string,
  id: string,
  seq: number,
  data: Record<string, JsonValue>,
): GameLedgerEvent {
  return event(gameId, id, seq, null, {}, { event_kind: "result", event_data: data });
}

function media(gameId: string, id: string, kind: "photo" | "video", deleted = false): GameLedgerMedia {
  return {
    id,
    owner_id: OWNER,
    game_id: gameId,
    bucket_id: "gameledger-media",
    storage_path: `${OWNER}/${gameId}/${id}/capture.jpg`,
    media_kind: kind,
    mime_type: kind === "photo" ? "image/jpeg" : "video/mp4",
    byte_size: 100,
    duration_ms: kind === "video" ? 1_000 : null,
    width: null,
    height: null,
    caption: null,
    media_data: {},
    captured_at: "2026-01-01T00:30:00.000Z",
    created_at: "2026-01-01T00:30:00.000Z",
    deleted_at: deleted ? "2026-01-02T00:00:00.000Z" : null,
  };
}

function twoPeople(gameId: string) {
  return [
    participant(gameId, `${gameId}-alice`, "alice", "Alice", 1),
    participant(gameId, `${gameId}-bob`, "bob", "Bob", 2),
  ];
}

test.describe("generic history analytics", () => {
  test("summarises arbitrary aggregation and append-only voids with game counters", () => {
    const definition = profile({
      name: "Mixed measures",
      counters: [
        { id: "points", label: "Points", scope: "participant", initial: 10, aggregation: "sum", ranking: "highest" },
        { id: "best", label: "Best", scope: "participant", initial: 99, aggregation: "min", ranking: "lowest" },
        { id: "round", label: "Round", scope: "game", initial: 0, aggregation: "latest", ranking: "none" },
      ],
    });
    const ledgerGame = game("fold", "2026-01-01T10:00:00.000Z", definition);
    const people = twoPeople(ledgerGame.id);
    const first = event(ledgerGame.id, "first", 1, people[0].id, { points: 5, best: 40, round: 2 });
    const second = event(ledgerGame.id, "second", 2, people[0].id, { points: 7, best: 35, round: 3 });
    const undoSecond = event(ledgerGame.id, "undo-second", 3, null, {}, {
      event_kind: "void",
      voids_event_id: second.id,
      event_data: { voids_event_id: second.id },
    });
    const summaries = buildHistoryGameSummaries({
      games: [ledgerGame],
      participants: people,
      events: [undoSecond, second, first],
      media: [media(ledgerGame.id, "photo", "photo"), media(ledgerGame.id, "deleted", "video", true)],
      activeMediaCounts: [{ game_id: ledgerGame.id, active_media_count: 4 }],
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0].participants[0].counterTotals).toEqual({ points: 15, best: 40 });
    expect(summaries[0].participants[1].counterTotals).toEqual({ points: 10, best: 99 });
    expect(summaries[0].gameCounterTotals).toEqual({ round: 2 });
    expect(summaries[0]).toMatchObject({ mediaCount: 4, photoCount: 1, videoCount: 0, eventCount: 3 });

    const redoUndo = event(ledgerGame.id, "redo-undo", 4, null, {}, {
      event_kind: "void",
      voids_event_id: undoSecond.id,
      event_data: { voids_event_id: undoSecond.id },
    });
    const redone = buildHistoryGameSummaries({
      games: [ledgerGame],
      participants: people,
      events: [first, second, undoSecond, redoUndo],
    });
    expect(redone[0].participants[0].counterTotals).toEqual({ points: 22, best: 35 });
    expect(redone[0].gameCounterTotals).toEqual({ round: 3 });
  });

  test("never infers winners from scores and only accepts a valid explicit result decision", () => {
    const games = [
      game("no-result", "2026-01-01T10:00:00.000Z"),
      game("explicit", "2026-01-02T10:00:00.000Z"),
      game("unknown-winner", "2026-01-03T10:00:00.000Z"),
      game("unknown-outcome", "2026-01-04T10:00:00.000Z"),
    ];
    const participants = games.flatMap((item) => twoPeople(item.id));
    const byGame = new Map(participants.map((item) => [item.id, item]));
    const events = [
      event("no-result", "score-1", 1, "no-result-alice", { points: 100 }),
      event("explicit", "score-2", 1, "explicit-alice", { points: 100 }),
      resultEvent("explicit", "result-2", 2, { _outcome: "completed", _winner_participant_ids: ["explicit-bob"] }),
      resultEvent("unknown-winner", "result-3", 1, { _outcome: "completed", _winner_participant_ids: ["someone-else"] }),
      resultEvent("unknown-outcome", "result-4", 1, { _outcome: "probably", _winner_participant_ids: ["unknown-outcome-alice"] }),
    ];
    expect(byGame.size).toBe(participants.length);
    const summaries = buildHistoryGameSummaries({ games, participants, events });

    expect(summaries[0].result).toBeNull();
    expect(summaries[1].result).toMatchObject({
      outcome: "completed",
      decision: "win",
      winnerParticipantIds: ["explicit-bob"],
      winnerIdentityKeys: ["entity:bob"],
      malformed: false,
    });
    expect(summaries[2].result).toMatchObject({ outcome: null, decision: "none", malformed: true });
    expect(summaries[3].result).toMatchObject({ outcome: null, decision: "none", malformed: true });

    const analytics = calculateHistoryAnalytics(summaries);
    expect(analytics.identities.find((identity) => identity.entityId === "alice")).toMatchObject({ wins: 0, losses: 1 });
    expect(analytics.identities.find((identity) => identity.entityId === "bob")).toMatchObject({ wins: 1, losses: 0 });
  });

  test("counts explicit draws and multiple explicit winners as co-winners", () => {
    const draw = game("draw", "2026-02-01T10:00:00.000Z");
    const coWin = game("co-win", "2026-02-02T10:00:00.000Z");
    const drawPeople = twoPeople(draw.id);
    const coWinPeople = [
      ...twoPeople(coWin.id),
      participant(coWin.id, "co-win-cara", "cara", "Cara", 3),
    ];
    const summaries = buildHistoryGameSummaries({
      games: [draw, coWin],
      participants: [...drawPeople, ...coWinPeople],
      events: [
        resultEvent(draw.id, "draw-result", 1, { _outcome: "draw", _winner_participant_ids: [] }),
        resultEvent(coWin.id, "co-result", 1, {
          _outcome: "completed",
          _winner_participant_ids: ["co-win-bob", "co-win-alice"],
        }),
      ],
    });
    const analytics = calculateHistoryAnalytics(summaries);

    expect(analytics.identities.find((identity) => identity.entityId === "alice")).toMatchObject({ wins: 1, draws: 1, losses: 0 });
    expect(analytics.identities.find((identity) => identity.entityId === "bob")).toMatchObject({ wins: 1, draws: 1, losses: 0 });
    expect(analytics.identities.find((identity) => identity.entityId === "cara")).toMatchObject({ wins: 0, draws: 0, losses: 1 });
  });

  test("keeps incompatible counters separate while combining presentation-only changes", () => {
    const base = profile().counters[0];
    const variants: GameLedgerCounter[] = [
      base,
      { ...base, label: "Score", input: { ...base.input, quick_values: [50] } },
      { ...base, unit: "goals" },
      { ...base, value_type: "decimal" },
      { ...base, aggregation: "latest" },
      { ...base, ranking: "lowest" },
      { ...base, initial: 10 },
      { ...base, scope: "game" },
      { ...base, target: { operator: ">=", value: 61, finish: "suggest" } },
      { ...base, extra: { doubles: true } },
    ];
    const games = variants.map((counter, index) => game(
      `metric-${index}`,
      `2026-03-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      profile({ name: `Profile ${index}`, counters: [counter] }),
    ));
    games.push(game(
      "metric-result-semantics",
      "2026-03-20T10:00:00.000Z",
      profile({
        counters: [base],
        result: {
          mode: "manual",
          allow_draw: true,
          allow_multiple_winners: true,
        } as GameLedgerProfile["result"],
      }),
    ));
    const summaries = buildHistoryGameSummaries({ games, participants: [], events: [] });
    const options = historyMetricOptions(summaries);

    expect(options).toHaveLength(10);
    expect(options.find((option) => option.unit === "pts" && option.valueType === "integer" && option.aggregation === "sum" && option.ranking === "highest" && option.initial === 0 && option.scope === "participant"))
      .toMatchObject({ gameCount: 2 });
    expect(new Set(options.map((option) => option.key)).size).toBe(options.length);
    expect(historyCounterCompatibilityFingerprint(base)).toBe(historyCounterCompatibilityFingerprint(variants[1]));
    expect(historyCounterCompatibilityFingerprint(base)).not.toBe(historyCounterCompatibilityFingerprint(variants[8]));
    expect(historyCounterCompatibilityFingerprint(base)).not.toBe(historyCounterCompatibilityFingerprint(variants[9]));
  });

  test("canonicalizes unknown semantic JSON without treating display copy as a new ruleset", () => {
    const semantic = {
      ...profile(),
      scoring_phase: { overtime_multiplier: 2, thresholds: [5, 10] },
      participant: {
        min: 2,
        max: 2,
        roles: [{ id: "home", label: "Home", seat_bonus: 1 }, { id: "away", label: "Away" }],
        team_size_rule: "exact",
      },
      counters: [{
        ...profile().counters[0],
        bonus_curve: { after: 10, multiplier: 2 },
        input: { ...profile().counters[0].input, rounding_mode: "bankers" },
      }],
      event_fields: [{
        id: "round",
        label: "Round",
        type: "number",
        placeholder: "1",
        score_multiplier: true,
      }],
      result: { ...profile().result, tie_break: "sudden_death" },
    } as unknown as GameLedgerProfile;
    const cosmetic = {
      ...semantic,
      name: "A different title",
      participant: {
        ...(semantic.participant as object),
        roles: [{ id: "home", label: "Host", seat_bonus: 1 }, { id: "away", label: "Visitor" }],
      },
      counters: [{
        ...(semantic.counters[0] as object),
        label: "Score",
        input: { ...(semantic.counters[0].input as object), quick_values: [25, 50] },
      }],
      event_fields: [{
        ...(semantic.event_fields[0] as object),
        label: "Which round?",
        placeholder: "Round number",
      }],
    } as unknown as GameLedgerProfile;
    const reorderedUnknownObjects = {
      ...cosmetic,
      scoring_phase: { thresholds: [5, 10], overtime_multiplier: 2 },
      counters: [{
        ...(cosmetic.counters[0] as object),
        bonus_curve: { multiplier: 2, after: 10 },
      }],
    } as unknown as GameLedgerProfile;

    expect(historyRulesetKey(semantic)).toBe(historyRulesetKey(cosmetic));
    expect(historyRulesetKey(semantic)).toBe(historyRulesetKey(reorderedUnknownObjects));
    expect(historyCounterCompatibilityFingerprint(semantic.counters[0], semantic))
      .toBe(historyCounterCompatibilityFingerprint(cosmetic.counters[0], cosmetic));

    const changes = [
      { ...semantic, scoring_phase: { overtime_multiplier: 3, thresholds: [5, 10] } },
      { ...semantic, participant: { ...semantic.participant!, team_size_rule: "up_to" } },
      { ...semantic, counters: [{ ...(semantic.counters[0] as object), bonus_curve: { after: 11, multiplier: 2 } }] },
      { ...semantic, counters: [{ ...(semantic.counters[0] as object), input: { ...(semantic.counters[0].input as object), rounding_mode: "floor" } }] },
      { ...semantic, event_fields: [{ ...(semantic.event_fields[0] as object), score_multiplier: false }] },
      { ...semantic, result: { ...semantic.result, tie_break: "shared" } },
    ] as unknown as GameLedgerProfile[];
    for (const changed of changes) {
      expect(historyRulesetKey(changed)).not.toBe(historyRulesetKey(semantic));
      expect(historyCounterCompatibilityFingerprint(changed.counters[0], changed))
        .not.toBe(historyCounterCompatibilityFingerprint(semantic.counters[0], semantic));
    }
  });

  test("builds structural ruleset keys and filters by them", () => {
    const first = profile({
      name: "Friday name",
      participant: { min: 2, max: 2, roles: [{ id: "home", label: "Home" }, { id: "away", label: "Away" }] },
      counters: [{
        ...profile().counters[0],
        input: { mode: "delta", quick_values: [1, 5], allow_negative: true },
        target: { operator: ">=", value: 21, finish: "suggest" },
        extra: { doubles: true },
      }],
      event_fields: [{ id: "weather", label: "Weather", type: "text", placeholder: "Sunny", extra: { affects_bonus: true } }],
      result: { mode: "derived", winner_counter_id: "points", allow_draw: true },
      extra: { house_rule: "bounce" },
    });
    const cosmetic = {
      ...first,
      name: "Saturday name",
      counters: [{ ...first.counters[0], input: { ...first.counters[0].input, quick_values: [3, 8] } }],
      event_fields: [{ ...first.event_fields[0], placeholder: "Rainy" }],
    };
    const targetChanged = {
      ...cosmetic,
      counters: [{ ...cosmetic.counters[0], target: { operator: ">=" as const, value: 31, finish: "suggest" as const } }],
    };
    expect(historyRulesetKey(first)).toBe(historyRulesetKey(cosmetic));
    expect(historyRulesetKey(first)).not.toBe(historyRulesetKey(targetChanged));
    expect(historyRulesetKey(first)).not.toBe(historyRulesetKey({ ...first, extra: { house_rule: "exact" } }));
    expect(historyRulesetKey(first)).not.toBe(historyRulesetKey({ ...first, result: { mode: "manual", allow_draw: true } }));
    expect(historyRulesetKey(first)).not.toBe(historyRulesetKey({
      ...first,
      participant: { ...first.participant!, roles: [{ id: "away", label: "Away" }, { id: "home", label: "Home" }] },
    }));
    expect(historyRulesetKey(first)).not.toBe(historyRulesetKey({
      ...first,
      result: { ...first.result, allow_multiple_winners: true } as GameLedgerProfile["result"],
    }));

    const games = [
      game("same-1", "2026-04-01T10:00:00.000Z", first),
      game("same-2", "2026-04-02T10:00:00.000Z", cosmetic),
      game("different", "2026-04-03T10:00:00.000Z", targetChanged),
    ];
    const summaries = buildHistoryGameSummaries({ games, participants: [], events: [] });
    const rulesets = historyRulesetOptions(summaries);
    expect(rulesets).toHaveLength(2);
    expect(rulesets.find((option) => option.key === summaries[0].rulesetKey)).toMatchObject({ gameCount: 2 });
    expect(rulesets.find((option) => option.key === summaries[0].rulesetKey)?.label).toBe("Open tally");
    expect(filterHistoryGames(summaries, { rulesetKeys: [summaries[0].rulesetKey] }).map((item) => item.id))
      .toEqual(["same-1", "same-2"]);
  });

  test("filters exact normalized places, statuses, presets, all entities, dates and recent games", () => {
    const chess = profile({ name: "Chess", preset: "chess", counters: [] });
    const games = [
      game("one", "2026-05-01T09:00:00.000Z", profile(), { location: "  Café   Room " }),
      game("two", "2026-05-02T23:59:59.000Z", profile(), { location: "CAFÉ ROOM" }),
      game("three", "2026-05-03T09:00:00.000Z", chess, { status: "paused", ended_at: null, location: "Café Room Annex" }),
      game("four", "2026-05-04T09:00:00.000Z", profile(), { location: null }),
    ];
    const participants = [
      ...twoPeople("one"),
      participant("two", "two-alice", "alice", "Alice", 1),
      ...twoPeople("three"),
      ...twoPeople("four"),
    ];
    const summaries = buildHistoryGameSummaries({ games, participants, events: [] });

    expect(filterHistoryGames(summaries, { location: "café room" }).map((item) => item.id)).toEqual(["one", "two"]);
    expect(filterHistoryGames(summaries, { location: null }).map((item) => item.id)).toEqual(["four"]);
    expect(filterHistoryGames(summaries, { status: "open" }).map((item) => item.id)).toEqual(["three"]);
    expect(filterHistoryGames(summaries, { status: "completed", preset: "FREEFORM" }).map((item) => item.id)).toEqual(["one", "two", "four"]);
    expect(filterHistoryGames(summaries, { entityIds: ["alice", "bob"] }).map((item) => item.id)).toEqual(["one", "three", "four"]);
    expect(filterHistoryGames(summaries, { dateFrom: "2026-05-02", dateTo: "2026-05-03" }).map((item) => item.id)).toEqual(["two", "three"]);
    expect(filterHistoryGames(summaries, { status: "completed", recent: 2 }).map((item) => item.id)).toEqual(["two", "four"]);
    expect(filterHistoryGames(summaries, { recent: 0 })).toEqual([]);
  });

  test("merges stable entities, never name-merges guests, and can use the current entity label", () => {
    const games = [
      game("old", "2026-06-01T10:00:00.000Z"),
      game("new", "2026-06-02T10:00:00.000Z"),
    ];
    const participants = [
      participant("old", "old-stable", "stable", "Alex", 1),
      participant("new", "new-stable", "stable", "Alexandra", 1),
      participant("old", "old-guest", null, "Guest", 2),
      participant("new", "new-guest", null, "Guest", 2),
    ];
    const summaries = buildHistoryGameSummaries({ games, participants, events: [] });
    const analytics = calculateHistoryAnalytics(summaries);
    const currentNames = calculateHistoryAnalytics(summaries, null, {
      entityLabels: new Map([["stable", "Lex"]]),
    });

    expect(analytics.identities).toHaveLength(3);
    expect(analytics.identities.find((identity) => identity.entityId === "stable")).toMatchObject({
      identityKey: "entity:stable",
      label: "Alexandra",
      appearances: 2,
    });
    expect(analytics.identities.filter((identity) => identity.label === "Guest").map((identity) => identity.identityKey).sort())
      .toEqual(["participant:new-guest", "participant:old-guest"]);
    expect(analytics.identities.filter((identity) => identity.label === "Guest").map((identity) => identity.appearances))
      .toEqual([1, 1]);
    expect(currentNames.identities.find((identity) => identity.entityId === "stable")?.label).toBe("Lex");
    expect(currentNames.identities.filter((identity) => identity.entityId === null).map((identity) => identity.label))
      .toEqual(["Guest", "Guest"]);
    expect(currentNames.facts.find((fact) => fact.kind === "most_appearances")?.text).toContain("Lex");
  });

  test("computes participant totals, averages, best values, W/D/L, streaks and cumulative series", () => {
    const games = Array.from({ length: 6 }, (_, index) => game(
      `series-${index + 1}`,
      `2026-07-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
    ));
    const participants = games.flatMap((item) => twoPeople(item.id));
    const scores = [[10, 5], [8, 7], [6, 6], [2, 9], [5, 5], [4, 3]];
    const events: GameLedgerEvent[] = [];
    games.forEach((item, index) => {
      events.push(event(item.id, `${item.id}-a-score`, 1, `${item.id}-alice`, { points: scores[index][0] }));
      events.push(event(item.id, `${item.id}-b-score`, 2, `${item.id}-bob`, { points: scores[index][1] }));
    });
    events.push(resultEvent("series-1", "result-1", 3, { _outcome: "completed", _winner_participant_ids: ["series-1-alice"] }));
    events.push(resultEvent("series-2", "result-2", 3, { _outcome: "completed", _winner_participant_ids: ["series-2-alice"] }));
    events.push(resultEvent("series-3", "result-3", 3, { _outcome: "draw", _winner_participant_ids: [] }));
    events.push(resultEvent("series-4", "result-4", 3, { _outcome: "completed", _winner_participant_ids: ["series-4-bob"] }));
    events.push(resultEvent("series-5", "result-5", 3, { _outcome: "completed", _winner_participant_ids: ["series-5-alice", "series-5-bob"] }));
    // A malformed result is not a loss and does not break either current streak.
    events.push(resultEvent("series-6", "result-6", 3, { _outcome: "something_else", _winner_participant_ids: ["series-6-alice"] }));
    const summaries = buildHistoryGameSummaries({ games, participants, events });
    const metricOption = historyMetricOptions(summaries)[0];
    const analytics = calculateHistoryAnalytics(summaries, metricOption.key);
    const alice = analytics.identities.find((identity) => identity.entityId === "alice")!;
    const bob = analytics.identities.find((identity) => identity.entityId === "bob")!;

    expect(alice).toMatchObject({ appearances: 6, completedAppearances: 6, wins: 3, draws: 1, losses: 1, currentWinStreak: 1, longestWinStreak: 2 });
    expect(bob).toMatchObject({ appearances: 6, completedAppearances: 6, wins: 2, draws: 1, losses: 2, currentWinStreak: 2, longestWinStreak: 2 });
    expect(alice.metric).toEqual({ games: 6, rollupValue: 35, total: 35, average: 35 / 6, best: 10, bestGameId: "series-1" });
    expect(bob.metric).toEqual({ games: 6, rollupValue: 35, total: 35, average: 35 / 6, best: 9, bestGameId: "series-4" });
    expect(analytics.metric).toMatchObject({ sampleCount: 12, rollupValue: 70, total: 70, average: 70 / 12, best: 10, bestGameId: "series-1", bestIdentityKey: "entity:alice" });
    expect(analytics.timeSeries.map((point) => point.cumulative["entity:alice"])).toEqual([10, 18, 24, 26, 31, 35]);
    expect(analytics.timeSeries.at(-1)?.cumulative).toEqual({ "entity:alice": 35, "entity:bob": 35 });

    const factsAfterReverse = calculateHistoryAnalytics([...summaries].reverse(), metricOption.key).facts;
    expect(factsAfterReverse).toEqual(analytics.facts);
    expect(analytics.facts.map((fact) => fact.kind)).toContain("longest_win_streak");
    expect(analytics.facts.map((fact) => fact.kind)).toContain("metric_leader");
    expect(analytics.facts).toContainEqual(expect.objectContaining({
      kind: "closest_finish",
      gameId: "series-3",
      gameIds: ["series-3"],
      value: 0,
    }));
    expect(analytics.facts).toContainEqual(expect.objectContaining({
      kind: "frequent_lineup",
      identityKeys: ["entity:alice", "entity:bob"],
      sampleSize: 6,
    }));
    expect(analytics.facts).toContainEqual(expect.objectContaining({
      kind: "busiest_month",
      sampleSize: 6,
      value: 6,
    }));
  });

  test("keeps latest game-scoped counters non-additive across history", () => {
    const shared = profile({
      name: "Shared table",
      counters: [{
        id: "rounds",
        label: "Rounds",
        scope: "game",
        value_type: "integer",
        unit: "rounds",
        initial: 0,
        aggregation: "latest",
        ranking: "none",
      }],
      result: { mode: "none" },
    });
    const games = [
      game("shared-1", "2026-08-01T10:00:00.000Z", shared),
      game("shared-2", "2026-08-02T10:00:00.000Z", shared),
    ];
    const participants = [...twoPeople("shared-1"), ...twoPeople("shared-2")];
    const replaced = event("shared-2", "replaced", 1, null, { rounds: 99 });
    const events = [
      event("shared-1", "rounds-1", 1, null, { rounds: 4 }),
      replaced,
      event("shared-2", "rounds-2", 2, null, { rounds: 6 }),
      event("shared-2", "void-replaced", 3, null, {}, {
        event_kind: "void",
        voids_event_id: replaced.id,
        event_data: { voids_event_id: replaced.id },
      }),
    ];
    const summaries = buildHistoryGameSummaries({ games, participants, events });
    const option = historyMetricOptions(summaries)[0];
    const analytics = calculateHistoryAnalytics(summaries, option.key);

    expect(option.scope).toBe("game");
    expect(option.historyRollup).toBe("latest");
    expect(analytics.metric).toMatchObject({ sampleCount: 2, rollupValue: 6, total: 10, average: 5, best: 6, bestGameId: "shared-2", bestIdentityKey: null });
    expect(analytics.identities.every((identity) => identity.metric === null)).toBe(true);
    expect(analytics.timeSeries).toMatchObject([
      { gameId: "shared-1", gameValue: 4, cumulativeGameValue: 4, samples: {}, cumulative: {} },
      { gameId: "shared-2", gameValue: 6, cumulativeGameValue: 6, samples: {}, cumulative: {} },
    ]);
    expect(analytics.facts.map((fact) => fact.kind)).toContain("metric_total");
    expect(analytics.facts.find((fact) => fact.kind === "metric_total")?.text).toContain("latest rounds is 6 rounds");
  });

  test("rolls up min, max and an explicitly additive latest counter deterministically", () => {
    const definition = profile({
      name: "History rollups",
      counters: [
        { id: "low", label: "Low", scope: "game", initial: 99, aggregation: "min", ranking: "lowest" },
        { id: "high", label: "High", scope: "game", initial: 0, aggregation: "max", ranking: "highest" },
        {
          id: "sessions",
          label: "Sessions",
          scope: "game",
          initial: 0,
          aggregation: "latest",
          ranking: "highest",
          extra: { history_rollup: "sum" },
        },
      ],
      result: { mode: "none" },
    });
    const games = [
      game("rollup-1", "2026-09-01T10:00:00.000Z", definition),
      game("rollup-2", "2026-09-02T10:00:00.000Z", definition),
    ];
    const summaries = buildHistoryGameSummaries({
      games,
      participants: [],
      events: [
        event("rollup-1", "values-1", 1, null, { low: 8, high: 5, sessions: 4 }),
        event("rollup-2", "values-2", 1, null, { low: 10, high: 9, sessions: 6 }),
      ],
    });
    const options = historyMetricOptions(summaries);
    const byLabel = new Map(options.map((option) => [option.label, option]));
    const low = calculateHistoryAnalytics(summaries, byLabel.get("Low")!.key);
    const high = calculateHistoryAnalytics(summaries, byLabel.get("High")!.key);
    const sessions = calculateHistoryAnalytics(summaries, byLabel.get("Sessions")!.key);

    expect(byLabel.get("Low")?.historyRollup).toBe("min");
    expect(low.metric?.rollupValue).toBe(8);
    expect(low.timeSeries.map((point) => point.cumulativeGameValue)).toEqual([8, 8]);
    expect(byLabel.get("High")?.historyRollup).toBe("max");
    expect(high.metric?.rollupValue).toBe(9);
    expect(high.timeSeries.map((point) => point.cumulativeGameValue)).toEqual([5, 9]);
    expect(byLabel.get("Sessions")?.historyRollup).toBe("sum");
    expect(sessions.metric).toMatchObject({ rollupValue: 10, total: 10 });
    expect(sessions.timeSeries.map((point) => point.cumulativeGameValue)).toEqual([4, 10]);
  });
});
