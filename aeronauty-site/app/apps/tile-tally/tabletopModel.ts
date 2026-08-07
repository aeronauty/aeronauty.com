import type { RackTile } from "./rackModel";

export const TABLETOP_TILE_WIDTH = 54;
export const TABLETOP_TILE_HEIGHT = 58;
export const TABLETOP_JOIN_GAP = 4;
export const TABLETOP_MOUSE_SNAP_DISTANCE = 19;
export const TABLETOP_TOUCH_SNAP_DISTANCE = 24;
export const TABLETOP_MAX_SNAP_SPEED = 470;

const WALL_RESTITUTION = 0.38;
const TILE_RESTITUTION = 0.24;
const LINEAR_DRAG = 2.35;
const ANGULAR_DRAG = 2.8;
const SLEEP_SPEED = 7;
const SLEEP_ANGULAR_SPEED = 1.2;

export type TabletopBounds = Readonly<{
  height: number;
  width: number;
}>;

export type TabletopBody = RackTile & {
  rotation: number;
  vr: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

export type TabletopLink = Readonly<{
  leftId: string;
  /** Locked seams stay attached when either neighbouring tile is picked up. */
  locked?: true;
  rightId: string;
}>;

/**
 * Upright mode is the touch-friendly default for consumers of the board engine.
 * The model functions retain `free` defaults so existing callers keep their
 * historical behaviour until they opt in.
 */
export type TabletopOrientationMode = "free" | "upright";

export type SnapCandidate = Readonly<{
  anchorId: string;
  distance: number;
  movingId: string;
  replaceLink?: TabletopLink;
  side: "left" | "right";
  x: number;
  y: number;
}>;

export type TabletopCandidateResult =
  | Readonly<{ ok: true; source: "joined" | "selection"; tileIds: string[]; word: string }>
  | Readonly<{
      ok: false;
      reason: "join-required" | "no-tiles" | "selection-not-joined" | "unassigned-blank";
      word: null;
    }>;

export type PhysicsStep = Readonly<{
  bodies: TabletopBody[];
  moving: boolean;
}>;

type RandomSource = () => number;

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeBounds(bounds: TabletopBounds): TabletopBounds {
  return {
    height: Math.max(TABLETOP_TILE_HEIGHT, finite(bounds.height, TABLETOP_TILE_HEIGHT)),
    width: Math.max(TABLETOP_TILE_WIDTH, finite(bounds.width, TABLETOP_TILE_WIDTH)),
  };
}

function cloneBody(body: TabletopBody): TabletopBody {
  return { ...body };
}

function bodyPositionLimits(body: TabletopBody, bounds: TabletopBounds) {
  const safe = safeBounds(bounds);
  const radians = finite(body.rotation) * Math.PI / 180;
  const visualHalfWidth = Math.abs(Math.cos(radians)) * TABLETOP_TILE_WIDTH / 2
    + Math.abs(Math.sin(radians)) * TABLETOP_TILE_HEIGHT / 2;
  const visualHalfHeight = Math.abs(Math.sin(radians)) * TABLETOP_TILE_WIDTH / 2
    + Math.abs(Math.cos(radians)) * TABLETOP_TILE_HEIGHT / 2;
  const rawInsetX = Math.max(0, visualHalfWidth - TABLETOP_TILE_WIDTH / 2);
  const rawInsetY = Math.max(0, visualHalfHeight - TABLETOP_TILE_HEIGHT / 2);
  const minX = rawInsetX < 1e-9 || rawInsetX * 2 > safe.width - TABLETOP_TILE_WIDTH
    ? 0
    : rawInsetX;
  const minY = rawInsetY < 1e-9 || rawInsetY * 2 > safe.height - TABLETOP_TILE_HEIGHT
    ? 0
    : rawInsetY;
  return {
    maxX: Math.max(minX, safe.width - TABLETOP_TILE_WIDTH - minX),
    maxY: Math.max(minY, safe.height - TABLETOP_TILE_HEIGHT - minY),
    minX,
    minY,
  };
}

export function clampBodyToBounds(body: TabletopBody, bounds: TabletopBounds): TabletopBody {
  const limits = bodyPositionLimits(body, bounds);
  return {
    ...body,
    x: clamp(finite(body.x), limits.minX, limits.maxX),
    y: clamp(finite(body.y), limits.minY, limits.maxY),
  };
}

export function normalizeTabletopBodies(
  bodies: readonly TabletopBody[],
  bounds: TabletopBounds,
): TabletopBody[] {
  const seen = new Set<string>();
  const normalized: TabletopBody[] = [];
  for (const body of bodies) {
    if (!body.id || seen.has(body.id)) continue;
    seen.add(body.id);
    normalized.push(clampBodyToBounds({
      ...body,
      rotation: clamp(finite(body.rotation), -180, 180),
      vr: clamp(finite(body.vr), -360, 360),
      vx: clamp(finite(body.vx), -2_400, 2_400),
      vy: clamp(finite(body.vy), -2_400, 2_400),
    }, bounds));
  }
  return normalized;
}

export function normalizeTabletopLinks(
  links: readonly TabletopLink[],
  bodies: readonly TabletopBody[],
): TabletopLink[] {
  const ids = new Set(bodies.map((body) => body.id));
  const occupiedLeft = new Set<string>();
  const occupiedRight = new Set<string>();
  const seen = new Set<string>();
  const normalized: TabletopLink[] = [];

  for (const link of links) {
    if (
      link.leftId === link.rightId
      || !ids.has(link.leftId)
      || !ids.has(link.rightId)
      || occupiedRight.has(link.leftId)
      || occupiedLeft.has(link.rightId)
    ) continue;
    const key = `${link.leftId}:${link.rightId}`;
    if (seen.has(key)) continue;
    // A joined word is one directed, unbranched line. Rejecting a link whose
    // right-hand tile can already walk back to its left-hand tile prevents a
    // persisted or malformed snapshot from creating a cycle.
    let cursor = link.rightId;
    const walked = new Set<string>();
    let createsCycle = false;
    while (!walked.has(cursor)) {
      if (cursor === link.leftId) {
        createsCycle = true;
        break;
      }
      walked.add(cursor);
      const next = normalized.find((item) => item.leftId === cursor);
      if (!next) break;
      cursor = next.rightId;
    }
    if (createsCycle) continue;
    seen.add(key);
    occupiedRight.add(link.leftId);
    occupiedLeft.add(link.rightId);
    normalized.push({
      leftId: link.leftId,
      ...(link.locked === true ? { locked: true as const } : {}),
      rightId: link.rightId,
    });
  }
  return normalized;
}

export function removeLinksForIds(
  links: readonly TabletopLink[],
  tileIds: Iterable<string>,
): TabletopLink[] {
  const ids = new Set(tileIds);
  return links.filter((link) => !ids.has(link.leftId) && !ids.has(link.rightId));
}

/** Returns the rigid sub-chain connected to a tile through locked seams only. */
export function lockedComponentIds(links: readonly TabletopLink[], seedId: string): Set<string> {
  return linkedComponentIds(links.filter((link) => link.locked === true), seedId);
}

/** True only when the tile belongs to a multi-tile component whose every seam is locked. */
export function isLinkedComponentLocked(links: readonly TabletopLink[], seedId: string): boolean {
  const component = linkedComponentIds(links, seedId);
  if (component.size < 2) return false;
  const componentLinks = links.filter((link) => (
    component.has(link.leftId) && component.has(link.rightId)
  ));
  return componentLinks.length === component.size - 1
    && componentLinks.every((link) => link.locked === true);
}

/** Locks or unlocks every seam in the word/component containing `seedId`. */
export function setLinkedComponentLocked(
  links: readonly TabletopLink[],
  seedId: string,
  locked: boolean,
): TabletopLink[] {
  const component = linkedComponentIds(links, seedId);
  return links.map((link) => {
    if (!component.has(link.leftId) || !component.has(link.rightId)) {
      return {
        leftId: link.leftId,
        ...(link.locked === true ? { locked: true as const } : {}),
        rightId: link.rightId,
      };
    }
    return {
      leftId: link.leftId,
      ...(locked ? { locked: true as const } : {}),
      rightId: link.rightId,
    };
  });
}

function overlapsAt(
  x: number,
  y: number,
  body: TabletopBody,
  padding = 0,
) {
  return (
    x < body.x + TABLETOP_TILE_WIDTH + padding
    && x + TABLETOP_TILE_WIDTH + padding > body.x
    && y < body.y + TABLETOP_TILE_HEIGHT + padding
    && y + TABLETOP_TILE_HEIGHT + padding > body.y
  );
}

function sideOccupied(links: readonly TabletopLink[], tileId: string, side: "left" | "right") {
  return side === "left"
    ? links.some((link) => link.rightId === tileId)
    : links.some((link) => link.leftId === tileId);
}

export function findSnapCandidate(
  bodies: readonly TabletopBody[],
  links: readonly TabletopLink[],
  movingId: string,
  pointerType: string,
  bounds?: TabletopBounds,
): SnapCandidate | null {
  const moving = bodies.find((body) => body.id === movingId);
  if (!moving) return null;

  const threshold = pointerType === "touch"
    ? TABLETOP_TOUCH_SNAP_DISTANCE
    : TABLETOP_MOUSE_SNAP_DISTANCE;
  const movingComponent = linkedComponentIds(links, movingId);
  let best: SnapCandidate | null = null;

  // Dropping over an existing seam is a deliberate insertion gesture. The
  // right-hand portion is opened by one tile width only when the user releases;
  // ordinary collisions with a joined row never alter its topology.
  for (const link of links) {
    if (movingComponent.has(link.leftId) || movingComponent.has(link.rightId)) continue;
    const left = bodies.find((body) => body.id === link.leftId);
    const right = bodies.find((body) => body.id === link.rightId);
    if (!left || !right) continue;
    if (Math.hypot(moving.vx - left.vx, moving.vy - left.vy) > TABLETOP_MAX_SNAP_SPEED) continue;
    const desiredX = left.x + TABLETOP_TILE_WIDTH + TABLETOP_JOIN_GAP;
    const desiredY = (left.y + right.y) / 2;
    const horizontalError = Math.abs(moving.x - desiredX);
    const verticalError = Math.abs(moving.y - desiredY);
    if (horizontalError > threshold || verticalError > threshold * 0.72) continue;
    const rotationError = Math.abs((((moving.rotation - left.rotation) + 180) % 360) - 180);
    if (rotationError > 14) continue;
    if (bounds) {
      const componentSize = linkedComponentIds(links, link.leftId).size + 1;
      const requiredWidth = componentSize * TABLETOP_TILE_WIDTH
        + (componentSize - 1) * TABLETOP_JOIN_GAP;
      if (requiredWidth > safeBounds(bounds).width) continue;
    }
    const seamIds = linkedComponentIds(links, link.leftId);
    const blocked = bodies.some((body) => (
      body.id !== movingId
      && !seamIds.has(body.id)
      && overlapsAt(desiredX, desiredY, body, 1)
    ));
    if (blocked) continue;
    const distance = Math.hypot(horizontalError, verticalError * 1.35);
    if (best && distance >= best.distance) continue;
    best = {
      anchorId: link.leftId,
      distance,
      movingId,
      replaceLink: link,
      side: "right",
      x: desiredX,
      y: desiredY,
    };
  }

  for (const anchor of bodies) {
    if (anchor.id === movingId) continue;
    if (movingComponent.has(anchor.id)) continue;
    if (Math.hypot(moving.vx - anchor.vx, moving.vy - anchor.vy) > TABLETOP_MAX_SNAP_SPEED) continue;
    for (const side of ["left", "right"] as const) {
      if (sideOccupied(links, anchor.id, side)) continue;
      const movingSide = side === "left" ? "right" : "left";
      if (sideOccupied(links, moving.id, movingSide)) continue;
      const desiredX = side === "left"
        ? anchor.x - TABLETOP_TILE_WIDTH - TABLETOP_JOIN_GAP
        : anchor.x + TABLETOP_TILE_WIDTH + TABLETOP_JOIN_GAP;
      const desiredY = anchor.y;
      if (bounds) {
        const safe = safeBounds(bounds);
        if (
          desiredX < 0
          || desiredY < 0
          || desiredX > safe.width - TABLETOP_TILE_WIDTH
          || desiredY > safe.height - TABLETOP_TILE_HEIGHT
        ) continue;
      }
      const horizontalError = Math.abs(moving.x - desiredX);
      const verticalError = Math.abs(moving.y - desiredY);
      if (horizontalError > threshold || verticalError > threshold * 0.72) continue;
      const rotationError = Math.abs((((moving.rotation - anchor.rotation) + 180) % 360) - 180);
      if (rotationError > 14) continue;
      const distance = Math.hypot(horizontalError, verticalError * 1.35);
      if (distance > threshold || (best && distance >= best.distance)) continue;
      const blocked = bodies.some((body) => (
        body.id !== movingId
        && body.id !== anchor.id
        && overlapsAt(desiredX, desiredY, body, 1)
      ));
      if (blocked) continue;
      best = {
        anchorId: anchor.id,
        distance,
        movingId,
        side,
        x: desiredX,
        y: desiredY,
      };
    }
  }
  return best;
}

export function applySnap(
  bodies: readonly TabletopBody[],
  links: readonly TabletopLink[],
  candidate: SnapCandidate,
  bounds: TabletopBounds,
): { bodies: TabletopBody[]; links: TabletopLink[] } {
  const replacing = candidate.replaceLink
    ? links.find((link) => (
      link.leftId === candidate.replaceLink?.leftId
      && link.rightId === candidate.replaceLink?.rightId
    )) ?? null
    : null;
  if (replacing) {
    const outgoing = new Map(links.map((link) => [link.leftId, link.rightId]));
    const shiftedIds = new Set<string>();
    let cursor: string | undefined = replacing.rightId;
    while (cursor && !shiftedIds.has(cursor)) {
      shiftedIds.add(cursor);
      cursor = outgoing.get(cursor);
    }
    const withoutSeam = links.filter((link) => !(
      link.leftId === replacing.leftId && link.rightId === replacing.rightId
    )).filter((link) => link.leftId !== candidate.movingId && link.rightId !== candidate.movingId);
    const candidateLinks = normalizeTabletopLinks([
      ...withoutSeam,
      {
        leftId: replacing.leftId,
        ...(replacing.locked === true ? { locked: true as const } : {}),
        rightId: candidate.movingId,
      },
      {
        leftId: candidate.movingId,
        ...(replacing.locked === true ? { locked: true as const } : {}),
        rightId: replacing.rightId,
      },
    ], bodies);
    const hasBothLinks = candidateLinks.some((link) => (
      link.leftId === replacing.leftId && link.rightId === candidate.movingId
    )) && candidateLinks.some((link) => (
      link.leftId === candidate.movingId && link.rightId === replacing.rightId
    ));
    if (!hasBothLinks) {
      return { bodies: bodies.map(cloneBody), links: normalizeTabletopLinks(links, bodies) };
    }
    const joinedIds = linkedComponentIds(candidateLinks, candidate.movingId);
    const nextBodies = bodies.map((body) => {
      if (body.id === candidate.movingId) {
        return { ...body, rotation: 0, vr: 0, vx: 0, vy: 0, x: candidate.x, y: candidate.y };
      }
      if (joinedIds.has(body.id)) {
        return {
          ...body,
          rotation: 0,
          vr: 0,
          vx: 0,
          vy: 0,
          x: body.x + (shiftedIds.has(body.id) ? TABLETOP_TILE_WIDTH + TABLETOP_JOIN_GAP : 0),
        };
      }
      return cloneBody(body);
    });
    enforceLinkedChains(nextBodies, candidateLinks, bounds);
    return { bodies: nextBodies, links: candidateLinks };
  }

  const leftId = candidate.side === "left" ? candidate.movingId : candidate.anchorId;
  const rightId = candidate.side === "left" ? candidate.anchorId : candidate.movingId;
  const withoutOccupiedSides = links.filter((link) => (
    candidate.side === "left"
      ? link.leftId !== candidate.movingId && link.rightId !== candidate.anchorId
      : link.rightId !== candidate.movingId && link.leftId !== candidate.anchorId
  ));
  const candidateLinks = normalizeTabletopLinks(
    [...withoutOccupiedSides, { leftId, rightId }],
    bodies,
  );
  if (!candidateLinks.some((link) => link.leftId === leftId && link.rightId === rightId)) {
    return { bodies: bodies.map(cloneBody), links: normalizeTabletopLinks(links, bodies) };
  }
  const joinedIds = linkedComponentIds(candidateLinks, candidate.movingId);
  const nextBodies = bodies.map((body) => {
    if (body.id === candidate.movingId) {
      return clampBodyToBounds({
        ...body,
        rotation: 0,
        vr: 0,
        vx: 0,
        vy: 0,
        x: candidate.x,
        y: candidate.y,
      }, bounds);
    }
    if (joinedIds.has(body.id)) {
      return { ...body, rotation: 0, vr: 0, vx: 0, vy: 0 };
    }
    return cloneBody(body);
  });
  enforceLinkedChains(nextBodies, candidateLinks, bounds);
  return {
    bodies: nextBodies,
    links: candidateLinks,
  };
}

export function linkedComponentIds(links: readonly TabletopLink[], seedId: string): Set<string> {
  const result = new Set([seedId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const link of links) {
      if (result.has(link.leftId) && !result.has(link.rightId)) {
        result.add(link.rightId);
        changed = true;
      } else if (result.has(link.rightId) && !result.has(link.leftId)) {
        result.add(link.leftId);
        changed = true;
      }
    }
  }
  return result;
}

function linkedChains(links: readonly TabletopLink[], bodies: readonly TabletopBody[]) {
  const bodyIds = new Set(bodies.map((body) => body.id));
  const incoming = new Map<string, string>();
  const outgoing = new Map<string, string>();
  for (const link of normalizeTabletopLinks(links, bodies)) {
    incoming.set(link.rightId, link.leftId);
    outgoing.set(link.leftId, link.rightId);
  }
  const chains: string[][] = [];
  const visited = new Set<string>();
  for (const id of Array.from(bodyIds)) {
    if (incoming.has(id) || !outgoing.has(id) || visited.has(id)) continue;
    const chain: string[] = [];
    let cursor: string | undefined = id;
    while (cursor && !visited.has(cursor)) {
      chain.push(cursor);
      visited.add(cursor);
      cursor = outgoing.get(cursor);
    }
    if (chain.length > 1) chains.push(chain);
  }
  return chains;
}

function enforceLinkedChains(
  bodies: TabletopBody[],
  links: readonly TabletopLink[],
  bounds: TabletopBounds,
) {
  const byId = new Map(bodies.map((body) => [body.id, body]));
  const safe = safeBounds(bounds);
  const step = TABLETOP_TILE_WIDTH + TABLETOP_JOIN_GAP;
  for (const chain of linkedChains(links, bodies)) {
    const chainBodies = chain.map((id) => byId.get(id)).filter(Boolean) as TabletopBody[];
    if (chainBodies.length < 2) continue;
    const baseXRaw = chainBodies.reduce((sum, body, index) => sum + body.x - index * step, 0)
      / chainBodies.length;
    const maxBaseX = Math.max(0, safe.width - (chainBodies.length * TABLETOP_TILE_WIDTH
      + (chainBodies.length - 1) * TABLETOP_JOIN_GAP));
    const baseX = clamp(baseXRaw, 0, maxBaseX);
    const y = clamp(
      chainBodies.reduce((sum, body) => sum + body.y, 0) / chainBodies.length,
      0,
      Math.max(0, safe.height - TABLETOP_TILE_HEIGHT),
    );
    // A joined row behaves like one heavier object: momentum delivered to one
    // face is shared by every equal-mass tile in the row.
    const vx = chainBodies.reduce((sum, body) => sum + body.vx, 0) / chainBodies.length;
    const vy = chainBodies.reduce((sum, body) => sum + body.vy, 0) / chainBodies.length;
    chainBodies.forEach((body, index) => {
      body.x = baseX + index * step;
      body.y = y;
      body.vx = vx;
      body.vy = vy;
      body.rotation = 0;
      body.vr = 0;
    });
  }
}

function resolvePair(
  first: TabletopBody,
  second: TabletopBody,
  kinematicIds: ReadonlySet<string>,
) {
  const overlapX = Math.min(
    first.x + TABLETOP_TILE_WIDTH,
    second.x + TABLETOP_TILE_WIDTH,
  ) - Math.max(first.x, second.x);
  const overlapY = Math.min(
    first.y + TABLETOP_TILE_HEIGHT,
    second.y + TABLETOP_TILE_HEIGHT,
  ) - Math.max(first.y, second.y);
  if (overlapX <= 0 || overlapY <= 0) return false;

  const firstKinematic = kinematicIds.has(first.id);
  const secondKinematic = kinematicIds.has(second.id);
  if (firstKinematic && secondKinematic) return false;

  const horizontal = overlapX < overlapY;
  const firstCenter = horizontal
    ? first.x + TABLETOP_TILE_WIDTH / 2
    : first.y + TABLETOP_TILE_HEIGHT / 2;
  const secondCenter = horizontal
    ? second.x + TABLETOP_TILE_WIDTH / 2
    : second.y + TABLETOP_TILE_HEIGHT / 2;
  const normal = secondCenter >= firstCenter ? 1 : -1;
  const overlap = horizontal ? overlapX : overlapY;
  const firstVelocity = horizontal ? first.vx : first.vy;
  const secondVelocity = horizontal ? second.vx : second.vy;

  if (firstKinematic) {
    if (horizontal) second.x += normal * overlap;
    else second.y += normal * overlap;
    const incoming = (firstVelocity - secondVelocity) * normal;
    if (incoming > 0) {
      if (horizontal) second.vx += normal * incoming * 0.82;
      else second.vy += normal * incoming * 0.82;
    }
    return true;
  }
  if (secondKinematic) {
    if (horizontal) first.x -= normal * overlap;
    else first.y -= normal * overlap;
    const incoming = (secondVelocity - firstVelocity) * -normal;
    if (incoming > 0) {
      if (horizontal) first.vx -= normal * incoming * 0.82;
      else first.vy -= normal * incoming * 0.82;
    }
    return true;
  }

  if (horizontal) {
    first.x -= normal * overlap / 2;
    second.x += normal * overlap / 2;
  } else {
    first.y -= normal * overlap / 2;
    second.y += normal * overlap / 2;
  }

  const closingSpeed = (firstVelocity - secondVelocity) * normal;
  if (closingSpeed > 0) {
    const impulse = (1 + TILE_RESTITUTION) * closingSpeed / 2;
    if (horizontal) {
      first.vx -= normal * impulse;
      second.vx += normal * impulse;
    } else {
      first.vy -= normal * impulse;
      second.vy += normal * impulse;
    }
  }
  return true;
}

function containBody(body: TabletopBody, bounds: TabletopBounds, bounce: boolean) {
  const limits = bodyPositionLimits(body, bounds);
  if (body.x < limits.minX) {
    body.x = limits.minX;
    if (bounce && body.vx < 0) body.vx *= -WALL_RESTITUTION;
  } else if (body.x > limits.maxX) {
    body.x = limits.maxX;
    if (bounce && body.vx > 0) body.vx *= -WALL_RESTITUTION;
  }
  if (body.y < limits.minY) {
    body.y = limits.minY;
    if (bounce && body.vy < 0) body.vy *= -WALL_RESTITUTION;
  } else if (body.y > limits.maxY) {
    body.y = limits.maxY;
    if (bounce && body.vy > 0) body.vy *= -WALL_RESTITUTION;
  }
}

function resolveAllCollisions(
  bodies: TabletopBody[],
  bounds: TabletopBounds,
  kinematicIds: ReadonlySet<string>,
) {
  for (let iteration = 0; iteration < 4; iteration += 1) {
    let changed = false;
    for (let firstIndex = 0; firstIndex < bodies.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < bodies.length; secondIndex += 1) {
        if (resolvePair(bodies[firstIndex], bodies[secondIndex], kinematicIds)) changed = true;
      }
    }
    bodies.forEach((body) => containBody(body, bounds, false));
    if (!changed) break;
  }
}

