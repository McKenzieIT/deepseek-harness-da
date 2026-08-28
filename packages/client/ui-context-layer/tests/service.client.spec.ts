import { describe, expect, it, vi } from 'vitest'
import { ContextLayerService } from '../src/client/service.ts'

describe('ContextLayerService', () => {
  it('starts closed with no focus node', () => {
    const s = new ContextLayerService()
    expect(s.isOpen).toBe(false)
    expect(s.focusNode).toBeUndefined()
  })

  it('open() sets isOpen=true and stores the focus node', () => {
    const s = new ContextLayerService()
    s.open('dws_acc_summary_df')
    expect(s.isOpen).toBe(true)
    expect(s.focusNode).toBe('dws_acc_summary_df')
  })

  it('open() without focus node sets focusNode to undefined', () => {
    const s = new ContextLayerService()
    s.open()
    expect(s.isOpen).toBe(true)
    expect(s.focusNode).toBeUndefined()
  })

  it('close() resets state', () => {
    const s = new ContextLayerService()
    s.open('node-1')
    s.close()
    expect(s.isOpen).toBe(false)
    expect(s.focusNode).toBeUndefined()
  })

  it('close() is a no-op when already closed', () => {
    const s = new ContextLayerService()
    const cb = vi.fn()
    s.subscribe(cb)
    s.close()
    expect(cb).not.toHaveBeenCalled()
  })

  it('open() replaces previous focus node', () => {
    const s = new ContextLayerService()
    s.open('a')
    s.open('b')
    expect(s.focusNode).toBe('b')
  })

  it('notifies subscribers on open', () => {
    const s = new ContextLayerService()
    const cb = vi.fn()
    s.subscribe(cb)
    s.open('x')
    expect(cb).toHaveBeenCalledOnce()
  })

  it('notifies subscribers on close', () => {
    const s = new ContextLayerService()
    s.open()
    const cb = vi.fn()
    s.subscribe(cb)
    s.close()
    expect(cb).toHaveBeenCalledOnce()
  })

  it('unsubscribe stops notifications', () => {
    const s = new ContextLayerService()
    const cb = vi.fn()
    const unsub = s.subscribe(cb)
    unsub()
    s.open()
    expect(cb).not.toHaveBeenCalled()
  })

  it('getSnapshot returns stable reference until state changes', () => {
    const s = new ContextLayerService()
    const snap1 = s.getSnapshot()
    const snap2 = s.getSnapshot()
    expect(snap1).toBe(snap2)
    s.open('y')
    const snap3 = s.getSnapshot()
    expect(snap3).not.toBe(snap1)
    expect(snap3.isOpen).toBe(true)
    expect(snap3.focusNode).toBe('y')
  })
})
