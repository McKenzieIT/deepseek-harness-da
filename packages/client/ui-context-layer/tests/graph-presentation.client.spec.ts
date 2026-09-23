import { describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SemanticGraphEdge, SemanticGraphNode, SemanticGraphNodeId } from '@deepseek-ai/dsh-schema-gateway/types'
import {
  GENERIC_NODE_ICON,
  GENERIC_RELATION_ICON,
  createGraphPresentationRegistry,
} from '../src/client/graph-presentation.ts'
import { GENERIC_EDGE_COLOR, GENERIC_NODE_COLOR } from '../src/client/graph-styles.ts'
import { en, type ContextLayerKey } from '../src/client/locales.ts'

const t = (key: ContextLayerKey): string => en[key]

function node(kind: string, fields: Partial<SemanticGraphNode> = {}): SemanticGraphNode {
  return { id: brandString<SemanticGraphNodeId>('n1'), kind, label: 'Node1', domains: ['core'], ...fields }
}

function edge(type: string, fields: Partial<SemanticGraphEdge> = {}): SemanticGraphEdge {
  return {
    source: brandString<SemanticGraphNodeId>('n1'),
    target: brandString<SemanticGraphNodeId>('n2'),
    type,
    ...fields,
  }
}

describe('graph presentation registry — built-in kinds (W27)', () => {
  it('gives each built-in node kind a localized label, an icon, and a palette fill', () => {
    const registry = createGraphPresentationRegistry()
    for (const kind of ['dws', 'dim', 'event', 'metric', 'concept']) {
      const resolved = registry.resolveNode(node(kind), t)
      expect(resolved.label).toBe(en[`kind.${kind}` as ContextLayerKey])
      expect(resolved.generic).toBe(false)
      expect(resolved.icon).not.toBe(GENERIC_NODE_ICON)
      expect(resolved.style.fill).not.toBe(GENERIC_NODE_COLOR)
    }
  })

  it('gives each built-in relation kind a localized label, an icon, and a stroke', () => {
    const registry = createGraphPresentationRegistry()
    const expected: Record<string, ContextLayerKey> = {
      joins: 'relation.joins',
      derived_from: 'relation.derivedFrom',
      related_to: 'relation.relatedTo',
    }
    for (const [type, key] of Object.entries(expected)) {
      const resolved = registry.resolveRelation(edge(type), t)
      expect(resolved.label).toBe(en[key])
      expect(resolved.generic).toBe(false)
      expect(resolved.icon).not.toBe(GENERIC_RELATION_ICON)
    }
  })

  it('surfaces the join condition through the `joins` detail renderer', () => {
    const registry = createGraphPresentationRegistry()
    const resolved = registry.resolveRelation(edge('joins', { on: 'a.user_id = b.user_id' }), t)
    const row = resolved.detail.find(r => r.id === 'on')
    expect(row?.label).toBe(en['relation.detail.on'])
    expect(row?.value).toBe('a.user_id = b.user_id')
  })

  it('surfaces the concept name through the `concept` detail renderer', () => {
    const registry = createGraphPresentationRegistry()
    const resolved = registry.resolveNode(
      node('concept', { id: brandString<SemanticGraphNodeId>('concept:付费经济') }),
      t,
    )
    const row = resolved.detail.find(r => r.id === 'conceptName')
    expect(row?.label).toBe(en['node.detail.conceptName'])
    expect(row?.value).toBe('付费经济')
  })
})

