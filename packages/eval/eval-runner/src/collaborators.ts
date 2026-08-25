/**
 * Collaborator aggregation: bundles the injected collaborator interfaces
 * (AgentResponder, QueryExecutor, JudgeExecutor) into a single Collaborators
 * object the runner accepts.
 *
 * The individual interfaces live in types.ts; this module provides the
 * composite type and a helper to build it.
 *
 * @module @deepseek-ai/dsh-eval-runner/collaborators
 */

import type { AgentResponder, QueryExecutor, JudgeExecutor } from './types.ts'

/**
 * Bundled collaborators for a batch run. The agent is required; executor
 * and judge are optional (a case that has no EXECUTION expected can still
 * run without an executor; a case without DELIVERY can run without a judge).
 */
export interface Collaborators {
  readonly agent: AgentResponder
  readonly executor?: QueryExecutor | null
  readonly judge?: JudgeExecutor | null
}

/**
 * Build a Collaborators object (convenience over raw object literal).
 */
export function buildCollaborators(agent: AgentResponder, executor?: QueryExecutor | null, judge?: JudgeExecutor | null): Collaborators {
  return { agent, executor: executor ?? null, judge: judge ?? null }
}
