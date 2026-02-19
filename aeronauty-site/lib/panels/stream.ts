/**
 * Streamline tracing for 2D panel method solutions
 * 
 * Traces streamlines in the velocity field using RK2 integration
 * Formulas and implementation approach largely follow:
 * Katz, Joseph; Plotkin, Allen. "Low-Speed Aerodynamics: From Wing Theory to Panel Methods", 2nd ed., Cambridge University Press, 2001.
 */

import { Point2D, Vector2D, Panel, Streamline, StreamlineField, AirfoilGeometry, FlowConditions, PanelSolution } from './types'
import { totalVelocity } from './influence'
import { distance } from './geometry'

/**
 * Calculate velocity field at any point due to panel solution
 * @param point Field point
 * @param geometry Airfoil geometry
 * @param solution Panel method solution
 * @param flow Flow conditions
 * @returns Velocity vector at the point
 */
export function fieldVelocity(
  point: Point2D,
  geometry: AirfoilGeometry,
  solution: PanelSolution,
  flow: FlowConditions
): Vector2D {
  // Freestream velocity
  const uInf = flow.velocity * Math.cos(flow.angleOfAttack)
  const vInf = flow.velocity * Math.sin(flow.angleOfAttack)
  const freestream = { x: uInf, y: vInf }
  
  return totalVelocity(
    point,
    geometry.panels,
    solution.sigma,
    solution.gamma,
    freestream
  )
}

/**
 * Check if a point is inside the airfoil using ray casting algorithm
 * @param point Point to test
 * @param airfoilPoints Airfoil boundary points (closed loop)
 * @returns True if point is inside airfoil
 */
function isInsideAirfoil(point: Point2D, airfoilPoints: Point2D[]): boolean {
  let inside = false
  const n = airfoilPoints.length
  
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = airfoilPoints[i]
    const pj = airfoilPoints[j]
    
    if (((pi.y > point.y) !== (pj.y > point.y)) &&
        (point.x < (pj.x - pi.x) * (point.y - pi.y) / (pj.y - pi.y) + pi.x)) {
      inside = !inside
    }
  }
  
  return inside
}

/**
 * Trace a single streamline using RK2 integration
 * @param startPoint Starting point for streamline
 * @param geometry Airfoil geometry
 * @param solution Panel method solution
 * @param flow Flow conditions
 * @param params Streamline tracing parameters
 * @returns Traced streamline
 */
export function traceStreamline(
  startPoint: Point2D,
  geometry: AirfoilGeometry,
  solution: PanelSolution,
  flow: FlowConditions,
  params: {
    stepSize: number
    maxSteps: number
    bounds: { xMin: number; xMax: number; yMin: number; yMax: number }
    minVelocity: number
  }
): Streamline {
  const points: Point2D[] = [{ ...startPoint }]
  let currentPoint = { ...startPoint }
  let complete = false
  
  // Check if starting point is inside airfoil
  if (isInsideAirfoil(currentPoint, geometry.points)) {
    return { points, complete: false }
  }
  
  for (let step = 0; step < params.maxSteps; step++) {
    // Get velocity at current point
    const vel1 = fieldVelocity(currentPoint, geometry, solution, flow)
    const speed1 = Math.sqrt(vel1.x * vel1.x + vel1.y * vel1.y)
    
    // Check for stagnation point or very low velocity
    if (speed1 < params.minVelocity) {
      break
    }
    
    // RK2 integration step
    // First step: half step with current velocity
    const halfStep = params.stepSize / 2
    const midPoint: Point2D = {
      x: currentPoint.x + halfStep * vel1.x / speed1,
      y: currentPoint.y + halfStep * vel1.y / speed1
    }
    
    // Check bounds and airfoil intersection at midpoint
    if (midPoint.x < params.bounds.xMin || midPoint.x > params.bounds.xMax ||
        midPoint.y < params.bounds.yMin || midPoint.y > params.bounds.yMax) {
      complete = true
      break
    }
    
    if (isInsideAirfoil(midPoint, geometry.points)) {
      break
    }
    
    // Get velocity at midpoint
    const vel2 = fieldVelocity(midPoint, geometry, solution, flow)
    const speed2 = Math.sqrt(vel2.x * vel2.x + vel2.y * vel2.y)
    
    if (speed2 < params.minVelocity) {
      break
    }
    
    // Full step using midpoint velocity
    const nextPoint: Point2D = {
      x: currentPoint.x + params.stepSize * vel2.x / speed2,
      y: currentPoint.y + params.stepSize * vel2.y / speed2
    }
    
    // Check bounds and airfoil intersection
    if (nextPoint.x < params.bounds.xMin || nextPoint.x > params.bounds.xMax ||
        nextPoint.y < params.bounds.yMin || nextPoint.y > params.bounds.yMax) {
      complete = true
      break
    }
    
    if (isInsideAirfoil(nextPoint, geometry.points)) {
      break
    }
    
    // Add point to streamline
    points.push(nextPoint)
    currentPoint = nextPoint
  }
  
  return { points, complete }
}

/**
 * Generate a field of streamlines around the airfoil
 * @param geometry Airfoil geometry
 * @param solution Panel method solution
 * @param flow Flow conditions
 * @param params Streamline field parameters
 * @returns Complete streamline field
 */
