import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  addVelocities,
  shedCirculation,
  sum,
  trailingFilamentStrengths,
  vectorDifferenceMagnitude,
  vortexPanelVelocity,
  vortexQuadrature,
} = require('./vortex-core.js');

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
