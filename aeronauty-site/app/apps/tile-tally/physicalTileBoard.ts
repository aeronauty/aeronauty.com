import type { RackTile } from "./rackModel";
import {
  TABLETOP_TILE_HEIGHT,
  TABLETOP_TILE_WIDTH,
  advanceTabletopPhysics,
  applySnap,
  findSnapCandidate,
  isLinkedComponentLocked,
  linkedComponentIds,
  lockedComponentIds,
  moveKinematicBody,
  moveKinematicComponent,
  normalizeTabletopBodies,
  normalizeTabletopLinks,
  placeLooseTiles,
  removeLinksForIds,
  rotateTabletopBodies,
  scatterTabletopBodies,
  setLinkedComponentLocked,
  setLockedComponentVelocity,
  straightenTabletopBodies,
  type PhysicsStep,
  type SnapCandidate,
  type TabletopBody,
  type TabletopBounds,
  type TabletopLink,
  type TabletopOrientationMode,
} from "./tabletopModel";

export type PhysicalTileBoardSnapshot = Readonly<{
  bodies: TabletopBody[];
  bounds: TabletopBounds;
  links: TabletopLink[];
  orientationMode: TabletopOrientationMode;
}>;

export type PhysicalTileBoardInitialState = Readonly<{
  bodies?: readonly TabletopBody[];
  bounds?: TabletopBounds;
  links?: readonly TabletopLink[];
  orientationMode?: TabletopOrientationMode;
}>;

export type PhysicalTileDragPlan = Readonly<{
  /** A locked word exposes all of its tile ids; a loose tile exposes only itself. */
  tileIds: string[];
  wasLocked: boolean;
}>;

export type PhysicalTileMove = Readonly<{
  tileId: string;
  vx: number;
  vy: number;
  x: number;
  y: number;
}>;

export type PhysicalTileRelease = Readonly<{
  tileId: string;
  vr?: number;
  vx: number;
  vy: number;
}>;

const DEFAULT_BOUNDS: TabletopBounds = { height: 460, width: 840 };

function cloneLink(link: TabletopLink): TabletopLink {
  return {
    leftId: link.leftId,
    ...(link.locked === true ? { locked: true as const } : {}),
    rightId: link.rightId,
  };
}

function cloneBounds(bounds: TabletopBounds): TabletopBounds {
  return { height: bounds.height, width: bounds.width };
}

function validBounds(bounds: TabletopBounds): TabletopBounds {
  return {
    height: Math.max(TABLETOP_TILE_HEIGHT, Number.isFinite(bounds.height) ? bounds.height : DEFAULT_BOUNDS.height),
    width: Math.max(TABLETOP_TILE_WIDTH, Number.isFinite(bounds.width) ? bounds.width : DEFAULT_BOUNDS.width),
  };
}

/**
 * Platform-neutral state and interaction engine for the physical tile surface.
 *
 * The class deliberately knows nothing about React, pointer events, the DOM,
 * persistence, or animation scheduling. A web, Capacitor, React Native, or
 * native-canvas adapter can translate its own gestures into these operations
 * and render immutable snapshots returned by `snapshot()`.
 */
export class PhysicalTileBoard {
  private bodies: TabletopBody[];

  private bounds: TabletopBounds;

  private links: TabletopLink[];

  private orientationMode: TabletopOrientationMode;

  constructor(initial: PhysicalTileBoardInitialState = {}) {
    this.bounds = validBounds(initial.bounds ?? DEFAULT_BOUNDS);
    this.orientationMode = initial.orientationMode === "free" ? "free" : "upright";
    const normalizedBodies = normalizeTabletopBodies(initial.bodies ?? [], this.bounds);
    this.bodies = this.orientationMode === "upright"
      ? straightenTabletopBodies(normalizedBodies)
      : normalizedBodies;
    this.links = normalizeTabletopLinks(initial.links ?? [], this.bodies);
  }

  snapshot(): PhysicalTileBoardSnapshot {
    return {
      bodies: this.bodies.map((body) => ({ ...body })),
      bounds: cloneBounds(this.bounds),
      links: this.links.map(cloneLink),
      orientationMode: this.orientationMode,
    };
  }

  replace(initial: PhysicalTileBoardInitialState): PhysicalTileBoardSnapshot {
    if (initial.bounds) this.bounds = validBounds(initial.bounds);
    if (initial.orientationMode) this.orientationMode = initial.orientationMode;
    const normalizedBodies = normalizeTabletopBodies(initial.bodies ?? this.bodies, this.bounds);
    this.bodies = this.orientationMode === "upright"
      ? straightenTabletopBodies(normalizedBodies)
      : normalizedBodies;
    this.links = normalizeTabletopLinks(initial.links ?? this.links, this.bodies);
    return this.snapshot();
  }

  setBounds(bounds: TabletopBounds): PhysicalTileBoardSnapshot {
    this.bounds = validBounds(bounds);
    this.bodies = normalizeTabletopBodies(this.bodies, this.bounds);
    this.links = normalizeTabletopLinks(this.links, this.bodies);
    return this.snapshot();
  }

  setOrientationMode(mode: TabletopOrientationMode): PhysicalTileBoardSnapshot {
    this.orientationMode = mode;
    if (mode === "upright") this.bodies = straightenTabletopBodies(this.bodies);
    return this.snapshot();
  }

  straighten(tileIds: Iterable<string> | null = null): PhysicalTileBoardSnapshot {
    this.bodies = straightenTabletopBodies(this.bodies, tileIds);
    return this.snapshot();
  }

