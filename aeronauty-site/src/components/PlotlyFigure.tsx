"use client"
import dynamic from 'next/dynamic'

// Dynamically import Plotly to avoid SSR issues
const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => <div className="w-full h-64 bg-gray-100 animate-pulse rounded-lg flex items-center justify-center">Loading chart...</div>
})

export default function PlotlyFigure() {
  return (
    <div className="my-8">
      <Plot
        data={[
          {
            x: [1, 2, 3, 4, 5],
            y: [2, 6, 3, 8, 4],
            type: 'scatter',
            mode: 'lines+markers',
            marker: { color: 'rgb(59, 130, 246)' },
            line: { color: 'rgb(59, 130, 246)' },
            name: 'Sample Data'
          }
        ]}
        layout={{
          title: {
            text: 'Sample Plotly Chart ✈️',
            font: { size: 20 }
          },
          xaxis: { title: 'X Axis' },
          yaxis: { title: 'Y Axis' },
          margin: { t: 50, r: 50, b: 50, l: 50 },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
        }}
        config={{
          displayModeBar: true,
          responsive: true
        }}
        className="w-full"
        style={{ width: '100%', height: '400px' }}
      />
    </div>
  )
}
