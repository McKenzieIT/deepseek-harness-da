import type { FC } from 'react'
import type { GraphNode } from './types.ts'
import { KIND_COLORS, DOMAIN_PALETTE, DOMAIN_BORDER_PALETTE, evalBorderColor } from './graph-styles.ts'

export interface NodeDetailPanelProps {
  /** The currently selected node (null = panel hidden). */
  node: GraphNode | null
  /** Close the panel. */
  onClose: () => void
  /** Insert a reference to this asset into the chat. */
  onInsertReference?: (assetName: string) => void
}

export const NodeDetailPanel: FC<NodeDetailPanelProps> = ({ node, onClose, onInsertReference }) => {
  if (!node) return null

  const kindColor = KIND_COLORS[node.kind]

  return (
    <div
      style={{
        width: 320,
        background: '#fff',
        borderLeft: '1px solid #e0e0e0',
        boxShadow: '-2px 0 8px rgba(0,0,0,0.06)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 16 }}>{node.label}</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              padding: '2px 6px',
              borderRadius: 4,
              background: kindColor,
              color: '#fff',
            }}
          >
            {node.kind}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'none',
            fontSize: 20,
            cursor: 'pointer',
            lineHeight: 1,
            color: '#666',
          }}
          aria-label="Close panel"
        >
          &times;
        </button>
      </div>

      {/* Domains */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Domains</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {node.domains.map((domain, i) => {
            const bg = DOMAIN_PALETTE[i % DOMAIN_PALETTE.length]
            const border = DOMAIN_BORDER_PALETTE[i % DOMAIN_BORDER_PALETTE.length]
            return (
              <span
                key={domain}
                style={{
                  fontSize: 12,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: bg,
                  border: `1px solid ${border}`,
                  color: '#333',
                }}
              >
                {domain}
              </span>
            )
          })}
        </div>
      </div>

      {/* Eval pass rate */}
      {node.evalPassRate !== undefined && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Eval Pass Rate</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: evalBorderColor(node.evalPassRate),
                display: 'inline-block',
              }}
            />
            <span style={{ fontWeight: 500, fontSize: 14 }}>
              {Math.round(node.evalPassRate * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Chat reference button */}
      {onInsertReference && (
        <button
          onClick={() =>{  onInsertReference(node.id) }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            width: '100%',
            padding: '10px 0',
            border: '1px solid #d0d0d0',
            borderRadius: 6,
            background: '#fafafa',
            cursor: 'pointer',
            fontSize: 14,
            color: '#333',
          }}
        >
          <span>💬</span>
          <span>Insert chat reference</span>
        </button>
      )}
    </div>
  )
}
