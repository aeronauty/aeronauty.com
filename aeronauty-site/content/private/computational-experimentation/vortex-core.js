/** Numerical primitives shared by the article widgets and CI acceptance test. */
const FOUR_PI = 4 * Math.PI;
const EPS = 1e-12;

export const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const add = (a, b) => vec(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a, b) => vec(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a, s) => vec(a.x * s, a.y * s, a.z * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => vec(
  a.y * b.z - a.z * b.y,
  a.z * b.x - a.x * b.z,
  a.x * b.y - a.y * b.x,
);
export const norm = (a) => Math.hypot(a.x, a.y, a.z);
export const sum = (values) => values.reduce((total, value) => total + value, 0);

/** Closed-form Biot–Savart velocity of a finite straight vortex filament. */
export function finiteSegmentVelocity(a, b, p, gamma = 1) {
  const r1 = sub(p, a);
  const r2 = sub(p, b);
  const r0 = sub(b, a);
  const c = cross(r1, r2);
  const c2 = dot(c, c);
  const r1n = norm(r1);
  const r2n = norm(r2);
  if (c2 < EPS || r1n < EPS || r2n < EPS || norm(r0) < EPS) {
    return vec(Number.NaN, Number.NaN, Number.NaN);
  }
  const geometry = dot(r0, sub(scale(r1, 1 / r1n), scale(r2, 1 / r2n)));
  return scale(c, (gamma / FOUR_PI) * geometry / c2);
}

/** Independent midpoint quadrature of the same Biot–Savart line integral. */
export function numericalSegmentVelocity(a, b, p, gamma = 1, panels = 4000) {
  if (!Number.isInteger(panels) || panels < 8) throw new TypeError('panels must be an integer >= 8');
  const r0 = sub(b, a);
  const dl = scale(r0, 1 / panels);
  let total = vec();
  for (let i = 0; i < panels; i += 1) {
    const midpoint = add(a, scale(r0, (i + 0.5) / panels));
    const r = sub(p, midpoint);
    const rmag = norm(r);
    if (rmag < EPS) return vec(Number.NaN, Number.NaN, Number.NaN);
    total = add(total, scale(cross(dl, r), gamma / (FOUR_PI * rmag ** 3)));
  }
  return total;
}

export function relativeVectorError(actual, expected) {
  return norm(sub(actual, expected)) / Math.max(norm(expected), EPS);
}

export function superposedSegmentVelocity(segments, p) {
  return segments.reduce(
    (total, segment) => add(total, finiteSegmentVelocity(segment.a, segment.b, p, segment.gamma)),
    vec(),
  );
}

/** Outside the wing Γ=0, so every trailing filament is a jump in bound Γ. */
export function trailingFilamentStrengths(panelCirculations) {
  if (!Array.isArray(panelCirculations) || panelCirculations.length === 0) {
    throw new TypeError('panelCirculations must be a non-empty array');
  }
  const strengths = [panelCirculations[0]];
  for (let i = 1; i < panelCirculations.length; i += 1) {
    strengths.push(panelCirculations[i] - panelCirculations[i - 1]);
  }
  strengths.push(-panelCirculations.at(-1));
  return strengths;
}

export const shedCirculation = (previousGamma, nextGamma) => -(nextGamma - previousGamma);
