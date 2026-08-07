export type AlphabetLetter =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "P"
  | "Q"
  | "R"
  | "S"
  | "T"
  | "U"
  | "V"
  | "W"
  | "X"
  | "Y"
  | "Z";

export type RackLetter = AlphabetLetter | "?";

export type RackTile = Readonly<{
  id: string;
  letter: RackLetter;
  blankAs?: AlphabetLetter;
}>;

/** A visually distinct, ordered run of tiles in the workspace. */
export type RackGroup = Readonly<{
  id: string;
  tiles: readonly RackTile[];
}>;

export type GroupedCandidateResult =
  | Readonly<{
      ok: true;
      groupId: string;
      source: "group" | "selection";
      word: string;
    }>
  | Readonly<{
      ok: false;
      groupId?: string;
      reason:
        | "group-required"
        | "no-tiles"
        | "selection-spans-groups"
        | "unassigned-blank";
      word: null;
    }>;

export type RackTileIdFactory = (letter: RackLetter, index: number) => string;
export type RandomSource = () => number;

const ALPHABET_LETTER_PATTERN = /^[A-Z]$/;

export function isAlphabetLetter(value: string): value is AlphabetLetter {
  return ALPHABET_LETTER_PATTERN.test(value);
}

/**
 * Normalizes user input to rack letters. Punctuation and whitespace are ignored.
 * Pass the rack's remaining capacity as maxCount when parsing an addition.
 */
export function parseRackLetters(
  input: string,
  maxCount: number = Number.POSITIVE_INFINITY,
): RackLetter[] {
  const limit = normalizeLimit(maxCount);
  if (limit === 0) {
    return [];
  }

  const letters: RackLetter[] = [];

  for (const character of input.toUpperCase()) {
    if (character === "?" || isAlphabetLetter(character)) {
      letters.push(character);
    }

    if (letters.length === limit) {
      break;
    }
  }

  return letters;
}

/** Creates tiles without owning ID generation, so callers can choose stable IDs. */
export function createRackTiles(
  letters: readonly RackLetter[],
  createId: RackTileIdFactory,
): RackTile[] {
  return letters.map((letter, index) => ({
    id: createId(letter, index),
    letter,
  }));
}

/**
 * Moves a tile to one of the rack's visual insertion slots. Slots are numbered
 * against the original rack from 0 (before the first tile) to length (after the
 * last tile), so moving forward accounts for the removed tile automatically.
 */
export function reorderTileToSlot(
  tiles: readonly RackTile[],
  tileId: string,
  insertionSlot: number,
): RackTile[] {
  const fromIndex = tiles.findIndex((tile) => tile.id === tileId);
  if (fromIndex < 0) {
    return [...tiles];
  }

  const boundedSlot = boundInsertionSlot(insertionSlot, tiles.length, fromIndex);
  const toIndex = boundedSlot > fromIndex ? boundedSlot - 1 : boundedSlot;
  if (toIndex === fromIndex) {
    return [...tiles];
  }

  const reordered = [...tiles];
  const [movedTile] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, movedTile);
  return reordered;
}

export function shuffleRackTiles(
  tiles: readonly RackTile[],
  random: RandomSource = Math.random,
): RackTile[] {
  return shuffledWithChange(tiles, random);
}

/** Shuffles selected tiles among their existing positions only. */
export function shuffleSelectedTiles(
  tiles: readonly RackTile[],
  selectedIds: Iterable<string>,
  random: RandomSource = Math.random,
): RackTile[] {
  const selection = new Set(selectedIds);
  const selectedIndexes: number[] = [];
  const selectedTiles: RackTile[] = [];

  tiles.forEach((tile, index) => {
    if (selection.has(tile.id)) {
      selectedIndexes.push(index);
      selectedTiles.push(tile);
    }
  });

  const shuffledSelection = shuffledWithChange(selectedTiles, random);
  const result = [...tiles];
  selectedIndexes.forEach((rackIndex, selectedIndex) => {
    result[rackIndex] = shuffledSelection[selectedIndex];
  });

  return result;
}

export function removeSelectedTiles(
  tiles: readonly RackTile[],
  selectedIds: Iterable<string>,
): RackTile[] {
  const selection = new Set(selectedIds);
  return tiles.filter((tile) => !selection.has(tile.id));
}

/**
 * Reads the selected tiles in visual order, or the whole rack when nothing is
 * selected. A blank must have blankAs assigned before it can form a candidate.
 */
export function getCandidateWord(
  tiles: readonly RackTile[],
  selectedIds: Iterable<string> = [],
): string | null {
  const selection = new Set(selectedIds);
  const candidateTiles = selection.size
    ? tiles.filter((tile) => selection.has(tile.id))
    : tiles;

  let candidate = "";
  for (const tile of candidateTiles) {
    if (tile.letter === "?") {
      if (!tile.blankAs || !isAlphabetLetter(tile.blankAs)) {
        return null;
      }
      candidate += tile.blankAs;
    } else {
      candidate += tile.letter;
    }
  }

  return candidate;
}

