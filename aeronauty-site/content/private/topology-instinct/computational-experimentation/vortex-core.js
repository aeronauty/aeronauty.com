(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ComputationalExperimentationNumerics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TWO_PI = 2 * Math.PI;
  const FOUR_PI = 4 * Math.PI;
  const EPSILON = 1e-12;

  function assertPoint(name, point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new TypeError(`${name} must contain finite x and y values`);
    }
  }

  function assertPanel(A, B, P, gamma) {
    assertPoint('A', A);
    assertPoint('B', B);
    assertPoint('P', P);
    if (!Number.isFinite(gamma)) throw new TypeError('gamma must be finite');
    if (Math.hypot(B.x - A.x, B.y - A.y) <= EPSILON) {
      throw new RangeError('vortex-panel endpoints must be distinct');
    }
  }

  /**
   * Induced velocity of a constant-strength 2-D vortex panel.
   *
   * The local formula follows the standard analytic line integral used by
   * Katz & Plotkin / Moran style panel-method kernels. gamma is vortex-sheet
   * strength per unit length; total circulation is gamma * panel length.
   */
  function vortexPanelVelocity(A, B, P, gamma = 1) {
    assertPanel(A, B, P, gamma);

    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const length = Math.hypot(dx, dy);
    const tx = dx / length;
    const ty = dy / length;
    const nx = -ty;
    const ny = tx;

    const rx = P.x - A.x;
    const ry = P.y - A.y;
    const X = rx * tx + ry * ty;
    const Y = rx * nx + ry * ny;
    const r1Squared = X * X + Y * Y;
    const r2Squared = (X - length) * (X - length) + Y * Y;

    if (r1Squared <= EPSILON || r2Squared <= EPSILON) {
      throw new RangeError('field point is on a vortex-panel endpoint');
    }
    if (Math.abs(Y) <= EPSILON && X >= 0 && X <= length) {
      throw new RangeError('field point is on the singular vortex panel');
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

  /** Independent midpoint Biot-Savart quadrature of the same vortex sheet. */
  function numericalVortexPanelVelocity(A, B, P, gamma = 1, segments = 12000) {
    assertPanel(A, B, P, gamma);
    if (!Number.isInteger(segments) || segments < 32) {
      throw new RangeError('segments must be an integer >= 32');
    }

    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const length = Math.hypot(dx, dy);
    const ds = length / segments;
    const tx = dx / length;
    const ty = dy / length;
    let u = 0;
    let v = 0;

    for (let i = 0; i < segments; i += 1) {
      const s = (i + 0.5) * ds;
      const sourceX = A.x + tx * s;
      const sourceY = A.y + ty * s;
      const rx = P.x - sourceX;
      const ry = P.y - sourceY;
      const rSquared = rx * rx + ry * ry;
      if (rSquared <= EPSILON) throw new RangeError('quadrature hit the singularity');
      const pointCirculation = gamma * ds;
      u += -(pointCirculation / TWO_PI) * ry / rSquared;
      v += (pointCirculation / TWO_PI) * rx / rSquared;
    }

    return { x: u, y: v };
  }

  function add(...vectors) {
    return vectors.reduce(
      (total, vector) => ({ x: total.x + vector.x, y: total.y + vector.y }),
      { x: 0, y: 0 },
    );
  }

  function norm(vector) {
    return Math.hypot(vector.x, vector.y);
  }

  function relativeVectorError(actual, expected) {
    return norm({ x: actual.x - expected.x, y: actual.y - expected.y }) /
      Math.max(norm(expected), Number.EPSILON);
  }

  function superposedVelocity(panels, P) {
    return add(...panels.map((panel) => vortexPanelVelocity(panel.A, panel.B, P, panel.gamma)));
  }

  /**
   * Trailing-filament strengths for piecewise-constant bound circulation.
   * Tip jumps to/from zero are included, so the complete set closes to zero.
   */
  function trailingFilamentStrengths(boundCirculation) {
    if (!Array.isArray(boundCirculation) || boundCirculation.length === 0) {
      throw new TypeError('boundCirculation must be a non-empty array');
    }
    if (!boundCirculation.every(Number.isFinite)) {
      throw new TypeError('boundCirculation entries must be finite');
    }

    const strengths = [boundCirculation[0]];
    for (let i = 1; i < boundCirculation.length; i += 1) {
      strengths.push(boundCirculation[i] - boundCirculation[i - 1]);
    }
    strengths.push(-boundCirculation.at(-1));
    return strengths;
  }

  /** Equal-and-opposite shed circulation required by a bound-circulation change. */
  function shedCirculation(previousBound, nextBound) {
    if (!Number.isFinite(previousBound) || !Number.isFinite(nextBound)) {
      throw new TypeError('bound-circulation values must be finite');
    }
    return previousBound - nextBound;
  }

  function sum(values) {
    return values.reduce((total, value) => total + value, 0);
  }

  return Object.freeze({
    add,
    norm,
    numericalVortexPanelVelocity,
    relativeVectorError,
    shedCirculation,
    sum,
    superposedVelocity,
    trailingFilamentStrengths,
    vortexPanelVelocity,
  });
});
