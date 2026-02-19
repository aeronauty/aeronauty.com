/**
 * Hess-Smith influence kernels for 2D panel methods
 * 
 * Formulas and implementation approach largely follow:
 * Hess, John L.; Smith, A. M. O. (1967). "Calculation of non-lifting potential flow about arbitrary three-dimensional bodies." Journal of Ship Research.
 * Katz, Joseph; Plotkin, Allen. "Low-Speed Aerodynamics: From Wing Theory to Panel Methods", 2nd ed., Cambridge University Press, 2001.
 * Moran, Jack. "An Introduction to Theoretical and Computational Aerodynamics", Dover, 1984. (for 2-D kernels)
 */

import { Point2D, Vector2D, Panel } from './types'
import { globalToLocal, localToGlobal, dot } from './geometry'

const TWO_PI = 2 * Math.PI
const FOUR_PI = 4 * Math.PI
const SINGULARITY_THRESHOLD = 1e-10

/**
 * Calculate velocity influence of a constant-strength source panel at a field point
 * @param fieldPoint Point where velocity is calculated
 * @param panel Source panel
 * @param sourceStrength Source strength per unit length (σ)
 * @returns Velocity vector induced by the source panel
 */
export function sourceInfluence(
  fieldPoint: Point2D, 
  panel: Panel, 
  sourceStrength: number = 1.0
): Vector2D {
  // Transform field point to panel-local coordinates
  const local = globalToLocal(fieldPoint, panel)
  const X = local.x
  const Y = local.y
  
  // Panel extends from s=0 to s=L in local coordinates
  const L = panel.length
  const s1 = 0
  const s2 = L
  
  // Check for singularity (field point on panel line)
  if (Math.abs(Y) < SINGULARITY_THRESHOLD) {
    // Field point is on or very close to the panel
    if (X >= -SINGULARITY_THRESHOLD && X <= L + SINGULARITY_THRESHOLD) {
      // Point is on the panel - return zero influence (or handle specially)
      return { x: 0, y: 0 }
    }
  }
  
  // Distance squared from field point to panel endpoints
  const R1_sq = X * X + Y * Y
  const R2_sq = (X - L) * (X - L) + Y * Y
  
  // Avoid division by zero
  if (R1_sq < SINGULARITY_THRESHOLD * SINGULARITY_THRESHOLD || 
      R2_sq < SINGULARITY_THRESHOLD * SINGULARITY_THRESHOLD) {
    return { x: 0, y: 0 }
  }
  
  // Standard 2-D source panel formulas (Katz & Plotkin, Moran)
  // For unit source strength per length q=1:
  const u_local = (sourceStrength / TWO_PI) * (
    Math.atan2(s2 * Y, (X - s2) * (X - s2) + Y * Y) - 
    Math.atan2(s1 * Y, (X - s1) * (X - s1) + Y * Y)
  )
  
  const v_local = (sourceStrength / FOUR_PI) * Math.log(R2_sq / R1_sq)
  
  // Transform back to global coordinates
  return localToGlobal({ x: u_local, y: v_local }, panel)
}

/**
 * Calculate velocity influence of a unit-circulation vortex sheet on a panel
 * @param fieldPoint Point where velocity is calculated
 * @param panel Vortex panel
 * @param vortexStrength Vortex strength (Γ) - circulation per unit length
 * @returns Velocity vector induced by the vortex panel
 */
