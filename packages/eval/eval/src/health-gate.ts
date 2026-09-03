/**
 * Health-gate — pre-run checks that fast-fail before burning eval budget.
 *
 * G1 Q9: every run starts with a health check. If it fails, the run is aborted
 * immediately and does NOT produce eval results (the failure is infrastructure,
 * not model performance — it must not pollute correct/wrong counts).
 *
 * Checks:
 * 1. Connectivity: can we reach the query executor?
 * 2. Credentials: does the responder respond to a trivial ping?
 *
 * @module @deepseek-ai/dsh-eval/health-gate
 */

import type { CaseSqlExecutor, Responder } from './types.ts'

/** Result of a health check. */
export interface HealthCheckResult {
  readonly healthy: boolean
  readonly checks: readonly CheckResult[]
  readonly error?: string
}

/** One individual check result. */
export interface CheckResult {
  readonly name: string
  readonly passed: boolean
  readonly detail: string
  readonly durationMs: number
}

/** Options for the health gate. */
export interface HealthGateOptions {
  readonly responder?: Responder | null
  readonly executeSql?: CaseSqlExecutor | null
  readonly timeoutMs?: number
}

/**
 * Run all health checks. Returns immediately on first failure when
 * `failFast` is true (default).
 */
export async function runHealthCheck(opts: HealthGateOptions): Promise<HealthCheckResult> {
  const checks: CheckResult[] = []
  const timeoutMs = opts.timeoutMs ?? 10000

  if (opts.executeSql) {
    const check = await checkConnectivity(opts.executeSql, timeoutMs)
    checks.push(check)
    if (!check.passed) {
      return { healthy: false, checks, error: `connectivity check failed: ${check.detail}` }
    }
  }

  if (opts.responder) {
    const check = await checkResponder(opts.responder, timeoutMs)
    checks.push(check)
    if (!check.passed) {
      return { healthy: false, checks, error: `responder check failed: ${check.detail}` }
    }
  }

  return { healthy: true, checks }
}

/** Check SQL executor connectivity with a trivial query. */
async function checkConnectivity(executeSql: CaseSqlExecutor, timeoutMs: number): Promise<CheckResult> {
  const started = Date.now()
  try {
    const result = await withTimeout(executeSql('SELECT 1'), timeoutMs)
    const durationMs = Date.now() - started
    if (result.success) {
      return { name: 'connectivity', passed: true, detail: `OK (${durationMs}ms)`, durationMs }
    }
    return { name: 'connectivity', passed: false, detail: `query failed: ${result.error ?? 'unknown'}`, durationMs }
  } catch (err) {
    const durationMs = Date.now() - started
    return { name: 'connectivity', passed: false, detail: `exception: ${describeError(err)}`, durationMs }
  }
}

/** Check that the responder is alive by sending a trivial message. */
async function checkResponder(responder: Responder, timeoutMs: number): Promise<CheckResult> {
  const started = Date.now()
  try {
    await withTimeout(
      responder({ sessionId: '__health_check__', caseId: '__health_check__', scopeId: null, turnIndex: 0, message: 'ping' }),
      timeoutMs,
    )
    const durationMs = Date.now() - started
    return { name: 'responder', passed: true, detail: `OK (${durationMs}ms)`, durationMs }
  } catch (err) {
    const durationMs = Date.now() - started
    const msg = describeError(err)
    const isAuth = msg.includes('401') || msg.includes('unauthorized') || msg.includes('credential')
    return { name: 'responder', passed: false, detail: `${isAuth ? 'auth failure' : 'exception'}: ${msg}`, durationMs }
  }
}

/** Race a promise against a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() =>{  reject(new Error(`health check timed out after ${ms}ms`)) }, ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e: unknown) => { clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))) },
    )
  })
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