function backOutKinematicBody(
  bodies: TabletopBody[],
  movingId: string,
  bounds: TabletopBounds,
) {
  const moving = bodies.find((body) => body.id === movingId);
  if (!moving) return;
  for (let iteration = 0; iteration < bodies.length * 2; iteration += 1) {
    const blocker = bodies.find((body) => body.id !== movingId && overlapsAt(moving.x, moving.y, body));
    if (!blocker) break;
    const overlapX = Math.min(moving.x + TABLETOP_TILE_WIDTH, blocker.x + TABLETOP_TILE_WIDTH)
      - Math.max(moving.x, blocker.x);
    const overlapY = Math.min(moving.y + TABLETOP_TILE_HEIGHT, blocker.y + TABLETOP_TILE_HEIGHT)
      - Math.max(moving.y, blocker.y);
    if (overlapX <= 0 || overlapY <= 0) break;
    if (overlapX < overlapY) {
      const movingCenter = moving.x + TABLETOP_TILE_WIDTH / 2;
      const blockerCenter = blocker.x + TABLETOP_TILE_WIDTH / 2;
      moving.x += movingCenter <= blockerCenter ? -overlapX : overlapX;
      moving.vx = 0;
    } else {
      const movingCenter = moving.y + TABLETOP_TILE_HEIGHT / 2;
      const blockerCenter = blocker.y + TABLETOP_TILE_HEIGHT / 2;
      moving.y += movingCenter <= blockerCenter ? -overlapY : overlapY;
      moving.vy = 0;
    }
    containBody(moving, bounds, false);
  }
}

