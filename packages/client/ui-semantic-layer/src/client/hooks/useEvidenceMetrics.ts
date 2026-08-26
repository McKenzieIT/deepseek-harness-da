/**
 * Hook that fetches evalRunCount and evalPassRates from the evidence-query
 * client on mount and after each triggerEval. Provides the reactive data
 * that GoalDock sparkline and auto-flip need.
 */
import { useState, useEffect, useCallback } from 'react'
import type { EvidenceQueryClient } from './useEvidenceQuery.ts'

export interface EvidenceMetrics {
  evalRunCount: number
  evalPassRates: number[]
  refresh(): void
}

export function useEvidenceMetrics(client: EvidenceQueryClient | null): EvidenceMetrics {
  const [evalRunCount, setEvalRunCount] = useState(0)
  const [evalPassRates, setEvalPassRates] = useState<number[]>([])

  const refresh = useCallback(() => {
    if (!client?.getEvalRunCount || !client?.getRecentPassRates) return
    void client.getEvalRunCount().then(setEvalRunCount).catch(() => {})
    void client.getRecentPassRates(10).then(setEvalPassRates).catch(() => {})
  }, [client])

  useEffect(() => { refresh() }, [refresh])

  return { evalRunCount, evalPassRates, refresh }
}
