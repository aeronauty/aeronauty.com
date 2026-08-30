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
  assert.deepEqual(worker.dispatch({ type: 'ping', protocolVersion: 1 }), []);
  assert.deepEqual(worker.dispatch({ type: 'solve', protocolVersion: 2 }), []);

  const messages = worker.dispatch({
    type: 'solve',
    protocolVersion: 1,
    requestId: 'bad-request',
    key: 'bad-key',
    aspectRatio: 8,
    alphaDeg: 6,
  });
  assert.deepEqual(messages, [{
    type: 'result',
    protocolVersion: 1,
    requestId: 'bad-request',
    key: 'bad-key',
    error: 'spanPanels must be a positive integer',
  }]);
});

test('straight worker solve clamps inputs and exposes steady pressure aliases', () => {
  const worker = createWorkerHarness();
  const messages = worker.dispatch({
    type: 'solve',
    protocolVersion: 1,
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
  assert.equal(result.protocolVersion, 1);
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
});

test('free worker solve reports progress, wake invariants and transient pressure lift', () => {
  const worker = createWorkerHarness();
  const messages = worker.dispatch({
    type: 'solve',
    protocolVersion: 1,
    requestId: 11,
    key: 'free-default',
    wakeMode: 'free',
    aspectRatio: 8,
    alphaDeg: 6,
    spanPanels: 12,
  });

  assert.deepEqual(messages.map((message) => message.type), [
    'progress',
    'progress',
    'progress',
    'result',
  ]);
  const progress = messages.slice(0, -1);
  assert.deepEqual(progress.map((message) => message.completed), [4, 8, 12]);
  progress.forEach((message) => {
    assert.equal(message.total, 16);
    assert.equal(message.protocolVersion, 1);
    assert.equal(message.requestId, 11);
    assert.equal(message.key, 'free-default');
  });

  const result = messages.at(-1);
  assert.equal(result.wakeMode, 'free');
  assert.equal(result.config.unknowns, 12);
  assert.equal(result.wake.step, 16);
  close(result.wake.time, 1.92, 1e-12);
  assert.equal(result.wake.nodeRows.length, 15);
  assert.equal(result.wake.strengthRows.length, 15);
  result.wake.nodeRows.forEach((row) => {
    assert.equal(row.length, 13);
    row.forEach((point) => point.forEach((coordinate) => {
      assert.ok(Number.isFinite(coordinate));
    }));
  });
  result.wake.strengthRows.forEach((row) => {
    assert.equal(row.length, 12);
    row.forEach((strength) => assert.ok(Number.isFinite(strength)));
  });

  const metrics = result.metrics;
  close(metrics.CL, 0.4376940645054386, 5e-12);
  close(metrics.pressureCirculatoryCL, metrics.CL, 1e-12);
  close(metrics.accelerationCL, 0.030818612428744518, 5e-12);
  close(metrics.totalPressureCL, 0.4685126769341831, 5e-12);
  close(
    metrics.totalPressureCL,
    metrics.pressureCirculatoryCL + metrics.accelerationCL,
    1e-12,
  );
  assert.ok(metrics.accelerationCL > 0);
  assert.ok(Math.abs(metrics.totalPressureCL - metrics.CL) > 1e-3);
  assert.ok(metrics.maxBoundaryResidual < 1e-12);
  assert.ok(Math.abs(metrics.trailingClosure) < 1e-12);
  assert.ok(metrics.sheddingResidual < 1e-12);
  assert.ok(metrics.filamentContinuityResidual < 1e-12);
  close(metrics.wakeAge, 1.92, 1e-12);
  assert.equal(metrics.wakeRows, 15);
  assert.equal(metrics.coreRadius, 0.05);
  assert.ok(metrics.maxInducedSpeed > 0);
  assert.equal(result.wake.diagnostics.mode, 'free');
  assert.equal(result.wake.diagnostics.integrator, 'heun');
  assert.ok(result.wake.diagnostics.skippedIncidentSegments > 0);
});