function componentTranslationLimits(
  bodies: readonly TabletopBody[],
  movingIds: ReadonlySet<string>,
  bounds: TabletopBounds,
) {
  let minimumDx = Number.NEGATIVE_INFINITY;
  let maximumDx = Number.POSITIVE_INFINITY;
  let minimumDy = Number.NEGATIVE_INFINITY;
  let maximumDy = Number.POSITIVE_INFINITY;
  for (const body of bodies) {
    if (!movingIds.has(body.id)) continue;
    const limits = bodyPositionLimits(body, bounds);
    minimumDx = Math.max(minimumDx, limits.minX - body.x);
    maximumDx = Math.min(maximumDx, limits.maxX - body.x);
    minimumDy = Math.max(minimumDy, limits.minY - body.y);
    maximumDy = Math.min(maximumDy, limits.maxY - body.y);
  }
  return { maximumDx, maximumDy, minimumDx, minimumDy };
}

function translateComponent(
  bodies: TabletopBody[],
  movingIds: ReadonlySet<string>,
  requestedDx: number,
  requestedDy: number,
  bounds: TabletopBounds,
) {
  const limits = componentTranslationLimits(bodies, movingIds, bounds);
  const dx = clamp(finite(requestedDx), limits.minimumDx, limits.maximumDx);
  const dy = clamp(finite(requestedDy), limits.minimumDy, limits.maximumDy);
  for (const body of bodies) {
    if (!movingIds.has(body.id)) continue;
    body.x += dx;
    body.y += dy;
  }
  return { dx, dy };
}

