"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CheckCircle2,
  ExternalLink,
  Lock,
  Maximize2,
  Minimize2,
  Plus,
  RotateCcw,
  Shuffle,
  Trash2,
  Unlink,
  Unlock,
  Vibrate,
} from "lucide-react";
import {
  createRackTiles,
  isAlphabetLetter,
  parseRackLetters,
  type AlphabetLetter,
  type RackGroup,
  type RackTile,
} from "./rackModel";
import {
  TABLETOP_JOIN_GAP,
  TABLETOP_TILE_HEIGHT,
  TABLETOP_TILE_WIDTH,
  advanceTabletopPhysics,
  applySnap,
  findSnapCandidate,
  getTabletopCandidateWord,
  isLinkedComponentLocked,
  linkedComponentIds,
  linkedTileIds,
  lockedComponentIds,
  moveKinematicBody,
  moveKinematicComponent,
  normalizeTabletopBodies,
  normalizeTabletopLinks,
  placeLooseTiles,
  removeLinksForIds,
  scatterTabletopBodies,
  setBodyVelocity,
  setLinkedComponentLocked,
  setLockedComponentVelocity,
  straightenTabletopBodies,
  type SnapCandidate,
  type TabletopBody,
  type TabletopBounds,
  type TabletopLink,
  type TabletopOrientationMode,
} from "./tabletopModel";
import { PhysicalTileBoard, type PhysicalTileBoardSnapshot } from "./physicalTileBoard";
import styles from "./tile-tally.module.css";

const MAX_TILES = 40;
const MAX_CHECK_LENGTH = 15;
const STORAGE_VERSION = 3;
const PREVIOUS_STORAGE_VERSION = 2;
const LEGACY_STORAGE_VERSION = 1;
const COLLINS_CHECKER_URL = "https://scrabble.collinsdictionary.com/check/";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") as AlphabetLetter[];

const TILE_VALUES: Record<AlphabetLetter, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1,
  J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1,
  S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

type StoredWorkspace = {
  bodies: TabletopBody[];
  height: number;
  links: TabletopLink[];
  orientationMode?: TabletopOrientationMode;
  version: typeof STORAGE_VERSION;
  width: number;
};

type PreviousStoredWorkspace = {
  groups: RackGroup[];
  version: typeof PREVIOUS_STORAGE_VERSION;
};

type LegacyStoredRack = {
  tiles: RackTile[];
  version: typeof LEGACY_STORAGE_VERSION;
};

type MotionPermissionState = "off" | "requesting" | "on" | "denied" | "unsupported";

type DeviceMotionConstructor = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

type MotionSample = {
  time: number;
  x: number;
  y: number;
};

type DragSession = {
  active: boolean;
  candidate: SnapCandidate | null;
  captureElement: HTMLButtonElement | null;
  lastVelocity: { vx: number; vy: number };
  lastX: number;
  lastY: number;
  movingIds: string[];
  offsetX: number;
  offsetY: number;
  originBodies: TabletopBody[];
  originLinks: TabletopLink[];
  pointerId: number;
  pointerType: string;
  samples: MotionSample[];
  startClientX: number;
  startClientY: number;
  tileId: string;
  wasLocked: boolean;
};

let fallbackId = 0;

function createTileId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `tile-${globalThis.crypto.randomUUID()}`;
  }
  fallbackId += 1;
  return `tile-${Date.now().toString(36)}-${fallbackId}`;
}

function workspaceStorageKey(userId: string, version = STORAGE_VERSION): string {
  return `tile-tally:tiles:v${version}:${userId}`;
}

function tileFace(tile: RackTile): string {
  return tile.letter === "?" ? tile.blankAs ?? "?" : tile.letter;
}

function tileValue(tile: RackTile): number {
  return tile.letter === "?" ? 0 : TILE_VALUES[tile.letter];
}

function readTile(value: unknown, seen: Set<string>): RackTile | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string"
    || !candidate.id
    || candidate.id.length > 160
    || seen.has(candidate.id)
  ) return null;
  if (candidate.letter !== "?" && (
    typeof candidate.letter !== "string" || !isAlphabetLetter(candidate.letter)
  )) return null;
  if (candidate.blankAs !== undefined && (
    typeof candidate.blankAs !== "string" || !isAlphabetLetter(candidate.blankAs)
  )) return null;
  seen.add(candidate.id);
  return {
    id: candidate.id,
    letter: candidate.letter,
    ...(candidate.letter === "?" && candidate.blankAs ? { blankAs: candidate.blankAs } : {}),
  };
}

function finiteNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function surfaceBounds(element: HTMLElement | null): TabletopBounds {
  return {
    height: Math.max(TABLETOP_TILE_HEIGHT, element?.clientHeight ?? 460),
    width: Math.max(TABLETOP_TILE_WIDTH, element?.clientWidth ?? 840),
  };
}

function migrateGroups(groups: readonly RackGroup[], bounds: TabletopBounds) {
  const bodies: TabletopBody[] = [];
  const links: TabletopLink[] = [];
  const stepX = TABLETOP_TILE_WIDTH + TABLETOP_JOIN_GAP;
  const stepY = TABLETOP_TILE_HEIGHT + 5;
  const margin = 7;
  const columns = Math.max(1, Math.floor((bounds.width - margin * 2 + TABLETOP_JOIN_GAP) / stepX));
  let row = 0;

  for (const group of groups) {
    let previous: TabletopBody | null = null;
    let column = 0;
    for (const tile of group.tiles) {
      if (bodies.length >= MAX_TILES) break;
      if (column >= columns) {
        row += 1;
        column = 0;
        previous = null;
      }
      const body: TabletopBody = {
        ...tile,
        rotation: 0,
        vr: 0,
        vx: 0,
        vy: 0,
        x: margin + column * stepX,
        y: margin + row * stepY,
      };
      bodies.push(body);
      if (previous) links.push({ leftId: previous.id, rightId: body.id });
      previous = body;
      column += 1;
    }
    row += 1;
  }

  const normalizedBodies = normalizeTabletopBodies(bodies, bounds);
  return {
    bodies: normalizedBodies,
    links: normalizeTabletopLinks(links, normalizedBodies),
    orientationMode: "upright" as const,
  };
}

function parsePreviousGroups(value: unknown): RackGroup[] | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PreviousStoredWorkspace>;
  if (candidate.version !== PREVIOUS_STORAGE_VERSION || !Array.isArray(candidate.groups)) return null;
  const seenGroups = new Set<string>();
  const seenTiles = new Set<string>();
  const groups: RackGroup[] = [];
  for (const raw of candidate.groups) {
    if (!raw || typeof raw !== "object") continue;
    const group = raw as { id?: unknown; tiles?: unknown };
    if (
      typeof group.id !== "string" || !group.id || seenGroups.has(group.id) || !Array.isArray(group.tiles)
    ) continue;
    seenGroups.add(group.id);
    const tiles: RackTile[] = [];
    for (const rawTile of group.tiles) {
      if (seenTiles.size >= MAX_TILES) break;
      const tile = readTile(rawTile, seenTiles);
      if (tile) tiles.push(tile);
    }
    if (tiles.length) groups.push({ id: group.id, tiles });
  }
  return groups;
}

function parseLegacyTiles(value: unknown): RackTile[] | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<LegacyStoredRack>;
  if (candidate.version !== LEGACY_STORAGE_VERSION || !Array.isArray(candidate.tiles)) return null;
  const seen = new Set<string>();
  return candidate.tiles.slice(0, MAX_TILES).map((tile) => readTile(tile, seen)).filter(Boolean) as RackTile[];
}

