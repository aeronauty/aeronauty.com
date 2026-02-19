import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine as RechartsReferenceLine,
  Label
} from 'recharts'
import { ChartDataPoint, ReferenceLine } from '@/lib/panels/types'

interface RechartsLineProps {
  data: ChartDataPoint[]
  xLabel: string
  yLabel: string
  referenceLines?: ReferenceLine[]
  width?: number
  height?: number
  className?: string
  showGrid?: boolean
  showLegend?: boolean
}

export function RechartsLine({
  data,
  xLabel,
  yLabel,
  referenceLines = [],
  width,
  height = 300,
  className = '',
  showGrid = true,
  showLegend = true
}: RechartsLineProps) {
  // Group data by series
  const seriesData = data.reduce((acc, point) => {
    const series = point.series || 'default'
    if (!acc[series]) {
      acc[series] = []
    }
    acc[series].push(point)
    return acc
  }, {} as Record<string, ChartDataPoint[]>)
  
  // Combine all series data for chart
  const chartData = data.reduce((acc, point, index) => {
    const existingPoint = acc.find(p => Math.abs(p.x - point.x) < 1e-10)
    if (existingPoint) {
      const series = point.series || 'default'
      existingPoint[series] = point.y
    } else {
      const newPoint: any = { x: point.x }
      const series = point.series || 'default'
      newPoint[series] = point.y
      acc.push(newPoint)
    }
    return acc
  }, [] as any[])
  
  // Sort by x value
  chartData.sort((a, b) => a.x - b.x)
  
  // Default colors for different series
  const colors = [
    '#2563eb', // blue-600
    '#dc2626', // red-600
    '#16a34a', // green-600
    '#ca8a04', // yellow-600
    '#9333ea', // purple-600
    '#c2410c', // orange-600
  ]
  
  const seriesNames = Object.keys(seriesData)
  
  // Custom tooltip formatter
  const customTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium">{`${xLabel}: ${typeof label === 'number' ? label.toFixed(3) : label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {`${entry.dataKey}: ${entry.value.toFixed(3)}`}
            </p>
          ))}
        </div>
      )
    }
    return null
  }
  
  return (
    <div className={`w-full ${className}`} style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
        >
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          )}
          
          <XAxis
            dataKey="x"
            type="number"
            scale="linear"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(value) => value.toFixed(2)}
            stroke="#6b7280"
          >
            <Label
              value={xLabel}
              position="insideBottom"
              offset={-10}
              style={{ textAnchor: 'middle', fill: '#374151', fontSize: '12px' }}
            />
          </XAxis>
          
          <YAxis
            tickFormatter={(value) => value.toFixed(2)}
            stroke="#6b7280"
          >
            <Label
              value={yLabel}
              angle={-90}
              position="insideLeft"
              style={{ textAnchor: 'middle', fill: '#374151', fontSize: '12px' }}
            />
          </YAxis>
          
          <Tooltip content={customTooltip} />
          
          {showLegend && seriesNames.length > 1 && (
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="line"
            />
          )}
          
          {/* Render lines for each series */}
          {seriesNames.map((series, index) => (
            <Line
              key={series}
              type="monotone"
              dataKey={series}
              stroke={colors[index % colors.length]}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 2 }}
              activeDot={{ r: 5, strokeWidth: 2 }}
              connectNulls={false}
              name={series === 'default' ? yLabel : series}
            />
          ))}
          
          {/* Reference lines */}
          {referenceLines.map((refLine, index) => (
            <RechartsReferenceLine
              key={index}
              y={refLine.value}
              stroke={refLine.stroke}
              strokeDasharray={refLine.strokeDasharray}
              label={{
                value: refLine.label,
                position: 'top' as const,
                style: { fill: refLine.stroke, fontSize: '12px' }
              }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
