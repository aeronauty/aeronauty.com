import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  add,
  numericalVortexPanelVelocity,
  relativeVectorError,
  shedCirculation,
  sum,
  superposedVelocity,
  trailingFilamentStrengths,
  vortexPanelVelocity,
} = require('./vortex-core.js');

function close(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

// Canonical horizontal unit-strength sheet: A=(-1,0), B=(1,0), P=(0,1).
// Symmetry gives v=0 and the closed-form integral gives u=-1/4.
{
  const velocity = vortexPanelVelocity(
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    1,
  );
  close(velocity.x, -0.25, 1e-12, 'canonical horizontal-panel u');
  close(velocity.y, 0, 1e-12, 'canonical horizontal-panel v');
}

// The article's visible primitive must agree with an independent Biot-Savart
// quadrature over several off-axis geometries and signs.
for (const fixture of [
  { A: { x: -1.2, y: -0.2 }, B: { x: 0.8, y: 0.4 }, P: { x: 0.1, y: 1.1 }, gamma: 1.3 },
  { A: { x: -0.4, y: 0.9 }, B: { x: 1.1, y: -0.3 }, P: { x: -0.9, y: -0.7 }, gamma: -0.75 },
  { A: { x: 0.2, y: -1.0 }, B: { x: 0.5, y: 1.2 }, P: { x: 1.5, y: 0.1 }, gamma: 2.0 },
]) {
  const analytic = vortexPanelVelocity(fixture.A, fixture.B, fixture.P, fixture.gamma);
  const quadrature = numericalVortexPanelVelocity(
    fixture.A,
    fixture.B,
    fixture.P,
    fixture.gamma,
  );
  assert.ok(
    relativeVectorError(analytic, quadrature) < 2e-8,
    `analytic panel failed quadrature fixture ${JSON.stringify(fixture)}`,
  );
}

// Superposition is checked explicitly rather than implied by implementation.
{
  const P = { x: 0.18, y: 0.44 };
  const panels = [
    { A: { x: -1, y: -0.45 }, B: { x: 1, y: -0.45 }, gamma: 1.1 },
    { A: { x: 1, y: 0.6 }, B: { x: -1, y: 0.6 }, gamma: 0.65 },
  ];
  const direct = superposedVelocity(panels, P);
  const explicit = add(
    vortexPanelVelocity(panels[0].A, panels[0].B, P, panels[0].gamma),
    vortexPanelVelocity(panels[1].A, panels[1].B, P, panels[1].gamma),
  );
  close(direct.x, explicit.x, 1e-14, 'superposition x');
  close(direct.y, explicit.y, 1e-14, 'superposition y');
}

// Including the two tip jumps, the complete trailing-circulation ledger closes.
{
  const trailing = trailingFilamentStrengths([0.2, 0.7, 1.0, 0.7, 0.2]);
  close(sum(trailing), 0, 1e-14, 'trailing-circulation closure');
}

// Every bound-circulation change leaves an equal-and-opposite wake entry.
{
  let bound = 0;
  let wake = 0;
  for (const nextBound of [0.3, 0.9, 0.1, -0.4, 0]) {
    wake += shedCirculation(bound, nextBound);
    bound = nextBound;
    close(bound + wake, 0, 1e-14, 'Kelvin circulation balance');
  }
}

console.log('computational-experimentation numerical acceptance tests passed');
