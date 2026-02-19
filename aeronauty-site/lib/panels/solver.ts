/**
 * Panel method solver with Kutta condition enforcement
 * 
 * Formulas and implementation approach largely follow:
 * Katz, Joseph; Plotkin, Allen. "Low-Speed Aerodynamics: From Wing Theory to Panel Methods", 2nd ed., Cambridge University Press, 2001.
 * Katz & Plotkin Ch. 10–12 (source/vortex panels, Kutta enforcement, Cp from surface tangential velocity)
 */

import { Panel, AirfoilGeometry, FlowConditions, PanelSolution, PanelMethodParameters } from './types'
import { dot } from './geometry'
import { 
  buildSourceInfluenceMatrix, 
  buildVortexInfluenceVector, 
  buildKuttaCoefficients,
  sourceInfluenceTangent,
  vortexInfluenceTangent
} from './influence'

/**
 * Solve the panel method linear system with Kutta condition
 * @param geometry Airfoil geometry with panels
 * @param flow Flow conditions
 * @param params Panel method parameters
 * @returns Complete panel method solution
 */
export function solvePanelMethod(
  geometry: AirfoilGeometry,
  flow: FlowConditions,
  params: PanelMethodParameters
): PanelSolution {
  const panels = geometry.panels
  const n = panels.length
  
  // Freestream velocity components
  const uInf = flow.velocity * Math.cos(flow.angleOfAttack)
  const vInf = flow.velocity * Math.sin(flow.angleOfAttack)
  const freestream = { x: uInf, y: vInf }
  
  // Build influence coefficient matrix A[i,j] = n_i · u_src_j
  const A = buildSourceInfluenceMatrix(panels)
  
  // Build vortex influence vector b_Γ[i] = n_i · u_Γ
  const bGamma = buildVortexInfluenceVector(panels)
  
  // Build RHS vector for boundary condition: -U∞ · n_i
  const rhs: number[] = Array(n + 1).fill(0)
  for (let i = 0; i < n; i++) {
    rhs[i] = -(freestream.x * panels[i].normal.x + freestream.y * panels[i].normal.y)
  }
  
  // Extend matrix for Kutta condition
  // System becomes: [A  b_Γ] [σ] = [rhs_BC]
  //                 [A_K b_K] [Γ]   [rhs_K ]
  const extendedA: number[][] = Array(n + 1).fill(null).map(() => Array(n + 1).fill(0))
  
  // Copy source influence matrix
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      extendedA[i][j] = A[i][j]
    }
    // Add vortex influence column
    extendedA[i][n] = bGamma[i]
  }
  
  // Add Kutta condition row
  // Kutta condition: enforce finite TE velocity by matching tangential velocities
  // at upper/lower TE control points: Vt_u - Vt_l = 0
  const kuttaCoeffs = buildKuttaCoefficients(panels, geometry.teUpperIndex, geometry.teLowerIndex)
  
  for (let j = 0; j < n; j++) {
    extendedA[n][j] = kuttaCoeffs.sourceCoeffs[j]
  }
  extendedA[n][n] = kuttaCoeffs.vortexCoeff
  
  // Kutta condition RHS: -U∞(t_u·e∞ - t_l·e∞)
  const upperTangent = panels[geometry.teUpperIndex].tangent
  const lowerTangent = panels[geometry.teLowerIndex].tangent
  const freestreamUpperTangent = dot(freestream, upperTangent)
  const freestreamLowerTangent = dot(freestream, lowerTangent)
  rhs[n] = -(freestreamUpperTangent - freestreamLowerTangent)
  
  // Solve linear system with Tikhonov regularization
  const solution = solveLinearSystem(extendedA, rhs, params.regularization)
  
  // Extract source strengths and circulation
  const sigma = solution.slice(0, n)
  const gamma = solution[n]
  
  // Calculate surface tangential velocities and pressure coefficients
  const vt: number[] = Array(n).fill(0)
  const cp: number[] = Array(n).fill(0)
  
  for (let i = 0; i < n; i++) {
    const controlPoint = panels[i].controlPoint
    const tangent = panels[i].tangent
    
    // Freestream tangential component
    let vtLocal = dot(freestream, tangent)
    
    // Add source panel contributions
    for (let j = 0; j < n; j++) {
      vtLocal += sourceInfluenceTangent(controlPoint, panels[j], tangent, sigma[j])
    }
    
    // Add vortex contributions (circulation distributed equally)
    const gammaPerPanel = gamma / n
    for (let j = 0; j < n; j++) {
      vtLocal += vortexInfluenceTangent(controlPoint, panels[j], tangent, gammaPerPanel)
    }
    
    vt[i] = vtLocal
    
    // Pressure coefficient: Cp = 1 - (V/U∞)²
    // From Katz & Plotkin: Cp evaluation from surface tangential speed
    cp[i] = 1 - (vtLocal / flow.velocity) ** 2
  }
  
  // Calculate lift coefficients
  // CL from circulation (Kutta-Joukowski): CL = 2Γ/(U∞*c)
  // Check Katz & Plotkin note on normalization
  const clGamma = (2 * gamma) / (flow.velocity * geometry.chord)
  
  // CL from pressure integration as cross-check
  const clPressure = calculateLiftFromPressure(panels, cp, geometry.chord)
  
  // Calculate residual
  const residual = calculateResidual(extendedA, solution, rhs)
  
  return {
    sigma,
    gamma,
    cp,
    vt,
    clGamma,
    clPressure,
    residual,
    iterations: 1 // Direct solve, no iterations
  }
}

