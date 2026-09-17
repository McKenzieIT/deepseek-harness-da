/**
 * Stage 0 facility tests for the policy-only arm.
 *
 * Two jobs. First, pin the harvest helpers against `packages/data/phase-gate`:
 * they are transcribed rather than imported because phase-gate keeps them
 * module-private, and a silent divergence would change the critic verdict and
 * therefore the arm comparison, without any test failing. Second, prove each of
 * the four admission rules independently, and prove the floor arm enforces none
 * of them while still enforcing the unified budget.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PhaseGate } from '@deepseek-ai/dsh-phase-gate'
import { PipelineConfig } from '@deepseek-ai/dsh-phase-gate'
import {
  GuardrailsPolicy,
  normalizeSql,
  type Config,
} from '../src/guardrails-policy.ts'

const REPO = join(import.meta.dirname, '../../../../..')
const PHASE_GATE_SRC = join(REPO, 'packages/data/phase-gate/src/phase-gate.ts')

const CFG: Config = {
  enforce_admission: true,
  critique_confidence_floor: 0.6,
  quality_score_floor: 60,
  max_query_data_calls: 8,
}
const FLOOR_CFG: Config = { ...CFG, enforce_admission: false }

/** Minimal ToolExecution stand-in; the guard reads only `agent.id`, `name`, `arguments`. */
function exec(name: string, args: Record<string, unknown> = {}, agentId = 'a1') {
  return { name, arguments: args, agent: { id: agentId } } as never
}
const ok = (value: unknown) => ({ isError: false, value }) as never
const err = () => ({ isError: true }) as never

/** Drive a tool result through the observer without a Cordis context. */
async function feed(p: GuardrailsPolicy, name: string, result: unknown, agentId = 'a1') {
  await p.onPostExecute(exec(name, {}, agentId), result as never, async () => ({ kind: 'accept' }) as never)
}

const LOAD_TABLE = {
  found: true,
  table: {
    table_name: 'dws_10000251_univ_role_act_di',
    qualified_name: 'ieu_cdm.dws_10000251_univ_role_act_di',
    partitions: [{ name: 'ds', type: 'string' }],
  },
}

/**
 * Behavioural parity against the real `PhaseGate`.
 *
 * Comparing source text was the obvious pin and the wrong one: the helpers are
 * transcribed TypeScript, the test sees them transpiled (types erased, quotes and
 * semicolons normalised), and cosmetic differences like `if (!x) return` versus
 * `if (x) { … }` fail while a genuine logic change could still slip through. So
 * this drives the SAME tool-result sequence through phase-gate's own
 * `onPostExecute` and through the policy plugin's, then compares the harvested
 * critic context. That pins the only thing that matters — that both arms hand the
 * critic identical candidate tables, event params, and partition columns — and it
 * exercises phase-gate's real code path rather than a copy of it.
 */