function parseStoredWorkspace(value: unknown, bounds: TabletopBounds) {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StoredWorkspace>;
  if (candidate.version !== STORAGE_VERSION || !Array.isArray(candidate.bodies)) return null;
  const seen = new Set<string>();
  const storedWidth = Math.max(TABLETOP_TILE_WIDTH, finiteNumber(candidate.width, bounds.width));
  const storedHeight = Math.max(TABLETOP_TILE_HEIGHT, finiteNumber(candidate.height, bounds.height));
  const oldTravelX = Math.max(1, storedWidth - TABLETOP_TILE_WIDTH);
  const oldTravelY = Math.max(1, storedHeight - TABLETOP_TILE_HEIGHT);
  const newTravelX = Math.max(0, bounds.width - TABLETOP_TILE_WIDTH);
  const newTravelY = Math.max(0, bounds.height - TABLETOP_TILE_HEIGHT);
  const bodies: TabletopBody[] = [];
  for (const raw of candidate.bodies.slice(0, MAX_TILES)) {
    const tile = readTile(raw, seen);
    if (!tile) continue;
    const pose = raw as Record<string, unknown>;
    bodies.push({
      ...tile,
      rotation: finiteNumber(pose.rotation),
      vr: 0,
      vx: 0,
      vy: 0,
      x: finiteNumber(pose.x) / oldTravelX * newTravelX,
      y: finiteNumber(pose.y) / oldTravelY * newTravelY,
    });
  }
  const normalizedBodies = normalizeTabletopBodies(bodies, bounds);
  const rawLinks = Array.isArray(candidate.links)
    ? candidate.links.flatMap((raw): TabletopLink[] => {
        if (!raw || typeof raw !== "object") return [];
        const link = raw as { leftId?: unknown; locked?: unknown; rightId?: unknown };
        return typeof link.leftId === "string" && typeof link.rightId === "string"
          ? [{
              leftId: link.leftId,
              ...(link.locked === true ? { locked: true as const } : {}),
              rightId: link.rightId,
            }]
          : [];
      })
    : [];
  return {
    bodies: normalizedBodies,
    links: normalizeTabletopLinks(rawLinks, normalizedBodies),
    orientationMode: candidate.orientationMode === "free" ? "free" as const : "upright" as const,
  };
}

function readStoredWorkspace(userId: string, bounds: TabletopBounds) {
  try {
    const current = window.localStorage.getItem(workspaceStorageKey(userId));
    if (current !== null) {
      const parsed = parseStoredWorkspace(JSON.parse(current), bounds);
      if (parsed) return parsed;
    }
  } catch {
    // Try older snapshots when the newest value is corrupt.
  }
  try {
    const previous = window.localStorage.getItem(workspaceStorageKey(userId, PREVIOUS_STORAGE_VERSION));
    if (previous !== null) {
      const groups = parsePreviousGroups(JSON.parse(previous));
      if (groups) return migrateGroups(groups, bounds);
    }
  } catch {
    // A valid v1 rack can still be recovered.
  }
  try {
    const legacy = window.localStorage.getItem(workspaceStorageKey(userId, LEGACY_STORAGE_VERSION));
    if (legacy !== null) {
      const tiles = parseLegacyTiles(JSON.parse(legacy));
      if (tiles) return migrateGroups([{ id: "legacy-rack", tiles }], bounds);
    }
  } catch {
    // Corrupt or blocked browser storage should not stop the tabletop working.
  }
  return {
    bodies: [] as TabletopBody[],
    links: [] as TabletopLink[],
    orientationMode: "upright" as const,
  };
}

function sampleVelocity(samples: readonly MotionSample[], releaseTime?: number) {
  const last = samples[samples.length - 1];
  if (!last) return { vx: 0, vy: 0 };
  if (releaseTime !== undefined && releaseTime - last.time > 85) return { vx: 0, vy: 0 };
  const cutoff = last.time - 105;
  const first = samples.find((sample) => sample.time >= cutoff) ?? last;
  const seconds = (last.time - first.time) / 1_000;
  if (seconds < 0.012) return { vx: 0, vy: 0 };
  return {
    vx: Math.max(-2_400, Math.min(2_400, (last.x - first.x) / seconds)),
    vy: Math.max(-2_400, Math.min(2_400, (last.y - first.y) / seconds)),
  };
}

function linkStyle(link: TabletopLink, bodies: readonly TabletopBody[]) {
  const left = bodies.find((body) => body.id === link.leftId);
  const right = bodies.find((body) => body.id === link.rightId);
  if (!left || !right) return null;
  const x1 = left.x + TABLETOP_TILE_WIDTH;
  const y1 = left.y + TABLETOP_TILE_HEIGHT / 2;
  const x2 = right.x;
  const y2 = right.y + TABLETOP_TILE_HEIGHT / 2;
  const distance = Math.hypot(x2 - x1, y2 - y1);
  const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  return {
    left: x1,
    top: y1 - 1.5,
    transform: `rotate(${angle}deg)`,
    width: Math.max(TABLETOP_JOIN_GAP, distance),
  };
}

