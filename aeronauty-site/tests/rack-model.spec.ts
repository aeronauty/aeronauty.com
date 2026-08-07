import { expect, test } from "@playwright/test";
import {
  createRackTiles,
  flattenGroups,
  getGroupedCandidateWord,
  joinGroupLeft,
  moveTileIdsToGroupSlot,
  normalizeGroups,
  parseRackLetters,
  removeTileIdsFromGroups,
  reorderGroup,
  separateSelectedIntoGroup,
  shuffleAllAcrossGroups,
  shuffleSelectedAcrossGroups,
  type RackGroup,
  type RackLetter,
  type RackTile,
} from "../app/apps/tile-tally/rackModel";

function tiles(letters: RackLetter[], prefix = "tile"): RackTile[] {
  return createRackTiles(letters, (letter, index) => `${prefix}-${letter}-${index}`);
}

function fixture(): RackGroup[] {
  return [
    { id: "group-1", tiles: tiles(["A", "B", "C"], "one") },
    { id: "group-2", tiles: tiles(["D", "E"], "two") },
  ];
}

function letters(groups: readonly RackGroup[]): string {
  return flattenGroups(groups).map((tile) => tile.letter).join("");
}

test.describe("grouped rack model", () => {
  test("normalizes pasted letters and preserves duplicate physical tiles", () => {
    expect(parseRackLetters(" a, a / b ? 9 ")).toEqual(["A", "A", "B", "?"]);
    const created = tiles(["A", "A"]);
    expect(created[0].id).not.toBe(created[1].id);
  });

  test("moves a tile through its group using post-removal insertion slots", () => {
    const groups = fixture();
    const b = groups[0].tiles[1].id;
    const toEnd = moveTileIdsToGroupSlot(groups, [b], "group-1", 2);
    expect(toEnd[0].tiles.map((tile) => tile.letter)).toEqual(["A", "C", "B"]);
    expect(groups[0].tiles.map((tile) => tile.letter)).toEqual(["A", "B", "C"]);
  });

  test("moves a selected block across groups and compacts an empty source", () => {
    const groups = fixture();
    const moving = groups[0].tiles.map((tile) => tile.id);
    const result = moveTileIdsToGroupSlot(groups, moving, "group-2", 1);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("group-2");
    expect(result[0].tiles.map((tile) => tile.letter)).toEqual(["D", "A", "B", "C", "E"]);
  });

  test("can preserve an emptied source group during a live drag preview", () => {
    const groups = fixture();
    const moving = groups[0].tiles.map((tile) => tile.id);
    const preview = moveTileIdsToGroupSlot(groups, moving, "group-2", 1, ["group-1"]);
    expect(preview.map((group) => group.id)).toEqual(["group-1", "group-2"]);
    expect(preview[0].tiles).toEqual([]);
    expect(preview[1].tiles.map((tile) => tile.letter)).toEqual(["D", "A", "B", "C", "E"]);
    expect(normalizeGroups(preview).map((group) => group.id)).toEqual(["group-2"]);
  });

  test("separates non-adjacent selected tiles into one ordered group", () => {
    const groups = fixture();
    const selected = [groups[0].tiles[1].id, groups[1].tiles[1].id];
    const result = separateSelectedIntoGroup(groups, selected, () => "group-new");
    expect(result[0].id).toBe("group-new");
    expect(result[0].tiles.map((tile) => tile.letter)).toEqual(["B", "E"]);
    expect(result.slice(1).map((group) => group.tiles.map((tile) => tile.letter))).toEqual([["A", "C"], ["D"]]);
  });

  test("joins and reorders whole groups without changing internal order", () => {
    const groups = fixture();
    const moved = reorderGroup(groups, "group-2", 0);
    expect(moved.map((group) => group.id)).toEqual(["group-2", "group-1"]);
    expect(moved[0].tiles.map((tile) => tile.letter)).toEqual(["D", "E"]);

    const joined = joinGroupLeft(groups, "group-2");
    expect(joined).toHaveLength(1);
    expect(letters(joined)).toBe("ABCDE");
  });

  test("shuffle all preserves group ids, boundaries, sizes, and the tile multiset", () => {
    const groups = fixture();
    const shuffled = shuffleAllAcrossGroups(groups, () => 0);
    expect(shuffled.map((group) => group.id)).toEqual(["group-1", "group-2"]);
    expect(shuffled.map((group) => group.tiles.length)).toEqual([3, 2]);
    expect(flattenGroups(shuffled).map((tile) => tile.id).sort()).toEqual(
      flattenGroups(groups).map((tile) => tile.id).sort(),
    );
    expect(flattenGroups(shuffled).map((tile) => tile.id)).not.toEqual(
      flattenGroups(groups).map((tile) => tile.id),
    );
  });

  test("shuffle selected leaves every unselected physical position untouched", () => {
    const groups = fixture();
    const selected = [groups[0].tiles[0].id, groups[1].tiles[0].id];
    const shuffled = shuffleSelectedAcrossGroups(groups, selected, () => 0);
    const before = flattenGroups(groups);
    const after = flattenGroups(shuffled);
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBe(before[2]);
    expect(after[4]).toBe(before[4]);
    expect(after[0].id).toBe(before[3].id);
    expect(after[3].id).toBe(before[0].id);
  });

  test("removal compacts empty groups and normalization is immutable", () => {
    const groups = fixture();
    const result = removeTileIdsFromGroups(groups, groups[1].tiles.map((tile) => tile.id));
    expect(result.map((group) => group.id)).toEqual(["group-1"]);
    const normalized = normalizeGroups([{ id: "empty", tiles: [] }, ...groups]);
    expect(normalized.map((group) => group.id)).toEqual(["group-1", "group-2"]);
    expect(normalized).not.toBe(groups);
  });

  test("candidate checking respects groups, selections, and blanks", () => {
    const groups = fixture();
    expect(getGroupedCandidateWord(groups, [], null)).toMatchObject({ ok: false, reason: "group-required" });
    expect(getGroupedCandidateWord(groups, [], "group-2")).toEqual({
      ok: true,
      groupId: "group-2",
      source: "group",
      word: "DE",
    });

    const acrossGroups = [groups[0].tiles[0].id, groups[1].tiles[0].id];
    expect(getGroupedCandidateWord(groups, acrossGroups, "group-1")).toMatchObject({
      ok: false,
      reason: "selection-spans-groups",
    });

    const blankGroups: RackGroup[] = [{
      id: "blank-group",
      tiles: [{ id: "blank", letter: "?" }, { id: "a", letter: "A" }],
    }];
    expect(getGroupedCandidateWord(blankGroups, [], "blank-group")).toMatchObject({
      ok: false,
      reason: "unassigned-blank",
    });
    expect(getGroupedCandidateWord([
      { id: "blank-group", tiles: [{ id: "blank", letter: "?", blankAs: "B" }, { id: "a", letter: "A" }] },
    ], [], "blank-group")).toMatchObject({ ok: true, word: "BA" });
  });
});