describe('graph presentation registry — generic fallback (W27 acceptance 3)', () => {
  it('keeps an accessible label, an icon, a style, and detail for an unregistered node kind', () => {
    const registry = createGraphPresentationRegistry()
    const resolved = registry.resolveNode(node('sankey_chart'), t)
    expect(resolved.generic).toBe(true)
    // The raw projected kind is the accessible label — never dropped, never undefined.
    expect(resolved.label).toBe('sankey_chart')
    expect(resolved.icon).toBe(GENERIC_NODE_ICON)
    expect(resolved.style.fill).toBe(GENERIC_NODE_COLOR)
    expect(resolved.detail).toContainEqual({ id: 'kind', label: en['node.detail.kind'], value: 'sankey_chart' })
  })

  it('keeps an accessible label, an icon, a style, and detail for an unregistered relation kind', () => {
    const registry = createGraphPresentationRegistry()
    const resolved = registry.resolveRelation(edge('visualizes'), t)
    expect(resolved.generic).toBe(true)
    expect(resolved.label).toBe('visualizes')
    expect(resolved.icon).toBe(GENERIC_RELATION_ICON)
    expect(resolved.style.stroke).toBe(GENERIC_EDGE_COLOR)
    expect(resolved.detail).toContainEqual({ id: 'type', label: en['relation.detail.type'], value: 'visualizes' })
  })

  // A prototype member name is a reachable open kind. The tables are Maps, so a
  // lookup can never return an inherited member; a plain object would resolve
  // `toString` to `Object.prototype.toString` and hand a function to a renderer
  // that expects a CSS color string and a label string.
  it('resolves prototype member names through the generic fallback', () => {
    const registry = createGraphPresentationRegistry()
    for (const kind of ['toString', 'constructor', '__proto__', 'valueOf', 'hasOwnProperty']) {
      const resolvedNode = registry.resolveNode(node(kind), t)
      expect(resolvedNode.label).toBe(kind)
      expect(resolvedNode.style.fill).toBe(GENERIC_NODE_COLOR)
      const resolvedRelation = registry.resolveRelation(edge(kind), t)
      expect(resolvedRelation.label).toBe(kind)
      expect(resolvedRelation.style.stroke).toBe(GENERIC_EDGE_COLOR)
    }
  })
})

describe('graph presentation registry — registration seam (W27 acceptance 2)', () => {
  it('gives a newly registered node kind its label, icon, and style with no core edit', () => {
    const registry = createGraphPresentationRegistry()
    const dispose = registry.registerNode('sankey_chart', {
      labelKey: 'kind.dws',
      icon: '◆',
      fill: '#13c2c2',
      detail: n => [{ id: 'chartId', label: 'Chart', value: n.id }],
    })

    const resolved = registry.resolveNode(node('sankey_chart'), t)
    expect(resolved.generic).toBe(false)
    expect(resolved.label).toBe(en['kind.dws'])
    expect(resolved.icon).toBe('◆')
    expect(resolved.style.fill).toBe('#13c2c2')
    expect(resolved.detail).toContainEqual({ id: 'chartId', label: 'Chart', value: 'n1' })

    // register() returns the disposer; disposing restores the generic fallback.
    dispose()
    expect(registry.resolveNode(node('sankey_chart'), t).generic).toBe(true)
  })

  it('gives a newly registered relation kind its label, icon, and style with no core edit', () => {
    const registry = createGraphPresentationRegistry()
    const dispose = registry.registerRelation('visualizes', {
      labelKey: 'relation.joins',
      icon: '◈',
      stroke: '#13c2c2',
      lineWidth: 2,
      lineDash: [4, 4],
    })

    const resolved = registry.resolveRelation(edge('visualizes'), t)
    expect(resolved.generic).toBe(false)
    expect(resolved.label).toBe(en['relation.joins'])
    expect(resolved.icon).toBe('◈')
    expect(resolved.style).toEqual({ stroke: '#13c2c2', lineWidth: 2, lineDash: [4, 4] })

    dispose()
    expect(registry.resolveRelation(edge('visualizes'), t).generic).toBe(true)
  })

  it('keeps handles independent: one registry never sees another registry entry', () => {
    const first = createGraphPresentationRegistry()
    const second = createGraphPresentationRegistry()
    first.registerNode('sankey_chart', { labelKey: 'kind.dws', icon: '◆', fill: '#13c2c2' })
    expect(second.resolveNode(node('sankey_chart'), t).generic).toBe(true)
  })
})

describe('graph presentation registry — eval decoration', () => {
  it('carries the eval pass rate into the node stroke and line width', () => {
    const registry = createGraphPresentationRegistry()
    const withEval = registry.resolveNode(node('dws', { evalPassRate: 1 }), t)
    const withoutEval = registry.resolveNode(node('dws'), t)
    expect(withEval.style.stroke).not.toBe(withoutEval.style.stroke)
    expect(withEval.style.lineWidth).toBe(3)
    expect(withoutEval.style.lineWidth).toBe(1)
  })
})