/**
 * Backs a rigid held component away from a body pinned against a wall. This is
 * the component equivalent of `backOutKinematicBody` and keeps every seam at
 * its exact spacing while preventing a held word from covering another tile.
 */
function backOutKinematicComponent(
  bodies: TabletopBody[],
  movingIds: ReadonlySet<string>,
  bounds: TabletopBounds,
) {
  for (let iteration = 0; iteration < bodies.length * 3; iteration += 1) {
    let moving: TabletopBody | undefined;
    let blocker: TabletopBody | undefined;
    for (const candidate of bodies) {
      if (!movingIds.has(candidate.id)) continue;
      blocker = bodies.find((body) => (
        !movingIds.has(body.id) && overlapsAt(candidate.x, candidate.y, body)
      ));
      if (blocker) {
        moving = candidate;
        break;
      }
    }
    if (!moving || !blocker) break;

    const overlapX = Math.min(moving.x + TABLETOP_TILE_WIDTH, blocker.x + TABLETOP_TILE_WIDTH)
      - Math.max(moving.x, blocker.x);
    const overlapY = Math.min(moving.y + TABLETOP_TILE_HEIGHT, blocker.y + TABLETOP_TILE_HEIGHT)
      - Math.max(moving.y, blocker.y);
    if (overlapX <= 0 || overlapY <= 0) continue;

    const horizontal = overlapX < overlapY;
    const movingCenter = horizontal
      ? moving.x + TABLETOP_TILE_WIDTH / 2
      : moving.y + TABLETOP_TILE_HEIGHT / 2;
    const blockerCenter = horizontal
      ? blocker.x + TABLETOP_TILE_WIDTH / 2
      : blocker.y + TABLETOP_TILE_HEIGHT / 2;
    const direction = movingCenter <= blockerCenter ? -1 : 1;
    const translated = translateComponent(
      bodies,
      movingIds,
      horizontal ? direction * overlapX : 0,
      horizontal ? 0 : direction * overlapY,
      bounds,
    );
    for (const body of bodies) {
      if (!movingIds.has(body.id)) continue;
      if (horizontal) body.vx = 0;
      else body.vy = 0;
    }
    if (Math.abs(translated.dx) < 1e-9 && Math.abs(translated.dy) < 1e-9) break;
  }
}