describe('critic-context harvest matches phase-gate exactly', () => {
  /** The stub ctx phase-gate's own tests use; `get()` returning undefined is enough. */
  const stubCtx = () => ({
    logger: { info: () => undefined, debug: () => undefined },
    get: () => undefined,
  }) as never

  const agent = (id: string) => ({
    id,
    inject: () => undefined,
    cancel: () => undefined,
    session: { id, snapshotEvents: () => [] },
  }) as never

  /** Feed one tool result to both implementations. */
  async function both(gate: PhaseGate, policy: GuardrailsPolicy, name: string, value: unknown, id = 'p1') {
    const a = agent(id)
    const e = { callId: 'c', name, arguments: {}, signal: new AbortController().signal, agent: a } as never
    const r = { isError: false, value, content: [] } as never
    await gate.onPostExecute(e, r, async () => ({ kind: 'accept' }) as never)
    await policy.onPostExecute(e, r, async () => ({ kind: 'accept' }) as never)
  }

  const sets = (s: { candidate_tables: Set<string>; event_params: Set<string>; partition_cols: Set<string> }) => ({
    candidate_tables: [...s.candidate_tables].sort(),
    event_params: [...s.event_params].sort(),
    partition_cols: [...s.partition_cols].sort(),
  })

  it.each([
    ['search_data_sources with table and metric candidates', 'search_data_sources', {
      candidates: [
        { id: 'ieu_cdm.dws_10000251_univ_acc_act_di', score: 1, mode: 'table' },
        { id: 'dws_10000251_com_pay_order_di__pay_amt_total', score: 0.9, mode: 'metric' },
        'bare_string_table',
      ],
    }],
    ['search_data_sources with no candidates', 'search_data_sources', { candidates: [] }],
    ['load_table_definition with qualified name and partitions', 'load_table_definition', LOAD_TABLE],
    ['load_table_definition with only an unqualified name', 'load_table_definition', {
      table: { table_name: 'dws_x', partitions: [{ name: 'ds' }, { name: 'hh' }] },
    }],
    ['load_event_definition with params_fields and event_view', 'load_event_definition', {
      event: { params_fields: [{ name: 'Free' }, { name: 'card_id' }] },
      event_view: { full_name: 'IEU_ODS.ods_10000251_all_view' },
    }],
    ['load_event_definition with a substrate params map', 'load_event_definition', {
      event: { params: { Amount: { type: 'bigint' }, Kind: { type: 'string' } } },
      event_view: { full_name: 'ods_v' },
    }],
  ])('harvests identically: %s', async (_label, tool, value) => {
    const gate = new PhaseGate(stubCtx(), { stall_watchdog_seconds: 9999 } as never)
    const policy = new GuardrailsPolicy(CFG)
    await both(gate, policy, tool as string, value)
    expect(sets(policy.peekState('p1')!)).toEqual(sets(gate.state('p1')))
  })

  it('harvests identically across a full realistic sequence', async () => {
    const gate = new PhaseGate(stubCtx(), { stall_watchdog_seconds: 9999 } as never)
    const policy = new GuardrailsPolicy(CFG)
    await both(gate, policy, 'search_data_sources', {
      candidates: [{ id: 'ieu_cdm.dws_10000251_univ_role_act_di', score: 1, mode: 'table' }],
    })
    await both(gate, policy, 'load_table_definition', LOAD_TABLE)
    await both(gate, policy, 'load_event_definition', {
      event: { params_fields: [{ name: 'free' }] },
      event_view: { full_name: 'ieu_ods.ods_10000251_all_view' },
    })
    expect(sets(policy.peekState('p1')!)).toEqual(sets(gate.state('p1')))
    // And the shared set is non-trivial, so the assertion is not vacuously true.
    expect(policy.peekState('p1')!.candidate_tables.size).toBeGreaterThan(3)
  })

  it('agrees that both floors come from phase-gate PipelineConfig', () => {
    expect(CFG.critique_confidence_floor).toBe(PipelineConfig.critique_confidence_floor)
    expect(CFG.quality_score_floor).toBe(PipelineConfig.quality_score_floor)
    expect(CFG.max_query_data_calls).toBe(PipelineConfig.max_executions_per_turn)
  })

  it('normalizeSql is still the function phase-gate documents at :1102', () => {
    // A cheap containment check on the source, not an equality pin: it catches a
    // wholesale rewrite of the same-source comparison without failing on layout.
    const src = readFileSync(PHASE_GATE_SRC, 'utf8')
    for (const fragment of ['replace(/;\\s*$/', 'ORDER\\s+BY', 'LIMIT', 'replace(/\\s+/g']) {
      expect(src, `phase-gate normalizeSql should still contain ${fragment}`).toContain(fragment)
    }
  })
})

describe('normalizeSql tolerates presentation clauses but not logic changes', () => {
  const base = 'SELECT a FROM t WHERE ds = \'20260805\''
  it('ignores trailing semicolon, ORDER BY, LIMIT and whitespace', () => {
    expect(normalizeSql(`${base} ORDER BY a LIMIT 10;`)).toBe(normalizeSql(base))
    expect(normalizeSql(`${base}\n\n`)).toBe(normalizeSql(base))
  })
  it('does not ignore a WHERE change', () => {
    expect(normalizeSql(base)).not.toBe(normalizeSql(base.replace('20260805', '20260804')))
  })
})

