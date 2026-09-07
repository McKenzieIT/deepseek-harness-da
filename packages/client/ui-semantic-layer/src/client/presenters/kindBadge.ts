import css from './presenters.module.css'

/**
 * Map an asset kind to its badge CSS class. Returns the kind-specific class
 * (`table`→`badgeTable`, `event`→`badgeEvent`, `metric`→`badgeMetric`) or the
 * generic `badge` class for unknown/undefined kinds, with an empty-string
 * fallback when the CSS module lacks the resolved class name.
 * @param kind - kind
 * @returns the result
 */
export function kindBadgeClass(kind: string | undefined): string {
  if (kind === 'table') return css.badgeTable ?? ''
  if (kind === 'event') return css.badgeEvent ?? ''
  if (kind === 'metric') return css.badgeMetric ?? ''
  return css.badge ?? ''
}
