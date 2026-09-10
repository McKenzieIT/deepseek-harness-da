/**
 * Staleness report for the tracked upstream sync — never a gate.
 *
 * Exits 0 even when every signal is unknown: this is a report, not a
 * pass/fail check. Prints a human-readable staleness report to stdout,
 * writes an impact-report file under `upstream-sync/`, and reports the
 * pending-waiver count.
 *
 * Refuses to print a behind-count derived from a stale or absent
 * `upstream/master` ref. An unfetched ref would under-report (the
 * false-green failure mode this report exists to prevent — at UM15
 * writing time `upstream/master` pointed at `5dda764ed3` while the true
 * remote HEAD was `2377c272a8`). Behind-count is printed only when the
 * tracking ref is `fresh` (local `upstream/master` === remote HEAD).
 *
 * `RefState`:
 * - `fresh` — local tracking ref and remote HEAD both present and equal.
 * - `stale` — both present but differing.
 * - `unknown` — either absent, or the fetch / `ls-remote` probe failed.
 *
 * `--no-fetch` skips the network fetch and consults `git ls-remote`
 * instead, so a stale local ref is never trusted as the remote truth.
 *
 * @module scripts/upstream-status
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  UPSTREAM_SYNC_RECORD,
  REPOSITORY_ROOT,
  daysSinceSync,
  pendingWaivers,
  readUpstreamSyncRecord,
  type UpstreamSyncRecord,
} from './upstream-sync-record.ts'

/** Freshness of the `upstream/master` tracking ref. */
type RefState = 'fresh' | 'stale' | 'unknown'

/** Outcome of probing the upstream tracking ref against the remote. */
interface RefProbe {
  readonly state: RefState
  /** Local `upstream/master` sha, empty string when the ref is absent. */
  readonly localSha: string
  /** Remote upstream HEAD sha, empty string when the probe failed. */
  readonly remoteSha: string
  /** Human-readable explanation when `state` is not `fresh`. */
  readonly note: string
}

const UPSTREAM_REMOTE = 'upstream'
const UPSTREAM_BRANCH = 'master'
const UPSTREAM_TRACKING_REF = 'upstream/master'
const SHORT_SHA_LEN = 10
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/

/**
 * Run one read-only Git subprocess and return its stdout/stderr/ok.
 * Never throws — Git failures degrade to `{ ok: false }`.
 */
function git(root: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  if (result.error !== undefined) {
    return { ok: false, stdout: '', stderr: result.error.message }
  }
  return { ok: result.status === 0, stdout: result.stdout, stderr: result.stderr }
}

/** Abbreviate a 40-hex sha to 10 characters for diagnostics. */
function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA_LEN)
}

/** Today's date as `YYYY-MM-DD` (impact-report filename component). */
function todayIsoDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Whether `value` is a full 40-hex commit sha. */
function isFullSha(value: string): boolean {
  return FULL_SHA_PATTERN.test(value)
}

/** Whether the named Git remote is configured. */
function remoteExists(root: string, remote: string): boolean {
  const result = git(root, ['remote'])
  if (!result.ok) return false
  return result.stdout.split('\n').includes(remote)
}

/** Local `upstream/master` sha, or empty string when the ref is absent. */
function localTrackingSha(root: string): string {
  const result = git(root, ['rev-parse', '--verify', '--quiet', UPSTREAM_TRACKING_REF])
  if (!result.ok) return ''
  return result.stdout.trim()
}

/**
 * Remote upstream HEAD sha. Fetches by default; `--no-fetch` consults
 * `git ls-remote` instead (no local ref update). Returns an empty sha
 * with a note when the probe fails.
 */
