import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./unsteady-core.js', import.meta.url), 'utf8');
const theodorsenTable = JSON.parse(
  readFileSync(new URL('./assets/theodorsen-data.json', import.meta.url), 'utf8'),
);
const sandbox = {};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'unsteady-core.js' });

const U = sandbox.ComputationalExperimentUnsteady;
const close = (actual, expected, tolerance = 1e-11) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, received ${actual}`,
  );
};

test('pure heave and the equivalent body-fixed normal flow share one sign contract', () => {
  const state = U.harmonicHeave({
    time: 0.37,
    k: 0.5,
    chord: 1,
    freestream: 1,
    amplitude: 0.08,
    phase: 0.2,
  });
  const angle = state.omega * 0.37 + 0.2;
  close(state.omega, 1);
  close(state.h, 0.08 * Math.sin(angle));
  close(state.hDot, 0.08 * Math.cos(angle));
  close(state.normalVelocity, -state.hDot);
  close(state.normalVelocityDot, 0.08 * Math.sin(angle));
});

test('straight and trailing-edge-history wakes use the documented frame mapping', () => {
  const common = {
    time: 1.4,
    shedTime: 0.35,
    k: 0.5,
    chord: 1,
    freestream: 1,
    amplitude: 0.06,
    phase: 0,
  };
  const straight = U.straightWakePosition(common);
  const history = U.trailingEdgeHistoryPosition(common);
  close(straight.x, 2.05);
  close(straight.y, 0);
  close(history.x, 2.05);
  close(history.y, 0.06 * (Math.sin(0.35) - Math.sin(1.4)));
});

test('the quarter/three-quarter flat-plate DVM has the exact 2pi lift slope', () => {
  for (const panelCount of [1, 2, 8, 32]) {
    const dvm = U.createFlatPlateDvm({ panelCount, chord: 1 });
    const solution = U.solveBoundOnly(dvm, 1);
    close(solution.boundTotal, Math.PI, 2e-13);
    assert.ok(solution.boundaryResidual < 1e-13);
    const terms = U.pressureLiftTerms({
      dvm,
      boundStrengths: solution.boundStrengths,
      freestream: 1,
    });
    close(
      terms.potentialMoment,
      Math.PI * (0.75 + 0.25 / panelCount),
      3e-13,
    );
  }
});

test('the augmented first wake step fixes circulation sign and Kelvin closure exactly', () => {
  const dvm = U.createFlatPlateDvm({ panelCount: 1, chord: 1 });
  const solution = U.solveUnsteadyStep({
    dvm,
    normalVelocity: 1,
    oldWake: [],
    previousBoundTotal: 0,
    newWakePosition: { x: 1.025, y: 0 },
  });
  const expected = 11 * Math.PI / 31;
  close(solution.boundStrengths[0], expected, 2e-14);
  close(solution.newWakeCirculation, -expected, 2e-14);
  assert.ok(solution.boundaryResidual < 1e-13);
  assert.ok(Math.abs(solution.equationKelvinResidual) < 1e-13);
  assert.ok(Math.abs(solution.totalKelvinResidual) < 1e-13);
});

test('harmonic least squares returns the e^(i omega t) phasor convention', () => {
  const omega = 1.7;
  const samples = Array.from({ length: 97 }, (_, index) => {
    const time = index * 0.073;
    return {
      time,
      value: 0.4 + 2.25 * Math.cos(omega * time) - 1.75 * Math.sin(omega * time),
    };
  });
  const fit = U.fitHarmonicResponse(samples, omega);
  close(fit.mean, 0.4, 2e-13);
  close(fit.real, 2.25, 2e-13);
  close(fit.imag, 1.75, 2e-13);
});

test('Theodorsen table interpolation reproduces canonical complex values', () => {
  const cases = [
    [0.1, 0.831924104965, -0.172302228734],
    [0.5, 0.597936064250, -0.150709503163],
    [1, 0.539434871078, -0.100272902864],
  ];
  for (const [k, expectedReal, expectedImag] of cases) {
    const value = U.interpolateTheodorsen(k, theodorsenTable);
    close(value.real, expectedReal, 4e-5);
    close(value.imag, expectedImag, 4e-5);
    assert.equal(value.clamped, false);
  }
  const steady = U.interpolateTheodorsen(0, theodorsenTable);
  close(steady.real, 1);
  close(steady.imag, 0);
});

test('pressure-derived straight-wake response matches its deterministic fixture', () => {
  const result = U.runHarmonicResponse({
    k: 0.5,
    stage: 'straight',
    panelCount: 10,
    stepsPerCycle: 80,
    cycles: 12,
    measureCycles: 3,
    theodorsenTable,
  });
  close(result.circulatoryResponse.real, 0.6161125477232944, 2e-10);
  close(result.circulatoryResponse.imag, -0.12635588013598942, 2e-10);
  close(result.apparentMassResponse.real, 0, 2e-12);
  close(result.apparentMassResponse.imag, 0.25, 2e-12);
  close(
    result.totalLiftResponse.imag - result.circulatoryResponse.imag,
    0.25,
    2e-12,
  );
  assert.ok(result.comparison.passes);
  assert.ok(result.diagnostics.maximumBoundaryResidual < 1e-12);
  assert.ok(result.diagnostics.maximumKelvinResidual < 1e-12);
  assert.ok(
    Math.hypot(
      result.boundCirculationResponse.real - result.reference.real,
      result.boundCirculationResponse.imag - result.reference.imag,
    ) > 0.1,
    'raw bound circulation must not be mistaken for Theodorsen circulatory lift',
  );
});

test('live flat-wake settings pass at both reduced-frequency slider limits', () => {
  for (const k of [0.05, 1.2]) {
    const result = U.runHarmonicResponse({
      k,
      stage: 'straight',
      amplitude: 0.06,
      phase: Math.PI / 2,
      wakePlacement: 0.25,
      panelCount: 16,
      stepsPerCycle: 64,
      cycles: 8,
      measureCycles: 3,
      theodorsenTable,
    });
    assert.ok(
      result.comparison.passes,
      `live flat-wake calibration failed at k=${k}: ${JSON.stringify(result.comparison)}`,
    );
    assert.ok(result.diagnostics.maximumBoundaryResidual < 1e-11);
    assert.ok(result.diagnostics.maximumKelvinResidual < 1e-11);
  }
});

test('bound-only harmonic loading is reported as a quasi-steady calibration', () => {
  const result = U.runHarmonicResponse({
    k: 0.5,
    stage: 'bound',
    panelCount: 4,
    stepsPerCycle: 16,
    cycles: 3,
    measureCycles: 1,
  });
  close(result.circulatoryResponse.real, 1, 2e-12);
  close(result.circulatoryResponse.imag, 0, 2e-12);
  assert.equal(result.finalState.wake.length, 0);
  assert.ok(Number.isNaN(result.diagnostics.maximumKelvinResidual));
  assert.match(result.caveat, /not Kelvin-closed/);
});

test('all three wake modes are deterministic, Kelvin-closed, and small-amplitude comparable', () => {
  const responses = {};
  for (const stage of ['straight', 'sinusoidal', 'free']) {
    const result = U.runHarmonicResponse({
      k: 0.5,
      stage,
      panelCount: 6,
      stepsPerCycle: 32,
      cycles: 6,
      measureCycles: 2,
      coreRadius: 0.02,
    });
    responses[stage] = result.circulatoryResponse;
    assert.ok(Number.isFinite(result.circulatoryResponse.real));
    assert.ok(Number.isFinite(result.circulatoryResponse.imag));
    assert.ok(result.diagnostics.maximumBoundaryResidual < 1e-11);
    assert.ok(result.diagnostics.maximumKelvinResidual < 1e-11);
    assert.equal(result.finalState.wake.length, 192);
  }
  assert.ok(
    Math.hypot(
      responses.sinusoidal.real - responses.straight.real,
      responses.sinusoidal.imag - responses.straight.imag,
    ) < 1e-4,
    'prescribed wake geometry should be a higher-order small-amplitude change',
  );
  assert.ok(
    Math.hypot(
      responses.free.real - responses.straight.real,
      responses.free.imag - responses.straight.imag,
    ) < 0.03,
    'regularized free wake should remain near the linear reference at small amplitude',
  );
});

test('optional wake snapshots are phase-labelled and safely downsampled', () => {
  const result = U.runHarmonicResponse({
    k: 0.5,
    stage: 'te',
    panelCount: 4,
    stepsPerCycle: 32,
    cycles: 4,
    measureCycles: 1,
    phase: Math.PI / 2,
    snapshotCount: 8,
    maxSnapshotPoints: 10,
  });
  assert.equal(result.wakeSnapshots.length, 8);
  for (const snapshot of result.wakeSnapshots) {
    assert.ok(snapshot.phase >= -Math.PI && snapshot.phase <= Math.PI);
    assert.ok(Number.isFinite(snapshot.heave));
    assert.ok(Number.isFinite(snapshot.boundTotal));
    assert.ok(snapshot.wake.length > 0 && snapshot.wake.length <= 10);
    snapshot.wake.forEach((vortex) => {
      assert.ok(Number.isFinite(vortex.x));
      assert.ok(Number.isFinite(vortex.y));
      assert.ok(Number.isFinite(vortex.circulation));
      assert.ok(Number.isFinite(vortex.shedTime));
    });
  }
});

test('free wake excludes self induction and preserves strength during convection', () => {
  const dvm = U.createFlatPlateDvm({ panelCount: 1, chord: 1 });
  const wake = [
    { x: -0.5, y: 0, circulation: 1, shedTime: 0 },
    { x: 0.5, y: 0, circulation: 1, shedTime: 0 },
  ];
  const velocity = U.freeWakeVelocities({
    wake,
    dvm,
    boundStrengths: [0],
    freestream: 0,
    normalVelocity: 0,
    coreRadius: 0,
  });
  close(velocity[0].x, 0);
  close(velocity[0].y, 1 / (2 * Math.PI));
  close(velocity[1].x, 0);
  close(velocity[1].y, -1 / (2 * Math.PI));

  const convected = U.convectFreeWakeMidpoint({
    wake,
    dvm,
    boundStrengths: [0],
    previousBoundStrengths: [0],
    time: 0,
    dt: 0.1,
    k: 0.5,
    chord: 1,
    freestream: 1,
    amplitude: 0,
    inductionScale: 0,
  });
  close(convected[0].x, -0.4);
  close(convected[1].x, 0.6);
  close(convected[0].y, 0);
  close(convected[1].y, 0);
  close(convected[0].circulation, 1);
  close(convected[1].circulation, 1);

  assert.throws(() => U.freeWakeVelocities({
    wake: [
      { x: 0, y: 0, circulation: 1 },
      { x: 0, y: 0, circulation: -1 },
    ],
    dvm,
    boundStrengths: [0],
    freestream: 0,
    coreRadius: 0,
  }), /overlap without a core/);
});

test('comparison reports magnitude and signed phase errors independently', () => {
  const reference = { real: 0.6, imag: -0.15 };
  const closeResponse = U.compareResponse(
    { real: 0.61, imag: -0.14 },
    reference,
    { magnitudeRelativeTolerance: 0.05, phaseToleranceDegrees: 3 },
  );
  assert.equal(closeResponse.passes, true);
  const wrongPhase = U.compareResponse(
    { real: 0.6, imag: 0.15 },
    reference,
    { magnitudeRelativeTolerance: 0.05, phaseToleranceDegrees: 3 },
  );
  assert.equal(wrongPhase.passes, false);
  assert.ok(wrongPhase.phaseErrorDegrees > 0);
});
