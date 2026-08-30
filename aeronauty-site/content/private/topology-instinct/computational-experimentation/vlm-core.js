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
    const wakeAttachOffset = options.wakeAttachOffset ?? null;
    if (wakeAttachOffset) validatePoint('wakeAttachOffset', wakeAttachOffset);
    const wakeAttachAtTrailingEdge = options.wakeAttachAtTrailingEdge === true
      || wakeAttachOffset !== null;
    const xRows = [];
    for (let i = 0; i <= chordPanels; i += 1) {
      xRows.push(
        wakeAttachAtTrailingEdge && i === chordPanels
          ? origin.x + chord + (wakeAttachOffset?.x ?? 0)
          : origin.x + (i + 0.25) * dx,
      );
    }
    const yEdges = spanSpacing === 'cosine'
      ? cosineSpanEdges(span, spanPanels, origin.y)
      : uniformSpanEdges(span, spanPanels, origin.y);

    const nodes = xRows.map((x, i) => yEdges.map((y, j) => (
      point(
        x,
        y + (i === chordPanels ? wakeAttachOffset?.y ?? 0 : 0),
        origin.z + (i === chordPanels ? wakeAttachOffset?.z ?? 0 : 0),
        `bound:${i}:${j}`,
      )
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
      wakeAttachAtTrailingEdge,
      wakeAttachOffset: wakeAttachOffset ? clonePoint(wakeAttachOffset) : null,
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
      previousBoundStrengths: null,
      pendingAttachmentRow: null,
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
      previousBoundStrengths: wake.previousBoundStrengths
        ? wake.previousBoundStrengths.slice()
        : null,
      pendingAttachmentRow: wake.pendingAttachmentRow
        ? {
          ...wake.pendingAttachmentRow,
          points: wake.pendingAttachmentRow.points.map(clonePoint),
        }
        : null,
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

  function translatePrescribedWake(wake, freestream, dt, includeNormalMotion) {
    const translated = cloneWakeState(wake);
    for (const row of translated.nodeRows) {
      for (const current of row.points) {
        current.x += freestream.x * dt;
        current.y += freestream.y * dt;
        if (includeNormalMotion) current.z += freestream.z * dt;
      }
    }
    translated.lastConvectionDiagnostics = {
      mode: includeNormalMotion ? 'te' : 'flat',
      maxInducedSpeed: 0,
      skippedIncidentSegments: 0,
      activeWakeRows: 0,
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

  function freeWakeNodeVelocities(
    lattice,
    wake,
    boundStrengths,
    freestream,
    coreRadius,
    inductionScale,
    activeWakeRows,
  ) {
    const rings = [];
    if (boundStrengths) rings.push(...boundRings(lattice, boundStrengths));
    rings.push(...wakeRings(lattice, wake));
    const filaments = assembleFilaments(rings);
    const velocities = [];
    let skippedIncidentSegments = 0;
    let maxInducedSpeed = 0;
    for (let rowIndex = 0; rowIndex < wake.nodeRows.length; rowIndex += 1) {
      const row = wake.nodeRows[rowIndex];
      for (const current of row.points) {
        if (rowIndex >= activeWakeRows) {
          velocities.push(clonePoint(freestream));
          continue;
        }
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
    if (mode !== 'flat' && mode !== 'te' && mode !== 'free') {
      throw new RangeError("wake mode must be 'flat', 'te' or 'free'");
    }
    const { velocity: freestream } = resolveFreestream(options);
    if (mode === 'flat') {
      return translatePrescribedWake(wake, freestream, dt, false);
    }
    if (mode === 'te') {
      return translatePrescribedWake(wake, freestream, dt, true);
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
        activeWakeRows: 0,
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
    const activeWakeRows = Math.max(
      1,
      Math.min(
        wake.nodeRows.length,
        options.activeWakeRows ?? wake.nodeRows.length,
      ),
    );
    const first = freeWakeNodeVelocities(
      lattice,
      wake,
      boundStrengths,
      freestream,
      coreRadius,
      inductionScale,
      activeWakeRows,
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
        activeWakeRows,
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
      activeWakeRows,
    };
    return result;
  }

  function insertShedWakeRow(
    lattice,
    wake,
    freestream,
    dt,
    mode,
    shedFraction,
    maxWakeRows,
    shedOffset,
  ) {
    if (!wake.previousTrailingStrengths) return { wake, shedStrengths: null };
    if (shedFraction <= 0 || shedFraction >= 1) {
      throw new RangeError('shedFraction must lie strictly between zero and one');
    }
    const result = cloneWakeState(wake);
    const rowId = result.nextRowId;
    result.nextRowId += 1;
    const offset = shedOffset ?? (mode === 'flat'
      ? { x: shedFraction * freestream.x * dt, y: 0, z: 0 }
      : scale3(freestream, shedFraction * dt));
    validatePoint('shedOffset', offset);
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

  function promotePendingAttachmentRow(wake) {
    if (!wake.pendingAttachmentRow || !wake.previousTrailingStrengths) {
      return { wake, shedStrengths: null };
    }
    const result = cloneWakeState(wake);
    const shedStrengths = result.previousTrailingStrengths.slice();
    result.nodeRows.unshift(result.pendingAttachmentRow);
    result.strengthRows.unshift(shedStrengths.slice());
    result.pendingAttachmentRow = null;
    return { wake: result, shedStrengths };
  }

  function pressureLoads(
    lattice,
    strengths,
    previousStrengths,
    previousPreviousStrengths,
    freestream,
    dt,
    density = 1,
    wakeVelocities = null,
    referenceSpeed = null,
  ) {
    const previous = previousStrengths ?? new Array(strengths.length).fill(0);
    const previousPrevious = previousPreviousStrengths ?? null;
    let circulatoryLift = 0;
    let accelerationLift = 0;
    for (const panel of lattice.panels) {
      const upstreamIndex = panel.chordIndex === 0
        ? -1
        : panel.index - lattice.spanPanels;
      const upstream = upstreamIndex < 0 ? 0 : strengths[upstreamIndex];
      const chordwiseJump = strengths[panel.index] - upstream;
      const portIndex = panel.spanIndex === 0 ? -1 : panel.index - 1;
      const portStrength = portIndex < 0 ? 0 : strengths[portIndex];
      const spanwiseJump = strengths[panel.index] - portStrength;
      const wakeVelocity = wakeVelocities?.[panel.index] ?? zeroVelocity();
      const chordwiseSpeed = freestream.x + wakeVelocity.x;
      const spanwiseSpeed = freestream.y + wakeVelocity.y;
      circulatoryLift += density * (
        chordwiseSpeed * chordwiseJump * panel.spanWidth
        + spanwiseSpeed * spanwiseJump * panel.chordWidth
      );
      const strengthDerivative = previousPrevious
        ? (
          3 * strengths[panel.index]
          - 4 * previous[panel.index]
          + previousPrevious[panel.index]
        ) / (2 * dt)
        : (strengths[panel.index] - previous[panel.index]) / dt;
      accelerationLift += density
        * strengthDerivative
        * panel.area;
    }
    const normalizingSpeed = referenceSpeed ?? magnitude3(freestream);
    const dynamicPressure = 0.5 * density * normalizingSpeed ** 2;
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
   * In dynamic-attachment mode, the prior unknown trailing closure is first
   * promoted to a known wake row, convected, and connected to the current
   * closure supplied by the lattice. The current bound system is then solved
   * and its closure is retained for the next step. The legacy static-attach
   * path remains available for the original fixed-incidence regression.
   */
  function stepUnsteadyVlm(options = {}) {
    const lattice = options.lattice ?? createRectangularWingLattice(options);
    const initialWake = options.wake ?? createWakeState(lattice);
    if (initialWake.spanPanels !== lattice.spanPanels) {
      throw new RangeError('wake and lattice spanwise dimensions do not match');
    }
    const dt = assertPositive('dt', options.dt ?? 0.1);
    const mode = options.mode ?? options.wakeMode ?? 'flat';
    if (mode !== 'flat' && mode !== 'te' && mode !== 'free') {
      throw new RangeError("wake mode must be 'flat', 'te' or 'free'");
    }
    const { velocity: freestream, speed } = resolveFreestream(options);
    const wakeFreestream = options.wakeFreestream
      ? resolveFreestream({ freestream: options.wakeFreestream }).velocity
      : freestream;
    if (speed <= EPS) throw new RangeError('freestream speed must be positive');
    const priorStrengths = initialWake.boundStrengths
      ? initialWake.boundStrengths.slice()
      : null;
    const priorPriorStrengths = initialWake.previousBoundStrengths
      ? initialWake.previousBoundStrengths.slice()
      : null;
    const dynamicWakeAttachment = options.dynamicWakeAttachment === true;
    const promoted = dynamicWakeAttachment
      ? promotePendingAttachmentRow(initialWake)
      : { wake: initialWake, shedStrengths: null };
    let wake = convectWake({
      ...options,
      lattice,
      wake: promoted.wake,
      dt,
      mode,
      freestream: wakeFreestream,
      boundStrengths: priorStrengths,
    });
    const inserted = dynamicWakeAttachment
      ? promoted
      : insertShedWakeRow(
        lattice,
        wake,
        freestream,
        dt,
        mode,
        options.shedFraction ?? 0.25,
        options.maxWakeRows ?? Infinity,
        options.shedOffset,
      );
    if (!dynamicWakeAttachment) wake = inserted.wake;

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
      priorPriorStrengths,
      freestream,
      dt,
      density,
      wakeVelocities,
      options.referenceSpeed,
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
    wake.previousBoundStrengths = priorStrengths;
    wake.previousTrailingStrengths = trailingStrengths;
    if (dynamicWakeAttachment) {
      const pendingId = initialWake.nextRowId;
      wake.nextRowId = pendingId + 1;
      wake.pendingAttachmentRow = {
        id: pendingId,
        birthTime: initialWake.time + dt,
        points: lattice.nodes[lattice.chordPanels].map((current, index) => point(
          current.x,
          current.y,
          current.z,
          `wake:${pendingId}:${index}`,
        )),
      };
    }
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
      pendingAttachmentRow: wake.pendingAttachmentRow
        ? {
          id: wake.pendingAttachmentRow.id,
          points: wake.pendingAttachmentRow.points.map((current) => [
            roundTo(current.x, digits),
            roundTo(current.y, digits),
            roundTo(current.z, digits),
          ]),
        }
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

  function harmonicHeave(time, options = {}) {
    const amplitude = options.amplitude ?? 0.03;
    const omega = assertPositive('omega', options.omega ?? 1);
    const phase = options.phase ?? 0;
    assertFinite('amplitude', amplitude);
    assertFinite('phase', phase);
    const angle = omega * time + phase;
    const h = amplitude * Math.sin(angle);
    const hDot = amplitude * omega * Math.cos(angle);
    return {
      time,
      phase: angle,
      h,
      hDot,
      hDDot: -amplitude * omega ** 2 * Math.sin(angle),
      normalVelocity: -hDot,
    };
  }

  function fitHarmonicResponse(samples, omega, valueKey = 'value') {
    assertPositive('omega', omega);
    if (!Array.isArray(samples) || samples.length < 4) {
      throw new RangeError('at least four harmonic samples are required');
    }
    const matrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const rightHandSide = [0, 0, 0];
    for (const sample of samples) {
      const time = assertFinite('sample time', sample.time);
      const value = assertFinite('sample value', sample[valueKey]);
      const row = [Math.cos(omega * time), Math.sin(omega * time), 1];
      for (let i = 0; i < 3; i += 1) {
        rightHandSide[i] += row[i] * value;
        for (let j = 0; j < 3; j += 1) matrix[i][j] += row[i] * row[j];
      }
    }
    const [cosine, sine, offset] = solveLinearSystem(matrix, rightHandSide).solution;
    const real = cosine;
    const imag = -sine;
    let residualSquared = 0;
    for (const sample of samples) {
      const fitted = cosine * Math.cos(omega * sample.time)
        + sine * Math.sin(omega * sample.time)
        + offset;
      residualSquared += (sample[valueKey] - fitted) ** 2;
    }
    const rmsResidual = Math.sqrt(residualSquared / samples.length);
    const magnitude = Math.hypot(real, imag);
    return {
      real,
      imag,
      magnitude,
      phaseRadians: Math.atan2(imag, real),
      phaseDegrees: Math.atan2(imag, real) * 180 / Math.PI,
      offset,
      rmsResidual,
      relativeRmsResidual: rmsResidual / Math.max(magnitude, EPS),
    };
  }

  function dividePhasors(numerator, denominator) {
    const denominatorSquared = denominator.real ** 2 + denominator.imag ** 2;
    if (denominatorSquared <= EPS ** 2) return null;
    const real = (
      numerator.real * denominator.real + numerator.imag * denominator.imag
    ) / denominatorSquared;
    const imag = (
      numerator.imag * denominator.real - numerator.real * denominator.imag
    ) / denominatorSquared;
    return {
      real,
      imag,
      magnitude: Math.hypot(real, imag),
      phaseRadians: Math.atan2(imag, real),
      phaseDegrees: Math.atan2(imag, real) * 180 / Math.PI,
    };
  }

  function harmonicTransfer(samples, omega, steadyLiftSlope, valueKey) {
    const input = fitHarmonicResponse(samples, omega, 'normalVelocityRatio');
    const output = fitHarmonicResponse(samples, omega, valueKey);
    const denominator = {
      real: steadyLiftSlope * input.real,
      imag: steadyLiftSlope * input.imag,
    };
    return {
      input,
      output,
      transfer: dividePhasors(output, denominator),
    };
  }

  function addPhasors(a, b) {
    return { real: a.real + b.real, imag: a.imag + b.imag };
  }

  function subtractPhasors(a, b) {
    return { real: a.real - b.real, imag: a.imag - b.imag };
  }

  function imaginaryDerivativePhasor(value, omega) {
    return { real: -omega * value.imag, imag: omega * value.real };
  }

  function phasorWithMetrics(value) {
    return {
      ...value,
      magnitude: Math.hypot(value.real, value.imag),
      phaseRadians: Math.atan2(value.imag, value.real),
      phaseDegrees: Math.atan2(value.imag, value.real) * 180 / Math.PI,
    };
  }

  function wrappedPhaseDifferenceDegrees(a, b) {
    let difference = a - b;
    while (difference > 180) difference -= 360;
    while (difference < -180) difference += 360;
    return difference;
  }

  function compactWakeSnapshot(wake, digits = 8) {
    const snapshot = wakeSnapshot(wake, digits);
    return {
      time: snapshot.time,
      step: snapshot.step,
      nodeRows: snapshot.nodeRows.map((row) => row.points),
      strengthRows: snapshot.strengthRows,
      previousTrailingStrengths: snapshot.previousTrailingStrengths,
      pendingAttachmentRow: snapshot.pendingAttachmentRow,
    };
  }

  /**
   * Pure-heave finite-wing UVLM trust case.
   *
   * The wing remains fixed in body axes. normalVelocity = -hDot supplies the
   * equivalent ambient normal flow, while the wake is either kept on the mean
   * plane (flat), retains the trailing-edge birth history (te), or rolls up
   * under freestream plus bound/wake induction (free). Every shed ring remains
   * in the state for the full run. Only the newest activeWakeRows are convected
   * by induced velocity in free mode; older rows still convect with the body-
   * frame freestream and continue to induce velocity on the wing and near wake.
   */
  function runHarmonicUvlm(options = {}) {
    const stage = options.stage ?? options.mode ?? 'flat';
    if (stage !== 'flat' && stage !== 'te' && stage !== 'free') {
      throw new RangeError("stage must be 'flat', 'te' or 'free'");
    }
    const chord = assertPositive('chord', options.chord ?? 1);
    const speed = assertPositive('speed', options.speed ?? 1);
    const aspectRatio = assertPositive('aspectRatio', options.aspectRatio ?? 8);
    const reducedFrequency = assertPositive('reducedFrequency', options.reducedFrequency ?? 0.35);
    const amplitude = options.amplitude ?? 0.03 * chord;
    assertFinite('amplitude', amplitude);
    if (amplitude < 0) throw new RangeError('amplitude cannot be negative');
    const phase = options.phase ?? 0;
    assertFinite('phase', phase);
    const spanPanels = assertPositiveInteger('spanPanels', options.spanPanels ?? 8);
    const chordPanels = assertPositiveInteger('chordPanels', options.chordPanels ?? 2);
    const stepsPerCycle = assertPositiveInteger('stepsPerCycle', options.stepsPerCycle ?? 32);
    const cycles = assertPositiveInteger('cycles', options.cycles ?? 5);
    const measureCycles = assertPositiveInteger('measureCycles', options.measureCycles ?? 2);
    if (measureCycles >= cycles) throw new RangeError('measureCycles must be smaller than cycles');
    const activeWakeRows = assertPositiveInteger(
      'activeWakeRows',
      options.activeWakeRows ?? Math.min(12, stepsPerCycle),
    );
    const snapshotCount = Math.max(0, Math.floor(options.snapshotCount ?? 12));
    const omega = 2 * reducedFrequency * speed / chord;
    const period = 2 * Math.PI / omega;
    const dt = period / stepsPerCycle;
    const shedFraction = options.shedFraction ?? 0.25;
    const coreRadius = options.coreRadius ?? 0.04 * chord;
    const density = options.density ?? 1;
    const latticeOptions = {
      chord,
      span: aspectRatio * chord,
      chordPanels,
      spanPanels,
      spanSpacing: options.spanSpacing ?? 'cosine',
    };
    const referenceLattice = createRectangularWingLattice({
      ...latticeOptions,
      wakeAttachAtTrailingEdge: true,
    });
    const harmonicReferenceLattice = createRectangularWingLattice({
      ...latticeOptions,
      wakeAttachOffset: {
        x: shedFraction * speed * dt,
        y: 0,
        z: 0,
      },
    });
    const referenceAlpha = 1e-4;
    const steadyReference = solveSteadyVlm({
      lattice: referenceLattice,
      alpha: referenceAlpha,
      speed,
      density,
      wakeLength: options.referenceWakeLength ?? 100 * referenceLattice.span,
    });
    const steadyLiftSlope = steadyReference.CL / referenceAlpha;
    const noWakeMatrix = buildBoundInfluenceMatrix(harmonicReferenceLattice);
    const unitNormalStrengths = solveLinearSystem(
      noWakeMatrix,
      harmonicReferenceLattice.panels.map((panel) => -speed * panel.normal.z),
    ).solution;
    const dynamicPressureAreaReference = 0.5 * density * speed ** 2
      * harmonicReferenceLattice.referenceArea;
    const addedMassPotentialGain = density * harmonicReferenceLattice.panels.reduce(
      (sum, panel) => sum + unitNormalStrengths[panel.index] * panel.area,
      0,
    ) / dynamicPressureAreaReference;
    let lattice = harmonicReferenceLattice;
    let wake = options.wake ?? createWakeState(harmonicReferenceLattice);
    const totalSteps = cycles * stepsPerCycle;
    const retainedStart = (cycles - measureCycles) * stepsPerCycle;
    const samples = [];
    const snapshots = [];
    const snapshotStride = snapshotCount > 0
      ? Math.max(1, Math.floor(stepsPerCycle / snapshotCount))
      : Infinity;
    let maximumBoundaryResidual = 0;
    let maximumSheddingResidual = 0;
    let maximumContinuityResidual = 0;
    let maximumInducedSpeed = 0;
    let maximumCirculationScale = EPS;
    let latest = null;

    for (let step = 1; step <= totalSteps; step += 1) {
      const time = step * dt;
      const previousTime = (step - 1) * dt;
      const motion = harmonicHeave(time, { amplitude, omega, phase });
      const previousMotion = harmonicHeave(previousTime, { amplitude, omega, phase });
      const averageNormalVelocity = (previousMotion.h - motion.h) / dt;
      const shedMotion = harmonicHeave(time - shedFraction * dt, {
        amplitude,
        omega,
        phase,
      });
      const shedOffset = {
        x: shedFraction * speed * dt,
        y: 0,
        z: stage === 'flat' ? 0 : shedMotion.h - motion.h,
      };
      lattice = createRectangularWingLattice({
        ...latticeOptions,
        wakeAttachOffset: shedOffset,
      });
      latest = stepUnsteadyVlm({
        lattice,
        wake,
        dt,
        mode: stage,
        freestream: { x: speed, y: 0, z: motion.normalVelocity },
        wakeFreestream: {
          x: speed,
          y: 0,
          z: stage === 'flat' ? 0 : averageNormalVelocity,
        },
        shedOffset,
        shedFraction,
        dynamicWakeAttachment: true,
        maxWakeRows: Infinity,
        activeWakeRows,
        coreRadius,
        integrator: options.integrator ?? 'heun',
        inductionScale: options.inductionScale ?? 1,
        referenceSpeed: speed,
        density,
      });
      wake = latest.wake;
      maximumBoundaryResidual = Math.max(
        maximumBoundaryResidual,
        latest.maxBoundaryResidual,
      );
      maximumSheddingResidual = Math.max(
        maximumSheddingResidual,
        latest.shedConsistencyResidual,
      );
      maximumContinuityResidual = Math.max(
        maximumContinuityResidual,
        latest.filamentContinuityResidual,
      );
      maximumInducedSpeed = Math.max(
        maximumInducedSpeed,
        wake.lastConvectionDiagnostics?.maxInducedSpeed ?? 0,
      );
      maximumCirculationScale = Math.max(
        maximumCirculationScale,
        ...latest.strengths.map((strength) => Math.abs(strength)),
      );

      const dynamicPressureArea = 0.5 * density * speed ** 2 * lattice.referenceArea;
      const totalCL = latest.unsteadyLoads.lift / dynamicPressureArea;
      const apparentMassCL = addedMassPotentialGain * (-motion.hDDot / speed);
      const sample = {
        time,
        phaseDegrees: ((motion.phase * 180 / Math.PI) % 360 + 360) % 360,
        h: motion.h,
        normalVelocityRatio: motion.normalVelocity / speed,
        circulatoryCL: latest.unsteadyLoads.circulatoryLift / dynamicPressureArea,
        accelerationCL: latest.unsteadyLoads.accelerationLift / dynamicPressureArea,
        totalCL,
        apparentMassCL,
        pressureCirculatoryCL: totalCL - apparentMassCL,
        potentialCoefficient: density * lattice.panels.reduce(
          (sum, panel) => sum + latest.strengths[panel.index] * panel.area,
          0,
        ) / dynamicPressureArea,
      };
      if (step > retainedStart) samples.push(sample);
      if (
        snapshotCount > 0
        && step > totalSteps - stepsPerCycle
        && ((step - (totalSteps - stepsPerCycle)) % snapshotStride === 0 || step === totalSteps)
      ) {
        snapshots.push({
          ...sample,
          wake: compactWakeSnapshot(wake),
          spanwiseCirculation: latest.loads.spanwiseCirculation.map((value) => roundTo(value, 10)),
        });
      }
    }

    const normalizedBoundaryResidual = maximumBoundaryResidual / Math.max(speed, EPS);
    const normalizedSheddingResidual = maximumSheddingResidual / maximumCirculationScale;
    const normalizedContinuityResidual = maximumContinuityResidual / maximumCirculationScale;
    const residualGate = {
      boundary: normalizedBoundaryResidual <= (options.boundaryResidualTolerance ?? 1e-10),
      shedding: normalizedSheddingResidual <= (options.sheddingResidualTolerance ?? 1e-12),
      continuity: normalizedContinuityResidual <= (options.continuityResidualTolerance ?? 1e-12),
    };
    residualGate.passed = residualGate.boundary
      && residualGate.shedding
      && residualGate.continuity;
    const latestCycle = samples.slice(-stepsPerCycle);
    const previousCycle = samples.slice(-2 * stepsPerCycle, -stepsPerCycle);
    const cycleResponse = (cycleSamples) => {
      const input = fitHarmonicResponse(cycleSamples, omega, 'normalVelocityRatio');
      const instantaneous = fitHarmonicResponse(cycleSamples, omega, 'circulatoryCL');
      const potential = fitHarmonicResponse(cycleSamples, omega, 'potentialCoefficient');
      const totalLift = phasorWithMetrics(addPhasors(
        instantaneous,
        imaginaryDerivativePhasor(potential, omega),
      ));
      const apparentMass = phasorWithMetrics(imaginaryDerivativePhasor({
        real: addedMassPotentialGain * input.real,
        imag: addedMassPotentialGain * input.imag,
      }, omega));
      const circulatoryLift = phasorWithMetrics(subtractPhasors(totalLift, apparentMass));
      const denominator = {
        real: steadyLiftSlope * input.real,
        imag: steadyLiftSlope * input.imag,
      };
      return {
        input,
        instantaneous,
        potential,
        totalLift,
        apparentMass,
        circulatoryLift,
        circulatoryTransfer: dividePhasors(circulatoryLift, denominator),
        totalTransfer: dividePhasors(totalLift, denominator),
      };
    };
    const latestResponse = cycleResponse(latestCycle);
    let periodicity = null;
    if (previousCycle.length === stepsPerCycle && latestResponse.circulatoryTransfer) {
      const previousResponse = cycleResponse(previousCycle);
      if (previousResponse.circulatoryTransfer) {
        periodicity = {
          magnitudeRelative: Math.abs(
            latestResponse.circulatoryTransfer.magnitude
            - previousResponse.circulatoryTransfer.magnitude,
          ) / Math.max(latestResponse.circulatoryTransfer.magnitude, EPS),
          phaseDegrees: Math.abs(wrappedPhaseDifferenceDegrees(
            latestResponse.circulatoryTransfer.phaseDegrees,
            previousResponse.circulatoryTransfer.phaseDegrees,
          )),
          fitRelativeRms: Math.max(
            latestResponse.instantaneous.relativeRmsResidual,
            latestResponse.potential.relativeRmsResidual,
          ),
          residualGate,
        };
        periodicity.converged = (
          periodicity.magnitudeRelative <= (options.periodicityMagnitudeTolerance ?? 0.03)
          && periodicity.phaseDegrees <= (options.periodicityPhaseTolerance ?? 2)
          && periodicity.fitRelativeRms <= (
            options.fitResidualTolerance ?? (stage === 'free' ? 0.05 : 0.02)
          )
          && residualGate.passed
        );
      }
    }

    return {
      type: 'harmonic-uvlm-result',
      stage,
      config: {
        chord,
        speed,
        aspectRatio,
        reducedFrequency,
        amplitude,
        phase,
        spanPanels,
        chordPanels,
        stepsPerCycle,
        cycles,
        measureCycles,
        activeWakeRows: stage === 'free' ? activeWakeRows : 0,
        coreRadius: stage === 'free' ? coreRadius : 0,
        shedFraction,
        dt,
        omega,
      },
      lattice,
      steadyReference,
      steadyLiftSlope,
      addedMassPotentialGain,
      response: {
        circulatory: latestResponse.circulatoryTransfer,
        total: latestResponse.totalTransfer,
        instantaneous: latestResponse.instantaneous,
        apparentMass: latestResponse.apparentMass,
        input: latestResponse.input,
      },
      periodicity,
      diagnostics: {
        maximumBoundaryResidual,
        maximumSheddingResidual,
        maximumContinuityResidual,
        normalizedBoundaryResidual,
        normalizedSheddingResidual,
        normalizedContinuityResidual,
        maximumCirculationScale,
        residualGate,
        maximumInducedSpeed,
        wakeRows: wake.nodeRows.length,
        wakeAge: wake.time,
        wakeLength: wake.nodeRows.length
          ? Math.max(...wake.nodeRows.at(-1).points.map((current) => current.x)) - lattice.trailingEdgeX
          : 0,
      },
      trace: latestCycle,
      snapshots,
      finalState: wake,
      latest,
    };
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
    runHarmonicUvlm,
    runWakeSimulation,
    solveLinearSystem,
    solveSteadyVlm,
    stepUnsteadyVlm,
    vortexRingVelocity,
    wakeRings,
    wakeSnapshot,
    harmonicHeave,
    fitHarmonicResponse,
  };
}));
