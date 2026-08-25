import assert from 'node:assert/strict';
import {
  finiteSegmentVelocity,
  numericalSegmentVelocity,
  relativeVectorError,
  superposedSegmentVelocity,
  trailingFilamentStrengths,
  shedCirculation,
  sum,
  vec,
} from './vortex-core.js';

const near = (actual, expected, tolerance, message) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
};

{
  const a = vec(-0.8, -0.2, 0);
  const b = vec(0.9, 0.35, 0);
  const p = vec(0.15, 0.95, 0);
  const analytic = finiteSegmentVelocity(a, b, p, 1.7);
  const numerical = numericalSegmentVelocity(a, b, p, 1.7, 8000);
  assert.ok(relativeVectorError(analytic, numerical) < 2e-7);
}

{
  const p = vec(0.2, 0.1, 0);
  const segments = [
    { a: vec(-1, -0.7, 0), b: vec(1, -0.7, 0), gamma: 1.2 },
    { a: vec(1, 0.7, 0), b: vec(-1, 0.7, 0), gamma: 0.65 },
  ];
  const total = superposedSegmentVelocity(segments, p);
  const v1 = finiteSegmentVelocity(segments[0].a, segments[0].b, p, segments[0].gamma);
  const v2 = finiteSegmentVelocity(segments[1].a, segments[1].b, p, segments[1].gamma);
  near(total.z, v1.z + v2.z, 1e-14, 'superposition');
}

near(sum(trailingFilamentStrengths([0.2, 0.7, 1.0, 0.7, 0.2])), 0, 1e-14, 'trailing closure');

{
  let bound = 0;
  let wake = 0;
  for (const next of [0.3, 0.9, 0.1, -0.4, 0]) {
    wake += shedCirculation(bound, next);
    bound = next;
    near(bound + wake, 0, 1e-14, 'Kelvin balance');
  }
}

console.log('computational-experimentation numerical acceptance tests passed');
