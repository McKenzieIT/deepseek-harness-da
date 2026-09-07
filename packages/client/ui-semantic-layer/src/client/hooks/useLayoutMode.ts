/**
 * useLayoutMode — auto-flip logic for semantic layer layout.
 *
 * The semantic layer shell can operate in two layouts:
 * - "B" (workspace-first / asset-first) — the default before sufficient eval data
 * - "A" (dashboard-first / evidence-first) — promoted once the eval store accumulates enough runs
 *
 * The `auto` mode resolves to B or A based on eval run count against a threshold.
 * The `computeEffectiveMode` function is pure and independently testable.
 *
 * NIT: this hook is a pure computation — no async fetch, no state/effect.
 * `evalRunCount` is resolved upstream: `SemanticLayerShell` derives it live
 * from `useEvidenceMetrics` (which RPCs `getEvalRunCount`) when an
 * `evidenceClient` is present, falling back to the `evalRunCount` prop
 * otherwise. The fetch happens in the host, so this hook stays a pure function
 * of its props.
 */
export type LayoutMode = 'B' | 'A' | 'auto'

/** UseLayoutModeOptions */
export interface UseLayoutModeOptions {
  /** Layout mode from plugin config. */
  mode: LayoutMode
  /** Number of completed eval runs (passed from host plugin / shell). */
  evalRunCount?: number
  /** Minimum eval runs to auto-flip from B to A. Default: 3. */
  autoFlipThreshold?: number
}

/** UseLayoutModeResult */
export interface UseLayoutModeResult {
  /** Resolved mode (auto resolved to B or A). */
  effectiveMode: 'B' | 'A'
  /** Raw config mode. */
  configMode: LayoutMode
}

/**
 * Compute the effective layout mode.
 * Auto-flip: when eval store has >= threshold run IDs, flip to 'A'.
 *
 * Pure function for testability.
 * @param mode - mode
 * @param evalRunCount - evalRunCount
 * @param threshold - threshold
 * @returns the result
 */
export function computeEffectiveMode(
  mode: LayoutMode,
  evalRunCount: number,
  threshold: number = 3,
): 'B' | 'A' {
  if (mode === 'B') return 'B'
  if (mode === 'A') return 'A'
  // auto: flip to A when we have enough eval data
  return evalRunCount >= threshold ? 'A' : 'B'
}

/**
 *  useLayoutMode
 * @param options - options
 * @returns the result
 */
export function useLayoutMode(options: UseLayoutModeOptions): UseLayoutModeResult {
  const { mode, evalRunCount = 0, autoFlipThreshold = 3 } = options
  return {
    effectiveMode: computeEffectiveMode(mode, evalRunCount, autoFlipThreshold),
    configMode: mode,
  }
}
