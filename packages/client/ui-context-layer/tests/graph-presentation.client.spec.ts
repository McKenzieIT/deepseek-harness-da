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

  // W27: prototype-pollution guard. `KIND_COLORS` is a plain object, so a
  // property lookup for a prototype member name (`toString`, `constructor`,
  // `__proto__`) returns the inherited function/object (truthy) and bypasses
  // the `?? GENERIC_NODE_COLOR` fallback — `nodeKindColor('toString')` would
  // return `Object.prototype.toString` (a function), crashing a renderer that
  // expects a CSS color string. The lookup must only consider OWN properties.
  it('nodeKindColor never returns a prototype member for constructor / toString / __proto__', () => {
    expect(nodeKindColor('toString')).toBe(GENERIC_NODE_COLOR)
    expect(nodeKindColor('constructor')).toBe(GENERIC_NODE_COLOR)
    expect(nodeKindColor('__proto__')).toBe(GENERIC_NODE_COLOR)
    // Sanity: the returned value is always a string (CSS color), never a function.
    for (const kind of ['toString', 'constructor', '__proto__', 'valueOf', 'hasOwnProperty']) {
      expect(typeof nodeKindColor(kind)).toBe('string')
    }
  })

  it('nodeKindPresentation never surfaces an undefined label for prototype member kinds', () => {
    for (const kind of ['toString', 'constructor', '__proto__', 'valueOf', 'hasOwnProperty']) {
      const p = nodeKindPresentation(kind, t)
      // The raw kind string is the accessible fallback label — never undefined.
      expect(p.label).toBe(kind)
      expect(p.color).toBe(GENERIC_NODE_COLOR)
    }
  })
})
