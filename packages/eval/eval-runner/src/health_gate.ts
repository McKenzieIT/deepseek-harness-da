/**
 * Health gate: pre-flight checks that validate collaborators are reachable
 * before committing to a batch run. Checks connectivity, credentials, and
 * scope availability.
 *
 * @module @deepseek-ai/dsh-eval-runner/health_gate
 */

import type { AgentResponder, QueryExecutor, JudgeExecutor, HealthCheckResult, HealthGateResult } from './types.ts'

/** Default timeout for individual health checks (5 seconds). */
const HEALTH_CHECK_TIMEOUT_MS = 5000

/**
 * Run a single health check with a timeout.
 * @param name - the check name.
 * @param fn - the check function (should throw on failure).
 * @param timeoutMs - max time to wait.
 * @returns the health check result.
 */
async function runCheck(name: string, fn: () => Promise<void>, timeoutMs: number = HEALTH_CHECK_TIMEOUT_MS): Promise<HealthCheckResult> {
  const started = Date.now()
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`health check timed out after ${timeoutMs}ms`)), timeoutMs)),
    ])
    return {
      name,
      healthy: true,
      message: 'ok',
      latency_ms: Date.now() - started,
    }
  } catch (err) {
    return {
      name,
      healthy: false,
      message: err instanceof Error ? err.message : String(err),
      latency_ms: Date.now() - started,
    }
  }
}

/**
 * Options for the health gate.
 */
export interface HealthGateOptions {
  readonly agent?: AgentResponder | null
  readonly executor?: QueryExecutor | null
  readonly judge?: JudgeExecutor | null
  readonly timeoutMs?: number
}

/**
 * Run the pre-flight health gate. Checks each collaborator that is provided.
 * Returns a result indicating whether all checks passed.
 *
 * @param opts - the collaborators to check.
 * @returns the health gate result.
 */
export async function runHealthGate(opts: HealthGateOptions): Promise<HealthGateResult> {
  const timeoutMs = opts.timeoutMs ?? HEALTH_CHECK_TIMEOUT_MS
  const checks: HealthCheckResult[] = []

  if (opts.agent) {
    const agent = opts.agent
    checks.push(await runCheck('agent_responder', async () => {
      const response = await agent.respond('health check: echo test', { session_id: '__health_check__' })
      if (!response.reply) throw new Error('agent returned empty reply')
    }, timeoutMs))
  }

  if (opts.executor) {
    const executor = opts.executor
    checks.push(await runCheck('query_executor', async () => {
      const result = await executor.execute('SELECT 1 AS health_check')
      if (!result.success) throw new Error(`query failed: ${result.error ?? 'unknown'}`)
    }, timeoutMs))
  }

  if (opts.judge) {
    const judge = opts.judge
    checks.push(await runCheck('judge_provider', async () => {
      const result = await judge.judge('42', '42', 'What is the answer?')
      if (result.error) throw new Error(`judge error: ${result.error}`)
    }, timeoutMs))
  }

  // If no collaborators are provided, still pass (the runner may be in dry-run or stub mode)
  const passed = checks.length === 0 || checks.every(c => c.healthy)

  return {
    passed,
    checks,
    timestamp: new Date().toISOString(),
  }
}
