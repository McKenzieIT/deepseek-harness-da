// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SemanticGraphEdge, SemanticGraphNode as GraphNode, SemanticGraphNodeId } from '@deepseek-ai/dsh-schema-gateway/types'
import { NodeDetailPanel } from '../src/client/NodeDetailPanel.tsx'
import { createGraphPresentationRegistry } from '../src/client/graph-presentation.ts'
import { en, type ContextLayerKey } from '../src/client/locales.ts'

const t = (key: ContextLayerKey): string => en[key]

/** Branding only the id keeps every other fixture field under field-level typechecking. */
const id = (value: string): SemanticGraphNodeId => brandString<SemanticGraphNodeId>(value)

const presentation = createGraphPresentationRegistry()

const node: GraphNode = {
  id: id('n1'),
  kind: 'dws',
  label: 'Node1',
  // local order: beta first (local idx 0), alpha second (local idx 1)
  domains: ['beta', 'alpha'],
}

// global sorted domain set: alpha=0, beta=1, gamma=2
const allDomains = ['alpha', 'beta', 'gamma']

// jsdom serializes hex palette colors to rgb(), so assertions compare the
// *serialized* style strings across renders (same engine on both sides) via
// `.style.background` — never raw hex. unmount() between renders keeps the
// document from accumulating panels (no auto-cleanup in this vitest setup).

describe('NodeDetailPanel — domain chip color (ucl-7)', () => {
  it('colors chips by the global sorted domain index, not the local index', () => {
    // Local-only render (no allDomains): prior behavior — beta=local0, alpha=local1.
    const local = render(<NodeDetailPanel t={t} presentation={presentation} node={node} onClose={() => {}} />)
    const localBetaBg = local.getByText('beta').style.background
    const localAlphaBg = local.getByText('alpha').style.background
    expect(localBetaBg).not.toBe(localAlphaBg) // distinct local colors
    local.unmount()

    // Global render (allDomains supplied): beta=global1, alpha=global0 — swapped.
    const global = render(
      <NodeDetailPanel t={t} presentation={presentation} node={node} onClose={() => {}} allDomains={allDomains} />,
    )
    const globalBetaBg = global.getByText('beta').style.background
    const globalAlphaBg = global.getByText('alpha').style.background
    expect(globalBetaBg).not.toBe(globalAlphaBg) // distinct global colors

    // beta (global idx 1) must now wear the color alpha had locally (local idx 1),
    // and alpha (global idx 0) must wear the color beta had locally (local idx 0).
    // Before the fix the panel ignored allDomains and used the local index, so
    // globalBetaBg === localBetaBg and these swap assertions failed.
    expect(globalBetaBg).toBe(localAlphaBg)
    expect(globalAlphaBg).toBe(localBetaBg)
    global.unmount()
  })
})

describe('NodeDetailPanel — node kind presentation (W27)', () => {
  it('renders the localized label and detail rows for a known kind', () => {
    const known: GraphNode = { id: id('t1'), kind: 'dws', label: 'Orders', domains: [] }
    const view = render(<NodeDetailPanel t={t} presentation={presentation} node={known} onClose={() => {}} />)
    // The kind badge shows the localized name, not the raw kind key.
    expect(view.getByText(en['kind.dws'])).not.toBeNull()
    // Detail stays reachable: the generic kind row states the raw projected kind.
    expect(view.getByText(en['node.detail.kind'])).not.toBeNull()
    expect(view.getByText('dws')).not.toBeNull()
    view.unmount()
  })

  it('renders the concept detail row a registered detail renderer contributes', () => {
    const concept: GraphNode = { id: id('concept:付费经济'), kind: 'concept', label: '付费经济', domains: [] }
    const view = render(<NodeDetailPanel t={t} presentation={presentation} node={concept} onClose={() => {}} />)
    expect(view.getByText(en['node.detail.conceptName'])).not.toBeNull()
    // The renderer decodes the concept name out of the node id.
    expect(view.getAllByText('付费经济').length).toBe(2)
    view.unmount()
  })

  // W27 acceptance 3: an unregistered node kind keeps an accessible label AND
  // reachable detail. Before the registry covered detail, the panel showed only
  // the badge, so an unknown kind had no detail at all.
  it('keeps an accessible label and reachable detail for an unregistered kind', () => {
    const unknown: GraphNode = { id: id('x1'), kind: 'sankey_chart', label: 'Weekly Flow', domains: ['付费经济'] }
    const view = render(<NodeDetailPanel t={t} presentation={presentation} node={unknown} onClose={() => {}} />)
    // Accessible label = the raw kind string, in the badge and in the kind row.
    expect(view.getAllByText('sankey_chart').length).toBe(2)
    expect(view.getByText('Weekly Flow')).not.toBeNull()
    expect(view.getByText('付费经济')).not.toBeNull()
    // Reachable detail: the generic kind row.
    expect(view.getByText(en['node.detail.kind'])).not.toBeNull()
    view.unmount()
  })
})

describe('NodeDetailPanel — relation kind presentation (W27)', () => {
  const relations: readonly SemanticGraphEdge[] = [
    { source: id('n1'), target: id('n2'), type: 'joins', on: 'a.user_id = b.user_id' },
    { source: id('n1'), target: id('n3'), type: 'visualizes' },
  ]

  it('renders the localized label and detail rows of a known relation kind', () => {
    const view = render(
      <NodeDetailPanel t={t} presentation={presentation} node={node} relations={relations} onClose={() => {}} />,
    )
    expect(view.getByText(en['node.relations'])).not.toBeNull()
    expect(view.getByText(en['relation.joins'])).not.toBeNull()
    // The `joins` detail renderer surfaces the join condition verbatim.
    expect(view.getByText('a.user_id = b.user_id')).not.toBeNull()
    view.unmount()
  })

  // W27 acceptance 3 for relations: before this, no relation kind had any client
  // presentation at all, so an unregistered relation kind reached the UI with no
  // accessible label and no detail.
  it('keeps an accessible label and reachable detail for an unregistered relation kind', () => {
    const view = render(
      <NodeDetailPanel t={t} presentation={presentation} node={node} relations={relations} onClose={() => {}} />,
    )
    // Accessible label = the raw relation kind string, in the heading and the kind row.
    expect(view.getAllByText('visualizes').length).toBe(2)
    // Reachable detail: the generic relation rows name the kind and the target.
    expect(view.getAllByText(en['relation.detail.type']).length).toBe(2)
    expect(view.getByText('n3')).not.toBeNull()
    view.unmount()
  })
})