export function moveKinematicBody(
  source: readonly TabletopBody[],
  movingId: string,
  x: number,
  y: number,
  vx: number,
  vy: number,
  bounds: TabletopBounds,
  links: readonly TabletopLink[] = [],
): TabletopBody[] {
  const bodies = source.map(cloneBody);
  const moving = bodies.find((body) => body.id === movingId);
  if (!moving) return bodies;
  moving.x = finite(x);
  moving.y = finite(y);
  moving.vx = clamp(finite(vx), -2_400, 2_400);
  moving.vy = clamp(finite(vy), -2_400, 2_400);
  containBody(moving, bounds, false);
  resolveAllCollisions(bodies, bounds, new Set([movingId]));
  backOutKinematicBody(bodies, movingId, bounds);
  enforceLinkedChains(bodies, links, bounds);
  return bodies;
}

/**
 * Moves the locked seam-component containing `movingId` as one rigid held body.
 * Relative tile positions are translated together, then ordinary loose bodies
 * are pushed out of its path. An unlocked/single tile falls back to the
 * established single-body behaviour.
 */
export function moveKinematicComponent(
  source: readonly TabletopBody[],
  movingId: string,
  x: number,
  y: number,
  vx: number,
  vy: number,
  bounds: TabletopBounds,
  links: readonly TabletopLink[] = [],
): TabletopBody[] {
  const movingIds = lockedComponentIds(links, movingId);
  if (movingIds.size < 2) {
    return moveKinematicBody(source, movingId, x, y, vx, vy, bounds, links);
  }

  const bodies = source.map(cloneBody);
  const moving = bodies.find((body) => body.id === movingId);
  if (!moving) return bodies;
  const requestedDx = finite(x) - moving.x;
  const requestedDy = finite(y) - moving.y;
  translateComponent(bodies, movingIds, requestedDx, requestedDy, bounds);
  const safeVx = clamp(finite(vx), -2_400, 2_400);
  const safeVy = clamp(finite(vy), -2_400, 2_400);
  for (const body of bodies) {
    if (!movingIds.has(body.id)) continue;
    body.vx = safeVx;
    body.vy = safeVy;
    body.rotation = 0;
    body.vr = 0;
  }
  resolveAllCollisions(bodies, bounds, movingIds);
  enforceLinkedChains(bodies, links, bounds);
  resolveAllCollisions(bodies, bounds, movingIds);
  backOutKinematicComponent(bodies, movingIds, bounds);
  enforceLinkedChains(bodies, links, bounds);
  return bodies;
}

