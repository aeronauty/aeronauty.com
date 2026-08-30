/**
 * Pure orthographic camera and dragging helpers shared by the article and CI.
 * Browser users get `globalThis.ComputationalExperimentInteraction`; Node tests
 * execute this exact UMD file in a browser-like VM context.
 */
(function exposeInteraction(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ComputationalExperimentInteraction = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const DEFAULT_TARGET = Object.freeze({ x: 0.5, y: 0.5, z: 0.5 });
  const DEFAULT_CAMERA = Object.freeze({
    target: DEFAULT_TARGET,
    azimuth: -0.62,
    elevation: 0.5,
    zoom: 1,
  });
  const ELEVATION_LIMIT = Math.PI / 2 - 0.025;
  const MIN_ZOOM = 0.45;
  const MAX_ZOOM = 4;

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const copy3 = (value) => ({ x: value.x, y: value.y, z: value.z });
  const add3 = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
  const subtract3 = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const scale3 = (value, scale) => ({
    x: value.x * scale,
    y: value.y * scale,
    z: value.z * scale,
  });
  const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

  function createCamera(overrides = {}) {
    const target = overrides.target ?? DEFAULT_CAMERA.target;
    return {
      target: copy3(target),
      azimuth: overrides.azimuth ?? DEFAULT_CAMERA.azimuth,
      elevation: clampElevation(overrides.elevation ?? DEFAULT_CAMERA.elevation),
      zoom: clampZoom(overrides.zoom ?? DEFAULT_CAMERA.zoom),
    };
  }

  function resetCamera(camera, defaults = DEFAULT_CAMERA) {
    const next = createCamera(defaults);
    camera.target = next.target;
    camera.azimuth = next.azimuth;
    camera.elevation = next.elevation;
    camera.zoom = next.zoom;
    return camera;
  }

  function wrapAngle(angle) {
    const fullTurn = Math.PI * 2;
    return ((angle + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
  }

  function clampElevation(elevation) {
    return clamp(elevation, -ELEVATION_LIMIT, ELEVATION_LIMIT);
  }

  function clampZoom(zoom) {
    return clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  }

  function cameraBasis(camera) {
    const cosineAzimuth = Math.cos(camera.azimuth);
    const sineAzimuth = Math.sin(camera.azimuth);
    const sineElevation = Math.sin(camera.elevation);
    const cosineElevation = Math.cos(camera.elevation);
    const right = { x: cosineAzimuth, y: sineAzimuth, z: 0 };
    const up = {
      x: -sineAzimuth * sineElevation,
      y: cosineAzimuth * sineElevation,
      z: cosineElevation,
    };
    const view = {
      x: sineAzimuth * cosineElevation,
      y: -cosineAzimuth * cosineElevation,
      z: sineElevation,
    };
    return { right, up, view };
  }

  function projectionScale(width, height, camera) {
    return Math.min(width, height) * 0.55 * camera.zoom;
  }

  function projectPoint(point, width, height, camera) {
    const relative = subtract3(point, camera.target);
    const basis = cameraBasis(camera);
    const scale = projectionScale(width, height, camera);
    return {
      x: width / 2 + scale * dot3(relative, basis.right),
      y: height / 2 - scale * dot3(relative, basis.up),
    };
  }

  function projectVector(vector, width, height, camera) {
    const basis = cameraBasis(camera);
    const scale = projectionScale(width, height, camera);
    return {
      x: scale * dot3(vector, basis.right),
      y: -scale * dot3(vector, basis.up),
    };
  }

  function cameraDepth(point, camera) {
    return dot3(subtract3(point, camera.target), cameraBasis(camera).view);
  }

  function unprojectAtDepth(screenPoint, depth, width, height, camera) {
    const basis = cameraBasis(camera);
    const scale = projectionScale(width, height, camera);
    const horizontal = (screenPoint.x - width / 2) / scale;
    const vertical = -(screenPoint.y - height / 2) / scale;
    return add3(
      camera.target,
      add3(
        add3(scale3(basis.right, horizontal), scale3(basis.up, vertical)),
        scale3(basis.view, depth),
      ),
    );
  }

  function screenPlaneDelta(deltaX, deltaY, width, height, camera) {
    const basis = cameraBasis(camera);
    const scale = projectionScale(width, height, camera);
    return add3(
      scale3(basis.right, deltaX / scale),
      scale3(basis.up, -deltaY / scale),
    );
  }

  function panTarget(startTarget, deltaX, deltaY, width, height, camera) {
    return subtract3(startTarget, screenPlaneDelta(deltaX, deltaY, width, height, camera));
  }

  function zoomCameraAt(camera, screenPoint, width, height, requestedZoom) {
    const anchor = unprojectAtDepth(screenPoint, 0, width, height, camera);
    const result = createCamera({ ...camera, zoom: requestedZoom });
    const after = unprojectAtDepth(screenPoint, 0, width, height, result);
    result.target = add3(result.target, subtract3(anchor, after));
    return result;
  }

  function orbitCamera(camera, deltaX, deltaY, sensitivity = 0.012) {
    return createCamera({
      ...camera,
      azimuth: wrapAngle(camera.azimuth + deltaX * sensitivity),
      elevation: clampElevation(camera.elevation - deltaY * sensitivity),
    });
  }

  function pointSegmentDistance(point, start, end) {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
    const amount = clamp(
      ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared,
      0,
      1,
    );
    return Math.hypot(
      point.x - (start.x + amount * deltaX),
      point.y - (start.y + amount * deltaY),
    );
  }

  function rigidBoundedDelta(points, requestedDelta, bounds) {
    let amount = 1;
    for (const point of points) {
      for (const axis of ['x', 'y', 'z']) {
        const delta = requestedDelta[axis];
        const [minimum, maximum] = bounds[axis];
        if (delta > 0) amount = Math.min(amount, (maximum - point[axis]) / delta);
        if (delta < 0) amount = Math.min(amount, (minimum - point[axis]) / delta);
      }
    }
    return scale3(requestedDelta, clamp(amount, 0, 1));
  }

  function translatePoint(point, delta) {
    return add3(point, delta);
  }

  return {
    ELEVATION_LIMIT,
    MAX_ZOOM,
    MIN_ZOOM,
    cameraBasis,
    cameraDepth,
    clampElevation,
    clampZoom,
    createCamera,
    orbitCamera,
    panTarget,
    pointSegmentDistance,
    projectPoint,
    projectVector,
    projectionScale,
    resetCamera,
    rigidBoundedDelta,
    screenPlaneDelta,
    translatePoint,
    unprojectAtDepth,
    wrapAngle,
    zoomCameraAt,
  };
}));
