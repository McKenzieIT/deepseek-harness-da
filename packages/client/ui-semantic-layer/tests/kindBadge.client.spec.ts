// @vitest-environment jsdom
/**
 * usl-11: shared kind→badge-class mapping. Pins the kind→CSS-class contract
 * (table/event/metric + generic fallback, with the `?? ''` empty-string
 * safety) so SearchSchemaRow and GetDefinitionRow share one helper instead of
 * re-declaring byte-identical `kindBadgeClass` functions.
 */
import { describe, expect, it, vi } from 'vitest'

// Concrete class names stand in for the presenters CSS module so the
// kind→class mapping is testable independent of the build's CSS-module name
// generation. Mutated in the `?? ''` test to omit a class.
const cssClasses = vi.hoisted((): Record<string, string | undefined> => ({
  badgeTable: 'T',
  badgeEvent: 'E',
  badgeMetric: 'M',
  badge: 'B',
}))

vi.mock('../src/client/presenters/presenters.module.css', () => ({ default: cssClasses }))

import { kindBadgeClass } from '../src/client/presenters/kindBadge.ts'

describe('kindBadgeClass', () => {
  it('maps table → badgeTable', () => {
    expect(kindBadgeClass('table')).toBe('T')
  })

  it('maps event → badgeEvent', () => {
    expect(kindBadgeClass('event')).toBe('E')
  })

  it('maps metric → badgeMetric', () => {
    expect(kindBadgeClass('metric')).toBe('M')
  })

  it('falls back to the generic badge for undefined/unknown kind', () => {
    expect(kindBadgeClass(undefined)).toBe('B')
    expect(kindBadgeClass('relation')).toBe('B')
  })

  it('returns the empty string when the resolved class is absent (?? fallback)', () => {
    // If the CSS module omits a class, the badge renders with no class rather
    // than `undefined` leaking into a className string.
    cssClasses.badgeTable = undefined
    expect(kindBadgeClass('table')).toBe('')
    cssClasses.badgeTable = 'T'
  })
})
