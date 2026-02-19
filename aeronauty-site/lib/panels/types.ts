import { z } from 'zod'

/**
 * Core types and schemas for 2D panel method implementation
 * Following Katz & Plotkin "Low-Speed Aerodynamics" 2nd ed.
 */

// Basic geometric types
export const Point2DSchema = z.object({
  x: z.number(),
  y: z.number(),
})

export const Vector2DSchema = z.object({
  x: z.number(),
  y: z.number(),
})

export type Point2D = z.infer<typeof Point2DSchema>
export type Vector2D = z.infer<typeof Vector2DSchema>

// Panel geometry
export const PanelSchema = z.object({
  // Panel endpoints
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  // Panel properties
  length: z.number().positive(),
  angle: z.number(), // β - panel angle from x-axis (radians)
  // Unit vectors
  tangent: Vector2DSchema, // unit tangent vector [cos(β), sin(β)]
  normal: Vector2DSchema,  // outward unit normal [sin(β), -cos(β)] for clockwise contour
  // Control point (midpoint nudged inward by ε)
  controlPoint: Point2DSchema,
})

export type Panel = z.infer<typeof PanelSchema>

// Airfoil geometry
export const AirfoilGeometrySchema = z.object({
  points: z.array(Point2DSchema).min(3), // Closed loop, clockwise
  panels: z.array(PanelSchema),
  chord: z.number().positive(),
  teUpperIndex: z.number().int().nonnegative(), // Index of upper TE panel
  teLowerIndex: z.number().int().nonnegative(), // Index of lower TE panel
})

export type AirfoilGeometry = z.infer<typeof AirfoilGeometrySchema>

// Flow conditions
export const FlowConditionsSchema = z.object({
  velocity: z.number().positive(), // U∞ (m/s)
  density: z.number().positive(),  // ρ (kg/m³)
  angleOfAttack: z.number(),       // α (radians)
  viscosity: z.number().positive().optional(), // μ (Pa⋅s) - not used in potential flow
})

export type FlowConditions = z.infer<typeof FlowConditionsSchema>

// Panel method solution
export const PanelSolutionSchema = z.object({
  // Source strengths per panel
  sigma: z.array(z.number()),
  // Total circulation (single value for all panels)
  gamma: z.number(),
  // Surface pressure coefficient at each control point
  cp: z.array(z.number()),
  // Surface tangential velocity at each control point
  vt: z.array(z.number()),
  // Lift coefficient (from circulation)
  clGamma: z.number(),
  // Lift coefficient (from pressure integration)
  clPressure: z.number(),
  // Convergence info
  residual: z.number(),
  iterations: z.number().int().nonnegative(),
})

export type PanelSolution = z.infer<typeof PanelSolutionSchema>

// Streamline data
export const StreamlineSchema = z.object({
  points: z.array(Point2DSchema),
  complete: z.boolean(), // true if streamline reached boundary, false if terminated early
})

export const StreamlineFieldSchema = z.object({
  streamlines: z.array(StreamlineSchema),
  bounds: z.object({
    xMin: z.number(),
    xMax: z.number(),
    yMin: z.number(),
    yMax: z.number(),
  }),
})

export type Streamline = z.infer<typeof StreamlineSchema>
export type StreamlineField = z.infer<typeof StreamlineFieldSchema>

// NACA airfoil parameters
export const NacaParametersSchema = z.object({
  digits: z.string().regex(/^\d{4}$/, "Must be 4 digits"), // e.g., "0012"
  nPoints: z.number().int().min(20).max(500).default(100),
  chord: z.number().positive().default(1.0),
})

export type NacaParameters = z.infer<typeof NacaParametersSchema>

// Panel method parameters
export const PanelMethodParametersSchema = z.object({
  nPanels: z.number().int().min(20).max(500).default(100),
  epsilon: z.number().positive().default(1e-9), // Control point offset factor
  regularization: z.number().positive().default(1e-12), // Tikhonov regularization
  maxIterations: z.number().int().positive().default(1000),
  tolerance: z.number().positive().default(1e-10),
})

export type PanelMethodParameters = z.infer<typeof PanelMethodParametersSchema>

// Chart data types for Recharts
export const ChartDataPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  series: z.string().optional(),
})

export type ChartDataPoint = z.infer<typeof ChartDataPointSchema>

// Reference lines for charts
export const ReferenceLineSchema = z.object({
  value: z.number(),
  label: z.string(),
  stroke: z.string().default('#888'),
  strokeDasharray: z.string().default('5 5'),
})

export type ReferenceLine = z.infer<typeof ReferenceLineSchema>

// UI state for demo
export const DemoStateSchema = z.object({
  activeTab: z.enum(['ett', 'panel', 'trefftz']).default('ett'),
  showStreamlines: z.boolean().default(false),
  nacaDigits: z.string().default('0012'),
  chord: z.number().positive().default(1.0),
  velocity: z.number().positive().default(10.0),
  density: z.number().positive().default(1.225),
  angleOfAttack: z.number().default(5.0), // degrees
  nPanels: z.number().int().min(60).max(240).default(120),
  // ETT parameters
  pathDiffPercent: z.number().min(0).max(20).default(1.0),
  // Trefftz parameters
  span: z.number().positive().default(10.0),
  area: z.number().positive().default(20.0),
})

export type DemoState = z.infer<typeof DemoStateSchema>

// Constants
export const PHYSICS_CONSTANTS = {
  // Standard atmosphere at sea level
  STD_DENSITY: 1.225, // kg/m³
  STD_PRESSURE: 101325, // Pa
  STD_TEMPERATURE: 288.15, // K
  // Mathematical
  TWO_PI: 2 * Math.PI,
  PI: Math.PI,
  // Numerical tolerances
  EPSILON: 1e-12,
  SINGULARITY_THRESHOLD: 1e-10,
} as const
