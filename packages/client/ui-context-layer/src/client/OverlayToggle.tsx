import type { OverlayMode } from './graph-animations.ts'

export interface OverlayToggleProps {
  mode: OverlayMode
  onModeChange: (mode: OverlayMode) => void
}

const modes: { value: OverlayMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'coverage', label: 'Coverage' },
  { value: 'heatmap', label: 'Heatmap' },
]

export function OverlayToggle({ mode, onModeChange }: OverlayToggleProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'row',
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid #d1d5db',
      }}
    >
      {modes.map(({ value, label }, index) => {
        const isActive = mode === value
        return (
          <button
            key={value}
            type="button"
            onClick={() =>{  onModeChange(value) }}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              fontFamily: 'inherit',
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              border: 'none',
              borderRight: index < modes.length - 1 ? '1px solid #d1d5db' : 'none',
              background: isActive ? '#2563eb' : '#f3f4f6',
              color: isActive ? '#ffffff' : '#374151',
              outline: 'none',
              lineHeight: 1.4,
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
