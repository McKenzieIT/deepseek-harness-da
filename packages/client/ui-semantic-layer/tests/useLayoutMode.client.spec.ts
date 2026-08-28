// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { computeEffectiveMode, useLayoutMode } from '../src/client/hooks/useLayoutMode.ts'

describe('computeEffectiveMode', () => {
  it('mode="B" → always returns "B" regardless of run count', () => {
    expect(computeEffectiveMode('B', 0, 3)).toBe('B')
    expect(computeEffectiveMode('B', 5, 3)).toBe('B')
    expect(computeEffectiveMode('B', 100, 3)).toBe('B')
  })

  it('mode="A" → always returns "A" regardless of run count', () => {
    expect(computeEffectiveMode('A', 0, 3)).toBe('A')
    expect(computeEffectiveMode('A', 1, 3)).toBe('A')
    expect(computeEffectiveMode('A', 100, 3)).toBe('A')
  })

  it('mode="auto", runCount < 3 → returns "B"', () => {
    expect(computeEffectiveMode('auto', 0, 3)).toBe('B')
    expect(computeEffectiveMode('auto', 1, 3)).toBe('B')
    expect(computeEffectiveMode('auto', 2, 3)).toBe('B')
  })

  it('mode="auto", runCount >= 3 → returns "A"', () => {
    expect(computeEffectiveMode('auto', 3, 3)).toBe('A')
    expect(computeEffectiveMode('auto', 4, 3)).toBe('A')
    expect(computeEffectiveMode('auto', 50, 3)).toBe('A')
  })

  it('mode="auto", runCount === 0 → returns "B"', () => {
    expect(computeEffectiveMode('auto', 0, 3)).toBe('B')
  })

  it('custom threshold: mode="auto", runCount=2, threshold=2 → returns "A"', () => {
    expect(computeEffectiveMode('auto', 2, 2)).toBe('A')
  })

  it('custom threshold: mode="auto", runCount=1, threshold=2 → returns "B"', () => {
    expect(computeEffectiveMode('auto', 1, 2)).toBe('B')
  })

  it('uses default threshold of 3 when not explicitly provided', () => {
    expect(computeEffectiveMode('auto', 2)).toBe('B')
    expect(computeEffectiveMode('auto', 3)).toBe('A')
  })
})

describe('useLayoutMode', () => {
  it('returns the effective mode and config mode (pure computation, no async fetch)', () => {
    const { result } = renderHook(() => useLayoutMode({ mode: 'auto', evalRunCount: 5 }))
    expect(result.current.effectiveMode).toBe('A')
    expect(result.current.configMode).toBe('auto')
  })

  it('resolves "auto" to "B" below the flip threshold', () => {
    const { result } = renderHook(() => useLayoutMode({ mode: 'auto', evalRunCount: 1 }))
    expect(result.current.effectiveMode).toBe('B')
  })

  it('passes the custom autoFlipThreshold through', () => {
    const { result } = renderHook(() =>
      useLayoutMode({ mode: 'auto', evalRunCount: 2, autoFlipThreshold: 2 }),
    )
    expect(result.current.effectiveMode).toBe('A')
  })

  it('defaults evalRunCount to 0 when omitted', () => {
    const { result } = renderHook(() => useLayoutMode({ mode: 'auto' }))
    expect(result.current.effectiveMode).toBe('B')
    expect(result.current.configMode).toBe('auto')
  })

  it('reflects a new effective mode when props change across re-renders', () => {
    const { result, rerender } = renderHook(
      ({ mode, evalRunCount }) => useLayoutMode({ mode, evalRunCount }),
      { initialProps: { mode: 'auto' as const, evalRunCount: 0 } },
    )
    expect(result.current.effectiveMode).toBe('B')
    rerender({ mode: 'auto' as const, evalRunCount: 3 })
    expect(result.current.effectiveMode).toBe('A')
  })
})
