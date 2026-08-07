import { expect, test } from "@playwright/test";
import type { RackLetter, RackTile } from "../app/apps/tile-tally/rackModel";
import {
  TABLETOP_JOIN_GAP,
  TABLETOP_MAX_SNAP_SPEED,
  TABLETOP_MOUSE_SNAP_DISTANCE,
  TABLETOP_TILE_HEIGHT,
  TABLETOP_TILE_WIDTH,
  TABLETOP_TOUCH_SNAP_DISTANCE,
  advanceTabletopPhysics,
  applySnap,
  clampBodyToBounds,
  findSnapCandidate,
  getTabletopCandidateWord,
  linkedTileIds,
  moveKinematicBody,
  normalizeTabletopBodies,
  normalizeTabletopLinks,
  placeLooseTiles,
  removeLinksForIds,
  scatterTabletopBodies,
  setBodyVelocity,
  type SnapCandidate,
  type TabletopBody,
  type TabletopBounds,
  type TabletopLink,
} from "../app/apps/tile-tally/tabletopModel";

const roomyBounds: TabletopBounds = { width: 800, height: 500 };

function body(
  id: string,
  overrides: Partial<TabletopBody> = {},
): TabletopBody {
  const firstCharacter = id[0]?.toUpperCase();
  const letter: RackLetter = firstCharacter && /^[A-Z]$/.test(firstCharacter)
    ? firstCharacter as RackLetter
    : "A";
  return {
    id,
    letter,
    rotation: 0,
    vr: 0,
    vx: 0,
    vy: 0,
    x: 100,
    y: 100,
    ...overrides,
  };
}

