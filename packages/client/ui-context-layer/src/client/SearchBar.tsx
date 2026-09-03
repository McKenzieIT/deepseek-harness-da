import { useState, useMemo } from 'react'
import type { Graph } from '@antv/g6'
import type { GraphData } from './types.ts'
import { focusWithZoom } from './graph-animations.ts'

export interface SearchBarProps {
  data: GraphData | null
  graph: Graph | null
  onNodeSelect?: (nodeId: string) => void
}

export function SearchBar({ data, graph, onNodeSelect }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const matches = useMemo(() => {
    if (!data?.nodes || !query.trim()) return []
    const lower = query.toLowerCase()
    return data.nodes
      .filter((node) => {
        const label = node.label.toLowerCase()
        const id = node.id.toLowerCase()
        return label.includes(lower) || id.includes(lower)
      })
      .slice(0, 8)
  }, [data, query])

  function handleSelect(nodeId: string) {
    if (graph) {
      focusWithZoom(graph, nodeId)
    }
    onNodeSelect?.(nodeId)
    setQuery('')
    setIsOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setQuery('')
      setIsOpen(false)
    }
  }

  return (
    <div style={{ position: 'relative', width: 260 }}>
      <input
        type="text"
        value={query}
        placeholder="Search nodes..."
        onChange={(e) => {
          setQuery(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => {
          if (query.trim()) setIsOpen(true)
        }}
        onBlur={() => {
          setTimeout(() =>{  setIsOpen(false) }, 150)
        }}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%',
          padding: '6px 10px',
          fontSize: 14,
          border: '1px solid #ccc',
          borderRadius: 4,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {isOpen && matches.length > 0 && (
        <ul
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            margin: 0,
            padding: 0,
            listStyle: 'none',
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            zIndex: 1000,
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {matches.map(node => (
            <li
              key={node.id}
              onClick={() =>{  handleSelect(node.id) }}
              style={{
                padding: '6px 10px',
                fontSize: 13,
                cursor: 'pointer',
                borderBottom: '1px solid #eee',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLElement).style.background = '#f0f0f0'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.background = '#fff'
              }}
            >
              {node.label || node.id}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
