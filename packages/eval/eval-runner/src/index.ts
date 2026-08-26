/**
 * `@deepseek-ai/dsh-eval-runner` — the eval evidence engine.
 *
 * Public API: batch runner, persistence, delta comparison, health gate,
 * infra retry, verdict mapping, collaborator interfaces, and stubs.
 *
 * @module @deepseek-ai/dsh-eval-runner
 */

// Core types
export type {
  RunnerVerdict,
  AttemptResult,
  CaseVerdict,
  RunResult,
  RunSummary,
  CaseFlip,
  DeltaReport,
  DeltaSummary,
  AgentResponder,
  AgentRespondOpts,
  AgentResponse,
  QueryExecutor,
  QueryResult,
  JudgeExecutor,
  JudgeResult,
  HealthCheckResult,
  HealthGateResult,
  BatchRunOptions,
  InfraFailureKind,
  InfraRetryRecord,
} from './types.ts'

// Collaborators
export type { Collaborators } from './collaborators.ts'
export { buildCollaborators } from './collaborators.ts'

// Runner
export { runBatch } from './runner.ts'

// Persistence
export { writeRunResult, readRunResult, defaultOutputPath } from './persistence.ts'

// Delta comparison
export { compareDelta, regressions, improvements } from './delta.ts'

// Health gate
export { runHealthGate } from './health_gate.ts'
export type { HealthGateOptions } from './health_gate.ts'

// Infra retry
export { withInfraRetry, classifyInfraFailure, isInfraError, DEFAULT_MAX_INFRA_RETRIES, INFRA_BACKOFF_MS } from './infra_retry.ts'
export type { InfraError } from './infra_retry.ts'

// Verdict mapper
export { mapVerdict, mapAttempts } from './verdict_mapper.ts'

// SQL Semantic Judge
export type { SqlJudgeInput, SqlJudgeDimensions, SqlJudgeResult, SqlSemanticJudge } from './sql_semantic_judge.ts'
export { LlmSqlSemanticJudge } from './sql_semantic_judge.ts'

// Stubs (test helpers)
export { StubAgentResponder, StubQueryExecutor, StubJudgeExecutor, FailingAgentResponder, FailingQueryExecutor } from './stubs.ts'
