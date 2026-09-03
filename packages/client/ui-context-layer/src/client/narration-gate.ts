/**
 * Narration Gate — buffers graph UI updates until the management agent finishes
 * narrating tool results.
 *
 * W11 D1 Resolution: 图谱组件不直接订阅 semantic layer 变化，而是订阅
 * management session 的 tool result + message complete 事件流。tool resolve 时
 * 拿到 `presentationMeta.added` 标记为 pending；assistant message stream 结束时
 * 释放 pending → fade-in 动画。
 *
 * Flow:
 *  1. Management agent calls a tool (e.g., `discover_relations`)
 *  2. Tool resolves → its `presentationMeta` includes `added` markers
 *  3. Narration Gate receives `tool/result` event → buffers additions as "pending"
 *  4. Agent streams its narration message ("I found 3 new relations...")
 *  5. `assistant/message` (step end) or `turn/end` fires → Gate releases pending
 *  6. UI receives released batch → triggers animations (fade-in for new edges)
 *
 * @module narration-gate
 */
import { useCallback, useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single buffered graph mutation produced by a tool result. */
export interface GraphUpdate {
  type: 'add_nodes' | 'add_edges' | 'update_nodes' | 'remove_nodes'
  items: Array<{ id: string;[key: string]: unknown }>
  /** The tool name that produced this update. */
  source: string
}

/**
 * Minimal session event shape the gate subscribes to. This mirrors the
 * `SessionEvent` structure from `@deepseek-ai/dsh-session` without importing
 * the full type to avoid a hard host dependency in client code.
 */
export interface SessionEventLike {
  type: string
  seq: number
  time: number
  data: Record<string, unknown>
}

/**
 * The event source interface the NarrationGate subscribes to. Any object that
 * provides `subscribe` / `unsubscribe` for session events satisfies this.
 */
export interface SessionEventSource {
  subscribe(listener: (event: SessionEventLike) => void): () => void
}

/** Configuration for the NarrationGate. */
export interface NarrationGateOptions {
  /** Event source to subscribe to management session events. */
  eventSource: SessionEventSource
  /**
   * Maximum time (ms) the gate holds pending updates before force-releasing.
   * Prevents stale buffers when the agent errors or disconnects.
   * @default 30_000
   */
  timeout?: number | undefined
  /**
   * Callback invoked when the gate releases a batch of updates.
   * Consumers use this to trigger animations.
   */
  onRelease?: ((batch: GraphUpdate[]) => void) | undefined
}

// ---------------------------------------------------------------------------
// NarrationGate class
// ---------------------------------------------------------------------------

/**
 * Buffers graph updates extracted from management session `tool/result` events
 * until the assistant finishes narrating (`assistant/message` at step end,
 * `turn/end`, or timeout/error). Then releases the batch for animated display.
 */
export class NarrationGate {
  private pending: GraphUpdate[] = []
  private released: GraphUpdate[] = []
  private timeoutId: ReturnType<typeof setTimeout> | null = null
  private readonly timeoutMs: number
  private readonly onRelease: ((batch: GraphUpdate[]) => void) | undefined
  private unsubscribe: (() => void) | null = null
  private listeners = new Set<() => void>()

  constructor(options: NarrationGateOptions) {
    this.timeoutMs = options.timeout ?? 30_000
    this.onRelease = options.onRelease ?? undefined
    this.unsubscribe = options.eventSource.subscribe(this.handleEvent)
  }

  /** Current pending (buffered, not yet released) updates. */
  getPending(): readonly GraphUpdate[] {
    return this.pending
  }

  /** All released updates (cumulative history for the current session). */
  getReleased(): readonly GraphUpdate[] {
    return this.released
  }

  /** Register a change listener (for React integration). Returns unsubscribe. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Tear down subscriptions and timers. */
  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.clearTimeout()
    this.listeners.clear()
  }

  /** Reset released history (e.g., when session changes). */
  reset(): void {
    this.pending = []
    this.released = []
    this.clearTimeout()
    this.notify()
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private handleEvent = (event: SessionEventLike): void => {
    switch (event.type) {
      case 'tool/result':
        this.handleToolResult(event.data)
        break
      case 'assistant/message':
        // Assistant message assembled for a step — release the gate
        this.flush()
        break
      case 'turn/end':
        // Turn ended (completed, aborted, error) — release anything remaining
        this.flush()
        break
      default:
        break
    }
  }

  /**
   * Extract graph updates from a tool/result event's `meta` field
   * (presentationMeta). The `meta.added` array contains new nodes/edges.
   */
  private handleToolResult(data: Record<string, unknown>): void {
    const meta = data.meta as Record<string, unknown> | undefined
    if (!meta) return

    // Determine the tool name from the result message
    const message = data.message as { name?: string } | undefined
    const toolName = message?.name ?? 'unknown'

    // Extract added items from presentationMeta
    const added = meta.added as Array<Record<string, unknown>> | undefined
    if (added && Array.isArray(added) && added.length > 0) {
      // Separate nodes and edges from the added items
      const nodeItems: Array<{ id: string;[key: string]: unknown }> = []
      const edgeItems: Array<{ id: string;[key: string]: unknown }> = []

      for (const item of added) {
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- external boundary (meta.added), type may lie
        if (!item || typeof item !== 'object') continue
        // Items with source/target are edges; others are nodes
        if ('source' in item && 'target' in item) {
          const id = typeof item.id === 'string'
            ? item.id
            : `${String(item.source)}->${String(item.target)}`
          edgeItems.push({ ...item, id })
        } else if (typeof item.id === 'string' || typeof item.table === 'string' || typeof item.dim_table === 'string') {
          // Node-like items: use id, table, or dim_table as the identifier
          const id = (item.id ?? item.table ?? item.dim_table) as string
          nodeItems.push({ ...item, id })
        }
      }

      if (nodeItems.length > 0) {
        this.pending.push({ type: 'add_nodes', items: nodeItems, source: toolName })
      }
      if (edgeItems.length > 0) {
        this.pending.push({ type: 'add_edges', items: edgeItems, source: toolName })
      }
    }

    // Also handle the discover_relations-specific shape where the tool reports
    // ok:true but `added` was already processed above. For tools that only
    // provide before/after snapshots without a pre-computed `added` array,
    // the diff should be computed by the tool's presentationMeta callback.
    // This is a no-op guard — well-behaved tools always include `added`.

    // Start or restart the safety timeout whenever new items are buffered
    if (this.pending.length > 0) {
      this.resetTimeout()
      this.notify()
    }
  }

  /** Release all pending updates into the released set and notify consumers. */
  private flush(): void {
    if (this.pending.length === 0) return
    const batch = this.pending
    this.pending = []
    this.released = [...this.released, ...batch]
    this.clearTimeout()
    this.onRelease?.(batch)
    this.notify()
  }

  private resetTimeout(): void {
    this.clearTimeout()
    this.timeoutId = setTimeout(() => {
      this.timeoutId = null
      this.flush()
    }, this.timeoutMs)
  }

  private clearTimeout(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

/** Return shape of the `useNarrationGate` hook. */
export interface NarrationGateState {
  /** Updates buffered and waiting for narration to complete. */
  pending: readonly GraphUpdate[]
  /** Updates released after narration — ready for animated display. */
  released: readonly GraphUpdate[]
  /** Whether any updates are currently being held. */
  isBuffering: boolean
}

/**
 * React hook that subscribes to management session events and buffers graph
 * updates until the agent finishes narrating tool results.
 *
 * @param eventSource - the session event source to subscribe to (null/undefined to disable).
 * @param options - optional configuration overrides.
 * @returns the current gate state: pending and released update batches.
 *
 * @example
 * ```tsx
 * const { pending, released, isBuffering } = useNarrationGate(sessionEvents)
 * // `released` drives graph animations
 * // `isBuffering` can show a subtle "updating..." indicator
 * ```
 */
export function useNarrationGate(
  eventSource: SessionEventSource | null | undefined,
  options?: { timeout?: number },
): NarrationGateState {
  const gateRef = useRef<NarrationGate | null>(null)
  const [state, setState] = useState<NarrationGateState>({
    pending: [],
    released: [],
    isBuffering: false,
  })

  const syncState = useCallback(() => {
    const gate = gateRef.current
    if (!gate) return
    const pending = gate.getPending()
    const released = gate.getReleased()
    setState({
      pending,
      released,
      isBuffering: pending.length > 0,
    })
  }, [])

  useEffect(() => {
    if (!eventSource) {
      // No event source — reset state
      if (gateRef.current) {
        gateRef.current.dispose()
        gateRef.current = null
      }
      setState({ pending: [], released: [], isBuffering: false })
      return
    }

    const gate = new NarrationGate({
      eventSource,
      timeout: options?.timeout,
    })
    gateRef.current = gate

    // Subscribe to gate state changes
    const unsubscribe = gate.onChange(syncState)

    return () => {
      unsubscribe()
      gate.dispose()
      gateRef.current = null
    }
  }, [eventSource, options?.timeout, syncState])

  return state
}
