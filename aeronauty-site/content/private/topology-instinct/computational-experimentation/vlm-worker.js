/* global importScripts, postMessage */
'use strict';

importScripts('vlm-core.js');

const VLM = globalThis.ComputationalExperimentVLM;
const PROTOCOL_VERSION = 1;

function clampInteger(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Math.round(Number(value))));
}

function finite(value, fallback) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function referenceDistribution(reference, yValues, span) {
  return yValues.map((y) => {
    const theta = Math.acos(Math.max(-1, Math.min(1, -2 * y / span)));
    return 2 * span * reference.coefficients.reduce((sum, coefficient, index) => (
      sum + coefficient * Math.sin(reference.modes[index] * theta)
    ), 0);
  });
}

function compactWake(wake) {
  return {
    time: wake.time,
    step: wake.step,
    nodeRows: wake.nodeRows.map((row) => row.points.map((point) => [point.x, point.y, point.z])),
    strengthRows: wake.strengthRows.map((row) => row.slice()),
    diagnostics: wake.lastConvectionDiagnostics,
  };
}

function solve(message) {
  const aspectRatio = Math.max(4, Math.min(12, finite(message.aspectRatio, 8)));
  const alphaDeg = Math.max(1, Math.min(10, finite(message.alphaDeg, 6)));
  const spanPanels = clampInteger(message.spanPanels, 8, 16);
  const wakeMode = message.wakeMode === 'free' ? 'free' : 'straight';
  const chordPanels = 1;
  const lattice = VLM.createRectangularWingLattice({
    chord: 1,
    span: aspectRatio,
    chordPanels,
    spanPanels,
    spanSpacing: 'cosine',
  });
  const reference = VLM.liftingLineRectangularReference({
    aspectRatio,
    alphaDeg,
    terms: 20,
  });

  let result;
  let wake = null;
  if (wakeMode === 'straight') {
    result = VLM.solveSteadyVlm({
      lattice,
      alphaDeg,
      wakeLength: 100 * aspectRatio,
    });
  } else {
    const dt = 0.12;
    const steps = 16;
    const coreRadius = 0.05;
    let state = VLM.createWakeState(lattice);
    for (let step = 0; step < steps; step += 1) {
      result = VLM.stepUnsteadyVlm({
        lattice,
        wake: state,
        alphaDeg,
        dt,
        mode: 'free',
        coreRadius,
        integrator: 'heun',
        shedFraction: 0.25,
        maxWakeRows: steps,
      });
      state = result.wake;
      if (step === 3 || step === 7 || step === 11) {
        postMessage({
          type: 'progress',
          protocolVersion: PROTOCOL_VERSION,
          requestId: message.requestId,
          key: message.key,
          completed: step + 1,
          total: steps,
        });
      }
    }
    wake = compactWake(state);
  }

  const spanwise = result.loads.spanwiseCirculation;
  const yCentres = lattice.yEdges.slice(0, -1).map((left, index) => (
    0.5 * (left + lattice.yEdges[index + 1])
  ));
  const trailingJumps = lattice.yEdges.map((_, index) => {
    const left = index === 0 ? 0 : spanwise[index - 1];
    const right = index === spanwise.length ? 0 : spanwise[index];
    return right - left;
  });
  const trailingClosure = trailingJumps.reduce((sum, value) => sum + value, 0);
  const relativeLiftError = reference.CL === 0 ? 0 : (result.CL - reference.CL) / reference.CL;
  const dynamicPressureArea = 0.5
    * (result.freestream.x ** 2 + result.freestream.y ** 2 + result.freestream.z ** 2)
    * lattice.referenceArea;
  const pressureCirculatoryCL = result.unsteadyLoads
    ? result.unsteadyLoads.circulatoryLift / dynamicPressureArea
    : result.CL;
  const accelerationCL = result.unsteadyLoads
    ? result.unsteadyLoads.accelerationLift / dynamicPressureArea
    : 0;
  const totalPressureCL = result.unsteadyLoads
    ? result.unsteadyLoads.CL
    : result.CL;

  return {
    type: 'result',
    protocolVersion: PROTOCOL_VERSION,
    requestId: message.requestId,
    key: message.key,
    wakeMode,
    config: {
      aspectRatio,
      alphaDeg,
      chordPanels,
      spanPanels,
      unknowns: lattice.panels.length,
    },
    geometry: {
      chord: lattice.chord,
      span: lattice.span,
      xRows: lattice.xRows,
      yEdges: lattice.yEdges,
      collocations: lattice.panels.map((panel) => [
        panel.collocation.x,
        panel.collocation.y,
        panel.collocation.z,
      ]),
    },
    spanwise: {
      y: yCentres,
      circulation: spanwise,
      reference: referenceDistribution(reference, yCentres, aspectRatio),
      trailingJumps,
    },
    metrics: {
      CL: result.CL,
      pressureCirculatoryCL,
      accelerationCL,
      totalPressureCL,
      referenceCL: reference.CL,
      relativeLiftError,
      liftSlope: result.CL / (alphaDeg * Math.PI / 180),
      referenceLiftSlope: reference.liftSlope,
      maxBoundaryResidual: result.maxBoundaryResidual,
      trailingClosure,
      sheddingResidual: result.shedConsistencyResidual ?? 0,
      filamentContinuityResidual: result.filamentContinuityResidual ?? 0,
      wakeAge: wake?.time ?? 0,
      wakeRows: wake?.nodeRows.length ?? 0,
      coreRadius: wake?.diagnostics?.coreRadius ?? 0,
      maxInducedSpeed: wake?.diagnostics?.maxInducedSpeed ?? 0,
    },
    wake,
  };
}

globalThis.addEventListener('message', (event) => {
  const message = event.data || {};
  if (message.type !== 'solve' || message.protocolVersion !== PROTOCOL_VERSION) return;
  try {
    postMessage(solve(message));
  } catch (error) {
    postMessage({
      type: 'result',
      protocolVersion: PROTOCOL_VERSION,
      requestId: message.requestId,
      key: message.key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