  /** Rotates loose tiles in free mode; joined words remain aligned to their seams. */
  rotate(tileId: string, deltaDegrees: number): PhysicalTileBoardSnapshot {
    if (
      this.orientationMode === "upright"
      || linkedComponentIds(this.links, tileId).size > 1
    ) return this.snapshot();
    this.bodies = rotateTabletopBodies(this.bodies, [tileId], deltaDegrees, this.bounds);
    return this.snapshot();
  }

  addTiles(tiles: readonly RackTile[]): PhysicalTileBoardSnapshot {
    const existingIds = new Set(this.bodies.map((body) => body.id));
    const uniqueTiles = tiles.filter((tile) => {
      if (!tile.id || existingIds.has(tile.id)) return false;
      existingIds.add(tile.id);
      return true;
    });
    this.bodies = placeLooseTiles(
      this.bodies,
      uniqueTiles,
      this.bounds,
      this.orientationMode,
    );
    return this.snapshot();
  }

  removeTiles(tileIds: Iterable<string>): PhysicalTileBoardSnapshot {
    const removed = new Set(tileIds);
    this.bodies = this.bodies.filter((body) => !removed.has(body.id)).map((body) => ({ ...body }));
    this.links = removeLinksForIds(this.links, removed).map(cloneLink);
    return this.snapshot();
  }

  clear(): PhysicalTileBoardSnapshot {
    this.bodies = [];
    this.links = [];
    return this.snapshot();
  }

  componentIds(tileId: string): Set<string> {
    return linkedComponentIds(this.links, tileId);
  }

  lockedComponentIds(tileId: string): Set<string> {
    return lockedComponentIds(this.links, tileId);
  }

  isComponentLocked(tileId: string): boolean {
    return isLinkedComponentLocked(this.links, tileId);
  }

  setComponentLocked(tileId: string, locked: boolean): PhysicalTileBoardSnapshot {
    this.links = setLinkedComponentLocked(this.links, tileId, locked);
    return this.snapshot();
  }

  /** Breaks a tile out of a word by removing its left and right seams. */
  breakTile(tileId: string): PhysicalTileBoardSnapshot {
    this.links = removeLinksForIds(this.links, [tileId]).map(cloneLink);
    return this.snapshot();
  }

  breakSeam(leftId: string, rightId: string): PhysicalTileBoardSnapshot {
    this.links = this.links
      .filter((link) => link.leftId !== leftId || link.rightId !== rightId)
      .map(cloneLink);
    return this.snapshot();
  }

  /**
   * Resolves what a press will pick up and detaches any non-locked boundary.
   * Calling this at pointer-down gives every platform adapter identical word
   * lock semantics before it starts producing move samples.
   */
  prepareDrag(tileId: string): PhysicalTileDragPlan {
    if (!this.bodies.some((body) => body.id === tileId)) {
      return { tileIds: [], wasLocked: false };
    }
    const lockedIds = lockedComponentIds(this.links, tileId);
    if (lockedIds.size < 2) {
      this.links = removeLinksForIds(this.links, [tileId]).map(cloneLink);
      return { tileIds: [tileId], wasLocked: false };
    }

    // A malformed or partially locked persisted chain can have an unlocked
    // seam at the rigid segment boundary. Picking up the segment deliberately
    // opens that boundary instead of stretching it.
    this.links = this.links.filter((link) => {
      const leftMoving = lockedIds.has(link.leftId);
      const rightMoving = lockedIds.has(link.rightId);
      return leftMoving === rightMoving;
    }).map(cloneLink);
    return { tileIds: Array.from(lockedIds), wasLocked: true };
  }

  move({ tileId, vx, vy, x, y }: PhysicalTileMove): PhysicalTileBoardSnapshot {
    this.bodies = lockedComponentIds(this.links, tileId).size > 1
      ? moveKinematicComponent(this.bodies, tileId, x, y, vx, vy, this.bounds, this.links)
      : moveKinematicBody(this.bodies, tileId, x, y, vx, vy, this.bounds, this.links);
    return this.snapshot();
  }

  release({ tileId, vr = 0, vx, vy }: PhysicalTileRelease): PhysicalTileBoardSnapshot {
    this.bodies = setLockedComponentVelocity(
      this.bodies,
      this.links,
      tileId,
      vx,
      vy,
      vr,
      this.orientationMode,
    );
    return this.snapshot();
  }

  findSnap(tileId: string, pointerType: string): SnapCandidate | null {
    return findSnapCandidate(this.bodies, this.links, tileId, pointerType, this.bounds);
  }

  snap(candidate: SnapCandidate): PhysicalTileBoardSnapshot {
    const snapped = applySnap(this.bodies, this.links, candidate, this.bounds);
    this.bodies = this.orientationMode === "upright"
      ? straightenTabletopBodies(snapped.bodies)
      : snapped.bodies;
    this.links = snapped.links;
    return this.snapshot();
  }

  scatter(
    selectedIds: Iterable<string> | null = null,
    random: () => number = Math.random,
    impulse = 520,
  ): PhysicalTileBoardSnapshot {
    const selection = selectedIds === null ? null : new Set(selectedIds);
    this.bodies = scatterTabletopBodies(
      this.bodies,
      this.bounds,
      selection,
      random,
      impulse,
      this.orientationMode,
    );
    this.links = selection === null
      ? []
      : removeLinksForIds(this.links, selection).map(cloneLink);
    return this.snapshot();
  }

  step(
    elapsedSeconds: number,
    kinematicIds: ReadonlySet<string> = new Set(),
  ): PhysicsStep & { snapshot: PhysicalTileBoardSnapshot } {
    const result = advanceTabletopPhysics(
      this.bodies,
      this.bounds,
      elapsedSeconds,
      kinematicIds,
      this.links,
      this.orientationMode,
    );
    this.bodies = result.bodies;
    return { ...result, snapshot: this.snapshot() };
  }
}