/** Sets a shared release velocity on every tile joined through locked seams. */
export function setLockedComponentVelocity(
  source: readonly TabletopBody[],
  links: readonly TabletopLink[],
  tileId: string,
  vx: number,
  vy: number,
  vr: number,
  orientationMode: TabletopOrientationMode = "free",
): TabletopBody[] {
  const component = lockedComponentIds(links, tileId);
  const linked = component.size > 1;
  const safeVx = clamp(finite(vx), -2_400, 2_400);
  const safeVy = clamp(finite(vy), -2_400, 2_400);
  const safeVr = orientationMode === "upright" || linked
    ? 0
    : clamp(finite(vr), -180, 180);
  return source.map((body) => component.has(body.id)
    ? {
        ...body,
        rotation: orientationMode === "upright" || linked ? 0 : body.rotation,
        vr: safeVr,
        vx: safeVx,
        vy: safeVy,
      }
    : cloneBody(body));
}

export function advanceTabletopPhysics(
  source: readonly TabletopBody[],
  bounds: TabletopBounds,
  elapsedSeconds: number,
  kinematicIds: ReadonlySet<string> = new Set(),
  links: readonly TabletopLink[] = [],
  orientationMode: TabletopOrientationMode = "free",
): PhysicsStep {
  const elapsed = clamp(finite(elapsedSeconds), 0, 0.05);
  const bodies = source.map((body) => orientationMode === "upright"
    ? { ...body, rotation: 0, vr: 0 }
    : cloneBody(body));
  const substepCount = Math.max(1, Math.ceil(elapsed / (1 / 120)));
  const dt = substepCount ? elapsed / substepCount : 0;
  for (let step = 0; step < substepCount; step += 1) {
    for (const body of bodies) {
      if (kinematicIds.has(body.id)) continue;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      if (orientationMode === "upright") {
        body.rotation = 0;
        body.vr = 0;
      } else {
        body.rotation = ((body.rotation + body.vr * dt + 180) % 360) - 180;
      }
      containBody(body, bounds, true);
    }

    resolveAllCollisions(bodies, bounds, kinematicIds);
    enforceLinkedChains(bodies, links, bounds);
    resolveAllCollisions(bodies, bounds, kinematicIds);
    enforceLinkedChains(bodies, links, bounds);
    const linearFactor = Math.exp(-LINEAR_DRAG * dt);
    const angularFactor = Math.exp(-ANGULAR_DRAG * dt);
    for (const body of bodies) {
      if (kinematicIds.has(body.id)) continue;
      body.vx *= linearFactor;
      body.vy *= linearFactor;
      body.vr *= angularFactor;
    }
  }
  let moving = false;
  for (const body of bodies) {
    if (kinematicIds.has(body.id)) continue;
    if (Math.hypot(body.vx, body.vy) < SLEEP_SPEED) {
      body.vx = 0;
      body.vy = 0;
    }
    if (Math.abs(body.vr) < SLEEP_ANGULAR_SPEED) body.vr = 0;
    if (body.vx || body.vy || body.vr) moving = true;
  }
  return { bodies, moving };
}

