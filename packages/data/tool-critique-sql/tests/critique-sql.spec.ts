/**
 * critique_sql_tool — registration (defineTool + ctx.tools.register) and the
 * folded-regex SQL critic projection. Proves the tool returns confidence +
 * findings + the critiqued SQL, and that the criticCtx injection (via
 * ctx.get('criticCtx')) works.
 *
 * Run: `pnpm vitest run packages/data/tool-critique-sql`
 * (the root `pnpm test` globs all `*.spec.ts` files).
 */
import { test, expect } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { CriticCtx } from '@deepseek-ai/dsh-nl2sql-engine'
import {
  apply,
  critiqueSqlResult,
  computeConfidence,
  formatCritique,
  type CritiqueSqlResult,
  type CriticCtxProvider,
} from '../src/index.ts'
import type { CriticResult, RelationGraphLike } from '@deepseek-ai/dsh-nl2sql-engine'

/** The subset of the registered tool definition the tests exercise. */
interface ToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (
      args: unknown,
      value: CritiqueSqlResult,
    ) => readonly { readonly type: 'text'; readonly text: string }[]
  }
  readonly execute: (
    args: { readonly sql: string; readonly question?: string },
    exec: { readonly signal: AbortSignal; readonly agent?: { readonly id: string } },
  ) => Promise<CritiqueSqlResult>
}

/** The `ctx.get('schema')` shape the tool probes for the relation graph. */
interface SchemaServiceLike {
  getRelationGraph?(): RelationGraphLike
}

/**
 * Capture the tool definition the plugin registers. `provider` answers
 * `ctx.get('criticCtx')` and `schema` answers `ctx.get('schema')`; both are
 * absent (undefined) by default, mirroring an unmounted phase-gate /
 * semantic layer.
 */
function registerTool(provider?: CriticCtxProvider, schema?: SchemaServiceLike): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: {
      register: (d: ToolDef) => {
        def = d
      },
    },
    get: (key: string) => (key === 'schema' ? schema : provider),
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) {
    throw new Error('apply did not register a tool')
  }
  return def
}

/**
 * A relation graph that declares exactly the given `joins` adjacency and no
 * multi-hop join paths, so `buildDeclaredJoinPairs` yields precisely the
 * listed pairs.
 */
function makeGraph(joins: Readonly<Record<string, readonly string[]>>): RelationGraphLike {
  return {
    findJoinPath: () => null,
    getJoinCondition: () => null,
    getRelated: (sourceId: string, type?: string) =>
      type === 'joins'
        ? (joins[sourceId] ?? []).map(targetId => ({ targetId, type: 'joins' }))
        : [],
    getDerived: () => [],
  }
}

/** A critic context with the given candidate tables + partition cols. */
function makeCriticCtx(tables: string[], partitions: string[] = []): CriticCtx {
  return {
    candidateTables: new Set(tables.map(t => t.toLowerCase())),
    eventParams: new Set(),
    partitionCols: new Set(partitions.map(p => p.toLowerCase())),
  }
}

// ── pure critique core (no Cordis context) ──

test('C1 valid SQL (table ∈ candidates, ds present) → confidence 1.0, no findings', () => {
  const ctx = makeCriticCtx(['dws_pay'], ['ds'])
  const out = critiqueSqlResult(
    "```sql\nSELECT a FROM dws_pay WHERE ds='20260101'\n```",
    ctx,
  )
  expect(out.sql).toBe("SELECT a FROM dws_pay WHERE ds='20260101'")
  expect(out.findings).toEqual([])
  expect(out.confidence).toBe(1)
})

test('C2 table ∉ candidates → confidence below floor (error finding)', () => {
  const ctx = makeCriticCtx(['real'], ['ds'])
  const out = critiqueSqlResult(
    "```sql\nSELECT a FROM phantom WHERE ds='1'\n```",
    ctx,
  )
  expect(out.findings.length).toBe(1)
  expect(out.findings[0]?.rule).toBe('table_not_in_candidates')
  expect(out.findings[0]?.severity).toBe('error')
  expect(out.confidence).toBe(0.5) // 1 - 0.5*1 < 0.6 floor
})

test('C3 SELECT * warning → confidence 0.85 (above floor, warning only)', () => {
  const ctx = makeCriticCtx(['dws_pay'], ['ds'])
  const out = critiqueSqlResult(
    "SELECT * FROM dws_pay WHERE ds='20260101'",
    ctx,
  )
  expect(out.findings.length).toBe(1)
  expect(out.findings[0]?.rule).toBe('select_star')
  expect(out.findings[0]?.severity).toBe('warning')
  expect(out.confidence).toBe(0.85) // 1 - 0.15*1
})

test('C4 missing ds partition → warning (partition table)', () => {
  const ctx = makeCriticCtx(['dws_pay'], ['ds'])
  const out = critiqueSqlResult('SELECT a FROM dws_pay', ctx)
  expect(out.findings.some(f => f.rule === 'missing_partition_filter')).toBe(true)
  expect(out.findings[0]?.severity).toBe('warning')
})

