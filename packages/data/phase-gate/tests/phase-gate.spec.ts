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
import { critiqueSql } from '@deepseek-ai/dsh-nl2sql-engine'
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
    // P-DA1: the route-gate backstop reads last_search_empty (not candidate_tables)
    // as the grounding signal — search must have surfaced candidates to advance.
    s.last_search_empty = false
    s.phase_output = 'I understand the question'
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.GENERATION)
    expect(injected).toHaveLength(1)
    expect(injected[0]!.content).toBeDefined()
  })

  it('F1 forced_load: UNDERSTANDING with no candidates calls ctx.tools.execute through guard', async () => {
    const { agent } = makeAgent('s1')
    const execute = vi.fn().mockResolvedValue(resultOk({ tables: ['dws_pay_order_di'] }))
    // P-DA1: include a logger — the route-gate backstop may honest_decline when the
    // mock execute doesn't fire captureToolData (last_search_empty stays true), and
    // honestDecline calls ctx.logger.info.
    const g = gate({ logger: { info: () => undefined }, tools: { execute } } as unknown as Context)
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
    s.definition_loaded = true // GROUNDING GATE (c): grounding established → sqlSyntaxGate fails (table ∉ candidates)
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

  it('M3 #2 A: F2 relaxes ORDER BY/LIMIT (presentation, not logic) — query_data adds ORDER BY → no block', async () => {
    const { agent } = makeAgent('s1m3')
    const g = gate()
    const s = g.state('s1m3')
    s.last_sql = 'SELECT a FROM t GROUP BY ds'
    const decision = await g.onPostExecute(
      execView('query_data', agent, { sql: 'SELECT a FROM t GROUP BY ds ORDER BY ds' }),
      resultOk({ state: 'completed' }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(decision.kind).toBe('accept') // ORDER BY is presentation — not a same-source violation
  })

  it('M3 #2 A: F2 still blocks FROM/WHERE logic change', async () => {
    const { agent } = makeAgent('s1m3b')
    const g = gate()
    const s = g.state('s1m3b')
    s.last_sql = 'SELECT a FROM t1'
    const decision = await g.onPostExecute(
      execView('query_data', agent, { sql: 'SELECT a FROM t2' }), // FROM change = logic
      resultOk({ state: 'completed' }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(decision.kind).toBe('block')
  })

  it('F2 same-source: query_data sql ≠ critiqued last_sql → post-execute block', async () => {
    const { agent } = makeAgent('s1')
    const g = gate()
    const s = g.state('s1')
    s.last_sql = 'SELECT good FROM t'
    const decision = await g.onPostExecute(
      execView('query_data', agent, { sql: 'SELECT bad FROM t' }),
      resultOk({ state: 'completed' }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(decision.kind).toBe('block')
    expect(s.exec_count).toBe(1) // count on post-execute
  })

  it('(b) critique_sql_tool capture: last_critique from confidence + last_sql from sql', async () => {
    const { agent } = makeAgent('b1')
    const g = gate()
    const s = g.state('b1')
    // critique_sql_tool returns { confidence, findings, sql } — captureToolData
    // sets last_critique from confidence AND last_sql from the critiqued sql
    // (the (b) root-cause fix: re-critique a corrected SQL → last_sql updates →
    // F2 passes the corrected SQL).
    await g.onPostExecute(
      execView('critique_sql_tool', agent, { sql: 'SELECT a FROM t' }),
      resultOk({ confidence: 0.8, findings: [], sql: 'SELECT a FROM t' }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.last_critique).toBe(0.8)
    expect(s.last_sql).toBe('SELECT a FROM t')
  })

  it('(b) critique_sql_tool re-critique: last_sql UPDATES on a corrected SQL', async () => {
    const { agent } = makeAgent('b2')
    const g = gate()
    const s = g.state('b2')
    // first critique sets last_sql to the original SQL
    await g.onPostExecute(
      execView('critique_sql_tool', agent, { sql: 'SELECT a FROM bad_table' }),
      resultOk({ confidence: 0.2, findings: [{ rule: 'x', severity: 'error', message: 'm' }], sql: 'SELECT a FROM bad_table' }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.last_sql).toBe('SELECT a FROM bad_table')
    // after a TABLE_NOT_FOUND, the model corrects the SQL + RE-critiques →
    // last_sql updates to the corrected SQL → F2 passes
    await g.onPostExecute(
      execView('critique_sql_tool', agent, { sql: 'SELECT a FROM good_table' }),
      resultOk({ confidence: 0.9, findings: [], sql: 'SELECT a FROM good_table' }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.last_critique).toBe(0.9)
    expect(s.last_sql).toBe('SELECT a FROM good_table') // updated → F2 passes the corrected SQL
  })

  it('(b) evaluate_sql_quality capture: last_quality from score', async () => {
    const { agent } = makeAgent('b3')
    const g = gate()
    const s = g.state('b3')
    await g.onPostExecute(
      execView('evaluate_sql_quality', agent, { sql: 'SELECT a FROM t' }),
      resultOk({ score: 85 }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.last_quality).toBe(85)
  })

  it('harvest: load_* nested result fills partition_cols / event_params for the GENERATION critic', async () => {
    const { agent } = makeAgent('h1')
    const g = gate()
    const s = g.state('h1')
    // load_* returns { found, table|event: { partitions|params_fields, ... } }
    // NESTED (the model-facing projection). captureToolData must probe
    // value.table / value.event (not top-level value) and extract each
    // projected element's `name` leaf (substrate maps project to [{name, ...}]),
    // else the GENERATION critic's partition_cols / event_params stay empty
    // even after a successful load — weakening the ds/dt partition-filter +
    // GET_JSON_OBJECT field-path checks (non-breaking: regex/json-path still run).
    await g.onPostExecute(
      execView('load_table_definition', agent, { table_name: 'dws_pay_order_di' }),
      resultOk({ found: true, table: { table_name: 'dws_pay_order_di', partitions: [{ name: 'ds', type: 'string' }, { name: 'dt', type: 'string' }] } }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.partition_cols.has('ds')).toBe(true)
    expect(s.partition_cols.has('dt')).toBe(true)
    await g.onPostExecute(
      execView('load_event_definition', agent, { event_name: 'pay_order' }),
      resultOk({ found: true, event: { name: 'pay_order', params_fields: [{ name: 'order_id', type: 'string' }, { name: 'amount', type: 'double' }] } }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.event_params.has('order_id')).toBe(true)
    expect(s.event_params.has('amount')).toBe(true)
    // no-op coverage: found:false + isError:true results must not grow the sets.
    const beforeP = s.partition_cols.size
    const beforeE = s.event_params.size
    await g.onPostExecute(
      execView('load_table_definition', agent, { table_name: 'missing' }),
      resultOk({ found: false, message: 'not found' }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    await g.onPostExecute(
      execView('load_table_definition', agent, { table_name: 'x' }),
      { isError: true, content: [] } as unknown as ToolExecutionResult,
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.partition_cols.size).toBe(beforeP)
    expect(s.event_params.size).toBe(beforeE)
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
    s.definition_loaded = true // GROUNDING GATE (c): grounding established so extractSqlCandidate runs (last_sql is the observable)
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

  it('EXECUTION 3-state: completed→advance to INTERPRETATION; pending→inject poll, stay EXECUTION (D5)', async () => {
    const { agent, injected } = makeAgent('s1')
    const g = gate()
    const s = g.state('s1')
    // completed → advance to INTERPRETATION
    s.current_phase = Phase.EXECUTION
    s.phase_idx = 2 // EXECUTION index in PHASE_ORDER so advance lands on INTERPRETATION
    s.last_query_outcome = 'completed'
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.INTERPRETATION)
    // pending → inject a poll reminder, stay EXECUTION
    s.current_phase = Phase.EXECUTION
    s.last_query_outcome = 'pending'
    const before = injected.length
    await g.onTurnStopping({ agent, turn: 2, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.EXECUTION)
    expect(injected.length).toBe(before + 1)
  })

  it('EXECUTION state:failed from query_data → fallback to GENERATION, NOT advance to INTERPRETATION (CORR-1)', async () => {
    const { agent, injected } = makeAgent('s1')
    const g = gate()
    const s = g.state('s1')
    s.current_phase = Phase.EXECUTION
    s.phase_idx = 2
    // Simulate query_data returning { state: 'failed' } — captureToolData harvests it
    await g.onPostExecute(
      execView('query_data', agent, { sql: 'SELECT x FROM t', scope_id: 'game-1' }),
      resultOk({ state: 'failed', sql: 'SELECT x FROM t', error: 'syntax error', failureKind: 'semantic' }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.last_query_outcome).toBe('failed')
    // Now fire turn-stopping — should fallback to GENERATION, not advance to INTERPRETATION
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.GENERATION)
    expect(s.fallback_count).toBe(1)
    expect(injected.length).toBeGreaterThan(0) // fallback continuation injected
  })

  it('EXECUTION captureToolData: unknown state defaults to failed (fail-safe, CORR-1)', async () => {
    const { agent } = makeAgent('s1')
    const g = gate()
    const s = g.state('s1')
    s.current_phase = Phase.EXECUTION
    // Simulate query_data returning an unexpected/missing state field
    await g.onPostExecute(
      execView('query_data', agent, { sql: 'SELECT x FROM t', scope_id: 'game-1' }),
      resultOk({ state: 'something_unexpected', sql: 'SELECT x FROM t' }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.last_query_outcome).toBe('failed')
  })

  it('#2b: present_clarification call in EXECUTION → onTurnStopping HALTs (any-phase, not just UNDERSTANDING route:clarify)', async () => {
    const { agent, injected } = makeAgent('se1')
    const g = gate()
    const s = g.state('se1')
    s.current_phase = Phase.EXECUTION
    s.phase_idx = 2 // EXECUTION index in PHASE_ORDER
    // Simulate present_clarification post-execute — captureToolData sets
    // awaiting_clarification (the hook fires regardless of phase). Previously
    // only UNDERSTANDING route:clarify HALTed; the new any-phase HALT check
    // must catch a present_clarification called in EXECUTION too.
    await g.onPostExecute(
      execView('present_clarification', agent, { question: 'which ODPS project does dws_dau live in?' }),
      resultOk({ presented: true, question: 'which ODPS project does dws_dau live in?' }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.awaiting_clarification).toBe(true)
    // Fire turn-stopping — the any-phase HALT check returns early: no advance,
    // no fallback, no inject, no retry (the kick ends awaiting user input).
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.EXECUTION) // stayed — HALT (no advance to INTERPRETATION)
    expect(s.fallback_count).toBe(0) // no fallback (present_clarification is terminal this turn)
    expect(injected).toHaveLength(0) // no inject — kick ends awaiting user
    expect(s.phase_attempts).toBe(0) // NOT a retry
  })

  it('#2b: EXECUTION failed + failureKind=not_found → fallback GENERATION + inject self-evolution guidance', async () => {
    const { agent, injected } = makeAgent('se2')
    const g = gate()
    const s = g.state('se2')
    s.current_phase = Phase.EXECUTION
    s.phase_idx = 2
    // Simulate query_data returning failed + not_found — captureToolData
    // harvests failureKind + error (Task 2 classifyMaxcError surfaces these).
    await g.onPostExecute(
      execView('query_data', agent, { sql: 'SELECT dau FROM dws_dau WHERE ds=1', scope_id: 'game-1' }),
      resultOk({ state: 'failed', sql: 'SELECT dau FROM dws_dau WHERE ds=1', error: 'ODPS-0130131:Table not found - dws_dau', failureKind: 'not_found' }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.last_query_outcome).toBe('failed')
    expect(s.last_failure_kind).toBe('not_found')
    expect(s.last_query_error).toContain('Table not found')
    // Fire turn-stopping — executionDecision not_found branch: fallback GENERATION
    // + inject guidance steering the model through the self-evolution loop
    // (ask user project via present_clarification → update_table_config → retry).
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.GENERATION)
    expect(s.fallback_count).toBe(1)
    const guidance = injected.map(m => m.content.map(b => b.type === 'text' ? b.text : '').join('')).join('\n')
    expect(guidance).toContain('present_clarification')
    expect(guidance).toContain('update_table_config')
    expect(guidance).toContain('project')
    expect(guidance).toMatch(/not_found|TABLE_NOT_FOUND|Table not found/i)
  })

  it('#2b: guard allows present_clarification in GENERATION (UNIVERSAL spread, self-evolution)', () => {
    const { agent } = makeAgent('se3')
    const g = gate()
    const s = g.state('se3')
    s.current_phase = Phase.GENERATION
    // present_clarification is now UNIVERSAL (spreads into all 4 phase whitelists),
    // so the GENERATION guard must allow it — previously it was rejected.
    expect(g.guard(execView('present_clarification', agent, { question: 'which project?' }))).toBeUndefined()
  })

  it('M4: not_found records self_evolution_table from last_sql', async () => {
    const { agent } = makeAgent('m4a')
    const g = gate({ logger: { info: () => undefined } } as unknown as Context)
    const s = g.state('m4a')
    s.current_phase = Phase.EXECUTION
    s.phase_idx = 2
    s.candidate_tables.add('dws_dau')
    s.last_sql = 'SELECT dau FROM dws_dau WHERE ds=1'
    s.last_query_outcome = 'failed'
    s.last_failure_kind = 'not_found'
    s.last_query_error = 'Table not found - dws_dau'
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.self_evolution_table).toBe('dws_dau')
    expect(s.current_phase).toBe(Phase.GENERATION)
  })

  it('M4: EXECUTION completed + self_evolution_table → auto-calls update_table_config', async () => {
    const { agent } = makeAgent('m4b')
    const execute = vi.fn().mockResolvedValue(resultOk({ ok: true, table_name: 'dws_dau', qualified_name: 'ieu_cdm.dws_dau' }))
    const g = gate({ logger: { info: () => undefined }, tools: { execute } } as unknown as Context)
    const s = g.state('m4b')
    s.current_phase = Phase.EXECUTION
    s.phase_idx = 2
    s.self_evolution_table = 'dws_dau'
    s.last_sql = 'SELECT dau FROM ieu_cdm.dws_dau WHERE ds=1'
    s.last_query_outcome = 'completed'
    s.candidate_tables.add('dws_dau')
    s.definition_loaded = true
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0]![0]).toMatchObject({
      name: 'update_table_config',
      arguments: { table_name: 'dws_dau', project: 'ieu_cdm' },
    })
    expect(s.self_evolution_table).toBeNull()
  })

  it('M4: EXECUTION completed without self_evolution_table → no auto-call', async () => {
    const { agent } = makeAgent('m4c')
    const execute = vi.fn().mockResolvedValue(resultOk({}))
    const g = gate({ logger: { info: () => undefined }, tools: { execute } } as unknown as Context)
    const s = g.state('m4c')
    s.current_phase = Phase.EXECUTION
    s.phase_idx = 2
    s.last_sql = 'SELECT dau FROM ieu_cdm.dws_dau WHERE ds=1'
    s.last_query_outcome = 'completed'
    s.candidate_tables.add('dws_dau')
    s.definition_loaded = true
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(execute).not.toHaveBeenCalled()
  })

  it('M4: auto-persist skips silently when project not extractable from SQL', async () => {
    const { agent } = makeAgent('m4d')
    const execute = vi.fn().mockResolvedValue(resultOk({}))
    const g = gate({ logger: { info: () => undefined }, tools: { execute } } as unknown as Context)
    const s = g.state('m4d')
    s.current_phase = Phase.EXECUTION
    s.phase_idx = 2
    s.self_evolution_table = 'dws_dau'
    s.last_sql = 'SELECT dau FROM dws_dau WHERE ds=1' // bare name, no project prefix
    s.last_query_outcome = 'completed'
    s.candidate_tables.add('dws_dau')
    s.definition_loaded = true
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(execute).not.toHaveBeenCalled()
    expect(s.self_evolution_table).toBeNull()
  })

  it('M4: auto-persist fire-and-forget — tool error does not block advance', async () => {
    const { agent } = makeAgent('m4e')
    const execute = vi.fn().mockRejectedValue(new Error('RBAC reject'))
    const g = gate({ logger: { info: () => undefined }, tools: { execute } } as unknown as Context)
    const s = g.state('m4e')
    s.current_phase = Phase.EXECUTION
    s.phase_idx = 2
    s.self_evolution_table = 'dws_dau'
    s.last_sql = 'SELECT dau FROM ieu_cdm.dws_dau WHERE ds=1'
    s.last_query_outcome = 'completed'
    s.candidate_tables.add('dws_dau')
    s.definition_loaded = true
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    // advance still happens despite the error
    expect(s.current_phase).toBe(Phase.INTERPRETATION)
  })

  it('M4: resetQuestionScoped full-reset clears self_evolution_table', () => {
    const { agent } = makeAgent('m4f')
    const g = gate()
    const s = g.state('m4f')
    s.self_evolution_table = 'dws_dau'
    s.prior_status = 'idle'
    g.onStatus({ agent, status: 'running' })
    expect(s.self_evolution_table).toBeNull()
  })

  it('M4: resetQuestionScoped awaiting_clarification preserves self_evolution_table', () => {
    const { agent } = makeAgent('m4g')
    const g = gate()
    const s = g.state('m4g')
    s.self_evolution_table = 'dws_dau'
    s.awaiting_clarification = true
    s.prior_status = 'idle'
    g.onStatus({ agent, status: 'running' })
    expect(s.self_evolution_table).toBe('dws_dau')
  })

  it('M4 E2E: full self-evolution flow — not_found → clarification → reply → query success → auto-persist', async () => {
    // Simulates the full B scenario:
    // 1. EXECUTION: query_data fails with not_found
    // 2. executionDecision: fallback to GENERATION + inject + record self_evolution_table
    // 3. LLM calls present_clarification → HALT (awaiting_clarification)
    // 4. User reply ("ieu_cdm") → resetQuestionScoped preserves self_evolution_table
    // 5. LLM generates qualified SQL → critique → query_data succeeds
    // 6. executionDecision: completed → autoPersistOverride fires update_table_config
    const { agent, injected } = makeAgent('m4e2e')
    const execute = vi.fn().mockResolvedValue(resultOk({ ok: true, table_name: 'dws_10000251_univ_acc_summary_di', qualified_name: 'ieu_cdm.dws_10000251_univ_acc_summary_di' }))
    const g = gate({ logger: { info: () => undefined }, tools: { execute } } as unknown as Context)
    const s = g.state('m4e2e')

    // --- Step 1: EXECUTION phase, query fails with not_found ---
    s.current_phase = Phase.EXECUTION
    s.phase_idx = 2
    s.candidate_tables.add('dws_10000251_univ_acc_summary_di')
    s.definition_loaded = true
    s.last_sql = 'SELECT ds, dau FROM dws_10000251_univ_acc_summary_di WHERE ds >= 20260801'
    // Simulate query_data returning failed + not_found (captureToolData)
    await g.onPostExecute(
      execView('query_data', agent, { sql: s.last_sql }),
      resultOk({ state: 'failed', sql: s.last_sql, error: 'ODPS-0130131:Table not found - dws_10000251_univ_acc_summary_di', failureKind: 'not_found' }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.last_failure_kind).toBe('not_found')

    // --- Step 2: onTurnStopping → executionDecision not_found → record table + fallback ---
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.self_evolution_table).toBe('dws_10000251_univ_acc_summary_di')
    expect(s.current_phase).toBe(Phase.GENERATION)
    expect(s.fallback_count).toBe(1)
    const guidance = injected.map(m => m.content.map(b => b.type === 'text' ? b.text : '').join('')).join('\n')
    expect(guidance).toContain('update_table_config')

    // --- Step 3: LLM calls present_clarification → HALT ---
    await g.onPostExecute(
      execView('present_clarification', agent, { question: 'Which ODPS project does dws_10000251_univ_acc_summary_di live in?' }),
      resultOk({ asked: true }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.awaiting_clarification).toBe(true)

    // --- Step 4: User reply "ieu_cdm" → resetQuestionScoped (idle→running) ---
    s.prior_status = 'idle'
    g.onStatus({ agent, status: 'running' })
    expect(s.awaiting_clarification).toBe(false)
    expect(s.self_evolution_table).toBe('dws_10000251_univ_acc_summary_di') // preserved!
    expect(s.current_phase).toBe(Phase.GENERATION) // kept

    // --- Step 5: LLM generates qualified SQL, critique passes, query succeeds ---
    const qualifiedSql = 'SELECT ds, dau FROM ieu_cdm.dws_10000251_univ_acc_summary_di WHERE ds >= 20260801'
    // critique_sql_tool updates last_sql
    await g.onPostExecute(
      execView('critique_sql_tool', agent, { sql: qualifiedSql }),
      resultOk({ confidence: 0.9, sql: qualifiedSql }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.last_sql).toBe(qualifiedSql)
    // Advance to EXECUTION (simulate gate pass in GENERATION)
    s.current_phase = Phase.EXECUTION
    s.phase_idx = 2
    // query_data succeeds
    await g.onPostExecute(
      execView('query_data', agent, { sql: qualifiedSql }),
      resultOk({ state: 'completed', sql: qualifiedSql, rows: [] }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.last_query_outcome).toBe('completed')

    // --- Step 6: onTurnStopping → executionDecision completed → autoPersistOverride ---
    await g.onTurnStopping({ agent, turn: 2, signal: new AbortController().signal })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0]![0]).toMatchObject({
      name: 'update_table_config',
      arguments: { table_name: 'dws_10000251_univ_acc_summary_di', project: 'ieu_cdm' },
    })
    expect(s.self_evolution_table).toBeNull()
    // Phase advanced to INTERPRETATION (query succeeded + override persisted)
    expect(s.current_phase).toBe(Phase.INTERPRETATION)
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
      async () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash', messages: [] } as unknown as GenerateOptions),
    )
    expect(result.reasoningEffort).toBe('high')
  })

  it('skips reasoningEffort for a model that exposes NO efforts (aga — model-bound thinking; registry would reject)', async () => {
    const { agent } = makeAgent('e2')
    const g = gateWithLlm('none')
    const result = await g.onRequest(
      { agent, turn: 1, step: 1, signal: new AbortController().signal },
      async () => ({ provider: 'aga', model: 'qwen3.7-max', messages: [] } as unknown as GenerateOptions),
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
    const next = async () => ({ provider: 'aga', model: 'qwen3.7-max', messages: [] } as unknown as GenerateOptions)
    await g.onRequest({ agent, turn: 1, step: 1, signal }, next)
    await g.onRequest({ agent, turn: 2, step: 1, signal }, next)
    expect(calls).toBe(1)
  })

  it('skips reasoningEffort when resolveModelInfo rejects (transient error; not cached, re-tries)', async () => {
    const { agent } = makeAgent('e4')
    let calls = 0
    const ctx = {
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      llm: {
        resolveModelInfo: async () => { calls++; throw new Error('transient') },
      },
    } as unknown as Context
    const g = new PhaseGate(ctx, { stall_watchdog_seconds: 9999 })
    const next = async () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash', messages: [] } as unknown as GenerateOptions)
    const r1 = await g.onRequest({ agent, turn: 1, step: 1, signal: new AbortController().signal }, next)
    expect(r1.reasoningEffort).toBeUndefined()
    const r2 = await g.onRequest({ agent, turn: 2, step: 1, signal: new AbortController().signal }, next)
    expect(r2.reasoningEffort).toBeUndefined()
    expect(calls).toBe(2)
  })
})

// ── P-DA1: route-gate (UNDERSTANDING 3-state + grounding backstop) ──
// P-DA2: generation-relax (criticToolsRegistered probe) ──
// P-DA3: persona thickening (no chitchat filter — dropped) ──
import { extractRoute, ROUTE_MARKER_REGEX } from '../src/types.ts'

describe('P-DA1 route-gate (UNDERSTANDING 3-state + grounding backstop)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('extractRoute + ROUTE_MARKER_REGEX: parses proceed/clarify/decline, null when absent', () => {
    expect(extractRoute('found grounding 【route:proceed】')).toBe('proceed')
    expect(extractRoute('ambiguous 【route:clarify】')).toBe('clarify')
    expect(extractRoute('no answer 【route:decline】')).toBe('decline')
    expect(extractRoute('no token here')).toBeNull()
    expect(ROUTE_MARKER_REGEX.test('【route:proceed】')).toBe(true)
  })

  it('route proceed + grounding → advance to GENERATION', async () => {
    const { agent, injected } = makeAgent('r1')
    const g = gate()
    const s = g.state('r1')
    s.candidate_tables.add('dws_pay_order_di')
    s.last_search_empty = false
    s.phase_output = 'I found the relevant table.\n【route:proceed】'
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.GENERATION)
    expect(injected).toHaveLength(1)
  })

  it('route proceed + no grounding (search empty) → honest_decline (backstop, not bare GENERATION)', async () => {
    const { agent, injected } = makeAgent('r2')
    const g = gate() // no ctx.tools.execute → forcedLoad no-ops, last_search_empty stays true
    const s = g.state('r2')
    s.last_search_empty = true
    s.phase_output = 'I could not find candidates.\n【route:proceed】'
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe('DECLINED')
    expect(s.honest_decline_reason).toMatch(/no grounding/)
    expect(injected).toHaveLength(0) // decline — no continuation
  })

  it('route clarify → HALT (awaiting_clarification, no advance, no inject, no retry)', async () => {
    const { agent, injected } = makeAgent('r3')
    const g = gate()
    const s = g.state('r3')
    s.candidate_tables.add('x')
    s.last_search_empty = false
    s.phase_output = 'Ambiguous — two candidates match.\n【route:clarify】'
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.UNDERSTANDING) // stayed — HALT
    expect(s.awaiting_clarification).toBe(true)
    expect(injected).toHaveLength(0) // no retry inject, no advance
    expect(s.phase_attempts).toBe(0) // NOT a retry
  })

  it('route decline → honest_decline (model self-declared)', async () => {
    const { agent, injected } = makeAgent('r4')
    const g = gate()
    const s = g.state('r4')
    s.phase_output = 'No data source answers this.\n【route:decline】'
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe('DECLINED')
    expect(s.honest_decline_reason).toMatch(/route:decline/)
    expect(injected).toHaveLength(0)
  })

  it('no route token + grounding → default proceed → advance (backstop passes)', async () => {
    const { agent, injected } = makeAgent('r5')
    const g = gate()
    const s = g.state('r5')
    s.candidate_tables.add('dws_x')
    s.last_search_empty = false
    s.phase_output = 'I understand the question, proceeding.' // no token
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.GENERATION)
    expect(injected).toHaveLength(1)
  })

  it('no route token + no grounding → default proceed → backstop honest_decline', async () => {
    const { agent } = makeAgent('r6')
    const g = gate() // no ctx.tools.execute → forcedLoad no-ops
    const s = g.state('r6')
    s.last_search_empty = true
    s.phase_output = 'searching...' // no token, no grounding
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe('DECLINED')
    expect(s.honest_decline_reason).toMatch(/no grounding/)
  })

  it('collectTableNames .id: search candidates (objects) populate candidate_tables + last_search_empty=false', async () => {
    const { agent } = makeAgent('r7')
    const g = gate()
    const s = g.state('r7')
    // search_data_sources candidates are objects ({id,score,mode}), not strings.
    // The prior string-only harvest missed them (projection mismatch); the .id
    // fix extracts the leaf so GENERATION grounding (candidate_tables) is populated.
    await g.onPostExecute(
      execView('search_data_sources', agent, { query: 'DAU' }),
      resultOk({ candidates: [{ id: 'dws_pay_order_di', score: 0.9, mode: 'table' }, { id: 'game.role.online', score: 0.7, mode: 'event' }] }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.candidate_tables.has('dws_pay_order_di')).toBe(true)
    expect(s.candidate_tables.has('game.role.online')).toBe(true)
    expect(s.last_search_empty).toBe(false)
  })

  it('collectTableNames: empty search candidates → last_search_empty=true, candidate_tables empty', async () => {
    const { agent } = makeAgent('r8')
    const g = gate()
    const s = g.state('r8')
    await g.onPostExecute(
      execView('search_data_sources', agent, { query: 'nothing' }),
      resultOk({ candidates: [] }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.last_search_empty).toBe(true)
    expect(s.candidate_tables.size).toBe(0)
  })

  it('retrieve aggregation: retrieve result sets last_retrieve_empty (false with candidates, true when empty)', async () => {
    const { agent } = makeAgent('r9')
    const g = gate()
    const s = g.state('r9')
    await g.onPostExecute(
      execView('retrieve', agent, { query: 'pay' }),
      resultOk({ candidates: [{ id: 'dws_pay', score: 0.8, mode: 'table' }] }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.last_retrieve_empty).toBe(false)
    // empty retrieve re-arms the empty flag (forward-compat for the dormant escape-hatch)
    await g.onPostExecute(
      execView('retrieve', agent, { query: 'miss' }),
      resultOk({ candidates: [] }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.last_retrieve_empty).toBe(true)
  })

  it('backstop aggregates search+retrieve (union): proceed + search empty BUT retrieve found → advance', async () => {
    const { agent, injected } = makeAgent('r10')
    const g = gate()
    const s = g.state('r10')
    s.last_search_empty = true // search missed
    s.last_retrieve_empty = false // retrieve escape-hatch found candidates
    s.phase_output = 'retrieve bridged the gap.\n【route:proceed】'
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.GENERATION) // retrieve grounding → advance (union)
    expect(injected).toHaveLength(1)
  })

  it('forcedLoad rescue: proceed + no candidates → forcedLoad finds grounding → advance (backstop re-checks after)', async () => {
    const { agent } = makeAgent('r11')
    // forcedLoad mock executes search_data_sources; simulate the post-execute
    // capture the real tools registry would fire (the mock doesn't fire hooks)
    // by setting last_search_empty=false inside execute — this tests that the
    // backstop runs AFTER forcedLoad and re-checks (forced load found → no decline).
    const execute = vi.fn().mockImplementation(async () => {
      const st = g.state('r11')
      st.last_search_empty = false
      st.candidate_tables.add('dws_forced')
      return resultOk({ candidates: [{ id: 'dws_forced', score: 1, mode: 'table' }] })
    })
    const g = gate({ tools: { execute } } as unknown as Context)
    const s = g.state('r11')
    s.last_search_empty = true
    s.phase_output = 'proceeding.\n【route:proceed】'
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(s.current_phase).toBe(Phase.GENERATION) // forced load rescued → advance
  })
})

describe('P-DA3 — no chitchat pre-filter (dropped: 3 layers = route_gate + backstop + persona)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('onPreStep does NOT short-circuit a chitchat first-message (no canned reply, delegates to next)', async () => {
    const { agent, injected } = makeAgent('cc1')
    const g = gate()
    const decision = await g.onPreStep(
      { agent, messages: [{ role: 'user', content: '你好' } as unknown as UserMessage] as unknown as UserMessage[], turn: 1, step: 1, signal: new AbortController().signal },
      () => Promise.resolve({ kind: 'enter', messages: [] }),
    )
    expect(decision.kind).toBe('enter') // no short-circuit — pipeline runs
    expect(injected).toHaveLength(0) // no canned chitchat reply injected
  })

  it('a chitchat UNDERSTANDING turn with no grounding hits the backstop (goes through the pipeline, not canned)', async () => {
    const { agent } = makeAgent('cc2')
    const g = gate()
    const s = g.state('cc2')
    s.last_search_empty = true
    s.phase_output = '你好' // chitchat, no route token, no grounding
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe('DECLINED') // backstop, not a canned reply
    expect(s.honest_decline_reason).toMatch(/no grounding/)
  })

  it('persona thickening: BASE_PERSONA + UNDERSTANDING instruction mention phase order / event-vs-table / route tokens', async () => {
    const g = gate()
    const s = g.state('cc3')
    s.current_phase = Phase.UNDERSTANDING
    const ctx = { agent: { id: 'cc3' }, scope: { id: 'cc3' } } as unknown as AssembleContext
    const stubAssembly: PromptAssembly = { sections: [], contexts: [], tools: [], variables: {} }
    const out = await g.onAssemble(stubAssembly, ctx, () => Promise.resolve(stubAssembly))
    const phaseInstruction = out.sections.find((x: { name?: string }) => x.name === 'phase-instruction')
    expect(phaseInstruction).toBeDefined()
    const text = phaseInstruction!.text
    // P-DA3 three explicit instructions + P-DA1 route token mechanism (the
    // phase-instruction section; BASE_PERSONA is registered separately in register()).
    expect(text).toContain('【route:proceed】')
    expect(text).toContain('【route:clarify】')
    expect(text).toContain('【route:decline】')
    expect(text).toContain('load_event_definition')
    expect(text).toContain('load_table_definition')
    expect(text).toMatch(/do NOT call query_data/) // P-DA3 phase-order rule
    expect(text).toMatch(/event names/) // P-DA3 event-vs-table tool choice
  })
})

describe('P-DA2 generation-relax (criticToolsRegistered probe)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('critic UNREGISTERED (default): sqlSyntaxGate-passing SQL → gate passes (skips last_critique/last_quality) → EXECUTION', async () => {
    const { agent } = makeAgent('g1')
    const g = gate() // no ctx.tools.get → criticToolsRegistered() false
    const s = g.state('g1')
    s.definition_loaded = true // GROUNDING GATE (c): grounding established — exercises sqlSyntaxGate (not the grounding check)
    s.current_phase = Phase.GENERATION
    s.phase_idx = 1 // GENERATION index in PHASE_ORDER so advance lands on EXECUTION
    s.candidate_tables.add('dws_pay')
    s.partition_cols.add('ds')
    // valid SQL (table ∈ candidates, ds partition present); last_critique/last_quality stay null (critic not shipped)
    s.phase_output = "```sql\nSELECT a FROM dws_pay WHERE ds='20260101'\n```"
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.EXECUTION) // relaxed gate passed → advance
  })

  it('critic UNREGISTERED: bad SQL (table ∉ candidates) still fails on sqlSyntaxGate (relax only skips the floor)', async () => {
    const { agent, injected } = makeAgent('g2')
    const g = gate()
    const s = g.state('g2')
    s.definition_loaded = true // GROUNDING GATE (c): grounding established → sqlSyntaxGate fails (table ∉ candidates)
    s.current_phase = Phase.GENERATION
    s.candidate_tables.add('real')
    s.phase_output = "```sql\nSELECT a FROM phantom WHERE ds='1'\n```"
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.GENERATION) // retry
    expect(s.phase_attempts).toBe(1)
    expect(injected).toHaveLength(1)
  })

  it('critic REGISTERED (config flag): re-tightens — last_critique null → gate fails → retry', async () => {
    const { agent, injected } = makeAgent('g3')
    const g = new PhaseGate(
      { logger: { info: () => undefined } } as unknown as Context,
      { stall_watchdog_seconds: 9999, critic_tools_registered: true },
    )
    const s = g.state('g3')
    s.definition_loaded = true // GROUNDING GATE (c): grounding established — exercises the critic floor (not the grounding check)
    s.current_phase = Phase.GENERATION
    s.candidate_tables.add('dws_pay')
    s.partition_cols.add('ds')
    s.phase_output = "```sql\nSELECT a FROM dws_pay WHERE ds='20260101'\n```"
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.GENERATION) // retry — critique not run
    expect(s.phase_attempts).toBe(1)
    expect(injected).toHaveLength(1)
  })

  it('critic REGISTERED via ctx.tools.get probe: re-tightens (last_critique null → fail → retry)', async () => {
    const { agent } = makeAgent('g4')
    // ctx.tools.get returns a defined ToolDefinition for the two critic tools → registered
    const ctx = {
      logger: { info: () => undefined },
      tools: { get: (name: string) => (name === 'critique_sql_tool' || name === 'evaluate_sql_quality' ? { name } : undefined) },
    } as unknown as Context
    const g = new PhaseGate(ctx, { stall_watchdog_seconds: 9999 })
    const s = g.state('g4')
    s.definition_loaded = true // GROUNDING GATE (c): grounding established — exercises the critic floor (not the grounding check)
    s.current_phase = Phase.GENERATION
    s.candidate_tables.add('dws_pay')
    s.partition_cols.add('ds')
    s.phase_output = "```sql\nSELECT a FROM dws_pay WHERE ds='20260101'\n```"
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.GENERATION) // retry — critic registered, floor re-tightened
    expect(s.phase_attempts).toBe(1)
  })

  it('critic REGISTERED + critic data present + above floor → passes (re-tighten faithful, rbi)', async () => {
    const { agent } = makeAgent('g5')
    const g = new PhaseGate(
      { logger: { info: () => undefined } } as unknown as Context,
      { stall_watchdog_seconds: 9999, critic_tools_registered: true },
    )
    const s = g.state('g5')
    s.definition_loaded = true // GROUNDING GATE (c): grounding established — exercises the critic floor (not the grounding check)
    s.current_phase = Phase.GENERATION
    s.phase_idx = 1 // GENERATION index → advance lands on EXECUTION
    s.candidate_tables.add('dws_pay')
    s.partition_cols.add('ds')
    s.last_critique = 0.8 // ≥ critique_confidence_floor (0.6)
    s.last_quality = 80 // ≥ quality_score_floor (60)
    s.phase_output = "```sql\nSELECT a FROM dws_pay WHERE ds='20260101'\n```"
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.EXECUTION) // critic registered + data good → pass
  })

  it('critic REGISTERED + critic data below floor → fails (re-tighten enforces the floor)', async () => {
    const { agent } = makeAgent('g6')
    const g = new PhaseGate(
      { logger: { info: () => undefined } } as unknown as Context,
      { stall_watchdog_seconds: 9999, critic_tools_registered: true },
    )
    const s = g.state('g6')
    s.definition_loaded = true // GROUNDING GATE (c): grounding established — exercises the critic floor (not the grounding check)
    s.current_phase = Phase.GENERATION
    s.candidate_tables.add('dws_pay')
    s.partition_cols.add('ds')
    s.last_critique = 0.3 // < critique_confidence_floor (0.6)
    s.last_quality = 80
    s.phase_output = "```sql\nSELECT a FROM dws_pay WHERE ds='20260101'\n```"
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.GENERATION) // retry — below floor
    expect(s.phase_attempts).toBe(1)
  })
})