function rackTile(id: string, letter: RackLetter, blankAs?: TabletopBody["blankAs"]): RackTile {
  return { id, letter, ...(blankAs ? { blankAs } : {}) };
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function expectContained(bodies: readonly TabletopBody[], bounds: TabletopBounds) {
  for (const item of bodies) {
    expect(Number.isFinite(item.x)).toBe(true);
    expect(Number.isFinite(item.y)).toBe(true);
    expect(item.x).toBeGreaterThanOrEqual(0);
    expect(item.y).toBeGreaterThanOrEqual(0);
    expect(item.x + TABLETOP_TILE_WIDTH).toBeLessThanOrEqual(
      Math.max(TABLETOP_TILE_WIDTH, bounds.width),
    );
    expect(item.y + TABLETOP_TILE_HEIGHT).toBeLessThanOrEqual(
      Math.max(TABLETOP_TILE_HEIGHT, bounds.height),
    );
  }
}

function bodiesOverlap(first: TabletopBody, second: TabletopBody) {
  return (
    first.x < second.x + TABLETOP_TILE_WIDTH
    && first.x + TABLETOP_TILE_WIDTH > second.x
    && first.y < second.y + TABLETOP_TILE_HEIGHT
    && first.y + TABLETOP_TILE_HEIGHT > second.y
  );
}

function assertAcyclicLinks(links: readonly TabletopLink[]) {
  const rightByLeft = new Map(links.map((link) => [link.leftId, link.rightId]));
  for (const start of Array.from(rightByLeft.keys())) {
    const visited = new Set<string>();
    let current: string | undefined = start;
    while (current) {
      expect(visited.has(current), `link cycle reached ${current} from ${start}`).toBe(false);
      visited.add(current);
      current = rightByLeft.get(current);
    }
  }
}

test.describe("tabletop bounds and normalization", () => {
  test("clamps bodies to safe bounds without mutating the input", () => {
    const original = body("A", { x: -40, y: 999 });
    const clamped = clampBodyToBounds(original, { width: 200, height: 160 });

    expect(clamped).toMatchObject({ x: 0, y: 160 - TABLETOP_TILE_HEIGHT });
    expect(original).toMatchObject({ x: -40, y: 999 });
    expect(clamped).not.toBe(original);

    const tiny = clampBodyToBounds(body("B", { x: 20, y: 20 }), { width: 1, height: 1 });
    expect(tiny).toMatchObject({ x: 0, y: 0 });
  });

  test("normalizes non-finite and extreme state, removes duplicate ids, and contains every body", () => {
    const normalized = normalizeTabletopBodies([
      body("A", {
        rotation: 900,
        vr: -900,
        vx: 9_000,
        vy: -9_000,
        x: Number.NaN,
        y: Number.POSITIVE_INFINITY,
      }),
      body("A", { x: 80, y: 80 }),
      body("B", { rotation: Number.NaN, vr: Number.NaN, vx: Number.NaN, vy: Number.NaN, x: 999, y: -3 }),
    ], { width: 200, height: 160 });

    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toMatchObject({
      id: "A",
      rotation: 180,
      vr: -360,
      vx: 2_400,
      vy: -2_400,
      x: 0,
      y: 0,
    });
    expect(normalized[1]).toMatchObject({
      id: "B",
      rotation: 0,
      vr: 0,
      vx: 0,
      vy: 0,
      x: 200 - TABLETOP_TILE_WIDTH,
      y: 0,
    });
    expectContained(normalized, { width: 200, height: 160 });
  });
});

test.describe("tabletop links, snapping, and candidate words", () => {
  test("normalizes links into a simple acyclic chain with one neighbour on each side", () => {
    const bodies = [body("A"), body("B"), body("C"), body("D")];
    const normalized = normalizeTabletopLinks([
      { leftId: "A", rightId: "A" },
      { leftId: "missing", rightId: "A" },
      { leftId: "A", rightId: "B" },
      { leftId: "A", rightId: "B" },
      { leftId: "D", rightId: "B" },
      { leftId: "A", rightId: "C" },
      { leftId: "B", rightId: "C" },
      { leftId: "C", rightId: "A" },
    ], bodies);

    expect(normalized).toEqual([
      { leftId: "A", rightId: "B" },
      { leftId: "B", rightId: "C" },
    ]);
    expect(new Set(normalized.map((link) => link.leftId)).size).toBe(normalized.length);
    expect(new Set(normalized.map((link) => link.rightId)).size).toBe(normalized.length);
    assertAcyclicLinks(normalized);
    expect(linkedTileIds(normalized)).toEqual(new Set(["A", "B", "C"]));

    const removed = removeLinksForIds(normalized, ["B"]);
    expect(removed).toEqual([]);
    expect(normalized).toHaveLength(2);
  });

  test("uses exact mouse distance boundaries, including the weighted vertical tolerance", () => {
    const anchor = body("A", { x: 100, y: 100 });
    const desiredX = anchor.x + TABLETOP_TILE_WIDTH + TABLETOP_JOIN_GAP;
    const inside = body("B", { x: desiredX + TABLETOP_MOUSE_SNAP_DISTANCE, y: anchor.y });
    const outside = body("B", { x: desiredX + TABLETOP_MOUSE_SNAP_DISTANCE + 0.01, y: anchor.y });

    expect(findSnapCandidate([anchor, inside], [], "B", "mouse")).toMatchObject({
      anchorId: "A",
      movingId: "B",
      side: "right",
      x: desiredX,
      y: anchor.y,
    });
    expect(findSnapCandidate([anchor, outside], [], "B", "mouse")).toBeNull();

    const verticalLimit = TABLETOP_MOUSE_SNAP_DISTANCE * 0.72;
    expect(findSnapCandidate([
      anchor,
      body("B", { x: desiredX, y: anchor.y + verticalLimit - 0.01 }),
    ], [], "B", "mouse")).not.toBeNull();
    expect(findSnapCandidate([
      anchor,
      body("B", { x: desiredX, y: anchor.y + verticalLimit + 0.01 }),
    ], [], "B", "mouse")).toBeNull();
  });

  test("gives touch a wider catchment while rejecting fast releases", () => {
    const anchor = body("A", { x: 100, y: 100 });
    const desiredX = anchor.x + TABLETOP_TILE_WIDTH + TABLETOP_JOIN_GAP;
    const touchOnlyOffset = (TABLETOP_MOUSE_SNAP_DISTANCE + TABLETOP_TOUCH_SNAP_DISTANCE) / 2;
    const touchOnly = body("B", { x: desiredX + touchOnlyOffset, y: anchor.y });

    expect(findSnapCandidate([anchor, touchOnly], [], "B", "mouse")).toBeNull();
    expect(findSnapCandidate([anchor, touchOnly], [], "B", "touch")).not.toBeNull();
    expect(findSnapCandidate([
      anchor,
      body("B", { x: desiredX, y: anchor.y, vx: TABLETOP_MAX_SNAP_SPEED }),
    ], [], "B", "touch")).not.toBeNull();
    expect(findSnapCandidate([
      anchor,
      body("B", { x: desiredX, y: anchor.y, vx: TABLETOP_MAX_SNAP_SPEED + 0.01 }),
    ], [], "B", "touch")).toBeNull();
  });

  test("does not offer an occupied or physically blocked anchor side", () => {
    const anchor = body("A", { x: 100, y: 100 });
    const desiredX = anchor.x + TABLETOP_TILE_WIDTH + TABLETOP_JOIN_GAP;
    const moving = body("M", { x: desiredX, y: anchor.y });
    const distant = body("D", { x: 500, y: 300 });

    expect(findSnapCandidate(
      [anchor, moving, distant],
      [{ leftId: "A", rightId: "D" }],
      "M",
      "mouse",
    )).toBeNull();

    const blocker = body("B", { x: desiredX, y: anchor.y });
    expect(findSnapCandidate([anchor, moving, blocker], [], "M", "mouse")).toBeNull();
  });

  test("builds a stable ABC chain and derives words in link order rather than selection order", () => {
    let bodies = [
      body("A", { x: 100, y: 100 }),
      body("B", { x: 160, y: 102 }),
      body("C", { x: 220, y: 98 }),
    ];
    let links: TabletopLink[] = [];

    const firstCandidate = findSnapCandidate(bodies, links, "B", "mouse");
    expect(firstCandidate).not.toBeNull();
    ({ bodies, links } = applySnap(bodies, links, firstCandidate as SnapCandidate, roomyBounds));

    const secondCandidate = findSnapCandidate(bodies, links, "C", "mouse");
    expect(secondCandidate).not.toBeNull();
    ({ bodies, links } = applySnap(bodies, links, secondCandidate as SnapCandidate, roomyBounds));

    expect(links).toEqual([
      { leftId: "A", rightId: "B" },
      { leftId: "B", rightId: "C" },
    ]);
    expect(bodies.find((item) => item.id === "B")?.x).toBe(100 + TABLETOP_TILE_WIDTH + TABLETOP_JOIN_GAP);
    expect(bodies.find((item) => item.id === "C")?.x).toBe(100 + 2 * (TABLETOP_TILE_WIDTH + TABLETOP_JOIN_GAP));
    expect(getTabletopCandidateWord(bodies, links, [], "B")).toEqual({
      ok: true,
      source: "joined",
      tileIds: ["A", "B", "C"],
      word: "ABC",
    });
    expect(getTabletopCandidateWord(bodies, links, ["C", "B"], null)).toEqual({
      ok: true,
      source: "selection",
      tileIds: ["B", "C"],
      word: "BC",
    });
    expect(getTabletopCandidateWord(bodies, links, ["A", "C"], null)).toEqual({
      ok: false,
      reason: "selection-not-joined",
      word: null,
    });
  });

  test("requires a join and a blank assignment before returning a candidate", () => {
    const loose = [body("A"), body("B", { x: 300 })];
    expect(getTabletopCandidateWord([], [], [], null)).toEqual({ ok: false, reason: "no-tiles", word: null });
    expect(getTabletopCandidateWord(loose, [], [], "A")).toEqual({
      ok: false,
      reason: "join-required",
      word: null,
    });

    const withBlank = [
      body("blank", { id: "blank", letter: "?", x: 100 }),
      body("A", { x: 100 + TABLETOP_TILE_WIDTH + TABLETOP_JOIN_GAP }),
    ];
    const links = [{ leftId: "blank", rightId: "A" }];
    expect(getTabletopCandidateWord(withBlank, links, [], "A")).toEqual({
      ok: false,
      reason: "unassigned-blank",
      word: null,
    });
    expect(getTabletopCandidateWord(
      withBlank.map((item) => item.id === "blank" ? { ...item, blankAs: "C" as const } : item),
      links,
      [],
      "A",
    )).toMatchObject({ ok: true, tileIds: ["blank", "A"], word: "CA" });
  });

  test("rejects out-of-bounds snaps and keeps a valid edge pair at the exact join gap", () => {
    const bounds = { width: 260, height: 180 };
    const tooCloseToEdge = body("A", { x: 30, y: 50 });
    const moving = body("B", { x: 0, y: 50 });
    expect(findSnapCandidate([tooCloseToEdge, moving], [], "B", "touch", bounds)).toBeNull();

    const anchor = body("A", {
      x: TABLETOP_TILE_WIDTH + TABLETOP_JOIN_GAP,
      y: 50,
    });
    const candidate = findSnapCandidate([anchor, moving], [], "B", "touch", bounds);
    expect(candidate).not.toBeNull();

    const snapped = applySnap([anchor, moving], [], candidate as SnapCandidate, bounds);
    const nextAnchor = snapped.bodies.find((item) => item.id === "A") as TabletopBody;
    const nextMoving = snapped.bodies.find((item) => item.id === "B") as TabletopBody;
    expectContained(snapped.bodies, bounds);
    expect(nextAnchor.x - (nextMoving.x + TABLETOP_TILE_WIDTH)).toBe(TABLETOP_JOIN_GAP);
    expect(bodiesOverlap(nextAnchor, nextMoving)).toBe(false);
    expect(snapped.links).toEqual([{ leftId: "B", rightId: "A" }]);
  });

  test("opens an existing seam and inserts a deliberately placed tile on both sides", () => {
    const step = TABLETOP_TILE_WIDTH + TABLETOP_JOIN_GAP;
    const bodies = [
      body("A", { x: 100, y: 100 }),
      body("B", { x: 100 + step, y: 100 }),
      body("C", { x: 100 + step * 2, y: 100 }),
      body("M", { x: 100 + step, y: 100 }),
    ];
    const links = [
      { leftId: "A", rightId: "B" },
      { leftId: "B", rightId: "C" },
    ];

    const candidate = findSnapCandidate(bodies, links, "M", "mouse", roomyBounds);
    expect(candidate).toMatchObject({
      anchorId: "A",
      movingId: "M",
      replaceLink: { leftId: "A", rightId: "B" },
    });
    const inserted = applySnap(bodies, links, candidate as SnapCandidate, roomyBounds);

    expect(inserted.links).toEqual([
      { leftId: "B", rightId: "C" },
      { leftId: "A", rightId: "M" },
      { leftId: "M", rightId: "B" },
    ]);
    expect(inserted.bodies.find((item) => item.id === "A")?.x).toBe(100);
    expect(inserted.bodies.find((item) => item.id === "M")?.x).toBe(100 + step);
    expect(inserted.bodies.find((item) => item.id === "B")?.x).toBe(100 + step * 2);
    expect(inserted.bodies.find((item) => item.id === "C")?.x).toBe(100 + step * 3);
    expect(getTabletopCandidateWord(inserted.bodies, inserted.links, [], "M")).toMatchObject({
      ok: true,
      word: "AMBC",
    });
  });
});

test.describe("tabletop motion and collisions", () => {
  test("a thrown tile glides, loses speed monotonically, and reaches exact rest", () => {
    const bounds = { width: 2_000, height: 1_000 };
    let current = [body("A", { x: 100, y: 100, vx: 600, vy: 140, vr: 40 })];
    let previousSpeed = Math.hypot(current[0].vx, current[0].vy);
    let moving = true;

    for (let step = 0; step < 120; step += 1) {
      const result = advanceTabletopPhysics(current, bounds, 0.05);
      current = result.bodies;
      moving = result.moving;
      const speed = Math.hypot(current[0].vx, current[0].vy);
      expect(speed).toBeLessThanOrEqual(previousSpeed + 1e-9);
      previousSpeed = speed;
    }

    expect(current[0].x).toBeGreaterThan(100);
    expect(current[0].y).toBeGreaterThan(100);
    expect(current[0]).toMatchObject({ vx: 0, vy: 0, vr: 0 });
    expect(moving).toBe(false);
    expectContained(current, bounds);
  });

  test("bounces from a wall, remains contained, and does not gain speed", () => {
    const bounds = { width: 300, height: 220 };
    const maximumX = bounds.width - TABLETOP_TILE_WIDTH;
    const initialSpeed = 800;
    let result = advanceTabletopPhysics([
      body("A", { x: maximumX - 2, y: 50, vx: initialSpeed }),
    ], bounds, 0.05);

    // The fixed substeps may bounce and continue left during the same elapsed
    // interval, so containment and the reflected velocity are the contract.
    expect(result.bodies[0].x).toBeLessThanOrEqual(maximumX);
    expect(result.bodies[0].vx).toBeLessThan(0);
    expect(Math.abs(result.bodies[0].vx)).toBeLessThan(initialSpeed);

    for (let step = 0; step < 100; step += 1) {
      result = advanceTabletopPhysics(result.bodies, bounds, 0.05);
      expectContained(result.bodies, bounds);
    }
  });

  test("a moderate throw transfers momentum and resolves the collision without overlap", () => {
    const source = [
      body("A", { x: 40, y: 100, vx: 1_200 }),
      body("B", { x: 120, y: 100 }),
    ];
    const result = advanceTabletopPhysics(source, roomyBounds, 0.05);
    const first = result.bodies.find((item) => item.id === "A") as TabletopBody;
    const second = result.bodies.find((item) => item.id === "B") as TabletopBody;

    expect(first.vx).toBeGreaterThan(0);
    expect(first.vx).toBeLessThan(1_200);
    expect(second.vx).toBeGreaterThan(0);
    expect(bodiesOverlap(first, second)).toBe(false);
    expect(source[0]).toMatchObject({ x: 40, vx: 1_200 });
  });

  test("a joined chain moves as one heavier body and preserves its exact spacing", () => {
    const step = TABLETOP_TILE_WIDTH + TABLETOP_JOIN_GAP;
    const source = [
      body("A", { x: 100, y: 100, vx: 600 }),
      body("B", { x: 100 + step, y: 100 }),
    ];
    const result = advanceTabletopPhysics(
      source,
      roomyBounds,
      0.05,
      new Set(),
      [{ leftId: "A", rightId: "B" }],
    );
    const first = result.bodies.find((item) => item.id === "A") as TabletopBody;
    const second = result.bodies.find((item) => item.id === "B") as TabletopBody;

    expect(first.x).toBeGreaterThan(source[0].x);
    expect(second.x - first.x).toBe(step);
    expect(second.y).toBe(first.y);
    expect(second.vx).toBe(first.vx);
    expect(second.vy).toBe(first.vy);
    expect(first.vx).toBeGreaterThan(0);
    expect(first.vx).toBeLessThan(source[0].vx);
  });

  test("a held tile pushes a neighbour while remaining kinematic", () => {
    const source = [
      body("A", { x: 20, y: 100 }),
      body("B", { x: 100, y: 100 }),
    ];
    const moved = moveKinematicBody(source, "A", 60, 100, 500, 0, roomyBounds);
    const first = moved.find((item) => item.id === "A") as TabletopBody;
    const second = moved.find((item) => item.id === "B") as TabletopBody;

    expect(first).toMatchObject({ x: 60, y: 100, vx: 500, vy: 0 });
    expect(second.x).toBeGreaterThanOrEqual(first.x + TABLETOP_TILE_WIDTH);
    expect(second.vx).toBeGreaterThan(0);
    expect(bodiesOverlap(first, second)).toBe(false);
  });

  test("a held tile cannot leave a neighbour overlapped against a wall", () => {
    const bounds = { width: 220, height: 180 };
    const maximumX = bounds.width - TABLETOP_TILE_WIDTH;
    const moved = moveKinematicBody([
      body("A", { x: 80, y: 60 }),
      body("B", { x: maximumX, y: 60 }),
    ], "A", 150, 60, 700, 0, bounds);
    const first = moved.find((item) => item.id === "A") as TabletopBody;
    const second = moved.find((item) => item.id === "B") as TabletopBody;

    expectContained(moved, bounds);
    expect(bodiesOverlap(first, second)).toBe(false);
  });

  test("a maximum-speed throw cannot tunnel through a nearby tile", () => {
    const source = [
      body("A", { x: 10, y: 100, vx: 2_400 }),
      body("B", { x: 75, y: 100 }),
    ];
    const result = advanceTabletopPhysics(source, roomyBounds, 0.05);
    const first = result.bodies.find((item) => item.id === "A") as TabletopBody;
    const second = result.bodies.find((item) => item.id === "B") as TabletopBody;

    expect(first.x).toBeLessThan(second.x);
    expect(second.vx).toBeGreaterThan(0);
    expect(bodiesOverlap(first, second)).toBe(false);
  });

  test("velocity assignment clamps unsafe values and keeps other bodies immutable", () => {
    const source = [body("A"), body("B")];
    const changed = setBodyVelocity(source, "A", 8_000, Number.NaN, -800);
    expect(changed[0]).toMatchObject({ vx: 2_400, vy: 0, vr: -180 });
    expect(changed[1]).toEqual(source[1]);
    expect(changed[1]).not.toBe(source[1]);
    expect(source[0]).toMatchObject({ vx: 0, vy: 0, vr: 0 });
  });
});

test.describe("tabletop scatter and loose placement", () => {
  const tiles: RackTile[] = [
    rackTile("A-1", "A"),
    rackTile("B-1", "B"),
    rackTile("blank-1", "?", "R"),
    rackTile("C-1", "C"),
    rackTile("D-1", "D"),
    rackTile("E-1", "E"),
  ];

  test("scatter is seeded, deterministic, bounded, non-overlapping, and identity preserving", () => {
    const source = placeLooseTiles([], tiles, { width: 640, height: 480 });
    const first = scatterTabletopBodies(source, { width: 640, height: 480 }, null, mulberry32(42), 520);
    const repeated = scatterTabletopBodies(source, { width: 640, height: 480 }, null, mulberry32(42), 520);
    const different = scatterTabletopBodies(source, { width: 640, height: 480 }, null, mulberry32(43), 520);

    expect(first).toEqual(repeated);
    expect(first).not.toEqual(different);
    expect(first.map(({ id, letter, blankAs }) => ({ id, letter, blankAs }))).toEqual(
      source.map(({ id, letter, blankAs }) => ({ id, letter, blankAs })),
    );
    expect(first.some((item, index) => item.x !== source[index].x || item.y !== source[index].y)).toBe(true);
    expect(first.some((item) => item.vx !== 0 || item.vy !== 0 || item.vr !== 0)).toBe(true);
    expectContained(first, { width: 640, height: 480 });
    for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < first.length; secondIndex += 1) {
        expect(bodiesOverlap(first[firstIndex], first[secondIndex])).toBe(false);
      }
    }
    expect(source.every((item) => item.vx === 0 && item.vy === 0 && item.vr === 0)).toBe(true);
  });

  test("selected scatter leaves every unselected body unchanged", () => {
    const source = placeLooseTiles([], tiles, { width: 640, height: 480 });
    const selected = new Set(["B-1", "D-1"]);
    const result = scatterTabletopBodies(source, { width: 640, height: 480 }, selected, mulberry32(9), 400);

    for (let index = 0; index < source.length; index += 1) {
      if (selected.has(source[index].id)) {
        expect(result[index]).not.toEqual(source[index]);
      } else {
        expect(result[index]).toEqual(source[index]);
        expect(result[index]).not.toBe(source[index]);
      }
    }
    expectContained(result, { width: 640, height: 480 });
  });

  test("scatter remains finite and contained even when the board is smaller than a tile", () => {
    const source = placeLooseTiles([], tiles, { width: 640, height: 480 });
    const scattered = scatterTabletopBodies(source, { width: 1, height: 1 }, null, mulberry32(7));
    expect(scattered).toHaveLength(source.length);
    expectContained(scattered, { width: 1, height: 1 });
    expect(scattered.every((item) => item.x === 0 && item.y === 0)).toBe(true);
  });

  test("places new tiles loosely into free cells with no initial motion or overlap", () => {
    const existing = [body("X", { x: 8, y: 8, rotation: 1.2 })];
    const added = [rackTile("A-2", "A"), rackTile("B-2", "B"), rackTile("C-2", "C")];
    const placed = placeLooseTiles(existing, added, { width: 400, height: 260 });

    expect(placed).toHaveLength(4);
    expect(placed[0]).toEqual(existing[0]);
    expect(placed[0]).not.toBe(existing[0]);
    expect(placed.slice(1).map((item) => item.id)).toEqual(["A-2", "B-2", "C-2"]);
    expect(placed.slice(1).every((item) => item.vx === 0 && item.vy === 0 && item.vr === 0)).toBe(true);
    expectContained(placed, { width: 400, height: 260 });
    for (let firstIndex = 0; firstIndex < placed.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < placed.length; secondIndex += 1) {
        expect(bodiesOverlap(placed[firstIndex], placed[secondIndex])).toBe(false);
      }
    }
  });
});
