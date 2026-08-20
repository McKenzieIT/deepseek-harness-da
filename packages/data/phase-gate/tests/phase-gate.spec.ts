/**
 * Phase-gate scenario tests — ports the P7 prototype's 8 validated scenarios
 * to the real `packages/data/phase-gate/` package, exercising the 7-hook
 * control flow (side-effect based) + the folded P13 critic. The hook methods
 * are called directly with stub agents/execs (mirror `packages/data/audit/tests`:
 * exercise the service methods, not a full Cordis mount).
 * @module @deepseek-ai/dsh-phase-gate/tests
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentCancelCause } from '@deepseek-ai/dsh-agent'
import type { ToolExecution, ToolExecutionResult, PromptAssembly } from '@deepseek-ai/dsh-tools'
import type { AssembleContext } from '@deepseek-ai/dsh-system-prompt'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhaseGate } from '../src/phase-gate.ts'
import { Phase, freshPhaseGateState, INCOMPLETE_MARKER, PipelineConfig } from '../src/types.ts'
import { critiqueSql, extractSqlCandidate, sqlSyntaxGate } from '../src/critic.ts'

function makeAgent(id: string): { agent: Agent; injected: UserMessage[]; cancelled: AgentCancelCause[] } {
  const injected: UserMessage[] = []
  const cancelled: AgentCancelCause[] = []
  const agent = {
    id,
    inject: (m: UserMessage) => { injected.push(m) },
    cancel: (c: AgentCancelCause) => { cancelled.push(c) },
    session: { id },
  } as unknown as Agent
  return { agent, injected, cancelled }
}

function execView(name: string, agent: Agent, args?: unknown): ToolExecution {
  return { callId: 'c', name, arguments: args ?? {}, signal: new AbortController().signal, agent } as unknown as ToolExecution
}
function resultOk(value: unknown): ToolExecutionResult {
  return { isError: false, value, content: [] } as unknown as ToolExecutionResult
}
function gate(ctx: Context = { logger: { info: () => undefined } } as unknown as Context): PhaseGate {
  return new PhaseGate(ctx, { stall_watchdog_seconds: 9999 })
}

describe('critic (P13 form: regex + JSON path, no sqlglot)', () => {
  it('extractSqlCandidate: fenced sql / bare select / none', () => {
    expect(extractSqlCandidate('```sql\nSELECT 1\n```')).toBe('SELECT 1')
    expect(extractSqlCandidate('SELECT a FROM b')).toBe('SELECT a FROM b')
    expect(extractSqlCandidate('no sql here')).toBeNull()
  })
  it('table ∉ candidates → error → fail', () => {
    const r = critiqueSql('SELECT a FROM phantom', { candidateTables: new Set(['real']), eventParams: new Set(), partitionCols: new Set() })
    expect(r.passed).toBe(false)
    expect(r.findings.some(f => f.rule === 'table_not_in_candidates')).toBe(true)
  })
  it('table ∈ candidates + ds partition → pass', () => {
    const r = critiqueSql("SELECT a FROM dws_pay WHERE ds='20260101'", { candidateTables: new Set(['dws_pay']), eventParams: new Set(), partitionCols: new Set(['ds']) })
    expect(r.passed).toBe(true)
  })
  it('GET_JSON_OBJECT field ∉ params → error → fail', () => {
    const r = critiqueSql("SELECT GET_JSON_OBJECT(x, '$.user.bad') FROM t WHERE ds='1'", { candidateTables: new Set(['t']), eventParams: new Set(['good']), partitionCols: new Set(['ds']) })
    expect(r.passed).toBe(false)
    expect(r.findings.some(f => f.rule === 'json_field_not_in_params')).toBe(true)
  })
  it('SELECT * → warning → pass+reason; no-sql → fail-open', () => {
    const r = critiqueSql("SELECT * FROM t WHERE ds='1'", { candidateTables: new Set(['t']), eventParams: new Set(), partitionCols: new Set(['ds']) })
    expect(r.passed).toBe(true)
    expect(r.reason).toContain('select_star')
    expect(critiqueSql(null, { candidateTables: new Set(), eventParams: new Set(), partitionCols: new Set() }).passed).toBe(true)
  })
  it('sqlSyntaxGate sets last_sql for F2 same-source', () => {
    const s = freshPhaseGateState()
    sqlSyntaxGate("```sql\nSELECT a FROM t WHERE ds='1'\n```", s)
    expect(s.last_sql).not.toBeNull()
  })
})

describe('PhaseGate control flow (7 hooks, side-effect based)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('guard: in-phase allow; out-of-phase reject', () => {
    const { agent } = makeAgent('s1')
    const g = gate()
    expect(g.guard(execView('search_data_sources', agent))).toBeUndefined() // ∈ UNDERSTANDING
    expect(g.guard(execView('query_data', agent))).toMatch(/not in understanding whitelist/) // ∉ UNDERSTANDING
  })

  it('turn-stopping advances UNDERSTANDING→GENERATION + injects continuation', async () => {
    const { agent, injected } = makeAgent('s1')
    const g = gate()
    const s = g.state('s1')
    s.candidate_tables.add('x') // skip forced_load
    s.phase_output = 'I understand the question'
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.GENERATION)
    expect(injected).toHaveLength(1)
    expect(injected[0]!.content).toBeDefined()
  })

  it('F1 forced_load: UNDERSTANDING with no candidates calls ctx.tools.execute through guard', async () => {
    const { agent } = makeAgent('s1')
    const execute = vi.fn().mockResolvedValue(resultOk({ tables: ['dws_pay_order_di'] }))
    const g = gate({ tools: { execute } } as unknown as Context)
    g.state('s1').phase_output = 'understanding'
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0]![0]).toMatchObject({ name: 'search_data_sources' })
  })

  it('GENERATION gate fail → retry inject (phase_attempts++)', async () => {
    const { agent, injected } = makeAgent('s1')
    const g = gate()
    const s = g.state('s1')
    s.current_phase = Phase.GENERATION
    s.candidate_tables.add('real')
    s.phase_output = "```sql\nSELECT a FROM phantom WHERE ds='1'\n```" // table ∉ candidates → critic fail
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.GENERATION) // still GENERATION (retry)
    expect(s.phase_attempts).toBe(1)
    expect(injected).toHaveLength(1) // correction
  })

  it('budget max_state_turns → honest_decline (M4: decline not cancel)', async () => {
    const { agent, injected } = makeAgent('s1')
    const g = gate()
    const s = g.state('s1')
    s.turn_count = PipelineConfig.max_state_turns
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe('DECLINED')
    expect(s.honest_decline_reason).toMatch(/max_state_turns/)
    expect(injected).toHaveLength(0) // no inject — kick ends
  })

  it('EXECUTION failed → fallback to GENERATION (3-state, D5/H1)', async () => {
    const { agent, injected } = makeAgent('s1')
    const g = gate()
    const s = g.state('s1')
    s.current_phase = Phase.EXECUTION
    s.last_query_outcome = 'failed'
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.GENERATION)
    expect(s.fallback_count).toBe(1)
    expect(injected).toHaveLength(1) // fallback continuation
  })

  it('INTERPRETATION 【未完成】 declaration → honest_decline (M3)', async () => {
    const { agent } = makeAgent('s1')
    const g = gate()
    const s = g.state('s1')
    s.current_phase = Phase.INTERPRETATION
    s.phase_output = `cannot answer ${INCOMPLETE_MARKER}`
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe('DECLINED')
    expect(s.honest_decline_reason).toMatch(/INCOMPLETE/)
  })

  it('F2 same-source: query_data sql ≠ critiqued last_sql → post-execute block', async () => {
    const { agent } = makeAgent('s1')
    const g = gate()
    const s = g.state('s1')
    s.last_sql = 'SELECT good FROM t'
    const decision = await g.onPostExecute(
      execView('query_data', agent, { sql: 'SELECT bad FROM t' }),
      resultOk({ outcome: 'done' }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(decision.kind).toBe('block')
    expect(s.exec_count).toBe(1) // count on post-execute
  })

  it('F4 question-start: agent/status idle→running resets question-scoped counters', () => {
    const { agent } = makeAgent('s1')
    const g = gate()
    const s = g.state('s1')
    s.current_phase = Phase.GENERATION
    s.llm_call_count = 42
    s.turn_count = 9
    s.prior_status = 'idle'
    g.onStatus({ agent, status: 'running' })
    expect(s.current_phase).toBe(Phase.UNDERSTANDING)
    expect(s.llm_call_count).toBe(0)
    expect(s.turn_count).toBe(0)
  })

  it('persona option C: assemble injects phase-instruction section (GENERATION adds sql-conventions)', async () => {
    const g = gate()
    const s = g.state('s1')
    s.current_phase = Phase.GENERATION
    const ctx = { scope: { agent: { id: 's1' } } } as unknown as AssembleContext
    const stubAssembly: PromptAssembly = { sections: [], tools: [], variables: {} }
    const out = await g.onAssemble(
      stubAssembly,
      ctx,
      () => Promise.resolve(stubAssembly),
    )
    const names = out.sections.map((x: { name?: string }) => x.name)
    expect(names).toContain('phase-instruction')
    expect(names).toContain('sql-conventions')
  })
})
