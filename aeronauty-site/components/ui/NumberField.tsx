import { useState, useCallback, useRef } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'

interface NumberFieldProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  unit?: string
  onChange: (value: number) => void
  disabled?: boolean
  className?: string
  precision?: number
}

export function NumberField({
  label,
  value,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit = '',
  onChange,
  disabled = false,
  className = '',
  precision = 2
}: NumberFieldProps) {
  const [inputValue, setInputValue] = useState(value.toFixed(precision))
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const clampValue = useCallback((val: number): number => {
    return Math.max(min, Math.min(max, val))
  }, [min, max])
  
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
  }, [])
  
  const handleInputBlur = useCallback(() => {
    setIsFocused(false)
    const numValue = parseFloat(inputValue)
    if (!isNaN(numValue)) {
      const clampedValue = clampValue(numValue)
      setInputValue(clampedValue.toFixed(precision))
      onChange(clampedValue)
    } else {
      // Reset to current value if invalid
      setInputValue(value.toFixed(precision))
    }
  }, [inputValue, value, onChange, clampValue, precision])
  
  const handleInputFocus = useCallback(() => {
    setIsFocused(true)
    inputRef.current?.select()
  }, [])
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const newValue = clampValue(value + step)
      onChange(newValue)
      setInputValue(newValue.toFixed(precision))
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const newValue = clampValue(value - step)
      onChange(newValue)
      setInputValue(newValue.toFixed(precision))
    }
  }, [value, step, onChange, clampValue, precision])
  
  const handleStepUp = useCallback(() => {
    const newValue = clampValue(value + step)
    onChange(newValue)
    setInputValue(newValue.toFixed(precision))
  }, [value, step, onChange, clampValue, precision])
  
  const handleStepDown = useCallback(() => {
    const newValue = clampValue(value - step)
    onChange(newValue)
    setInputValue(newValue.toFixed(precision))
  }, [value, step, onChange, clampValue, precision])
  
  // Update input value when prop value changes (but not when focused)
  if (!isFocused && Math.abs(parseFloat(inputValue) - value) > 1e-10) {
    setInputValue(value.toFixed(precision))
  }
  
  return (
    <div className={`space-y-2 ${className}`}>
      <label className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={`
            w-full px-3 py-2 pr-16 border border-gray-300 rounded-lg
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            disabled:bg-gray-100 disabled:cursor-not-allowed
            font-mono text-right
            ${isFocused ? 'ring-2 ring-blue-500 border-blue-500' : ''}
          `}
        />
        
        {/* Unit label */}
        {unit && (
          <span className="absolute right-12 top-1/2 transform -translate-y-1/2 text-sm text-gray-500">
            {unit}
          </span>
        )}
        
        {/* Stepper buttons */}
        <div className="absolute right-1 top-1/2 transform -translate-y-1/2 flex flex-col">
          <button
            type="button"
            onClick={handleStepUp}
            disabled={disabled || value >= max}
            className={`
              p-0.5 text-gray-400 hover:text-gray-600 disabled:text-gray-300
              disabled:cursor-not-allowed transition-colors
            `}
            tabIndex={-1}
          >
            <ChevronUp size={12} />
          </button>
          <button
            type="button"
            onClick={handleStepDown}
            disabled={disabled || value <= min}
            className={`
              p-0.5 text-gray-400 hover:text-gray-600 disabled:text-gray-300
              disabled:cursor-not-allowed transition-colors
            `}
            tabIndex={-1}
          >
            <ChevronDown size={12} />
          </button>
        </div>
      </div>
      
      {/* Min/Max indicators */}
      {(min !== -Infinity || max !== Infinity) && (
        <div className="text-xs text-gray-500">
          Range: {min !== -Infinity ? min.toFixed(precision) : '−∞'} to {max !== Infinity ? max.toFixed(precision) : '∞'}{unit}
        </div>
      )}
    </div>
  )
}