export function vortexInfluence(
  fieldPoint: Point2D, 
  panel: Panel, 
  vortexStrength: number = 1.0
): Vector2D {
  // Transform field point to panel-local coordinates
  const local = globalToLocal(fieldPoint, panel)
  const X = local.x
  const Y = local.y
  
  const L = panel.length
  const s1 = 0
  const s2 = L
  
  // Check for singularity
  if (Math.abs(Y) < SINGULARITY_THRESHOLD) {
    if (X >= -SINGULARITY_THRESHOLD && X <= L + SINGULARITY_THRESHOLD) {
      return { x: 0, y: 0 }
    }
  }
  
  // Distance squared from field point to panel endpoints
  const R1_sq = X * X + Y * Y
  const R2_sq = (X - L) * (X - L) + Y * Y
  
  if (R1_sq < SINGULARITY_THRESHOLD * SINGULARITY_THRESHOLD || 
      R2_sq < SINGULARITY_THRESHOLD * SINGULARITY_THRESHOLD) {
    return { x: 0, y: 0 }
  }
  
  // Standard 2-D vortex panel formulas (Katz & Plotkin)
  // For unit vortex strength per length:
  const u_local = -(vortexStrength / FOUR_PI) * Math.log(R2_sq / R1_sq)
  
  const v_local = (vortexStrength / TWO_PI) * (
    Math.atan2(s2 * Y, (X - s2) * (X - s2) + Y * Y) - 
    Math.atan2(s1 * Y, (X - s1) * (X - s1) + Y * Y)
  )
  
  // Transform back to global coordinates
  return localToGlobal({ x: u_local, y: v_local }, panel)
}

/**
 * Calculate normal component of source panel influence at a control point
 * @param controlPoint Control point where influence is calculated
 * @param sourcePanel Source panel
 * @param sourceStrength Source strength per unit length
 * @returns Normal component of velocity (u · n)
 */
export function sourceInfluenceNormal(
  controlPoint: Point2D,
  sourcePanel: Panel,
  controlNormal: Vector2D,
  sourceStrength: number = 1.0
): number {
  const velocity = sourceInfluence(controlPoint, sourcePanel, sourceStrength)
  return dot(velocity, controlNormal)
}

/**
 * Calculate tangential component of source panel influence at a control point
 * @param controlPoint Control point where influence is calculated
 * @param sourcePanel Source panel
 * @param controlTangent Tangent vector at control point
 * @param sourceStrength Source strength per unit length
 * @returns Tangential component of velocity (u · t)
 */
export function sourceInfluenceTangent(
  controlPoint: Point2D,
  sourcePanel: Panel,
  controlTangent: Vector2D,
  sourceStrength: number = 1.0
): number {
  const velocity = sourceInfluence(controlPoint, sourcePanel, sourceStrength)
  return dot(velocity, controlTangent)
}

/**
 * Calculate normal component of vortex panel influence at a control point
 * @param controlPoint Control point where influence is calculated
 * @param vortexPanel Vortex panel
 * @param controlNormal Normal vector at control point
 * @param vortexStrength Vortex strength
 * @returns Normal component of velocity (u · n)
 */
export function vortexInfluenceNormal(
  controlPoint: Point2D,
  vortexPanel: Panel,
  controlNormal: Vector2D,
  vortexStrength: number = 1.0
): number {
  const velocity = vortexInfluence(controlPoint, vortexPanel, vortexStrength)
  return dot(velocity, controlNormal)
}

/**
 * Calculate tangential component of vortex panel influence at a control point
 * @param controlPoint Control point where influence is calculated
 * @param vortexPanel Vortex panel
 * @param controlTangent Tangent vector at control point
 * @param vortexStrength Vortex strength
 * @returns Tangential component of velocity (u · t)
 */
export function vortexInfluenceTangent(
  controlPoint: Point2D,
  vortexPanel: Panel,
  controlTangent: Vector2D,
  vortexStrength: number = 1.0
): number {
  const velocity = vortexInfluence(controlPoint, vortexPanel, vortexStrength)
  return dot(velocity, controlTangent)
}

/**
 * Calculate total velocity at a field point due to all source panels and circulation
 * @param fieldPoint Point where velocity is calculated
 * @param panels Array of panels
 * @param sourceStrengths Array of source strengths (σ) for each panel
 * @param totalCirculation Total circulation (Γ) applied uniformly
 * @param freestream Freestream velocity vector
 * @returns Total velocity vector at field point
 */