function remoteSha(root: string, noFetch: boolean): { sha: string; note: string } {
  if (noFetch) {
    const result = git(root, ['ls-remote', UPSTREAM_REMOTE, UPSTREAM_BRANCH])
    if (!result.ok) {
      return {
        sha: '',
        note: `ls-remote ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH} failed: ${result.stderr.trim()}`,
      }
    }
    const firstLine = result.stdout.split('\n')[0]
    if (firstLine === undefined || firstLine === '') {
      return {
        sha: '',
        note: `ls-remote ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH} returned no output`,
      }
    }
    const sha = firstLine.split('\t')[0]
    if (sha === undefined || !isFullSha(sha.trim())) {
      return { sha: '', note: `ls-remote output unparseable: ${firstLine}` }
    }
    return { sha: sha.trim(), note: '' }
  }
  const fetchResult = git(root, ['fetch', UPSTREAM_REMOTE, UPSTREAM_BRANCH])
  if (!fetchResult.ok) {
    return {
      sha: '',
      note: `fetch ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH} failed: ${fetchResult.stderr.trim()}`,
    }
  }
  const sha = localTrackingSha(root)
  return sha === ''
    ? { sha: '', note: 'upstream/master absent after fetch' }
    : { sha, note: '' }
}

/**
 * Determine the `RefState` of `upstream/master` by comparing the local
 * tracking ref against the remote HEAD. Never throws.
 */
function probeRef(root: string, noFetch: boolean): RefProbe {
  if (!remoteExists(root, UPSTREAM_REMOTE)) {
    return {
      state: 'unknown',
      localSha: '',
      remoteSha: '',
      note: `no '${UPSTREAM_REMOTE}' git remote configured`,
    }
  }
  const local = localTrackingSha(root)
  const remote = remoteSha(root, noFetch)
  if (local === '' || remote.sha === '') {
    const note = local === '' && remote.sha === ''
      ? 'local tracking ref and remote HEAD both absent'
      : local === ''
        ? 'local tracking ref absent'
        : remote.note === ''
          ? 'remote HEAD absent'
          : remote.note
    return { state: 'unknown', localSha: local, remoteSha: remote.sha, note }
  }
  if (local === remote.sha) {
    return { state: 'fresh', localSha: local, remoteSha: remote.sha, note: '' }
  }
  return {
    state: 'stale',
    localSha: local,
    remoteSha: remote.sha,
    note: 'local tracking ref differs from remote HEAD',
  }
}

