import { useState, useCallback } from 'react'

interface SliderLabeledProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (value: number) => void
  disabled?: boolean
  className?: string
}

export function SliderLabeled({
  label,
  value,
  min,
  max,
  step = 0.1,
  unit = '',
  onChange,
  disabled = false,
  className = ''
}: SliderLabeledProps) {
  const [isDragging, setIsDragging] = useState(false)
  
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value)
    onChange(newValue)
  }, [onChange])
  
  const formatValue = (val: number): string => {
    // Format number to appropriate precision
    if (step >= 1) {
      return val.toFixed(0)
    } else if (step >= 0.1) {
      return val.toFixed(1)
    } else if (step >= 0.01) {
      return val.toFixed(2)
    } else {
      return val.toFixed(3)
    }
  }
  
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-gray-700">
          {label}
        </label>
        <span className="text-sm font-mono text-gray-900 bg-gray-100 px-2 py-1 rounded">
          {formatValue(value)}{unit}
        </span>
      </div>
      
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setIsDragging(false)}
          disabled={disabled}
          className={`
            w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer
            disabled:cursor-not-allowed disabled:opacity-50
            ${isDragging ? 'bg-blue-200' : ''}
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-blue-600
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:transition-all
            [&::-webkit-slider-thumb]:hover:bg-blue-700
            [&::-webkit-slider-thumb]:hover:scale-110
            [&::-moz-range-thumb]:h-5
            [&::-moz-range-thumb]:w-5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-blue-600
            [&::-moz-range-thumb]:cursor-pointer
            [&::-moz-range-thumb]:border-none
            [&::-moz-range-thumb]:shadow-md
            [&::-moz-range-track]:bg-gray-200
            [&::-moz-range-track]:rounded-lg
            [&::-moz-range-track]:h-2
          `}
        />
        
        {/* Min/Max labels */}
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{formatValue(min)}{unit}</span>
          <span>{formatValue(max)}{unit}</span>
        </div>
      </div>
    </div>
  )
}
