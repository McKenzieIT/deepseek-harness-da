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
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { PromptAssembly } from '@deepseek-ai/dsh-system-prompt'
import type { AssembleContext } from '@deepseek-ai/dsh-system-prompt'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhaseGate } from '../src/phase-gate.ts'
import { Phase, INCOMPLETE_MARKER, PipelineConfig } from '../src/types.ts'

function makeAgent(id: string): { agent: Agent; injected: UserMessage[]; cancelled: AgentCancelCause[] } {
  const injected: UserMessage[] = []
  const cancelled: AgentCancelCause[] = []
  const agent = {
    id,
    inject: (m: UserMessage) => { injected.push(m) },
    cancel: (c: AgentCancelCause) => { cancelled.push(c) },
    session: { id, events: [] },
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

describe('PhaseGate control flow (7 hooks, side-effect based)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('guard: in-phase allow; out-of-phase reject', () => {
    const { agent } = makeAgent('s1')
    const g = gate()
    expect(g.guard(execView('search_data_sources', agent))).toBeUndefined() // ∈ UNDERSTANDING
    expect(g.guard(execView('query_data', agent))).toMatch(/not in understanding whitelist/) // ∉ UNDERSTANDING
  })

  it('guard: load_* allowed in GENERATION (schema grounding before SQL)', () => {
    const { agent } = makeAgent('s2')
    const g = gate()
    const s = g.state('s2')
    s.current_phase = Phase.GENERATION
    // MAJOR-1: load_table/load_event are schema-grounding reads; GENERATION
    // writes SQL from semantic-layer-grounded fields, so the definitions are
    // whitelisted there too (not UNDERSTANDING-only). search_data_sources stays
    // UNDERSTANDING-only (candidate discovery is an UNDERSTANDING concern).
    expect(g.guard(execView('load_table_definition', agent))).toBeUndefined()
    expect(g.guard(execView('load_event_definition', agent))).toBeUndefined()
    expect(g.guard(execView('search_data_sources', agent))).toMatch(/not in generation whitelist/)
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
    // B2: real AssembleContext shape — assembleContextFor returns {agent, scope:agent}
    // (scope IS the agent, no .agent). The old stub {scope:{agent:{id}}} fed the buggy
    // readAgentId (context.scope.agent.id) and masked that real scope has no .agent.
    const ctx = { agent: { id: 's1' }, scope: { id: 's1' } } as unknown as AssembleContext
    const stubAssembly: PromptAssembly = { sections: [], contexts: [], tools: [], variables: {} }
    const out = await g.onAssemble(
      stubAssembly,
      ctx,
      () => Promise.resolve(stubAssembly),
    )
    const names = out.sections.map((x: { name?: string }) => x.name)
    expect(names).toContain('phase-instruction')
    expect(names).toContain('sql-conventions')
  })

  it('B1: onTurnStopping captures phase_output from agent.session.events latest assistant/message (no manual set)', async () => {
    const sql = '```sql\nSELECT a FROM dws_pay WHERE ds=20260101\n```'
    const injected: UserMessage[] = []
    const agent = {
      id: 's1',
      inject: (m: UserMessage) => { injected.push(m) },
      cancel: () => {},
      session: { id: 's1', events: [{ type: 'assistant/message', seq: 1, time: 0, data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: sql }] } } }] },
    } as unknown as Agent
    const g = gate()
    const s = g.state('s1')
    s.current_phase = Phase.GENERATION
    s.candidate_tables.add('dws_pay')
    s.partition_cols.add('ds')
    // B1: do NOT manually set s.phase_output — onTurnStopping must capture it
    // from agent.session.events. last_sql is the stable observable: the critic
    // sets it only if phase_output was captured (phase_output itself is reset on
    // retry/advance, so asserting it directly is fragile).
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.last_sql).toBe('SELECT a FROM dws_pay WHERE ds=20260101')
  })

  it('F3 stall watchdog: stall_watchdog_seconds with no events → honest_decline + cancel', async () => {
    const { agent, cancelled } = makeAgent('s1')
    const g = new PhaseGate({ logger: { info: () => undefined } } as unknown as Context, { stall_watchdog_seconds: 300 })
    const s = g.state('s1')
    // arm the stall timer (touchStallTimer runs in onPreStep / onTurnStopping)
    await g.onPreStep(
      { agent, messages: [], turn: 1, step: 1, signal: new AbortController().signal },
      () => Promise.resolve({ kind: 'enter', messages: [] }),
    )
    expect(s.stall_timer).not.toBeNull()
    // advance fake timers past the watchdog — fires honest_decline + agent.cancel
    vi.advanceTimersByTime(300 * 1000 + 1)
    expect(s.honest_decline_reason).toMatch(/stall/)
    expect(s.current_phase).toBe('DECLINED')
    expect(cancelled).toHaveLength(1)
  })

  it('EXECUTION 3-state: done→advance to INTERPRETATION; running→inject poll, stay EXECUTION (D5)', async () => {
    const { agent, injected } = makeAgent('s1')
    const g = gate()
    const s = g.state('s1')
    // done → advance to INTERPRETATION
    s.current_phase = Phase.EXECUTION
    s.phase_idx = 2 // EXECUTION index in PHASE_ORDER so advance lands on INTERPRETATION
    s.last_query_outcome = 'done'
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.INTERPRETATION)
    // running → inject a poll reminder, stay EXECUTION
    s.current_phase = Phase.EXECUTION
    s.last_query_outcome = 'running'
    const before = injected.length
    await g.onTurnStopping({ agent, turn: 2, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.EXECUTION)
    expect(injected.length).toBe(before + 1)
  })

  it('B9/F4: DECLINED resets on a new user question (idle→running → resetQuestionScoped)', () => {
    const { agent } = makeAgent('s1')
    const g = gate()
    const s = g.state('s1')
    s.current_phase = 'DECLINED'
    s.honest_decline_reason = 'prev decline'
    s.prior_status = 'idle' // agent went idle after the decline (kick ended)
    g.onStatus({ agent, status: 'running' }) // new user message wakes the driver
    expect(s.current_phase).toBe(Phase.UNDERSTANDING)
    expect(s.honest_decline_reason).toBeNull()
  })
})

