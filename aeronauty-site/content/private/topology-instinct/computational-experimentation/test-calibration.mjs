import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalSegmentCase,
  finiteVortexSegmentVelocity,
  interpolateTheodorsen,
  shedVortexStrength,
  superposeSegments,
  trailingVortexStrengths,
} from './calibration-core.mjs';
import { THEODORSEN } from './theodorsen-data.mjs';

const close = (actual, expected, tolerance, label) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
};

test('finite vortex segment matches the canonical symmetric case', () => {
  const { a, b, p, gamma, expected } = canonicalSegmentCase();
  const velocity = finiteVortexSegmentVelocity(a, b, p, gamma);
  assert.equal(velocity.singular, false);
  close(velocity.x, 0, 1e-14, 'u');
  close(velocity.y, 0, 1e-14, 'v');
  close(velocity.z, expected, 1e-13, 'w');
});

test('superposition is the vector sum of the primitive', () => {
  const { a, b, p } = canonicalSegmentCase();
  const velocity = superposeSegments(
    [
      { a, b, gamma: 1 },
      { a, b, gamma: -0.25 },
    ],
    p,
  );
  close(velocity.z, 0.75 / (2 * Math.PI * Math.SQRT2), 1e-13, 'superposed w');
});

test('spanwise circulation differences telescope when both tips are zero', () => {
  const bound = [0, 0.45, 0.8, 1, 0.8, 0.45, 0];
  const trailing = trailingVortexStrengths(bound);
  close(trailing.reduce((sum, value) => sum + value, 0), 0, 1e-14, 'trailing sum');
  assert.equal(trailing.length, bound.length - 1);
});

test('shed circulation balances a change in bound circulation', () => {
  assert.equal(shedVortexStrength(0.75, 0.2), 0.55);
});

test('Theodorsen interpolation reproduces reference values', () => {
  const c01 = interpolateTheodorsen(0.1, THEODORSEN);
  close(c01.f, 0.831924105, 4e-4, 'F(0.1)');
  close(c01.g, -0.172302229, 4e-4, 'G(0.1)');

  const c1 = interpolateTheodorsen(1, THEODORSEN);
  close(c1.f, 0.539434871, 4e-4, 'F(1)');
  close(c1.g, -0.100272903, 4e-4, 'G(1)');
});

test('Theodorsen table is ordered and finite', () => {
  for (let index = 0; index < THEODORSEN.length; index += 1) {
    const row = THEODORSEN[index];
    assert.ok(Number.isFinite(row.k) && Number.isFinite(row.f) && Number.isFinite(row.g));
    if (index > 0) assert.ok(row.k > THEODORSEN[index - 1].k);
  }
});
