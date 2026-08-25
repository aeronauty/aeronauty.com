const FOUR_PI = 4 * Math.PI;
const EPS = 1e-12;

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
}

function scale(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function norm(v) {
  return Math.hypot(v.x, v.y, v.z);
}

export function addVelocities(...vectors) {
  return vectors.reduce(
    (sum, v) => ({ x: sum.x + v.x, y: sum.y + v.y, z: sum.z + v.z }),
    { x: 0, y: 0, z: 0 },
  );
}

/**
 * Velocity induced by a finite, straight vortex segment A -> B at point P.
 * This is the standard Biot-Savart finite-segment expression used in
 * lifting-line, vortex-lattice and wake models.
 */
export function finiteVortexSegmentVelocity(a, b, p, gamma = 1) {
  const r0 = sub(b, a);
  const r1 = sub(p, a);
  const r2 = sub(p, b);
  const r1Norm = norm(r1);
  const r2Norm = norm(r2);
  const cross12 = cross(r1, r2);
  const crossSq = dot(cross12, cross12);

  if (r1Norm < EPS || r2Norm < EPS || crossSq < EPS) {
    return { x: 0, y: 0, z: 0, singular: true };
  }

  const directionDifference = sub(scale(r1, 1 / r1Norm), scale(r2, 1 / r2Norm));
  const coefficient = (gamma / FOUR_PI) * (dot(r0, directionDifference) / crossSq);
  const velocity = scale(cross12, coefficient);
  return { ...velocity, singular: false };
}

export function superposeSegments(segments, p) {
  return addVelocities(
    ...segments.map(({ a, b, gamma }) => finiteVortexSegmentVelocity(a, b, p, gamma)),
  );
}

/**
 * Discrete trailing-filament strengths for adjacent spanwise bound-circulation
 * stations. With zero circulation at both tips, the strengths telescope to zero.
 */
export function trailingVortexStrengths(boundCirculation) {
  if (!Array.isArray(boundCirculation) || boundCirculation.length < 2) return [];
  const strengths = [];
  for (let i = 0; i < boundCirculation.length - 1; i += 1) {
    strengths.push(boundCirculation[i] - boundCirculation[i + 1]);
  }
  return strengths;
}

export function shedVortexStrength(previousBound, nextBound) {
  return previousBound - nextBound;
}

export function interpolateTheodorsen(k, table) {
  if (!Number.isFinite(k) || k <= table[0].k) return { ...table[0] };
  if (k >= table.at(-1).k) return { ...table.at(-1) };
  let lo = 0;
  let hi = table.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (table[mid].k <= k) lo = mid;
    else hi = mid;
  }
  const a = table[lo];
  const b = table[hi];
  const t = (k - a.k) / (b.k - a.k);
  return {
    k,
    f: a.f + t * (b.f - a.f),
    g: a.g + t * (b.g - a.g),
  };
}

export function complexMagnitude({ f, g }) {
  return Math.hypot(f, g);
}

export function complexPhase({ f, g }) {
  return Math.atan2(g, f);
}

export function canonicalSegmentCase() {
  const a = { x: -1, y: 0, z: 0 };
  const b = { x: 1, y: 0, z: 0 };
  const p = { x: 0, y: 1, z: 0 };
  const expected = 1 / (2 * Math.PI * Math.SQRT2);
  return { a, b, p, gamma: 1, expected };
}
