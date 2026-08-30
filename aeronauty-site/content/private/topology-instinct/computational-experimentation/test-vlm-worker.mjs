import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const coreSource = readFileSync(new URL('./vlm-core.js', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('./vlm-worker.js', import.meta.url), 'utf8');

const close = (actual, expected, tolerance = 1e-12) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, received ${actual}`,
  );
};

function createWorkerHarness() {
  const posted = [];
  let messageHandler = null;
  let context;
  const sandbox = {
    addEventListener(type, handler) {
      if (type === 'message') messageHandler = handler;
    },
    importScripts(...names) {
      names.forEach((name) => {
        assert.equal(name, 'vlm-core.js');
        vm.runInContext(coreSource, context, { filename: name });
      });
    },
    postMessage(message) {
      posted.push(JSON.parse(JSON.stringify(message)));
    },
  };
  sandbox.globalThis = sandbox;
  context = vm.createContext(sandbox);
  vm.runInContext(workerSource, context, { filename: 'vlm-worker.js' });
  assert.equal(typeof messageHandler, 'function');

  return {
    dispatch(data) {
      const start = posted.length;
      messageHandler({ data });
      return posted.slice(start);
    },
  };
}

test('worker filters unsupported messages and correlates solver errors', () => {
  const worker = createWorkerHarness();
  assert.deepEqual(worker.dispatch({ type: 'ping', protocolVersion: 2 }), []);
  assert.deepEqual(worker.dispatch({ type: 'solve', protocolVersion: 1 }), []);

  const messages = worker.dispatch({
    type: 'solve',
    protocolVersion: 2,
    requestId: 'bad-request',
    key: 'bad-key',
    aspectRatio: 8,
    alphaDeg: 6,
  });
  assert.deepEqual(messages, [{
    type: 'result',
    protocolVersion: 2,
    requestId: 'bad-request',
    key: 'bad-key',
    error: 'spanPanels must be a positive integer',
  }]);
});

test('straight worker solve clamps inputs and exposes steady pressure aliases', () => {
  const worker = createWorkerHarness();
  const messages = worker.dispatch({
    type: 'solve',
    protocolVersion: 2,
    requestId: 7,
    key: 'straight-clamped',
    wakeMode: 'straight',
    aspectRatio: 999,
    alphaDeg: -4,
    spanPanels: 99,
  });
  assert.equal(messages.length, 1);
  const result = messages[0];

  assert.equal(result.type, 'result');
  assert.equal(result.protocolVersion, 2);
  assert.equal(result.requestId, 7);
  assert.equal(result.key, 'straight-clamped');
  assert.equal(result.wakeMode, 'straight');
  assert.deepEqual(result.config, {
    aspectRatio: 12,
    alphaDeg: 1,
    chordPanels: 1,
    spanPanels: 16,
    unknowns: 16,
  });
  assert.equal(result.wake, null);
  close(result.metrics.CL, 0.08954339460325834, 1e-12);
  assert.equal(result.metrics.pressureCirculatoryCL, result.metrics.CL);
  assert.equal(result.metrics.accelerationCL, 0);
  assert.equal(result.metrics.totalPressureCL, result.metrics.CL);
  assert.ok(result.metrics.maxBoundaryResidual < 1e-12);
  assert.ok(Math.abs(result.metrics.trailingClosure) < 1e-12);
  assert.equal(result.geometry.yEdges.length, 17);
  assert.equal(result.spanwise.circulation.length, 16);
  for (let index = 0; index < result.spanwise.circulation.length; index += 1) {
    close(
      result.spanwise.circulation[index],
      result.spanwise.circulation[result.spanwise.circulation.length - 1 - index],
      1e-13,
    );
  }

  const quick = worker.dispatch({
    type: 'solve',
    protocolVersion: 2,
    requestId: 8,
    key: 'straight-quick',
    wakeMode: 'straight',
    aspectRatio: 8,
    alphaDeg: 6,
    spanPanels: 6,
  });
  assert.equal(quick[0].config.spanPanels, 6);
  assert.equal(quick[0].config.unknowns, 6);
});

test('harmonic worker reports settled staged responses and retained wake history', () => {
  const worker = createWorkerHarness();
  const messages = worker.dispatch({
    type: 'solve',
    protocolVersion: 2,
    requestId: 11,
    key: 'free-default',
    wakeMode: 'harmonic',
    aspectRatio: 8,
    alphaDeg: 6,
    spanPanels: 6,
    reducedFrequency: 0.35,
    amplitude: 0.03,
  });

  assert.deepEqual(messages.map((message) => message.type), ['progress','progress','progress','result']);
  const progress = messages.slice(0, -1);
  assert.deepEqual(progress.map((message) => message.completed), [1, 2, 3]);
  assert.deepEqual(progress.map((message) => message.stage), ['flat', 'te', 'free']);
  progress.forEach((message) => {
    assert.equal(message.total, 3);
    assert.equal(message.protocolVersion, 2);
    assert.equal(message.requestId, 11);
    assert.equal(message.key, 'free-default');
  });

  const result = messages.at(-1);
  assert.equal(result.wakeMode, 'harmonic');
  assert.equal(result.config.chordPanels, 2);
  assert.equal(result.config.spanPanels, 6);
  assert.equal(result.config.unknowns, 12);
  assert.equal(result.config.stepsPerCycle, 24);
  assert.equal(result.config.cycles, 4);
  assert.equal(result.config.activeWakeRows, 12);
  assert.equal(result.snapshots.length, 12);
  assert.equal(result.trace.length, 24);
  assert.deepEqual(Object.keys(result.stages), ['flat', 'te', 'free']);
  close(result.stages.flat.response.circulatory.magnitude, 0.8392133863665207, 1e-11);
  close(result.stages.free.response.circulatory.phaseDegrees, -9.92263385600078, 1e-11);
  for (const stage of Object.values(result.stages)) {
    assert.equal(stage.periodicity.converged, true);
    assert.equal(stage.periodicity.residualGate.passed, true);
    assert.ok(stage.periodicity.magnitudeRelative < 0.001);
    assert.ok(stage.periodicity.phaseDegrees < 0.01);
    assert.ok(stage.diagnostics.maximumBoundaryResidual < 1e-12);
    assert.ok(stage.diagnostics.maximumSheddingResidual < 1e-12);
    assert.ok(stage.diagnostics.maximumContinuityResidual < 1e-12);
    assert.ok(stage.diagnostics.normalizedBoundaryResidual < 1e-10);
    assert.ok(stage.diagnostics.normalizedSheddingResidual < 1e-12);
    assert.ok(stage.diagnostics.normalizedContinuityResidual < 1e-12);
    assert.equal(stage.diagnostics.wakeRows, 95);
    stage.trace.forEach((sample) => {
      assert.ok(Number.isFinite(sample.pressureCirculatoryCL));
      assert.ok(Number.isFinite(sample.apparentMassCL));
    });
  }
  assert.ok(result.stages.free.diagnostics.maximumInducedSpeed > 0);
  result.snapshots.forEach((snapshot, index) => {
    assert.ok(snapshot.wake.totalRows >= 73 && snapshot.wake.totalRows <= 95);
    if (index) assert.ok(snapshot.wake.totalRows > result.snapshots[index - 1].wake.totalRows);
    assert.equal(snapshot.wake.nodeRows.length, 48);
    assert.equal(snapshot.wake.strengthRows.length, 48);
    assert.equal(snapshot.wake.pendingAttachmentRow.points.length, 7);
  });
  assert.equal(result.snapshots.at(-1).wake.totalRows, 95);
});