export function totalVelocity(
  fieldPoint: Point2D,
  panels: Panel[],
  sourceStrengths: number[],
  totalCirculation: number,
  freestream: Vector2D
): Vector2D {
  let totalU = freestream.x
  let totalV = freestream.y
  
  // Add contributions from all source panels
  for (let i = 0; i < panels.length; i++) {
    const sourceVel = sourceInfluence(fieldPoint, panels[i], sourceStrengths[i])
    totalU += sourceVel.x
    totalV += sourceVel.y
  }
  
  // Add contribution from circulation (distributed equally over all panels)
  const circulationPerPanel = totalCirculation / panels.length
  for (let i = 0; i < panels.length; i++) {
    const vortexVel = vortexInfluence(fieldPoint, panels[i], circulationPerPanel)
    totalU += vortexVel.x
    totalV += vortexVel.y
  }
  
  return { x: totalU, y: totalV }
}

/**
 * Build influence coefficient matrix for source panels (A_ij = n_i · u_src_j)
 * @param panels Array of panels
 * @returns Matrix where A[i][j] is normal influence of panel j at control point i
 */
export function buildSourceInfluenceMatrix(panels: Panel[]): number[][] {
  const n = panels.length
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0))
  
  for (let i = 0; i < n; i++) {
    const controlPoint = panels[i].controlPoint
    const controlNormal = panels[i].normal
    
    for (let j = 0; j < n; j++) {
      matrix[i][j] = sourceInfluenceNormal(
        controlPoint, 
        panels[j], 
        controlNormal, 
        1.0
      )
    }
  }
  
  return matrix
}

/**
 * Build influence vector for unit circulation (b_i = n_i · u_Γ)
 * @param panels Array of panels
 * @returns Vector where b[i] is normal influence of unit circulation at control point i
 */
export function buildVortexInfluenceVector(panels: Panel[]): number[] {
  const n = panels.length
  const vector: number[] = Array(n).fill(0)
  
  // Unit circulation distributed equally over all panels
  const unitCirculationPerPanel = 1.0 / n
  
  for (let i = 0; i < n; i++) {
    const controlPoint = panels[i].controlPoint
    const controlNormal = panels[i].normal
    
    for (let j = 0; j < n; j++) {
      vector[i] += vortexInfluenceNormal(
        controlPoint, 
        panels[j], 
        controlNormal, 
        unitCirculationPerPanel
      )
    }
  }
  
  return vector
}

/**
 * Calculate tangential velocity coefficients for Kutta condition
 * @param panels Array of panels
 * @param teUpperIndex Index of upper trailing edge panel
 * @param teLowerIndex Index of lower trailing edge panel
 * @returns Object with source and vortex influence coefficients for Kutta condition
 */
export function buildKuttaCoefficients(
  panels: Panel[], 
  teUpperIndex: number, 
  teLowerIndex: number
): { sourceCoeffs: number[], vortexCoeff: number } {
  const n = panels.length
  const sourceCoeffs: number[] = Array(n).fill(0)
  
  const upperControlPoint = panels[teUpperIndex].controlPoint
  const upperTangent = panels[teUpperIndex].tangent
  const lowerControlPoint = panels[teLowerIndex].controlPoint
  const lowerTangent = panels[teLowerIndex].tangent
  
  // Source panel contributions to Kutta condition: (t_u · u_src_j@u - t_l · u_src_j@l)
  for (let j = 0; j < n; j++) {
    const upperInfluence = sourceInfluenceTangent(
      upperControlPoint, 
      panels[j], 
      upperTangent, 
      1.0
    )
    const lowerInfluence = sourceInfluenceTangent(
      lowerControlPoint, 
      panels[j], 
      lowerTangent, 
      1.0
    )
    sourceCoeffs[j] = upperInfluence - lowerInfluence
  }
  
  // Vortex contribution to Kutta condition
  const unitCirculationPerPanel = 1.0 / n
  let vortexCoeff = 0
  
  for (let j = 0; j < n; j++) {
    const upperInfluence = vortexInfluenceTangent(
      upperControlPoint, 
      panels[j], 
      upperTangent, 
      unitCirculationPerPanel
    )
    const lowerInfluence = vortexInfluenceTangent(
      lowerControlPoint, 
      panels[j], 
      lowerTangent, 
      unitCirculationPerPanel
    )
    vortexCoeff += upperInfluence - lowerInfluence
  }
  
  return { sourceCoeffs, vortexCoeff }
}
