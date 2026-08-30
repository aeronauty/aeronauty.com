/**
 * Finite-wing vortex-lattice and free-wake primitives for the
 * Computational Experimentation article.
 *
 * Coordinate and sign convention (used everywhere in this file):
 *   x downstream, y from port to starboard, z upward (right handed).
 *   The rectangular wing lies in z = 0 and its normal is +z.
 *   Positive circulation follows the right-hand rule about an oriented
 *   filament. Bound segments run in +y, so positive circulation produces
 *   downwash behind the segment and positive lift for a +x freestream.
 *
 * The geometry follows Katz & Plotkin, Low-Speed Aerodynamics (2nd ed.):
 * the leading segment of every vortex ring is at the panel quarter chord,
 * collocation is at three-quarter chord, and a steady trailing-edge ring is
 * continued by an equal-strength wake ring (Secs. 10.4.5, 12.3). In the
 * unsteady solver a newly shed wake row receives the previous time step's
 * trailing-edge strength and then keeps that strength (Sec. 13.12, Eq.
 * 13.142). Closed rings therefore enforce Kelvin/Helmholtz topology without
 * an extra circulation equation.
 *
 * Browser: globalThis.ComputationalExperimentVLM
 * Node:    module.exports
 */
(function exposeVlm(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ComputationalExperimentVLM = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const FOUR_PI = 4 * Math.PI;
  const EPS = 1e-12;

  function assertFinite(name, value) {
    if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
    return value;
  }

  function assertPositive(name, value) {
    assertFinite(name, value);
    if (value <= 0) throw new RangeError(`${name} must be positive`);
    return value;
  }

  function assertPositiveInteger(name, value) {
    if (!Number.isInteger(value) || value < 1) {
      throw new RangeError(`${name} must be a positive integer`);
    }
    return value;
  }

  function validatePoint(name, point) {
    if (
      !point
      || !Number.isFinite(point.x)
      || !Number.isFinite(point.y)
      || !Number.isFinite(point.z)
    ) {
      throw new TypeError(`${name} must contain finite x, y and z coordinates`);
    }
    return point;
  }

  function point(x, y, z, id) {
    const value = { x, y, z };
    if (id !== undefined) value.id = id;
    return value;
  }

  function clonePoint(value) {
    return point(value.x, value.y, value.z, value.id);
  }

  function add3(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  function subtract3(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  function scale3(vector, scalar) {
    return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
  }

  function dot3(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function cross3(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }

  function magnitude3(vector) {
    return Math.hypot(vector.x, vector.y, vector.z);
  }

  function maxAbs(values) {
    let result = 0;
    for (const value of values) result = Math.max(result, Math.abs(value));
    return result;
  }

  function zeroVelocity() {
    return { x: 0, y: 0, z: 0 };
  }

  /**
   * Katz & Plotkin Eq. 10.115 for a finite filament A -> B.
   *
   * coreRadius = 0 gives the exact inviscid kernel. A positive coreRadius
   * uses a Rosenhead-Moore denominator
   *   |r1 x r2|^2 + rc^2 |B-A|^2,
   * which tends to the usual r/(r^2 + rc^2) infinite-line core. Endpoint
   * and zero-length singularities return zero; wake-node convection also
   * excludes every incident filament explicitly.
   */
  function finiteVortexSegmentVelocity(A, B, P, circulation = 1, coreRadius = 0) {
    validatePoint('A', A);
    validatePoint('B', B);
    validatePoint('P', P);
    assertFinite('circulation', circulation);
    assertFinite('coreRadius', coreRadius);
    if (coreRadius < 0) throw new RangeError('coreRadius cannot be negative');

    const r0 = subtract3(B, A);
    const r1 = subtract3(P, A);
    const r2 = subtract3(P, B);
    const length = magnitude3(r0);
    if (length <= EPS) return zeroVelocity();

    const distance1 = magnitude3(r1);
    const distance2 = magnitude3(r2);
    const localTolerance = EPS * Math.max(1, length);
    if (distance1 <= localTolerance || distance2 <= localTolerance) return zeroVelocity();

    const perpendicular = cross3(r1, r2);
    const perpendicularSquared = dot3(perpendicular, perpendicular);
    const regularizedDenominator = perpendicularSquared + coreRadius ** 2 * length ** 2;
    if (regularizedDenominator <= localTolerance ** 4) return zeroVelocity();

    const endpointFactor = dot3(r0, {
      x: r1.x / distance1 - r2.x / distance2,
      y: r1.y / distance1 - r2.y / distance2,
      z: r1.z / distance1 - r2.z / distance2,
    });
    const coefficient = circulation * endpointFactor / (FOUR_PI * regularizedDenominator);
    return scale3(perpendicular, coefficient);
  }

  function vortexRingVelocity(corners, P, circulation = 1, coreRadius = 0) {
    if (!Array.isArray(corners) || corners.length !== 4) {
      throw new TypeError('corners must contain four points');
    }
    validatePoint('P', P);
    let velocity = zeroVelocity();
    for (let index = 0; index < 4; index += 1) {
      velocity = add3(velocity, finiteVortexSegmentVelocity(
        corners[index],
        corners[(index + 1) % 4],
        P,
        circulation,
        coreRadius,
      ));
    }
    return velocity;
  }

  function cosineSpanEdges(span, count, centerY) {
    const edges = [];
    for (let index = 0; index <= count; index += 1) {
      edges.push(centerY - 0.5 * span * Math.cos(Math.PI * index / count));
    }
    return edges;
  }

  function uniformSpanEdges(span, count, centerY) {
    const edges = [];
    for (let index = 0; index <= count; index += 1) {
      edges.push(centerY - span / 2 + span * index / count);
    }
    return edges;
  }

  /**
   * Build a planar rectangular Katz-Plotkin vortex-ring lattice.
   * Vortex x rows are x_LE + (i + 1/4) dx, including an aft row one
   * quarter-panel behind the physical trailing edge. Collocation x is
   * x_LE + (i + 3/4) dx.
   */
  function createRectangularWingLattice(options = {}) {
    const chord = assertPositive('chord', options.chord ?? 1);
    const span = assertPositive('span', options.span ?? 6);
    const chordPanels = assertPositiveInteger('chordPanels', options.chordPanels ?? 2);
    const spanPanels = assertPositiveInteger('spanPanels', options.spanPanels ?? 12);
    const spanSpacing = options.spanSpacing ?? 'cosine';
    if (spanSpacing !== 'uniform' && spanSpacing !== 'cosine') {
      throw new RangeError("spanSpacing must be 'uniform' or 'cosine'");
    }
    const origin = options.origin ?? { x: 0, y: 0, z: 0 };
    validatePoint('origin', origin);

    const dx = chord / chordPanels;
    const xRows = [];
    for (let i = 0; i <= chordPanels; i += 1) {
      xRows.push(origin.x + (i + 0.25) * dx);
    }
    const yEdges = spanSpacing === 'cosine'
      ? cosineSpanEdges(span, spanPanels, origin.y)
      : uniformSpanEdges(span, spanPanels, origin.y);

    const nodes = xRows.map((x, i) => yEdges.map((y, j) => (
      point(x, y, origin.z, `bound:${i}:${j}`)
    )));
    const panels = [];
    for (let i = 0; i < chordPanels; i += 1) {
      for (let j = 0; j < spanPanels; j += 1) {
        const corners = [
          nodes[i][j],
          nodes[i][j + 1],
          nodes[i + 1][j + 1],
          nodes[i + 1][j],
        ];
        panels.push({
          index: panels.length,
          chordIndex: i,
          spanIndex: j,
          isTrailingEdge: i === chordPanels - 1,
          corners,
          nodeIds: corners.map((corner) => corner.id),
          collocation: point(
            origin.x + (i + 0.75) * dx,
            0.5 * (yEdges[j] + yEdges[j + 1]),
            origin.z,
          ),
          normal: { x: 0, y: 0, z: 1 },
          chordWidth: dx,
          spanWidth: yEdges[j + 1] - yEdges[j],
          area: dx * (yEdges[j + 1] - yEdges[j]),
        });
      }
    }

    return {
      type: 'rectangular-vortex-ring-lattice',
      chord,
      span,
      aspectRatio: span / chord,
      referenceArea: span * chord,
      chordPanels,
      spanPanels,
      spanSpacing,
      origin: clonePoint(origin),
      dx,
      xRows,
      yEdges,
      nodes,
      panels,
      trailingEdgeX: origin.x + chord,
      wakeAttachX: xRows[chordPanels],
      trailingEdgePanelIndices: panels
        .filter((panel) => panel.isTrailingEdge)
        .map((panel) => panel.index),
      convention: {
        axes: 'x downstream, y port-to-starboard, z up',
        normal: '+z',
        positiveCirculation: 'right-hand rule about each oriented filament',
        ringOrientation: 'front-left -> front-right -> aft-right -> aft-left',
      },
    };
  }

  function resolveFreestream(options = {}) {
    if (options.freestream) {
      validatePoint('freestream', options.freestream);
      const velocity = clonePoint(options.freestream);
      return { velocity, speed: magnitude3(velocity) };
    }
    const speed = assertPositive('speed', options.speed ?? 1);
    const alpha = options.alpha ?? ((options.alphaDeg ?? 5) * Math.PI / 180);
    assertFinite('alpha', alpha);
    const sideslip = options.sideslip ?? 0;
    assertFinite('sideslip', sideslip);
    const velocity = {
      x: speed * Math.cos(alpha) * Math.cos(sideslip),
      y: speed * Math.sin(sideslip),
      z: speed * Math.sin(alpha) * Math.cos(sideslip),
    };
    return { velocity, speed };
  }

  function ringRecord(corners, nodeIds, strength, kind, metadata = {}) {
    return { corners, nodeIds, strength, kind, ...metadata };
  }

  function boundRings(lattice, strengths) {
    if (!Array.isArray(strengths) || strengths.length !== lattice.panels.length) {
      throw new RangeError('bound strengths must match the number of lattice panels');
    }
    return lattice.panels.map((panel) => ringRecord(
      panel.corners,
      panel.nodeIds,
      strengths[panel.index],
      'bound',
      { panelIndex: panel.index },
    ));
  }

  function attachedSteadyWakeRing(lattice, spanIndex, wakeLength) {
    const i = lattice.chordPanels;
    const left = lattice.nodes[i][spanIndex];
    const right = lattice.nodes[i][spanIndex + 1];
    const farRight = point(
      lattice.wakeAttachX + wakeLength,
      right.y,
      right.z,
      `steady-far:${spanIndex + 1}`,
    );
    const farLeft = point(
      lattice.wakeAttachX + wakeLength,
      left.y,
      left.z,
      `steady-far:${spanIndex}`,
    );
    return ringRecord(
      [left, right, farRight, farLeft],
      [left.id, right.id, farRight.id, farLeft.id],
      1,
      'steady-wake',
      { spanIndex },
    );
  }

  function buildBoundInfluenceMatrix(lattice) {
    return lattice.panels.map((target) => lattice.panels.map((source) => (
      dot3(vortexRingVelocity(source.corners, target.collocation, 1, 0), target.normal)
    )));
  }

  function buildSteadyInfluenceMatrix(lattice, wakeLength = 100 * lattice.span) {
    assertPositive('wakeLength', wakeLength);
    return lattice.panels.map((target) => lattice.panels.map((source) => {
      let velocity = vortexRingVelocity(source.corners, target.collocation, 1, 0);
      if (source.isTrailingEdge) {
        const wake = attachedSteadyWakeRing(lattice, source.spanIndex, wakeLength);
        velocity = add3(velocity, vortexRingVelocity(wake.corners, target.collocation, 1, 0));
      }
      return dot3(velocity, target.normal);
    }));
  }

  function solveLinearSystem(matrix, rightHandSide) {
    const size = rightHandSide.length;
    if (!Array.isArray(matrix) || matrix.length !== size || size < 1) {
      throw new RangeError('matrix and rightHandSide dimensions do not match');
    }
    const augmented = matrix.map((row, index) => {
      if (!Array.isArray(row) || row.length !== size) {
        throw new RangeError('matrix must be square');
      }
      return [...row, rightHandSide[index]];
    });
    let smallestPivot = Infinity;
    let largestPivot = 0;

    for (let column = 0; column < size; column += 1) {
      let pivotRow = column;
      for (let row = column + 1; row < size; row += 1) {
        if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) {
          pivotRow = row;
        }
      }
      const pivotMagnitude = Math.abs(augmented[pivotRow][column]);
      if (!Number.isFinite(pivotMagnitude) || pivotMagnitude < 1e-14) {
        throw new RangeError('vortex-lattice influence matrix is singular or ill-conditioned');
      }
      [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];
      smallestPivot = Math.min(smallestPivot, pivotMagnitude);
      largestPivot = Math.max(largestPivot, pivotMagnitude);

      for (let row = column + 1; row < size; row += 1) {
        const factor = augmented[row][column] / augmented[column][column];
        augmented[row][column] = 0;
        for (let entry = column + 1; entry <= size; entry += 1) {
          augmented[row][entry] -= factor * augmented[column][entry];
        }
      }
    }

    const solution = new Array(size).fill(0);
    for (let row = size - 1; row >= 0; row -= 1) {
      let remainder = augmented[row][size];
      for (let column = row + 1; column < size; column += 1) {
        remainder -= augmented[row][column] * solution[column];
      }
      solution[row] = remainder / augmented[row][row];
    }
    return {
      solution,
      pivotSpread: largestPivot / smallestPivot,
    };
  }

  function matrixResidual(matrix, solution, rightHandSide) {
    return matrix.map((row, rowIndex) => (
      row.reduce((sum, coefficient, column) => sum + coefficient * solution[column], 0)
      - rightHandSide[rowIndex]
    ));
  }

  function circulationLoads(lattice, strengths, freestream, density = 1) {
    assertPositive('density', density);
    const speed = magnitude3(freestream);
    const dynamicPressure = 0.5 * density * speed ** 2;
    const localCirculation = new Array(strengths.length).fill(0);
    const spanwiseCirculation = new Array(lattice.spanPanels).fill(0);
    let force = zeroVelocity();

    for (const panel of lattice.panels) {
      const upstreamIndex = panel.chordIndex === 0
        ? -1
        : panel.index - lattice.spanPanels;
      const upstreamStrength = upstreamIndex < 0 ? 0 : strengths[upstreamIndex];
      const circulation = strengths[panel.index] - upstreamStrength;
      localCirculation[panel.index] = circulation;
      spanwiseCirculation[panel.spanIndex] += circulation;
      const dl = { x: 0, y: panel.spanWidth, z: 0 };
      force = add3(force, scale3(cross3(freestream, dl), density * circulation));
    }

    // Wing-normal lift is the z component of the same Kutta-Joukowski force
    // vector reported below. Using |V| here would overstate lift at incidence
    // and make the scalar and vector outputs disagree by cos(alpha).
    const lift = force.z;

    return {
      localCirculation,
      spanwiseCirculation,
      force,
      lift,
      coefficient: lift / (dynamicPressure * lattice.referenceArea),
      CL: lift / (dynamicPressure * lattice.referenceArea),
      dynamicPressure,
    };
  }

  /** Steady Katz-Plotkin vortex-ring VLM with an attached far wake. */
  function solveSteadyVlm(options = {}) {
    const lattice = options.lattice ?? createRectangularWingLattice(options);
    const { velocity: freestream, speed } = resolveFreestream(options);
    if (speed <= EPS) throw new RangeError('freestream speed must be positive');
    const wakeLength = options.wakeLength ?? 100 * lattice.span;
    const influenceMatrix = buildSteadyInfluenceMatrix(lattice, wakeLength);
    const rightHandSide = lattice.panels.map((panel) => -dot3(freestream, panel.normal));
    const solved = solveLinearSystem(influenceMatrix, rightHandSide);
    const residual = matrixResidual(influenceMatrix, solved.solution, rightHandSide);
    const loads = circulationLoads(lattice, solved.solution, freestream, options.density ?? 1);
    return {
      lattice,
      freestream,
      wakeLength,
      strengths: solved.solution,
      influenceMatrix,
      rightHandSide,
      residual,
      maxBoundaryResidual: maxAbs(residual),
      pivotSpread: solved.pivotSpread,
      loads,
      CL: loads.CL,
    };
  }

  /**
   * Independent Prandtl lifting-line reference for an untwisted rectangular
   * wing. Odd Fourier modes solve
   * alpha = sum A_n sin(n theta) [4 b/(a0 c) + n/sin(theta)],
   * with CL = pi AR A_1.
   */
  function liftingLineRectangularReference(options = {}) {
    const aspectRatio = assertPositive('aspectRatio', options.aspectRatio ?? 6);
    const alpha = options.alpha ?? ((options.alphaDeg ?? 5) * Math.PI / 180);
    assertFinite('alpha', alpha);
    const sectionLiftSlope = assertPositive('sectionLiftSlope', options.sectionLiftSlope ?? 2 * Math.PI);
    const terms = assertPositiveInteger('terms', options.terms ?? 20);
    const modes = Array.from({ length: terms }, (_, index) => 2 * index + 1);
    const matrix = [];
    const rightHandSide = [];
    for (let row = 0; row < terms; row += 1) {
      const theta = (row + 1) * Math.PI / (2 * terms);
      const sinTheta = Math.sin(theta);
      matrix.push(modes.map((mode) => (
        Math.sin(mode * theta)
        * (4 * aspectRatio / sectionLiftSlope + mode / sinTheta)
      )));
      rightHandSide.push(alpha);
    }
    const solved = solveLinearSystem(matrix, rightHandSide);
    const CL = Math.PI * aspectRatio * solved.solution[0];
    return {
      aspectRatio,
      alpha,
      sectionLiftSlope,
      modes,
      coefficients: solved.solution,
      CL,
      liftSlope: Math.abs(alpha) <= EPS ? Number.NaN : CL / alpha,
      residual: matrixResidual(matrix, solved.solution, rightHandSide),
    };
  }

  function createWakeState(lattice) {
    if (!lattice || lattice.type !== 'rectangular-vortex-ring-lattice') {
      throw new TypeError('lattice must be created by createRectangularWingLattice');
    }
    return {
      type: 'vortex-ring-wake-state',
      spanPanels: lattice.spanPanels,
      nodeRows: [],
      strengthRows: [],
      previousTrailingStrengths: null,
      boundStrengths: null,
      time: 0,
      step: 0,
      nextRowId: 0,
      lastConvectionDiagnostics: null,
    };
  }

  function cloneWakeState(wake) {
    if (!wake || wake.type !== 'vortex-ring-wake-state') {
      throw new TypeError('wake must be created by createWakeState');
    }
    return {
      ...wake,
      nodeRows: wake.nodeRows.map((row) => ({
        ...row,
        points: row.points.map(clonePoint),
      })),
      strengthRows: wake.strengthRows.map((row) => row.slice()),
      previousTrailingStrengths: wake.previousTrailingStrengths
        ? wake.previousTrailingStrengths.slice()
        : null,
      boundStrengths: wake.boundStrengths ? wake.boundStrengths.slice() : null,
      lastConvectionDiagnostics: wake.lastConvectionDiagnostics
        ? { ...wake.lastConvectionDiagnostics }
        : null,
    };
  }

  function wakeRings(lattice, wake) {
    if (wake.nodeRows.length !== wake.strengthRows.length) {
      throw new RangeError('wake node rows and strength rows must have equal length');
    }
    const rings = [];
    for (let rowIndex = 0; rowIndex < wake.nodeRows.length; rowIndex += 1) {
      const upstream = rowIndex === 0
        ? lattice.nodes[lattice.chordPanels]
        : wake.nodeRows[rowIndex - 1].points;
      const downstream = wake.nodeRows[rowIndex].points;
      const strengths = wake.strengthRows[rowIndex];
      if (strengths.length !== lattice.spanPanels) {
        throw new RangeError('each wake strength row must match spanPanels');
      }
      for (let j = 0; j < lattice.spanPanels; j += 1) {
        const corners = [upstream[j], upstream[j + 1], downstream[j + 1], downstream[j]];
        rings.push(ringRecord(
          corners,
          corners.map((corner) => corner.id),
          strengths[j],
          'wake',
          { rowIndex, spanIndex: j },
        ));
      }
    }
    return rings;
  }

  function coordinateId(value, tolerance) {
    const quantize = (component) => Math.round(component / tolerance);
    return `xyz:${quantize(value.x)}:${quantize(value.y)}:${quantize(value.z)}`;
  }

  /** Merge shared ring edges into physical vortex filaments. */
  function assembleFilaments(input, options = {}) {
    const tolerance = options.tolerance ?? 1e-10;
    assertPositive('tolerance', tolerance);
    let rings;
    if (Array.isArray(input)) {
      rings = input;
    } else if (input && input.lattice) {
      rings = [];
      if (input.boundStrengths) rings.push(...boundRings(input.lattice, input.boundStrengths));
      if (input.wake) rings.push(...wakeRings(input.lattice, input.wake));
    } else {
      throw new TypeError('input must be an array of rings or { lattice, boundStrengths, wake }');
    }

    const merged = new Map();
    for (const ring of rings) {
      if (!ring || !Array.isArray(ring.corners) || ring.corners.length !== 4) {
        throw new TypeError('every ring must have four corners');
      }
      const strength = ring.strength ?? 1;
      assertFinite('ring strength', strength);
      for (let index = 0; index < 4; index += 1) {
        const start = ring.corners[index];
        const end = ring.corners[(index + 1) % 4];
        const startId = ring.nodeIds?.[index] ?? start.id ?? coordinateId(start, tolerance);
        const endId = ring.nodeIds?.[(index + 1) % 4] ?? end.id ?? coordinateId(end, tolerance);
        if (startId === endId) continue;
        const forward = String(startId) < String(endId);
        const aId = forward ? String(startId) : String(endId);
        const bId = forward ? String(endId) : String(startId);
        const key = `${aId}|${bId}`;
        const signedStrength = forward ? strength : -strength;
        const current = merged.get(key);
        if (current) {
          current.circulation += signedStrength;
          current.contributors += 1;
        } else {
          merged.set(key, {
            a: clonePoint(forward ? start : end),
            b: clonePoint(forward ? end : start),
            aId,
            bId,
            circulation: signedStrength,
            contributors: 1,
          });
        }
      }
    }
    return [...merged.values()].filter((filament) => Math.abs(filament.circulation) > tolerance);
  }

  function filamentClosureResidual(input, options = {}) {
    const filaments = Array.isArray(input) && input.every((item) => item && 'circulation' in item)
      ? input
      : assembleFilaments(input, options);
    const balance = new Map();
    for (const filament of filaments) {
      balance.set(filament.aId, (balance.get(filament.aId) ?? 0) + filament.circulation);
      balance.set(filament.bId, (balance.get(filament.bId) ?? 0) - filament.circulation);
    }
    return {
      maxResidual: maxAbs([...balance.values()]),
      nodeResiduals: Object.fromEntries(balance),
    };
  }

  function inducedVelocityFromFilaments(P, filaments, options = {}) {
    validatePoint('P', P);
    const coreRadius = options.coreRadius ?? 0;
    const excludeNodeId = options.excludeNodeId;
    let velocity = zeroVelocity();
    let skippedIncidentSegments = 0;
    for (const filament of filaments) {
      if (excludeNodeId !== undefined
        && (filament.aId === excludeNodeId || filament.bId === excludeNodeId)) {
        skippedIncidentSegments += 1;
        continue;
      }
      velocity = add3(velocity, finiteVortexSegmentVelocity(
        filament.a,
        filament.b,
        P,
        filament.circulation,
        coreRadius,
      ));
    }
    if (options.withDiagnostics) return { velocity, skippedIncidentSegments };
    return velocity;
  }

  function wakeInducedVelocity(lattice, wake, P, coreRadius = 0) {
    let velocity = zeroVelocity();
    for (const ring of wakeRings(lattice, wake)) {
      velocity = add3(velocity, vortexRingVelocity(
        ring.corners,
        P,
        ring.strength,
        coreRadius,
      ));
    }
    return velocity;
  }

  function translateFlatWake(wake, freestream, dt) {
    const translated = cloneWakeState(wake);
    const distance = freestream.x * dt;
    for (const row of translated.nodeRows) {
      for (const current of row.points) current.x += distance;
    }
    translated.lastConvectionDiagnostics = {
      mode: 'flat',
      maxInducedSpeed: 0,
      skippedIncidentSegments: 0,
    };
    return translated;
  }

  function wakeWithPositions(wake, positions) {
    const result = cloneWakeState(wake);
    let cursor = 0;
    for (const row of result.nodeRows) {
      for (let j = 0; j < row.points.length; j += 1) {
        const id = row.points[j].id;
        row.points[j] = point(positions[cursor].x, positions[cursor].y, positions[cursor].z, id);
        cursor += 1;
      }
    }
    return result;
  }

  function freeWakeNodeVelocities(lattice, wake, boundStrengths, freestream, coreRadius, inductionScale) {
    const rings = [];
    if (boundStrengths) rings.push(...boundRings(lattice, boundStrengths));
    rings.push(...wakeRings(lattice, wake));
    const filaments = assembleFilaments(rings);
    const velocities = [];
    let skippedIncidentSegments = 0;
    let maxInducedSpeed = 0;
    for (const row of wake.nodeRows) {
      for (const current of row.points) {
        const result = inducedVelocityFromFilaments(current, filaments, {
          coreRadius,
          excludeNodeId: current.id,
          withDiagnostics: true,
        });
        skippedIncidentSegments += result.skippedIncidentSegments;
        maxInducedSpeed = Math.max(maxInducedSpeed, magnitude3(result.velocity));
        velocities.push(add3(freestream, scale3(result.velocity, inductionScale)));
      }
    }
    return { velocities, skippedIncidentSegments, maxInducedSpeed, filamentCount: filaments.length };
  }

  /** Convect existing wake rows without changing any shed circulation. */
  function convectWake(options = {}) {
    const { lattice, wake } = options;
    if (!lattice) throw new TypeError('lattice is required');
    const dt = assertPositive('dt', options.dt ?? 0.1);
    const mode = options.mode ?? options.wakeMode ?? 'flat';
    if (mode !== 'flat' && mode !== 'free') {
      throw new RangeError("wake mode must be 'flat' or 'free'");
    }
    const { velocity: freestream } = resolveFreestream(options);
    if (mode === 'flat') {
      return translateFlatWake(wake, freestream, dt);
    }
    if (wake.nodeRows.length === 0) {
      const empty = cloneWakeState(wake);
      empty.lastConvectionDiagnostics = {
        mode: 'free',
        integrator: options.integrator ?? 'heun',
        coreRadius: options.coreRadius ?? 0.05 * Math.min(
          lattice.dx,
          lattice.span / lattice.spanPanels,
        ),
        maxInducedSpeed: 0,
        skippedIncidentSegments: 0,
        filamentCount: 0,
      };
      return empty;
    }

    const coreRadius = assertPositive(
      'coreRadius',
      options.coreRadius ?? 0.05 * Math.min(lattice.dx, lattice.span / lattice.spanPanels),
    );
    const inductionScale = options.inductionScale ?? 1;
    assertFinite('inductionScale', inductionScale);
    const integrator = options.integrator ?? 'heun';
    if (integrator !== 'euler' && integrator !== 'heun') {
      throw new RangeError("integrator must be 'euler' or 'heun'");
    }
    const boundStrengths = options.boundStrengths ?? wake.boundStrengths;
    const first = freeWakeNodeVelocities(
      lattice,
      wake,
      boundStrengths,
      freestream,
      coreRadius,
      inductionScale,
    );
    const currentPositions = wake.nodeRows.flatMap((row) => row.points);
    let finalPositions = currentPositions.map((current, index) => (
      add3(current, scale3(first.velocities[index], dt))
    ));
    let diagnostics = first;

    if (integrator === 'heun') {
      const predictedWake = wakeWithPositions(wake, finalPositions);
      const second = freeWakeNodeVelocities(
        lattice,
        predictedWake,
        boundStrengths,
        freestream,
        coreRadius,
        inductionScale,
      );
      finalPositions = currentPositions.map((current, index) => add3(
        current,
        scale3(add3(first.velocities[index], second.velocities[index]), 0.5 * dt),
      ));
      diagnostics = {
        velocities: second.velocities,
        skippedIncidentSegments: first.skippedIncidentSegments + second.skippedIncidentSegments,
        maxInducedSpeed: Math.max(first.maxInducedSpeed, second.maxInducedSpeed),
        filamentCount: Math.max(first.filamentCount, second.filamentCount),
      };
    }

    const result = wakeWithPositions(wake, finalPositions);
    result.lastConvectionDiagnostics = {
      mode: 'free',
      integrator,
      coreRadius,
      maxInducedSpeed: diagnostics.maxInducedSpeed,
      skippedIncidentSegments: diagnostics.skippedIncidentSegments,
      filamentCount: diagnostics.filamentCount,
    };
    return result;
  }

  function insertShedWakeRow(lattice, wake, freestream, dt, mode, shedFraction, maxWakeRows) {
    if (!wake.previousTrailingStrengths) return { wake, shedStrengths: null };
    if (shedFraction <= 0 || shedFraction >= 1) {
      throw new RangeError('shedFraction must lie strictly between zero and one');
    }
    const result = cloneWakeState(wake);
    const rowId = result.nextRowId;
    result.nextRowId += 1;
    const offset = mode === 'flat'
      ? { x: shedFraction * freestream.x * dt, y: 0, z: 0 }
      : scale3(freestream, shedFraction * dt);
    const attachment = lattice.nodes[lattice.chordPanels];
    const newRow = {
      id: rowId,
      birthTime: wake.time + dt,
      points: attachment.map((current, j) => point(
        current.x + offset.x,
        current.y + offset.y,
        current.z + offset.z,
        `wake:${rowId}:${j}`,
      )),
    };
    const shedStrengths = wake.previousTrailingStrengths.slice();
    result.nodeRows.unshift(newRow);
    result.strengthRows.unshift(shedStrengths.slice());
    if (Number.isFinite(maxWakeRows) && result.nodeRows.length > maxWakeRows) {
      result.nodeRows.length = maxWakeRows;
      result.strengthRows.length = maxWakeRows;
    }
    return { wake: result, shedStrengths };
  }

  function pressureLoads(lattice, strengths, previousStrengths, freestream, dt, density = 1) {
    const previous = previousStrengths ?? new Array(strengths.length).fill(0);
    let circulatoryLift = 0;
    let accelerationLift = 0;
    for (const panel of lattice.panels) {
      const upstreamIndex = panel.chordIndex === 0
        ? -1
        : panel.index - lattice.spanPanels;
      const upstream = upstreamIndex < 0 ? 0 : strengths[upstreamIndex];
      const chordwiseJump = strengths[panel.index] - upstream;
      circulatoryLift += density * freestream.x * chordwiseJump * panel.spanWidth;
      accelerationLift += density
        * (strengths[panel.index] - previous[panel.index]) / dt
        * panel.area;
    }
    const dynamicPressure = 0.5 * density * magnitude3(freestream) ** 2;
    const lift = circulatoryLift + accelerationLift;
    return {
      circulatoryLift,
      accelerationLift,
      lift,
      CL: lift / (dynamicPressure * lattice.referenceArea),
    };
  }

  /**
   * Advance the Katz-Plotkin unsteady vortex-ring model by one step.
   * Existing wake geometry is convected first; a new known-strength row is
   * then shed from the previous trailing-edge solution; finally the current
   * bound no-penetration system is solved.
   */
  function stepUnsteadyVlm(options = {}) {
    const lattice = options.lattice ?? createRectangularWingLattice(options);
    const initialWake = options.wake ?? createWakeState(lattice);
    if (initialWake.spanPanels !== lattice.spanPanels) {
      throw new RangeError('wake and lattice spanwise dimensions do not match');
    }
    const dt = assertPositive('dt', options.dt ?? 0.1);
    const mode = options.mode ?? options.wakeMode ?? 'flat';
    if (mode !== 'flat' && mode !== 'free') {
      throw new RangeError("wake mode must be 'flat' or 'free'");
    }
    const { velocity: freestream, speed } = resolveFreestream(options);
    if (speed <= EPS) throw new RangeError('freestream speed must be positive');
    const priorStrengths = initialWake.boundStrengths
      ? initialWake.boundStrengths.slice()
      : null;
    let wake = convectWake({
      ...options,
      lattice,
      wake: initialWake,
      dt,
      mode,
      freestream,
      boundStrengths: priorStrengths,
    });
    const inserted = insertShedWakeRow(
      lattice,
      wake,
      freestream,
      dt,
      mode,
      options.shedFraction ?? 0.25,
      options.maxWakeRows ?? Infinity,
    );
    wake = inserted.wake;

    const influenceMatrix = buildBoundInfluenceMatrix(lattice);
    const wakeVelocities = lattice.panels.map((panel) => (
      wakeInducedVelocity(lattice, wake, panel.collocation, options.boundaryCoreRadius ?? 0)
    ));
    const rightHandSide = lattice.panels.map((panel, index) => (
      -dot3(add3(freestream, wakeVelocities[index]), panel.normal)
    ));
    const solved = solveLinearSystem(influenceMatrix, rightHandSide);
    const residual = matrixResidual(influenceMatrix, solved.solution, rightHandSide);
    const density = options.density ?? 1;
    const loads = circulationLoads(lattice, solved.solution, freestream, density);
    const unsteadyLoads = pressureLoads(
      lattice,
      solved.solution,
      priorStrengths,
      freestream,
      dt,
      density,
    );
    const trailingStrengths = lattice.trailingEdgePanelIndices.map(
      (index) => solved.solution[index],
    );
    const shedConsistencyResidual = inserted.shedStrengths
      ? maxAbs(inserted.shedStrengths.map(
        (strength, index) => strength - initialWake.previousTrailingStrengths[index],
      ))
      : 0;

    wake.boundStrengths = solved.solution.slice();
    wake.previousTrailingStrengths = trailingStrengths;
    wake.time = initialWake.time + dt;
    wake.step = initialWake.step + 1;
    const allRings = [
      ...boundRings(lattice, solved.solution),
      ...wakeRings(lattice, wake),
    ];
    const continuity = filamentClosureResidual(allRings);
    return {
      lattice,
      wake,
      mode,
      freestream,
      strengths: solved.solution,
      trailingStrengths,
      shedStrengths: inserted.shedStrengths,
      wakeVelocities,
      influenceMatrix,
      rightHandSide,
      residual,
      maxBoundaryResidual: maxAbs(residual),
      shedConsistencyResidual,
      filamentContinuityResidual: continuity.maxResidual,
      pivotSpread: solved.pivotSpread,
      loads,
      CL: loads.CL,
      unsteadyLoads,
    };
  }

  function roundTo(value, digits) {
    if (!Number.isFinite(value)) return value;
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
  }

  /** Stable, compact state suitable for regression fixtures and article data. */
  function wakeSnapshot(wake, digits = 12) {
    return {
      time: roundTo(wake.time, digits),
      step: wake.step,
      nodeRows: wake.nodeRows.map((row) => ({
        id: row.id,
        points: row.points.map((current) => [
          roundTo(current.x, digits),
          roundTo(current.y, digits),
          roundTo(current.z, digits),
        ]),
      })),
      strengthRows: wake.strengthRows.map((row) => (
        row.map((value) => roundTo(value, digits))
      )),
      previousTrailingStrengths: wake.previousTrailingStrengths
        ? wake.previousTrailingStrengths.map((value) => roundTo(value, digits))
        : null,
    };
  }

  function runWakeSimulation(options = {}) {
    const steps = assertPositiveInteger('steps', options.steps ?? 8);
    const lattice = options.lattice ?? createRectangularWingLattice(options);
    let wake = options.wake ?? createWakeState(lattice);
    const history = [];
    for (let index = 0; index < steps; index += 1) {
      const result = stepUnsteadyVlm({ ...options, lattice, wake });
      wake = result.wake;
      history.push({
        time: wake.time,
        CL: result.loads.CL,
        pressureCL: result.unsteadyLoads.CL,
        maxBoundaryResidual: result.maxBoundaryResidual,
        filamentContinuityResidual: result.filamentContinuityResidual,
      });
    }
    return { lattice, wake, history, snapshot: wakeSnapshot(wake) };
  }

  return {
    add3,
    assembleFilaments,
    boundRings,
    buildBoundInfluenceMatrix,
    buildSteadyInfluenceMatrix,
    circulationLoads,
    convectWake,
    createRectangularWingLattice,
    createWakeState,
    cross3,
    dot3,
    filamentClosureResidual,
    finiteVortexSegmentVelocity,
    inducedVelocityFromFilaments,
    liftingLineRectangularReference,
    magnitude3,
    matrixResidual,
    resolveFreestream,
    runWakeSimulation,
    solveLinearSystem,
    solveSteadyVlm,
    stepUnsteadyVlm,
    vortexRingVelocity,
    wakeRings,
    wakeSnapshot,
  };
}));
