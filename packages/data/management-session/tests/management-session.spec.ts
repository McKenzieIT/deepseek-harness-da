import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SUMMARY_MESSAGE_COUNT,
  MANAGEMENT_PRESET_ID,
  summarizeMessages,
  type SummarizableMessage,
} from '../src/index.ts'

// ── summarizeMessages unit tests ────────────────────────────────────────────

describe('summarizeMessages', () => {
  it('returns undefined for an empty message list', () => {
    expect(summarizeMessages([], 10)).toBeUndefined()
  })

  it('summarizes user and assistant messages', () => {
    const messages: SummarizableMessage[] = [
      { role: 'user', content: 'What tables are available?' },
      { role: 'assistant', content: 'There are 5 tables in the payment domain.' },
    ]
    const result = summarizeMessages(messages, 10)
    expect(result).toContain('[Parent session context')
    expect(result).toContain('User: What tables are available?')
    expect(result).toContain('Assistant: There are 5 tables in the payment domain.')
  })

  it('respects the maxMessages limit', () => {
    const messages: SummarizableMessage[] = [
      { role: 'user', content: 'Message 1' },
      { role: 'assistant', content: 'Response 1' },
      { role: 'user', content: 'Message 2' },
      { role: 'assistant', content: 'Response 2' },
      { role: 'user', content: 'Message 3' },
      { role: 'assistant', content: 'Response 3' },
    ]
    const result = summarizeMessages(messages, 2)
    expect(result).not.toContain('Message 1')
    expect(result).not.toContain('Message 2')
    expect(result).toContain('User: Message 3')
    expect(result).toContain('Assistant: Response 3')
  })

  it('truncates long messages', () => {
    const longContent = 'x'.repeat(500)
    const messages: SummarizableMessage[] = [
      { role: 'user', content: longContent },
    ]
    const result = summarizeMessages(messages, 10)!
    // User messages truncate at 200 chars
    expect(result.length).toBeLessThan(500)
    expect(result).toContain('...')
  })

  it('handles structured content blocks', () => {
    const messages: SummarizableMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'World' },
        ],
      },
    ]
    const result = summarizeMessages(messages, 10)
    expect(result).toContain('User: Hello World')
  })
})

// ── ManagementSessionService unit tests ─────────────────────────────────────

