/**
 * Two-dimensional unsteady flat-plate discrete-vortex model.
 *
 * The browser receives `globalThis.ComputationalExperimentUnsteady`; Node tests
 * execute this exact file in a browser-like VM. Positive circulation is
 * clockwise in the (x, y) plane, matching Katz & Plotkin and vortex-core.js.
 *
 * Theodorsen's C(k) is a transfer function for circulatory lift, not for raw
 * bound circulation. The harmonic runner therefore forms the pressure-derived
 * total lift first, then removes the exact pure-heave apparent-mass term.
 */
(function exposeUnsteady(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ComputationalExperimentUnsteady = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const TWO_PI = 2 * Math.PI;
  const EPS = 1e-12;
  const STAGE_ALIASES = Object.freeze({
    bound: 'bound',
    baseline: 'bound',
    straight: 'straight',
    flat: 'straight',
    fixed: 'straight',
    sinusoidal: 'sinusoidal',
    te: 'sinusoidal',
    'te-following': 'sinusoidal',
    free: 'free',
    'self-influencing': 'free',
  });

  const sum = values => values.reduce((total, value) => total + value, 0);
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const finite = (name, value) => {
    if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
    return value;
  };
  const positive = (name, value) => {
    finite(name, value);
    if (value <= 0) throw new RangeError(`${name} must be positive`);
    return value;
  };
  const integerAtLeast = (name, value, minimum) => {
    if (!Number.isInteger(value) || value < minimum) {
      throw new RangeError(`${name} must be an integer of at least ${minimum}`);
    }
    return value;
  };

  function complex(real, imag) {
    return { real, imag };
  }

  function complexAdd(a, b) {
    return complex(a.real + b.real, a.imag + b.imag);
  }

  function complexSubtract(a, b) {
    return complex(a.real - b.real, a.imag - b.imag);
  }

  function complexScale(value, scale) {
    return complex(value.real * scale, value.imag * scale);
  }

  function complexMultiply(a, b) {
    return complex(
      a.real * b.real - a.imag * b.imag,
      a.real * b.imag + a.imag * b.real,
    );
  }

  function complexDivide(numerator, denominator) {
    const norm = denominator.real ** 2 + denominator.imag ** 2;
    if (norm < EPS ** 2) throw new RangeError('complex denominator is zero');
    return complex(
      (numerator.real * denominator.real + numerator.imag * denominator.imag) / norm,
      (numerator.imag * denominator.real - numerator.real * denominator.imag) / norm,
    );
  }

  function withPolar(value) {
    const magnitude = Math.hypot(value.real, value.imag);
    const phaseRadians = Math.atan2(value.imag, value.real);
    return {
      real: value.real,
      imag: value.imag,
      f: value.real,
      g: value.imag,
      magnitude,
      phaseRadians,
      phaseDegrees: phaseRadians * 180 / Math.PI,
    };
  }

  function wrapPhase(radians) {
    return ((radians + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
  }

  /** Solve a dense square system using Gaussian elimination with pivoting. */
  function solveLinearSystem(matrix, rhs) {
    const size = matrix.length;
    if (!size || rhs.length !== size || matrix.some(row => row.length !== size)) {
      throw new TypeError('matrix must be square and match rhs');
    }
    const a = matrix.map((row, index) => [...row, rhs[index]]);
    for (let column = 0; column < size; column += 1) {
      let pivot = column;
      for (let row = column + 1; row < size; row += 1) {
        if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
      }
      if (Math.abs(a[pivot][column]) < EPS) throw new RangeError('singular linear system');
      if (pivot !== column) [a[pivot], a[column]] = [a[column], a[pivot]];
      const scale = a[column][column];
      for (let entry = column; entry <= size; entry += 1) a[column][entry] /= scale;
      for (let row = 0; row < size; row += 1) {
        if (row === column) continue;
        const factor = a[row][column];
        if (factor === 0) continue;
        for (let entry = column; entry <= size; entry += 1) {
          a[row][entry] -= factor * a[column][entry];
        }
      }
    }
    return a.map(row => row[size]);
  }

  /** Clockwise-positive two-dimensional vortex blob. */
  function regularizedPointVortexVelocity(source, point, circulation = 1, coreRadius = 0) {
    if (!source || !point) throw new TypeError('source and point are required');
    finite('source.x', source.x);
    finite('source.y', source.y);
    finite('point.x', point.x);
    finite('point.y', point.y);
    finite('circulation', circulation);
    finite('coreRadius', coreRadius);
    if (coreRadius < 0) throw new RangeError('coreRadius cannot be negative');
    const dx = point.x - source.x;
    const dy = point.y - source.y;
    const denominator = TWO_PI * (dx * dx + dy * dy + coreRadius * coreRadius);
    if (denominator < EPS) return { x: Number.NaN, y: Number.NaN };
    return {
      x: circulation * dy / denominator,
      y: -circulation * dx / denominator,
    };
  }

  function createFlatPlateDvm(options = {}) {
    const chord = positive('chord', options.chord ?? 1);
    const panelCount = integerAtLeast('panelCount', options.panelCount ?? options.panels ?? 16, 1);
    const panelLength = chord / panelCount;
    const vortexX = Array.from(
      { length: panelCount },
      (_, index) => (index + 0.25) * panelLength,
    );
    const collocationX = Array.from(
      { length: panelCount },
      (_, index) => (index + 0.75) * panelLength,
    );
    const influenceMatrix = collocationX.map(x => vortexX.map(sourceX => (
      -1 / (TWO_PI * (x - sourceX))
    )));
    return {
      chord,
      panelCount,
      panelLength,
      vortexX,
      collocationX,
      influenceMatrix,
    };
  }

  function solveBoundOnly(dvm, normalVelocity) {
    finite('normalVelocity', normalVelocity);
    const rhs = Array(dvm.panelCount).fill(-normalVelocity);
    const boundStrengths = solveLinearSystem(dvm.influenceMatrix, rhs);
    const boundTotal = sum(boundStrengths);
    const boundaryResidual = dvm.influenceMatrix.reduce((maximum, row, index) => {
      const induced = row.reduce(
        (total, coefficient, column) => total + coefficient * boundStrengths[column],
        0,
      );
      return Math.max(maximum, Math.abs(induced + normalVelocity));
    }, 0);
    return { boundStrengths, boundTotal, boundaryResidual };
  }

  function wakeVelocityAtPoints(wake, points, coreRadius = 0) {
    finite('coreRadius', coreRadius);
    if (coreRadius < 0) throw new RangeError('coreRadius cannot be negative');
    const coreSquared = coreRadius * coreRadius;
    const velocity = points.map(() => ({ x: 0, y: 0 }));
    // This is the hot path of a harmonic run. Validate at the public boundary,
    // then evaluate the same kernel in-place without millions of function calls.
    for (let wakeIndex = 0; wakeIndex < wake.length; wakeIndex += 1) {
      const vortex = wake[wakeIndex];
      const circulation = vortex.circulation;
      for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
        const dx = points[pointIndex].x - vortex.x;
        const dy = points[pointIndex].y - vortex.y;
        const radiusSquared = dx * dx + dy * dy + coreSquared;
        if (radiusSquared < EPS ** 2) {
          velocity[pointIndex].x = Number.NaN;
          velocity[pointIndex].y = Number.NaN;
          continue;
        }
        const coefficient = circulation / (TWO_PI * radiusSquared);
        velocity[pointIndex].x += coefficient * dy;
        velocity[pointIndex].y -= coefficient * dx;
      }
    }
    return velocity;
  }

  /**
   * Katz & Plotkin's augmented DVM step: N no-penetration equations plus
   * Kelvin's equation for the latest wake vortex (their Eqs. 13.118-13.120).
   */
  function solveUnsteadyStep(options) {
    const {
      dvm,
      normalVelocity,
      oldWake = [],
      previousBoundTotal = 0,
      newWakePosition,
      wakeCoreRadius = 0,
    } = options;
    if (!dvm || !newWakePosition) throw new TypeError('dvm and newWakePosition are required');
    finite('normalVelocity', normalVelocity);
    finite('previousBoundTotal', previousBoundTotal);
    const collocation = dvm.collocationX.map(x => ({ x, y: 0 }));
    const oldWakeVelocity = wakeVelocityAtPoints(oldWake, collocation, wakeCoreRadius);
    const newUnitVelocity = collocation.map(point => regularizedPointVortexVelocity(
      newWakePosition,
      point,
      1,
      wakeCoreRadius,
    ));
    if (
      oldWakeVelocity.some(velocity => !Number.isFinite(velocity.x) || !Number.isFinite(velocity.y))
      || newUnitVelocity.some(velocity => !Number.isFinite(velocity.x) || !Number.isFinite(velocity.y))
    ) {
      throw new RangeError('a wake vortex coincides with a boundary collocation point');
    }
    const newColumn = newUnitVelocity.map(velocity => velocity.y);
    const matrix = dvm.influenceMatrix.map(
      (row, index) => [...row, newColumn[index]],
    );
    matrix.push(Array(dvm.panelCount + 1).fill(1));
    const rhs = oldWakeVelocity.map(
      velocity => -normalVelocity - velocity.y,
    );
    rhs.push(previousBoundTotal);
    const solution = solveLinearSystem(matrix, rhs);
    const boundStrengths = solution.slice(0, dvm.panelCount);
    const newWakeCirculation = solution[dvm.panelCount];
    const boundTotal = sum(boundStrengths);
    const boundaryResidual = dvm.influenceMatrix.reduce((maximum, row, index) => {
      const boundInduced = row.reduce(
        (total, coefficient, column) => total + coefficient * boundStrengths[column],
        0,
      );
      const residual = boundInduced
        + newColumn[index] * newWakeCirculation
        + oldWakeVelocity[index].y
        + normalVelocity;
      return Math.max(maximum, Math.abs(residual));
    }, 0);
    const equationKelvinResidual = boundTotal + newWakeCirculation - previousBoundTotal;
    const totalKelvinResidual = boundTotal
      + newWakeCirculation
      + sum(oldWake.map(vortex => vortex.circulation));
    const combinedWakeVelocity = oldWakeVelocity.map((velocity, index) => ({
      x: velocity.x + newUnitVelocity[index].x * newWakeCirculation,
      y: velocity.y + newUnitVelocity[index].y * newWakeCirculation,
    }));
    return {
      boundStrengths,
      boundTotal,
      newWakeCirculation,
      oldWakeVelocity,
      combinedWakeVelocity,
      boundaryResidual,
      equationKelvinResidual,
      totalKelvinResidual,
    };
  }

  function harmonicHeave(options) {
    const time = finite('time', options.time);
    const k = positive('k', options.k);
    const chord = positive('chord', options.chord ?? 1);
    const freestream = positive('freestream', options.freestream ?? options.U ?? 1);
    const amplitude = finite('amplitude', options.amplitude ?? 0.005 * chord);
    const phase = finite('phase', options.phase ?? 0);
    const omega = 2 * k * freestream / chord;
    const angle = omega * time + phase;
    const h = amplitude * Math.sin(angle);
    const hDot = amplitude * omega * Math.cos(angle);
    const hDoubleDot = -amplitude * omega * omega * Math.sin(angle);
    return {
      time,
      k,
      omega,
      h,
      hDot,
      hDoubleDot,
      // Body-fixed ambient normal velocity; +y is upward.
      normalVelocity: -hDot,
      normalVelocityDot: -hDoubleDot,
    };
  }

  function straightWakePosition(options) {
    const chord = positive('chord', options.chord ?? 1);
    const freestream = positive('freestream', options.freestream ?? options.U ?? 1);
    const time = finite('time', options.time);
    const shedTime = finite('shedTime', options.shedTime);
    return { x: chord + freestream * Math.max(0, time - shedTime), y: 0 };
  }

  function trailingEdgeHistoryPosition(options) {
    const chord = positive('chord', options.chord ?? 1);
    const freestream = positive('freestream', options.freestream ?? options.U ?? 1);
    const time = finite('time', options.time);
    const shedTime = finite('shedTime', options.shedTime);
    const current = harmonicHeave({ ...options, time, chord, freestream });
    const shed = harmonicHeave({ ...options, time: shedTime, chord, freestream });
    return {
      x: chord + freestream * Math.max(0, time - shedTime),
      // Exact vertical translation from inertial to wing-fixed coordinates.
      y: shed.h - current.h,
    };
  }

  function prescribedWakePosition(stage, options) {
    if (stage === 'straight') return straightWakePosition(options);
    if (stage === 'sinusoidal') return trailingEdgeHistoryPosition(options);
    throw new RangeError('prescribed wake stage must be straight or sinusoidal');
  }

  function freeWakeVelocities(options) {
    const {
      wake,
      boundStrengths = [],
      dvm,
      freestream = 1,
      normalVelocity = 0,
      coreRadius = 0.005 * (dvm?.chord ?? 1),
      inductionScale = 1,
    } = options;
    if (!Array.isArray(wake) || !dvm) throw new TypeError('wake and dvm are required');
    finite('inductionScale', inductionScale);
    const coreSquared = coreRadius * coreRadius;
    const velocity = wake.map(() => ({ x: freestream, y: normalVelocity }));
    if (inductionScale === 0) return velocity;
    for (let index = 0; index < wake.length; index += 1) {
      const target = wake[index];
      for (let boundIndex = 0; boundIndex < boundStrengths.length; boundIndex += 1) {
        const dx = target.x - dvm.vortexX[boundIndex];
        const dy = target.y;
        const radiusSquared = dx * dx + dy * dy + coreSquared;
        if (radiusSquared < EPS ** 2) {
          throw new RangeError('a wake vortex coincides with a bound vortex without a core');
        }
        const coefficient = inductionScale * boundStrengths[boundIndex]
          / (TWO_PI * radiusSquared);
        velocity[index].x += coefficient * dy;
        velocity[index].y -= coefficient * dx;
      }
      for (let other = 0; other < wake.length; other += 1) {
        if (other === index) continue;
        const dx = target.x - wake[other].x;
        const dy = target.y - wake[other].y;
        const radiusSquared = dx * dx + dy * dy + coreSquared;
        if (radiusSquared < EPS ** 2) {
          throw new RangeError('free wake vortices overlap without a core');
        }
        const coefficient = inductionScale * wake[other].circulation
          / (TWO_PI * radiusSquared);
        velocity[index].x += coefficient * dy;
        velocity[index].y -= coefficient * dx;
      }
    }
    return velocity;
  }

  /** Explicit midpoint convection with second-order bound-strength extrapolation. */
  function convectFreeWakeMidpoint(options) {
    const {
      wake,
      dvm,
      boundStrengths = [],
      previousBoundStrengths = boundStrengths,
      time,
      dt,
      k,
      chord = dvm?.chord ?? 1,
      freestream = 1,
      amplitude = 0.005 * chord,
      phase = 0,
      coreRadius = 0.005 * chord,
      inductionScale = 1,
    } = options;
    if (!wake.length) return [];
    positive('dt', dt);
    const initialMotion = harmonicHeave({ time, k, chord, freestream, amplitude, phase });
    const midpointMotion = harmonicHeave({
      time: time + dt / 2,
      k,
      chord,
      freestream,
      amplitude,
      phase,
    });
    const initialVelocity = freeWakeVelocities({
      wake,
      boundStrengths,
      dvm,
      freestream,
      normalVelocity: initialMotion.normalVelocity,
      coreRadius,
      inductionScale,
    });
    const midpointWake = wake.map((vortex, index) => ({
      ...vortex,
      x: vortex.x + initialVelocity[index].x * dt / 2,
      y: vortex.y + initialVelocity[index].y * dt / 2,
    }));
    const midpointBound = boundStrengths.map((value, index) => (
      1.5 * value - 0.5 * (previousBoundStrengths[index] ?? value)
    ));
    const midpointVelocity = freeWakeVelocities({
      wake: midpointWake,
      boundStrengths: midpointBound,
      dvm,
      freestream,
      normalVelocity: midpointMotion.normalVelocity,
      coreRadius,
      inductionScale,
    });
    return wake.map((vortex, index) => ({
      ...vortex,
      x: vortex.x + midpointVelocity[index].x * dt,
      y: vortex.y + midpointVelocity[index].y * dt,
    }));
  }

  function pressureLiftTerms(options) {
    const {
      dvm,
      boundStrengths,
      wake = [],
      freestream = 1,
      wakeCoreRadius = 0,
      wakeVelocity: suppliedWakeVelocity,
    } = options;
    const collocation = dvm.collocationX.map(x => ({ x, y: 0 }));
    const wakeVelocity = suppliedWakeVelocity
      ?? wakeVelocityAtPoints(wake, collocation, wakeCoreRadius);
    let cumulative = 0;
    let potentialMoment = 0;
    let quasiSteadyForceTerm = 0;
    for (let index = 0; index < boundStrengths.length; index += 1) {
      cumulative += boundStrengths[index];
      potentialMoment += dvm.panelLength * cumulative;
      quasiSteadyForceTerm += (
        freestream + wakeVelocity[index].x
      ) * boundStrengths[index];
    }
    return {
      boundTotal: cumulative,
      potentialMoment,
      quasiSteadyForceTerm,
      wakeVelocity,
    };
  }

  function pressureLiftSample(options) {
    const {
      rho = 1,
      quasiSteadyForceTerm,
      potentialMoment,
      previousPotentialMoment,
      olderPotentialMoment,
      dt,
    } = options;
    finite('rho', rho);
    finite('quasiSteadyForceTerm', quasiSteadyForceTerm);
    finite('potentialMoment', potentialMoment);
    if (!Number.isFinite(previousPotentialMoment) || !Number.isFinite(dt)) {
      return { totalLift: Number.NaN, potentialDerivative: Number.NaN };
    }
    const potentialDerivative = Number.isFinite(olderPotentialMoment)
      ? (3 * potentialMoment - 4 * previousPotentialMoment + olderPotentialMoment) / (2 * dt)
      : (potentialMoment - previousPotentialMoment) / dt;
    return {
      totalLift: rho * (quasiSteadyForceTerm + potentialDerivative),
      potentialDerivative,
    };
  }

  function valueFromSample(sample, selector) {
    if (typeof selector === 'function') return selector(sample);
    if (typeof selector === 'string') return sample[selector];
    if (typeof sample === 'number') return sample;
    return sample.value;
  }

  /** Least-squares fit z(t)=mean+a cos(wt)+b sin(wt), with zHat=a-i b. */
  function fitHarmonicResponse(samples, omega, selector = 'value') {
    if (!Array.isArray(samples) || samples.length < 4) {
      throw new RangeError('at least four harmonic samples are required');
    }
    positive('omega', omega);
    const normal = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const rhs = [0, 0, 0];
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      const time = typeof sample === 'number' ? index : finite('sample.time', sample.time);
      const value = finite('sample value', valueFromSample(sample, selector));
      const basis = [1, Math.cos(omega * time), Math.sin(omega * time)];
      for (let row = 0; row < 3; row += 1) {
        rhs[row] += basis[row] * value;
        for (let column = 0; column < 3; column += 1) {
          normal[row][column] += basis[row] * basis[column];
        }
      }
    }
    const [mean, cosine, sine] = solveLinearSystem(normal, rhs);
    return {
      ...withPolar(complex(cosine, -sine)),
      mean,
      cosine,
      sine,
      sampleCount: samples.length,
    };
  }

  function normalizeTheodorsenRows(rows) {
    if (!Array.isArray(rows) || rows.length < 2) {
      throw new RangeError('Theodorsen table must contain at least two rows');
    }
    return rows.map(row => {
      const k = Number(row.k ?? row.reducedFrequency ?? row.x);
      const real = Number(row.real ?? row.f ?? row.F ?? row.re ?? row.cReal);
      const imag = Number(row.imag ?? row.g ?? row.G ?? row.im ?? row.cImag);
      if (!Number.isFinite(k) || !Number.isFinite(real) || !Number.isFinite(imag)) {
        throw new TypeError('Theodorsen rows must contain finite k, real/f and imag/g');
      }
      return { k, real, imag };
    }).sort((a, b) => a.k - b.k);
  }

  function interpolateTheodorsen(k, rows) {
    finite('k', k);
    if (k < 0) throw new RangeError('k cannot be negative');
    if (k === 0) return { k: 0, ...withPolar(complex(1, 0)), clamped: false };
    const table = normalizeTheodorsenRows(rows);
    if (k <= table[0].k) {
      return { k, ...withPolar(table[0]), clamped: k < table[0].k };
    }
    if (k >= table.at(-1).k) {
      return { k, ...withPolar(table.at(-1)), clamped: k > table.at(-1).k };
    }
    let low = 0;
    let high = table.length - 1;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (table[middle].k <= k) low = middle;
      else high = middle;
    }
    const fraction = (k - table[low].k) / (table[high].k - table[low].k);
    const value = complex(
      table[low].real + fraction * (table[high].real - table[low].real),
      table[low].imag + fraction * (table[high].imag - table[low].imag),
    );
    return { k, ...withPolar(value), clamped: false };
  }

  function normalizeComplex(value) {
    if (!value) throw new TypeError('complex value is required');
    const real = Number(value.real ?? value.f ?? value.re);
    const imag = Number(value.imag ?? value.g ?? value.im);
    if (!Number.isFinite(real) || !Number.isFinite(imag)) {
      throw new TypeError('complex value must contain finite real and imag');
    }
    return withPolar(complex(real, imag));
  }

  function compareResponse(numerical, reference, options = {}) {
    const actual = normalizeComplex(
      numerical.circulatoryResponse ?? numerical.cNumerical ?? numerical,
    );
    const expected = normalizeComplex(reference);
    const magnitudeRelativeTolerance = options.magnitudeRelativeTolerance ?? 0.06;
    const phaseToleranceDegrees = options.phaseToleranceDegrees ?? 5;
    const magnitudeError = actual.magnitude - expected.magnitude;
    const magnitudeRelativeError = magnitudeError / Math.max(expected.magnitude, EPS);
    const phaseErrorRadians = wrapPhase(actual.phaseRadians - expected.phaseRadians);
    const phaseErrorDegrees = phaseErrorRadians * 180 / Math.PI;
    const complexError = Math.hypot(actual.real - expected.real, actual.imag - expected.imag);
    return {
      numerical: actual,
      reference: expected,
      magnitudeError,
      magnitudeRelativeError,
      phaseErrorRadians,
      phaseErrorDegrees,
      complexError,
      magnitudeRelativeTolerance,
      phaseToleranceDegrees,
      passes: Math.abs(magnitudeRelativeError) <= magnitudeRelativeTolerance
        && Math.abs(phaseErrorDegrees) <= phaseToleranceDegrees,
    };
  }

  function runHarmonicResponse(options = {}) {
    const requestedStage = options.stage ?? 'straight';
    const stage = STAGE_ALIASES[requestedStage];
    if (!stage) throw new RangeError(`unknown wake stage: ${requestedStage}`);
    const k = positive('k', options.k ?? 0.5);
    const chord = positive('chord', options.chord ?? 1);
    const freestream = positive('freestream', options.freestream ?? options.U ?? 1);
    const rho = positive('rho', options.rho ?? 1);
    const amplitude = positive('amplitude', options.amplitude ?? options.heaveAmplitude ?? 0.005 * chord);
    const phase = finite('phase', options.phase ?? 0);
    const freeStage = stage === 'free';
    const panelCount = integerAtLeast(
      'panelCount',
      options.panelCount ?? options.panels ?? (freeStage ? 8 : 16),
      1,
    );
    const stepsPerCycle = integerAtLeast(
      'stepsPerCycle',
      options.stepsPerCycle ?? (freeStage ? 32 : 128),
      8,
    );
    const cycles = integerAtLeast('cycles', options.cycles ?? (freeStage ? 6 : 14), 2);
    const measureCycles = integerAtLeast(
      'measureCycles',
      options.measureCycles ?? (freeStage ? 2 : 4),
      1,
    );
    if (measureCycles >= cycles) throw new RangeError('measureCycles must be less than cycles');
    const wakePlacement = finite('wakePlacement', options.wakePlacement ?? options.beta ?? 0.25);
    if (wakePlacement <= 0 || wakePlacement >= 1) {
      throw new RangeError('wakePlacement must lie between zero and one');
    }
    const coreRadius = finite('coreRadius', options.coreRadius ?? 0.005 * chord);
    if (coreRadius < 0) throw new RangeError('coreRadius cannot be negative');
    const inductionScale = finite('inductionScale', options.inductionScale ?? 1);
    const maxWakeParticles = integerAtLeast(
      'maxWakeParticles',
      options.maxWakeParticles ?? 5000,
      1,
    );
    const snapshotCount = options.snapshotCount ?? 0;
    const maxSnapshotPoints = options.maxSnapshotPoints ?? 120;
    if (!Number.isInteger(snapshotCount) || snapshotCount < 0) {
      throw new RangeError('snapshotCount must be a non-negative integer');
    }
    integerAtLeast('maxSnapshotPoints', maxSnapshotPoints, 2);
    const omega = 2 * k * freestream / chord;
    const period = TWO_PI / omega;
    const dt = period / stepsPerCycle;
    const totalSteps = cycles * stepsPerCycle;
    if (stage !== 'bound' && totalSteps > maxWakeParticles) {
      throw new RangeError('requested run exceeds maxWakeParticles; increase the explicit cap');
    }
    const dvm = createFlatPlateDvm({ chord, panelCount });
    let wake = [];
    let previousBoundTotal = 0;
    let previousBoundStrengths = Array(panelCount).fill(0);
    let olderBoundStrengths = Array(panelCount).fill(0);
    let previousPotentialMoment = Number.NaN;
    let olderPotentialMoment = Number.NaN;
    let maximumBoundaryResidual = 0;
    let maximumKelvinResidual = 0;
    const measured = [];
    const history = options.includeHistory ? [] : null;
    const wakeSnapshots = snapshotCount ? [] : null;
    const snapshotStride = snapshotCount
      ? Math.max(1, Math.floor(stepsPerCycle / snapshotCount))
      : Number.POSITIVE_INFINITY;
    const measurementStart = (cycles - measureCycles) * stepsPerCycle;

    for (let stepIndex = 1; stepIndex <= totalSteps; stepIndex += 1) {
      const time = stepIndex * dt;
      const previousTime = time - dt;
      const motion = harmonicHeave({ time, k, chord, freestream, amplitude, phase });

      if (stage === 'straight' || stage === 'sinusoidal') {
        wake = wake.map(vortex => ({
          ...vortex,
          x: chord + freestream * Math.max(0, time - vortex.shedTime),
          y: stage === 'straight' ? 0 : vortex.shedHeight - motion.h,
        }));
      } else if (stage === 'free') {
        wake = convectFreeWakeMidpoint({
          wake,
          dvm,
          boundStrengths: previousBoundStrengths,
          previousBoundStrengths: olderBoundStrengths,
          time: previousTime,
          dt,
          k,
          chord,
          freestream,
          amplitude,
          phase,
          coreRadius,
          inductionScale,
        });
      }

      let step;
      if (stage === 'bound') {
        step = solveBoundOnly(dvm, motion.normalVelocity);
        step.newWakeCirculation = 0;
        step.totalKelvinResidual = Number.NaN;
      } else {
        const shedTime = time - wakePlacement * dt;
        const positionStage = stage === 'straight' ? 'straight' : 'sinusoidal';
        const newWakePosition = prescribedWakePosition(positionStage, {
          time,
          shedTime,
          k,
          chord,
          freestream,
          amplitude,
          phase,
        });
        step = solveUnsteadyStep({
          dvm,
          normalVelocity: motion.normalVelocity,
          oldWake: wake,
          previousBoundTotal,
          newWakePosition,
          wakeCoreRadius: stage === 'free' ? coreRadius : 0,
        });
        wake.push({
          ...newWakePosition,
          circulation: step.newWakeCirculation,
          shedTime,
          shedHeight: stage === 'straight' ? 0 : harmonicHeave({
            time: shedTime,
            k,
            chord,
            freestream,
            amplitude,
            phase,
          }).h,
        });
        maximumKelvinResidual = Math.max(
          maximumKelvinResidual,
          Math.abs(step.totalKelvinResidual),
        );
      }

      maximumBoundaryResidual = Math.max(
        maximumBoundaryResidual,
        Math.abs(step.boundaryResidual),
      );
      const terms = pressureLiftTerms({
        dvm,
        boundStrengths: step.boundStrengths,
        wake,
        freestream,
        wakeCoreRadius: stage === 'free' ? coreRadius : 0,
        wakeVelocity: step.combinedWakeVelocity,
      });
      const instantaneous = pressureLiftSample({
        rho,
        quasiSteadyForceTerm: terms.quasiSteadyForceTerm,
        potentialMoment: terms.potentialMoment,
        previousPotentialMoment,
        olderPotentialMoment,
        dt,
      });
      const sample = {
        time,
        heave: motion.h,
        heaveVelocity: motion.hDot,
        normalVelocity: motion.normalVelocity,
        normalVelocityDot: motion.normalVelocityDot,
        boundTotal: step.boundTotal,
        potentialMoment: terms.potentialMoment,
        quasiSteadyForceTerm: terms.quasiSteadyForceTerm,
        totalLift: instantaneous.totalLift,
        boundaryResidual: step.boundaryResidual,
        kelvinResidual: step.totalKelvinResidual,
        wakeCount: wake.length,
      };
      if (stepIndex > measurementStart) measured.push(sample);
      if (history) history.push(sample);
      const cycleStep = stepIndex - (totalSteps - stepsPerCycle);
      if (
        wakeSnapshots
        && cycleStep > 0
        && (cycleStep % snapshotStride === 0 || stepIndex === totalSteps)
      ) {
        const count = Math.min(maxSnapshotPoints, wake.length);
        const sampledWake = Array.from({ length: count }, (_, index) => {
          const sourceIndex = count === 1
            ? wake.length - 1
            : Math.round(index * (wake.length - 1) / (count - 1));
          const vortex = wake[sourceIndex];
          return {
            x: vortex.x,
            y: vortex.y,
            circulation: vortex.circulation,
            shedTime: vortex.shedTime,
          };
        });
        wakeSnapshots.push({
          phase: wrapPhase(omega * time + phase - Math.PI / 2),
          heave: motion.h,
          boundTotal: step.boundTotal,
          wake: sampledWake,
        });
      }
      olderPotentialMoment = previousPotentialMoment;
      previousPotentialMoment = terms.potentialMoment;
      olderBoundStrengths = previousBoundStrengths;
      previousBoundStrengths = step.boundStrengths;
      previousBoundTotal = step.boundTotal;
    }

    const normalFit = fitHarmonicResponse(measured, omega, 'normalVelocity');
    const boundFit = fitHarmonicResponse(measured, omega, 'boundTotal');
    const quasiSteadyFit = fitHarmonicResponse(measured, omega, 'quasiSteadyForceTerm');
    const potentialFit = fitHarmonicResponse(measured, omega, 'potentialMoment');
    const normalHat = complex(normalFit.real, normalFit.imag);
    const boundHat = complex(boundFit.real, boundFit.imag);
    const quasiSteadyHat = complex(quasiSteadyFit.real, quasiSteadyFit.imag);
    const potentialHat = complex(potentialFit.real, potentialFit.imag);
    const timeDerivativePotentialHat = complexScale(
      complexMultiply(complex(0, omega), potentialHat),
      1,
    );
    const totalLiftHat = complexScale(
      complexAdd(quasiSteadyHat, timeDerivativePotentialHat),
      rho,
    );
    const apparentMassLiftHat = complexScale(
      complexMultiply(complex(0, omega), normalHat),
      Math.PI * rho * chord * chord / 4,
    );
    const circulatoryLiftHat = complexSubtract(totalLiftHat, apparentMassLiftHat);
    const liftDenominator = complexScale(normalHat, Math.PI * rho * freestream * chord);
    const circulationDenominator = complexScale(normalHat, Math.PI * chord);
    const totalLiftResponse = withPolar(complexDivide(totalLiftHat, liftDenominator));
    const apparentMassResponse = withPolar(complexDivide(
      apparentMassLiftHat,
      liftDenominator,
    ));
    const pressureDerivedCirculatoryResponse = withPolar(complexDivide(
      circulatoryLiftHat,
      liftDenominator,
    ));
    const boundCirculationResponse = withPolar(complexDivide(
      boundHat,
      circulationDenominator,
    ));
    // With no wake, the only honest baseline is the quasi-steady circulation
    // transfer. The pressure/apparent-mass split becomes the physical response
    // only once the Kelvin-closed unsteady wake is present.
    const circulatoryResponse = stage === 'bound'
      ? boundCirculationResponse
      : pressureDerivedCirculatoryResponse;
    const theodorsenTable = options.theodorsenTable ?? options.referenceTable;
    const reference = theodorsenTable
      ? interpolateTheodorsen(k, theodorsenTable)
      : null;
    const result = {
      stage,
      k,
      omega,
      period,
      dt,
      chord,
      freestream,
      rho,
      amplitude,
      panelCount,
      stepsPerCycle,
      cycles,
      measureCycles,
      wakePlacement,
      coreRadius: stage === 'free' ? coreRadius : 0,
      circulatoryResponse,
      cNumerical: circulatoryResponse,
      response: circulatoryResponse,
      circulatory: circulatoryResponse,
      totalLiftResponse,
      apparentMassResponse,
      boundCirculationResponse,
      pressureDerivedCirculatoryResponse,
      phasors: {
        normalVelocity: withPolar(normalHat),
        boundCirculation: withPolar(boundHat),
        totalLift: withPolar(totalLiftHat),
        apparentMassLift: withPolar(apparentMassLiftHat),
        circulatoryLift: withPolar(circulatoryLiftHat),
      },
      diagnostics: {
        maximumBoundaryResidual,
        maximumKelvinResidual: stage === 'bound' ? Number.NaN : maximumKelvinResidual,
        wakeParticles: wake.length,
      },
      reference,
      comparison: reference ? compareResponse(circulatoryResponse, reference, options) : null,
      samples: measured,
      history,
      wakeSnapshots,
      finalState: {
        boundStrengths: [...previousBoundStrengths],
        boundTotal: previousBoundTotal,
        wake: wake.map(vortex => ({ ...vortex })),
      },
      caveat: stage === 'bound'
        ? 'Bound-only response is a quasi-steady calibration and is not Kelvin-closed.'
        : stage === 'straight'
          ? 'The prescribed straight wake is the linearized Theodorsen comparison stage.'
          : 'Curved/free wake agreement with Theodorsen is an amplitude-and-resolution convergence test.',
    };
    return result;
  }

  return {
    compareResponse,
    convectFreeWakeMidpoint,
    createFlatPlateDvm,
    fitHarmonicResponse,
    freeWakeVelocities,
    harmonicHeave,
    interpolateTheodorsen,
    prescribedWakePosition,
    pressureLiftSample,
    pressureLiftTerms,
    regularizedPointVortexVelocity,
    runHarmonicResponse,
    solveBoundOnly,
    solveLinearSystem,
    solveUnsteadyStep,
    straightWakePosition,
    trailingEdgeHistoryPosition,
    wakeVelocityAtPoints,
  };
}));
