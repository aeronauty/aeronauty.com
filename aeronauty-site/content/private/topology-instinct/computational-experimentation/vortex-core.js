/**
 * Numerical primitive shared by the Computational Experimentation article
 * and its automated acceptance test.
 *
 * This file is deliberately a tiny UMD module: the browser gets
 * `globalThis.ComputationalExperimentKernels`; Node gets `module.exports`.
 * That keeps the article and CI on exactly the same implementation without
 * changing the module mode of the wider Next.js project.
 */
(function exposeKernels(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ComputationalExperimentKernels = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const TWO_PI = 2 * Math.PI;
  const FOUR_PI = 4 * Math.PI;
  const EPS = 1e-10;

  function validatePoint(name, point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new TypeError(`${name} must contain finite x and y coordinates`);
    }
  }

  function validatePoint3(name, point) {
    if (
      !point
      || !Number.isFinite(point.x)
      || !Number.isFinite(point.y)
      || !Number.isFinite(point.z)
    ) {
      throw new TypeError(`${name} must contain finite x, y and z coordinates`);
    }
  }

  function subtract3(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  function cross3(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }

  function dot3(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function magnitude3(vector) {
    return Math.hypot(vector.x, vector.y, vector.z);
  }

  function vortexPanelVelocity(A, B, P, gamma = 1) {
    validatePoint('A', A);
    validatePoint('B', B);
    validatePoint('P', P);
    if (!Number.isFinite(gamma)) throw new TypeError('gamma must be finite');

    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const length = Math.hypot(dx, dy);
    if (length < EPS) throw new RangeError('panel endpoints must be distinct');

    const tx = dx / length;
    const ty = dy / length;
    const nx = -ty;
    const ny = tx;
    const rx = P.x - A.x;
    const ry = P.y - A.y;
    const X = rx * tx + ry * ty;
    const Y = rx * nx + ry * ny;
    const r1Squared = X * X + Y * Y;
    const r2Squared = (X - length) ** 2 + Y * Y;

    if (r1Squared < EPS ** 2 || r2Squared < EPS ** 2) {
      return { x: Number.NaN, y: Number.NaN };
    }
    if (Math.abs(Y) < EPS && X > 0 && X < length) {
      return { x: Number.NaN, y: Number.NaN };
    }

    const theta1 = Math.atan2(Y, X);
    const theta2 = Math.atan2(Y, X - length);
    // Katz & Plotkin use positive gamma for clockwise rotation in their
    // two-dimensional (x, z) plane. Here y is the planar counterpart of z.
    const uLocal = (gamma / TWO_PI) * (theta2 - theta1);
    const vLocal = -(gamma / FOUR_PI) * Math.log(r1Squared / r2Squared);

    return {
      x: uLocal * tx + vLocal * nx,
      y: uLocal * ty + vLocal * ny,
    };
  }

  function pointVortexVelocity(source, P, circulation = 1) {
    validatePoint('source', source);
    validatePoint('P', P);
    if (!Number.isFinite(circulation)) throw new TypeError('circulation must be finite');

    const rx = P.x - source.x;
    const ry = P.y - source.y;
    const radiusSquared = rx * rx + ry * ry;
    if (radiusSquared < EPS ** 2) return { x: Number.NaN, y: Number.NaN };

    return {
      x: circulation * ry / (TWO_PI * radiusSquared),
      y: -circulation * rx / (TWO_PI * radiusSquared),
    };
  }

  function vortexQuadrature(A, B, P, gamma = 1, panels = 1200) {
    validatePoint('A', A);
    validatePoint('B', B);
    validatePoint('P', P);
    if (!Number.isFinite(gamma)) throw new TypeError('gamma must be finite');
    if (!Number.isInteger(panels) || panels < 8) {
      throw new TypeError('panels must be an integer of at least 8');
    }

    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const length = Math.hypot(dx, dy);
    if (length < EPS) throw new RangeError('panel endpoints must be distinct');
    const tx = dx / length;
    const ty = dy / length;
    const nx = -ty;
    const ny = tx;
    const fromA = { x: P.x - A.x, y: P.y - A.y };
    const X = fromA.x * tx + fromA.y * ty;
    const Y = fromA.x * nx + fromA.y * ny;
    if (Math.abs(Y) < EPS && X >= 0 && X <= length) {
      return { x: Number.NaN, y: Number.NaN };
    }

    let u = 0;
    let v = 0;
    const discreteCirculation = gamma * length / panels;
    for (let i = 0; i < panels; i += 1) {
      const fraction = (i + 0.5) / panels;
      const sourceX = A.x + dx * fraction;
      const sourceY = A.y + dy * fraction;
      const contribution = pointVortexVelocity(
        { x: sourceX, y: sourceY },
        P,
        discreteCirculation,
      );
      if (!Number.isFinite(contribution.x)) return contribution;
      u += contribution.x;
      v += contribution.y;
    }
    return { x: u, y: v };
  }

  /**
   * Velocity induced by a finite straight vortex filament from A to B.
   * Positive circulation follows the right-hand rule around the oriented segment.
   */
  function finiteVortexSegmentVelocity(A, B, P, circulation = 1) {
    validatePoint3('A', A);
    validatePoint3('B', B);
    validatePoint3('P', P);
    if (!Number.isFinite(circulation)) throw new TypeError('circulation must be finite');

    const r0 = subtract3(B, A);
    const r1 = subtract3(P, A);
    const r2 = subtract3(P, B);
    const segmentLength = magnitude3(r0);
    const r1Magnitude = magnitude3(r1);
    const r2Magnitude = magnitude3(r2);
    if (segmentLength < EPS) throw new RangeError('filament endpoints must be distinct');

    const perpendicular = cross3(r1, r2);
    const perpendicularSquared = dot3(perpendicular, perpendicular);
    if (r1Magnitude < EPS || r2Magnitude < EPS) {
      return { x: Number.NaN, y: Number.NaN, z: Number.NaN };
    }
    const collinearTolerance = EPS * segmentLength * Math.max(r1Magnitude, r2Magnitude);
    if (perpendicularSquared <= collinearTolerance ** 2) {
      const projection = dot3(r1, r0) / segmentLength ** 2;
      if (projection < 0 || projection > 1) return { x: 0, y: 0, z: 0 };
      return { x: Number.NaN, y: Number.NaN, z: Number.NaN };
    }

    const endpointFactor = dot3(r0, {
      x: r1.x / r1Magnitude - r2.x / r2Magnitude,
      y: r1.y / r1Magnitude - r2.y / r2Magnitude,
      z: r1.z / r1Magnitude - r2.z / r2Magnitude,
    });
    const coefficient = circulation * endpointFactor / (FOUR_PI * perpendicularSquared);

    return {
      x: coefficient * perpendicular.x,
      y: coefficient * perpendicular.y,
      z: coefficient * perpendicular.z,
    };
  }

  /**
   * Independent midpoint integration of the Biot-Savart line integral.
   * It is intentionally slower than the closed form so the UI and tests can
   * use it as a numerical calibration reference.
   */
  function finiteVortexSegmentQuadrature(A, B, P, circulation = 1, panels = 1200) {
    validatePoint3('A', A);
    validatePoint3('B', B);
    validatePoint3('P', P);
    if (!Number.isFinite(circulation)) throw new TypeError('circulation must be finite');
    if (!Number.isInteger(panels) || panels < 8) {
      throw new TypeError('panels must be an integer of at least 8');
    }

    const segment = subtract3(B, A);
    const segmentLength = magnitude3(segment);
    if (segmentLength < EPS) throw new RangeError('filament endpoints must be distinct');
    const fromA = subtract3(P, A);
    const fromAMagnitude = magnitude3(fromA);
    const axisDistance = cross3(segment, fromA);
    const collinearTolerance = EPS * segmentLength * Math.max(fromAMagnitude, segmentLength);
    if (dot3(axisDistance, axisDistance) <= collinearTolerance ** 2) {
      const projection = dot3(fromA, segment) / segmentLength ** 2;
      if (projection < 0 || projection > 1) return { x: 0, y: 0, z: 0 };
      return { x: Number.NaN, y: Number.NaN, z: Number.NaN };
    }
    const differential = {
      x: segment.x / panels,
      y: segment.y / panels,
      z: segment.z / panels,
    };
    const total = { x: 0, y: 0, z: 0 };

    for (let i = 0; i < panels; i += 1) {
      const fraction = (i + 0.5) / panels;
      const source = {
        x: A.x + segment.x * fraction,
        y: A.y + segment.y * fraction,
        z: A.z + segment.z * fraction,
      };
      const radius = subtract3(P, source);
      const radiusMagnitude = magnitude3(radius);
      if (radiusMagnitude < EPS) {
        return { x: Number.NaN, y: Number.NaN, z: Number.NaN };
      }
      const contribution = cross3(differential, radius);
      const coefficient = circulation / (FOUR_PI * radiusMagnitude ** 3);
      total.x += coefficient * contribution.x;
      total.y += coefficient * contribution.y;
      total.z += coefficient * contribution.z;
    }

    return total;
  }

  function vectorDifferenceMagnitude(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
  }

  function trailingFilamentStrengths(panelCirculations) {
    if (!Array.isArray(panelCirculations) || panelCirculations.length === 0) {
      throw new TypeError('panelCirculations must be a non-empty array');
    }
    if (panelCirculations.some((value) => !Number.isFinite(value))) {
      throw new TypeError('panel circulation values must be finite');
    }
    const strengths = [panelCirculations[0]];
    for (let i = 1; i < panelCirculations.length; i += 1) {
      strengths.push(panelCirculations[i] - panelCirculations[i - 1]);
    }
    strengths.push(-panelCirculations.at(-1));
    return strengths;
  }

  function shedCirculation(previousBound, nextBound) {
    if (!Number.isFinite(previousBound) || !Number.isFinite(nextBound)) {
      throw new TypeError('bound circulation values must be finite');
    }
    return -(nextBound - previousBound);
  }

  function addVelocities(...vectors) {
    const hasZ = vectors.some((vector) => Object.hasOwn(vector, 'z'));
    const total = vectors.reduce(
      (result, vector) => ({
        x: result.x + vector.x,
        y: result.y + vector.y,
        z: result.z + (vector.z ?? 0),
      }),
      { x: 0, y: 0, z: 0 },
    );
    return hasZ ? total : { x: total.x, y: total.y };
  }

  function relativeVelocityError(actual, expected) {
    const difference = vectorDifferenceMagnitude(actual, expected);
    const reference = Math.max(
      Math.hypot(expected.x, expected.y, expected.z ?? 0),
      Number.EPSILON,
    );
    return difference / reference;
  }

  function sum(values) {
    return values.reduce((total, value) => total + value, 0);
  }

  return {
    addVelocities,
    finiteVortexSegmentQuadrature,
    finiteVortexSegmentVelocity,
    pointVortexVelocity,
    relativeVelocityError,
    shedCirculation,
    sum,
    trailingFilamentStrengths,
    vectorDifferenceMagnitude,
    vortexPanelVelocity,
    vortexQuadrature,
  };
}));
