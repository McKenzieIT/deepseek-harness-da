// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { NodeDetailPanel } from '../src/client/NodeDetailPanel.tsx'
import type { GraphNode } from '../src/client/types.ts'

const node: GraphNode = {
  id: 'n1',
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
    const local = render(<NodeDetailPanel node={node} onClose={() => {}} />)
    const localBetaBg = local.getByText('beta').style.background
    const localAlphaBg = local.getByText('alpha').style.background
    expect(localBetaBg).not.toBe(localAlphaBg) // distinct local colors
    local.unmount()

    // Global render (allDomains supplied): beta=global1, alpha=global0 — swapped.
    const global = render(
      <NodeDetailPanel node={node} onClose={() => {}} allDomains={allDomains} />,
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
