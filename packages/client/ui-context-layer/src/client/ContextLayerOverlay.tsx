import { useSyncExternalStore, useState, useCallback, useEffect, type FC } from 'react'
import type { ContextLayerService } from './service.ts'
import type { GraphDataClient } from './graphDataBridge.ts'
import { ContextLayerView } from './ContextLayerView.tsx'
import type { GraphData } from './types.ts'

export interface ContextLayerOverlayProps {
  service: ContextLayerService
  graphClient?: GraphDataClient | null
}

export const ContextLayerOverlay: FC<ContextLayerOverlayProps> = ({ service, graphClient }) => {
  const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot)
  const [data, setData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(false)

  // The management chat is not wired on the client yet: ctx.managementSession
  // is not exposed, so onSendMessage is intentionally omitted —
  // ManagementChatPanel disables + labels its input rather than silently
  // dropping user input. Wire when ctx.managementSession lands.

  const handleClose = useCallback(() => { service.close() }, [service])

  useEffect(() => {
    if (!snapshot.isOpen || !graphClient) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    graphClient.fetchGraphData(snapshot.focusNode ? { focus: snapshot.focusNode } : undefined).then(
      (result) => { if (!cancelled) { setData(result); setLoading(false) } },
      () => { if (!cancelled) { setData(null); setLoading(false) } },
    )
    return () => { cancelled = true }
  }, [snapshot.isOpen, snapshot.focusNode, graphClient])

  if (!snapshot.isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30,
        pointerEvents: 'all',
        background: 'var(--bg-page, #fff)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px', borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.08))' }}>
        {loading && <span style={{ marginRight: 'auto', opacity: 0.6, fontSize: 13 }}>Loading graph…</span>}
        <button
          type="button"
          onClick={handleClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '4px 8px' }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <ContextLayerView
          data={data}
          messages={[]}
        />
      </div>
    </div>
  )
}