describe('policy-only admission: each rule denies on its own', () => {
  const SQL = 'SELECT COUNT(*) AS dau FROM ieu_cdm.dws_10000251_univ_role_act_di WHERE ds = \'20260805\''

  it('rule 1 denies query_data before any definition is loaded', () => {
    const p = new GuardrailsPolicy(CFG)
    expect(p.guard(exec('query_data', { sql: SQL }))).toMatch(/rule 1: no definition loaded/)
  })

  it('rule 2 denies when the critic was never called', async () => {
    const p = new GuardrailsPolicy(CFG)
    await feed(p, 'load_table_definition', ok(LOAD_TABLE))
    expect(p.guard(exec('query_data', { sql: SQL }))).toMatch(/rule 2: critique_sql_tool has not been called/)
  })

  it('rule 2 denies below the confidence floor', async () => {
    const p = new GuardrailsPolicy(CFG)
    await feed(p, 'load_table_definition', ok(LOAD_TABLE))
    await feed(p, 'critique_sql_tool', ok({ confidence: 0.5, sql: SQL }))
    expect(p.guard(exec('query_data', { sql: SQL }))).toMatch(/rule 2: .*0\.5 is below the 0\.6 floor/)
  })

  it('rule 3 denies below the quality floor', async () => {
    const p = new GuardrailsPolicy(CFG)
    await feed(p, 'load_table_definition', ok(LOAD_TABLE))
    await feed(p, 'critique_sql_tool', ok({ confidence: 0.9, sql: SQL }))
    await feed(p, 'evaluate_sql_quality', ok({ score: 40 }))
    expect(p.guard(exec('query_data', { sql: SQL }))).toMatch(/rule 3: .*40 is below the 60 floor/)
  })

  it('rule 4 denies a SQL that differs from the one both tools cleared', async () => {
    const p = new GuardrailsPolicy(CFG)
    await feed(p, 'load_table_definition', ok(LOAD_TABLE))
    await feed(p, 'critique_sql_tool', ok({ confidence: 0.9, sql: SQL }))
    await feed(p, 'evaluate_sql_quality', ok({ score: 80 }))
    const other = SQL.replace('20260805', '20260804')
    expect(p.guard(exec('query_data', { sql: other }))).toMatch(/rule 4: the SQL passed to query_data differs/)
  })

  it('admits only when all four conditions hold', async () => {
    const p = new GuardrailsPolicy(CFG)
    await feed(p, 'load_table_definition', ok(LOAD_TABLE))
    await feed(p, 'critique_sql_tool', ok({ confidence: 0.9, sql: SQL }))
    await feed(p, 'evaluate_sql_quality', ok({ score: 80 }))
    expect(p.guard(exec('query_data', { sql: SQL }))).toBeUndefined()
  })

  it('admits a re-formatted but logically identical SQL', async () => {
    const p = new GuardrailsPolicy(CFG)
    await feed(p, 'load_table_definition', ok(LOAD_TABLE))
    await feed(p, 'critique_sql_tool', ok({ confidence: 0.9, sql: SQL }))
    await feed(p, 'evaluate_sql_quality', ok({ score: 80 }))
    expect(p.guard(exec('query_data', { sql: `${SQL} ORDER BY 1 LIMIT 5;` }))).toBeUndefined()
  })

  it('re-admits after a fresh critique of a revised SQL', async () => {
    const p = new GuardrailsPolicy(CFG)
    await feed(p, 'load_table_definition', ok(LOAD_TABLE))
    await feed(p, 'critique_sql_tool', ok({ confidence: 0.9, sql: SQL }))
    await feed(p, 'evaluate_sql_quality', ok({ score: 80 }))
    const revised = SQL.replace('20260805', '20260804')
    expect(p.guard(exec('query_data', { sql: revised }))).toMatch(/rule 4/)
    await feed(p, 'critique_sql_tool', ok({ confidence: 0.8, sql: revised }))
    await feed(p, 'evaluate_sql_quality', ok({ score: 70 }))
    expect(p.guard(exec('query_data', { sql: revised }))).toBeUndefined()
  })

  it('never admits tools other than query_data through the guard', () => {
    const p = new GuardrailsPolicy(CFG)
    for (const t of ['search_data_sources', 'load_table_definition', 'critique_sql_tool', 'present_clarification']) {
      expect(p.guard(exec(t))).toBeUndefined()
    }
  })
})

