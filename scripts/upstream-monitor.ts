/**
 * Gate: turn the upstream staleness findings into an actionable signal.
 *
 * `scripts/upstream-status.ts` is a report and exits 0 by contract, so
 * scheduling it can never fail a job — an always-successful run is not
 * monitoring. This gate reads the same record and the same ref probe and
 * converts three classes of finding into a non-zero exit:
 *
 * - `stale-threshold` (1) — days since sync or commits behind exceeded the
 *   thresholds the record itself declares.
 * - `invalid-record` (2) — the record is unreadable, violates its shape
 *   contract, or names an upstream commit this checkout never absorbed.
 * - `remote-unavailable` (3) — the upstream remote could not be probed, so
 *   staleness is unknowable rather than absent.
 * - `indeterminate` (4) — the tracking ref is stale or a count is missing,
 *   so freshness cannot be proven. Never reported as success: an unfetched
 *   ref under-reports, which is the false green this gate exists to catch.
 *
 * Staleness deliberately stays out of `verify-upstream-sync-record` (a PR
 * gate): upstream moves independently of any PR, so a behind-count gate
 * would fail unrelated PRs and be disabled within a week. It belongs on a
 * schedule, which is what `.github/workflows/upstream-monitor.yml` runs.
 *
 * `--root <path>` monitors another checkout, `--no-fetch` consults
 * `git ls-remote` instead of fetching, and `--report <path>` writes the
 * verdict to a file so a failing scheduled run still leaves an artifact.
 *
 * @module scripts/upstream-monitor
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  UPSTREAM_SYNC_RECORD,
  REPOSITORY_ROOT,
  collectShapeFailures,
  daysSinceSync,
  readUpstreamSyncRecord,
  type UpstreamSyncRecord,
} from './upstream-sync-record.ts'
import { commitsBehind, probeRef } from './upstream-status.ts'

/** What the monitor concluded about the fork's upstream position. */
export type MonitorVerdict = 'fresh' | 'stale-threshold' | 'invalid-record' | 'remote-unavailable' | 'indeterminate'

/** Process exit code per verdict; every non-fresh verdict fails the job. */
const EXIT_CODE: Record<MonitorVerdict, number> = {
  fresh: 0,
  'stale-threshold': 1,
  'invalid-record': 2,
  'remote-unavailable': 3,
  indeterminate: 4,
}

/** Whether this checkout actually absorbed the recorded upstream commit. */
type Absorption = 'absorbed' | 'unmerged' | 'absent'

const SHORT_SHA_LEN = 10
const LINE_PREFIX = 'upstream-monitor:'

/** Outcome of one monitor run: the verdict, its exit code, and the report lines. */
export interface MonitorResult {
  readonly verdict: MonitorVerdict
  readonly exitCode: number
  readonly lines: readonly string[]
}

/** Monitor inputs; `now` is injectable so day arithmetic is testable. */
export interface MonitorOptions {
  readonly noFetch: boolean
  readonly now?: Date
}

/** Abbreviate a 40-hex sha for diagnostics. */
function abbreviate(sha: string): string {
  return sha.slice(0, SHORT_SHA_LEN)
}

/** Whether a read-only Git subprocess succeeded. Never throws. */
function gitSucceeds(root: string, args: string[]): boolean {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  if (result.error !== undefined) return false
  return result.status === 0
}

/**
 * Classify the recorded upstream commit against this checkout: absorbed by
 * `HEAD`, present but unmerged, or absent from the object store entirely.
 */
function absorption(root: string, upstreamSha: string): Absorption {
  if (!gitSucceeds(root, ['cat-file', '-e', `${upstreamSha}^{commit}`])) return 'absent'
  return gitSucceeds(root, ['merge-base', '--is-ancestor', upstreamSha, 'HEAD']) ? 'absorbed' : 'unmerged'
}

/** Attach the verdict line and its exit code to the collected findings. */
function conclude(verdict: MonitorVerdict, lines: string[]): MonitorResult {
  const exitCode = EXIT_CODE[verdict]
  return { verdict, exitCode, lines: [...lines, `${LINE_PREFIX} verdict = ${verdict} (exit ${exitCode})`] }
}

/**
 * Evaluate the fork's upstream position. Reads the record, verifies the
 * recorded commit is really in this history, probes the remote, then
 * compares both staleness measures against the record's own thresholds.
 */