export function setBodyVelocity(
  source: readonly TabletopBody[],
  tileId: string,
  vx: number,
  vy: number,
  vr: number,
): TabletopBody[] {
  return source.map((body) => body.id === tileId
    ? {
        ...body,
        vr: clamp(finite(vr), -180, 180),
        vx: clamp(finite(vx), -2_400, 2_400),
        vy: clamp(finite(vy), -2_400, 2_400),
      }
    : cloneBody(body));
}

/** Stops spin and returns either all tiles or a chosen subset to reading orientation. */
export function straightenTabletopBodies(
  source: readonly TabletopBody[],
  tileIds: Iterable<string> | null = null,
): TabletopBody[] {
  const selected = tileIds === null ? null : new Set(tileIds);
  return source.map((body) => selected === null || selected.has(body.id)
    ? { ...body, rotation: 0, vr: 0 }
    : cloneBody(body));
}

/**
 * Applies a gesture-derived rotation delta to loose tiles. UI layers can feed
 * this from a two-pointer twist without coupling the physics model to the DOM.
 */
export function rotateTabletopBodies(
  source: readonly TabletopBody[],
  tileIds: Iterable<string>,
  deltaDegrees: number,
  bounds: TabletopBounds,
): TabletopBody[] {
  const selected = new Set(tileIds);
  const delta = finite(deltaDegrees);
  return source.map((body) => {
    if (!selected.has(body.id)) return cloneBody(body);
    const rotation = ((finite(body.rotation) + delta + 180) % 360 + 360) % 360 - 180;
    return clampBodyToBounds({ ...body, rotation, vr: 0 }, bounds);
  });
}

function shuffledIndexes(length: number, random: RandomSource) {
  const indexes = Array.from({ length }, (_value, index) => index);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const target = Math.floor(clamp(random(), 0, 0.999999) * (index + 1));
    [indexes[index], indexes[target]] = [indexes[target], indexes[index]];
  }
  return indexes;
}

export function scatterTabletopBodies(
  source: readonly TabletopBody[],
  bounds: TabletopBounds,
  selectedIds: Iterable<string> | null = null,
  random: RandomSource = Math.random,
  impulse = 520,
  orientationMode: TabletopOrientationMode = "free",
): TabletopBody[] {
  const safe = safeBounds(bounds);
  const selected = selectedIds ? new Set(selectedIds) : null;
  const movingBodies = selected ? source.filter((body) => selected.has(body.id)) : [...source];
  if (!movingBodies.length) return source.map(cloneBody);

  const margin = 10;
  const cellWidth = TABLETOP_TILE_WIDTH + 14;
  const cellHeight = TABLETOP_TILE_HEIGHT + 14;
  const columns = Math.max(1, Math.floor((safe.width - margin * 2 + 14) / cellWidth));
  const rows = Math.max(1, Math.floor((safe.height - margin * 2 + 14) / cellHeight));
  const availableHeight = Math.max(0, safe.height - margin * 2 - TABLETOP_TILE_HEIGHT);
  const rowStep = rows <= 1 ? 0 : Math.min(cellHeight, availableHeight / (rows - 1));
  const stationary = selected ? source.filter((body) => !selected.has(body.id)) : [];
  const allSlots = shuffledIndexes(columns * rows, random).filter((slot) => {
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    const x = margin + column * cellWidth;
    const y = margin + row * rowStep;
    return !stationary.some((body) => overlapsAt(x, y, body, 4));
  });
  let movingIndex = 0;

  return source.map((body) => {
    if (selected && !selected.has(body.id)) return cloneBody(body);
    const slot = allSlots[movingIndex];
    movingIndex += 1;
    const angle = random() * Math.PI * 2;
    const speed = impulse * (0.42 + random() * 0.58);
    // If the physical surface cannot hold another non-overlapping cell, keep
    // this tile at its valid pose and impart momentum there. Clamping an
    // invented out-of-grid slot would stack several tiles on the bottom wall.
    if (slot === undefined) {
      return clampBodyToBounds({
        ...body,
        rotation: orientationMode === "upright" ? 0 : -13 + random() * 26,
        vr: orientationMode === "upright" ? 0 : -85 + random() * 170,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
      }, safe);
    }
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    return clampBodyToBounds({
      ...body,
      rotation: orientationMode === "upright" ? 0 : -13 + random() * 26,
      vr: orientationMode === "upright" ? 0 : -85 + random() * 170,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      x: margin + column * cellWidth + (random() - 0.5) * 6,
      y: margin + row * rowStep + (random() - 0.5) * 6,
    }, safe);
  });
}

