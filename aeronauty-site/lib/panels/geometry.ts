/**
 * NACA airfoil generation and panelization for 2D panel methods
 * 
 * Formulas and implementation approach largely follow:
 * Katz, Joseph; Plotkin, Allen. "Low-Speed Aerodynamics: From Wing Theory to Panel Methods", 2nd ed., Cambridge University Press, 2001.
 * Moran, Jack. "An Introduction to Theoretical and Computational Aerodynamics", Dover, 1984.
 */

import { Point2D, Vector2D, Panel, AirfoilGeometry, NacaParameters, PanelMethodParameters } from './types'

/**
 * Generate NACA 4-digit airfoil coordinates
 * @param digits NACA 4-digit designation (e.g., "0012")
 * @param nPoints Number of points along the airfoil (cosine spacing)
 * @param chord Chord length
 * @returns Array of points forming closed loop in clockwise order: TE(upper) → LE → TE(lower) → back to start
 */
export function naca4(digits: string, nPoints: number, chord: number = 1.0): Point2D[] {
  if (!/^\d{4}$/.test(digits)) {
    throw new Error('NACA digits must be 4 digits')
  }
  
  const m = parseInt(digits[0]) / 100 // maximum camber
  const p = parseInt(digits[1]) / 10  // location of maximum camber
  const t = parseInt(digits.slice(2)) / 100 // maximum thickness
  
  // Cosine spacing for better leading edge resolution
  const halfPoints = Math.floor(nPoints / 2)
  const beta = Array.from({ length: halfPoints + 1 }, (_, i) => 
    Math.PI * i / halfPoints
  )
  const x = beta.map(b => chord * (1 - Math.cos(b)) / 2)
  
  const points: Point2D[] = []
  
  // Generate upper surface (from TE to LE)
  for (let i = 0; i < halfPoints; i++) {
    const xi = x[i]
    const xc = xi / chord // normalized coordinate
    
    // Thickness distribution (symmetric)
    const yt = (t * chord / 0.2) * (
      0.2969 * Math.sqrt(xc) -
      0.1260 * xc -
      0.3516 * xc * xc +
      0.2843 * xc * xc * xc -
      0.1015 * xc * xc * xc * xc
    )
    
    // Camber line
    let yc: number, dyc_dx: number
    if (m === 0) {
      // Symmetric airfoil
      yc = 0
      dyc_dx = 0
    } else {
      if (xc <= p) {
        yc = (m * chord) * (2 * p * xc - xc * xc) / (p * p)
        dyc_dx = (2 * m) * (p - xc) / (p * p)
      } else {
        yc = (m * chord) * ((1 - 2 * p) + 2 * p * xc - xc * xc) / ((1 - p) * (1 - p))
        dyc_dx = (2 * m) * (p - xc) / ((1 - p) * (1 - p))
      }
    }
    
    // Surface normal angle
    const theta = Math.atan(dyc_dx)
    
    // Upper surface point
    const xu = xi - yt * Math.sin(theta)
    const yu = yc + yt * Math.cos(theta)
    
    points.push({ x: xu, y: yu })
  }
  
  // Generate lower surface (from LE to TE) and close the loop
  for (let i = halfPoints; i >= 0; i--) {
    const xi = x[i]
    const xc = xi / chord
    
    // Thickness distribution
    const yt = (t * chord / 0.2) * (
      0.2969 * Math.sqrt(xc) -
      0.1260 * xc -
      0.3516 * xc * xc +
      0.2843 * xc * xc * xc -
      0.1015 * xc * xc * xc * xc
    )
    
    // Camber line
    let yc: number, dyc_dx: number
    if (m === 0) {
      yc = 0
      dyc_dx = 0
    } else {
      if (xc <= p) {
        yc = (m * chord) * (2 * p * xc - xc * xc) / (p * p)
        dyc_dx = (2 * m) * (p - xc) / (p * p)
      } else {
        yc = (m * chord) * ((1 - 2 * p) + 2 * p * xc - xc * xc) / ((1 - p) * (1 - p))
        dyc_dx = (2 * m) * (p - xc) / ((1 - p) * (1 - p))
      }
    }
    
    const theta = Math.atan(dyc_dx)
    
    // Lower surface point
    const xl = xi + yt * Math.sin(theta)
    const yl = yc - yt * Math.cos(theta)
    
    points.push({ x: xl, y: yl })
  }
  
  return points
}

