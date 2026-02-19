'use client'

import { useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { SliderLabeled } from '@/components/ui/SliderLabeled'
import { NumberField } from '@/components/ui/NumberField'
import { RechartsLine } from '@/components/ui/RechartsLine'
import { 
  useDemoStore, 
  useVelocity, 
  useDensity, 
  useChord, 
  usePathDiffPercent, 
  useAngleOfAttack 
} from '@/lib/store'
import { calculateEttLift, generateEttCurve, generateEttVsAoa, ETT_PRESETS } from '@/lib/ett/ett'
import { AlertTriangle, Plane } from 'lucide-react'

export function EttTab() {
  // Get individual values
  const velocity = useVelocity()
  const density = useDensity()
  const chord = useChord()
  const pathDiffPercent = usePathDiffPercent()
  const angleOfAttack = useAngleOfAttack()
  
  // Memoize the params object
  const ettParams = useMemo(() => ({
    velocity,
    density,
    chord,
    pathDiffPercent,
    angleOfAttack
  }), [velocity, density, chord, pathDiffPercent, angleOfAttack])
  
  const {
    setVelocity,
    setDensity,
    setChord,
    setPathDiffPercent,
    setAngleOfAttack,
    resetEttParams
  } = useDemoStore()
  
  // Calculate ETT results
  const ettResults = useMemo(() => {
    return calculateEttLift(ettParams)
  }, [ettParams])
  
  // Generate curve data for plotting
  const curveData = useMemo(() => {
    return generateEttCurve(ettParams, { min: 0, max: 10, steps: 50 })
      .map(point => ({ x: point.pathDiff, y: point.cl }))
  }, [ettParams])
  
  // Generate AoA comparison data
  const aoaComparisonData = useMemo(() => {
    const ettData = generateEttVsAoa(ettParams, { min: -10, max: 15, steps: 26 })
    return ettData.flatMap(point => [
      { x: point.aoa, y: point.clEtt, series: 'ETT (wrong)' },
      { x: point.aoa, y: point.clThinAirfoil, series: 'Thin-airfoil theory' }
    ])
  }, [ettParams])
  
  const handlePresetClick = (presetName: keyof typeof ETT_PRESETS) => {
    const preset = ETT_PRESETS[presetName]
    setVelocity(preset.velocity)
    setDensity(preset.density)
    setChord(preset.chord)
    setPathDiffPercent(preset.pathDiffPercent)
    setAngleOfAttack(preset.angleOfAttack)
  }
  
  const show747Toast = () => {
    // Simple alert for now - could be replaced with a toast library
    alert("ETT predicts no AoA dependence. Real airplanes do. Myth busted.")
  }
  
  return (
    <div className="space-y-8">
      {/* Controls */}
      <div className="grid lg:grid-cols-2 gap-8">
        <Card title="Flow Parameters">
          <div className="space-y-6">
            <SliderLabeled
              label="Velocity (U∞)"
              value={ettParams.velocity}
              min={10}
              max={300}
              step={5}
              unit=" m/s"
              onChange={setVelocity}
            />
            
            <SliderLabeled
              label="Density (ρ)"
              value={ettParams.density}
              min={0.5}
              max={2.0}
              step={0.05}
              unit=" kg/m³"
              onChange={setDensity}
            />
            
            <NumberField
              label="Chord Length"
              value={ettParams.chord}
              min={0.1}
              max={10}
              step={0.1}
              unit="m"
              onChange={setChord}
              precision={1}
            />
          </div>
        </Card>
        
        <Card title="ETT Parameters">
          <div className="space-y-6">
            <SliderLabeled
              label="Path Difference"
              value={ettParams.pathDiffPercent}
              min={0}
              max={10}
              step={0.1}
              unit="%"
              onChange={setPathDiffPercent}
            />
            
            <SliderLabeled
              label="Angle of Attack (ignored by ETT!)"
              value={ettParams.angleOfAttack}
              min={-15}
              max={20}
              step={0.5}
              unit="°"
              onChange={setAngleOfAttack}
              disabled={false}
              className="opacity-75"
            />
            
            <div className="flex items-center p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="text-yellow-600 mr-2 flex-shrink-0" size={16} />
              <p className="text-sm text-yellow-800">
                ETT predicts the same lift regardless of angle of attack!
              </p>
            </div>
          </div>
        </Card>
      </div>
      
      {/* Presets */}
      <Card title="Quick Presets">
        <div className="flex flex-wrap gap-3">
          {Object.entries(ETT_PRESETS).map(([name, preset]) => (
            <button
              key={name}
              onClick={() => handlePresetClick(name as keyof typeof ETT_PRESETS)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
            >
              {name === 'boeing747' ? (
                <div className="flex items-center">
                  <Plane size={16} className="mr-2" />
                  Boeing 747
                </div>
              ) : (
                name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1')
              )}
            </button>
          ))}
          <button
            onClick={() => {
              handlePresetClick('boeing747')
              show747Toast()
            }}
            className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition-colors"
          >
            747 + Myth Demo
          </button>
        </div>
      </Card>
      
      {/* Results */}
      <div className="grid lg:grid-cols-2 gap-8">
        <Card title="ETT Predictions">
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">
                CL = {ettResults.liftCoefficient.toFixed(3)}
              </div>
              <p className="text-sm text-gray-600">
                Lift Coefficient (ETT)
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Top Velocity</p>
                <p className="font-mono">{ettResults.topVelocity.toFixed(1)} m/s</p>
              </div>
              <div>
                <p className="text-gray-600">Bottom Velocity</p>
                <p className="font-mono">{ettResults.bottomVelocity.toFixed(1)} m/s</p>
              </div>
              <div>
                <p className="text-gray-600">Top Path</p>
                <p className="font-mono">{ettResults.topPathLength.toFixed(2)} m</p>
              </div>
              <div>
                <p className="text-gray-600">Bottom Path</p>
                <p className="font-mono">{ettResults.bottomPathLength.toFixed(2)} m</p>
              </div>
            </div>
            
            {ettResults.warnings.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <h4 className="text-sm font-semibold text-red-800 mb-2">Physical Issues:</h4>
                <ul className="text-xs text-red-700 space-y-1">
                  {ettResults.warnings.slice(0, 3).map((warning, index) => (
                    <li key={index}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
        
        <Card title="CL vs Path Difference">
          <RechartsLine
            data={curveData}
            xLabel="Path Difference (%)"
            yLabel="Lift Coefficient"
            height={250}
            referenceLines={[
              { value: 0, label: 'CL = 0', stroke: '#666', strokeDasharray: '5 5' }
            ]}
          />
        </Card>
      </div>
      
      {/* AoA Comparison */}
      <Card title="ETT vs Reality: Angle of Attack Effect">
        <div className="mb-4">
          <p className="text-sm text-gray-600">
            This plot exposes the fatal flaw: ETT predicts constant lift regardless of angle of attack, 
            while thin-airfoil theory (and reality) shows strong AoA dependence.
          </p>
        </div>
        <RechartsLine
          data={aoaComparisonData}
          xLabel="Angle of Attack (degrees)"
          yLabel="Lift Coefficient"
          height={300}
          referenceLines={[
            { value: 0, label: 'CL = 0', stroke: '#666', strokeDasharray: '5 5' }
          ]}
        />
      </Card>
      
      {/* Educational Content */}
      <Card title="Why ETT is Wrong">
        <div className="prose prose-sm max-w-none">
          <p className="text-gray-700 mb-4">
            The Equal Transit Time theory makes several fundamental errors:
          </p>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-red-600 mb-2">Fatal Flaws</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• No physical law requires "equal transit time"</li>
                <li>• Ignores angle of attack completely</li>
                <li>• Often predicts wrong direction of lift</li>
                <li>• Leads to unrealistic surface velocities</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-blue-600 mb-2">Reality Check</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• Lift depends strongly on angle of attack</li>
                <li>• Circulation around airfoil is key</li>
                <li>• Kutta condition determines circulation</li>
                <li>• Panel methods give accurate predictions</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Next:</strong> Try the "Panel Solver" tab to see how real aerodynamics works 
              with proper circulation and angle-of-attack dependence!
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
