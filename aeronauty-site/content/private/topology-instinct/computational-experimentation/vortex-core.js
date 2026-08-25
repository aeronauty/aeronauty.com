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

    if (r1Squared < EPS ** 2 || r2Squared < EPS ** 2 || Math.abs(Y) < EPS) {
      return { x: Number.NaN, y: Number.NaN };
    }

    const theta1 = Math.atan2(Y, X);
    const theta2 = Math.atan2(Y, X - length);
    const uLocal = -(gamma / TWO_PI) * (theta2 - theta1);
    const vLocal = (gamma / FOUR_PI) * Math.log(r1Squared / r2Squared);

    return {
      x: uLocal * tx + vLocal * nx,
      y: uLocal * ty + vLocal * ny,
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

    let u = 0;
    let v = 0;
    const discreteCirculation = gamma * length / panels;
    for (let i = 0; i < panels; i += 1) {
      const fraction = (i + 0.5) / panels;
      const sourceX = A.x + dx * fraction;
      const sourceY = A.y + dy * fraction;
      const rx = P.x - sourceX;
      const ry = P.y - sourceY;
      const radiusSquared = rx * rx + ry * ry;
      if (radiusSquared < EPS ** 2) return { x: Number.NaN, y: Number.NaN };
      u += -discreteCirculation * ry / (TWO_PI * radiusSquared);
      v += discreteCirculation * rx / (TWO_PI * radiusSquared);
    }
    return { x: u, y: v };
  }

  function vectorDifferenceMagnitude(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
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
    return vectors.reduce(
      (total, vector) => ({ x: total.x + vector.x, y: total.y + vector.y }),
      { x: 0, y: 0 },
    );
  }

  function relativeVelocityError(actual, expected) {
    const difference = vectorDifferenceMagnitude(actual, expected);
    const reference = Math.max(Math.hypot(expected.x, expected.y), Number.EPSILON);
    return difference / reference;
  }

  function sum(values) {
    return values.reduce((total, value) => total + value, 0);
  }

  return {
    addVelocities,
    relativeVelocityError,
    shedCirculation,
    sum,
    trailingFilamentStrengths,
    vectorDifferenceMagnitude,
    vortexPanelVelocity,
    vortexQuadrature,
  };
}));
