'use client'

import { useState, useMemo, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import { SliderLabeled } from '@/components/ui/SliderLabeled'
import { NumberField } from '@/components/ui/NumberField'
import { Toggle } from '@/components/ui/Toggle'
import { RechartsLine } from '@/components/ui/RechartsLine'
import { StreamlinesCanvas } from '@/components/ui/StreamlinesCanvas'
import { 
  useDemoStore, 
  useNacaDigits,
  useChord,
  useNPanels,
  useVelocity,
  useDensity,
  useAngleOfAttack,
  useShowStreamlines 
} from '@/lib/store'
import { createAirfoilGeometry } from '@/lib/panels/geometry'
import { solvePanelMethod, validateSolution } from '@/lib/panels/solver'
import { generateStreamlineField } from '@/lib/panels/stream'
import { Play, RefreshCw, Eye, EyeOff, AlertCircle, CheckCircle, Info } from 'lucide-react'

export function PanelTab() {
  // Get individual values
  const nacaDigits = useNacaDigits()
  const chord = useChord()
  const nPanels = useNPanels()
  const velocity = useVelocity()
  const density = useDensity()
  const angleOfAttack = useAngleOfAttack()
  const showStreamlines = useShowStreamlines()
  
  // Memoize params objects
  const airfoilParams = useMemo(() => ({
    nacaDigits,
    chord,
    nPanels
  }), [nacaDigits, chord, nPanels])
  
  const flowParams = useMemo(() => ({
    velocity,
    density,
    angleOfAttack
  }), [velocity, density, angleOfAttack])
  
  const {
    setNacaDigits,
    setChord,
    setVelocity,
    setDensity,
    setAngleOfAttack,
    setNPanels,
    setShowStreamlines,
    resetPanelParams
  } = useDemoStore()
  
  const [isComputing, setIsComputing] = useState(false)
  const [solution, setSolution] = useState<any>(null)
  const [geometry, setGeometry] = useState<any>(null)
  const [streamlineField, setStreamlineField] = useState<any>(null)
  const [validationResults, setValidationResults] = useState<any>(null)
  
  // Create airfoil geometry
  const airfoilGeometry = useMemo(() => {
    try {
      return createAirfoilGeometry(
        {
          digits: airfoilParams.nacaDigits,
          nPoints: Math.max(100, airfoilParams.nPanels * 2),
          chord: airfoilParams.chord
        },
        {
          nPanels: airfoilParams.nPanels,
          epsilon: 1e-9,
          regularization: 1e-12,
          maxIterations: 1000,
          tolerance: 1e-10
        }
      )
    } catch (error) {
      console.error('Error creating airfoil geometry:', error)
      return null
    }
  }, [airfoilParams])
  
  // Solve panel method
  const handleSolve = useCallback(async () => {
    if (!airfoilGeometry) return
    
    setIsComputing(true)
    
    try {
      // Small delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const flowConditions = {
        velocity: flowParams.velocity,
        density: flowParams.density,
        angleOfAttack: flowParams.angleOfAttack * Math.PI / 180, // Convert to radians
      }
      
      const panelSolution = solvePanelMethod(
        airfoilGeometry,
        flowConditions,
        {
          nPanels: airfoilParams.nPanels,
          epsilon: 1e-9,
          regularization: 1e-12,
          maxIterations: 1000,
          tolerance: 1e-10
        }
      )
      
      const validation = validateSolution(panelSolution, airfoilGeometry, flowConditions)
      
      setSolution(panelSolution)
      setGeometry(airfoilGeometry)
      setValidationResults(validation)
      
      // Generate streamlines if requested
      if (showStreamlines) {
        const streamlines = generateStreamlineField(
          airfoilGeometry,
          panelSolution,
          flowConditions,
          {
            nStreamlines: 15,
            stepSize: 0.01,
            maxSteps: 1000,
            seedDistance: 1.5,
            yRange: 1.0
          }
        )
        setStreamlineField(streamlines)
      }
      
    } catch (error) {
      console.error('Error solving panel method:', error)
      setSolution(null)
      setValidationResults(null)
    } finally {
      setIsComputing(false)
    }
  }, [airfoilGeometry, flowParams, airfoilParams.nPanels, showStreamlines])
  
  // Generate streamlines separately
  const handleToggleStreamlines = useCallback(async () => {
    const newShowStreamlines = !showStreamlines
    setShowStreamlines(newShowStreamlines)
    
    if (newShowStreamlines && solution && geometry) {
      setIsComputing(true)
      try {
        const flowConditions = {
          velocity: flowParams.velocity,
          density: flowParams.density,
          angleOfAttack: flowParams.angleOfAttack * Math.PI / 180,
        }
        
        const streamlines = generateStreamlineField(
          geometry,
          solution,
          flowConditions,
          {
            nStreamlines: 15,
            stepSize: 0.01,
            maxSteps: 1000,
            seedDistance: 1.5,
            yRange: 1.0
          }
        )
        setStreamlineField(streamlines)
      } catch (error) {
        console.error('Error generating streamlines:', error)
      } finally {
        setIsComputing(false)
      }
    } else {
      setStreamlineField(null)
    }
  }, [showStreamlines, solution, geometry, flowParams, setShowStreamlines])
  
  // Prepare Cp data for plotting
  const cpData = useMemo(() => {
    if (!solution || !geometry) return []
    
    return geometry.panels.map((panel: any, index: number) => {
      const xc = (panel.x1 + panel.x2) / (2 * airfoilParams.chord) // Normalized x/c
      const isUpper = panel.controlPoint.y > 0
      return {
        x: xc,
        y: solution.cp[index],
        series: isUpper ? 'Upper surface' : 'Lower surface'
      }
    })
  }, [solution, geometry, airfoilParams.chord])
  
  // Thin airfoil theory comparison
  const thinAirfoilCL = useMemo(() => {
    return 2 * Math.PI * (flowParams.angleOfAttack * Math.PI / 180)
  }, [flowParams.angleOfAttack])
  
  return (
    <div className="space-y-8">
      {/* Controls */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card title="Airfoil Parameters">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                NACA Digits
              </label>
              <input
                type="text"
                value={airfoilParams.nacaDigits}
                onChange={(e) => setNacaDigits(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-center"
                placeholder="0012"
                maxLength={4}
              />
            </div>
            
            <NumberField
              label="Chord Length"
              value={airfoilParams.chord}
              min={0.1}
              max={5}
              step={0.1}
              unit="m"
              onChange={setChord}
              precision={1}
            />
            
            <SliderLabeled
              label="Number of Panels"
              value={airfoilParams.nPanels}
              min={60}
              max={240}
              step={10}
              onChange={setNPanels}
            />
          </div>
        </Card>
        
        <Card title="Flow Conditions">
          <div className="space-y-4">
            <SliderLabeled
              label="Velocity (U∞)"
              value={flowParams.velocity}
              min={5}
              max={100}
              step={1}
              unit=" m/s"
              onChange={setVelocity}
            />
            
            <SliderLabeled
              label="Angle of Attack"
              value={flowParams.angleOfAttack}
              min={-15}
              max={20}
              step={0.5}
              unit="°"
              onChange={setAngleOfAttack}
            />
            
            <SliderLabeled
              label="Density (ρ)"
              value={flowParams.density}
              min={0.5}
              max={2.0}
              step={0.05}
              unit=" kg/m³"
              onChange={setDensity}
            />
          </div>
        </Card>
        
        <Card title="Actions">
          <div className="space-y-4">
            <button
              onClick={handleSolve}
              disabled={isComputing || !airfoilGeometry}
              className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isComputing ? (
                <>
                  <RefreshCw className="animate-spin mr-2" size={16} />
                  Computing...
                </>
              ) : (
                <>
                  <Play className="mr-2" size={16} />
                  Generate & Solve
                </>
              )}
            </button>
            
            <Toggle
              label="Show Streamlines"
              checked={showStreamlines}
              onChange={handleToggleStreamlines}
              disabled={!solution}
              description="Trace flow streamlines around airfoil"
            />
            
            <button
              onClick={resetPanelParams}
              className="w-full px-4 py-2 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Reset Parameters
            </button>
          </div>
        </Card>
      </div>
      
      {/* Validation Results */}
      {validationResults && (
        <Card>
          <div className="flex items-start space-x-3">
            {validationResults.isValid ? (
              <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
            ) : (
              <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
            )}
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2">
                Solution {validationResults.isValid ? 'Valid' : 'Has Warnings'}
              </h3>
              {validationResults.warnings.length > 0 && (
                <ul className="text-sm text-gray-700 space-y-1">
                  {validationResults.warnings.map((warning: string, index: number) => (
                    <li key={index} className="flex items-start">
                      <span className="text-yellow-500 mr-2">•</span>
                      {warning}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      )}
      
      {/* Results */}
      {solution && (
        <div className="grid lg:grid-cols-2 gap-8">
          <Card title="Lift Results">
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 mb-2">
                  CL = {solution.clGamma.toFixed(3)}
                </div>
                <p className="text-sm text-gray-600">
                  Lift Coefficient (from Γ)
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Circulation (Γ)</p>
                  <p className="font-mono">{solution.gamma.toFixed(4)} m²/s</p>
                </div>
                <div>
                  <p className="text-gray-600">CL (pressure)</p>
                  <p className="font-mono">{solution.clPressure.toFixed(3)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Thin-airfoil CL</p>
                  <p className="font-mono">{thinAirfoilCL.toFixed(3)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Residual</p>
                  <p className="font-mono">{solution.residual.toExponential(2)}</p>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start">
                  <Info className="text-blue-600 mr-2 flex-shrink-0 mt-0.5" size={16} />
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold mb-1">Kutta Condition:</p>
                    <p>
                      "If circulation is 'wrong', the TE keeps shedding vortices. 
                      The selected Γ is the one that makes the TE quiet." (Katz & Plotkin)
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="text-xs text-gray-500 mt-4">
                <p>Thin-airfoil check: CL ≈ 2π α (rad) = {thinAirfoilCL.toFixed(3)}</p>
              </div>
            </div>
          </Card>
          
          <Card title="Pressure Coefficient">
            <RechartsLine
              data={cpData}
              xLabel="x/c"
              yLabel="Cp"
              height={250}
              referenceLines={[
                { value: 0, label: 'Cp = 0', stroke: '#666', strokeDasharray: '5 5' }
              ]}
            />
            <p className="text-xs text-gray-500 mt-2">
              Lower Cp means higher velocity and lower pressure
            </p>
          </Card>
        </div>
      )}
      
      {/* Geometry and Streamlines Visualization */}
      {geometry && (
        <Card title="Airfoil Geometry & Flow Visualization">
          <div className="space-y-4">
            {streamlineField && showStreamlines ? (
              <StreamlinesCanvas
                streamlineField={streamlineField}
                airfoilGeometry={geometry}
                width={800}
                height={400}
                showAirfoil={true}
              />
            ) : (
              <div className="relative">
                <svg
                  width={800}
                  height={300}
                  viewBox="-0.5 -0.3 2 0.6"
                  className="border border-gray-200 rounded-lg bg-gradient-to-b from-blue-50 to-white"
                >
                  {/* Airfoil */}
                  <path
                    d={`M ${geometry.points.map((p: any) => `${p.x} ${p.y}`).join(' L ')} Z`}
                    fill="#1f2937"
                    stroke="#1f2937"
                    strokeWidth="0.002"
                  />
                  
                  {/* Panel control points and normals */}
                  {geometry.panels.map((panel: any, index: number) => (
                    <g key={index}>
                      {/* Control point */}
                      <circle
                        cx={panel.controlPoint.x}
                        cy={panel.controlPoint.y}
                        r="0.003"
                        fill="#dc2626"
                      />
                      
                      {/* Normal vector */}
                      <line
                        x1={panel.controlPoint.x}
                        y1={panel.controlPoint.y}
                        x2={panel.controlPoint.x + panel.normal.x * 0.05}
                        y2={panel.controlPoint.y + panel.normal.y * 0.05}
                        stroke="#dc2626"
                        strokeWidth="0.001"
                        markerEnd="url(#normalArrow)"
                      />
                    </g>
                  ))}
                  
                  {/* Arrow marker */}
                  <defs>
                    <marker
                      id="normalArrow"
                      markerWidth="10"
                      markerHeight="7"
                      refX="9"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon
                        points="0 0, 10 3.5, 0 7"
                        fill="#dc2626"
                      />
                    </marker>
                  </defs>
                </svg>
                
                <div className="absolute top-2 right-2 bg-white bg-opacity-90 rounded-lg p-2 text-xs space-y-1">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-2 bg-gray-800 rounded-sm"></div>
                    <span>Airfoil</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-red-600 rounded-full"></div>
                    <span>Control points</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-0.5 bg-red-600"></div>
                    <span>Normals</span>
                  </div>
                </div>
              </div>
            )}
            
            <p className="text-sm text-gray-600">
              {showStreamlines && streamlineField
                ? "Streamlines show the flow pattern around the airfoil. Toggle off to see panel geometry."
                : "Red dots are panel control points where boundary conditions are enforced. Red arrows show outward normals."
              }
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
