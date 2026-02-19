import { motion } from 'framer-motion'

interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  description?: string
}

export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
  className = '',
  description
}: ToggleProps) {
  const handleToggle = () => {
    if (!disabled) {
      onChange(!checked)
    }
  }
  
  return (
    <div className={`flex items-start space-x-3 ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`
          relative inline-flex h-6 w-11 items-center rounded-full transition-colors
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          disabled:cursor-not-allowed disabled:opacity-50
          ${checked ? 'bg-blue-600' : 'bg-gray-200'}
        `}
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${label}-label`}
      >
        <motion.span
          animate={{
            x: checked ? 20 : 2,
          }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 30
          }}
          className={`
            inline-block h-4 w-4 transform rounded-full bg-white shadow-lg
            transition-transform
          `}
        />
      </button>
      
      <div className="flex-1">
        <label
          id={`${label}-label`}
          className={`
            text-sm font-medium cursor-pointer
            ${disabled ? 'text-gray-400 cursor-not-allowed' : 'text-gray-900'}
          `}
          onClick={handleToggle}
        >
          {label}
        </label>
        {description && (
          <p className="text-xs text-gray-500 mt-1">
            {description}
          </p>
        )}
      </div>
    </div>
  )
}
