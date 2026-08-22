/**
 * Model-facing `evaluate_sql_quality` — the GENERATION-phase SQL quality
 * scorer. The agent calls it to get a 0–100 quality score for a SQL
 * candidate. The phase-gate's `captureToolData` captures `last_quality` from
 * the returned `score`; the GENERATION gate (P-DA2, re-tightened when
 * `critic_tools_registered`) requires `last_quality ≥ 60`
 * (`PipelineConfig.quality_score_floor`) to advance to EXECUTION.
 *
 * (b) root-cause fix — paired with `critique_sql_tool`: the model calls both
 * on its SQL before `query_data`; after a TABLE_NOT_FOUND, it corrects the
 * SQL + RE-calls `critique_sql_tool` (re-critique → `last_sql` updates → F2
 * passes) + RE-calls `evaluate_sql_quality` (→ `last_quality` updates).
 *
 * Phase 1: the score is derived from the folded-regex critic findings
 * (`critiqueSql`) + basic heuristics (the SQL must contain a SELECT, etc.).
 * (The full rbi 100-score rule-deduction table is a later Phase 2
 * refinement; Phase 1 unblocks the gate floor.)
 *
 * The critic guard context is read via `ctx.get('criticCtx')` — the same
 * `CriticCtxService` the phase-gate registers (see `@deepseek-ai/dsh-tool-
 * critique-sql` for the structural `CriticCtxProvider` interface + the
 * injection design rationale).
 *
 * @module @deepseek-ai/dsh-tool-evaluate-sql-quality
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  extractSqlCandidate,
  critiqueSql,
  type CriticCtx,
} from '@deepseek-ai/dsh-nl2sql-engine'


export const name = 'tool-evaluate-sql-quality'
export const inject = ['tools']

/** Configuration for the evaluate_sql_quality tool (no knobs). */
export interface Config {}

/** Runtime configuration schema for the evaluate_sql_quality plugin. */
export const Config: z<Config> = z.object({})

/**
 * Structural interface for the critic-context provider the phase-gate
 * registers as `ctx.criticCtx`. Probed via `ctx.get('criticCtx')` (soft —
 * `undefined` when the phase-gate is not mounted). §2.3: the Consumer
 * injects the Service Definition key, never the Provider; this structural
 * interface (mirrored in tool-critique-sql) avoids importing the phase-gate
 * Provider package.
 */
export interface CriticCtxProvider {
  /**
   * Get the per-agent critic guard context for the given agent.
   * @param agentId - the harness agent id (stringified).
   * @returns the `CriticCtx`, or `undefined` when the agent has no state.
   */
  forAgent(agentId: string): CriticCtx | undefined
}

/** The canonical value returned by `evaluate_sql_quality`'s `execute`. */
export interface EvaluateSqlQualityResult {
  /** 0–100 quality score (the phase-gate's `last_quality`; floor 60). */
  readonly score: number
}

/** Empty critic context (fail-open when the phase-gate is not mounted). */
const EMPTY_CRITIC_CTX: CriticCtx = {
  candidateTables: new Set(),
  eventParams: new Set(),
  partitionCols: new Set(),
}

/**
 * Compute a 0–100 quality score from the critic findings. The phase-gate's
 * `quality_score_floor` is 60 (PipelineConfig) — errors (30 each) push below
 * the floor so a failed critique blocks GENERATION; warnings (5 each) are
 * lightly penalized. A clean SQL (no findings) scores 100.
 * @param errors - the count of error-severity findings.
 * @param warnings - the count of warning-severity findings.
 * @returns a 0–100 quality score clamped to [0, 100].
 */
export function computeScore(errors: number, warnings: number): number {
  return Math.max(0, Math.min(100, 100 - 30 * errors - 5 * warnings))
}

/**
 * The pure evaluate core — extract + critique the SQL candidate, then derive
 * the quality score from the findings. Exported so the extract + critic +
 * scoring are testable without a Cordis context.
 * @param rawSql - the model-supplied SQL (raw or ```sql fenced).
 * @param criticCtx - the critic guard context (candidate tables, event params, partition cols).
 * @returns the quality score (0–100) for the phase-gate's `last_quality` floor.
 */
export function evaluateSqlQuality(
  rawSql: string,
  criticCtx: CriticCtx,
): EvaluateSqlQualityResult {
  const sql = extractSqlCandidate(rawSql)
  if (sql === null) {
    // No SQL candidate → score 0 (the gate floor is 60 → blocks GENERATION).
    return { score: 0 }
  }
  const result = critiqueSql(sql, criticCtx)
  const errors = result.findings.filter(f => f.severity === 'error').length
  const warnings = result.findings.filter(f => f.severity === 'warning').length
  return { score: computeScore(errors, warnings) }
}

/**
 * Format a quality score as readable text for the model.
 * @param value - the quality score result to format.
 * @returns a one-line text block the model reads in the tool result.
 */
export function formatQuality(value: EvaluateSqlQualityResult): string {
  return `score: ${value.score}`
}

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'evaluate_sql_quality',
    description:
      'Score a SQL candidate\'s quality (0–100) from the folded-regex '
      + 'critic findings (table grounding, ds partition, SELECT *, JSON-path '
      + 'fields). Call this in GENERATION alongside critique_sql_tool before '
      + 'query_data — the turn-stopping gate requires score ≥ 60 to advance '
      + 'to EXECUTION. Returns the quality score.',
    parameters: {
      sql: {
        type: 'string',
        required: true,
        description: 'The SQL to score (raw SQL or a ```sql fenced block).',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          score: { type: 'number', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: formatQuality(value as EvaluateSqlQualityResult),
      }],
    },
    async execute(args, exec) {
      if (exec.signal.aborted) {
        throw new Error('evaluate_sql_quality aborted before scoring')
      }
      const sql = (args as { sql?: string }).sql ?? ''
      // Probe the phase-gate's criticCtx service (soft — see critique_sql_tool
      // for the injection design rationale). The structural CriticCtxProvider
      // interface is imported from tool-critique-sql (the sibling Consumer that
      // owns it) to avoid duplicating the interface.
      const provider = ctx.get('criticCtx') as CriticCtxProvider | undefined
      const agentId = exec.agent !== undefined ? String(exec.agent.id) : undefined
      const criticCtx = provider !== undefined && agentId !== undefined
        ? (provider.forAgent(agentId) ?? EMPTY_CRITIC_CTX)
        : EMPTY_CRITIC_CTX
      return evaluateSqlQuality(sql, criticCtx)
    },
  }))
}