/** Returns every tile in visual group and tile order. */
export function flattenGroups(groups: readonly RackGroup[]): RackTile[] {
  return groups.flatMap((group) => [...group.tiles]);
}

/**
 * Clones the group structure and removes empty groups. Tile objects are safe to
 * share because RackTile is immutable.
 */
export function normalizeGroups(groups: readonly RackGroup[]): RackGroup[] {
  return groups
    .filter((group) => group.tiles.length > 0)
    .map((group) => ({ id: group.id, tiles: [...group.tiles] }));
}

/**
 * Moves one or more tiles into a slot in a destination group. The moving tiles
 * keep their visual order even when their ids were supplied out of order.
 * Target slots are numbered against the destination after moving tiles have
 * been removed, which makes live drag previews stable as the payload moves.
 * A caller may temporarily preserve emptied groups so their return slots stay
 * mounted for the duration of a drag; normalize the committed result.
 */
export function moveTileIdsToGroupSlot(
  groups: readonly RackGroup[],
  movingIds: Iterable<string>,
  targetGroupId: string,
  targetIndex: number,
  preserveEmptyGroupIds: Iterable<string> = [],
): RackGroup[] {
  const normalized = normalizeGroups(groups);
  const targetGroup = normalized.find((group) => group.id === targetGroupId);
  if (!targetGroup) {
    return normalized;
  }

  const movingSet = new Set(movingIds);
  const preservedGroups = new Set(preserveEmptyGroupIds);
  const movingTiles = flattenGroups(normalized).filter((tile) => movingSet.has(tile.id));
  if (movingTiles.length === 0) {
    return normalized;
  }

  // Keep an emptied destination until after insertion, while compacting every
  // other emptied source group.
  const withoutMoving = normalized
    .map((group) => ({
      id: group.id,
      tiles: group.tiles.filter((tile) => !movingSet.has(tile.id)),
    }))
    .filter((group) => group.id === targetGroupId || preservedGroups.has(group.id) || group.tiles.length > 0);

  return withoutMoving.map((group) => {
    if (group.id !== targetGroupId) {
      return { id: group.id, tiles: [...group.tiles] };
    }

    const insertionIndex = boundInsertionSlot(
      targetIndex,
      group.tiles.length,
      group.tiles.length,
    );
    return {
      id: group.id,
      tiles: [
        ...group.tiles.slice(0, insertionIndex),
        ...movingTiles,
        ...group.tiles.slice(insertionIndex),
      ],
    };
  });
}

/**
 * Pulls selected tiles into a new group at the first selected group's position.
 * Selected and unselected tiles each retain their prior visual order.
 */
export function separateSelectedIntoGroup(
  groups: readonly RackGroup[],
  selectedIds: Iterable<string>,
  createGroupId: () => string,
): RackGroup[] {
  const normalized = normalizeGroups(groups);
  const selection = new Set(selectedIds);
  const firstSelectedGroupIndex = normalized.findIndex((group) =>
    group.tiles.some((tile) => selection.has(tile.id)),
  );
  if (firstSelectedGroupIndex < 0) {
    return normalized;
  }

  const selectedTiles = flattenGroups(normalized).filter((tile) => selection.has(tile.id));
  const remainingGroups = normalizeGroups(
    normalized.map((group) => ({
      id: group.id,
      tiles: group.tiles.filter((tile) => !selection.has(tile.id)),
    })),
  );
  const newGroup: RackGroup = {
    id: createGroupId(),
    tiles: selectedTiles,
  };

  return [
    ...remainingGroups.slice(0, firstSelectedGroupIndex),
    newGroup,
    ...remainingGroups.slice(firstSelectedGroupIndex),
  ];
}

/** Joins a group onto its immediate left neighbour, retaining the left id. */
export function joinGroupLeft(
  groups: readonly RackGroup[],
  groupId: string,
): RackGroup[] {
  const normalized = normalizeGroups(groups);
  const groupIndex = normalized.findIndex((group) => group.id === groupId);
  if (groupIndex <= 0) {
    return normalized;
  }

  const leftGroup = normalized[groupIndex - 1];
  const currentGroup = normalized[groupIndex];
  const joined: RackGroup = {
    id: leftGroup.id,
    tiles: [...leftGroup.tiles, ...currentGroup.tiles],
  };

  return [
    ...normalized.slice(0, groupIndex - 1),
    joined,
    ...normalized.slice(groupIndex + 1),
  ];
}

/**
 * Moves a whole group to a visual group insertion slot. Slots are numbered
 * against the original list, from 0 through groups.length.
 */
export function reorderGroup(
  groups: readonly RackGroup[],
  groupId: string,
  insertionSlot: number,
): RackGroup[] {
  const normalized = normalizeGroups(groups);
  const fromIndex = normalized.findIndex((group) => group.id === groupId);
  if (fromIndex < 0) {
    return normalized;
  }

  const boundedSlot = boundInsertionSlot(
    insertionSlot,
    normalized.length,
    fromIndex,
  );
  const toIndex = boundedSlot > fromIndex ? boundedSlot - 1 : boundedSlot;
  if (toIndex === fromIndex) {
    return normalized;
  }

  const reordered = [...normalized];
  const [movedGroup] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, movedGroup);
  return reordered;
}

