// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent, act, waitFor } from '@testing-library/react'
import { ContextLayerService } from '../src/client/service.ts'
import { ContextLayerOverlay } from '../src/client/ContextLayerOverlay.tsx'
import type { GraphData } from '../src/client/types.ts'
import type { GraphDataClient } from '../src/client/graphDataBridge.ts'

vi.mock('../src/client/ContextLayerView.tsx', () => ({
  ContextLayerView: (props: { data: unknown }) => (
    <div data-testid="context-layer-view" data-has-data={props.data != null} />
  ),
}))

const MOCK_DATA: GraphData = {
  nodes: [{ id: 'n1', kind: 'dws', label: 'Node1', domains: ['core'] }],
  edges: [{ source: 'n1', target: 'n2', type: 'joins' }],
}

function mockGraphClient(data: GraphData = MOCK_DATA): GraphDataClient {
  return { fetchGraphData: vi.fn().mockResolvedValue(data) }
}

describe('ContextLayerOverlay', () => {
  it('renders nothing when service is closed', () => {
    const service = new ContextLayerService()
    const { container } = render(<ContextLayerOverlay service={service} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders fullscreen container when service is open', () => {
    const service = new ContextLayerService()
    service.open()
    const { container } = render(<ContextLayerOverlay service={service} />)
    const overlay = container.firstElementChild as HTMLElement
    expect(overlay).not.toBeNull()
    expect(overlay.style.position).toBe('fixed')
    expect(overlay.style.inset).toBe('0px')
    expect(overlay.style.zIndex).toBe('30')
  })

  it('renders ContextLayerView inside when open', () => {
    const service = new ContextLayerService()
    service.open('my-node')
    const { container } = render(<ContextLayerOverlay service={service} />)
    expect(container.querySelector('[data-testid="context-layer-view"]')).not.toBeNull()
  })

  it('close button calls service.close()', () => {
    const service = new ContextLayerService()
    service.open()
    const { container } = render(<ContextLayerOverlay service={service} />)
    const btn = container.querySelector('button[aria-label="Close"]')!
    fireEvent.click(btn)
    expect(service.isOpen).toBe(false)
  })

  it('re-renders to null after close', () => {
    const service = new ContextLayerService()
    service.open()
    const { container, rerender } = render(<ContextLayerOverlay service={service} />)
    expect(container.firstElementChild).not.toBeNull()
    fireEvent.click(container.querySelector('button[aria-label="Close"]')!)
    rerender(<ContextLayerOverlay service={service} />)
    expect(container.innerHTML).toBe('')
  })

  it('fetches graph data when opened with a graphClient', async () => {
    const service = new ContextLayerService()
    const client = mockGraphClient()
    service.open('focus-node')

    const { container } = render(<ContextLayerOverlay service={service} graphClient={client} />)

    await waitFor(() => {
      const view = container.querySelector('[data-testid="context-layer-view"]')
      expect(view?.getAttribute('data-has-data')).toBe('true')
    })
    expect(client.fetchGraphData).toHaveBeenCalledWith({ focus: 'focus-node' })
  })

  it('passes undefined opts when no focusNode', async () => {
    const service = new ContextLayerService()
    const client = mockGraphClient()
    service.open()

    render(<ContextLayerOverlay service={service} graphClient={client} />)

    await waitFor(() => {
      expect(client.fetchGraphData).toHaveBeenCalledWith(undefined)
    })
  })

  it('does not fetch when graphClient is null', async () => {
    const service = new ContextLayerService()
    service.open('focus-node')

    const { container } = render(<ContextLayerOverlay service={service} graphClient={null} />)

    const view = container.querySelector('[data-testid="context-layer-view"]')
    expect(view?.getAttribute('data-has-data')).toBe('false')
  })

  it('refetches when focusNode changes', async () => {
    const service = new ContextLayerService()
    const client = mockGraphClient()
    service.open('node-a')

    const { rerender } = render(<ContextLayerOverlay service={service} graphClient={client} />)

    await waitFor(() => {
      expect(client.fetchGraphData).toHaveBeenCalledWith({ focus: 'node-a' })
    })

    act(() => { service.open('node-b') })
    rerender(<ContextLayerOverlay service={service} graphClient={client} />)

    await waitFor(() => {
      expect(client.fetchGraphData).toHaveBeenCalledWith({ focus: 'node-b' })
    })
  })

  it('clears data when service closes', async () => {
    const service = new ContextLayerService()
    const client = mockGraphClient()
    service.open('x')

    const { container, rerender } = render(<ContextLayerOverlay service={service} graphClient={client} />)

    await waitFor(() => {
      const view = container.querySelector('[data-testid="context-layer-view"]')
      expect(view?.getAttribute('data-has-data')).toBe('true')
    })

    act(() => { service.close() })
    rerender(<ContextLayerOverlay service={service} graphClient={client} />)
    expect(container.innerHTML).toBe('')
  })
})
