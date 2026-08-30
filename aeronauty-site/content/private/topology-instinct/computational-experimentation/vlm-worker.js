/* global importScripts, postMessage */
'use strict';

importScripts('vlm-core.js?v=3');

const VLM = globalThis.ComputationalExperimentVLM;
const PROTOCOL_VERSION = 2;

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

function displayWake(wake, limit = 48, activeWakeRows = 12) {
  const totalRows = wake.nodeRows.length;
  const nearCount = Math.min(totalRows, activeWakeRows + 1, limit);
  const indices = Array.from({ length: nearCount }, (_, index) => index);
  const remainingSlots = limit - indices.length;
  if (remainingSlots > 0 && totalRows > nearCount) {
    const start = nearCount;
    const end = totalRows - 1;
    for (let slot = 1; slot <= remainingSlots; slot += 1) {
      indices.push(Math.round(start + (end - start) * slot / remainingSlots));
    }
  }
  const uniqueIndices = [...new Set(indices)].sort((a, b) => a - b);
  if (totalRows && uniqueIndices.at(-1) !== totalRows - 1) uniqueIndices.push(totalRows - 1);
  return {
    ...wake,
    totalRows,
    sourceIndices: uniqueIndices,
    nodeRows: uniqueIndices.map((index) => wake.nodeRows[index]),
    strengthRows: uniqueIndices.map((index) => wake.strengthRows[index]),
  };
}

function wakeDifference(first, second) {
  let maximum = 0;
  let sumSquared = 0;
  let count = 0;
  const rowCount = Math.min(first.nodeRows.length, second.nodeRows.length);
  for (let row = 0; row < rowCount; row += 1) {
    const pointCount = Math.min(first.nodeRows[row].length, second.nodeRows[row].length);
    for (let column = 0; column < pointCount; column += 1) {
      const a = first.nodeRows[row][column];
      const b = second.nodeRows[row][column];
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      maximum = Math.max(maximum, distance);
      sumSquared += distance ** 2;
      count += 1;
    }
  }
  return {
    maximum,
    rms: count ? Math.sqrt(sumSquared / count) : 0,
    samples: count,
  };
}

function compactHarmonicStage(result, options = {}) {
  const includeSnapshots = options.includeSnapshots ?? false;
  const compact = {
    stage: result.stage,
    response: result.response,
    periodicity: result.periodicity,
    diagnostics: result.diagnostics,
    steadyLiftSlope: result.steadyLiftSlope,
    addedMassPotentialGain: result.addedMassPotentialGain,
    config: result.config,
    trace: result.trace.map((sample) => ({
      time: sample.time,
      phaseDegrees: sample.phaseDegrees,
      h: sample.h,
      normalVelocityRatio: sample.normalVelocityRatio,
      circulatoryCL: sample.circulatoryCL,
      accelerationCL: sample.accelerationCL,
      totalCL: sample.totalCL,
      apparentMassCL: sample.apparentMassCL,
      pressureCirculatoryCL: sample.pressureCirculatoryCL,
    })),
  };
  if (includeSnapshots) {
    compact.snapshots = result.snapshots.map((snapshot, index) => ({
      time: snapshot.time,
      phaseDegrees: snapshot.phaseDegrees,
      h: snapshot.h,
      normalVelocityRatio: snapshot.normalVelocityRatio,
      circulatoryCL: snapshot.circulatoryCL,
      accelerationCL: snapshot.accelerationCL,
      totalCL: snapshot.totalCL,
      apparentMassCL: snapshot.apparentMassCL,
      pressureCirculatoryCL: snapshot.pressureCirculatoryCL,
      spanwiseCirculation: snapshot.spanwiseCirculation,
      inducedDisplacement: options.referenceSnapshots
        ? wakeDifference(snapshot.wake, options.referenceSnapshots[index].wake)
        : null,
      wake: displayWake(snapshot.wake, options.displayRowLimit, options.activeWakeRows),
    }));
  }
  return compact;
}

