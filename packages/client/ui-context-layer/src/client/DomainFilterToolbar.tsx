import { useMemo } from 'react'
import type { GraphData } from './types.ts'
import { DOMAIN_PALETTE, DOMAIN_BORDER_PALETTE } from './graph-styles.ts'

export interface DomainFilterToolbarProps {
  data: GraphData | null
  activeDomains: string[]
  onDomainFilterChange: (activeDomains: string[]) => void
}

export function DomainFilterToolbar({
  data,
  activeDomains,
  onDomainFilterChange,
}: DomainFilterToolbarProps) {
  const allDomains = useMemo(() => {
    if (!data) return []
    const domainSet = new Set<string>()
    for (const node of data.nodes) {
      for (const domain of node.domains) {
        domainSet.add(domain)
      }
    }
    return Array.from(domainSet).sort()
  }, [data])

  const handleToggle = (domain: string) => {
    const isActive = activeDomains.includes(domain)
    if (isActive) {
      onDomainFilterChange(activeDomains.filter(d => d !== domain))
    } else {
      onDomainFilterChange([...activeDomains, domain])
    }
  }

  if (allDomains.length === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        padding: '8px 12px',
        alignItems: 'center',
      }}
    >
      {allDomains.map((domain, index) => {
        const isActive = activeDomains.includes(domain)
        const paletteIndex = index % DOMAIN_PALETTE.length
        const bgColor = isActive ? DOMAIN_PALETTE[paletteIndex] : '#f0f0f0'
        const borderColor = isActive ? DOMAIN_BORDER_PALETTE[paletteIndex] : '#d9d9d9'
        const textColor = isActive ? '#333' : '#999'

        return (
          <button
            key={domain}
            onClick={() =>{  handleToggle(domain) }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 10px',
              fontSize: '12px',
              lineHeight: '1.4',
              borderRadius: '12px',
              border: `1px solid ${borderColor}`,
              backgroundColor: bgColor,
              color: textColor,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontWeight: isActive ? 500 : 400,
            }}
          >
            {domain}
          </button>
        )
      })}
    </div>
  )
}
