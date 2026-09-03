/**
 * Management Session service — creates a dedicated agent session when the user
 * enters the full-screen graph management UI.
 *
 * W11 D6 Resolution: 进入全屏图谱管理界面时开启专属 management agent session，
 * 只挂载管理相关 tools. 管理 session 可只读引用主 data-query session 的对话摘要，
 * 提供连贯体验但职责分离。
 *
 * The management session is scoped to the `semantic-layer-management` preset,
 * which gates tools to: discover_relations, edit_definition, trigger_eval,
 * revert_edit, get_definition, search_schema, list_domains, get_coverage.
 *
 * @module @deepseek-ai/dsh-management-session
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-presets'

export const MANAGEMENT_PRESET_ID = 'semantic-layer-management'

/**
 * Maximum number of recent messages to include in the parent session summary
 * when creating a management session with a parent reference.
 */
export const DEFAULT_SUMMARY_MESSAGE_COUNT = 20

/**
 * The management session descriptor: the session itself plus metadata about
 * its creation context.
 */
export interface ManagementSessionDescriptor {
  /** The management session's id. */
  readonly sessionId: SessionId
  /** The live session instance. */
  readonly session: Session
  /** The parent session id this management session references (if any). */
  readonly parentSessionId?: SessionId
  /** The read-only parent context summary snapshot taken at creation time. */
  readonly parentContextSummary?: string
  /** Timestamp when this management session was created. */
  readonly createdAt: number
  /** Dispose function to release the underlying session from the session store. */
  readonly dispose: () => void
}

/** Options for creating a management session. */
export interface CreateManagementSessionOptions {
  /**
   * The parent data-query session id. When provided, the management session's
   * system prompt will include a read-only summary of the parent session's
   * recent conversation for context continuity.
   */
  parentSessionId?: string
  /**
   * Maximum number of parent messages to include in the context summary.
   * Defaults to {@link DEFAULT_SUMMARY_MESSAGE_COUNT}.
   */
  summaryMessageCount?: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    managementSession: ManagementSessionService
  }

  interface Events {
    /**
     * Emitted when a management session is created.
     *
     * @mode emit
     * @param descriptor - the created management session descriptor.
     */
    'management-session/created'(descriptor: ManagementSessionDescriptor): void
    /**
     * Emitted when a management session is destroyed.
     *
     * @mode emit
     * @param sessionId - the destroyed management session id.
     */
    'management-session/destroyed'(sessionId: SessionId): void
  }
}

/**
 * Minimal structural type for a derived message — avoids a hard dependency on
 * `@deepseek-ai/dsh-llm` while remaining assignable from the real `Message`.
 */
export interface SummarizableMessage {
  readonly role: string
  readonly content: readonly { type: string; text?: string }[] | string
}

/**
 * Summarize recent messages from a session for cross-session context reference.
 * Produces a concise text summary of the last N messages suitable for inclusion
 * in a system prompt.
 *
 * @param messages - the derived message history from the parent session.
 * @param maxMessages - maximum messages to include.
 * @returns a text summary of the conversation, or undefined if empty.
 */
export function summarizeMessages(messages: readonly SummarizableMessage[], maxMessages: number): string | undefined {
  if (messages.length === 0) return undefined

  const recent = messages.slice(-maxMessages)
  const lines: string[] = ['[Parent session context — read-only reference]']

  for (const msg of recent) {
    const text = messageContent(msg)
    if (!text) continue
    switch (msg.role) {
      case 'user':
        lines.push(`User: ${truncateContent(text, 200)}`)
        break
      case 'assistant':
        lines.push(`Assistant: ${truncateContent(text, 300)}`)
        break
      default:
        break
    }
  }

  return lines.length > 1 ? lines.join('\n') : undefined
}

/**
 * Extract text content from a message, handling both string and structured
 * content blocks.
 */
function messageContent(msg: SummarizableMessage): string {
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return (msg.content as readonly { type: string; text?: string }[])
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text' && typeof block.text === 'string')
      .map(block => block.text)
      .join(' ')
  }
  return ''
}

/** Truncate a string to maxLen characters, appending '...' if truncated. */
function truncateContent(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 3) + '...'
}

/**
 * Management Session Service: creates dedicated agent sessions scoped to the
 * `semantic-layer-management` preset for the full-screen graph management UI.
 *
 * - `create()` — opens a new management session
 * - `destroy(sessionId)` — tears down a management session
 * - `getActive()` — returns the currently active management session (if any)
 *
 * Tool gating is handled by the preset: the management session is composed
 * from the `semantic-layer-management` agent preset which only exposes the
 * management-relevant tools.
 */
