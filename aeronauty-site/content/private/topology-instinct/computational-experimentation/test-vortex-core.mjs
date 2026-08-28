import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Load the exact browser-delivered UMD file in a browser-like global context.
// This avoids Node's package-type rules silently turning a browser script into
// an empty ESM namespace while still testing the implementation users run.
const source = readFileSync(new URL('./vortex-core.js', import.meta.url), 'utf8');
const sandbox = {};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'vortex-core.js' });

const {
  addVelocities,
  finiteVortexSegmentQuadrature,
  finiteVortexSegmentVelocity,
  relativeVelocityError,
  shedCirculation,
  sum,
  trailingFilamentStrengths,
  vectorDifferenceMagnitude,
  vortexPanelVelocity,
  vortexQuadrature,
} = sandbox.ComputationalExperimentKernels;

test('closed-form vortex panel agrees with independent quadrature', () => {
  const cases = [
    { A: { x: 0.18, y: 0.34 }, B: { x: 0.78, y: 0.62 }, P: { x: 0.52, y: 0.79 }, gamma: 1 },
    { A: { x: -0.9, y: -0.15 }, B: { x: 0.65, y: 0.42 }, P: { x: -0.22, y: 1.1 }, gamma: -1.7 },
    { A: { x: -1, y: 0 }, B: { x: 1, y: 0 }, P: { x: 0, y: 1 }, gamma: 1 },
  ];

  for (const current of cases) {
    const closedForm = vortexPanelVelocity(current.A, current.B, current.P, current.gamma);
    const quadrature = vortexQuadrature(current.A, current.B, current.P, current.gamma, 12000);
    assert.ok(
      vectorDifferenceMagnitude(closedForm, quadrature) < 2e-7,
      `closed form did not match quadrature for ${JSON.stringify(current)}`,
    );
  }
});

test('canonical horizontal panel produces the expected velocity', () => {
  const velocity = vortexPanelVelocity(
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    1,
  );
  assert.ok(Math.abs(velocity.x + 0.25) < 1e-12);
  assert.ok(Math.abs(velocity.y) < 1e-12);
});

test('superposition is exactly the sum of independently evaluated pieces', () => {
  const P = { x: 0.42, y: 0.53 };
  const first = vortexPanelVelocity({ x: 0.1, y: 0.7 }, { x: 0.8, y: 0.76 }, P, 1.2);
  const second = vortexPanelVelocity({ x: 0.2, y: 0.25 }, { x: 0.86, y: 0.4 }, P, -0.7);
  const assembled = addVelocities(first, second);
  assert.equal(assembled.x, first.x + second.x);
  assert.equal(assembled.y, first.y + second.y);
  assert.equal(Object.hasOwn(assembled, 'z'), false);
});

test('finite 3D vortex segment agrees with independent Biot-Savart quadrature', () => {
  const cases = [
    {
      A: { x: -1, y: 0, z: 0 },
      B: { x: 1, y: 0, z: 0 },
      P: { x: 0, y: 1, z: 0 },
      gamma: 1,
    },
    {
      A: { x: 0.1, y: -0.2, z: 0.15 },
      B: { x: 0.9, y: 0.55, z: 0.7 },
      P: { x: 0.35, y: 0.85, z: -0.25 },
      gamma: -1.4,
    },
    {
      A: { x: -0.8, y: 0.1, z: -0.5 },
      B: { x: 0.4, y: -0.35, z: 0.9 },
      P: { x: 0.75, y: 0.7, z: 0.15 },
      gamma: 0.65,
    },
  ];

  for (const current of cases) {
    const closedForm = finiteVortexSegmentVelocity(
      current.A,
      current.B,
      current.P,
      current.gamma,
    );
    const quadrature = finiteVortexSegmentQuadrature(
      current.A,
      current.B,
      current.P,
      current.gamma,
      24000,
    );
    assert.ok(
      vectorDifferenceMagnitude(closedForm, quadrature) < 2e-8,
      `finite-segment closed form did not match quadrature for ${JSON.stringify(current)}`,
    );
  }
});