describe('diagnostic floor arm', () => {
  const SQL = 'SELECT 1 FROM ieu_cdm.dws_10000251_univ_role_act_di WHERE ds = \'20260805\''

  it('does not inherit any admission denial', () => {
    const p = new GuardrailsPolicy(FLOOR_CFG)
    expect(p.guard(exec('query_data', { sql: SQL }))).toBeUndefined()
  })

  it('still harvests critic context, so the critic tools stay usable', async () => {
    const p = new GuardrailsPolicy(FLOOR_CFG)
    await feed(p, 'load_table_definition', ok(LOAD_TABLE))
    const s = p.peekState('a1')
    expect(s?.candidate_tables.has('dws_10000251_univ_role_act_di')).toBe(true)
    expect(s?.candidate_tables.has('ieu_cdm.dws_10000251_univ_role_act_di')).toBe(true)
    expect(s?.partition_cols.has('ds')).toBe(true)
  })

  it('still enforces the unified query budget', async () => {
    const p = new GuardrailsPolicy({ ...FLOOR_CFG, max_query_data_calls: 2 })
    for (let i = 0; i < 2; i++) await feed(p, 'query_data', ok({ state: 'completed' }))
    expect(p.guard(exec('query_data', { sql: SQL }))).toMatch(/budget: query_data called 2 times/)
  })
})

describe('critic context harvest', () => {
  it('collects search candidate ids, db-stripped forms, and metric hosts', async () => {
    const p = new GuardrailsPolicy(CFG)
    await feed(p, 'search_data_sources', ok({
      candidates: [
        { id: 'ieu_cdm.dws_10000251_univ_acc_act_di', score: 1, mode: 'table' },
        { id: 'dws_10000251_com_pay_order_di__pay_amt_total', score: 0.9, mode: 'metric' },
      ],
    }))
    const t = p.peekState('a1')!.candidate_tables
    expect(t.has('ieu_cdm.dws_10000251_univ_acc_act_di')).toBe(true)
    expect(t.has('dws_10000251_univ_acc_act_di')).toBe(true)
    expect(t.has('dws_10000251_com_pay_order_di')).toBe(true) // metric host
    expect(p.peekState('a1')!.search_returned_candidates).toBe(true)
  })

  it('records an empty search as no grounding', async () => {
    const p = new GuardrailsPolicy(CFG)
    await feed(p, 'search_data_sources', ok({ candidates: [] }))
    expect(p.peekState('a1')!.search_returned_candidates).toBe(false)
  })

  it('harvests event params and the event view table', async () => {
    const p = new GuardrailsPolicy(CFG)
    await feed(p, 'load_event_definition', ok({
      event: { params_fields: [{ name: 'Free', type: 'string' }] },
      event_view: { full_name: 'IEU_ODS.ods_10000251_all_view' },
    }))
    const s = p.peekState('a1')!
    expect(s.definition_loaded).toBe(true)
    expect(s.event_params.has('free')).toBe(true)
    expect(s.candidate_tables.has('ods_10000251_all_view')).toBe(true)
  })

  it('never harvests from an errored tool result', async () => {
    const p = new GuardrailsPolicy(CFG)
    await feed(p, 'load_table_definition', err())
    expect(p.peekState('a1')!.definition_loaded).toBe(false)
  })

  it('counts a failed query against the budget and records the outcome', async () => {
    const p = new GuardrailsPolicy(CFG)
    await feed(p, 'query_data', ok({ state: 'failed', failureKind: 'transport' }))
    await feed(p, 'query_data', err())
    const s = p.peekState('a1')!
    expect(s.query_attempts).toBe(2)
    expect(s.query_successes).toBe(0)
    expect(s.last_query_outcome).toBe('failed')
  })

  it('keeps state per agent', async () => {
    const p = new GuardrailsPolicy(CFG)
    await feed(p, 'load_table_definition', ok(LOAD_TABLE), 'a1')
    expect(p.peekState('a1')!.definition_loaded).toBe(true)
    expect(p.peekState('a2')).toBeUndefined()
    expect(p.guard(exec('query_data', { sql: 'SELECT 1' }, 'a2'))).toMatch(/rule 1/)
  })

  it('produces a JSON-safe snapshot with sorted sets', async () => {
    const p = new GuardrailsPolicy(CFG)
    await feed(p, 'load_table_definition', ok(LOAD_TABLE))
    const snap = p.snapshot('a1')!
    expect(() => JSON.stringify(snap)).not.toThrow()
    expect(snap.candidate_tables).toEqual([...(snap.candidate_tables as string[])].sort())
  })
})
