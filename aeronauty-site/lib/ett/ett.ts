/**
 * Equal Transit Time (ETT) myth model
 * 
 * This module implements the flawed "equal transit time" explanation of lift
 * to demonstrate why it's incorrect and educate about real aerodynamics.
 * 
 * Key teaching point: ETT predicts lift independent of angle of attack,
 * which contradicts reality and makes it physically nonsensical.
 */

import { z } from 'zod'

// ETT model parameters
export const EttParametersSchema = z.object({
  velocity: z.number().positive(), // U∞ (m/s)
  density: z.number().positive(),  // ρ (kg/m³)
  chord: z.number().positive(),    // c (m)
  pathDiffPercent: z.number().min(0).max(20), // Path difference as percentage (0-20%)
  angleOfAttack: z.number(), // α (degrees) - ETT ignores this!
})

export type EttParameters = z.infer<typeof EttParametersSchema>

// ETT results
export const EttResultsSchema = z.object({
  // Input parameters (for reference)
  parameters: EttParametersSchema,
  
  // ETT calculations
  topPathLength: z.number().positive(),    // Length of top path
  bottomPathLength: z.number().positive(), // Length of bottom path (≈ chord)
  topVelocity: z.number().positive(),      // Velocity on top surface
  bottomVelocity: z.number().positive(),   // Velocity on bottom surface (≈ U∞)
  
  // Pressure difference (from Bernoulli)
  pressureDifference: z.number(), // Δp = p_bottom - p_top (Pa)
  
  // Lift coefficient from ETT
  liftCoefficient: z.number(), // CL_ett = 1 - (1 + d)²
  
  // Physical inconsistencies
  warnings: z.array(z.string()),
})

export type EttResults = z.infer<typeof EttResultsSchema>

/**
 * Calculate lift using the flawed Equal Transit Time model
 * @param params ETT model parameters
 * @returns ETT results with warnings about physical inconsistencies
 */
export function calculateEttLift(params: EttParameters): EttResults {
  const warnings: string[] = []
  
  // ETT assumption: air packets must arrive simultaneously at trailing edge
  // This leads to different path lengths requiring different velocities
  
  // Bottom path length ≈ chord (straight line approximation)
  const bottomPathLength = params.chord
  
  // Top path length = chord * (1 + pathDiffPercent/100)
  const pathDiffFraction = params.pathDiffPercent / 100
  const topPathLength = params.chord * (1 + pathDiffFraction)
  
  // ETT velocity calculation (assuming equal transit time)
  // If both packets take the same time T to traverse their paths:
  // T = bottomPathLength / U∞ = topPathLength / U_top
  // Therefore: U_top = U∞ * (topPathLength / bottomPathLength)
  const bottomVelocity = params.velocity // U∞
  const topVelocity = params.velocity * (topPathLength / bottomPathLength)
  
  // Bernoulli equation: p + (1/2)ρV² = constant
  // Pressure difference: Δp = p_bottom - p_top = (1/2)ρ(U_top² - U_bottom²)
  const pressureDifference = 0.5 * params.density * (
    topVelocity * topVelocity - bottomVelocity * bottomVelocity
  )
  
  // ETT lift coefficient: CL = Δp / (0.5 ρ U∞²)
  const dynamicPressure = 0.5 * params.density * params.velocity * params.velocity
  const liftCoefficient = pressureDifference / dynamicPressure
  
  // Alternative formula: CL_ett = 1 - (1 + d)²
  // where d = pathDiffPercent/100
  const liftCoefficientFormula = 1 - Math.pow(1 + pathDiffFraction, 2)
  
  // Add warnings about physical inconsistencies
  warnings.push("ETT assumes air packets must arrive simultaneously - no physical basis")
  
  if (Math.abs(params.angleOfAttack) > 0.1) {
    warnings.push(`ETT predicts same lift at α=${params.angleOfAttack.toFixed(1)}° as at α=0° - contradicts reality`)
  }
  
  if (pathDiffFraction > 0.05) {
    warnings.push(`Large path difference (${params.pathDiffPercent.toFixed(1)}%) leads to unrealistic top surface velocities`)
  }
  
  if (topVelocity > params.velocity * 2) {
    warnings.push(`Top velocity (${topVelocity.toFixed(1)} m/s) is ${(topVelocity/params.velocity).toFixed(1)}x freestream - physically questionable`)
  }
  
  if (liftCoefficient < 0) {
    warnings.push("ETT predicts negative lift (downforce) - opposite to typical airfoil behavior")
  }
  
  // Verify formula consistency
  if (Math.abs(liftCoefficient - liftCoefficientFormula) > 1e-10) {
    warnings.push("Internal calculation inconsistency detected")
  }
  
  return {
    parameters: params,
    topPathLength,
    bottomPathLength,
    topVelocity,
    bottomVelocity,
    pressureDifference,
    liftCoefficient,
    warnings
  }
}