/**
 * Create panels from airfoil points
 * @param points Closed loop of airfoil points (clockwise)
 * @param params Panel method parameters
 * @returns Panel array with control points, normals, and geometric properties
 */
export function panelize(points: Point2D[], params: PanelMethodParameters): Panel[] {
  const nPanels = Math.min(params.nPanels, points.length - 1)
  const panels: Panel[] = []
  
  // Estimate chord for epsilon calculation
  const xCoords = points.map(p => p.x)
  const chord = Math.max(...xCoords) - Math.min(...xCoords)
  const epsilon = params.epsilon * chord
  
  for (let i = 0; i < nPanels; i++) {
    const p1 = points[i]
    const p2 = points[(i + 1) % points.length]
    
    // Panel length and angle
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const length = Math.sqrt(dx * dx + dy * dy)
    const angle = Math.atan2(dy, dx) // β - panel angle from x-axis
    
    // Unit tangent vector (along panel direction)
    const tangent: Vector2D = {
      x: Math.cos(angle),
      y: Math.sin(angle)
    }
    
    // Outward unit normal (for clockwise contour)
    // n = [sin(β), -cos(β)]
    const normal: Vector2D = {
      x: Math.sin(angle),
      y: -Math.cos(angle)
    }
    
    // Control point at panel midpoint, nudged inward by epsilon
    const midX = (p1.x + p2.x) / 2
    const midY = (p1.y + p2.y) / 2
    const controlPoint: Point2D = {
      x: midX - epsilon * normal.x, // Move inward (opposite to outward normal)
      y: midY - epsilon * normal.y
    }
    
    panels.push({
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      length,
      angle,
      tangent,
      normal,
      controlPoint
    })
  }
  
  return panels
}

/**
 * Create complete airfoil geometry from NACA parameters
 * @param nacaParams NACA airfoil parameters
 * @param panelParams Panel method parameters
 * @returns Complete airfoil geometry with panels and TE indices
 */
export function createAirfoilGeometry(
  nacaParams: NacaParameters, 
  panelParams: PanelMethodParameters
): AirfoilGeometry {
  // Generate airfoil points
  const points = naca4(nacaParams.digits, nacaParams.nPoints, nacaParams.chord)
  
  // Create panels
  const panels = panelize(points, panelParams)
  
  // Identify trailing edge panel indices
  // For clockwise contour: first panel is upper TE, last panel is lower TE
  const teUpperIndex = 0
  const teLowerIndex = panels.length - 1
  
  return {
    points,
    panels,
    chord: nacaParams.chord,
    teUpperIndex,
    teLowerIndex
  }
}

/**
 * Transform point from global to panel-local coordinates
 * @param globalPoint Point in global coordinates
 * @param panel Panel defining local coordinate system
 * @returns Point in panel-local coordinates (X along panel, Y perpendicular)
 */
export function globalToLocal(globalPoint: Point2D, panel: Panel): Point2D {
  // Translate to panel start
  const dx = globalPoint.x - panel.x1
  const dy = globalPoint.y - panel.y1
  
  // Rotate to panel coordinates
  const cosB = panel.tangent.x
  const sinB = panel.tangent.y
  
  return {
    x: dx * cosB + dy * sinB,   // X along panel
    y: -dx * sinB + dy * cosB   // Y perpendicular to panel
  }
}

/**
 * Transform vector from panel-local to global coordinates
 * @param localVector Vector in panel-local coordinates
 * @param panel Panel defining local coordinate system
 * @returns Vector in global coordinates
 */
export function localToGlobal(localVector: Vector2D, panel: Panel): Vector2D {
  const cosB = panel.tangent.x
  const sinB = panel.tangent.y
  
  return {
    x: localVector.x * cosB - localVector.y * sinB,
    y: localVector.x * sinB + localVector.y * cosB
  }
}

/**
 * Calculate distance between two points
 */
export function distance(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Calculate dot product of two vectors
 */
export function dot(v1: Vector2D, v2: Vector2D): number {
  return v1.x * v2.x + v1.y * v2.y
}

/**
 * Calculate vector magnitude
 */
export function magnitude(v: Vector2D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y)
}

/**
 * Normalize vector to unit length
 */
export function normalize(v: Vector2D): Vector2D {
  const mag = magnitude(v)
  if (mag < 1e-12) {
    return { x: 0, y: 0 }
  }
  return { x: v.x / mag, y: v.y / mag }
}