test('canonical finite segment follows the right-hand rule', () => {
  const velocity = finiteVortexSegmentVelocity(
    { x: -1, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    1,
  );
  assert.ok(Math.abs(velocity.x) < 1e-14);
  assert.ok(Math.abs(velocity.y) < 1e-14);
  assert.ok(Math.abs(velocity.z - Math.SQRT2 / (4 * Math.PI)) < 1e-14);
});

test('finite segment orientation and circulation sign are consistent', () => {
  const A = { x: 0.2, y: -0.4, z: 0.7 };
  const B = { x: 1.3, y: 0.5, z: -0.2 };
  const P = { x: -0.1, y: 0.8, z: 1.4 };
  const velocity = finiteVortexSegmentVelocity(A, B, P, -1.7);
  const reversed = finiteVortexSegmentVelocity(B, A, P, -1.7);
  const opposite = finiteVortexSegmentVelocity(A, B, P, 1.7);
  const expected = {
    x: -0.05463020066958633,
    y: 0.015973742885843956,
    z: -0.050796502376983786,
  };

  assert.ok(vectorDifferenceMagnitude(velocity, expected) < 1e-14);
  assert.ok(vectorDifferenceMagnitude(reversed, opposite) < 1e-14);
  assert.ok(
    vectorDifferenceMagnitude(
      addVelocities(velocity, reversed),
      { x: 0, y: 0, z: 0 },
    ) < 1e-14,
  );
});

test('finite segment classifies its axis consistently', () => {
  const A = { x: 0, y: 0, z: 0 };
  const B = { x: 1, y: 0, z: 0 };
  const exterior = { x: 2, y: 0, z: 0 };
  const interior = { x: 0.4, y: 0, z: 0 };

  assert.equal(
    vectorDifferenceMagnitude(
      finiteVortexSegmentVelocity(A, B, exterior),
      { x: 0, y: 0, z: 0 },
    ),
    0,
  );
  assert.equal(
    vectorDifferenceMagnitude(
      finiteVortexSegmentQuadrature(A, B, exterior),
      { x: 0, y: 0, z: 0 },
    ),
    0,
  );
  for (const velocity of [
    finiteVortexSegmentVelocity(A, B, interior),
    finiteVortexSegmentQuadrature(A, B, interior),
  ]) {
    assert.ok(Number.isNaN(velocity.x));
    assert.ok(Number.isNaN(velocity.y));
    assert.ok(Number.isNaN(velocity.z));
  }
});

test('3D superposition preserves all components and its calibration check', () => {
  const P = { x: 0.4, y: 0.65, z: 0.55 };
  const segments = [
    [{ x: 0.08, y: 0.72, z: 0.18 }, { x: 0.78, y: 0.78, z: 0.62 }, 1.2],
    [{ x: 0.2, y: 0.25, z: 0.72 }, { x: 0.86, y: 0.4, z: 0.22 }, -0.7],
  ];
  const exact = segments.map(([A, B, gamma]) => finiteVortexSegmentVelocity(A, B, P, gamma));
  const quadrature = segments.map(([A, B, gamma]) => (
    finiteVortexSegmentQuadrature(A, B, P, gamma, 18000)
  ));
  const total = addVelocities(...exact);
  const numericalTotal = addVelocities(...quadrature);

  assert.equal(total.x, exact[0].x + exact[1].x);
  assert.equal(total.y, exact[0].y + exact[1].y);
  assert.equal(total.z, exact[0].z + exact[1].z);
  assert.ok(relativeVelocityError(total, numericalTotal) < 2e-7);
});

test('trailing jumps close when the two tip jumps are included', () => {
  const strengths = trailingFilamentStrengths([0.2, 0.7, 1, 0.7, 0.2]);
  assert.ok(Math.abs(sum(strengths)) < 1e-14);
});

test('every bound-circulation change is balanced by shed circulation', () => {
  let bound = 0;
  let wake = 0;
  for (const nextBound of [0.3, 0.9, 0.1, -0.4, 0]) {
    wake += shedCirculation(bound, nextBound);
    bound = nextBound;
    assert.ok(Math.abs(bound + wake) < 1e-14);
  }
});