function geometryFrom(lattice) {
  return {
    chord: lattice.chord,
    span: lattice.span,
    xRows: lattice.xRows,
    yEdges: lattice.yEdges,
    collocations: lattice.panels.map((panel) => [
      panel.collocation.x,
      panel.collocation.y,
      panel.collocation.z,
    ]),
  };
}

function solveHarmonic(message, config) {
  const reducedFrequency = Math.max(0.15, Math.min(0.9, finite(message.reducedFrequency, 0.35)));
  const amplitude = Math.max(0.005, Math.min(0.06, finite(message.amplitude, 0.03)));
  const harmonicConfig = {
    aspectRatio: config.aspectRatio,
    reducedFrequency,
    amplitude,
    spanPanels: Math.min(config.spanPanels, 10),
    chordPanels: 2,
    stepsPerCycle: 24,
    cycles: 4,
    measureCycles: 2,
    activeWakeRows: 12,
    snapshotCount: 24,
    coreRadius: 0.03,
    shedFraction: 0.25,
  };
  const rawStages = {};
  let harmonicLattice = null;
  for (const [index, stage] of ['flat', 'te', 'free'].entries()) {
    const result = VLM.runHarmonicUvlm({
      ...harmonicConfig,
      stage,
      snapshotCount: harmonicConfig.snapshotCount,
      periodicityMagnitudeTolerance: stage === 'free' ? 0.05 : 0.03,
      periodicityPhaseTolerance: stage === 'free' ? 3 : 2,
      fitResidualTolerance: stage === 'free' ? 0.05 : 0.02,
    });
    rawStages[stage] = result;
    if (stage === 'free') harmonicLattice = result.lattice;
    postMessage({
      type: 'progress',
      protocolVersion: PROTOCOL_VERSION,
      requestId: message.requestId,
      key: message.key,
      completed: index + 1,
      total: 3,
      stage,
    });
  }
  const stages = {
    flat: compactHarmonicStage(rawStages.flat, {
      includeSnapshots: true,
      activeWakeRows: harmonicConfig.activeWakeRows,
    }),
    te: compactHarmonicStage(rawStages.te, {
      includeSnapshots: true,
      activeWakeRows: harmonicConfig.activeWakeRows,
    }),
    free: compactHarmonicStage(rawStages.free, {
      includeSnapshots: true,
      referenceSnapshots: rawStages.te.snapshots,
      activeWakeRows: harmonicConfig.activeWakeRows,
    }),
  };
  const free = stages.free;
  const latestSnapshot = free.snapshots.at(-1);
  const lattice = harmonicLattice;
  return {
    type: 'result',
    protocolVersion: PROTOCOL_VERSION,
    requestId: message.requestId,
    key: message.key,
    wakeMode: 'harmonic',
    config: {
      ...harmonicConfig,
      unknowns: harmonicConfig.chordPanels * harmonicConfig.spanPanels,
    },
    geometry: geometryFrom(lattice),
    stages,
    snapshots: free.snapshots,
    trace: free.trace,
    spanwise: {
      y: lattice.yEdges.slice(0, -1).map((left, index) => (
        0.5 * (left + lattice.yEdges[index + 1])
      )),
      circulation: latestSnapshot?.spanwiseCirculation ?? [],
    },
  };
}

function solve(message) {
  const aspectRatio = Math.max(4, Math.min(12, finite(message.aspectRatio, 8)));
  const alphaDeg = Math.max(1, Math.min(10, finite(message.alphaDeg, 6)));
  const wakeMode = message.wakeMode === 'harmonic' ? 'harmonic' : 'straight';
  const spanPanels = wakeMode === 'harmonic'
    ? clampInteger(message.spanPanels, 6, 10)
    : clampInteger(message.spanPanels, 6, 16);
  const chordPanels = 1;
  if (wakeMode === 'harmonic') {
    return solveHarmonic(message, { aspectRatio, alphaDeg, spanPanels });
  }
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
