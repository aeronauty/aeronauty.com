import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./vlm-core.js', import.meta.url), 'utf8');
const sandbox = {};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'vlm-core.js' });

const V = sandbox.ComputationalExperimentVLM;
const close = (actual, expected, tolerance = 1e-12) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, received ${actual}`,
  );
};
const maxAbs = (values) => Math.max(0, ...values.map((value) => Math.abs(value)));
const finitePoint = (point) => (
  Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
);

test('finite segment matches the K&P kernel, orientation, core and singular guards', () => {
  const A = { x: 0, y: -1, z: 0 };
  const B = { x: 0, y: 1, z: 0 };
  const P = { x: 1, y: 0, z: 0 };
  const exact = -Math.SQRT2 / (4 * Math.PI);
  const velocity = V.finiteVortexSegmentVelocity(A, B, P);

  close(velocity.x, 0, 1e-15);
  close(velocity.y, 0, 1e-15);
  close(velocity.z, exact, 1e-14);
  close(V.finiteVortexSegmentVelocity(B, A, P).z, -exact, 1e-14);

  const cored = V.finiteVortexSegmentVelocity(A, B, P, 1, 0.5);
  close(cored.z, 0.8 * exact, 1e-14);
  assert.ok(Math.abs(cored.z) < Math.abs(velocity.z));

  for (const guarded of [
    V.finiteVortexSegmentVelocity(A, B, A),
    V.finiteVortexSegmentVelocity(A, A, P),
    V.finiteVortexSegmentVelocity(A, B, { x: 0, y: 2, z: 0 }),
  ]) {
    assert.deepEqual(
      { x: guarded.x, y: guarded.y, z: guarded.z },
      { x: 0, y: 0, z: 0 },
    );
  }
  assert.throws(
    () => V.finiteVortexSegmentVelocity(A, B, P, 1, -0.01),
    /coreRadius cannot be negative/,
  );
});

test('rectangular lattice uses quarter-chord rings and three-quarter-chord collocation', () => {
  const lattice = V.createRectangularWingLattice({
    chord: 2,
    span: 4,
    chordPanels: 2,
    spanPanels: 4,
    spanSpacing: 'uniform',
    origin: { x: 1, y: 2, z: 3 },
  });

  assert.deepEqual(Array.from(lattice.xRows), [1.25, 2.25, 3.25]);
  assert.deepEqual(Array.from(lattice.yEdges), [0, 1, 2, 3, 4]);
  assert.equal(lattice.trailingEdgeX, 3);
  assert.equal(lattice.wakeAttachX, 3.25);
  assert.equal(lattice.referenceArea, 8);
  assert.equal(lattice.aspectRatio, 2);
  assert.equal(lattice.panels.length, 8);
  assert.deepEqual(Array.from(lattice.trailingEdgePanelIndices), [4, 5, 6, 7]);

  const first = lattice.panels[0];
  const aft = lattice.panels[4];
  assert.deepEqual(
    { x: first.collocation.x, y: first.collocation.y, z: first.collocation.z },
    { x: 1.75, y: 0.5, z: 3 },
  );
  assert.deepEqual(
    { x: aft.collocation.x, y: aft.collocation.y, z: aft.collocation.z },
    { x: 2.75, y: 0.5, z: 3 },
  );
  lattice.panels.forEach((panel) => {
    assert.equal(panel.area, 1);
    assert.deepEqual(
      { x: panel.normal.x, y: panel.normal.y, z: panel.normal.z },
      { x: 0, y: 0, z: 1 },
    );
  });
});

test('linear solve and residual helpers share one deterministic contract', () => {
  const matrix = [[3, 2], [1, 2]];
  const rightHandSide = [5, 3];
  const solved = V.solveLinearSystem(matrix, rightHandSide);
  close(solved.solution[0], 1, 1e-14);
  close(solved.solution[1], 1, 1e-14);
  close(solved.pivotSpread, 2.25, 1e-14);
  assert.ok(maxAbs(V.matrixResidual(matrix, solved.solution, rightHandSide)) < 1e-14);

  assert.throws(
    () => V.solveLinearSystem([[1, 2], [2, 4]], [1, 2]),
    /singular or ill-conditioned/,
  );
  assert.throws(
    () => V.solveLinearSystem([[1]], [1, 2]),
    /dimensions do not match/,
  );
});

test('steady VLM fixture is symmetric, residual-clean and load-consistent', () => {
  const lattice = V.createRectangularWingLattice({
    chord: 1,
    span: 6,
    chordPanels: 2,
    spanPanels: 8,
    spanSpacing: 'cosine',
  });
  const result = V.solveSteadyVlm({ lattice, alphaDeg: 5 });

  close(result.wakeLength, 600, 1e-14);
  close(result.CL, 0.3897302396424703, 1e-12);
  close(result.loads.lift, 1.1691907189274109, 1e-12);
  close(result.loads.force.z, result.loads.lift, 1e-14);
  close(result.loads.force.x, -0.10229093340587345, 1e-12);
  close(result.loads.dynamicPressure, 0.5, 1e-14);
  close(result.CL, 2 * result.loads.lift / 6, 1e-14);
  close(V.dot3(result.loads.force, result.freestream), 0, 1e-13);
  assert.ok(result.maxBoundaryResidual < 1e-12);

  const gamma = result.loads.spanwiseCirculation;
  for (let index = 0; index < gamma.length; index += 1) {
    close(gamma[index], gamma[gamma.length - 1 - index], 1e-13);
  }
  close(gamma[3], 0.21977005422289592, 1e-12);

  const reference = V.liftingLineRectangularReference({
    aspectRatio: lattice.aspectRatio,
    alphaDeg: 5,
    terms: 20,
  });
  assert.ok(Math.abs(result.CL - reference.CL) / reference.CL < 0.02);
});

test('Prandtl rectangular reference is deterministic and has the correct aspect-ratio trend', () => {
  const alphaDeg = 5;
  const reference = V.liftingLineRectangularReference({
    aspectRatio: 6,
    alphaDeg,
    terms: 20,
  });
  close(reference.CL, 0.3953537760947834, 1e-12);
  close(reference.liftSlope, 4.530420556958245, 1e-12);
  assert.ok(maxAbs(reference.residual) < 1e-12);

  const slopes = [4, 8, 12].map((aspectRatio) => (
    V.liftingLineRectangularReference({ aspectRatio, alphaDeg, terms: 20 }).liftSlope
  ));
  close(slopes[0], 4.02838395044743, 1e-12);
  close(slopes[1], 4.837697917266597, 1e-12);
  close(slopes[2], 5.199075505300553, 1e-12);
  assert.ok(slopes[0] < slopes[1] && slopes[1] < slopes[2]);
  assert.ok(slopes[2] < 2 * Math.PI);

  const negative = V.liftingLineRectangularReference({
    aspectRatio: 6,
    alphaDeg: -alphaDeg,
    terms: 20,
  });
  close(negative.CL, -reference.CL, 1e-12);
  const zero = V.liftingLineRectangularReference({ aspectRatio: 6, alphaDeg: 0 });
  close(zero.CL, 0, 1e-14);
  assert.ok(Number.isNaN(zero.liftSlope));
});

test('filament assembly cancels shared edges and explicitly excludes incident segments', () => {
  const point = (x, y, id) => ({ x, y, z: 0, id });
  const a = point(0, 0, 'a');
  const b = point(1, 0, 'b');
  const c = point(1, 1, 'c');
  const d = point(0, 1, 'd');
  const e = point(2, 0, 'e');
  const f = point(2, 1, 'f');
  const rings = [
    { corners: [a, b, c, d], nodeIds: ['a', 'b', 'c', 'd'], strength: 1 },
    { corners: [b, e, f, c], nodeIds: ['b', 'e', 'f', 'c'], strength: 1 },
  ];
  const filaments = V.assembleFilaments(rings);

  assert.equal(filaments.length, 6);
  assert.equal(
    filaments.some((filament) => (
      (filament.aId === 'b' && filament.bId === 'c')
      || (filament.aId === 'c' && filament.bId === 'b')
    )),
    false,
  );
  assert.ok(V.filamentClosureResidual(filaments).maxResidual < 1e-14);

  const oneRing = V.assembleFilaments([rings[0]]);
  const induced = V.inducedVelocityFromFilaments(a, oneRing, {
    excludeNodeId: 'a',
    coreRadius: 0.05,
    withDiagnostics: true,
  });
  assert.equal(induced.skippedIncidentSegments, 2);
  close(induced.velocity.x, 0, 1e-14);
  close(induced.velocity.y, 0, 1e-14);
  close(induced.velocity.z, 0.11225889228891596, 1e-14);
});

test('unsteady shedding copies the previous trailing-edge circulation exactly', () => {
  const lattice = V.createRectangularWingLattice({
    chord: 1,
    span: 4,
    chordPanels: 1,
    spanPanels: 4,
    spanSpacing: 'cosine',
  });
  const common = {
    lattice,
    alphaDeg: 5,
    dt: 0.1,
    mode: 'flat',
    shedFraction: 0.25,
    maxWakeRows: 4,
  };
  const first = V.stepUnsteadyVlm({ ...common, wake: V.createWakeState(lattice) });
  assert.equal(first.shedStrengths, null);
  assert.equal(first.wake.nodeRows.length, 0);
  const expectedTrailing = [
    0.10074328580939805,
    0.1288702858459023,
    0.12887028584590227,
    0.10074328580939804,
  ];
  expectedTrailing.forEach((expected, index) => {
    close(first.trailingStrengths[index], expected, 1e-13);
  });

  const second = V.stepUnsteadyVlm({ ...common, wake: first.wake });
  assert.equal(second.wake.nodeRows.length, 1);
  assert.equal(second.wake.strengthRows.length, 1);
  assert.equal(second.wake.step, 2);
  close(second.wake.time, 0.2, 1e-14);
  first.trailingStrengths.forEach((strength, index) => {
    assert.equal(second.shedStrengths[index], strength);
    assert.equal(second.wake.strengthRows[0][index], strength);
  });
  assert.equal(second.shedConsistencyResidual, 0);
  assert.ok(second.maxBoundaryResidual < 1e-12);
  assert.ok(second.filamentContinuityResidual < 1e-12);
  close(second.wake.nodeRows[0].points[0].x, 1.2749048674522937, 1e-13);
});

test('free-wake Heun run has a deterministic snapshot and self-exclusion diagnostics', () => {
  const lattice = V.createRectangularWingLattice({
    chord: 1,
    span: 4,
    chordPanels: 1,
    spanPanels: 4,
    spanSpacing: 'cosine',
  });
  const options = {
    lattice,
    alphaDeg: 5,
    speed: 1,
    dt: 0.1,
    steps: 4,
    mode: 'free',
    coreRadius: 0.05,
    integrator: 'heun',
    shedFraction: 0.25,
    maxWakeRows: 8,
  };
  const run = V.runWakeSimulation(options);
  const repeated = V.runWakeSimulation(options);
  const snapshot = V.wakeSnapshot(run.wake, 9);

  assert.equal(JSON.stringify(run.snapshot), JSON.stringify(repeated.snapshot));
  close(run.history.at(-1).CL, 0.2712907762105489, 1e-12);
  close(run.history.at(-1).pressureCL, 0.3644919660596843, 1e-12);
  close(snapshot.time, 0.4, 1e-14);
  assert.equal(snapshot.step, 4);
  assert.equal(snapshot.nodeRows.length, 3);
  assert.deepEqual(Array.from(snapshot.nodeRows[0].points[0]), [1.274904867, -2, 0.002178894]);
  [1.474050474, 0, 0.016494545].forEach((expected, index) => {
    close(snapshot.nodeRows[2].points[2][index], expected, 1e-12);
  });
  assert.deepEqual(
    Array.from(snapshot.strengthRows[0]),
    [0.107564238, 0.140068707, 0.140068707, 0.107564238],
  );

  const diagnostics = run.wake.lastConvectionDiagnostics;
  assert.equal(diagnostics.mode, 'free');
  assert.equal(diagnostics.integrator, 'heun');
  assert.equal(diagnostics.coreRadius, 0.05);
  assert.equal(diagnostics.skippedIncidentSegments, 56);
  assert.equal(diagnostics.filamentCount, 28);
  close(diagnostics.maxInducedSpeed, 0.17866849656967207, 1e-12);
  run.history.forEach((entry) => {
    assert.ok(entry.maxBoundaryResidual < 1e-12);
    assert.ok(entry.filamentContinuityResidual < 1e-12);
  });
  run.wake.nodeRows.forEach((row) => row.points.forEach((current) => {
    assert.ok(finitePoint(current));
  }));
});

test('time step, core radius and span grid are active but numerically bounded', () => {
  const simulate = ({ dt, steps, coreRadius }) => {
    const lattice = V.createRectangularWingLattice({
      chord: 1,
      span: 4,
      chordPanels: 1,
      spanPanels: 6,
      spanSpacing: 'cosine',
    });
    return V.runWakeSimulation({
      lattice,
      alphaDeg: 6,
      dt,
      steps,
      mode: 'free',
      coreRadius,
      integrator: 'heun',
      shedFraction: 0.25,
      maxWakeRows: steps,
    });
  };

  const baseline = simulate({ dt: 0.1, steps: 8, coreRadius: 0.05 });
  const halfStep = simulate({ dt: 0.05, steps: 16, coreRadius: 0.05 });
  const narrowCore = simulate({ dt: 0.1, steps: 8, coreRadius: 0.025 });
  const wideCore = simulate({ dt: 0.1, steps: 8, coreRadius: 0.2 });
  const baselineCL = baseline.history.at(-1).CL;
  const halfStepCL = halfStep.history.at(-1).CL;
  const narrowCoreCL = narrowCore.history.at(-1).CL;
  const wideCoreCL = wideCore.history.at(-1).CL;

  close(baselineCL, 0.3492856188680103, 1e-11);
  close(halfStepCL, 0.3557155010661582, 1e-11);
  close(narrowCoreCL, 0.3492841985211788, 1e-11);
  close(wideCoreCL, 0.34926528882095814, 1e-11);
  assert.ok(Math.abs(halfStepCL - baselineCL) < 0.01);
  assert.ok(Math.abs(wideCoreCL - narrowCoreCL) < 1e-3);

  const narrowOldest = V.wakeSnapshot(narrowCore.wake, 12).nodeRows.at(-1).points[3];
  const wideOldest = V.wakeSnapshot(wideCore.wake, 12).nodeRows.at(-1).points[3];
  close(narrowOldest[2], 0.058545241621, 1e-12);
  close(wideOldest[2], 0.054171927752, 1e-12);
  assert.ok(Math.abs(narrowOldest[2] - wideOldest[2]) > 0.003);

  const gridResults = [4, 8, 12, 16].map((spanPanels) => {
    const lattice = V.createRectangularWingLattice({
      chord: 1,
      span: 6,
      chordPanels: 2,
      spanPanels,
      spanSpacing: 'cosine',
    });
    return V.solveSteadyVlm({ lattice, alphaDeg: 5 });
  });
  const expectedCL = [
    0.4073007896442249,
    0.3897302396424703,
    0.38241012861419194,
    0.3784103001795434,
  ];
  gridResults.forEach((result, index) => {
    close(result.CL, expectedCL[index], 1e-11);
    assert.ok(result.maxBoundaryResidual < 1e-12);
  });
  const changes = gridResults.slice(1).map((result, index) => (
    Math.abs(result.CL - gridResults[index].CL)
  ));
  assert.ok(changes[0] > changes[1] && changes[1] > changes[2]);
});

test('dynamic trailing closure retains successive K&P wake lines', () => {
  const dt = 0.1;
  const makeLattice = () => V.createRectangularWingLattice({
    chord: 1,
    span: 4,
    chordPanels: 1,
    spanPanels: 4,
    spanSpacing: 'cosine',
    wakeAttachOffset: { x: 0.25 * dt, y: 0, z: 0 },
  });
  const firstLattice = makeLattice();
  const first = V.stepUnsteadyVlm({
    lattice: firstLattice,
    wake: V.createWakeState(firstLattice),
    freestream: { x: 1, y: 0, z: Math.tan(5 * Math.PI / 180) },
    dt,
    mode: 'flat',
    dynamicWakeAttachment: true,
  });
  close(firstLattice.wakeAttachX, 1.025, 1e-14);
  assert.equal(first.wake.nodeRows.length, 0);
  assert.equal(first.wake.pendingAttachmentRow.points[0].x, 1.025);

  const second = V.stepUnsteadyVlm({
    lattice: makeLattice(),
    wake: first.wake,
    freestream: { x: 1, y: 0, z: Math.tan(5 * Math.PI / 180) },
    dt,
    mode: 'flat',
    dynamicWakeAttachment: true,
  });
  assert.equal(second.wake.nodeRows.length, 1);
  close(second.wake.nodeRows[0].points[0].x, 1.125, 1e-14);
  close(
    second.wake.nodeRows[0].points[0].x - second.lattice.wakeAttachX,
    0.1,
    1e-14,
  );
  first.trailingStrengths.forEach((strength, index) => {
    close(second.shedStrengths[index], strength, 1e-14);
  });
  assert.ok(second.shedConsistencyResidual < 1e-14);
  assert.ok(second.filamentContinuityResidual < 1e-12);
});

test('harmonic fitting recovers amplitude, phase and offset', () => {
  const omega = 1.7;
  const phase = -0.42;
  const magnitude = 2.3;
  const samples = Array.from({ length: 48 }, (_, index) => {
    const time = index * 2 * Math.PI / (omega * 48);
    return {
      time,
      value: 0.7 + magnitude * Math.cos(omega * time + phase),
    };
  });
  const fit = V.fitHarmonicResponse(samples, omega);
  close(fit.magnitude, magnitude, 1e-13);
  close(fit.phaseRadians, phase, 1e-13);
  close(fit.offset, 0.7, 1e-13);
  assert.ok(fit.relativeRmsResidual < 1e-13);
});

test('TE-history and zero-induction free wake are frame-exact and identical', () => {
  const options = {
    aspectRatio: 6,
    reducedFrequency: 0.5,
    amplitude: 0.02,
    spanPanels: 4,
    chordPanels: 2,
    stepsPerCycle: 12,
    cycles: 3,
    measureCycles: 2,
    snapshotCount: 0,
  };
  const prescribed = V.runHarmonicUvlm({ ...options, stage: 'te' });
  const zeroInduction = V.runHarmonicUvlm({
    ...options,
    stage: 'free',
    inductionScale: 0,
    activeWakeRows: 6,
  });
  assert.equal(prescribed.finalState.nodeRows.length, zeroInduction.finalState.nodeRows.length);
  prescribed.finalState.nodeRows.forEach((row, rowIndex) => {
    row.points.forEach((point, pointIndex) => {
      const compared = zeroInduction.finalState.nodeRows[rowIndex].points[pointIndex];
      close(point.x, compared.x, 1e-13);
      close(point.y, compared.y, 1e-13);
      close(point.z, compared.z, 1e-13);
    });
  });
  close(
    prescribed.response.circulatory.magnitude,
    zeroInduction.response.circulatory.magnitude,
    1e-13,
  );
  close(
    prescribed.response.circulatory.phaseDegrees,
    zeroInduction.response.circulatory.phaseDegrees,
    1e-13,
  );
});

test('harmonic UVLM settles, preserves its wake and refines in time', () => {
  const common = {
    stage: 'flat',
    aspectRatio: 8,
    reducedFrequency: 0.35,
    amplitude: 0.03,
    spanPanels: 6,
    chordPanels: 2,
    cycles: 4,
    measureCycles: 2,
    snapshotCount: 0,
  };
  const defaultRun = V.runHarmonicUvlm({ ...common, stepsPerCycle: 24 });
  const refined = V.runHarmonicUvlm({ ...common, stepsPerCycle: 32 });
  const gridRefined = V.runHarmonicUvlm({
    ...common,
    spanPanels: 8,
    stepsPerCycle: 24,
  });
  close(defaultRun.addedMassPotentialGain, 2.1281671662566386, 1e-11);
  close(defaultRun.response.circulatory.magnitude, 0.8392133863665207, 1e-11);
  close(defaultRun.response.circulatory.phaseDegrees, -9.92298490074978, 1e-11);
  assert.equal(defaultRun.diagnostics.wakeRows, 95);
  assert.equal(defaultRun.finalState.pendingAttachmentRow.points.length, 7);
  assert.equal(defaultRun.periodicity.converged, true);
  assert.equal(defaultRun.periodicity.residualGate.passed, true);
  assert.ok(defaultRun.periodicity.fitRelativeRms < 1e-4);
  assert.ok(defaultRun.diagnostics.maximumBoundaryResidual < 1e-12);
  assert.ok(defaultRun.diagnostics.maximumSheddingResidual < 1e-12);
  assert.ok(defaultRun.diagnostics.maximumContinuityResidual < 1e-12);
  assert.ok(defaultRun.diagnostics.normalizedBoundaryResidual < 1e-10);
  assert.ok(defaultRun.diagnostics.normalizedSheddingResidual < 1e-12);
  assert.ok(defaultRun.diagnostics.normalizedContinuityResidual < 1e-12);
  const plotted = V.fitHarmonicResponse(
    defaultRun.trace,
    defaultRun.config.omega,
    'pressureCirculatoryCL',
  );
  const input = V.fitHarmonicResponse(
    defaultRun.trace,
    defaultRun.config.omega,
    'normalVelocityRatio',
  );
  const inputNorm = input.real ** 2 + input.imag ** 2;
  const plottedReal = (
    plotted.real * input.real + plotted.imag * input.imag
  ) / inputNorm / defaultRun.steadyLiftSlope;
  const plottedImag = (
    plotted.imag * input.real - plotted.real * input.imag
  ) / inputNorm / defaultRun.steadyLiftSlope;
  const plottedMagnitude = Math.hypot(plottedReal, plottedImag);
  const plottedPhase = Math.atan2(plottedImag, plottedReal) * 180 / Math.PI;
  assert.ok(
    Math.abs(plottedMagnitude - defaultRun.response.circulatory.magnitude)
      / defaultRun.response.circulatory.magnitude < 0.01,
  );
  assert.ok(
    Math.abs(plottedPhase - defaultRun.response.circulatory.phaseDegrees) < 1,
  );
  assert.ok(
    Math.abs(refined.response.circulatory.magnitude
      - defaultRun.response.circulatory.magnitude) / refined.response.circulatory.magnitude < 0.02,
  );
  assert.ok(
    Math.abs(refined.response.circulatory.phaseDegrees
      - defaultRun.response.circulatory.phaseDegrees) < 1.5,
  );
  assert.ok(
    Math.abs(gridRefined.response.circulatory.magnitude
      - defaultRun.response.circulatory.magnitude)
      / gridRefined.response.circulatory.magnitude < 0.03,
  );
  assert.ok(
    Math.abs(gridRefined.response.circulatory.phaseDegrees
      - defaultRun.response.circulatory.phaseDegrees) < 2,
  );
});

test('near-wake cutoff and core sensitivity stay inside the published free-wake gate', () => {
  const common = {
    stage: 'free',
    aspectRatio: 6,
    reducedFrequency: 0.5,
    amplitude: 0.03,
    spanPanels: 4,
    chordPanels: 2,
    stepsPerCycle: 12,
    cycles: 3,
    measureCycles: 2,
    snapshotCount: 0,
  };
  const shortActive = V.runHarmonicUvlm({ ...common, activeWakeRows: 4, coreRadius: 0.02 });
  const longActive = V.runHarmonicUvlm({ ...common, activeWakeRows: 8, coreRadius: 0.02 });
  const wideCore = V.runHarmonicUvlm({ ...common, activeWakeRows: 8, coreRadius: 0.04 });
  for (const compared of [shortActive, wideCore]) {
    assert.ok(
      Math.abs(compared.response.circulatory.magnitude
        - longActive.response.circulatory.magnitude)
        / longActive.response.circulatory.magnitude < 0.05,
    );
    assert.ok(
      Math.abs(compared.response.circulatory.phaseDegrees
        - longActive.response.circulatory.phaseDegrees) < 3,
    );
  }
  assert.equal(shortActive.diagnostics.wakeRows, longActive.diagnostics.wakeRows);
  assert.equal(longActive.periodicity.converged, true);
  assert.equal(wideCore.periodicity.converged, true);
});
