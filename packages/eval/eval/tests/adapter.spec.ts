import { describe, expect, it } from 'vitest'
import { buildAgentResponder, extractReply, ProtocolError, validateRunResult } from '../src/adapter.ts'
import type { AgentTurnRequest } from '../src/types.ts'
import { StubHarness, assistantMessage, runResult, runResultDerailing, toolCall } from './helpers.ts'

const req = (message: string): AgentTurnRequest => ({ sessionId: 'sid', caseId: 'c', scopeId: null, turnIndex: 0, message })

describe('validateRunResult (H1 mitigation)', () => {
  it('passes when the interval has exactly one assistant/message', () => {
    expect(() => validateRunResult(runResult('hi'))).not.toThrow()
  })
  it('throws ProtocolError when the interval has no assistant/message', () => {
    expect(() => validateRunResult({ finalResponse: '', events: [toolCall('q', {})], notifications: [] })).toThrow(ProtocolError)
  })
  it('throws ProtocolError on a derailing interval (≥2 assistant/message)', () => {
    expect(() => validateRunResult(runResultDerailing('a', 'b'))).toThrow(ProtocolError)
  })
})

describe('extractReply', () => {
  it('reply = finalResponse; generatedSql from data.arguments.sql', () => {
    expect(extractReply(runResult('reply', { sql: 'SELECT 1' }))).toEqual({ reply: 'reply', generatedSql: 'SELECT 1', generatedBehavior: null })
  })
  it('generatedSql from data.sql directly', () => {
    expect(extractReply({ finalResponse: 'r', events: [{ type: 'tool/call', data: { sql: 'SELECT 2' } }, assistantMessage('r')], notifications: [] }).generatedSql).toBe('SELECT 2')
  })
  it('generatedSql from data.generated_sql', () => {
    expect(extractReply({ finalResponse: 'r', events: [{ type: 'tool/call', data: { generated_sql: 'SELECT 3' } }, assistantMessage('r')], notifications: [] }).generatedSql).toBe('SELECT 3')
  })
  it('generatedSql null when no tool/call carries SQL', () => {
    expect(extractReply(runResult('reply')).generatedSql).toBeNull()
  })
  it('reply is the empty string when finalResponse is empty', () => {
    expect(extractReply(runResult('')).reply).toBe('')
  })
  it('a derailing interval throws (H1)', () => {
    expect(() => extractReply(runResultDerailing('a', 'b'))).toThrow(ProtocolError)
  })
  it('generatedSql null when a tool/call carries no SQL keys', () => {
    expect(extractReply({ finalResponse: 'r', events: [{ type: 'tool/call', data: { arguments: { notSql: 1 } } }, assistantMessage('r')], notifications: [] }).generatedSql).toBeNull()
  })
  it('generatedSql null when a tool/call has null data', () => {
    expect(extractReply({ finalResponse: 'r', events: [{ type: 'tool/call', data: null }, assistantMessage('r')], notifications: [] }).generatedSql).toBeNull()
  })
  it('generatedSql null when a tool/call has no data field', () => {
    expect(extractReply({ finalResponse: 'r', events: [{ type: 'tool/call' }, assistantMessage('r')], notifications: [] }).generatedSql).toBeNull()
  })
  it('generatedSql null when data.arguments is null', () => {
    expect(extractReply({ finalResponse: 'r', events: [{ type: 'tool/call', data: { arguments: null } }, assistantMessage('r')], notifications: [] }).generatedSql).toBeNull()
  })
  it('uses the first tool/call with SQL when multiple tool/call events exist (skips the rest)', () => {
    const r = extractReply({ finalResponse: 'r', events: [{ type: 'tool/call', data: { sql: 'SELECT 1' } }, { type: 'tool/call', data: { sql: 'SELECT 2' } }, assistantMessage('r')], notifications: [] })
    expect(r.generatedSql).toBe('SELECT 1')
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
})
