/**
 * Collaborator aggregation: bundles the injected collaborator interfaces
 * (AgentResponder, QueryExecutor, JudgeExecutor, SqlSemanticJudge) into a
 * single Collaborators object the runner accepts.
 *
 * The individual interfaces live in types.ts / sql_semantic_judge.ts; this
 * module provides the composite type and a helper to build it.
 *
 * @module @deepseek-ai/dsh-eval-runner/collaborators
 */

import type { AgentResponder, QueryExecutor, JudgeExecutor } from './types.ts'
import type { SqlSemanticJudge } from './sql_semantic_judge.ts'

/**
 * Bundled collaborators for a batch run. The agent is required; executor,
 * judge, and sqlJudge are optional (a case that has no EXECUTION expected
 * can still run without an executor; a case without DELIVERY can run without
 * a judge; sqlJudge is used when executor is null to verify SQL semantics).
 */
export interface Collaborators {
  readonly agent: AgentResponder
  readonly executor?: QueryExecutor | null
  readonly judge?: JudgeExecutor | null
  readonly sqlJudge?: SqlSemanticJudge | null
}

/**
 * Build a Collaborators object (convenience over raw object literal).
 */
export function buildCollaborators(
  agent: AgentResponder,
  executor?: QueryExecutor | null,
  judge?: JudgeExecutor | null,
  sqlJudge?: SqlSemanticJudge | null,
): Collaborators {
  return { agent, executor: executor ?? null, judge: judge ?? null, sqlJudge: sqlJudge ?? null }
}
