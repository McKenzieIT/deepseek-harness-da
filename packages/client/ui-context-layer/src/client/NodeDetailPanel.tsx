import type { FC } from 'react'
import type { SemanticGraphEdge, SemanticGraphNode as GraphNode } from '@deepseek-ai/dsh-schema-gateway/types'
import { DOMAIN_PALETTE, DOMAIN_BORDER_PALETTE, evalBorderColor } from './graph-styles.ts'
import type { GraphDetailRow, GraphPresentationReader } from './graph-presentation.ts'
import type { ContextLayerTranslate } from './locales.ts'

const CLOSE_GLYPH = '×'

export interface NodeDetailPanelProps {
  /** The currently selected node (null = panel hidden). */
  node: GraphNode | null
  /** Close the panel. */
  onClose: () => void
  /** Insert a reference to this asset into the chat. */
  onInsertReference?: (assetName: string) => void
  /**
   * Sorted set of ALL domains in the graph, used to key chip colors by the
   * GLOBAL domain index — matching the graph's comboStyle (which keys off the
   * same sorted set in ContextLayerGraph.toG6Data) and DomainFilterToolbar —
   * so a chip visually correlates with its combo. Omitted = fall back to the
   * local index within this node's domains (prior behavior). (ucl-7)
   */
  allDomains?: readonly string[]
  /**
   * Relations incident to this node. Each one renders through the presentation
   * registry, so an unregistered relation kind keeps its raw kind string as its
   * accessible label instead of reaching the UI unnamed (W27).
   */
  relations?: readonly SemanticGraphEdge[]
  /** Resolves the node and relation kinds this panel renders. */
  presentation: GraphPresentationReader
  /** Localized node-detail copy. */
  t: ContextLayerTranslate
}

/** One label/value detail row; the shared row layout for nodes and relations. */
const DetailRow: FC<{ row: GraphDetailRow }> = ({ row }) => (
  <div style={{ display: 'flex', gap: 8, fontSize: 12, lineHeight: 1.6 }}>
    <span style={{ color: '#666', flex: '0 0 96px' }}>{row.label}</span>
    <span style={{ color: '#333', wordBreak: 'break-all' }}>{row.value}</span>
  </div>
)

export const NodeDetailPanel: FC<NodeDetailPanelProps> = ({
  node,
  onClose,
  onInsertReference,
  allDomains,
  relations,
  presentation,
  t,
}) => {
  if (!node) return null

  // Presentation registry: a registered kind gets its localized label, icon,
  // and palette color; an unregistered kind falls back to the raw kind string
  // plus a neutral color, and still yields detail rows.
  const kindPresentation = presentation.resolveNode(node, t)

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
        overflowY: 'auto',
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
              background: kindPresentation.style.fill,
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {/* The glyph repeats the adjacent label, so it is decorative here. */}
            <span aria-hidden="true">{kindPresentation.icon}</span>
            <span>{kindPresentation.label}</span>
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
          aria-label={t('node.close')}
        >
          {CLOSE_GLYPH}
        </button>
      </div>

      {/* Domains */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{t('node.domains')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {node.domains.map((domain, i) => {
            // ucl-7: key the palette off the GLOBAL sorted domain index (when the
            // caller supplies allDomains) so a chip's color matches its combo +
            // the DomainFilterToolbar, which both color by the same sorted set.
            // Fall back to the local index within this node's domains otherwise.
            const idx = allDomains?.indexOf(domain) ?? -1
            const colorIdx = idx >= 0 ? idx : i
            const bg = DOMAIN_PALETTE[colorIdx % DOMAIN_PALETTE.length]
            const border = DOMAIN_BORDER_PALETTE[colorIdx % DOMAIN_BORDER_PALETTE.length]
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
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{t('node.evalPassRate')}</div>
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

      {/* Kind detail rows: generic rows plus whatever the kind's renderer adds */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{t('node.detail')}</div>
        {kindPresentation.detail.map(row => <DetailRow key={row.id} row={row} />)}
      </div>

      {/* Relations, each through its own kind presentation */}
      {relations !== undefined && relations.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{t('node.relations')}</div>
          {relations.map((edge, i) => {
            const rel = presentation.resolveRelation(edge, t)
            return (
              <div
                key={`${edge.source}-${edge.type}-${edge.target}-${i}`}
                style={{ marginBottom: 8, paddingLeft: 8, borderLeft: `2px solid ${rel.style.stroke}` }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500 }}>
                  {/* The glyph repeats the adjacent label, so it is decorative here. */}
                  <span aria-hidden="true">{rel.icon}</span>
                  <span>{rel.label}</span>
                </div>
                {rel.detail.map(row => <DetailRow key={row.id} row={row} />)}
              </div>
            )
          })}
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
          <span>{t('node.insertReference')}</span>
        </button>
      )}
    </div>
  )
}
