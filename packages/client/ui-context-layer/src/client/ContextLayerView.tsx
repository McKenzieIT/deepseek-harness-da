import { useState, useCallback, useMemo } from 'react'
import type { FC } from 'react'
import type { Graph } from '@antv/g6'
import { ContextLayerGraph } from './ContextLayerGraph.tsx'
import { ManagementChatPanel } from './ManagementChatPanel.tsx'
import type { ChatMessage } from './ManagementChatPanel.tsx'
import { NodeDetailPanel } from './NodeDetailPanel.tsx'
import { DomainFilterToolbar } from './DomainFilterToolbar.tsx'
import { SearchBar } from './SearchBar.tsx'
import { OverlayToggle } from './OverlayToggle.tsx'
import { useOverlayMode, useGraphAnimations } from './graph-animations.ts'
import type { GraphData, GraphNode } from './types.ts'
import type { SessionEventSource, GraphUpdate } from './narration-gate.ts'

export interface ContextLayerViewProps {
  data: GraphData | null
  messages: ChatMessage[]
  onSendMessage?: (text: string) => void
  isStreaming?: boolean
  eventSource?: SessionEventSource | null
  onInsertReference?: (assetName: string) => void
}

export const ContextLayerView: FC<ContextLayerViewProps> = ({
  data,
  messages,
  onSendMessage,
  isStreaming = false,
  eventSource = null,
  onInsertReference,
}) => {
  const [graphInstance, setGraphInstance] = useState<Graph | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [releasedUpdates, setReleasedUpdates] = useState<readonly GraphUpdate[]>([])

  // Overlay mode wired to actual graph instance
  const { mode: overlayMode, setMode: setOverlayMode } = useOverlayMode(graphInstance)

  // Graph animations consume narration gate releases
  useGraphAnimations(graphInstance, releasedUpdates)

  const allDomains = useMemo(() => {
    if (!data?.nodes) return []
    const domains = new Set<string>()
    for (const node of data.nodes) {
      for (const d of node.domains) domains.add(d)
    }
    return Array.from(domains).sort()
  }, [data])

  const [activeDomains, setActiveDomains] = useState<string[]>([])

  // Filter graph data client-side for multi-domain support
  const filteredData = useMemo((): GraphData | null => {
    if (!data) return null
    if (activeDomains.length === 0 || activeDomains.length === allDomains.length) return data
    const domainSet = new Set(activeDomains)
    const filteredNodes = data.nodes.filter(n => n.domains.some(d => domainSet.has(d)))
    const nodeIds = new Set(filteredNodes.map(n => n.id))
    const filteredEdges = data.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    return { nodes: filteredNodes, edges: filteredEdges }
  }, [data, activeDomains, allDomains])

  const handleNodeClick = useCallback((nodeId: string) => {
    if (!data?.nodes) return
    const node = data.nodes.find(n => n.id === nodeId) ?? null
    setSelectedNode(node)
  }, [data])

  const handleCloseDetail = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const handleToggleChat = useCallback(() => {
    setChatCollapsed(prev => !prev)
  }, [])

  const handleNarrationRelease = useCallback((released: readonly GraphUpdate[]) => {
    setReleasedUpdates(released)
  }, [])

  const handleNodeSelect = useCallback((nodeId: string) => {
    handleNodeClick(nodeId)
  }, [handleNodeClick])

  return (
    <div style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100vh', overflow: 'hidden' }}>
      {/* Graph area */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Main graph canvas */}
        <div style={{ flex: 1, position: 'relative' }}>
          <ContextLayerGraph
            data={filteredData}
            onNodeClick={handleNodeClick}
            onGraphReady={setGraphInstance}
          />

          {/* Node detail panel overlay */}
          {selectedNode && (
            <div style={{ position: 'absolute', top: 12, right: 12, bottom: 60, zIndex: 10 }}>
              <NodeDetailPanel
                node={selectedNode}
                onClose={handleCloseDetail}
                {...(onInsertReference ? { onInsertReference } : {})}
              />
            </div>
          )}
        </div>

        {/* Bottom toolbar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            background: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(8px)',
            borderTop: '1px solid rgba(0, 0, 0, 0.08)',
            zIndex: 5,
          }}
        >
          <SearchBar data={data} graph={graphInstance} onNodeSelect={handleNodeSelect} />
          <DomainFilterToolbar data={data} activeDomains={activeDomains} onDomainFilterChange={setActiveDomains} />
          <OverlayToggle mode={overlayMode} onModeChange={setOverlayMode} />
        </div>
      </div>

      {/* Chat panel */}
      <ManagementChatPanel
        collapsed={chatCollapsed}
        onToggleCollapse={handleToggleChat}
        messages={messages}
        {...(onSendMessage ? { onSendMessage } : {})}
        isStreaming={isStreaming}
        eventSource={eventSource}
        onNarrationRelease={handleNarrationRelease}
      />
    </div>
  )
}