// ── GROUNDING GATE (c root-cause): GENERATION requires a definition loaded ──
// The gate is deterministic (definition_loaded flag), not a persona instruction:
// captureToolData sets the flag on a non-error load_* result; generationGate
// requires it before extractSqlCandidate/sqlSyntaxGate run. Failing → the
// existing retry/fallback path (within max_attempts, then fallback to
// UNDERSTANDING) forces the model to load a definition (event_view FROM /
// table columns) before it can write SQL — fixing "writes SQL without
// grounding (event-name-as-table instead of the event_view FROM)".

describe('GROUNDING GATE (c root-cause) — GENERATION requires definition_loaded', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('(i) definition_loaded=false → gate fails BEFORE sqlSyntaxGate (retry; last_sql stays null)', async () => {
    const { agent, injected } = makeAgent('c1')
    const g = gate()
    const s = g.state('c1')
    s.current_phase = Phase.GENERATION
    s.candidate_tables.add('dws_pay') // valid table ∈ candidates
    s.partition_cols.add('ds') // valid partition present
    // definition_loaded stays false (default) — no load_* called this question.
    // The SQL is otherwise valid (table ∈ candidates, ds partition present), so
    // the ONLY reason the gate fails is the grounding check. last_sql stays null
    // because the grounding gate returns BEFORE extractSqlCandidate runs.
    s.phase_output = "```sql\nSELECT a FROM dws_pay WHERE ds='20260101'\n```"
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.GENERATION) // retry — not advanced
    expect(s.phase_attempts).toBe(1)
    expect(injected).toHaveLength(1) // correction inject
    expect(s.last_sql).toBeNull() // grounding short-circuited before extractSqlCandidate
  })

  it('(ii) definition_loaded=true (set via captureToolData load) → grounding passes → sqlSyntaxGate passes → advance to EXECUTION', async () => {
    const { agent } = makeAgent('c2')
    const g = gate()
    const s = g.state('c2')
    s.current_phase = Phase.GENERATION
    s.phase_idx = 1 // GENERATION index → advance lands on EXECUTION
    s.candidate_tables.add('dws_pay')
    s.partition_cols.add('ds')
    // captureToolData sets definition_loaded on a non-error load_* result —
    // simulate the model having loaded an event definition this turn (the real
    // tool also returns event_view.full_name = the FROM table; captureToolData
    // only needs found+event here).
    await g.onPostExecute(
      execView('load_event_definition', agent, { event_name: 'pay_order' }),
      resultOk({ found: true, event: { name: 'pay_order', params_fields: [{ name: 'order_id', type: 'string' }] } }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.definition_loaded).toBe(true) // capture set the grounding flag
    s.phase_output = "```sql\nSELECT a FROM dws_pay WHERE ds='20260101'\n```"
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.EXECUTION) // grounding + sqlSyntaxGate passed → advance
  })

  it('(iii) grounding fail exhausts max_attempts → fallback to UNDERSTANDING', async () => {
    const { agent, injected } = makeAgent('c3')
    const g = gate()
    const s = g.state('c3')
    s.current_phase = Phase.GENERATION
    s.phase_attempts = 4 // one more fail → 5 = max_attempts → fallback path
    s.fallback_count = 0
    // definition_loaded stays false (no load) → grounding gate fails each attempt.
    s.phase_output = "```sql\nSELECT a FROM dws_pay WHERE ds='20260101'\n```"
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    expect(s.current_phase).toBe(Phase.UNDERSTANDING) // fell back, not advanced
    expect(s.fallback_count).toBe(1)
    expect(injected).toHaveLength(1) // fallback continuation
  })
})