test('C5 no SELECT → confidence 0, sql null', () => {
  const ctx = makeCriticCtx([], [])
  const out = critiqueSqlResult('this is not sql', ctx)
  expect(out.sql).toBeUndefined()
  expect(out.confidence).toBe(0)
  expect(out.findings).toEqual([])
})

test('C6 computeConfidence: 2 errors → 0.0', () => {
  const result: CriticResult = {
    passed: false,
    reason: 'errors',
    findings: [
      { rule: 'a', severity: 'error', message: 'e1' },
      { rule: 'b', severity: 'error', message: 'e2' },
    ] as unknown as CriticResult['findings'],
  }
  expect(computeConfidence(result)).toBe(0) // 1 - 0.5*2 = 0
})

// ── registration + execute ──

test('C7 apply registers critique_sql_tool (name + description + output + execute)', () => {
  const def = registerTool()
  expect(def.name).toBe('critique_sql_tool')
  expect(def.description).toContain('critic')
  expect(def.output).toBeDefined()
  expect(typeof def.execute).toBe('function')
})

test('C8 execute returns confidence + findings + sql (no criticCtx provider → empty fail-open)', async () => {
  const def = registerTool(undefined)
  // No criticCtx provider → empty candidateTables → table ∉ candidates error
  const out = await def.execute(
    { sql: "SELECT a FROM dws_pay WHERE ds='1'" },
    { signal: new AbortController().signal },
  )
  expect(out.sql).toBe("SELECT a FROM dws_pay WHERE ds='1'")
  expect(out.findings.length).toBe(1) // table_not_in_candidates (empty set)
  expect(out.findings[0]?.severity).toBe('error')
  expect(out.confidence).toBe(0.5)
})

test('C9 execute uses criticCtx provider when registered (table ∈ candidates → pass)', async () => {
  const provider: CriticCtxProvider = {
    forAgent: () => makeCriticCtx(['dws_pay'], ['ds']),
  }
  const def = registerTool(provider)
  const out = await def.execute(
    { sql: "```sql\nSELECT a FROM dws_pay WHERE ds='20260101'\n```" },
    { signal: new AbortController().signal, agent: { id: 'agent-1' } },
  )
  expect(out.confidence).toBe(1)
  expect(out.findings).toEqual([])
  expect(out.sql).toBe("SELECT a FROM dws_pay WHERE ds='20260101'")
})

test('C10 execute reads agent id from exec.agent for the forAgent lookup', async () => {
  let seenId: string | undefined
  const provider: CriticCtxProvider = {
    forAgent: (id: string) => {
      seenId = id
      return makeCriticCtx(['dws_pay'], ['ds'])
    },
  }
  const def = registerTool(provider)
  await def.execute(
    { sql: "SELECT a FROM dws_pay WHERE ds='20260101'" },
    { signal: new AbortController().signal, agent: { id: 'agent-42' } },
  )
  expect(seenId).toBe('agent-42')
})

test('C11 render formats confidence + sql + findings', () => {
  const def = registerTool()
  const value: CritiqueSqlResult = {
    confidence: 0.5,
    sql: 'SELECT a FROM t',
    findings: [{ rule: 'table_not_in_candidates', severity: 'error', message: "表 't' ∉ candidates" }],
  }
  const out = def.output.render({}, value)
  expect(out[0]?.type).toBe('text')
  expect(out[0]?.text).toContain('confidence: 0.50')
  expect(out[0]?.text).toContain('SELECT a FROM t')
  expect(out[0]?.text).toContain('[error] table_not_in_candidates')
})

test('C12 formatCritique clean SQL → "findings: none"', () => {
  const value: CritiqueSqlResult = {
    confidence: 1,
    sql: 'SELECT a FROM t',
    findings: [],
  }
  const text = formatCritique(value)
  expect(text).toContain('findings: none')
})

test('C13 formatCritique for a no-SQL critique prints the confidence alone', () => {
  // No SELECT was found: there is no critiqued SQL to echo and no checks ran,
  // so neither the `sql:` line nor any findings line may be emitted — the
  // "findings: none (passed all checks)" reassurance would be a lie here.
  const text = formatCritique({ confidence: 0, findings: [] })
  expect(text).toBe('confidence: 0.00')
})

test('C14 render of a no-SQL critique is the confidence line alone', () => {
  const def = registerTool()
  const out = def.output.render({}, { confidence: 0, findings: [] })
  expect(out[0]?.text).toBe('confidence: 0.00')
})

test('C15 execute refuses to critique when the turn is already aborted', async () => {
  const def = registerTool()
  const controller = new AbortController()
  controller.abort()
  await expect(def.execute(
    { sql: "SELECT a FROM dws_pay WHERE ds='20260101'" },
    { signal: controller.signal },
  )).rejects.toThrow('critique_sql_tool aborted before critique')
})