describe('onRequest — per-phase reasoning effort (D7) + no-effort skip', () => {
  // A Context whose ctx.llm.resolveModelInfo reports a model with the given
  // reasoning metadata: 'efforts' = effort-capable; 'none' = no per-request
  // thinking knob (e.g., aga — native AGA, thinking is model-bound).
  function gateWithLlm(reasoning: 'efforts' | 'none'): PhaseGate {
    const resolveModelInfo = async (provider: string, model: string) => ({
      provider,
      id: model,
      name: model,
      inputModalities: ['text' as const],
      ...(reasoning === 'efforts'
        ? { reasoning: { efforts: [{ id: 'high' }, { id: 'medium' }], defaultEffort: 'medium' } }
        : {}),
    })
    const ctx = {
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      llm: { resolveModelInfo },
    } as unknown as Context
    return new PhaseGate(ctx, { stall_watchdog_seconds: 9999 })
  }

  it('sets per-phase reasoningEffort for a model that exposes efforts (UNDERSTANDING -> high)', async () => {
    const { agent } = makeAgent('e1')
    const g = gateWithLlm('efforts')
    const result = await g.onRequest(
      { agent, turn: 1, step: 1, signal: new AbortController().signal },
      async () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash', messages: [] }) as Promise<GenerateOptions>,
    )
    expect(result.reasoningEffort).toBe('high')
  })

  it('skips reasoningEffort for a model that exposes NO efforts (aga — model-bound thinking; registry would reject)', async () => {
    const { agent } = makeAgent('e2')
    const g = gateWithLlm('none')
    const result = await g.onRequest(
      { agent, turn: 1, step: 1, signal: new AbortController().signal },
      async () => ({ provider: 'aga', model: 'qwen3.7-max', messages: [] }) as Promise<GenerateOptions>,
    )
    expect(result.reasoningEffort).toBeUndefined()
  })

  it('caches the reasoning-support lookup (one resolveModelInfo call per provider:model)', async () => {
    const { agent } = makeAgent('e3')
    let calls = 0
    const ctx = {
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      llm: {
        resolveModelInfo: async (provider: string, model: string) => {
          calls++
          return { provider, id: model, name: model, inputModalities: ['text' as const] }
        },
      },
    } as unknown as Context
    const g = new PhaseGate(ctx, { stall_watchdog_seconds: 9999 })
    const signal = new AbortController().signal
    const next = async () => ({ provider: 'aga', model: 'qwen3.7-max', messages: [] }) as Promise<GenerateOptions>
    await g.onRequest({ agent, turn: 1, step: 1, signal }, next)
    await g.onRequest({ agent, turn: 2, step: 1, signal }, next)
    expect(calls).toBe(1)
  })
})
