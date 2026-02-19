import { useMemo } from 'react'
import { StreamlineField, AirfoilGeometry } from '@/lib/panels/types'

interface StreamlinesCanvasProps {
  streamlineField: StreamlineField
  airfoilGeometry: AirfoilGeometry
  width?: number
  height?: number
  className?: string
  showAirfoil?: boolean
  airfoilColor?: string
  streamlineColor?: string
  strokeWidth?: number
}

export function StreamlinesCanvas({
  streamlineField,
  airfoilGeometry,
  width = 800,
  height = 400,
  className = '',
  showAirfoil = true,
  airfoilColor = '#1f2937',
  streamlineColor = '#3b82f6',
  strokeWidth = 1.5
}: StreamlinesCanvasProps) {
  // Calculate viewBox from bounds
  const { bounds } = streamlineField
  const aspectRatio = (bounds.xMax - bounds.xMin) / (bounds.yMax - bounds.yMin)
  const padding = 0.1 // 10% padding
  const paddedWidth = (bounds.xMax - bounds.xMin) * (1 + 2 * padding)
  const paddedHeight = (bounds.yMax - bounds.yMin) * (1 + 2 * padding)
  const viewBoxX = bounds.xMin - (bounds.xMax - bounds.xMin) * padding
  const viewBoxY = bounds.yMin - (bounds.yMax - bounds.yMin) * padding
  
  // Generate SVG path for airfoil
  const airfoilPath = useMemo(() => {
    if (!showAirfoil || airfoilGeometry.points.length === 0) return ''
    
    const points = airfoilGeometry.points
    let path = `M ${points[0].x} ${points[0].y}`
    
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`
    }
    
    path += ' Z' // Close the path
    return path
  }, [airfoilGeometry.points, showAirfoil])
  
  // Generate SVG paths for streamlines
  const streamlinePaths = useMemo(() => {
    return streamlineField.streamlines.map((streamline, index) => {
      if (streamline.points.length < 2) return ''
      
      let path = `M ${streamline.points[0].x} ${streamline.points[0].y}`
      
      for (let i = 1; i < streamline.points.length; i++) {
        path += ` L ${streamline.points[i].x} ${streamline.points[i].y}`
      }
      
      return path
    }).filter(path => path.length > 0)
  }, [streamlineField.streamlines])
  
  return (
    <div className={`relative ${className}`}>
      <svg
        width={width}
        height={height}
        viewBox={`${viewBoxX} ${viewBoxY} ${paddedWidth} ${paddedHeight}`}
        className="border border-gray-200 rounded-lg bg-gradient-to-b from-blue-50 to-white"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Define clipping path for streamlines */}
        <defs>
          <clipPath id="streamlineClip">
            <rect
              x={bounds.xMin}
              y={bounds.yMin}
              width={bounds.xMax - bounds.xMin}
              height={bounds.yMax - bounds.yMin}
            />
            {showAirfoil && airfoilPath && (
              <path d={airfoilPath} fillRule="evenodd" />
            )}
          </clipPath>
          
          {/* Arrow marker for streamline direction */}
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill={streamlineColor}
              opacity="0.7"
            />
          </marker>
        </defs>
        
        {/* Background grid (optional) */}
        <defs>
          <pattern
            id="grid"
            width="0.1"
            height="0.1"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 0.1 0 L 0 0 0 0.1"
              fill="none"
              stroke="#f3f4f6"
              strokeWidth="0.005"
            />
          </pattern>
        </defs>
        <rect
          x={viewBoxX}
          y={viewBoxY}
          width={paddedWidth}
          height={paddedHeight}
          fill="url(#grid)"
          opacity="0.5"
        />
        
        {/* Streamlines */}
        <g clipPath="url(#streamlineClip)">
          {streamlinePaths.map((path, index) => (
            <path
              key={index}
              d={path}
              fill="none"
              stroke={streamlineColor}
              strokeWidth={strokeWidth / 100} // Scale stroke width to viewBox
              opacity="0.8"
              markerEnd="url(#arrowhead)"
            />
          ))}
        </g>
        
        {/* Airfoil */}
        {showAirfoil && airfoilPath && (
          <path
            d={airfoilPath}
            fill={airfoilColor}
            stroke={airfoilColor}
            strokeWidth={strokeWidth / 50}
            opacity="0.9"
          />
        )}
        
        {/* Panel control points (for debugging) */}
        {process.env.NODE_ENV === 'development' && (
          <g>
            {airfoilGeometry.panels.map((panel, index) => (
              <circle
                key={index}
                cx={panel.controlPoint.x}
                cy={panel.controlPoint.y}
                r={0.005}
                fill="red"
                opacity="0.5"
              />
            ))}
          </g>
        )}
        
        {/* Coordinate axes (optional) */}
        <g opacity="0.3">
          <line
            x1={bounds.xMin}
            y1="0"
            x2={bounds.xMax}
            y2="0"
            stroke="#6b7280"
            strokeWidth={strokeWidth / 100}
            strokeDasharray="0.02 0.01"
          />
          <line
            x1="0"
            y1={bounds.yMin}
            x2="0"
            y2={bounds.yMax}
            stroke="#6b7280"
            strokeWidth={strokeWidth / 100}
            strokeDasharray="0.02 0.01"
          />
        </g>
      </svg>
      
      {/* Legend */}
      <div className="absolute top-2 right-2 bg-white bg-opacity-90 rounded-lg p-2 text-xs space-y-1">
        <div className="flex items-center space-x-2">
          <div className={`w-4 h-0.5 bg-blue-500`}></div>
          <span>Streamlines</span>
        </div>
        {showAirfoil && (
          <div className="flex items-center space-x-2">
            <div className={`w-4 h-2 bg-gray-800 rounded-sm`}></div>
            <span>Airfoil</span>
          </div>
        )}
      </div>
    </div>
  )
}
