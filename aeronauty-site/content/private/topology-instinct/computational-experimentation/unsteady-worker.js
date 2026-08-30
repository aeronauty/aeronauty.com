/* global importScripts, postMessage */
'use strict';

importScripts('unsteady-core.js');

const U = globalThis.ComputationalExperimentUnsteady;

function compact(result) {
  return {
    stage: result.stage,
    circulatoryResponse: result.circulatoryResponse,
    totalLiftResponse: result.totalLiftResponse,
    apparentMassResponse: result.apparentMassResponse,
    boundCirculationResponse: result.boundCirculationResponse,
    diagnostics: result.diagnostics,
    wakeSnapshots: result.wakeSnapshots,
    meta: {
      panelCount: result.panelCount,
      stepsPerCycle: result.stepsPerCycle,
      cycles: result.cycles,
      measureCycles: result.measureCycles,
      wakePlacement: result.wakePlacement,
      coreRadius: result.coreRadius,
    },
  };
}

globalThis.addEventListener('message', (event) => {
  const message = event.data || {};
  if (message.type !== 'solve') return;
  const requestId = message.requestId;
  try {
    const common = {
      k: message.k,
      amplitude: 0.06,
      phase: Math.PI / 2,
      wakePlacement: 0.25,
      panelCount: 16,
      stepsPerCycle: 64,
      cycles: 8,
      measureCycles: 3,
      snapshotCount: 32,
      maxSnapshotPoints: 100,
    };
    const responses = {
      flat: compact(U.runHarmonicResponse({
        ...common,
        stage: 'straight',
      })),
      te: compact(U.runHarmonicResponse({
        ...common,
        stage: 'sinusoidal',
      })),
    };
    postMessage({ type: 'result', requestId, k: message.k, responses });
  } catch (error) {
    postMessage({
      type: 'result',
      requestId,
      k: message.k,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