/**
 * Solve linear system Ax = b with optional Tikhonov regularization
 * @param A Coefficient matrix
 * @param b Right-hand side vector
 * @param regularization Regularization parameter (added to diagonal)
 * @returns Solution vector x
 */
function solveLinearSystem(A: number[][], b: number[], regularization: number = 1e-12): number[] {
  const n = A.length
  
  // Create augmented matrix [A|b]
  const augmented: number[][] = Array(n).fill(null).map((_, i) => 
    [...A[i], b[i]]
  )
  
  // Add regularization to diagonal to avoid ill-conditioning
  for (let i = 0; i < n; i++) {
    augmented[i][i] += regularization
  }
  
  // Gaussian elimination with partial pivoting
  for (let k = 0; k < n; k++) {
    // Find pivot
    let maxRow = k
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(augmented[i][k]) > Math.abs(augmented[maxRow][k])) {
        maxRow = i
      }
    }
    
    // Swap rows
    if (maxRow !== k) {
      [augmented[k], augmented[maxRow]] = [augmented[maxRow], augmented[k]]
    }
    
    // Check for singular matrix
    if (Math.abs(augmented[k][k]) < 1e-14) {
      throw new Error(`Singular matrix at row ${k}`)
    }
    
    // Eliminate column
    for (let i = k + 1; i < n; i++) {
      const factor = augmented[i][k] / augmented[k][k]
      for (let j = k; j <= n; j++) {
        augmented[i][j] -= factor * augmented[k][j]
      }
    }
  }
  
  // Back substitution
  const x: number[] = Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    x[i] = augmented[i][n]
    for (let j = i + 1; j < n; j++) {
      x[i] -= augmented[i][j] * x[j]
    }
    x[i] /= augmented[i][i]
  }
  
  return x
}

/**
 * Calculate lift coefficient from pressure integration
 * @param panels Array of panels
 * @param cp Pressure coefficients at each panel
 * @param chord Airfoil chord length
 * @returns Lift coefficient from pressure integration
 */
function calculateLiftFromPressure(panels: Panel[], cp: number[], chord: number): number {
  let cl = 0
  
  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i]
    const deltaP = -cp[i] // Pressure coefficient to pressure difference
    
    // Contribution to lift: ΔP * Δx * n_y / chord
    // where Δx is panel projection on x-axis
    const deltaX = panel.x2 - panel.x1
    cl += deltaP * deltaX * panel.normal.y / chord
  }
  
  return cl
}

/**
 * Calculate residual ||Ax - b||
 * @param A Coefficient matrix
 * @param x Solution vector
 * @param b Right-hand side vector
 * @returns L2 norm of residual
 */
function calculateResidual(A: number[][], x: number[], b: number[]): number {
  const n = A.length
  let residualSumSq = 0
  
  for (let i = 0; i < n; i++) {
    let axRow = 0
    for (let j = 0; j < x.length; j++) {
      axRow += A[i][j] * x[j]
    }
    const residualRow = axRow - b[i]
    residualSumSq += residualRow * residualRow
  }
  
  return Math.sqrt(residualSumSq)
}

/**
 * Validate panel method solution for physical consistency
 * @param solution Panel method solution
 * @param geometry Airfoil geometry
 * @param flow Flow conditions
 * @returns Validation results and warnings
 */
export function validateSolution(
  solution: PanelSolution, 
  geometry: AirfoilGeometry, 
  flow: FlowConditions
): { isValid: boolean; warnings: string[] } {
  const warnings: string[] = []
  let isValid = true
  
  // Check residual
  if (solution.residual > 1e-6) {
    warnings.push(`High residual: ${solution.residual.toExponential(2)}`)
    isValid = false
  }
  
  // Check for reasonable lift coefficient
  const alphaRad = flow.angleOfAttack
  const thinAirfoilCL = 2 * Math.PI * alphaRad
  const clDiff = Math.abs(solution.clGamma - thinAirfoilCL)
  
  if (Math.abs(alphaRad) > 0.01 && clDiff > Math.abs(thinAirfoilCL) * 0.5) {
    warnings.push(`CL deviates significantly from thin-airfoil theory: ${solution.clGamma.toFixed(3)} vs ${thinAirfoilCL.toFixed(3)}`)
  }
  
  // Check agreement between CL methods
  const clMethodDiff = Math.abs(solution.clGamma - solution.clPressure)
  if (clMethodDiff > 0.1) {
    warnings.push(`CL methods disagree: Γ=${solution.clGamma.toFixed(3)}, pressure=${solution.clPressure.toFixed(3)}`)
  }
  
  // Check for extreme pressure coefficients
  const maxCp = Math.max(...solution.cp)
  const minCp = Math.min(...solution.cp)
  if (maxCp > 2 || minCp < -10) {
    warnings.push(`Extreme Cp values: max=${maxCp.toFixed(2)}, min=${minCp.toFixed(2)}`)
  }
  
  return { isValid, warnings }
}