// ── (b) CriticCtxService: exposes per-agent critic guard context ──────────
import { CriticCtxService } from '../src/phase-gate.ts'

describe('(b) CriticCtxService — per-agent criticCtx for the critique tools', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // Minimal ctx stub for Service construction (reflect.provide is the only
  // Service-constructor call; the CriticCtxService logic only uses this.gate).
  function svcCtx(): Context {
    return {
      reflect: { provide: () => undefined },
    } as unknown as Context
  }

  it('forAgent returns the per-agent CriticCtx (candidateTables/eventParams/partitionCols)', () => {
    const g = gate()
    const s = g.state('c1')
    s.candidate_tables.add('dws_pay')
    s.event_params.add('order_id')
    s.partition_cols.add('ds')
    const svc = new CriticCtxService(svcCtx(), g)
    const ctx = svc.forAgent('c1')
    expect(ctx).toBeDefined()
    expect(ctx?.candidateTables.has('dws_pay')).toBe(true)
    expect(ctx?.eventParams.has('order_id')).toBe(true)
    expect(ctx?.partitionCols.has('ds')).toBe(true)
  })

  it('forAgent returns undefined for an unknown agent (peekState is non-creating)', () => {
    const g = gate()
    const svc = new CriticCtxService(svcCtx(), g)
    // agent 'c2' has no state → peekState returns undefined → forAgent undefined
    expect(svc.forAgent('c2')).toBeUndefined()
    // peekState does NOT create a throwaway entry (sessions stays empty)
    expect(g.peekState('c2')).toBeUndefined()
  })

  it('forAgent reflects state updates after a search_data_sources harvest', async () => {
    const { agent } = makeAgent('c3')
    const g = gate()
    g.state('c3') // create the state so peekState finds it
    const svc = new CriticCtxService(svcCtx(), g)
    // before search: empty candidateTables
    expect(svc.forAgent('c3')?.candidateTables.size).toBe(0)
    // search_data_sources harvests a candidate table
    await g.onPostExecute(
      execView('search_data_sources', agent, { query: '充值' }),
      resultOk({ candidates: [{ id: 'dws_pay_order_di', score: 1.0, mode: 'bm25-only' }] }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    // after search: the criticCtx reflects the harvested candidate table
    expect(svc.forAgent('c3')?.candidateTables.has('dws_pay_order_di')).toBe(true)
  })
})

// ── G-DA4: critic candidate_tables includes the event_view FROM table ──────
// Root cause: captureToolData populated candidate_tables from search_data_sources
// (event NAMES like game.recharge) but NOT the event_view.full_name FROM table
// (ieu_ods.ods_10000251_all_view) returned by load_event_definition. The critic's
// extractTableNames strips the db. prefix + lowercases (→ ods_10000251_all_view),
// so the CORRECT SQL failed `table_not_in_candidates` (error → confidence 0.50 <
// 0.6 floor) → generationGate blocked → the model gamed the critic with an
// event-name-as-table → TABLE_NOT_FOUND → F2 deadlock → no rows. The fix adds
// event_view.full_name to candidate_tables so the correct SQL passes the critic.
describe('G-DA4 — critic candidate_tables includes event_view table from load_event_definition', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // The canonical K11 event ODS shape: load_event_definition returns
  // event_view.full_name = the FROM table + params_extract_template.
  const eventViewResult = {
    found: true,
    event: { name: 'game.recharge', params_fields: [{ name: 'money', type: 'bigint' }] },
    event_view: {
      full_name: 'ieu_ods.ods_10000251_all_view',
      params_extract_template: "GET_JSON_OBJECT(params, '$.{field_name}')",
      base_columns: ['event', 'params', 'ds'],
    },
  }
  // The CORRECT SQL the model writes from the load result: FROM the event_view
  // table (not a gamed event-name-as-table), event filter + ds partition + JSON param.
  const correctRawSql = 'SELECT event, GET_JSON_OBJECT(params, \'$.money\') AS money FROM ieu_ods.ods_10000251_all_view WHERE event IN (\'game.role.online\',\'game.recharge\') AND ds>=\'20260101\' AND ds<=\'20260122\''

  it('(i) captureToolData for load_event_definition adds event_view.full_name to candidate_tables (db-stripped + full)', async () => {
    const { agent } = makeAgent('d1')
    const g = gate()
    const s = g.state('d1')
    await g.onPostExecute(
      execView('load_event_definition', agent, { event_name: 'game.recharge' }),
      resultOk(eventViewResult),
      () => Promise.resolve({ kind: 'accept' }),
    )
    // GROUNDING GATE (c): definition_loaded set on a non-error load.
    expect(s.definition_loaded).toBe(true)
    // event_params harvested from the nested event (JSON-path field check).
    expect(s.event_params.has('money')).toBe(true)
    // G-DA4: the event_view FROM table is now a candidate — the db-stripped
    // form (what the critic checks after extractTableNames strips the prefix)
    // AND the full lowercased form (robustness against a prefix-preserving critic).
    expect(s.candidate_tables.has('ods_10000251_all_view')).toBe(true)
    expect(s.candidate_tables.has('ieu_ods.ods_10000251_all_view')).toBe(true)
  })

  it('(i-cont) a found:false / no-event_view load does not grow candidate_tables', async () => {
    const { agent } = makeAgent('d2')
    const g = gate()
    const s = g.state('d2')
    const before = s.candidate_tables.size
    await g.onPostExecute(
      execView('load_event_definition', agent, { event_name: 'missing' }),
      resultOk({ found: false, message: 'event not found' }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    // No event_view in a found:false result → no FROM table added (the gap fix
    // is scoped to a successful load that surfaces event_view.full_name).
    expect(s.candidate_tables.size).toBe(before)
  })

  it('(ii) the critic accepts FROM <event_view_table> after captureToolData (confidence ≥ floor, no table_not_in_candidates)', async () => {
    const { agent } = makeAgent('d3')
    const g = gate()
    const s = g.state('d3')
    // Simulate UNDERSTANDING: search surfaces event NAMES, load surfaces the FROM table.
    await g.onPostExecute(
      execView('search_data_sources', agent, { query: 'K11 DAU' }),
      resultOk({
        candidates: [
          { id: 'game.role.online', score: 0.9, mode: 'event' },
          { id: 'game.recharge', score: 0.8, mode: 'event' },
        ],
      }),
      () => Promise.resolve({ kind: 'accept' }),
    )
    await g.onPostExecute(
      execView('load_event_definition', agent, { event_name: 'game.recharge' }),
      resultOk(eventViewResult),
      () => Promise.resolve({ kind: 'accept' }),
    )
    // The critic guard context the critique_sql_tool reads (CriticCtxService.forAgent).
    const criticCtx = {
      candidateTables: s.candidate_tables,
      eventParams: s.event_params,
      partitionCols: s.partition_cols,
    }
    // The CORRECT SQL: FROM ieu_ods.ods_10000251_all_view (the event_view table).
    const result = critiqueSql(correctRawSql, criticCtx)
    // No table_not_in_candidates — the event_view table IS a candidate now.
    const tableFindings = result.findings.filter(f => f.rule === 'table_not_in_candidates')
    expect(tableFindings).toHaveLength(0)
    // No errors → confidence = 1 − 0.15·warnings ≥ 0.85 ≥ 0.6 floor (passes gate).
    const errors = result.findings.filter(f => f.severity === 'error').length
    const warnings = result.findings.filter(f => f.severity === 'warning').length
    const confidence = Math.max(0, 1 - 0.5 * errors - 0.15 * warnings)
    expect(confidence).toBeGreaterThanOrEqual(PipelineConfig.critique_confidence_floor)
    // BEFORE the fix: candidate_tables held only event names → the correct SQL
    // hit table_not_in_candidates (error → confidence 0.50 < 0.6) → generationGate
    // blocked → the gamed-SQL trap. Reproduce the pre-fix state to prove the gap:
    const preFixTables = new Set(['game.role.online', 'game.recharge'])
    const preFixResult = critiqueSql(correctRawSql, {
      candidateTables: preFixTables,
      eventParams: s.event_params,
      partitionCols: s.partition_cols,
    })
    const preFixTableFindings = preFixResult.findings.filter(f => f.rule === 'table_not_in_candidates')
    expect(preFixTableFindings.length).toBeGreaterThan(0) // the gap the fix closes
  })

  it('(ii-integration) generationGate passes the correct SQL → advance to EXECUTION (no table_not_in_candidates block)', async () => {
    const { agent } = makeAgent('d4')
    const g = gate()
    const s = g.state('d4')
    s.current_phase = Phase.GENERATION
    s.phase_idx = 1 // GENERATION index → advance lands on EXECUTION
    // UNDERSTANDING populated candidate_tables + definition_loaded via load_event_definition:
    await g.onPostExecute(
      execView('load_event_definition', agent, { event_name: 'game.recharge' }),
      resultOk(eventViewResult),
      () => Promise.resolve({ kind: 'accept' }),
    )
    expect(s.definition_loaded).toBe(true) // GROUNDING GATE (c) passes
    expect(s.candidate_tables.has('ods_10000251_all_view')).toBe(true) // the fix
    // The model writes the CORRECT SQL (FROM the event_view table):
    s.phase_output = '```sql\n' + correctRawSql + '\n```'
    await g.onTurnStopping({ agent, turn: 1, signal: new AbortController().signal })
    // The critic found no table_not_in_candidates → sqlSyntaxGate passed →
    // generationGate passed → advance to EXECUTION (the fix breaks the deadlock).
    expect(s.current_phase).toBe(Phase.EXECUTION)
    // last_sql is the REAL table, not a gamed event-name-as-table.
    expect(s.last_sql).toContain('ods_10000251_all_view')
  })

  it('(iii) GENERATION persona: TABLE_NOT_FOUND / FIELD_NOT_FOUND / SEMANTIC_MISMATCH → 【route:decline】 (no re-critique)', async () => {
    const g = gate()
    const s = g.state('d5')
    s.current_phase = Phase.GENERATION
    const ctx = { agent: { id: 'd5' }, scope: { id: 'd5' } } as unknown as AssembleContext
    const stubAssembly: PromptAssembly = { sections: [], contexts: [], tools: [], variables: {} }
    const out = await g.onAssemble(stubAssembly, ctx, () => Promise.resolve(stubAssembly))
    const phaseInstruction = out.sections.find((x: { name?: string }) => x.name === 'phase-instruction')
    expect(phaseInstruction).toBeDefined()
    const text = phaseInstruction!.text
    // rbi §3 阶段D: schema-mismatch execution errors are UNRECOVERABLE →
    // honest reject (【route:decline】), NOT re-critique/re-execute.
    expect(text).toContain('TABLE_NOT_FOUND')
    expect(text).toContain('FIELD_NOT_FOUND')
    expect(text).toContain('SEMANTIC_MISMATCH')
    expect(text).toContain('UNRECOVERABLE')
    expect(text).toContain('【route:decline】')
    expect(text).toMatch(/do not re-critique/i)
    // The F2-trap-enabling sentence ("correct the SQL and RE-call critique_sql_tool")
    // is gone — replaced by the rbi-faithful honest-reject instruction.
    expect(text).not.toMatch(/correct the SQL and RE-call critique_sql_tool/)
  })
})
