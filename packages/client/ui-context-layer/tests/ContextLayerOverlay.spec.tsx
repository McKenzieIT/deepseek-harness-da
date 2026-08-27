// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ContextLayerService } from '../src/client/service.ts'
import { ContextLayerOverlay } from '../src/client/ContextLayerOverlay.tsx'

// Mock ContextLayerView since it depends on G6 and heavy DOM
vi.mock('../src/client/ContextLayerView.tsx', () => ({
  ContextLayerView: (props: { data: unknown }) => (
    <div data-testid="context-layer-view" data-has-data={props.data != null} />
  ),
}))

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
})