/** Shuffles all tiles while retaining group ids, boundaries, and sizes. */
export function shuffleAllAcrossGroups(
  groups: readonly RackGroup[],
  random: RandomSource = Math.random,
): RackGroup[] {
  const normalized = normalizeGroups(groups);
  return rebuildGroupsWithTiles(normalized, shuffledWithChange(flattenGroups(normalized), random));
}

/** Shuffles selected tiles among their current positions across all groups. */
export function shuffleSelectedAcrossGroups(
  groups: readonly RackGroup[],
  selectedIds: Iterable<string>,
  random: RandomSource = Math.random,
): RackGroup[] {
  const normalized = normalizeGroups(groups);
  const shuffled = shuffleSelectedTiles(flattenGroups(normalized), selectedIds, random);
  return rebuildGroupsWithTiles(normalized, shuffled);
}

/** Removes tiles by id and compacts groups that become empty. */
export function removeTileIdsFromGroups(
  groups: readonly RackGroup[],
  tileIds: Iterable<string>,
): RackGroup[] {
  const removal = new Set(tileIds);
  return normalizeGroups(
    groups.map((group) => ({
      id: group.id,
      tiles: group.tiles.filter((tile) => !removal.has(tile.id)),
    })),
  );
}

/**
 * Builds the exact candidate represented by a selection or active group.
 * Selections spanning visual groups are rejected instead of concatenated.
 */
export function getGroupedCandidateWord(
  groups: readonly RackGroup[],
  selectedIds: Iterable<string> = [],
  activeGroupId?: string | null,
): GroupedCandidateResult {
  const normalized = normalizeGroups(groups);
  const selection = new Set(selectedIds);
  const selectedGroups = normalized.filter((group) =>
    group.tiles.some((tile) => selection.has(tile.id)),
  );

  let source: "group" | "selection";
  let targetGroup: RackGroup | undefined;
  let candidateTiles: readonly RackTile[];

  if (selectedGroups.length > 1) {
    return { ok: false, reason: "selection-spans-groups", word: null };
  }

  if (selectedGroups.length === 1) {
    source = "selection";
    targetGroup = selectedGroups[0];
    candidateTiles = targetGroup.tiles.filter((tile) => selection.has(tile.id));
  } else {
    source = "group";
    targetGroup = activeGroupId
      ? normalized.find((group) => group.id === activeGroupId)
      : normalized.length === 1
        ? normalized[0]
        : undefined;

    if (!targetGroup) {
      return {
        ok: false,
        reason: normalized.length === 0 ? "no-tiles" : "group-required",
        word: null,
      };
    }
    candidateTiles = targetGroup.tiles;
  }

  if (candidateTiles.length === 0) {
    return { ok: false, groupId: targetGroup.id, reason: "no-tiles", word: null };
  }

  let word = "";
  for (const tile of candidateTiles) {
    if (tile.letter === "?") {
      if (!tile.blankAs || !isAlphabetLetter(tile.blankAs)) {
        return {
          ok: false,
          groupId: targetGroup.id,
          reason: "unassigned-blank",
          word: null,
        };
      }
      word += tile.blankAs;
    } else {
      word += tile.letter;
    }
  }

  return { ok: true, groupId: targetGroup.id, source, word };
}

function rebuildGroupsWithTiles(
  groups: readonly RackGroup[],
  tiles: readonly RackTile[],
): RackGroup[] {
  let offset = 0;
  return groups.map((group) => {
    const nextTiles = tiles.slice(offset, offset + group.tiles.length);
    offset += group.tiles.length;
    return { id: group.id, tiles: nextTiles };
  });
}

function normalizeLimit(maxCount: number): number {
  if (maxCount === Number.POSITIVE_INFINITY) {
    return maxCount;
  }

  if (!Number.isFinite(maxCount) || maxCount <= 0) {
    return 0;
  }

  return Math.floor(maxCount);
}

function boundInsertionSlot(
  insertionSlot: number,
  rackLength: number,
  fallback: number,
): number {
  if (Number.isNaN(insertionSlot)) {
    return fallback;
  }

  return Math.min(rackLength, Math.max(0, Math.trunc(insertionSlot)));
}

function shuffledWithChange<T extends { readonly id: string }>(
  values: readonly T[],
  random: RandomSource,
): T[] {
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, random);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  const hasDistinctIds = new Set(values.map((value) => value.id)).size > 1;
  const orderChanged = shuffled.some(
    (value, index) => value.id !== values[index]?.id,
  );

  if (hasDistinctIds && !orderChanged) {
    shuffled.push(shuffled.shift() as T);
  }

  return shuffled;
}

function randomIndex(maxExclusive: number, random: RandomSource): number {
  const value = random();
  const boundedValue = Number.isFinite(value)
    ? Math.min(Math.max(value, 0), 1 - Number.EPSILON)
    : 0;

  return Math.floor(boundedValue * maxExclusive);
}