export function generateStreamlineField(
  geometry: AirfoilGeometry,
  solution: PanelSolution,
  flow: FlowConditions,
  params: {
    nStreamlines: number
    stepSize: number
    maxSteps: number
    seedDistance: number // Distance upstream to place seed points
    yRange: number // Vertical range for seed points
  }
): StreamlineField {
  // Calculate bounds based on airfoil and flow
  const xCoords = geometry.points.map(p => p.x)
  const yCoords = geometry.points.map(p => p.y)
  const xMin = Math.min(...xCoords) - params.seedDistance
  const xMax = Math.max(...xCoords) + params.seedDistance
  const yMin = Math.min(...yCoords) - params.yRange
  const yMax = Math.max(...yCoords) + params.yRange
  
  const bounds = { xMin, xMax, yMin, yMax }
  
  // Generate seed points upstream of airfoil
  const seedX = xMin + params.seedDistance * 0.1 // 10% downstream from left boundary
  const streamlines: Streamline[] = []
  
  for (let i = 0; i < params.nStreamlines; i++) {
    const t = i / (params.nStreamlines - 1) // Parameter from 0 to 1
    const seedY = yMin + t * (yMax - yMin)
    
    const startPoint: Point2D = { x: seedX, y: seedY }
    
    // Skip if seed point is inside airfoil
    if (isInsideAirfoil(startPoint, geometry.points)) {
      continue
    }
    
    const streamline = traceStreamline(
      startPoint,
      geometry,
      solution,
      flow,
      {
        stepSize: params.stepSize,
        maxSteps: params.maxSteps,
        bounds,
        minVelocity: flow.velocity * 0.01 // 1% of freestream velocity
      }
    )
    
    // Only include streamlines with sufficient points
    if (streamline.points.length > 5) {
      streamlines.push(streamline)
    }
  }
  
  return { streamlines, bounds }
}

/**
 * Calculate streamline density for visualization
 * @param streamlineField Complete streamline field
 * @param gridResolution Number of grid points in each direction
 * @returns 2D array of streamline density values
 */
export function calculateStreamlineDensity(
  streamlineField: StreamlineField,
  gridResolution: number = 50
): number[][] {
  const { bounds } = streamlineField
  const dx = (bounds.xMax - bounds.xMin) / (gridResolution - 1)
  const dy = (bounds.yMax - bounds.yMin) / (gridResolution - 1)
  
  // Initialize density grid
  const density: number[][] = Array(gridResolution).fill(null).map(() => 
    Array(gridResolution).fill(0)
  )
  
  // Count streamline points in each grid cell
  for (const streamline of streamlineField.streamlines) {
    for (const point of streamline.points) {
      const i = Math.floor((point.x - bounds.xMin) / dx)
      const j = Math.floor((point.y - bounds.yMin) / dy)
      
      if (i >= 0 && i < gridResolution && j >= 0 && j < gridResolution) {
        density[j][i] += 1
      }
    }
  }
  
  // Normalize density
  const maxDensity = Math.max(...density.flat())
  if (maxDensity > 0) {
    for (let i = 0; i < gridResolution; i++) {
      for (let j = 0; j < gridResolution; j++) {
        density[i][j] /= maxDensity
      }
    }
  }
  
  return density
}

/**
 * Find stagnation points in the flow field
 * @param geometry Airfoil geometry
 * @param solution Panel method solution
 * @param flow Flow conditions
 * @param searchBounds Bounds for stagnation point search
 * @returns Array of stagnation points
 */
export function findStagnationPoints(
  geometry: AirfoilGeometry,
  solution: PanelSolution,
  flow: FlowConditions,
  searchBounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  tolerance: number = 1e-6
): Point2D[] {
  const stagnationPoints: Point2D[] = []
  const gridSize = 20
  
  const dx = (searchBounds.xMax - searchBounds.xMin) / gridSize
  const dy = (searchBounds.yMax - searchBounds.yMin) / gridSize
  
  // Search on a coarse grid first
  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const point: Point2D = {
        x: searchBounds.xMin + i * dx,
        y: searchBounds.yMin + j * dy
      }
      
      // Skip points inside airfoil
      if (isInsideAirfoil(point, geometry.points)) {
        continue
      }
      
      const vel = fieldVelocity(point, geometry, solution, flow)
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y)
      
      if (speed < tolerance) {
        stagnationPoints.push(point)
      }
    }
  }
  
  return stagnationPoints
}

/**
 * Calculate velocity magnitude field for visualization
 * @param geometry Airfoil geometry
 * @param solution Panel method solution
 * @param flow Flow conditions
 * @param bounds Field bounds
 * @param resolution Grid resolution
 * @returns 2D array of velocity magnitudes
 */
export function calculateVelocityField(
  geometry: AirfoilGeometry,
  solution: PanelSolution,
  flow: FlowConditions,
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  resolution: number = 50
): { x: number[]; y: number[]; velocityMagnitude: number[][] } {
  const x: number[] = []
  const y: number[] = []
  const velocityMagnitude: number[][] = []
  
  const dx = (bounds.xMax - bounds.xMin) / (resolution - 1)
  const dy = (bounds.yMax - bounds.yMin) / (resolution - 1)
  
  // Generate coordinate arrays
  for (let i = 0; i < resolution; i++) {
    x.push(bounds.xMin + i * dx)
    y.push(bounds.yMin + i * dy)
  }
  
  // Calculate velocity magnitude at each grid point
  for (let j = 0; j < resolution; j++) {
    const row: number[] = []
    for (let i = 0; i < resolution; i++) {
      const point: Point2D = { x: x[i], y: y[j] }
      
      if (isInsideAirfoil(point, geometry.points)) {
        row.push(0) // Zero velocity inside airfoil
      } else {
        const vel = fieldVelocity(point, geometry, solution, flow)
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y)
        row.push(speed)
      }
    }
    velocityMagnitude.push(row)
  }
  
  return { x, y, velocityMagnitude }
}