export class ManagementSessionService extends Service {
  static inject = ['sessions'] as const

  /** Active management sessions, keyed by session id. */
  private readonly active = new Map<string, ManagementSessionDescriptor>()

  constructor(ctx: Context) {
    super(ctx, 'managementSession')
    // Destroy all active management sessions when the service is disposed
    ctx.effect(() => () => {
      for (const descriptor of this.active.values()) {
        descriptor.dispose()
      }
      this.active.clear()
    })
  }

  /**
   * Create a new management session scoped to the semantic-layer-management
   * preset tools.
   *
   * When `parentSessionId` is provided, derives a read-only summary of the
   * parent session's recent conversation and includes it in the management
   * session's creation metadata. This is a one-time snapshot at creation, not
   * live-updating.
   *
   * @param opts - creation options.
   * @returns the management session descriptor.
   * Multiple management sessions may be active concurrently; this method does
   * not reject when one is already active (use {@link getActive} for the most
   * recent). When `parentSessionId` is provided but no such session exists in
   * the store, creation proceeds without a parent context summary (no throw).
   */
  create(opts?: CreateManagementSessionOptions): ManagementSessionDescriptor {
    const parentSessionId = opts?.parentSessionId
    const summaryCount = opts?.summaryMessageCount ?? DEFAULT_SUMMARY_MESSAGE_COUNT

    // Derive parent context summary if a parent session is referenced
    let parentContextSummary: string | undefined
    if (parentSessionId !== undefined) {
      const parentSession = this.ctx.sessions.get(SessionId(parentSessionId))
      if (parentSession !== undefined) {
        const messages = parentSession.deriveMessages()
        parentContextSummary = summarizeMessages(messages, summaryCount)
      }
    }

    // Create the management session under the semantic-layer-management preset.
    // Use prepare + enter to obtain an explicit detach disposer that releases
    // the session from the store when destroy() is called.
    const session = this.ctx.sessions.prepare(undefined, {
      meta: {
        agentPreset: MANAGEMENT_PRESET_ID,
        ...(parentSessionId !== undefined ? { parentSession: SessionId(parentSessionId) } : {}),
      },
    })
    const detach = this.ctx.sessions.enter(session)
    this.ctx.sessions.announce(session)

    const descriptor: ManagementSessionDescriptor = {
      sessionId: session.id,
      session,
      ...(parentSessionId !== undefined ? { parentSessionId: SessionId(parentSessionId) } : {}),
      ...(parentContextSummary !== undefined ? { parentContextSummary } : {}),
      createdAt: Date.now(),
      dispose: detach,
    }

    this.active.set(session.id, descriptor)
    this.ctx.emit('management-session/created', descriptor)

    return descriptor
  }

  /**
   * Tear down a management session.
   *
   * @param sessionId - the management session to destroy.
   * @throws if the session id does not correspond to an active management session.
   */
  destroy(sessionId: string): void {
    const descriptor = this.active.get(sessionId)
    if (descriptor === undefined) {
      throw new Error(`no active management session with id "${sessionId}"`)
    }
    this.active.delete(sessionId)
    descriptor.dispose()
    this.ctx.emit('management-session/destroyed', SessionId(sessionId))
  }

  /**
   * Returns the currently active management session, or undefined if none.
   * When multiple management sessions are active, returns the most recently
   * created one.
   */
  getActive(): ManagementSessionDescriptor | undefined {
    if (this.active.size === 0) return undefined
    // Return the most recently created descriptor
    let latest: ManagementSessionDescriptor | undefined
    for (const descriptor of this.active.values()) {
      if (latest === undefined || descriptor.createdAt > latest.createdAt) {
        latest = descriptor
      }
    }
    return latest
  }

  /**
   * Returns all active management sessions.
   */
  listActive(): ManagementSessionDescriptor[] {
    return [...this.active.values()]
  }

  /**
   * Check if a given session id belongs to an active management session.
   */
  isManagementSession(sessionId: string): boolean {
    return this.active.has(sessionId)
  }
}

/** Cordis plugin name. */
export const name = 'management-session'

/** Service dependencies. */
export const inject = ['sessions'] as const

/**
 * Plugin apply function — registers the ManagementSessionService on the
 * context. This is the Cordis function-plugin form (name + inject + apply).
 */
export function apply(ctx: Context): void {
  ctx.plugin(ManagementSessionService)
}
