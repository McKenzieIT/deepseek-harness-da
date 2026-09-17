/** Stage 0 tests for Session evidence extraction. */

import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { observeSession } from '../src/session-observer.ts'

function event(type: string, seq: number, data: unknown): SessionEvent {
  return { type, seq, time: seq * 10, data } as SessionEvent
}

function assistant(seq: number, text: string, usage?: Record<string, number>): SessionEvent {
  return event('assistant/message', seq, {
    turn: 1,
    step: seq,
    message: { id: `m${seq}`, role: 'assistant', source: { kind: 'model', provider: 'aga', model: 'qwen' }, content: [{ type: 'text', text }] },
    stream: [],
    ...(usage === undefined ? {} : { usage }),
  })
}

function call(seq: number, callId: string, name: string, args: unknown): SessionEvent {
  return event('tool/call', seq, { turn: 1, step: seq, callId, name, arguments: JSON.stringify(args) })
}

function result(seq: number, callId: string, text: string, isError = false): SessionEvent {
  return event('tool/result', seq, {
    turn: 1,
    step: seq,
    message: {
      id: `m${seq}`,
      role: 'user',
      source: { kind: 'tool' },
      content: [{ type: 'tool-result', toolCallId: callId, isError, content: [{ type: 'text', text }] }],
    },
  })
}

describe('observeSession', () => {
  it('pairs tool calls with outcomes and extracts final answer, clarification, usage, and query evidence', () => {
    const observed = observeSession([
      event('request/header', 0, { header: { config: { provider: 'aga', model: 'qwen' }, tools: [{ name: 'query_data' }, { name: 'present_clarification' }] }, reason: 'initial' }),
      event('user/message', 0, { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'TASK WORKING SET' }] }),
      call(1, 'clarify', 'present_clarification', { question: '账号还是角色口径？' }),
      result(2, 'clarify', '已向用户请求澄清'),
      assistant(3, '中间答复', { inputTokens: 10, outputTokens: 2, cacheReadTokens: 5, reasoningTokens: 1 }),
      call(4, 'q1', 'query_data', { sql: "SELECT COUNT(*) AS dau FROM t WHERE ds='20260805'", scope_id: '10000251' }),
      result(5, 'q1', 'dau\n4563\n(1 row)'),
      assistant(6, '昨天日活跃角色数为 4563。', { inputTokens: 20, outputTokens: 4, cacheReadTokens: 7, reasoningTokens: 2 }),
    ], 1234)

    expect(observed.firstUserText).toBe('TASK WORKING SET')
    expect(observed.toolNames).toEqual(['present_clarification', 'query_data'])
    expect(observed.finalAnswer).toBe('昨天日活跃角色数为 4563。')
    expect(observed.modelCalls).toBe(2)
    expect(observed.usage).toEqual({
      uncachedInputTokens: 30,
      cacheReadTokens: 12,
      cacheWriteTokens: 0,
      outputTokens: 6,
      reasoningTokens: 3,
    })
    expect(observed.clarifications).toEqual(['账号还是角色口径？'])
    expect(observed.queryAttempts).toEqual([expect.objectContaining({
      sql: "SELECT COUNT(*) AS dau FROM t WHERE ds='20260805'",
      state: 'completed',
      columns: ['dau'],
      rows: [['4563']],
      rowCount: 1,
    })])
    expect(observed.wallClockMs).toBe(1234)
  })

  it('classifies failed and pending query results without treating them as success', () => {
    const observed = observeSession([
      event('request/header', 0, { header: { config: { provider: 'aga', model: 'qwen' }, tools: [{ name: 'query_data' }, { name: 'present_clarification' }] }, reason: 'initial' }),
      event('user/message', 0, { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'TASK WORKING SET' }] }),
      call(1, 'q1', 'query_data', { sql: 'SELECT 1', scope_id: '10000251' }),
      result(2, 'q1', 'Query failed (transport): connection reset'),
      call(3, 'q2', 'query_data', { sql: 'SELECT 2', scope_id: '10000251' }),
      result(4, 'q2', 'Query still running; instance i-1. Poll budget exhausted; the instance is still pending.'),
    ], 50)

    expect(observed.queryAttempts.map(query => query.state)).toEqual(['failed', 'pending'])
    expect(observed.queryAttempts[0]).toMatchObject({ failureKind: 'transport', errorText: 'connection reset' })
    expect(observed.successfulQueries).toBe(0)
  })

  it('counts failed assistant attempts and reads their final usage sample', () => {
    const observed = observeSession([
      event('assistant/attempt', 1, {
        turn: 1,
        step: 1,
        stream: [{ type: 'chunk', time: 10, chunk: { type: 'usage', usage: { inputTokens: 7, outputTokens: 0 } } }],
      }),
      assistant(2, '已完成。', { inputTokens: 9, outputTokens: 3 }),
    ], 10)

    expect(observed.modelCalls).toBe(2)
    expect(observed.usage.uncachedInputTokens).toBe(16)
    expect(observed.usage.outputTokens).toBe(3)
  })
})
