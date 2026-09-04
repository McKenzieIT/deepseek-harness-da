/**
 * P13b NL→SQL engine — package entry. A Cordis `Service` shell (mounts via the
 * bundle patch as a capability-plugin row; declares the `ctx.nl2sql` seam +
 * holds the loaded conventions) + the logic-module exports P7b's phase-gate
 * consumes (`critiqueSql`/`sqlSyntaxGate`, the GENERATION prompt-section
 * content, the `Bm25Linker` retrieval).
 *
 * Production runtime is agent-loop-driven (P7): the agent LLM generates SQL +
 * the phase-gate's `sql_syntax_gate` runs the critic. P13b EXPORTS the
 * components; P7b wires them (the `agent/turn-stopping` hook + the
 * `sql_syntax_gate` slot + the `system-prompt/assemble` GENERATION-section
 * injection). P13b does NOT register `ctx.on` hooks or `ctx.tools` tools
 * itself — that wiring is P7b's boundary (P13b grilling Q2). The model-facing
 * `search_data_sources` tool registration via `ctx.tools` is the one deferred
 * sub-item: it needs the `@deepseek-ai/dsh-tools` tool-registration API
 * grounded from the 88KB `dsh-tools/src/index.ts`; the preset's
 * `tool-search-data-sources` row stays commented meanwhile (forward-compatible
 * per the preset's own note — an unregistered whitelisted tool is simply
 * uncallable, not a broken mount). The BM25 logic ships as the `Bm25Linker`
 * export + `ctx.nl2sql` method, ready to wire.
 *
 * The eval-only `generate()` (`Nl2sqlEngine.run`) is for the eval-gate-minimal
 * runner (P13b grilling Q3), not production runtime.
 *
 * @module @deepseek-ai/dsh-nl2sql-engine
 */
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { EngineConventions } from '@deepseek-ai/dsh-query'

// ── logic exports (P7b preset / phase-gate / eval consume) ───────────────
export * from './types.ts'
// EngineConventions is the engine's per-dialect grounding (consumed by EngineDeps);
// re-exported so a consumer building Nl2sqlEngine collaborators (e.g. the
// eval-runner-service ctx adapter) imports it from the engine package root
// rather than a cross-package deep .ts path.
export type { EngineConventions } from '@deepseek-ai/dsh-query'
export { critiqueSql, sqlSyntaxGate, extractSqlCandidate, extractJsonPaths, extractTableNames, hasPartitionFilter, hasSelectStar, type CriticResult } from './critic.ts'
export { buildPrompt, buildEvalPrompt, type EventDefinitionLite, type BuildPromptArgs, type BuildEvalPromptArgs } from './prompt.ts'
export { renderConventionsPrompt } from './conventions.ts'
export { Bm25Linker, BM25Okapi, buildCorpus, tokenize, type RetrievalLinker, type RetrievalHit, type DataSourceDoc } from './bm25-linking.ts'
export { Nl2sqlEngine, type EngineDeps, type EngineRunArgs, type EngineRunResult, type EngineTraceEntry } from './engine.ts'
export { StandInOdps, outcome, type OdpsExecutor } from './stand-in-odps.ts'
export { ReplayLlm, type Llm, type LlmGenerateArgs, type LlmGenerateResult, type LlmFeedback, type ScriptedGen } from './replay-llm.ts'
export { buildJoinConstraints, buildDeclaredJoinPairs, expandCandidates, type RelationGraphLike, type RelationGraphEdge } from './ontology.ts'
export { runEval, type EvalResult, type EvalDetail } from './eval/runner.ts'
export { EVAL_CASES, FIXTURE_DATA_SOURCES, FIXTURE_EVENT_DEF, type EvalCase, type EvalCaseExpected } from './eval/cases.ts'
export { scoreMatch } from './eval/scorer.ts'
export { JOIN_EVAL_CASES, JOIN_FIXTURE_DS, buildJoinFixtureGraph } from './eval/join-cases.ts'
export { runComparisonEval, type ComparisonResult } from './eval/comparison-runner.ts'
export { METRIC_EVAL_CASES, METRIC_FIXTURE_DS } from './eval/metric-cases.ts'

// ── Service shell (bundle-patch capability-plugin mount + ctx.nl2sql seam) ─
/** Configuration for the nl2sql-engine service (conventions engine name). */
export interface Nl2sqlEngineConfig {
  /** Conventions engine name (routes `load_conventions`; default `maxcompute`). */
  readonly conventionsEngine?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    nl2sql: Nl2sqlEngineService
  }
}

/**
 * The nl2sql-engine Cordis `Service`. Owns no `ctx.on` hooks (P7b owns the
 * phase-gate hooks); holds no conventions state — `getConventions` resolves
 * per-call from the injected query engine (`ctx.query.getConventions`) — and
 * exposes them for the preset / phase-gate. The logic functions are standalone
 * exports (above); this service is the mount point + `ctx.nl2sql` seam. The
 * `search_data_sources` model-facing tool registration is deferred (see
 * module doc).
 */
export class Nl2sqlEngineService extends Service {
  static Config: z<Nl2sqlEngineConfig> = z.object({
    conventionsEngine: z.string().default('maxcompute'),
  })
  /** nl2sql-7: the service reads `ctx.query.getConventions` at call time, so it
   * declares `query` as a dependency — Cordis then waits for `ctx.query` to be
   * registered before the service is ready (AGENTS.md: a Service that reads
   * another service on `ctx` declares it in `inject`). */
  static inject = ['query']

  constructor(ctx: Context, config: Nl2sqlEngineConfig) {
    super(ctx, 'nl2sql')
    // D2 (GA-GT1 Phase 6): conventions are resolved per-call from
    // `ctx.query.getConventions(scopeId)` in `getConventions` below — NOT
    // cached at construction. The previous construction-time cache
    // (`this.conventions = ctx.query.getConventions()` in the constructor)
    // froze a single value from the singleton `ctx.query` for the service's
    // lifetime, so every tenant/scope saw the same conventions (cross-line
    // coupling). Per-call resolution lets a future per-scope engine mapping
    // take effect without a service rebuild. The `conventionsEngine` config
    // field is vestigial (ctx.query IS the engine selection) but retained for
    // config-compat.
    void config
  }

  /**
   * The loaded per-engine conventions (prompt dialect grounding), resolved
   * per-call from the injected query engine — NOT construction-time cached.
   *
   * D2 (GA-GT1 Phase 6): the previous implementation cached
   * `ctx.query.getConventions()` in the constructor and returned the frozen
   * value here, so a singleton `ctx.query` made every tenant/scope share one
   * conventions set (cross-line coupling). This delegates to
   * `ctx.query.getConventions(scopeId)` on every call so a future per-scope
   * engine mapping is honored without a service rebuild. The `scopeId` is
   * threaded end-to-end from the caller but ignored by current concrete
   * providers (dormant seam — undefined yields the provider's single loaded
   * set; behavior unchanged today, just no longer frozen at construction).
   *
   * @param scopeId Optional per-request-scope key (dormant seam; forwarded to
   * `ctx.query.getConventions(scopeId)` — current providers ignore it).
   * @returns The resolved per-engine conventions for the active scope.
   */
  getConventions(scopeId?: string): EngineConventions {
    return this.ctx.query.getConventions(scopeId)
  }
}

export default Nl2sqlEngineService
