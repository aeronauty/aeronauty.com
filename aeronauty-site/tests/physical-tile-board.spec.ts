import { expect, test } from "@playwright/test";
import { PhysicalTileBoard } from "../app/apps/tile-tally/physicalTileBoard";
import type { RackLetter } from "../app/apps/tile-tally/rackModel";
import {
  TABLETOP_JOIN_GAP,
  TABLETOP_TILE_WIDTH,
  advanceTabletopPhysics,
  applySnap,
  findSnapCandidate,
  isLinkedComponentLocked,
  lockedComponentIds,
  moveKinematicComponent,
  normalizeTabletopLinks,
  rotateTabletopBodies,
  scatterTabletopBodies,
  setLinkedComponentLocked,
  straightenTabletopBodies,
  type SnapCandidate,
  type TabletopBody,
  type TabletopLink,
} from "../app/apps/tile-tally/tabletopModel";

const bounds = { height: 500, width: 800 };
const tileStep = TABLETOP_TILE_WIDTH + TABLETOP_JOIN_GAP;

function body(id: string, overrides: Partial<TabletopBody> = {}): TabletopBody {
  const letter = (/^[A-Z]/.test(id) ? id[0] : "A") as RackLetter;
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

function zeroRandom() {
  return 0;
}

test.describe("locked tabletop seams", () => {
  test("normalization preserves true locks while omitting false and invalid lock-like values", () => {
    const bodies = [body("A"), body("B"), body("C")];
    const normalized = normalizeTabletopLinks([
      { leftId: "A", locked: true, rightId: "B" },
      { leftId: "B", rightId: "C" },
    ], bodies);

    expect(normalized).toEqual([
      { leftId: "A", locked: true, rightId: "B" },
      { leftId: "B", rightId: "C" },
    ]);
    expect(Object.hasOwn(normalized[1], "locked")).toBe(false);
  });

  test("locks and unlocks an entire word without mutating the input", () => {
    const links: TabletopLink[] = [
      { leftId: "A", rightId: "B" },
      { leftId: "B", rightId: "C" },
      { leftId: "X", locked: true, rightId: "Y" },
    ];
    const locked = setLinkedComponentLocked(links, "B", true);

    expect(locked).toEqual([
      { leftId: "A", locked: true, rightId: "B" },
      { leftId: "B", locked: true, rightId: "C" },
      { leftId: "X", locked: true, rightId: "Y" },
    ]);
    expect(isLinkedComponentLocked(locked, "A")).toBe(true);
    expect(lockedComponentIds(locked, "C")).toEqual(new Set(["C", "B", "A"]));

    const unlocked = setLinkedComponentLocked(locked, "B", false);
    expect(unlocked.slice(0, 2)).toEqual([
      { leftId: "A", rightId: "B" },
      { leftId: "B", rightId: "C" },
    ]);
    expect(isLinkedComponentLocked(unlocked, "B")).toBe(false);
    expect(links[0]).toEqual({ leftId: "A", rightId: "B" });
  });

  test("inserting into a locked seam transfers the lock to both new seams", () => {
    const bodies = [
      body("A", { x: 100 }),
      body("B", { x: 100 + tileStep }),
      body("M", { x: 100 + tileStep }),
    ];
    const links: TabletopLink[] = [{ leftId: "A", locked: true, rightId: "B" }];
    const candidate = findSnapCandidate(bodies, links, "M", "touch", bounds);

    expect(candidate?.replaceLink).toEqual({ leftId: "A", locked: true, rightId: "B" });
    const snapped = applySnap(bodies, links, candidate as SnapCandidate, bounds);
    expect(snapped.links).toEqual([
      { leftId: "A", locked: true, rightId: "M" },
      { leftId: "M", locked: true, rightId: "B" },
    ]);
    expect(isLinkedComponentLocked(snapped.links, "M")).toBe(true);
  });

  test("moves a locked word as one, preserving spacing and shared velocity", () => {
    const source = [
      body("A", { x: 100 }),
      body("B", { x: 100 + tileStep }),
      body("X", { x: 370 }),
    ];
    const links: TabletopLink[] = [{ leftId: "A", locked: true, rightId: "B" }];
    const moved = moveKinematicComponent(
      source,
      "B",
      300,
      160,
      640,
      90,
      bounds,
      links,
    );
    const first = moved.find((item) => item.id === "A") as TabletopBody;
    const second = moved.find((item) => item.id === "B") as TabletopBody;

    expect(second.x - first.x).toBe(tileStep);
    expect(second.y).toBe(first.y);
    expect(first).toMatchObject({ vx: 640, vy: 90 });
    expect(second).toMatchObject({ x: 300, y: 160, vx: 640, vy: 90 });
    expect(first.rotation).toBe(0);
    expect(source[0]).toMatchObject({ x: 100, y: 100, vx: 0 });
  });

  test("clamps the rigid word at a wall without compressing its seams", () => {
    const source = [
      body("A", { x: 100 }),
      body("B", { x: 100 + tileStep }),
    ];
    const moved = moveKinematicComponent(
      source,
      "B",
      2_000,
      -200,
      400,
      -300,
      bounds,
      [{ leftId: "A", locked: true, rightId: "B" }],
    );
    const first = moved[0];
    const second = moved[1];

    expect(second.x).toBe(bounds.width - TABLETOP_TILE_WIDTH);
    expect(second.x - first.x).toBe(tileStep);
    expect(first.y).toBe(0);
    expect(second.y).toBe(0);
  });
});

test.describe("tabletop orientation policy", () => {
  test("straightens a subset and supports gesture rotation as a pure operation", () => {
    const source = [
      body("A", { rotation: 28, vr: 50 }),
      body("B", { rotation: -14, vr: -20 }),
    ];
    const straightened = straightenTabletopBodies(source, ["A"]);

    expect(straightened[0]).toMatchObject({ rotation: 0, vr: 0 });
    expect(straightened[1]).toMatchObject({ rotation: -14, vr: -20 });
    expect(straightened[1]).not.toBe(source[1]);
    const rotated = rotateTabletopBodies(straightened, ["B"], 34, bounds);
    expect(rotated[1]).toMatchObject({ rotation: 20, vr: 0 });
    expect(source[0]).toMatchObject({ rotation: 28, vr: 50 });
  });

  test("upright physics and scatter never introduce rotation", () => {
    const physics = advanceTabletopPhysics(
      [body("A", { rotation: 31, vr: 90, vx: 250 })],
      bounds,
      0.05,
      new Set(),
      [],
      "upright",
    );
    expect(physics.bodies[0]).toMatchObject({ rotation: 0, vr: 0 });
    expect(physics.bodies[0].x).toBeGreaterThan(100);

    const scattered = scatterTabletopBodies(
      [body("A", { rotation: 25, vr: 80 })],
      bounds,
      null,
      zeroRandom,
      520,
      "upright",
    );
    expect(scattered[0]).toMatchObject({ rotation: 0, vr: 0 });
  });
});

test.describe("PhysicalTileBoard engine", () => {
  test("defaults to upright and returns defensive snapshots", () => {
    const engine = new PhysicalTileBoard({
      bodies: [body("A", { rotation: 17, vr: 40 })],
      bounds,
    });
    const first = engine.snapshot();
    expect(first.orientationMode).toBe("upright");
    expect(first.bodies[0]).toMatchObject({ rotation: 0, vr: 0 });

    first.bodies[0].x = 700;
    expect(engine.snapshot().bodies[0].x).toBe(100);
    expect(engine.setOrientationMode("free").orientationMode).toBe("free");
    expect(engine.rotate("A", 35).bodies[0].rotation).toBe(35);
    expect(engine.setOrientationMode("upright").bodies[0].rotation).toBe(0);
  });

  test("picks up a locked word as one and unlocks it for ordinary tile pickup", () => {
    const engine = new PhysicalTileBoard({
      bodies: [
        body("A", { x: 100 }),
        body("B", { x: 100 + tileStep }),
        body("C", { x: 100 + tileStep * 2 }),
      ],
      bounds,
      links: [
        { leftId: "A", rightId: "B" },
        { leftId: "B", rightId: "C" },
      ],
    });

    engine.setComponentLocked("B", true);
    expect(engine.isComponentLocked("C")).toBe(true);
    expect(engine.prepareDrag("B")).toEqual({
      tileIds: ["B", "A", "C"],
      wasLocked: true,
    });
    const moved = engine.move({ tileId: "B", vx: 500, vy: 20, x: 300, y: 180 });
    expect(moved.bodies.map((item) => item.y)).toEqual([180, 180, 180]);
    expect(moved.bodies[1].x - moved.bodies[0].x).toBe(tileStep);
    expect(moved.bodies[2].x - moved.bodies[1].x).toBe(tileStep);

    engine.setComponentLocked("B", false);
    expect(engine.prepareDrag("B")).toEqual({ tileIds: ["B"], wasLocked: false });
    expect(engine.snapshot().links).toEqual([]);
  });

  test("breaks one tile out and shares throw momentum across a locked word", () => {
    const engine = new PhysicalTileBoard({
      bodies: [
        body("A", { x: 100 }),
        body("B", { x: 100 + tileStep }),
        body("C", { x: 100 + tileStep * 2 }),
      ],
      bounds,
      links: [
        { leftId: "A", locked: true, rightId: "B" },
        { leftId: "B", locked: true, rightId: "C" },
      ],
      orientationMode: "free",
    });

    const released = engine.release({ tileId: "B", vr: 80, vx: 700, vy: -120 });
    expect(released.bodies.every((item) => item.vx === 700 && item.vy === -120)).toBe(true);
    expect(released.bodies.every((item) => item.vr === 0)).toBe(true);

    const broken = engine.breakTile("B");
    expect(broken.links).toEqual([]);
    expect(broken.bodies).toHaveLength(3);
  });
});