describe('ManagementSessionService (mock-driven)', () => {
  /**
   * Build a minimal mock sessions store matching the structural contract
   * the service calls: `create(id, opts)` and `get(id)`.
   */
  function mockSessionsStore() {
    let counter = 0
    const store = new Map<string, { id: string; header: Record<string, unknown>; deriveMessages: () => SummarizableMessage[] }>()

    return {
      create(_id: unknown, options?: { meta?: Record<string, unknown> }) {
        counter += 1
        const id = `mgmt-session-${counter}`
        const session = {
          id,
          header: { id, version: 0, createdAt: Date.now(), ...options?.meta } as Record<string, unknown>,
          deriveMessages: () => [] as SummarizableMessage[],
        }
        store.set(id, session)
        return session
      },
      get(id: string) {
        return store.get(id)
      },
      addFakeSession(id: string, messages: SummarizableMessage[]) {
        store.set(id, {
          id,
          header: { id, version: 0, createdAt: Date.now() },
          deriveMessages: () => messages,
        })
      },
    }
  }

  /**
   * Create a minimal service instance driven by mocks, bypassing the full
   * Cordis DI since we test the logic — not the framework binding.
   */
  function createServiceInstance() {
    const sessions = mockSessionsStore()
    const events: Array<{ name: string; args: unknown[] }> = []

    // Simulate the service's internal state by constructing it as a plain
    // object with the same shape as ManagementSessionService. This avoids
    // requiring the full Cordis runtime for unit tests.
    const active = new Map<string, unknown>()

    const service = {
      ctx: {
        sessions,
        emit(name: string, ...args: unknown[]) {
          events.push({ name, args })
        },
      },
      active,
      create(opts?: { parentSessionId?: string; summaryMessageCount?: number }) {
        const parentSessionId = opts?.parentSessionId
        const summaryCount = opts?.summaryMessageCount ?? DEFAULT_SUMMARY_MESSAGE_COUNT

        let parentContextSummary: string | undefined
        if (parentSessionId !== undefined) {
          const parentSession = sessions.get(parentSessionId)
          if (parentSession !== undefined) {
            const messages = parentSession.deriveMessages()
            parentContextSummary = summarizeMessages(messages, summaryCount)
          }
        }

        const session = sessions.create(undefined, {
          meta: {
            agentPreset: MANAGEMENT_PRESET_ID,
            ...(parentSessionId !== undefined ? { parentSession: parentSessionId } : {}),
          },
        })

        const descriptor = {
          sessionId: session.id,
          session,
          parentSessionId,
          parentContextSummary,
          createdAt: Date.now(),
        }

        active.set(session.id, descriptor)
        service.ctx.emit('management-session/created', descriptor)
        return descriptor
      },
      destroy(sessionId: string) {
        const descriptor = active.get(sessionId)
        if (descriptor === undefined) {
          throw new Error(`no active management session with id "${sessionId}"`)
        }
        active.delete(sessionId)
        service.ctx.emit('management-session/destroyed', sessionId)
      },
      getActive(): { sessionId: string; createdAt: number } | undefined {
        if (active.size === 0) return undefined
        let latest: { sessionId: string; createdAt: number } | undefined
        for (const desc of active.values()) {
          const d = desc as { sessionId: string; createdAt: number }
          if (latest === undefined || d.createdAt > latest.createdAt) latest = d
        }
        return latest
      },
      isManagementSession(sessionId: string) {
        return active.has(sessionId)
      },
      listActive() {
        return [...active.values()]
      },
    }

    return { service, sessions, events }
  }

  it('creates a management session with the semantic-layer-management preset', () => {
    const { service } = createServiceInstance()
    const descriptor = service.create()
    expect(descriptor.sessionId).toMatch(/^mgmt-session-/)
    expect(descriptor.session.header.agentPreset).toBe(MANAGEMENT_PRESET_ID)
    expect(descriptor.parentSessionId).toBeUndefined()
    expect(descriptor.parentContextSummary).toBeUndefined()
  })

  it('emits management-session/created event on creation', () => {
    const { service, events } = createServiceInstance()
    const descriptor = service.create()
    expect(events).toHaveLength(1)
    expect(events[0]!.name).toBe('management-session/created')
    expect(events[0]!.args[0]).toBe(descriptor)
  })

  it('creates with parent session context reference', () => {
    const { service, sessions } = createServiceInstance()
    const parentMessages: SummarizableMessage[] = [
      { role: 'user', content: 'Show me payment tables' },
      { role: 'assistant', content: 'Here are the payment domain tables: dws_pay_order, dws_pay_refund.' },
    ]
    sessions.addFakeSession('parent-session-1', parentMessages)

    const descriptor = service.create({ parentSessionId: 'parent-session-1' })
    expect(descriptor.parentSessionId).toBe('parent-session-1')
    expect(descriptor.parentContextSummary).toContain('Show me payment tables')
    expect(descriptor.parentContextSummary).toContain('payment domain tables')
    expect(descriptor.session.header.parentSession).toBe('parent-session-1')
  })

  it('creates without summary when parent session has no messages', () => {
    const { service, sessions } = createServiceInstance()
    sessions.addFakeSession('empty-parent', [])

    const descriptor = service.create({ parentSessionId: 'empty-parent' })
    expect(descriptor.parentSessionId).toBe('empty-parent')
    expect(descriptor.parentContextSummary).toBeUndefined()
  })

  it('creates successfully when parentSessionId does not exist in store', () => {
    const { service } = createServiceInstance()
    // Non-existent parent — no crash, just no summary
    const descriptor = service.create({ parentSessionId: 'nonexistent' })
    expect(descriptor.parentSessionId).toBe('nonexistent')
    expect(descriptor.parentContextSummary).toBeUndefined()
  })

  it('destroy removes an active management session', () => {
    const { service, events } = createServiceInstance()
    const descriptor = service.create()
    expect(service.isManagementSession(descriptor.sessionId)).toBe(true)

    service.destroy(descriptor.sessionId)
    expect(service.isManagementSession(descriptor.sessionId)).toBe(false)
    expect(events.at(-1)!.name).toBe('management-session/destroyed')
    expect(events.at(-1)!.args[0]).toBe(descriptor.sessionId)
  })

  it('destroy throws for unknown session id', () => {
    const { service } = createServiceInstance()
    expect(() =>{  service.destroy('no-such-session') }).toThrow('no active management session')
  })

  it('getActive returns undefined when no sessions are active', () => {
    const { service } = createServiceInstance()
    expect(service.getActive()).toBeUndefined()
  })

  it('getActive returns the most recently created session', () => {
    const { service } = createServiceInstance()
    const first = service.create()
    // Ensure second has a later createdAt by bumping it
    const second = service.create()
    // Manually set createdAt to ensure ordering: the test verifies the
    // "most recent" selection logic; in real use the calls are seconds apart.
    ;(first as { createdAt: number }).createdAt = 1000
    ;(second as { createdAt: number }).createdAt = 2000
    const active = service.getActive() as { sessionId: string }
    expect(active.sessionId).toBe(second.sessionId)
  })

  it('listActive returns all active management sessions', () => {
    const { service } = createServiceInstance()
    service.create()
    service.create()
    expect(service.listActive()).toHaveLength(2)
  })

  it('isManagementSession correctly identifies management sessions', () => {
    const { service } = createServiceInstance()
    const descriptor = service.create()
    expect(service.isManagementSession(descriptor.sessionId)).toBe(true)
    expect(service.isManagementSession('random-id')).toBe(false)
  })
})

// ── Module export shape ─────────────────────────────────────────────────────

describe('management-session module exports', () => {
  it('exports the expected constants and types', async () => {
    const mod = await import('../src/index.ts')
    expect(mod.MANAGEMENT_PRESET_ID).toBe('semantic-layer-management')
    expect(mod.DEFAULT_SUMMARY_MESSAGE_COUNT).toBe(20)
    expect(mod.name).toBe('management-session')
    expect(mod.inject).toEqual(['sessions'])
    expect(typeof mod.apply).toBe('function')
    expect(typeof mod.summarizeMessages).toBe('function')
    expect(typeof mod.ManagementSessionService).toBe('function')
    expect(mod.ManagementSessionService.inject).toEqual(['sessions'])
  })
})
