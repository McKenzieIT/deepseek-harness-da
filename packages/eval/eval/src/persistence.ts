/**
 * Eval result persistence — JSONL store + delta computation.
 *
 * Storage format: one JSON line per case result (JSONL), file name encodes
 * `{timestamp}_{runId}.jsonl`. This aligns with the evidence-query
 * `EvalResultRecord` interface for querying.
 *
 * @module @deepseek-ai/dsh-eval/persistence
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import type { BatchResult, ClassifiedCaseResult, CaseOutcome } from './runner.ts'

/** One persisted line in the JSONL file. */
export interface PersistedCaseRecord {
  readonly runId: string
  readonly timestamp: string
  readonly caseId: string
  readonly outcome: CaseOutcome
  readonly verdict: string | null
  readonly passed: boolean
  readonly passK: number
  readonly latencyMs: number
  readonly attemptsCount: number
  readonly errorsCount: number
}

/** A flip: one case whose outcome changed between two runs. */
export interface CaseFlip {
  readonly caseId: string
  readonly before: CaseOutcome
  readonly after: CaseOutcome
}

/** Delta report between two runs. */
export interface DeltaReport {
  readonly runIdA: string
  readonly runIdB: string
  readonly flipped: readonly CaseFlip[]
  readonly summary: {
    readonly improved: number
    readonly regressed: number
    readonly unchanged: number
    readonly newCases: number
    readonly removedCases: number
  }
}

/** Metadata from a run file name. */
export interface RunFileMeta {
  readonly timestamp: string
  readonly runId: string
  readonly path: string
}

/**
 * Persist a `BatchResult` as JSONL to the given directory (synchronous write).
 * Creates the directory if it doesn't exist. Sync is intentional: persistence
 * runs after the batch completes (not on the hot path) and simplifies error
 * handling for the caller.
 * @returns the file path written.
 */
export function persistBatchResult(result: BatchResult, dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const safeTimestamp = result.timestamp.replace(/[:.]/g, '-')
  const filename = `${safeTimestamp}_${result.runId}.jsonl`
  const path = join(dir, filename)

  const lines = result.perCase.map(c => JSON.stringify(toPersisted(c, result)))
  writeFileSync(path, lines.join('\n') + '\n', 'utf8')
  return path
}

/** Convert a classified case result + batch context to a persisted record. */
function toPersisted(c: ClassifiedCaseResult, batch: BatchResult): PersistedCaseRecord {
  return {
    runId: batch.runId,
    timestamp: batch.timestamp,
    caseId: c.caseId,
    outcome: c.outcome,
    verdict: c.verdict,
    passed: c.result.passed,
    passK: batch.passK,
    latencyMs: c.result.latencyMs,
    attemptsCount: c.result.attempts.length,
    errorsCount: c.result.attempts.filter(a => a.error !== null).length,
  }
}

/**
 * Load all persisted records from a JSONL file.
 * @param path - the JSONL file path.
 * @returns the records, in file order.
 */
export function loadRunRecords(path: string): PersistedCaseRecord[] {
  const text = readFileSync(path, 'utf8')
  return text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as PersistedCaseRecord)
}

/**
 * List all run files in a directory, sorted by timestamp (oldest first).
 */
export function listRunFiles(dir: string): RunFileMeta[] {
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'))
  return files
    .map(f => parseRunFilename(f, dir))
    .filter((m): m is RunFileMeta => m !== null)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

/** Parse a run filename into metadata. Format: `{safeTimestamp}_{runId}.jsonl` where safeTimestamp has no underscores (colons/dots replaced with dashes by persistBatchResult). */
function parseRunFilename(filename: string, dir: string): RunFileMeta | null {
  const base = basename(filename, '.jsonl')
  // The timestamp portion never contains underscores (ISO with :-. replaced by -).
  // Split on the FIRST underscore to handle runIds that contain underscores.
  const firstUnderscore = base.indexOf('_')
  if (firstUnderscore < 0) return null
  const timestamp = base.slice(0, firstUnderscore)
  const runId = base.slice(firstUnderscore + 1)
  if (!timestamp || !runId) return null
  return { timestamp, runId, path: join(dir, filename) }
}

/**
 * Compute the delta between two runs: which cases flipped outcome.
 * "Improved" = moved toward correct; "regressed" = moved away from correct.
 */
export function computeDelta(runA: readonly PersistedCaseRecord[], runB: readonly PersistedCaseRecord[]): DeltaReport {
  const mapA = new Map(runA.map(r => [r.caseId, r]))
  const mapB = new Map(runB.map(r => [r.caseId, r]))
  const runIdA = runA[0]?.runId ?? 'unknown'
  const runIdB = runB[0]?.runId ?? 'unknown'

  const flipped: CaseFlip[] = []
  let improved = 0
  let regressed = 0
  let unchanged = 0
  let newCases = 0
  let removedCases = 0

  const allCaseIds = new Set([...mapA.keys(), ...mapB.keys()])
  for (const caseId of allCaseIds) {
    const a = mapA.get(caseId)
    const b = mapB.get(caseId)

    if (!a && b) { newCases++; continue }
    if (a && !b) { removedCases++; continue }
    if (!a || !b) continue

    if (a.outcome === b.outcome) {
      unchanged++
    } else {
      flipped.push({ caseId, before: a.outcome, after: b.outcome })
      if (isImprovement(a.outcome, b.outcome)) improved++
      else regressed++
    }
  }

  return { runIdA, runIdB, flipped, summary: { improved, regressed, unchanged, newCases, removedCases } }
}

/** Outcome ordering: correct > declined > wrong > unjudged. */
const OUTCOME_RANK: Record<CaseOutcome, number> = { correct: 3, declined: 2, wrong: 1, unjudged: 0 }

/** Whether moving from `before` to `after` is an improvement. */
function isImprovement(before: CaseOutcome, after: CaseOutcome): boolean {
  return OUTCOME_RANK[after] > OUTCOME_RANK[before]
}

/**
 * Compute pass_at_k aggregation across a set of records.
 * pass@k = fraction of cases where ALL k attempts passed.
 *
 * IMPORTANT: records must be from a SINGLE run. Passing records from multiple
 * runs produces a meaningless ratio (same caseId appears multiple times).
 * Use `loadRunRecords(path)` to get a single-run record set.
 */
export function passAtK(records: readonly PersistedCaseRecord[]): number {
  if (records.length === 0) return 0
  const passing = records.filter(r => r.passed).length
  return passing / records.length
}
