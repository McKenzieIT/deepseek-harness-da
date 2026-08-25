import { describe, expect, it } from 'vitest'
import { computeEffectiveMode } from '../src/client/hooks/useLayoutMode.ts'

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
