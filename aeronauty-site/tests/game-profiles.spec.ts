import { expect, test } from "@playwright/test";
import {
  counterTotals,
  normaliseGameProfile,
  presetProfile,
  uniqueFieldId,
  validateGameProfile,
  winnerIdsForCounter,
} from "../lib/tiletally/gameProfiles";
import type { GameLedgerEvent, GameLedgerProfile } from "../lib/tiletally/types";

function event(
  seq: number,
  playerId: string | null,
  values: Record<string, number | string | boolean>,
): GameLedgerEvent {
  return {
    id: `event-${seq}`,
    owner_id: "owner",
    game_id: "game",
    actor_participant_id: playerId,
    seq,
    event_kind: "score",
    event_data: { values },
    note: null,
    occurred_at: `2026-08-07T10:00:0${seq}.000Z`,
    voids_event_id: null,
    created_at: `2026-08-07T10:00:0${seq}.000Z`,
  };
}

test.describe("flexible game profiles", () => {
  test("presets are editable data rather than fixed game kinds", () => {
    const cribbage = presetProfile("cribbage");
    expect(cribbage.counters[0]).toMatchObject({
      id: "points",
      target: { operator: ">=", value: 121, finish: "suggest" },
      ranking: "highest",
    });

    cribbage.name = "Harry and Alice's race";
    cribbage.counters[0].target = { operator: ">=", value: 61, finish: "suggest" };

    const fresh = presetProfile("cribbage");
    expect(fresh.name).toBe("Cribbage");
    expect(fresh.counters[0].target?.value).toBe(121);
  });

  test("normalises arbitrary counters and custom typed fields", () => {
    const profile = normaliseGameProfile({
      version: 7,
      name: "Garden Olympics",
      preset: "anything-the-user-wants",
      counters: [
        { id: "rings", label: "Rings", aggregation: "sum", ranking: "highest", unit: "hits" },
        { id: "seconds", label: "Time", aggregation: "latest", ranking: "lowest", unit: "s" },
      ],
      event_fields: [
        { id: "weather", label: "Weather", type: "select", options: ["Sun", "Rain"] },
        { id: "clean", label: "Clean round", type: "boolean" },
      ],
      result_fields: [{ id: "story", label: "What happened?", type: "text" }],
      extra: { house_rules: { bounce_counts: true } },
    });

    expect(profile).toMatchObject({
      version: 7,
      name: "Garden Olympics",
      preset: "anything-the-user-wants",
      extra: { house_rules: { bounce_counts: true } },
    });
    expect(profile.counters.map(({ id }) => id)).toEqual(["rings", "seconds"]);
    expect(profile.event_fields.map(({ type }) => type)).toEqual(["select", "boolean"]);
  });

  test("uses a neutral open tally when a stored definition is missing", () => {
    const profile = normaliseGameProfile(null);
    expect(profile.preset).toBe("freeform");
    expect(profile.counters).toContainEqual(expect.objectContaining({ id: "points" }));
    expect(profile.event_fields).toEqual([]);
  });

  test("derives decimal multi-counter totals from immutable events", () => {
    const profile: GameLedgerProfile = {
      version: 1,
      name: "Triathlon",
      counters: [
        { id: "points", label: "Points", initial: 10, aggregation: "sum", ranking: "highest" },
        { id: "time", label: "Best time", initial: 999, aggregation: "min", ranking: "lowest" },
        { id: "round", label: "Round", initial: 0, aggregation: "latest", ranking: "none" },
      ],
      event_fields: [],
      result_fields: [],
    };
    const totals = counterTotals(profile, ["alice", "harry"], [
      event(3, "alice", { points: -1.25, time: 42.8, round: 2 }),
      event(1, "alice", { points: 2.5, time: 45.1, round: 1 }),
      event(2, "harry", { points: 4, time: 44.2, round: 1 }),
      event(4, null, { points: 100 }),
    ]);

    expect(totals.get("alice")).toEqual({ points: 11.25, time: 42.8, round: 2 });
    expect(totals.get("harry")).toEqual({ points: 14, time: 44.2, round: 1 });
  });

  test("keeps target detection separate from highest, lowest and no-result ranking", () => {
    const totals = new Map([
      ["alice", { points: 121, time: 48, notes: 3 }],
      ["harry", { points: 125, time: 44, notes: 9 }],
    ]);
    expect(winnerIdsForCounter(
      { id: "points", label: "Points", target: { operator: ">=", value: 121, finish: "suggest" }, aggregation: "sum", ranking: "highest" },
      totals,
    )).toEqual(["harry"]);
    expect(winnerIdsForCounter(
      { id: "time", label: "Time", aggregation: "latest", ranking: "lowest" },
      totals,
    )).toEqual(["harry"]);
    expect(winnerIdsForCounter(
      { id: "notes", label: "Notes", aggregation: "sum", ranking: "none" },
      totals,
    )).toEqual([]);
  });

  test("creates stable collision-free field ids", () => {
    expect(uniqueFieldId("Sets won", ["sets_won"])).toBe("sets_won_2");
    expect(uniqueFieldId("  🎲  ", [])).toBe("field");
  });

  test("rejects duplicate ids and invalid derived-result references", () => {
    const profile = presetProfile("custom");
    profile.counters.push({ ...profile.counters[0], label: "Other points" });
    profile.result = { mode: "derived", winner_counter_id: "missing", allow_draw: true };
    expect(() => validateGameProfile(profile)).toThrow(/counter ids must be unique \(points\).*existing counter/);
  });

  test("folds whole-game counters without inventing a participant and ignores voided moments", () => {
    const profile: GameLedgerProfile = {
      version: 1,
      name: "Shared clock",
      participant: { min: 0, max: 4 },
      counters: [
        { id: "round", label: "Round", scope: "game", initial: 0, aggregation: "latest", ranking: "none" },
        { id: "points", label: "Points", scope: "participant", initial: 0, aggregation: "sum", ranking: "highest" },
      ],
      event_fields: [],
      result_fields: [],
      result: { mode: "manual" },
    };
    const scored = event(1, "alice", { round: 2, points: 5 });
    const voidEvent = {
      ...event(2, null, {}),
      id: "void-2",
      event_kind: "void",
      voids_event_id: scored.id,
      event_data: { voids_event_id: scored.id },
    };
    const totals = counterTotals(profile, ["alice"], [scored, voidEvent]);
    expect(totals.get("alice")?.points).toBe(0);
    expect(totals.get("__game__")?.round).toBe(0);

    const redoEvent = {
      ...event(3, null, {}),
      id: "redo-3",
      event_kind: "void",
      voids_event_id: voidEvent.id,
      event_data: { voids_event_id: voidEvent.id },
    };
    const redoneTotals = counterTotals(profile, ["alice"], [scored, voidEvent, redoEvent]);
    expect(redoneTotals.get("alice")?.points).toBe(5);
    expect(redoneTotals.get("__game__")?.round).toBe(2);
  });

  test("never treats root-level result fields as counter values", () => {
    const profile: GameLedgerProfile = {
      version: 1,
      name: "Collision-safe result",
      participant: { min: 1, max: 2 },
      counters: [
        { id: "points", label: "Points", initial: 0, aggregation: "sum", ranking: "highest" },
      ],
      event_fields: [],
      result_fields: [
        { id: "points", label: "Points noted in result", type: "number" },
      ],
      result: { mode: "manual", allow_draw: true },
    };
    const resultEvent: GameLedgerEvent = {
      ...event(2, "alice", {}),
      event_kind: "result",
      event_data: { points: 999, _outcome: "completed" },
    };

    expect(counterTotals(profile, ["alice"], [
      event(1, "alice", { points: 4 }),
      resultEvent,
    ]).get("alice")?.points).toBe(4);
  });
});
