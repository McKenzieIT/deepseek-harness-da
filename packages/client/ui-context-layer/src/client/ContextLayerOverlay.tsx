import { useSyncExternalStore, useState, useCallback, type FC } from 'react'
import type { ContextLayerService } from './service.ts'
import { ContextLayerView } from './ContextLayerView.tsx'
import type { GraphData } from './types.ts'
import type { ChatMessage } from './ManagementChatPanel.tsx'

export interface ContextLayerOverlayProps {
  service: ContextLayerService
}

export const ContextLayerOverlay: FC<ContextLayerOverlayProps> = ({ service }) => {
  const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot)
  const [messages] = useState<ChatMessage[]>([])

  const handleSendMessage = useCallback((_text: string) => {
    // Management session message bridge — wired when ctx.managementSession lands.
  }, [])

  const handleClose = useCallback(() => { service.close() }, [service])

  if (!snapshot.isOpen) return null

  // Graph data placeholder — wired when the graph data fetch (getGraphData)
  // integrates with the managementSession pipeline.
  const data: GraphData | null = null

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
          messages={messages}
          onSendMessage={handleSendMessage}
        />
      </div>
    </div>
  )
}
