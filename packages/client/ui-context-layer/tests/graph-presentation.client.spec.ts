import { describe, expect, it } from 'vitest'
import { nodeKindPresentation } from '../src/client/graph-presentation.ts'
import { KIND_COLORS, GENERIC_NODE_COLOR, nodeKindColor } from '../src/client/graph-styles.ts'
import { en, type ContextLayerKey } from '../src/client/locales.ts'

const t = (key: ContextLayerKey): string => en[key]

describe('graph presentation registry (W27)', () => {
  it('maps each known kind to its localized label + palette color', () => {
    for (const kind of ['dws', 'dim', 'event', 'metric', 'concept']) {
      const p = nodeKindPresentation(kind, t)
      expect(p.label).toBe(en[`kind.${kind}` as ContextLayerKey])
      expect(p.color).toBe(KIND_COLORS[kind])
    }
  })

  it('falls back to the raw kind string + generic color for an unknown kind', () => {
    const p = nodeKindPresentation('sankey_chart', t)
    // Accessible label is the raw kind (never dropped); color is neutral.
    expect(p.label).toBe('sankey_chart')
    expect(p.color).toBe(GENERIC_NODE_COLOR)
  })

  it('nodeKindColor returns the generic color for an unknown kind', () => {
    expect(nodeKindColor('dws')).toBe(KIND_COLORS.dws)
    expect(nodeKindColor('totally_new_kind')).toBe(GENERIC_NODE_COLOR)
  })
})