export function monitorUpstream(root: string, options: MonitorOptions): MonitorResult {
  const lines: string[] = []

  let record: UpstreamSyncRecord
  try {
    record = readUpstreamSyncRecord(root)
  } catch (cause) {
    lines.push(`${LINE_PREFIX} ${cause instanceof Error ? cause.message : String(cause)}`)
    return conclude('invalid-record', lines)
  }

  const shapeFailures = collectShapeFailures(record)
  if (shapeFailures.length > 0) {
    lines.push(`${LINE_PREFIX} ${UPSTREAM_SYNC_RECORD} violates its shape contract:`)
    for (const failure of shapeFailures) lines.push(`${LINE_PREFIX}   ${failure}`)
    return conclude('invalid-record', lines)
  }

  const recorded = record.current.upstreamSha
  const state = absorption(root, recorded)
  if (state === 'unmerged') {
    lines.push(`${LINE_PREFIX} recorded upstream ${abbreviate(recorded)} is not an ancestor of HEAD — this checkout never absorbed it`)
    return conclude('invalid-record', lines)
  }
  if (state === 'absent') {
    lines.push(`${LINE_PREFIX} recorded upstream ${abbreviate(recorded)} is absent from this checkout — ancestry not verifiable`)
    return conclude('indeterminate', lines)
  }
  lines.push(`${LINE_PREFIX} recorded upstream ${abbreviate(recorded)} is an ancestor of HEAD`)

  const probe = probeRef(root, options.noFetch)
  if (probe.state === 'unknown') {
    lines.push(`${LINE_PREFIX} ref state = unknown (${probe.note})`)
    return conclude('remote-unavailable', lines)
  }
  if (probe.state === 'stale') {
    lines.push(`${LINE_PREFIX} ref state = stale (local ${abbreviate(probe.localSha)}, remote ${abbreviate(probe.remoteSha)})`)
    lines.push(`${LINE_PREFIX} behind-count withheld — a stale ref under-reports, so freshness is unproven`)
    return conclude('indeterminate', lines)
  }
  lines.push(`${LINE_PREFIX} ref state = fresh (upstream/master = ${abbreviate(probe.remoteSha)})`)

  const behind = commitsBehind(root, recorded, probe.remoteSha)
  if (behind === undefined) {
    lines.push(`${LINE_PREFIX} behind-count unavailable (git rev-list failed)`)
    return conclude('indeterminate', lines)
  }
  lines.push(`${LINE_PREFIX} behind-count = ${behind} commits (${abbreviate(recorded)}..${abbreviate(probe.remoteSha)})`)

  const days = daysSinceSync(record, options.now ?? new Date())
  if (days === undefined) {
    lines.push(`${LINE_PREFIX} days since sync unavailable (syncedAt unparseable)`)
    return conclude('indeterminate', lines)
  }
  lines.push(`${LINE_PREFIX} days since sync = ${days}`)

  const exceeded: string[] = []
  if (behind > record.thresholds.commitsBehind) {
    exceeded.push(`${behind} commits behind, exceeds threshold ${record.thresholds.commitsBehind}`)
  }
  if (days > record.thresholds.daysSinceSync) {
    exceeded.push(`${days} days since sync, exceeds threshold ${record.thresholds.daysSinceSync}`)
  }
  if (exceeded.length > 0) {
    for (const reason of exceeded) lines.push(`${LINE_PREFIX} ${reason}`)
    lines.push(`${LINE_PREFIX} remediation: sync the fork to upstream/master and record it with pnpm run upstream-sync-record`)
    return conclude('stale-threshold', lines)
  }

  lines.push(`${LINE_PREFIX} within both thresholds (${record.thresholds.commitsBehind} commits, ${record.thresholds.daysSinceSync} days)`)
  return conclude('fresh', lines)
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const argv = process.argv.slice(2)
  const rootFlag = argv.indexOf('--root')
  const reportFlag = argv.indexOf('--report')
  const root = rootFlag === -1 ? REPOSITORY_ROOT : resolve(argv[rootFlag + 1] ?? REPOSITORY_ROOT)
  const result = monitorUpstream(root, { noFetch: argv.includes('--no-fetch') })
  for (const line of result.lines) process.stdout.write(`${line}\n`)
  const reportPath = reportFlag === -1 ? undefined : argv[reportFlag + 1]
  if (reportPath !== undefined) {
    const absolute = resolve(reportPath)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, `${result.lines.join('\n')}\n`)
    process.stdout.write(`${LINE_PREFIX} report written to ${absolute}\n`)
  }
  process.exitCode = result.exitCode
}
