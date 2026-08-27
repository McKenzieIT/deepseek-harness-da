import { useState, useRef, useEffect, useCallback } from 'react'
import type { FC } from 'react'
import { useNarrationGate } from './narration-gate.ts'
import type { SessionEventSource, GraphUpdate } from './narration-gate.ts'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
}

export interface ManagementChatPanelProps {
  /** Whether the panel is collapsed. */
  collapsed: boolean
  /** Toggle collapse state. */
  onToggleCollapse: () => void
  /** Messages to display (simplified format for the shell). */
  messages: ChatMessage[]
  /** Send a new message. */
  onSendMessage: (text: string) => void
  /** Whether the agent is currently responding. */
  isStreaming?: boolean
  /** Session event source for narration gate integration. */
  eventSource?: SessionEventSource | null
  /** Callback with released graph updates from the narration gate. */
  onNarrationRelease?: (released: readonly GraphUpdate[]) => void
}

export const ManagementChatPanel: FC<ManagementChatPanelProps> = ({
  collapsed,
  onToggleCollapse,
  messages,
  onSendMessage,
  isStreaming = false,
  eventSource = null,
  onNarrationRelease,
}) => {
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { released, isBuffering } = useNarrationGate(eventSource)

  // Call onNarrationRelease when released items change (ref pattern avoids re-triggering on callback identity change)
  const onNarrationReleaseRef = useRef(onNarrationRelease)
  onNarrationReleaseRef.current = onNarrationRelease
  const prevReleasedLenRef = useRef(0)
  useEffect(() => {
    if (released.length > prevReleasedLenRef.current) {
      onNarrationReleaseRef.current?.(released)
    }
    prevReleasedLenRef.current = released.length
  }, [released])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed || isStreaming) return
    onSendMessage(trimmed)
    setInputValue('')
  }, [inputValue, isStreaming, onSendMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  // Collapsed state: thin vertical strip
  if (collapsed) {
    return (
      <div
        style={{
          width: 40,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
          borderLeft: '1px solid #e8e8e8',
          boxShadow: '-2px 0 8px rgba(0,0,0,0.04)',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'width 0.2s ease',
        }}
        onClick={onToggleCollapse}
      >
        <span style={{ fontSize: 14, marginBottom: 8 }}>&#9664;</span>
        <span
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            fontSize: 12,
            color: '#666',
            letterSpacing: '0.5px',
          }}
        >
          Chat
        </span>
      </div>
    )
  }

  // Expanded state
  return (
    <div
      style={{
        width: 380,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        borderLeft: '1px solid #e8e8e8',
        boxShadow: '-2px 0 8px rgba(0,0,0,0.04)',
        transition: 'width 0.2s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid #e8e8e8',
          gap: 8,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>
          Management Agent
        </span>
        {isStreaming && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#3b82f6',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        )}
        <button
          onClick={onToggleCollapse}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: 14,
            padding: '4px 6px',
            borderRadius: 4,
            color: '#666',
          }}
          aria-label="Collapse panel"
        >
          &#9654;
        </button>
      </div>

      {/* Buffering indicator */}
      {isBuffering && (
        <div
          style={{
            padding: '4px 16px',
            fontSize: 11,
            color: '#888',
            background: '#fafafa',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          Updating graph...
        </div>
      )}

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {messages.map(msg => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '80%',
                padding: '8px 12px',
                borderRadius: 12,
                fontSize: 13,
                lineHeight: '1.4',
                wordBreak: 'break-word',
                ...(msg.role === 'user'
                  ? {
                    background: '#3b82f6',
                    color: '#fff',
                    borderBottomRightRadius: 4,
                  }
                  : {
                    background: '#f3f4f6',
                    color: '#1f2937',
                    borderBottomLeftRadius: 4,
                  }),
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: '1px solid #e8e8e8',
          padding: 8,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={isStreaming}
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            fontSize: 13,
            outline: 'none',
            background: isStreaming ? '#f9f9f9' : '#fff',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!inputValue.trim() || isStreaming}
          style={{
            padding: '8px 14px',
            border: 'none',
            borderRadius: 8,
            background:
              !inputValue.trim() || isStreaming ? '#ccc' : '#3b82f6',
            color: '#fff',
            fontSize: 13,
            fontWeight: 500,
            cursor:
              !inputValue.trim() || isStreaming ? 'not-allowed' : 'pointer',
          }}
        >
          Send
        </button>
      </div>

      {/* Inline keyframes for the pulsing dot */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
