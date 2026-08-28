/**
 * Hook that fetches evalRunCount and evalPassRates from the evidence-query
 * client on mount and after each triggerEval. Provides the reactive data
 * that GoalDock sparkline and auto-flip need.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import type { EvidenceQueryClient } from './useEvidenceQuery.ts'

export interface EvidenceMetrics {
  evalRunCount: number
  evalPassRates: number[]
  refresh(): void
}

export function useEvidenceMetrics(client: EvidenceQueryClient | null): EvidenceMetrics {
  const [evalRunCount, setEvalRunCount] = useState(0)
  const [evalPassRates, setEvalPassRates] = useState<number[]>([])
  // Guard setState against post-unmount resolution: this hook is mounted in
  // session-scoped slot adapters (GoalDock/Evidence) that remount on session
  // switch, so an in-flight RPC can otherwise land after teardown.
  const cancelledRef = useRef(false)

  const refresh = useCallback(() => {
    if (!client?.getEvalRunCount || !client.getRecentPassRates) return
    void client.getEvalRunCount()
      .then((v) => { if (!cancelledRef.current) setEvalRunCount(v) })
      .catch(() => { /* evidence-metrics RPC failed: leave the previous sparkline value; non-critical, no user error surface */ })
    void client.getRecentPassRates(10)
      .then((v) => { if (!cancelledRef.current) setEvalPassRates(v) })
      .catch(() => { /* evidence-metrics RPC failed: leave the previous pass-rate series; non-critical, no user error surface */ })
  }, [client])

  useEffect(() => {
    cancelledRef.current = false
    refresh()
    return () => { cancelledRef.current = true }
  }, [refresh])

  return { evalRunCount, evalPassRates, refresh }
}
