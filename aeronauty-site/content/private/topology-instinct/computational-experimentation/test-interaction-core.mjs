import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./interaction-core.js', import.meta.url), 'utf8');
const sandbox = {};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: 'interaction-core.js' });

const I = sandbox.ComputationalExperimentInteraction;
const close = (actual, expected, tolerance = 1e-11) => (
  Math.abs(actual - expected) <= tolerance
);
const closePoint = (actual, expected, tolerance = 1e-11) => (
  close(actual.x, expected.x, tolerance)
  && close(actual.y, expected.y, tolerance)
  && close(actual.z, expected.z, tolerance)
);

test('camera basis stays orthonormal and right-handed', () => {
  for (const [azimuth, elevation] of [[0, 0], [Math.PI / 2, 0], [-0.8, 0.65], [2.2, -1.1]]) {
    const { right, up, view } = I.cameraBasis(I.createCamera({ azimuth, elevation }));
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    const length = (value) => Math.hypot(value.x, value.y, value.z);
    const cross = {
      x: right.y * up.z - right.z * up.y,
      y: right.z * up.x - right.x * up.z,
      z: right.x * up.y - right.y * up.x,
    };
    assert.ok(close(length(right), 1));
    assert.ok(close(length(up), 1));
    assert.ok(close(length(view), 1));
    assert.ok(close(dot(right, up), 0));
    assert.ok(close(dot(right, view), 0));
    assert.ok(close(dot(up, view), 0));
    assert.ok(closePoint(cross, view));
  }
});

test('orthographic project and unproject round-trip at stored depth', () => {
  const camera = I.createCamera({
    target: { x: 0.1, y: -0.25, z: 0.4 },
    azimuth: 1.17,
    elevation: -0.73,
    zoom: 2.3,
  });
  const point = { x: 0.82, y: 0.31, z: -0.14 };
  const screen = I.projectPoint(point, 713, 419, camera);
  const restored = I.unprojectAtDepth(screen, I.cameraDepth(point, camera), 713, 419, camera);
  assert.ok(closePoint(restored, point));
});

test('view-plane dragging follows the pointer and preserves camera depth', () => {
  const camera = I.createCamera({ azimuth: -0.91, elevation: 0.77, zoom: 1.4 });
  const point = { x: 0.26, y: 0.71, z: 0.42 };
  const before = I.projectPoint(point, 640, 420, camera);
  const depth = I.cameraDepth(point, camera);
  const delta = I.screenPlaneDelta(47, -29, 640, 420, camera);
  const moved = I.translatePoint(point, delta);
  const after = I.projectPoint(moved, 640, 420, camera);
  assert.ok(close(after.x - before.x, 47));
  assert.ok(close(after.y - before.y, -29));
  assert.ok(close(I.cameraDepth(moved, camera), depth));
});

test('rigid bounded translation preserves a filament vector', () => {
  const start = { x: 0.12, y: 0.2, z: 0.3 };
  const end = { x: 0.8, y: 0.7, z: 0.62 };
  const requested = { x: 0.4, y: -0.3, z: 0.22 };
  const delta = I.rigidBoundedDelta([start, end], requested, {
    x: [0.04, 0.96],
    y: [0.06, 0.94],
    z: [0.06, 0.94],
  });
  const movedStart = I.translatePoint(start, delta);
  const movedEnd = I.translatePoint(end, delta);
  assert.ok(closePoint({
    x: movedEnd.x - movedStart.x,
    y: movedEnd.y - movedStart.y,
    z: movedEnd.z - movedStart.z,
  }, {
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z,
  }));
  for (const point of [movedStart, movedEnd]) {
    assert.ok(point.x >= 0.04 && point.x <= 0.96);
    assert.ok(point.y >= 0.06 && point.y <= 0.94);
    assert.ok(point.z >= 0.06 && point.z <= 0.94);
  }
});

test('camera pan moves the rendered scene by the requested CSS pixels', () => {
  const camera = I.createCamera({ azimuth: 0.42, elevation: 0.68, zoom: 1.7 });
  const point = { x: 0.2, y: 0.8, z: 0.33 };
  const before = I.projectPoint(point, 720, 480, camera);
  const movedCamera = I.createCamera({
    ...camera,
    target: I.panTarget(camera.target, 36, -21, 720, 480, camera),
  });
  const after = I.projectPoint(point, 720, 480, movedCamera);
  assert.ok(close(after.x - before.x, 36));
  assert.ok(close(after.y - before.y, -21));
});

test('cursor-anchored zoom leaves its world anchor on the same pixel', () => {
  const camera = I.createCamera({ azimuth: -0.7, elevation: 0.4, zoom: 0.8 });
  const cursor = { x: 493, y: 117 };
  const anchor = I.unprojectAtDepth(cursor, 0, 690, 430, camera);
  const zoomed = I.zoomCameraAt(camera, cursor, 690, 430, 2.6);
  const projected = I.projectPoint(anchor, 690, 430, zoomed);
  assert.ok(close(projected.x, cursor.x));
  assert.ok(close(projected.y, cursor.y));
});

test('orbit and zoom remain recoverable at their limits', () => {
  const camera = I.createCamera();
  const orbited = I.orbitCamera(camera, 100000, -100000);
  assert.ok(orbited.azimuth >= -Math.PI && orbited.azimuth < Math.PI);
  assert.equal(orbited.elevation, I.ELEVATION_LIMIT);
  assert.equal(I.zoomCameraAt(camera, { x: 100, y: 100 }, 500, 300, 100).zoom, I.MAX_ZOOM);
  assert.equal(I.zoomCameraAt(camera, { x: 100, y: 100 }, 500, 300, 0.01).zoom, I.MIN_ZOOM);
  I.resetCamera(orbited);
  assert.ok(closePoint(orbited.target, { x: 0.5, y: 0.5, z: 0.5 }));
  assert.equal(orbited.zoom, 1);
});

test('point-to-segment distance handles projected end points and collapse', () => {
  assert.ok(close(I.pointSegmentDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 3));
  assert.ok(close(I.pointSegmentDistance({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5));
  assert.ok(close(I.pointSegmentDistance({ x: 4, y: 5 }, { x: 1, y: 1 }, { x: 1, y: 1 }), 5));
});
