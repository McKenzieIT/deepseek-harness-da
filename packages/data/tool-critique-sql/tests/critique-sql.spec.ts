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
import type { CriticResult } from '@deepseek-ai/dsh-nl2sql-engine'

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

/** Capture the tool definition the plugin registers, with an optional criticCtx probe. */
function registerTool(provider?: CriticCtxProvider): ToolDef {
  let def: ToolDef | undefined
  const ctx = {
    tools: {
      register: (d: ToolDef) => {
        def = d
      },
    },
    get: () => provider,
  } as unknown as Context
  apply(ctx, {})
  if (def === undefined) {
    throw new Error('apply did not register a tool')
  }
  return def
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