export default function TilesView({ userId }: { userId: string }) {
  const [bodies, setBodies] = useState<TabletopBody[]>([]);
  const [links, setLinks] = useState<TabletopLink[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [checkerMessage, setCheckerMessage] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [heldId, setHeldId] = useState<string | null>(null);
  const [snapPreview, setSnapPreview] = useState<SnapCandidate | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [motionPermission, setMotionPermission] = useState<MotionPermissionState>("off");
  const [orientationMode, setOrientationMode] = useState<TabletopOrientationMode>("upright");
  const [wordMenuTileId, setWordMenuTileId] = useState<string | null>(null);

  const workspaceRef = useRef<HTMLElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement | null>(null);
  const tileRefs = useRef(new Map<string, HTMLButtonElement>());
  const bodiesRef = useRef<TabletopBody[]>([]);
  const linksRef = useRef<TabletopLink[]>([]);
  const boundsRef = useRef<TabletopBounds>({ height: 460, width: 840 });
  const orientationModeRef = useRef<TabletopOrientationMode>("upright");
  const hydratedRef = useRef(false);
  const dragSessionRef = useRef<DragSession | null>(null);
  const draggedIdsRef = useRef<Set<string>>(new Set());
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const cancelDragRef = useRef<(announceCancellation?: boolean) => void>(() => undefined);
  const suppressedClickRef = useRef<{ tileId: string; until: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef(0);
  const movingRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const announcementTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const wordMenuActionRef = useRef<HTMLButtonElement | null>(null);
  const shakeRef = useRef({ x: 0, y: 0, z: 0, hasSample: false, lastSpike: 0, lastScatter: 0 });

  const commitBodies = useCallback((next: TabletopBody[]) => {
    bodiesRef.current = next;
    setBodies(next);
  }, []);

  const commitLinks = useCallback((next: TabletopLink[]) => {
    linksRef.current = next;
    setLinks(next);
  }, []);

  const commitBoardSnapshot = useCallback((snapshot: PhysicalTileBoardSnapshot) => {
    commitBodies(snapshot.bodies);
    commitLinks(snapshot.links);
    orientationModeRef.current = snapshot.orientationMode;
    setOrientationMode(snapshot.orientationMode);
  }, [commitBodies, commitLinks]);

  const currentBoard = useCallback(() => new PhysicalTileBoard({
    bodies: bodiesRef.current,
    bounds: boundsRef.current,
    links: linksRef.current,
    orientationMode: orientationModeRef.current,
  }), []);

  const announce = useCallback((text: string) => {
    if (announcementTimerRef.current !== null) window.clearTimeout(announcementTimerRef.current);
    setAnnouncement("");
    announcementTimerRef.current = window.setTimeout(() => setAnnouncement(text), 20);
  }, []);

  const actualSelectedIds = useMemo(() => {
    const present = new Set(bodies.map((body) => body.id));
    return new Set(Array.from(selectedIds).filter((id) => present.has(id)));
  }, [bodies, selectedIds]);
  const selectedCount = actualSelectedIds.size;
  const activeBody = bodies.find((body) => body.id === activeId) ?? null;
  const blankBodies = bodies.filter((body) => body.letter === "?");
  const joinedIds = useMemo(() => linkedTileIds(links), [links]);
  const activeComponentIds = useMemo(
    () => activeId ? linkedComponentIds(links, activeId) : new Set<string>(),
    [activeId, links],
  );
  const activeWordLocked = Boolean(
    activeId && activeComponentIds.size > 1 && isLinkedComponentLocked(links, activeId),
  );
  const heldIds = useMemo(
    () => heldId ? lockedComponentIds(links, heldId) : new Set<string>(),
    [heldId, links],
  );
  const parsedDraft = parseRackLetters(draft);
  const remainingSlots = MAX_TILES - bodies.length;
  const candidateResult = useMemo(
    () => getTabletopCandidateWord(bodies, links, actualSelectedIds, activeId),
    [activeId, actualSelectedIds, bodies, links],
  );
  const candidate = candidateResult.ok ? candidateResult.word : null;
  const canCheck = Boolean(candidate && candidate.length >= 2 && candidate.length <= MAX_CHECK_LENGTH);

  const runPhysics = useCallback(() => {
    if (animationFrameRef.current !== null) return;
    movingRef.current = true;
    setIsMoving(true);
    lastFrameTimeRef.current = performance.now();
    const frame = (now: number) => {
      const elapsed = Math.min(0.05, Math.max(1 / 240, (now - lastFrameTimeRef.current) / 1_000));
      lastFrameTimeRef.current = now;
      const kinematic = draggedIdsRef.current;
      const result = advanceTabletopPhysics(
        bodiesRef.current,
        boundsRef.current,
        elapsed,
        kinematic,
        linksRef.current,
        orientationModeRef.current,
      );
      commitBodies(result.bodies);
      if (result.moving || draggedIdsRef.current.size) {
        animationFrameRef.current = window.requestAnimationFrame(frame);
      } else {
        animationFrameRef.current = null;
        movingRef.current = false;
        setIsMoving(false);
      }
    };
    animationFrameRef.current = window.requestAnimationFrame(frame);
  }, [commitBodies]);

  const writeSnapshot = useCallback(() => {
    if (!hydratedRef.current) return;
    const activeDrag = dragSessionRef.current;
    const snapshotBodies = activeDrag?.active ? activeDrag.originBodies : bodiesRef.current;
    const snapshotLinks = activeDrag?.active ? activeDrag.originLinks : linksRef.current;
    const stored: StoredWorkspace = {
      version: STORAGE_VERSION,
      width: boundsRef.current.width,
      height: boundsRef.current.height,
      bodies: snapshotBodies.map((body) => ({ ...body, vr: 0, vx: 0, vy: 0 })),
      links: snapshotLinks,
      orientationMode: orientationModeRef.current,
    };
    try {
      window.localStorage.setItem(workspaceStorageKey(userId), JSON.stringify(stored));
    } catch {
      // The tabletop still works in memory when browser storage is unavailable.
    }
  }, [userId]);

  useEffect(() => {
    hydratedRef.current = false;
    setHydrated(false);
    commitBodies([]);
    commitLinks([]);
    setSelectedIds(new Set());
    setActiveId(null);
    const frame = window.requestAnimationFrame(() => {
      const bounds = surfaceBounds(boardRef.current);
      boundsRef.current = bounds;
      const restored = readStoredWorkspace(userId, bounds);
      orientationModeRef.current = restored.orientationMode;
      setOrientationMode(restored.orientationMode);
      const constrained = advanceTabletopPhysics(
        restored.bodies,
        bounds,
        0,
        new Set(),
        restored.links,
        restored.orientationMode,
      ).bodies;
      commitBodies(constrained);
      commitLinks(restored.links);
      setSelectedIds(new Set());
      setActiveId(constrained[0]?.id ?? null);
      hydratedRef.current = true;
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [commitBodies, commitLinks, userId]);

  useEffect(() => {
    const surface = boardRef.current;
    if (!surface || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const next = surfaceBounds(surface);
      const previous = boundsRef.current;
      if (Math.abs(next.width - previous.width) < 1 && Math.abs(next.height - previous.height) < 1) return;
      boundsRef.current = next;
      if (!hydratedRef.current || !bodiesRef.current.length) return;
      cancelDragRef.current(false);
      const previousTravelX = Math.max(1, previous.width - TABLETOP_TILE_WIDTH);
      const previousTravelY = Math.max(1, previous.height - TABLETOP_TILE_HEIGHT);
      const nextTravelX = Math.max(0, next.width - TABLETOP_TILE_WIDTH);
      const nextTravelY = Math.max(0, next.height - TABLETOP_TILE_HEIGHT);
      const resized = normalizeTabletopBodies(bodiesRef.current.map((body) => ({
        ...body,
        x: body.x / previousTravelX * nextTravelX,
        y: body.y / previousTravelY * nextTravelY,
      })), next);
      const constrained = advanceTabletopPhysics(
        resized,
        next,
        0,
        new Set(),
        linksRef.current,
        orientationModeRef.current,
      ).bodies;
      commitBodies(constrained);
    });
    observer.observe(surface);
    return () => observer.disconnect();
  }, [commitBodies, isFullscreen]);

  useEffect(() => {
    if (!hydrated) return;
    if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(writeSnapshot, movingRef.current ? 420 : 180);
    return () => {
      if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current);
    };
  }, [bodies, hydrated, links, writeSnapshot]);

  useEffect(() => {
    const onPageHide = () => writeSnapshot();
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [writeSnapshot]);

  useEffect(() => {
    if (!wordMenuTileId) return;
    const frame = window.requestAnimationFrame(() => wordMenuActionRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [wordMenuTileId]);

  useEffect(() => () => writeSnapshot(), [writeSnapshot]);

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const isolated: Array<{ ariaHidden: string | null; element: HTMLElement; inert: boolean }> = [];
    document.body.style.overflow = "hidden";
    let current: HTMLElement | null = workspaceRef.current;
    while (current && current !== document.body) {
      const parent: HTMLElement | null = current.parentElement;
      if (!parent) break;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === current || !(sibling instanceof HTMLElement)) continue;
        isolated.push({
          ariaHidden: sibling.getAttribute("aria-hidden"),
          element: sibling,
          inert: sibling.inert,
        });
        sibling.inert = true;
        sibling.setAttribute("aria-hidden", "true");
      }
      current = parent;
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.requestAnimationFrame(() => fullscreenButtonRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      for (const item of isolated) {
        item.element.inert = item.inert;
        if (item.ariaHidden === null) item.element.removeAttribute("aria-hidden");
        else item.element.setAttribute("aria-hidden", item.ariaHidden);
      }
      window.requestAnimationFrame(() => previousFocus?.focus());
    };
  }, [isFullscreen]);

  const scatter = useCallback((ids: Iterable<string> | null, message: string) => {
    if (dragSessionRef.current) return;
    const affected = ids ? new Set(ids) : new Set(bodiesRef.current.map((body) => body.id));
    if (!affected.size) return;
    const board = currentBoard();
    const snapshot = board.scatter(ids ? affected : null, Math.random, ids ? 500 : 680);
    commitBoardSnapshot(snapshot);
    setCheckerMessage(null);
    setSnapPreview(null);
    setWordMenuTileId(null);
    announce(message);
    runPhysics();
  }, [announce, commitBoardSnapshot, currentBoard, runPhysics]);

  useEffect(() => {
    if (motionPermission !== "on") return;
    const onMotion = (event: DeviceMotionEvent) => {
      if (dragSessionRef.current) return;
      const acceleration = event.accelerationIncludingGravity ?? event.acceleration;
      if (!acceleration) return;
      const x = acceleration.x ?? 0;
      const y = acceleration.y ?? 0;
      const z = acceleration.z ?? 0;
      const state = shakeRef.current;
      const now = Date.now();
      if (!state.hasSample) {
        Object.assign(state, { x, y, z, hasSample: true });
        return;
      }
      const delta = Math.hypot(x - state.x, y - state.y, z - state.z);
      Object.assign(state, { x, y, z });
      if (delta < 18) return;
      if (now - state.lastSpike < 650 && now - state.lastScatter > 1_300) {
        state.lastScatter = now;
        state.lastSpike = 0;
        if (bodiesRef.current.length > 1) {
          scatter(null, "Shake detected. Every tile was detached and scattered across the table.");
          navigator.vibrate?.(35);
        }
      } else {
        state.lastSpike = now;
      }
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [motionPermission, scatter]);

  useEffect(() => () => {
    dragCleanupRef.current?.();
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
    if (announcementTimerRef.current !== null) window.clearTimeout(announcementTimerRef.current);
    if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current);
  }, []);

  function focusTile(tileId: string | null) {
    if (tileId) window.requestAnimationFrame(() => tileRefs.current.get(tileId)?.focus());
  }

  function invalidateCheck() {
    setCheckerMessage(null);
  }

  function addTiles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    if (remainingSlots <= 0) {
      setLocalError(`The tabletop holds up to ${MAX_TILES} tiles.`);
      return;
    }
    const additions = parsedDraft.slice(0, remainingSlots);
    if (!additions.length) {
      setLocalError("Enter letters A–Z, or ? for a blank tile.");
      return;
    }
    const created = createRackTiles(additions, createTileId);
    commitBoardSnapshot(currentBoard().addTiles(created));
    setDraft("");
    setActiveId(created[0]?.id ?? activeId);
    invalidateCheck();
    if (parsedDraft.length > additions.length) {
      setLocalError(`Added ${additions.length}; the tabletop holds ${MAX_TILES} tiles.`);
    }
    announce(`Added ${additions.length} loose ${additions.length === 1 ? "tile" : "tiles"}.`);
    focusTile(created[0]?.id ?? null);
  }

  function toggleSelection(tile: TabletopBody, ignoreSuppression = false) {
    const suppressed = suppressedClickRef.current;
    if (suppressed && !ignoreSuppression) {
      suppressedClickRef.current = null;
      if (suppressed.tileId === tile.id && Date.now() <= suppressed.until) return;
    }
    setActiveId(tile.id);
    setSelectedIds((current) => {
      const next = new Set(current);
      const selected = !next.has(tile.id);
      if (selected) next.add(tile.id);
      else next.delete(tile.id);
      announce(`${selected ? "Selected" : "Unselected"} ${tileFace(tile)}.`);
      return next;
    });
    invalidateCheck();
  }

  function removeTile(tileId: string) {
    const current = bodiesRef.current;
    const index = current.findIndex((body) => body.id === tileId);
    if (index < 0) return;
    const removed = current[index];
    const nextBodies = current.filter((body) => body.id !== tileId);
    const nextFocus = nextBodies[Math.min(index, nextBodies.length - 1)]?.id ?? null;
    commitBodies(nextBodies);
    commitLinks(removeLinksForIds(linksRef.current, [tileId]));
    setSelectedIds((selected) => {
      const next = new Set(selected);
      next.delete(tileId);
      return next;
    });
    setActiveId(nextFocus);
    invalidateCheck();
    announce(`Removed ${tileFace(removed)}.`);
    focusTile(nextFocus);
  }

  function focusInDirection(tileId: string, direction: "left" | "right" | "up" | "down") {
    const current = bodiesRef.current.find((body) => body.id === tileId);
    if (!current) return;
    const currentX = current.x + TABLETOP_TILE_WIDTH / 2;
    const currentY = current.y + TABLETOP_TILE_HEIGHT / 2;
    let best: { id: string; score: number } | null = null;
    for (const body of bodiesRef.current) {
      if (body.id === tileId) continue;
      const dx = body.x + TABLETOP_TILE_WIDTH / 2 - currentX;
      const dy = body.y + TABLETOP_TILE_HEIGHT / 2 - currentY;
      const primary = direction === "left" ? -dx
        : direction === "right" ? dx
          : direction === "up" ? -dy : dy;
      if (primary <= 3) continue;
      const cross = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
      const score = primary * 2 + cross;
      if (!best || score < best.score) best = { id: body.id, score };
    }
    if (best) {
      setActiveId(best.id);
      focusTile(best.id);
    }
  }

  function nudgeTile(tile: TabletopBody, dx: number, dy: number) {
    const nextLinks = removeLinksForIds(linksRef.current, [tile.id]);
    let nextBodies = moveKinematicBody(
      bodiesRef.current,
      tile.id,
      tile.x + dx,
      tile.y + dy,
      0,
      0,
      boundsRef.current,
      nextLinks,
    );
    const candidate = findSnapCandidate(nextBodies, nextLinks, tile.id, "keyboard", boundsRef.current);
    if (candidate) {
      const snapped = applySnap(nextBodies, nextLinks, candidate, boundsRef.current);
      nextBodies = snapped.bodies;
      commitLinks(snapped.links);
      announce(`${tileFace(tile)} snapped beside ${tileFace(nextBodies.find((body) => body.id === candidate.anchorId) ?? tile)}.`);
    } else {
      commitLinks(nextLinks);
      announce(`Nudged ${tileFace(tile)}.`);
    }
    commitBodies(nextBodies);
    invalidateCheck();
    focusTile(tile.id);
  }

  function handleTileKeyDown(event: KeyboardEvent<HTMLButtonElement>, tile: TabletopBody) {
    const directions = {
      ArrowDown: [0, 12, "down"],
      ArrowLeft: [-12, 0, "left"],
      ArrowRight: [12, 0, "right"],
      ArrowUp: [0, -12, "up"],
    } as const;
    if (event.key in directions) {
      event.preventDefault();
      const [dx, dy, direction] = directions[event.key as keyof typeof directions];
      if (event.altKey) nudgeTile(tile, dx, dy);
      else focusInDirection(tile.id, direction);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const target = event.key === "Home" ? bodiesRef.current[0] : bodiesRef.current.at(-1);
      if (target) {
        setActiveId(target.id);
        focusTile(target.id);
      }
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeTile(tile.id);
    }
  }

  function cleanupDragListeners() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
  }

  function cancelPointerDrag(announceCancellation = true) {
    const session = dragSessionRef.current;
    if (!session) return;
    cleanupDragListeners();
    dragSessionRef.current = null;
    draggedIdsRef.current = new Set();
    try {
      if (session.captureElement?.hasPointerCapture(session.pointerId)) {
        session.captureElement.releasePointerCapture(session.pointerId);
      }
    } catch {
      // Capture may already have been released by the browser.
    }
    setHeldId(null);
    setSnapPreview(null);
    commitBodies(session.originBodies);
    commitLinks(session.originLinks);
    if (session.active && announceCancellation) announce("Move canceled; the tabletop was restored.");
  }

  function processPointerMove(event: PointerEvent) {
    const session = dragSessionRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    if (session.pointerType === "mouse" && event.buttons === 0) {
      cancelPointerDrag();
      return;
    }
    const travel = Math.hypot(event.clientX - session.startClientX, event.clientY - session.startClientY);
    if (!session.active && travel < (session.pointerType === "touch" ? 7 : 4)) return;
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    event.preventDefault();
    if (!session.active) {
      session.active = true;
      const board = currentBoard();
      const plan = board.prepareDrag(session.tileId);
      session.movingIds = plan.tileIds;
      session.wasLocked = plan.wasLocked;
      draggedIdsRef.current = new Set(plan.tileIds);
      setHeldId(session.tileId);
      setWordMenuTileId(null);
      try {
        session.captureElement?.setPointerCapture(session.pointerId);
      } catch {
        // Window listeners still own the gesture when capture is unavailable.
      }
      commitBoardSnapshot(board.release({ tileId: session.tileId, vx: 0, vy: 0, vr: 0 }));
    }
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - rect.left - session.offsetX;
    const y = event.clientY - rect.top - session.offsetY;
    const time = event.timeStamp || performance.now();
    session.samples.push({ time, x, y });
    session.samples = session.samples.filter((sample) => time - sample.time <= 140);
    session.lastVelocity = sampleVelocity(session.samples);
    session.lastX = x;
    session.lastY = y;
    const unconstrained = bodiesRef.current.map((body) => body.id === session.tileId
      ? { ...body, vx: session.lastVelocity.vx, vy: session.lastVelocity.vy, x, y }
      : { ...body });
    session.candidate = session.wasLocked ? null : findSnapCandidate(
      unconstrained,
      linksRef.current,
      session.tileId,
      session.pointerType,
      boundsRef.current,
    );
    const moved = session.wasLocked
      ? moveKinematicComponent(
          bodiesRef.current,
          session.tileId,
          x,
          y,
          session.lastVelocity.vx,
          session.lastVelocity.vy,
          boundsRef.current,
          linksRef.current,
        )
      : moveKinematicBody(
          bodiesRef.current,
          session.tileId,
          x,
          y,
          session.lastVelocity.vx,
          session.lastVelocity.vy,
          boundsRef.current,
          linksRef.current,
        );
    commitBodies(moved);
    setSnapPreview(session.candidate);
    runPhysics();
  }

  function finishPointerDrag(event: PointerEvent, canceled = false) {
    const session = dragSessionRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    if (canceled) {
      cancelPointerDrag();
      return;
    }
    if (session.active) {
      const rect = boardRef.current?.getBoundingClientRect();
      if (rect) {
        const x = event.clientX - rect.left - session.offsetX;
        const y = event.clientY - rect.top - session.offsetY;
        const time = event.timeStamp || performance.now();
        session.samples.push({ time, x, y });
        session.samples = session.samples.filter((sample) => time - sample.time <= 140);
        session.lastX = x;
        session.lastY = y;
        session.lastVelocity = sampleVelocity(session.samples);
        commitBodies(session.wasLocked
          ? moveKinematicComponent(
              bodiesRef.current,
              session.tileId,
              x,
              y,
              session.lastVelocity.vx,
              session.lastVelocity.vy,
              boundsRef.current,
              linksRef.current,
            )
          : moveKinematicBody(
              bodiesRef.current,
              session.tileId,
              x,
              y,
              session.lastVelocity.vx,
              session.lastVelocity.vy,
              boundsRef.current,
              linksRef.current,
            ));
      }
    }
    cleanupDragListeners();
    dragSessionRef.current = null;
    draggedIdsRef.current = new Set();
    try {
      if (session.captureElement?.hasPointerCapture(session.pointerId)) {
        session.captureElement.releasePointerCapture(session.pointerId);
      }
    } catch {
      // Capture may already have been released by the browser.
    }
    setHeldId(null);
    setSnapPreview(null);
    if (!session.active) {
      if (session.pointerType === "touch") {
        const tapped = bodiesRef.current.find((body) => body.id === session.tileId);
        if (tapped) {
          toggleSelection(tapped, true);
          suppressedClickRef.current = { tileId: session.tileId, until: Date.now() + 800 };
        }
      }
      return;
    }
    suppressedClickRef.current = { tileId: session.tileId, until: Date.now() + 800 };
    const release = sampleVelocity(session.samples, event.timeStamp || performance.now());
    const moving = bodiesRef.current.find((body) => body.id === session.tileId);
    const leverX = session.offsetX - TABLETOP_TILE_WIDTH / 2;
    const leverY = session.offsetY - TABLETOP_TILE_HEIGHT / 2;
    const angular = moving && orientationModeRef.current === "free"
      ? Math.max(-180, Math.min(180, (release.vx * leverY - release.vy * leverX) * 0.018))
      : 0;
    let nextBodies = session.wasLocked
      ? setLockedComponentVelocity(
          bodiesRef.current,
          linksRef.current,
          session.tileId,
          release.vx,
          release.vy,
          0,
          orientationModeRef.current,
        )
      : setBodyVelocity(bodiesRef.current, session.tileId, release.vx, release.vy, angular);
    let nextLinks = linksRef.current;
    if (session.wasLocked) {
      commitBodies(nextBodies);
      commitLinks(nextLinks);
      setActiveId(session.tileId);
      invalidateCheck();
      const speed = Math.hypot(release.vx, release.vy);
      announce(speed > 180 ? "Locked word thrown as one object." : "Locked word moved as one object.");
      if (session.pointerType === "touch") navigator.vibrate?.(9);
      if (speed > 0) runPhysics();
      focusTile(session.tileId);
      return;
    }
    const releasePose = nextBodies.map((body) => body.id === session.tileId
      ? { ...body, vx: release.vx, vy: release.vy, x: session.lastX, y: session.lastY }
      : { ...body });
    const firstSnap = findSnapCandidate(releasePose, nextLinks, session.tileId, session.pointerType, boundsRef.current);
    let snapCount = 0;
    if (firstSnap) {
      let snapped = applySnap(releasePose, nextLinks, firstSnap, boundsRef.current);
      nextBodies = snapped.bodies;
      nextLinks = snapped.links;
      snapCount = firstSnap.replaceLink ? 2 : 1;
      const secondSnap = firstSnap.replaceLink ? null : findSnapCandidate(nextBodies, nextLinks, session.tileId, session.pointerType, boundsRef.current);
      if (secondSnap && secondSnap.anchorId !== firstSnap.anchorId) {
        snapped = applySnap(nextBodies, nextLinks, secondSnap, boundsRef.current);
        nextBodies = snapped.bodies;
        nextLinks = snapped.links;
        snapCount += 1;
      }
    }
    commitBodies(nextBodies);
    commitLinks(nextLinks);
    setActiveId(session.tileId);
    invalidateCheck();
    if (snapCount) {
      announce(snapCount === 2 ? "Tile inserted and snapped on both sides." : "Tile snapped into the joined word.");
      if (session.pointerType === "touch") navigator.vibrate?.(12);
    } else {
      const speed = Math.hypot(release.vx, release.vy);
      announce(speed > 180 ? "Tile thrown across the table." : "Tile placed loose on the table.");
      runPhysics();
    }
    focusTile(session.tileId);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>, tile: TabletopBody) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    cancelPointerDrag(false);
    const captureElement = event.currentTarget;
    const boardRect = boardRef.current?.getBoundingClientRect();
    setActiveId(tile.id);
    commitBodies(isLinkedComponentLocked(linksRef.current, tile.id)
      ? setLockedComponentVelocity(
          bodiesRef.current,
          linksRef.current,
          tile.id,
          0,
          0,
          0,
          orientationModeRef.current,
        )
      : setBodyVelocity(bodiesRef.current, tile.id, 0, 0, 0));
    dragSessionRef.current = {
      active: false,
      candidate: null,
      captureElement,
      lastVelocity: { vx: 0, vy: 0 },
      lastX: tile.x,
      lastY: tile.y,
      movingIds: [tile.id],
      offsetX: boardRect ? event.clientX - boardRect.left - tile.x : TABLETOP_TILE_WIDTH / 2,
      offsetY: boardRect ? event.clientY - boardRect.top - tile.y : TABLETOP_TILE_HEIGHT / 2,
      originBodies: bodiesRef.current.map((body) => ({ ...body })),
      originLinks: linksRef.current.map((link) => ({ ...link })),
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      samples: [{ time: event.timeStamp || performance.now(), x: tile.x, y: tile.y }],
      startClientX: event.clientX,
      startClientY: event.clientY,
      tileId: tile.id,
      wasLocked: false,
    };
    const onMove = (pointerEvent: PointerEvent) => processPointerMove(pointerEvent);
    const onUp = (pointerEvent: PointerEvent) => finishPointerDrag(pointerEvent);
    const onCancel = (pointerEvent: PointerEvent) => finishPointerDrag(pointerEvent, true);
    const onLostCapture = (pointerEvent: PointerEvent) => {
      if (dragSessionRef.current?.pointerId === pointerEvent.pointerId) cancelPointerDrag();
    };
    const onBlur = () => cancelPointerDrag();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") cancelPointerDrag();
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    captureElement.addEventListener("lostpointercapture", onLostCapture);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    dragCleanupRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      captureElement.removeEventListener("lostpointercapture", onLostCapture);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };

    if (isLinkedComponentLocked(linksRef.current, tile.id)) {
      longPressTimerRef.current = window.setTimeout(() => {
        const pending = dragSessionRef.current;
        if (!pending || pending.pointerId !== event.pointerId || pending.active) return;
        longPressTimerRef.current = null;
        suppressedClickRef.current = { tileId: tile.id, until: Date.now() + 900 };
        setWordMenuTileId(tile.id);
        navigator.vibrate?.(18);
        cancelPointerDrag(false);
        announce("Locked word actions opened.");
      }, 560);
    }
  }

  cancelDragRef.current = cancelPointerDrag;

  function scatterAll() {
    scatter(null, `Scattered all ${bodiesRef.current.length} tiles. Every joined word was detached.`);
  }

  function scatterSelected() {
    scatter(actualSelectedIds, `Scattered ${selectedCount} selected ${selectedCount === 1 ? "tile" : "tiles"}.`);
  }

  function setActiveWordLocked(locked: boolean, tileId = activeId) {
    if (!tileId || linkedComponentIds(linksRef.current, tileId).size < 2) return;
    const board = currentBoard();
    commitBoardSnapshot(board.setComponentLocked(tileId, locked));
    setActiveId(tileId);
    setWordMenuTileId(null);
    invalidateCheck();
    announce(locked
      ? "Word locked. Drag any tile to move the whole word; hold it for break-apart actions."
      : "Word unlocked. Pull any tile away to separate it again.");
    if (locked) navigator.vibrate?.(10);
    focusTile(tileId);
  }

  function breakTileOut(tileId = wordMenuTileId ?? activeId) {
    if (!tileId || linkedComponentIds(linksRef.current, tileId).size < 2) return;
    const board = currentBoard();
    commitBoardSnapshot(board.breakTile(tileId));
    setWordMenuTileId(null);
    setActiveId(tileId);
    invalidateCheck();
    announce("Tile broken out. Any word fragments that remain locked still move together.");
    navigator.vibrate?.(8);
    focusTile(tileId);
  }

  function toggleOrientationMode() {
    const nextMode: TabletopOrientationMode = orientationModeRef.current === "upright"
      ? "free"
      : "upright";
    const board = currentBoard();
    commitBoardSnapshot(board.setOrientationMode(nextMode));
    announce(nextMode === "upright"
      ? "Upright mode on. Every tile was straightened and will stay vertical."
      : "Free rotation on. Loose tiles can spin when thrown.");
  }

  function straightenTiles() {
    const targetIds = selectedCount ? actualSelectedIds : null;
    const board = currentBoard();
    commitBoardSnapshot(board.straighten(targetIds));
    announce(selectedCount
      ? `Straightened ${selectedCount} selected ${selectedCount === 1 ? "tile" : "tiles"}.`
      : "Straightened every tile.");
  }

  function settleTiles() {
    commitBodies(bodiesRef.current.map((body) => ({ ...body, vr: 0, vx: 0, vy: 0 })));
    if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    movingRef.current = false;
    setIsMoving(false);
    announce("All tiles settled.");
  }

  function removeSelection() {
    const removed = actualSelectedIds;
    const next = bodiesRef.current.filter((body) => !removed.has(body.id));
    commitBodies(next);
    commitLinks(removeLinksForIds(linksRef.current, removed));
    setSelectedIds(new Set());
    const nextFocus = next[0]?.id ?? null;
    setActiveId(nextFocus);
    invalidateCheck();
    announce(`Removed ${selectedCount} selected ${selectedCount === 1 ? "tile" : "tiles"}.`);
    focusTile(nextFocus);
  }

  function selectAll() {
    const selecting = selectedCount !== bodies.length;
    setSelectedIds(selecting ? new Set(bodies.map((body) => body.id)) : new Set());
    invalidateCheck();
    announce(selecting ? `Selected all ${bodies.length} tiles.` : "Cleared the selection.");
  }

  function assignBlank(tileId: string, value: string) {
    const blankAs = isAlphabetLetter(value) ? value : undefined;
    commitBodies(bodiesRef.current.map((body) => {
      if (body.id !== tileId || body.letter !== "?") return { ...body };
      return blankAs ? { ...body, blankAs } : { ...body, blankAs: undefined };
    }));
    invalidateCheck();
    announce(blankAs ? `Blank tile now represents ${blankAs}.` : "Blank tile assignment cleared.");
  }

  async function toggleShake() {
    if (motionPermission === "on") {
      setMotionPermission("off");
      shakeRef.current = { x: 0, y: 0, z: 0, hasSample: false, lastSpike: 0, lastScatter: 0 };
      announce("Shake to scatter turned off.");
      return;
    }
    if (!("DeviceMotionEvent" in window)) {
      setMotionPermission("unsupported");
      announce("Motion sensing is unavailable. Use Scatter all instead.");
      return;
    }
    setMotionPermission("requesting");
    try {
      const constructor = window.DeviceMotionEvent as DeviceMotionConstructor;
      const permission = constructor.requestPermission ? await constructor.requestPermission() : "granted";
      if (permission !== "granted") {
        setMotionPermission("denied");
        announce("Motion permission was not granted. Use Scatter all instead.");
        return;
      }
      shakeRef.current = { x: 0, y: 0, z: 0, hasSample: false, lastSpike: 0, lastScatter: 0 };
      setMotionPermission("on");
      announce("Shake to scatter enabled. Give the phone two firm shakes.");
    } catch {
      setMotionPermission("denied");
      announce("Motion permission could not be enabled. Use Scatter all instead.");
    }
  }

  function copyCandidateForCheck() {
    if (!candidate || !canCheck) return;
    setCheckerMessage(`Opening Collins. Enter ${candidate} there to check this exact joined word.`);
    if (!navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(candidate).then(
      () => setCheckerMessage(`${candidate} copied. Paste it into the Collins checker.`),
      () => setCheckerMessage(`Collins opened. Enter ${candidate} there to check it.`),
    );
  }

  function candidateLabel() {
    if (candidateResult.ok) return candidateResult.word;
    if (candidateResult.reason === "selection-not-joined") return "Selected tiles must touch in one word";
    if (candidateResult.reason === "unassigned-blank") return "Assign blanks first";
    if (candidateResult.reason === "join-required") return "Snap at least two tiles together";
    return "No word arranged";
  }

  return (
    <section
      className={`${styles.tilesWorkspace} ${styles.stack} ${isFullscreen ? styles.tilesWorkspaceFullscreen : ""}`}
      ref={workspaceRef}
      role={isFullscreen ? "dialog" : undefined}
      aria-modal={isFullscreen ? "true" : undefined}
      aria-label={isFullscreen ? "Full-screen tile tabletop" : undefined}
      data-testid="tiles-workspace"
      data-fullscreen={isFullscreen ? "true" : "false"}
      data-drag-mode={heldId ? "physical" : "idle"}
      data-orientation={orientationMode}
    >
      <header className={`${styles.viewHeader} ${styles.tilesViewHeader}`}>
        <div>
          <p className={styles.kicker}>Letter tabletop</p>
          <h2>Slide them. Bump them. Throw them.</h2>
          <p>Loose tiles keep their momentum. A slow, aligned placement beside another tile snaps them together.</p>
        </div>
        <div className={styles.workspaceHeaderActions}>
          <button
            className={styles.secondaryButton}
            type="button"
            data-testid="orientation-toggle"
            aria-pressed={orientationMode === "upright"}
            onClick={toggleOrientationMode}
            title={orientationMode === "upright"
              ? "Keep every tile vertical"
              : "Allow loose tiles to spin when thrown"}
          >
            <RotateCcw size={16} aria-hidden="true" />
            {orientationMode === "upright" ? "Tiles upright" : "Free rotation"}
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            data-testid="shake-toggle"
            data-state={motionPermission}
            aria-pressed={motionPermission === "on"}
            onClick={() => void toggleShake()}
            disabled={motionPermission === "requesting"}
          >
            <Vibrate size={16} aria-hidden="true" />
            {motionPermission === "on" ? "Shake on"
              : motionPermission === "requesting" ? "Enabling…"
                : motionPermission === "denied" ? "Motion denied"
                  : motionPermission === "unsupported" ? "Shake unavailable" : "Enable shake"}
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            ref={fullscreenButtonRef}
            data-testid="fullscreen-toggle"
            aria-pressed={isFullscreen}
            onClick={() => setIsFullscreen((current) => !current)}
          >
            {isFullscreen ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
            {isFullscreen ? "Exit full screen" : "Full screen"}
          </button>
          {(motionPermission === "denied" || motionPermission === "unsupported") && (
            <p className={styles.motionStatus} role="status">
              {motionPermission === "denied"
                ? "Allow motion in browser settings, or use Scatter all."
                : "This browser has no motion sensor support; use Scatter all."}
            </p>
          )}
        </div>
      </header>

      <section className={`${styles.panel} ${styles.rackPanel}`} aria-labelledby="tile-rack-heading">
        <div className={styles.panelHeadingRow}>
          <div>
            <p className={styles.kicker}>Your tiles</p>
            <h2 id="tile-rack-heading">One open table</h2>
          </div>
          <span className={styles.localChip}>This device only</span>
        </div>

        <form className={styles.rackAddForm} onSubmit={addTiles}>
          <label htmlFor="rack-letters">
            <span>Add tiles <em>Use ? for a blank</em></span>
            <input
              id="rack-letters"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value.toUpperCase());
                setLocalError(null);
              }}
              placeholder="AEINRST"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={90}
              disabled={!hydrated || remainingSlots === 0}
            />
          </label>
          <button className={styles.primaryButton} type="submit" disabled={!hydrated || !parsedDraft.length || remainingSlots === 0}>
            <Plus size={16} aria-hidden="true" /> Add
          </button>
        </form>
        <p className={styles.rackCapacity}>
          {bodies.length} of {MAX_TILES} spaces used. Spaces and punctuation in the field are ignored.
        </p>
        {localError && <div className={styles.inlineError} role="alert">{localError}</div>}

        <div className={styles.rackBoard} data-testid="tile-rack">
          <div className={styles.rackBoardTopline}>
            <span>
              {selectedCount ? `${selectedCount} selected` : `${bodies.length} tiles`}
              {links.length ? ` · ${links.length} ${links.length === 1 ? "snap" : "snaps"}` : " · all loose"}
            </span>
            {bodies.length > 0 && (
              <button className={styles.rackSelectButton} type="button" onClick={selectAll}>
                {selectedCount === bodies.length ? "Clear selection" : "Select all"}
              </button>
            )}
          </div>

          <div
            className={styles.tabletopSurface}
            data-testid="tile-surface"
            data-moving={isMoving ? "true" : "false"}
            data-orientation={orientationMode}
            data-snap-ready={snapPreview ? "true" : "false"}
            ref={boardRef}
          >
            {!bodies.length && hydrated && (
              <div className={styles.tabletopSurfaceEmpty}>
                <span className={styles.rackEmptyTile} aria-hidden="true">A</span>
                <p>Add your letters. Every tile starts loose on this single, low-friction surface.</p>
              </div>
            )}

            {isMoving && !heldId && (
              <div className={styles.tabletopHud} data-testid="motion-hud">Tiles are moving · use Settle to stop them</div>
            )}

            {wordMenuTileId && isLinkedComponentLocked(links, wordMenuTileId) && (
              <div
                className={styles.wordHoldMenu}
                data-testid="locked-word-menu"
                role="group"
                aria-label="Locked word actions"
              >
                <span>
                  <strong>Locked word</strong>
                  Move it as one, or break this tile out.
                </span>
                <button
                  className={styles.wordHoldPrimary}
                  type="button"
                  ref={wordMenuActionRef}
                  onClick={() => breakTileOut(wordMenuTileId)}
                  data-testid="break-held-tile"
                >
                  <Unlink size={15} aria-hidden="true" /> Break tile out
                </button>
                <button type="button" onClick={() => setActiveWordLocked(false, wordMenuTileId)}>
                  <Unlock size={15} aria-hidden="true" /> Unlock word
                </button>
                <button type="button" onClick={() => setWordMenuTileId(null)} aria-label="Close locked word actions">
                  Close
                </button>
              </div>
            )}

            {links.map((link) => {
              const style = linkStyle(link, bodies);
              return style ? (
                <span
                  className={`${styles.tabletopLink} ${link.locked ? styles.tabletopLinkLocked : ""}`}
                  key={`${link.leftId}:${link.rightId}`}
                  style={style}
                  data-testid="snap-link"
                  data-left-id={link.leftId}
                  data-right-id={link.rightId}
                  data-locked={link.locked ? "true" : "false"}
                  aria-hidden="true"
                />
              ) : null;
            })}

            {bodies.map((body, index) => {
              const selected = actualSelectedIds.has(body.id);
              const held = heldIds.has(body.id);
              const snapTarget = snapPreview?.anchorId === body.id;
              const joined = joinedIds.has(body.id);
              const locked = joined && isLinkedComponentLocked(links, body.id);
              const componentMass = locked ? linkedComponentIds(links, body.id).size : 1;
              return (
                <div
                  className={`${styles.tabletopTileBody} ${held ? styles.tabletopTileHeld : ""} ${snapTarget ? styles.tabletopTileSnapTarget : ""} ${joined ? styles.tabletopTileJoined : ""} ${locked ? styles.tabletopTileLocked : ""} ${isMoving ? styles.tabletopTileMoving : ""}`}
                  key={body.id}
                  style={{
                    transform: `translate3d(${body.x}px, ${body.y}px, 0) rotate(${body.rotation}deg)`,
                    zIndex: held ? 19 : activeId === body.id ? 8 : 3 + index % 3,
                  }}
                  data-testid="tile-body"
                  data-tile-id={body.id}
                  data-x={body.x.toFixed(2)}
                  data-y={body.y.toFixed(2)}
                  data-vx={body.vx.toFixed(2)}
                  data-vy={body.vy.toFixed(2)}
                  data-rotation={body.rotation.toFixed(2)}
                  data-mass={componentMass}
                  data-joined={joined ? "true" : "false"}
                  data-locked={locked ? "true" : "false"}
                  data-held={held ? "true" : "false"}
                  data-snap-side={snapTarget ? snapPreview?.side : undefined}
                >
                  <button
                    className={`${styles.tabletopTile} ${selected ? styles.tabletopTileSelected : ""}`}
                    type="button"
                    ref={(element) => {
                      if (element) tileRefs.current.set(body.id, element);
                      else tileRefs.current.delete(body.id);
                    }}
                    data-testid="rack-tile"
                    data-tile-id={body.id}
                    data-letter={tileFace(body)}
                    data-selected={selected ? "true" : "false"}
                    aria-label={`${body.letter === "?" ? (body.blankAs ? `Blank as ${body.blankAs}` : "Unassigned blank") : body.letter}, ${locked ? `locked ${componentMass}-tile word` : joined ? "joined tile" : "loose tile"}, ${index + 1} of ${bodies.length}`}
                    aria-pressed={selected}
                    aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown Delete"
                    aria-describedby="rack-help"
                    onClick={() => toggleSelection(body)}
                    onFocus={() => setActiveId(body.id)}
                    onKeyDown={(event) => handleTileKeyDown(event, body)}
                    onPointerDown={(event) => handlePointerDown(event, body)}
                    onDragStart={(event) => event.preventDefault()}
                  >
                    <span>{tileFace(body)}</span>
                    <b>{tileValue(body)}</b>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <p className={styles.rackHelp} id="rack-help">
          Drag a tile in any direction. Release quickly to throw it; release slowly beside another tile to snap. Lock a joined word to move it as one; hold a locked word for break-apart actions. Tiles stay upright unless you enable free rotation.
        </p>

        {activeComponentIds.size > 1 && (
          <div className={styles.wordLockBar} data-testid="word-lock-actions" role="group" aria-label="Active word actions">
            <span>
              <strong>{activeComponentIds.size}-tile word</strong>
              {activeWordLocked ? "Locked together" : "Snapped, but pulls apart"}
            </span>
            <button
              className={styles.secondaryButton}
              type="button"
              data-testid="word-lock-toggle"
              aria-pressed={activeWordLocked}
              onClick={() => setActiveWordLocked(!activeWordLocked)}
            >
              {activeWordLocked
                ? <><Unlock size={16} aria-hidden="true" /> Unlock word</>
                : <><Lock size={16} aria-hidden="true" /> Lock word</>}
            </button>
            {activeWordLocked && (
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => breakTileOut(activeId)}
                data-testid="break-active-tile"
              >
                <Unlink size={16} aria-hidden="true" /> Break active tile out
              </button>
            )}
          </div>
        )}

        <div className={styles.rackToolbar} aria-label="Tile actions">
          <button className={styles.secondaryButton} type="button" onClick={scatterAll} disabled={bodies.length < 2} data-testid="scatter-all">
            <Shuffle size={16} aria-hidden="true" /> Scatter all
          </button>
          <button className={styles.secondaryButton} type="button" onClick={scatterSelected} disabled={!selectedCount} data-testid="scatter-selected">
            <Shuffle size={16} aria-hidden="true" /> Scatter selected
          </button>
          <button className={styles.secondaryButton} type="button" onClick={settleTiles} disabled={!isMoving} data-testid="settle-tiles">
            Settle
          </button>
          <button className={styles.secondaryButton} type="button" onClick={straightenTiles} disabled={!bodies.length} data-testid="straighten-tiles">
            <RotateCcw size={16} aria-hidden="true" /> {selectedCount ? "Straighten selected" : "Straighten all"}
          </button>
          <button className={styles.rackRemoveButton} type="button" onClick={removeSelection} disabled={!selectedCount}>
            <Trash2 size={16} aria-hidden="true" /> Remove selected
          </button>
        </div>

        {blankBodies.length > 0 && (
          <fieldset className={styles.blankAssignments}>
            <legend>Blank tiles</legend>
            <p>Choose the letter each blank represents before checking a joined word.</p>
            <div>
              {blankBodies.map((body, index) => (
                <label key={body.id}>
                  <span>Blank tile {index + 1}</span>
                  <select value={body.blankAs ?? ""} onChange={(event) => assignBlank(body.id, event.target.value)}>
                    <option value="">Not assigned</option>
                    {ALPHABET.map((letter) => <option value={letter} key={letter}>{letter}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </section>

      <section className={`${styles.panel} ${styles.wordCheckPanel}`} aria-labelledby="word-check-heading">
        <div className={styles.wordCheckIcon} aria-hidden="true"><CheckCircle2 size={22} /></div>
        <div className={styles.wordCheckBody}>
          <p className={styles.kicker}>Optional word check</p>
          <h2 id="word-check-heading">Check this joined word</h2>
          <p>{selectedCount ? "Uses a contiguous selection from one snapped word." : "Uses the snapped word containing the active tile. Mere proximity never counts."}</p>
          <output
            className={styles.wordCandidate}
            aria-label="Word to check"
            data-testid="word-candidate"
            data-state={candidateResult.ok ? "ready" : candidateResult.reason}
          >
            {candidateLabel()}
          </output>
          {canCheck && candidate ? (
            <a
              className={styles.checkWordLink}
              href={COLLINS_CHECKER_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={copyCandidateForCheck}
              data-testid="check-word"
            >
              Check {candidate} with Collins <ExternalLink size={15} aria-hidden="true" />
            </a>
          ) : (
            <button className={styles.checkWordLink} type="button" disabled data-testid="check-word">
              Check word <ExternalLink size={15} aria-hidden="true" />
            </button>
          )}
          {checkerMessage && <p className={styles.checkerMessage} role="status">{checkerMessage}</p>}
          <p className={styles.wordCheckCaveat}>
            Exact snapped arrangement only, up to {MAX_CHECK_LENGTH} letters. Word lists, regions and house rules can differ.
          </p>
        </div>
      </section>

      <span className={styles.srOnly} aria-live="polite" aria-atomic="true">{announcement}</span>
    </section>
  );
}