export function placeLooseTiles(
  existing: readonly TabletopBody[],
  tiles: readonly RackTile[],
  bounds: TabletopBounds,
  orientationMode: TabletopOrientationMode = "free",
): TabletopBody[] {
  const safe = safeBounds(bounds);
  const result = existing.map(cloneBody);
  const gapX = 17;
  const gapY = 15;
  const stepX = TABLETOP_TILE_WIDTH + gapX;
  const stepY = TABLETOP_TILE_HEIGHT + gapY;
  const columns = Math.max(1, Math.floor((safe.width - 16 + gapX) / stepX));
  const rows = Math.max(1, Math.floor((safe.height - 16 + gapY) / stepY));
  const capacity = Math.max(1, columns * rows);
  let cursor = 0;

  for (const tile of tiles) {
    let chosenSlot: number | null = null;
    let leastCrowdedSlot = cursor % capacity;
    let leastOverlapCount = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < capacity; attempt += 1) {
      const slot = (cursor + attempt) % capacity;
      const column = slot % columns;
      const row = Math.floor(slot / columns);
      const x = 8 + column * stepX;
      const y = 8 + row * stepY;
      const overlapCount = result.filter((body) => overlapsAt(x, y, body, 4)).length;
      if (overlapCount === 0) {
        chosenSlot = slot;
        break;
      }
      if (overlapCount < leastOverlapCount) {
        leastOverlapCount = overlapCount;
        leastCrowdedSlot = slot;
      }
    }
    const slot = chosenSlot ?? leastCrowdedSlot;
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    const x = 8 + column * stepX;
    const y = 8 + row * stepY;
    result.push(clampBodyToBounds({
      ...tile,
      rotation: orientationMode === "upright" ? 0 : ((cursor % 5) - 2) * 0.7,
      vr: 0,
      vx: 0,
      vy: 0,
      x,
      y,
    }, safe));
    cursor = (slot + 1) % capacity;
  }
  return result;
}

function orderedLinkedIds(
  links: readonly TabletopLink[],
  seedId: string,
  allowed?: ReadonlySet<string>,
) {
  const usable = links.filter((link) => (
    !allowed || (allowed.has(link.leftId) && allowed.has(link.rightId))
  ));
  let first = seedId;
  const visitedLeft = new Set<string>();
  while (!visitedLeft.has(first)) {
    visitedLeft.add(first);
    const link = usable.find((item) => item.rightId === first);
    if (!link) break;
    first = link.leftId;
  }

  const ordered = [first];
  const visited = new Set(ordered);
  while (true) {
    const link = usable.find((item) => item.leftId === ordered[ordered.length - 1]);
    if (!link || visited.has(link.rightId)) break;
    ordered.push(link.rightId);
    visited.add(link.rightId);
  }
  return ordered;
}

export function getTabletopCandidateWord(
  bodies: readonly TabletopBody[],
  links: readonly TabletopLink[],
  selectedIds: Iterable<string>,
  activeId: string | null,
): TabletopCandidateResult {
  if (!bodies.length) return { ok: false, reason: "no-tiles", word: null };
  const bodyById = new Map(bodies.map((body) => [body.id, body]));
  const selected = new Set(Array.from(selectedIds).filter((id) => bodyById.has(id)));
  let orderedIds: string[];
  let source: "joined" | "selection";

  if (selected.size >= 2) {
    const seed = selected.values().next().value as string;
    orderedIds = orderedLinkedIds(links, seed, selected);
    if (orderedIds.length !== selected.size) {
      return { ok: false, reason: "selection-not-joined", word: null };
    }
    source = "selection";
  } else {
    const selectedSeed = selected.size === 1 ? selected.values().next().value as string : null;
    const seed = selectedSeed ?? (activeId && bodyById.has(activeId) ? activeId : bodies[0].id);
    orderedIds = orderedLinkedIds(links, seed);
    if (orderedIds.length < 2) return { ok: false, reason: "join-required", word: null };
    source = "joined";
  }

  let word = "";
  for (const id of orderedIds) {
    const body = bodyById.get(id);
    if (!body) continue;
    if (body.letter === "?") {
      if (!body.blankAs) return { ok: false, reason: "unassigned-blank", word: null };
      word += body.blankAs;
    } else {
      word += body.letter;
    }
  }
  return { ok: true, source, tileIds: orderedIds, word };
}

export function linkedTileIds(links: readonly TabletopLink[]) {
  return new Set(links.flatMap((link) => [link.leftId, link.rightId]));
}