/**
 * Generate ETT lift coefficient vs path difference data for plotting
 * @param baseParams Base ETT parameters
 * @param pathDiffRange Range of path differences to evaluate
 * @returns Array of data points for plotting
 */
export function generateEttCurve(
  baseParams: EttParameters,
  pathDiffRange: { min: number; max: number; steps: number }
): Array<{ pathDiff: number; cl: number; topVelocity: number }> {
  const data: Array<{ pathDiff: number; cl: number; topVelocity: number }> = []
  
  const stepSize = (pathDiffRange.max - pathDiffRange.min) / (pathDiffRange.steps - 1)
  
  for (let i = 0; i < pathDiffRange.steps; i++) {
    const pathDiff = pathDiffRange.min + i * stepSize
    const params = { ...baseParams, pathDiffPercent: pathDiff }
    const results = calculateEttLift(params)
    
    data.push({
      pathDiff,
      cl: results.liftCoefficient,
      topVelocity: results.topVelocity
    })
  }
  
  return data
}

/**
 * Generate ETT vs angle of attack comparison to show AoA independence
 * @param baseParams Base ETT parameters
 * @param aoaRange Range of angles of attack (degrees)
 * @returns Data showing ETT independence from AoA
 */
export function generateEttVsAoa(
  baseParams: EttParameters,
  aoaRange: { min: number; max: number; steps: number }
): Array<{ aoa: number; clEtt: number; clThinAirfoil: number }> {
  const data: Array<{ aoa: number; clEtt: number; clThinAirfoil: number }> = []
  
  const stepSize = (aoaRange.max - aoaRange.min) / (aoaRange.steps - 1)
  
  for (let i = 0; i < aoaRange.steps; i++) {
    const aoaDeg = aoaRange.min + i * stepSize
    const aoaRad = aoaDeg * Math.PI / 180
    
    // ETT result (independent of AoA)
    const ettParams = { ...baseParams, angleOfAttack: aoaDeg }
    const ettResults = calculateEttLift(ettParams)
    
    // Thin airfoil theory for comparison: CL = 2π α
    const clThinAirfoil = 2 * Math.PI * aoaRad
    
    data.push({
      aoa: aoaDeg,
      clEtt: ettResults.liftCoefficient,
      clThinAirfoil
    })
  }
  
  return data
}

/**
 * Create preset configurations for common scenarios
 */
export const ETT_PRESETS = {
  // Commercial airliner cruise conditions
  boeing747: {
    velocity: 250, // m/s (typical cruise speed)
    density: 1.225, // kg/m³ (sea level)
    chord: 3.0, // m (approximate wing chord)
    pathDiffPercent: 0.5, // % (small difference)
    angleOfAttack: 2.0 // degrees (typical cruise AoA)
  },
  
  // General aviation
  cessna172: {
    velocity: 60, // m/s
    density: 1.225,
    chord: 1.5, // m
    pathDiffPercent: 1.0,
    angleOfAttack: 4.0
  },
  
  // Wind tunnel conditions
  windTunnel: {
    velocity: 50, // m/s
    density: 1.225,
    chord: 0.3, // m (model scale)
    pathDiffPercent: 2.0,
    angleOfAttack: 5.0
  },
  
  // Extreme case to show ETT problems
  extreme: {
    velocity: 100,
    density: 1.225,
    chord: 1.0,
    pathDiffPercent: 10.0, // Very large difference
    angleOfAttack: 15.0 // High AoA
  }
} as const

/**
 * Get educational explanation of why ETT is wrong
 * @param results ETT calculation results
 * @returns Educational text explaining the problems with ETT
 */
export function getEttCritique(results: EttResults): string {
  const { parameters, liftCoefficient, topVelocity } = results
  
  let critique = "The Equal Transit Time (ETT) theory has several fatal flaws:\n\n"
  
  critique += "1. **No Physical Basis**: There's no law of physics requiring air packets to arrive simultaneously at the trailing edge.\n\n"
  
  critique += "2. **Angle of Attack Independence**: ETT predicts the same lift regardless of angle of attack, "
  critique += `yet changing AoA from 0° to ${parameters.angleOfAttack.toFixed(1)}° should dramatically affect lift.\n\n`
  
  critique += "3. **Unrealistic Velocities**: ETT predicts top surface velocity of "
  critique += `${topVelocity.toFixed(1)} m/s (${(topVelocity/parameters.velocity).toFixed(1)}x freestream), `
  critique += "which may violate subsonic flow assumptions.\n\n"
  
  if (liftCoefficient < 0) {
    critique += "4. **Wrong Sign**: ETT predicts downforce instead of lift for this configuration.\n\n"
  }
  
  critique += "**Reality**: Lift comes from circulation around the airfoil (Kutta condition), "
  critique += "which depends strongly on angle of attack and airfoil shape. "
  critique += "The Kutta-Joukowski theorem and panel methods provide accurate predictions."
  
  return critique
}
