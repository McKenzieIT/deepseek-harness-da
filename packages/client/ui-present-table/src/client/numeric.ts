/**
 * Shared numeric-cell parser for the table card's KPI aggregation and the chart
 * view's value reader. Strict (Number-based): a trailing suffix like '%' makes
 * the cell non-numeric, so an already-percent value ('85%') is dropped instead
 * of being silently kept (parseFloat would yield 85, and the '%' KPI format
 * would then double-scale it to 8500%). Empty/whitespace-only cells are null.
 */
export function parseNumericCell(raw: string): number | null {
  if (raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}
