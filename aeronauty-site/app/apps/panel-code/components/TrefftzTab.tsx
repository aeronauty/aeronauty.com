'use client'

import { useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { SliderLabeled } from '@/components/ui/SliderLabeled'
import { NumberField } from '@/components/ui/NumberField'
import { 
  useDemoStore, 
  useSpan,
  useArea,
  useVelocity,
  useDensity
} from '@/lib/store'
import { TrendingDown, Wind, Plane } from 'lucide-react'

export function TrefftzTab() {
  // Get individual values
  const span = useSpan()
  const area = useArea()
  const velocity = useVelocity()
  const density = useDensity()
  
  // Memoize params object
  const trefftzParams = useMemo(() => ({
    span,
    area,
    velocity,
    density
  }), [span, area, velocity, density])
  const {
    setSpan,
    setArea,
    setVelocity,
    setDensity,
    resetTrefftzParams
  } = useDemoStore()
  
  // Get CL from panel solver if available (mock for now)
  const mockCL = 0.8 // This would come from the panel solver results
  
  // Calculate aerodynamic parameters
  const calculations = useMemo(() => {
    const { span, area, velocity, density } = trefftzParams
    
    // Aspect ratio
    const aspectRatio = (span * span) / area
    
    // Induced downwash (simplified)
    const inducedDownwash = (mockCL * velocity) / (Math.PI * aspectRatio)
    
    // Induced drag coefficient
    const inducedDragCoeff = (mockCL * mockCL) / (Math.PI * aspectRatio)
    
    // Lift per unit span (simplified)
    const liftPerSpan = (0.5 * density * velocity * velocity * mockCL * area) / span
    
    // Downwash velocity distribution (simplified elliptical)
    const downwashDistribution = Array.from({ length: 21 }, (_, i) => {
      const y = (i - 10) / 10 // -1 to 1
      const spanPosition = y * span / 2
      const ellipticalFactor = Math.sqrt(1 - y * y)
      const localDownwash = inducedDownwash * ellipticalFactor
      
      return {
        position: spanPosition,
        downwash: localDownwash,
        normalized: ellipticalFactor
      }
    })
    
    return {
      aspectRatio,
      inducedDownwash,
      inducedDragCoeff,
      liftPerSpan,
      downwashDistribution
    }
  }, [trefftzParams, mockCL])
  
  // Generate SVG for downwash visualization
  const downwashSVG = useMemo(() => {
    const { downwashDistribution } = calculations
    const maxDownwash = Math.max(...downwashDistribution.map(d => Math.abs(d.downwash)))
    
    return (
      <svg
        width={600}
        height={200}
        viewBox="-300 -50 600 150"
        className="border border-gray-200 rounded-lg bg-gradient-to-b from-blue-50 to-white"
      >
        {/* Wing representation */}
        <line
          x1={-trefftzParams.span * 10}
          y1="0"
          x2={trefftzParams.span * 10}
          y2="0"
          stroke="#1f2937"
          strokeWidth="4"
        />
        
        {/* Wing tips */}
        <circle cx={-trefftzParams.span * 10} cy="0" r="3" fill="#1f2937" />
        <circle cx={trefftzParams.span * 10} cy="0" r="3" fill="#1f2937" />
        
        {/* Downwash arrows */}
        {downwashDistribution.map((point, index) => {
          const x = point.position * 20 // Scale for visualization
          const arrowLength = (point.downwash / maxDownwash) * 40
          
          if (Math.abs(arrowLength) < 2) return null
          
          return (
            <g key={index}>
              {/* Arrow shaft */}
              <line
                x1={x}
                y1="5"
                x2={x}
                y2={5 + arrowLength}
                stroke="#dc2626"
                strokeWidth="2"
                markerEnd="url(#downwashArrow)"
              />
              
              {/* Velocity magnitude label */}
              {index % 4 === 0 && Math.abs(arrowLength) > 10 && (
                <text
                  x={x}
                  y={15 + arrowLength}
                  textAnchor="middle"
                  fontSize="8"
                  fill="#666"
                >
                  {Math.abs(point.downwash).toFixed(1)}
                </text>
              )}
            </g>
          )
        })}
        
        {/* Arrow marker definition */}
        <defs>
          <marker
            id="downwashArrow"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon
              points="0 0, 8 3, 0 6"
              fill="#dc2626"
            />
          </marker>
        </defs>
        
        {/* Labels */}
        <text x="0" y="-30" textAnchor="middle" fontSize="12" fill="#374151" fontWeight="bold">
          Induced Downwash Distribution
        </text>
        
        <text x="-250" y="90" fontSize="10" fill="#666">
          Span: {trefftzParams.span.toFixed(1)} m
        </text>
        
        <text x="150" y="90" fontSize="10" fill="#666">
          Max w: {calculations.inducedDownwash.toFixed(2)} m/s
        </text>
      </svg>
    )
  }, [calculations, trefftzParams.span])
  
  return (
    <div className="space-y-8">
      {/* Controls */}
      <div className="grid lg:grid-cols-2 gap-8">
        <Card title="Wing Geometry">
          <div className="space-y-6">
            <SliderLabeled
              label="Wing Span (b)"
              value={trefftzParams.span}
              min={5}
              max={50}
              step={1}
              unit=" m"
              onChange={setSpan}
            />
            
            <SliderLabeled
              label="Wing Area (S)"
              value={trefftzParams.area}
              min={10}
              max={200}
              step={5}
              unit=" m²"
              onChange={setArea}
            />
            
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-700">
                <strong>Aspect Ratio:</strong> {calculations.aspectRatio.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                AR = b²/S = {trefftzParams.span.toFixed(1)}²/{trefftzParams.area.toFixed(1)} = {calculations.aspectRatio.toFixed(2)}
              </p>
            </div>
          </div>
        </Card>
        
        <Card title="Flow Conditions">
          <div className="space-y-6">
            <SliderLabeled
              label="Velocity (U∞)"
              value={trefftzParams.velocity}
              min={20}
              max={300}
              step={5}
              unit=" m/s"
              onChange={setVelocity}
            />
            
            <SliderLabeled
              label="Density (ρ)"
              value={trefftzParams.density}
              min={0.5}
              max={2.0}
              step={0.05}
              unit=" kg/m³"
              onChange={setDensity}
            />
            
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> CL = {mockCL.toFixed(2)} (from panel solver)
              </p>
              <p className="text-xs text-blue-600 mt-1">
                In practice, this would come from the Panel Solver tab
              </p>
            </div>
          </div>
        </Card>
      </div>
      
      {/* Quick Presets */}
      <Card title="Aircraft Presets">
        <div className="grid md:grid-cols-3 gap-4">
          <button
            onClick={() => {
              setSpan(35)
              setArea(120)
              setVelocity(250)
            }}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center mb-2">
              <Plane className="mr-2 text-blue-600" size={20} />
              <span className="font-semibold">Airliner</span>
            </div>
            <div className="text-sm text-gray-600">
              <p>Span: 35m, Area: 120m²</p>
              <p>AR: 10.2, Cruise: 250 m/s</p>
            </div>
          </button>
          
          <button
            onClick={() => {
              setSpan(11)
              setArea(16)
              setVelocity(60)
            }}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center mb-2">
              <Plane className="mr-2 text-green-600" size={20} />
              <span className="font-semibold">GA Aircraft</span>
            </div>
            <div className="text-sm text-gray-600">
              <p>Span: 11m, Area: 16m²</p>
              <p>AR: 7.6, Cruise: 60 m/s</p>
            </div>
          </button>
          
          <button
            onClick={() => {
              setSpan(68)
              setArea(510)
              setVelocity(280)
            }}
            className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center mb-2">
              <Plane className="mr-2 text-purple-600" size={20} />
              <span className="font-semibold">Wide-body</span>
            </div>
            <div className="text-sm text-gray-600">
              <p>Span: 68m, Area: 510m²</p>
              <p>AR: 9.1, Cruise: 280 m/s</p>
            </div>
          </button>
        </div>
      </Card>
      
      {/* Results */}
      <div className="grid lg:grid-cols-2 gap-8">
        <Card title="Induced Effects">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {calculations.inducedDownwash.toFixed(2)}
                </div>
                <p className="text-sm text-blue-800">Downwash (m/s)</p>
              </div>
              
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">
                  {calculations.inducedDragCoeff.toFixed(4)}
                </div>
                <p className="text-sm text-red-800">CD,i</p>
              </div>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Lift per span:</span>
                <span className="font-mono">{(calculations.liftPerSpan / 1000).toFixed(1)} kN/m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Aspect ratio:</span>
                <span className="font-mono">{calculations.aspectRatio.toFixed(2)}</span>
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start">
                <Wind className="text-yellow-600 mr-2 flex-shrink-0 mt-0.5" size={16} />
                <div className="text-sm text-yellow-800">
                  <p className="font-semibold mb-1">Trefftz Plane Analysis:</p>
                  <p>
                    Far downstream, the wing's circulation creates a downwash field. 
                    This momentum change explains induced drag.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>
        
        <Card title="Physical Insight">
          <div className="space-y-4 text-sm text-gray-700">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Near-field → Far-field</h4>
              <p>
                The circulation around the wing (from Kutta condition) creates 
                a trailing vortex system that induces downwash behind the aircraft.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Momentum Conservation</h4>
              <p>
                Downward momentum imparted to air = upward lift on wing. 
                The energy cost of creating this downwash is induced drag.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Aspect Ratio Effect</h4>
              <p>
                Higher AR wings have less induced drag because the lift is spread 
                over a longer span, reducing the required circulation strength.
              </p>
            </div>
            
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-800 text-xs">
                <strong>Formula:</strong> w ≈ CL·U∞/(π·AR) for elliptical loading
              </p>
            </div>
          </div>
        </Card>
      </div>
      
      {/* Downwash Visualization */}
      <Card title="Downwash Distribution">
        <div className="space-y-4">
          <div className="flex justify-center">
            {downwashSVG}
          </div>
          
          <div className="text-sm text-gray-600 space-y-2">
            <p>
              <strong>Visualization:</strong> Red arrows show induced downwash velocity 
              behind the wing. Length is proportional to local downwash magnitude.
            </p>
            <p>
              <strong>Physics:</strong> The wing's bound circulation creates trailing 
              vortices that induce this downwash field. Peak downwash occurs near 
              the wing centerline for typical elliptical loading.
            </p>
            <p>
              <strong>Connection:</strong> This downwash represents the momentum 
              imparted to the air, which by Newton's 3rd law creates the lift force.
            </p>
          </div>
        </div>
      </Card>
      
      {/* Educational Content */}
      <Card title="Trefftz Plane Theory">
        <div className="prose prose-sm max-w-none">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-blue-600 mb-2">Key Concepts</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• Near-field: circulation around wing</li>
                <li>• Far-field: trailing vortex system</li>
                <li>• Downwash creates momentum change</li>
                <li>• Induced drag from energy cost</li>
                <li>• AR affects efficiency significantly</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-green-600 mb-2">Applications</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• Glider design (high AR for efficiency)</li>
                <li>• Formation flying (energy savings)</li>
                <li>• Winglet design (reduce tip effects)</li>
                <li>• Wake turbulence prediction</li>
                <li>• Aircraft separation standards</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">
              <strong>Complete Picture:</strong> Combine this with the Panel Solver results 
              to see how near-field circulation (Kutta condition) connects to far-field 
              momentum effects (Trefftz plane analysis).
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
