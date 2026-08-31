import { describe, expect, it } from 'vitest'
import { buildAgentResponder, extractReply, ProtocolError, validateRunResult } from '../src/adapter.ts'
import type { AgentTurnRequest } from '../src/types.ts'
import { StubHarness, assistantMessage, runResult, runResultMultiStep, toolCall } from './helpers.ts'

const req = (message: string): AgentTurnRequest => ({ sessionId: 'sid', caseId: 'c', scopeId: null, turnIndex: 0, message })

describe('validateRunResult (H1 mitigation — relaxed for multi-step agents)', () => {
  it('passes when the interval has exactly one assistant/message', () => {
    expect(() => validateRunResult(runResult('hi'))).not.toThrow()
  })
  it('passes when the interval has multiple assistant/message (four-stage agent)', () => {
    expect(() => validateRunResult(runResultMultiStep(['step1', 'step2', 'step3', 'final']))).not.toThrow()
  })
  it('throws ProtocolError when the interval has no assistant/message', () => {
    expect(() => validateRunResult({ finalResponse: '', events: [toolCall('q', {})], notifications: [] })).toThrow(ProtocolError)
  })
  it('throws ProtocolError on an empty events array', () => {
    expect(() => validateRunResult({ finalResponse: '', events: [], notifications: [] })).toThrow(ProtocolError)
  })
})

describe('extractReply', () => {
  it('reply = finalResponse; generatedSql from data.arguments.sql', () => {
    expect(extractReply(runResult('reply', { sql: 'SELECT 1' }))).toEqual({ reply: 'reply', generatedSql: 'SELECT 1', generatedBehavior: null })
  })
  it('generatedSql from data.sql directly', () => {
    expect(extractReply({ finalResponse: 'r', events: [{ type: 'tool/call', data: { name: 'query_data', sql: 'SELECT 2' } }, assistantMessage('r')], notifications: [] }).generatedSql).toBe('SELECT 2')
  })
  it('generatedSql from data.generated_sql', () => {
    expect(extractReply({ finalResponse: 'r', events: [{ type: 'tool/call', data: { name: 'query_data', generated_sql: 'SELECT 3' } }, assistantMessage('r')], notifications: [] }).generatedSql).toBe('SELECT 3')
  })
  it('generatedSql null when no tool/call carries SQL', () => {
    expect(extractReply(runResult('reply')).generatedSql).toBeNull()
  })
  it('reply is the empty string when finalResponse is empty', () => {
    expect(extractReply(runResult('')).reply).toBe('')
  })
  it('multi-step interval extracts reply from finalResponse (last assistant/message)', () => {
    const r = extractReply(runResultMultiStep(['understanding...', 'generating...', 'executing...', 'final answer'], { sql: 'SELECT 42' }))
    expect(r.reply).toBe('final answer')
    expect(r.generatedSql).toBe('SELECT 42')
  })
  it('generatedSql null when a tool/call carries no SQL keys', () => {
    expect(extractReply({ finalResponse: 'r', events: [{ type: 'tool/call', data: { name: 'query_data', arguments: { notSql: 1 } } }, assistantMessage('r')], notifications: [] }).generatedSql).toBeNull()
  })
  it('generatedSql null when a tool/call has null data', () => {
    expect(extractReply({ finalResponse: 'r', events: [{ type: 'tool/call', data: null }, assistantMessage('r')], notifications: [] }).generatedSql).toBeNull()
  })
  it('generatedSql null when a tool/call has no data field', () => {
    expect(extractReply({ finalResponse: 'r', events: [{ type: 'tool/call' }, assistantMessage('r')], notifications: [] }).generatedSql).toBeNull()
  })
  it('generatedSql null when data.arguments is null', () => {
    expect(extractReply({ finalResponse: 'r', events: [{ type: 'tool/call', data: { name: 'query_data', arguments: null } }, assistantMessage('r')], notifications: [] }).generatedSql).toBeNull()
  })

  describe('query_data tool filtering (last-one-wins)', () => {
    it('takes the LAST query_data tool/call SQL when multiple exist', () => {
      const r = extractReply({
        finalResponse: 'r',
        events: [
          { type: 'tool/call', data: { name: 'query_data', arguments: { sql: 'SELECT 1' } } },
          { type: 'tool/call', data: { name: 'query_data', arguments: { sql: 'SELECT 2' } } },
          assistantMessage('r'),
        ],
        notifications: [],
      })
      expect(r.generatedSql).toBe('SELECT 2')
    })
    it('ignores non-query_data tool/calls (e.g. critique_sql)', () => {
      const r = extractReply({
        finalResponse: 'r',
        events: [
          { type: 'tool/call', data: { name: 'critique_sql', arguments: { sql: 'SELECT bad' } } },
          { type: 'tool/call', data: { name: 'query_data', arguments: { sql: 'SELECT good' } } },
          assistantMessage('r'),
        ],
        notifications: [],
      })
      expect(r.generatedSql).toBe('SELECT good')
    })
    it('ignores non-query_data tools even when they appear after query_data', () => {
      const r = extractReply({
        finalResponse: 'r',
        events: [
          { type: 'tool/call', data: { name: 'query_data', arguments: { sql: 'SELECT real' } } },
          { type: 'tool/call', data: { name: 'validate_sql', arguments: { sql: 'SELECT validate' } } },
          assistantMessage('r'),
        ],
        notifications: [],
      })
      expect(r.generatedSql).toBe('SELECT real')
    })
    it('falls through to accepting unnamed tool/calls (backward compat)', () => {
      const r = extractReply({
        finalResponse: 'r',
        events: [
          { type: 'tool/call', data: { arguments: { sql: 'SELECT unnamed' } } },
          assistantMessage('r'),
        ],
        notifications: [],
      })
      expect(r.generatedSql).toBe('SELECT unnamed')
    })
    it('four-stage agent: multiple assistant/message + multiple tool/calls picks last query_data', () => {
      const r = extractReply({
        finalResponse: 'interpretation done',
        events: [
          assistantMessage('understanding...'),
          { type: 'tool/call', data: { name: 'critique_sql', arguments: { sql: 'SELECT draft' } } },
          assistantMessage('generation...'),
          { type: 'tool/call', data: { name: 'query_data', arguments: { sql: 'SELECT final_query' } } },
          assistantMessage('execution...'),
          assistantMessage('interpretation done'),
        ],
        notifications: [],
      })
      expect(r.reply).toBe('interpretation done')
      expect(r.generatedSql).toBe('SELECT final_query')
    })
  })
})

describe('buildAgentResponder', () => {
  it('wraps a harness.run(message, sessionId) → extractReply', async () => {
    const harness = new StubHarness({ script: () => runResult('reply', { sql: 'SELECT 1' }) })
    const responder = buildAgentResponder(harness)
    const reply = await responder(req('msg'))
    expect(reply.reply).toBe('reply')
    expect(reply.generatedSql).toBe('SELECT 1')
  })
  it('works with multi-step agent responses', async () => {
    const harness = new StubHarness({ script: () => runResultMultiStep(['step1', 'step2', 'final'], { sql: 'SELECT multi' }) })
    const responder = buildAgentResponder(harness)
    const reply = await responder(req('msg'))
    expect(reply.reply).toBe('final')
    expect(reply.generatedSql).toBe('SELECT multi')
  })
})
