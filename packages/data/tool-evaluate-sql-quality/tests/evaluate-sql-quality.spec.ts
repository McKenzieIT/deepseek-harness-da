/**
 * evaluate_sql_quality — registration (defineTool + ctx.tools.register) and
 * the 0-100 quality scoring. Proves the tool returns a score from the
 * folded-regex critic findings, and that the criticCtx injection works.
 *
 * Run: `pnpm vitest run packages/data/tool-evaluate-sql-quality`
 * (the root `pnpm test` globs all `*.spec.ts` files).
 */
import { test, expect } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { CriticCtx } from '@deepseek-ai/dsh-nl2sql-engine'
import {
  apply,
  evaluateSqlQuality,
  computeScore,
  formatQuality,
  type EvaluateSqlQualityResult,
  type CriticCtxProvider,
} from '../src/index.ts'

/** The subset of the registered tool definition the tests exercise. */
interface ToolDef {
  readonly name: string
  readonly description: string
  readonly output: {
    readonly schema: unknown
    readonly render: (
      args: unknown,
      value: EvaluateSqlQualityResult,
    ) => readonly { readonly type: 'text'; readonly text: string }[]
  }
  readonly execute: (
    args: { readonly sql: string },
    exec: { readonly signal: AbortSignal; readonly agent?: { readonly id: string } },
  ) => Promise<EvaluateSqlQualityResult>
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

// ── pure scoring core (no Cordis context) ──

test('Q1 valid SQL (no findings) -> score 100', () => {
  const ctx = makeCriticCtx(['dws_pay'], ['ds'])
  const out = evaluateSqlQuality(
    "SELECT a FROM dws_pay WHERE ds='20260101'",
    ctx,
  )
  expect(out.score).toBe(100)
})

test('Q2 table not in candidates (1 error) -> score 70 (above 60 floor)', () => {
  const ctx = makeCriticCtx(['real'], ['ds'])
  const out = evaluateSqlQuality(
    "SELECT a FROM phantom WHERE ds='1'",
    ctx,
  )
  expect(out.score).toBe(70) // 100 - 30*1
})

test('Q3 2 errors (2 tables not in candidates) -> score 35 (below 60 floor)', () => {
  const ctx = makeCriticCtx(['real'], ['ds'])
  // 2 tables both not in candidates -> 2 errors (60 deducted) + missing ds -> 1 warning (5)
  const out = evaluateSqlQuality(
    'SELECT a FROM phantom1 JOIN phantom2 ON 1=1',
    ctx,
  )
  expect(out.score).toBe(35) // 100 - 30*2 - 5*1 = 35
})

test('Q4 SELECT * warning -> score 95', () => {
  const ctx = makeCriticCtx(['dws_pay'], ['ds'])
  const out = evaluateSqlQuality(
    "SELECT * FROM dws_pay WHERE ds='20260101'",
    ctx,
  )
  expect(out.score).toBe(95) // 100 - 5*1
})

test('Q5 no SELECT -> score 0', () => {
  const ctx = makeCriticCtx([], [])
  const out = evaluateSqlQuality('not sql', ctx)
  expect(out.score).toBe(0)
})

test('Q6 computeScore clamps to [0, 100]', () => {
  expect(computeScore(0, 0)).toBe(100)
  expect(computeScore(4, 0)).toBe(0) // 100 - 120 = -20 -> 0
  expect(computeScore(0, 20)).toBe(0) // 100 - 100 = 0
})

// ── registration + execute ──

test('Q7 apply registers evaluate_sql_quality (name + description + output + execute)', () => {
  const def = registerTool()
  expect(def.name).toBe('evaluate_sql_quality')
  expect(def.description).toContain('quality')
  expect(def.output).toBeDefined()
  expect(typeof def.execute).toBe('function')
})

test('Q8 execute returns score (no criticCtx provider -> empty fail-open -> table error -> 70)', async () => {
  const def = registerTool(undefined)
  const out = await def.execute(
    { sql: "SELECT a FROM dws_pay WHERE ds='1'" },
    { signal: new AbortController().signal },
  )
  // No criticCtx -> empty candidateTables -> table_not_in_candidates error -> 70
  expect(out.score).toBe(70)
})

test('Q9 execute uses criticCtx provider when registered (clean SQL -> 100)', async () => {
  const provider: CriticCtxProvider = {
    forAgent: () => makeCriticCtx(['dws_pay'], ['ds']),
  }
  const def = registerTool(provider)
  const out = await def.execute(
    { sql: "SELECT a FROM dws_pay WHERE ds='20260101'" },
    { signal: new AbortController().signal, agent: { id: 'agent-1' } },
  )
  expect(out.score).toBe(100)
})

test('Q10 render formats score', () => {
  const def = registerTool()
  const out = def.output.render({}, { score: 85 })
  expect(out[0]?.type).toBe('text')
  expect(out[0]?.text).toBe('score: 85')
})

test('Q11 formatQuality one-line', () => {
  expect(formatQuality({ score: 60 })).toBe('score: 60')
})
