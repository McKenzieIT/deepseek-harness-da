import { COMPARATOR_POLICY_VERSION } from '@deepseek-ai/dsh-eval'
import type { Collaborators } from '../src/collaborators.ts'
import type { BatchRunOptions, RunConfig } from '../src/types.ts'

/** Build a complete self-describing config for runner seam tests. */
export function makeTestRunConfig(
  collaborators: Collaborators,
  overrides: Partial<RunConfig> = {},
): RunConfig {
  const withQuery = overrides.with_query ?? (collaborators.executor !== null && collaborators.executor !== undefined)
  return {
    provider: 'test-provider',
    model: 'test-model',
    pass_k: 1,
    max_infra_retries: 2,
    concurrency: 1,
    sql_judge: collaborators.sqlJudge !== null && collaborators.sqlJudge !== undefined,
    verdict_semantics: 'pass^k',
    responder: 'engine',
    scope_id: 'test-scope',
    today: '20260912',
    query_expansion: false,
    with_query: withQuery,
    ...(withQuery ? { executor_identity: 'test-query-executor' } : {}),
    ...(withQuery ? { query_wait_seconds: 300 } : {}),
    comparator_policy_version: COMPARATOR_POLICY_VERSION,
    column_semantics: 'by-name',
    max_stored_rows: 200,
    skip_health_gate: true,
    ...overrides,
  }
}

/** Build runner options whose duplicated runtime fields agree with the persisted config. */
export function makeTestRunOptions(
  collaborators: Collaborators,
  overrides: Omit<BatchRunOptions, 'config'> = {},
): BatchRunOptions {
  const passK = overrides.pass_k ?? 1
  const concurrency = overrides.concurrency ?? 1
  const maxInfraRetries = overrides.max_infra_retries ?? 2
  const skipHealthGate = overrides.skip_health_gate ?? true
  return {
    ...overrides,
    pass_k: passK,
    concurrency,
    max_infra_retries: maxInfraRetries,
    skip_health_gate: skipHealthGate,
    config: makeTestRunConfig(collaborators, {
      pass_k: passK,
      concurrency,
      max_infra_retries: maxInfraRetries,
      skip_health_gate: skipHealthGate,
    }),
  }
}
