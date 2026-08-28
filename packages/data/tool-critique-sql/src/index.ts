/**
 * Model-facing `critique_sql_tool` — the GENERATION-phase SQL critic. The
 * agent calls it to critique a SQL candidate with the folded-regex critic
 * (sqlSyntaxGate: table ∈ candidates / ds-required / SELECT * / JSON-path
 * field ∈ event_params) before calling `query_data`.
 *
 * (b) root-cause fix — F2 (same-source gate) satisfiable: the tool returns
 * `{ confidence, findings, sql }` where `sql` is the critiqued (normalized)
 * SQL. The phase-gate's `captureToolData` (tools/post-execute) captures
 * `last_critique` from `confidence` AND `last_sql` from the returned `sql`.
 * So when the model re-critiques a corrected SQL (after a TABLE_NOT_FOUND),
 * `last_sql` updates → F2 passes the corrected SQL → execution → rows.
 *
 * The critic guard context ({candidateTables, eventParams, partitionCols})
 * is the per-agent state the phase-gate harvested from `search_data_sources`
 * / `load_*` (captureToolData). This tool reads it via `ctx.get('criticCtx')`
 * — the `CriticCtxService` the phase-gate registers. §2.3: the Consumer
 * defines a structural `CriticCtxProvider` interface + probes `ctx.get`
 * (soft — undefined when the phase-gate is not mounted → empty sets;
 * with no candidate tables the critic flags every referenced table as
 * not-in-candidates, dropping confidence below the 0.6 floor and
 * BLOCKING GENERATION (fail-closed, not fail-open; the intended
 * pass-through is deferred), never importing the
 * Provider (the phase-gate package).
 *
 * Phase 1: the tool calls the EXISTING nl2sql-engine `critiqueSql` (the
 * folded regex critic) + `extractSqlCandidate` and returns a confidence
 * derived from the findings. (The full 3-layer critic — sqlglot AST +
 * JSON-path + registry — is a later Phase 2 refinement; Phase 1 unblocks F2.)
 *
 * @module @deepseek-ai/dsh-tool-critique-sql
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  extractSqlCandidate,
  critiqueSql,
  buildDeclaredJoinPairs,
  type CriticCtx,
  type CriticResult,
  type RelationGraphLike,
} from '@deepseek-ai/dsh-nl2sql-engine'

export const name = 'tool-critique-sql'
export const inject = ['tools']

/** Configuration for the critique_sql_tool (no knobs; the criticCtx service owns the guard data). */
export interface Config {}

/** Runtime configuration schema for the critique_sql_tool plugin. */
export const Config: z<Config> = z.object({})

/**
 * Structural interface for the critic-context provider the phase-gate
 * registers as `ctx.criticCtx`. Probed via `ctx.get('criticCtx')` (soft —
 * `undefined` when the phase-gate is not mounted). §2.3: the Consumer injects
 * the Service Definition key, never the Provider; this structural interface
 * avoids importing the phase-gate package (the Provider) — the tool only
 * needs the `forAgent(agentId)` method shape.
 */
export interface CriticCtxProvider {
  /**
   * Get the per-agent critic guard context for the given agent.
   * @param agentId - the harness agent id (stringified).
   * @returns the `CriticCtx`, or `undefined` when the agent has no state.
   */
  forAgent(agentId: string): CriticCtx | undefined
}

/**
 * Structural interface for the semantic-layer schema service probed via
 * `ctx.get('schema')`. Only the `getRelationGraph` method is needed here —
 * avoids a hard dependency on `@deepseek-ai/dsh-semantic-layer`.
 */
interface SchemaServiceLike {
  getRelationGraph?(): RelationGraphLike
}

/** A critic finding projected to the model-facing shape (rule, severity, message). */
export interface CritiqueFinding {
  readonly rule: string
  readonly severity: 'error' | 'warning'
  readonly message: string
}

/** The canonical value returned by `critique_sql_tool`'s `execute`. */
export interface CritiqueSqlResult {
  /** 0–1 confidence: 1.0 = no findings; errors heavily penalized, warnings lightly. */
  readonly confidence: number
  /** The critic findings (table ∉ candidates, missing ds, SELECT *, JSON-path ∉ params). */
  readonly findings: CritiqueFinding[]
  /** The normalized critiqued SQL (the `last_sql` source for F2 same-source); omitted when no SELECT found. */
  readonly sql?: string
}

/**
 * Empty critic context — the fallback when the phase-gate is not mounted or
 * the agent has no harvested state. With no candidate tables the critic flags
 * every referenced table as `table_not_in_candidates`, yielding a confidence
 * below the 0.6 floor that BLOCKS `GENERATION` (fail-closed, not fail-open;
 * the intended pass-through is deferred — see README Known Limitations).
 */
const EMPTY_CRITIC_CTX: CriticCtx = {
  candidateTables: new Set(),
  eventParams: new Set(),
  partitionCols: new Set(),
}