/** Commits reachable from `head` but not from `base`, or `undefined` on failure. */
function commitsBehind(root: string, base: string, head: string): number | undefined {
  const result = git(root, ['rev-list', '--count', `${base}..${head}`])
  if (!result.ok) return undefined
  const parsed = Number.parseInt(result.stdout.trim(), 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

/** `git merge-base` sha of two refs, or empty string on failure. */
function mergeBase(root: string, a: string, b: string): string {
  const result = git(root, ['merge-base', a, b])
  if (!result.ok) return ''
  return result.stdout.trim()
}

/** Whole days since the last sync, or `undefined` when unparseable / malformed. */
function safeDaysSince(record: UpstreamSyncRecord): number | undefined {
  try {
    return daysSinceSync(record, new Date())
  } catch {
    return undefined
  }
}

/** Pending-waiver count, or `0` when the record is malformed. */
function safePendingCount(record: UpstreamSyncRecord): number {
  try {
    return pendingWaivers(record).length
  } catch {
    return 0
  }
}

/** Staleness thresholds from the record, or `undefined` when malformed. */
function safeThresholds(record: UpstreamSyncRecord): {
  days: number | undefined
  commits: number | undefined
} {
  try {
    return {
      days: record.thresholds.daysSinceSync,
      commits: record.thresholds.commitsBehind,
    }
  } catch {
    return { days: undefined, commits: undefined }
  }
}

/** `record.current.upstreamSha`, or `'unreadable'` when the record is malformed. */
function safeCurrentSha(record: UpstreamSyncRecord): string {
  try {
    return record.current.upstreamSha
  } catch {
    return 'unreadable'
  }
}

/** Format the one-line ref-state summary. */
function formatRefLine(probe: RefProbe): string {
  if (probe.state === 'fresh') {
    return `upstream-status: ref state = fresh (upstream/master = ${shortSha(probe.localSha)})`
  }
  if (probe.state === 'stale') {
    return `upstream-status: ref state = stale (local ${shortSha(probe.localSha)} ≠ remote ${shortSha(probe.remoteSha)})`
  }
  return `upstream-status: ref state = unknown (${probe.note})`
}

/**
 * Write the impact-report file. Returns the path; never throws — a write
 * failure is silent (the stdout report still carries the staleness findings).
 */
function writeImpactReport(root: string, base: string, remote: string, date: string, summary: string): string {
  const dir = resolve(root, 'upstream-sync')
  const path = resolve(dir, `upstream-impact-${base}..${remote}-${date}.md`)
  const content = [
    '# Upstream Impact Report',
    '',
    `- date: ${date}`,
    `- record-base-short: ${base}`,
    `- remote-head-short: ${remote}`,
    '',
    '## staleness report',
    '',
    '```',
    summary,
    '```',
    '',
  ].join('\n')
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(path, content)
  } catch {
    // Directory creation or write failed — return the path; the report never fails.
  }
  return path
}

/**
 * Produce the staleness report lines. Reads the record, probes the ref,
 * evaluates thresholds and merge-base, and writes the impact-report file.
 * Never throws; always exits 0 at the caller.
 */
function reportUpstreamStatus(root: string, noFetch: boolean): string[] {
  const lines: string[] = []

  let record: UpstreamSyncRecord
  try {
    record = readUpstreamSyncRecord(root)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    lines.push(`upstream-status: ${UPSTREAM_SYNC_RECORD} unreadable — ${message}`)
    lines.push('upstream-status: ref state = unknown (record unreadable)')
    lines.push('upstream-status: behind-count withheld — ref stale/unknown (an unfetched ref would under-report → false green)')
    lines.push('upstream-status: pending waivers: 0 (record unreadable)')
    const impactPath = writeImpactReport(root, 'unreadable', 'unknown', todayIsoDate(), lines.join('\n'))
    lines.push(`upstream-status: impact report written to ${impactPath}`)
    return lines
  }

  const probe = probeRef(root, noFetch)
  lines.push(formatRefLine(probe))

  const currentSha = safeCurrentSha(record)
  const thresholds = safeThresholds(record)
  const remoteShort = probe.state === 'fresh' ? shortSha(probe.remoteSha) : 'unknown'

  // Behind-count: refused unless fresh.
  if (probe.state === 'fresh') {
    const behind = commitsBehind(root, currentSha, probe.remoteSha)
    if (behind === undefined) {
      lines.push('upstream-status: behind-count withheld (git rev-list failed)')
    } else {
      lines.push(`upstream-status: behind-count = ${behind} commits (${shortSha(currentSha)}..${remoteShort})`)
      if (thresholds.commits !== undefined && behind > thresholds.commits) {
        lines.push(`upstream-status: ${behind} commits behind, exceeds threshold ${thresholds.commits}`)
      }
    }
  } else {
    lines.push('upstream-status: behind-count withheld — ref stale/unknown (an unfetched ref would under-report → false green)')
  }

  // Days since sync.
  const days = safeDaysSince(record)
  if (days !== undefined) {
    if (thresholds.days !== undefined && days > thresholds.days) {
      lines.push(`upstream-status: ${days} days since sync, exceeds threshold ${thresholds.days}`)
    } else if (thresholds.days !== undefined) {
      lines.push(`upstream-status: ${days} days since sync (threshold ${thresholds.days})`)
    } else {
      lines.push(`upstream-status: ${days} days since sync (threshold unknown)`)
    }
  } else {
    lines.push('upstream-status: days since sync unknown (syncedAt unparseable or record malformed)')
  }

  // Merge-base disagrees (only when the local tracking ref is present).
  if (probe.localSha !== '') {
    const mb = mergeBase(root, 'HEAD', UPSTREAM_TRACKING_REF)
    if (mb !== '' && mb !== currentSha) {
      lines.push(
        `upstream-status: merge-base disagrees: record.current.upstreamSha is ${shortSha(currentSha)} but merge-base(HEAD, ${UPSTREAM_TRACKING_REF}) is ${shortSha(mb)}`,
      )
    }
  }

  // Pending waivers.
  const pending = safePendingCount(record)
  lines.push(`upstream-status: pending waivers: ${pending}`)

  // Impact report file (staleness summary without the meta line).
  const impactPath = writeImpactReport(root, shortSha(currentSha), remoteShort, todayIsoDate(), lines.join('\n'))
  lines.push(`upstream-status: impact report written to ${impactPath}`)

  return lines
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const noFetch = process.argv.includes('--no-fetch')
  const lines = reportUpstreamStatus(REPOSITORY_ROOT, noFetch)
  for (const line of lines) {
    process.stdout.write(`${line}\n`)
  }
}