test('C16 provider with no state for this agent falls back to the empty ctx (fail-closed)', async () => {
  // Phase-gate mounted (provider present) but nothing harvested for this agent
  // -> forAgent returns undefined -> EMPTY_CRITIC_CTX -> every FROM-table is
  // flagged. The same SQL with a provider that knows dws_pay passes (C9).
  let seenId: string | undefined
  const provider: CriticCtxProvider = {
    forAgent: (id: string) => {
      seenId = id
      return undefined
    },
  }
  const def = registerTool(provider)
  const out = await def.execute(
    { sql: "SELECT a FROM dws_pay WHERE ds='20260101'" },
    { signal: new AbortController().signal, agent: { id: 'agent-7' } },
  )
  expect(seenId).toBe('agent-7')
  expect(out.findings.map(f => f.rule)).toEqual(['table_not_in_candidates'])
  expect(out.confidence).toBe(0.5) // below the 0.6 gate floor
})

test('C17 execute rejects a call with no sql argument (schema-required, never critiqued as empty)', async () => {
  const def = registerTool()
  const call = def.execute as unknown as (a: unknown, e: unknown) => Promise<CritiqueSqlResult>
  await expect(call({}, { signal: new AbortController().signal }))
    .rejects.toThrow(/missing required property "sql"/)
})

// ── relation-graph declared-JOIN guard (ctx.get('schema') → getRelationGraph) ──

/** Candidate tables shared by the declared-JOIN cases. */
const JOIN_CANDIDATES = ['dws_pay', 'dim_server', 'dim_user']

test('C18 a JOIN the relation graph declares raises no finding', async () => {
  const provider: CriticCtxProvider = {
    forAgent: () => makeCriticCtx(JOIN_CANDIDATES, ['ds']),
  }
  const def = registerTool(provider, {
    getRelationGraph: () => makeGraph({ dws_pay: ['dim_server'] }),
  })
  const out = await def.execute(
    { sql: "SELECT a FROM dws_pay JOIN dim_server ON 1=1 WHERE ds='1'" },
    { signal: new AbortController().signal, agent: { id: 'agent-1' } },
  )
  expect(out.findings).toEqual([])
  expect(out.confidence).toBe(1)
})

test('C19 a JOIN absent from the relation graph → undeclared_join warning', async () => {
  // Identical candidates + graph as C18; only the JOIN target differs
  // (dim_user is a candidate table but the graph declares no dws_pay⟷dim_user
  // edge), so the pair must be reported as a possible hallucination.
  const provider: CriticCtxProvider = {
    forAgent: () => makeCriticCtx(JOIN_CANDIDATES, ['ds']),
  }
  const def = registerTool(provider, {
    getRelationGraph: () => makeGraph({ dws_pay: ['dim_server'] }),
  })
  const out = await def.execute(
    { sql: "SELECT a FROM dws_pay JOIN dim_user ON 1=1 WHERE ds='1'" },
    { signal: new AbortController().signal, agent: { id: 'agent-1' } },
  )
  expect(out.findings.map(f => f.rule)).toEqual(['undeclared_join'])
  expect(out.findings[0]?.severity).toBe('warning')
  expect(out.findings[0]?.message).toContain('dim_user')
  expect(out.confidence).toBe(0.85) // warning only -> still above the 0.6 floor
})

test('C20 a schema service without getRelationGraph leaves the declared-JOIN rule off', async () => {
  // Same SQL + candidates as C19, but the semantic layer exposes no graph ->
  // no declaredJoinPairs -> the undeclared-JOIN rule must stay silent rather
  // than warn on every JOIN.
  const provider: CriticCtxProvider = {
    forAgent: () => makeCriticCtx(JOIN_CANDIDATES, ['ds']),
  }
  const def = registerTool(provider, {})
  const out = await def.execute(
    { sql: "SELECT a FROM dws_pay JOIN dim_user ON 1=1 WHERE ds='1'" },
    { signal: new AbortController().signal, agent: { id: 'agent-1' } },
  )
  expect(out.findings).toEqual([])
  expect(out.confidence).toBe(1)
})

test('C21 a relation graph with no criticCtx candidates skips the declared-JOIN build', async () => {
  // Graph present but the phase-gate harvested nothing (no provider) -> empty
  // candidateTables -> buildDeclaredJoinPairs is not called; the SQL is judged
  // by the table-grounding rule alone (2 tables ∉ candidates).
  const def = registerTool(undefined, {
    getRelationGraph: () => makeGraph({ dws_pay: ['dim_server'] }),
  })
  const out = await def.execute(
    { sql: "SELECT a FROM dws_pay JOIN dim_user ON 1=1 WHERE ds='1'" },
    { signal: new AbortController().signal, agent: { id: 'agent-1' } },
  )
  expect(out.findings.map(f => f.rule)).toEqual([
    'table_not_in_candidates',
    'table_not_in_candidates',
  ])
  expect(out.confidence).toBe(0)
})