/**
 * Compute a 0–1 confidence from the critic result. The phase-gate's
 * `critique_confidence_floor` is 0.6 (PipelineConfig) — errors (0.5 each)
 * push below the floor so a failed critique blocks GENERATION; warnings
 * (0.15 each) are lightly penalized so a clean SQL with a SELECT * warning
 * still passes. `no_sql` (extractSqlCandidate null) → 0.0.
 * @param result - the raw critic result (passed/fail + findings).
 * @returns a 0–1 confidence for the phase-gate's `last_critique` floor check.
 */
export function computeConfidence(result: CriticResult): number {
  const errors = result.findings.filter(f => f.severity === 'error').length
  const warnings = result.findings.filter(f => f.severity === 'warning').length
  return Math.max(0, 1 - 0.5 * errors - 0.15 * warnings)
}

/**
 * The pure critique core — extract + critique the SQL candidate. Exported so
 * the extract + critic + confidence are testable without a Cordis context.
 * `rawSql` may be raw SQL or a ```sql fenced block (extractSqlCandidate
 * normalizes both). When no SELECT is found, returns `confidence: 0, sql: null`.
 * @param rawSql - the model-supplied SQL (raw or ```sql fenced).
 * @param criticCtx - the critic guard context (candidate tables, event params, partition cols).
 * @returns the critique result (confidence, findings, normalized sql for last_sql).
 */
export function critiqueSqlResult(
  rawSql: string,
  criticCtx: CriticCtx,
): CritiqueSqlResult {
  const sql = extractSqlCandidate(rawSql)
  if (sql === null) {
    return { confidence: 0, findings: [] }
  }
  const result = critiqueSql(sql, criticCtx)
  return {
    confidence: computeConfidence(result),
    findings: result.findings.map(f => ({
      rule: f.rule,
      severity: f.severity,
      message: f.message,
    })),
    sql,
  }
}

/**
 * Format a critique result as readable text for the model. Lists the
 * confidence, the critiqued SQL, and each finding with its severity.
 * @param value - the critique result to format.
 * @returns a multi-line text block the model reads in the tool result.
 */
export function formatCritique(value: CritiqueSqlResult): string {
  const lines: string[] = []
  lines.push(`confidence: ${value.confidence.toFixed(2)}`)
  if (value.sql !== undefined) {
    lines.push(`sql: ${value.sql}`)
  }
  if (value.findings.length > 0) {
    lines.push('findings:')
    for (const f of value.findings) {
      lines.push(`  [${f.severity}] ${f.rule}: ${f.message}`)
    }
  } else if (value.sql !== undefined) {
    lines.push('findings: none (SQL passed all critic checks)')
  }
  return lines.join('\n')
}

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'critique_sql_tool',
    description:
      'Critique a SQL candidate with the folded-regex SQL critic (table ∈ '
      + 'candidates, ds partition required, no SELECT *, GET_JSON_OBJECT '
      + 'field ∈ event_params). Call this in GENERATION before query_data — '
      + 'the turn-stopping gate requires confidence ≥ 0.6 to advance to '
      + 'EXECUTION. After a TABLE_NOT_FOUND or execution error, correct the '
      + 'SQL and RE-call critique_sql_tool (re-critique) before re-calling '
      + 'query_data — the gate\'s F2 same-source check requires the query_data '
      + 'SQL to match the critiqued SQL. Returns confidence, findings, and '
      + 'the normalized SQL.',
    parameters: {
      sql: {
        type: 'string',
        required: true,
        description: 'The SQL to critique (raw SQL or a ```sql fenced block).',
      },
      question: {
        type: 'string',
        description: 'The natural-language question the SQL answers (context for the critic).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          confidence: { type: 'number', required: true },
          sql: { type: 'string' },
          findings: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                rule: { type: 'string', required: true },
                severity: { type: 'string', required: true },
                message: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: formatCritique(value as CritiqueSqlResult),
      }],
    },
    execute(args, exec) {
      if (exec.signal.aborted) {
        throw new Error('critique_sql_tool aborted before critique')
      }
      const sql = (args as { sql?: string }).sql ?? ''
      const provider = ctx.get('criticCtx') as CriticCtxProvider | undefined
      const agentId = exec.agent !== undefined ? String(exec.agent.id) : undefined
      let criticCtx: CriticCtx = provider !== undefined && agentId !== undefined
        ? (provider.forAgent(agentId) ?? EMPTY_CRITIC_CTX)
        : EMPTY_CRITIC_CTX
      const schema = ctx.get('schema') as SchemaServiceLike | undefined
      const graph = schema?.getRelationGraph?.()
      if (graph && criticCtx.candidateTables.size > 0) {
        const declaredJoinPairs = buildDeclaredJoinPairs([...criticCtx.candidateTables], graph)
        criticCtx = { ...criticCtx, declaredJoinPairs }
      }
      return Promise.resolve(critiqueSqlResult(sql, criticCtx))
    },
  }))
}
