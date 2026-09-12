/**
 * Parse, validate, and Git-verify the tracked upstream sync record.
 *
 * `upstream-sync.json` declares which upstream commit each fork-side merge
 * absorbed. Git is the ground truth; the record exists so the two can disagree,
 * and that disagreement is the alarm. Consumers are the
 * `verify-upstream-sync-record` gate and the `upstream-status` report.
 *
 * Three merge-integrity checks run per recorded window on `git diff-tree` alone
 * — no build, no `pnpm install`, no `upstream` remote-tracking ref — and catch
 * the three loss classes a compiler is structurally blind to: an upstream
 * deletion the merge never applied, an upstream file the merge dropped, and an
 * upstream modification the merge reverted to the merge base. History this
 * checkout does not carry degrades to skipped, never to failed.
 *
 * Record-versus-Git disagreements are returned as failure strings. Git output
 * that violates the plumbing contract throws, because that is an environment or
 * programming defect rather than a record the author can fix.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Repository-relative path of the tracked upstream sync record. */
export const UPSTREAM_SYNC_RECORD = 'upstream-sync.json'

/** Absolute repository root, derived from this module's own location. */
export const REPOSITORY_ROOT = resolve(import.meta.dirname, '..')

/** Maximum buffered stdout for the read-only Git subprocesses this module owns. */
const GIT_MAX_BUFFER = 1 << 26

/** Remote-tracking ref consulted, when present, to cross-check the recorded base. */
const UPSTREAM_TRACKING_REF = 'refs/remotes/upstream/master'

const FULL_SHA = /^[0-9a-f]{40}$/
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/
const RAW_ENTRY = /^:\d{6} \d{6} [0-9a-f]+ [0-9a-f]+ ([ADMT])$/

/**
 * Which side of a merge kept its content for one diverged path.
 *
 * - `keep-fork` — upstream deleted the path in the window; the merge kept it.
 * - `drop-fork` — upstream carried the path; the merge does not have it.
 * - `revert-fork` — upstream changed the path; the merge holds merge-base content.
 */
export type WaiverDirection = 'keep-fork' | 'drop-fork' | 'revert-fork'

/**
 * Adjudication state of one divergence. The subject is the fork's divergence,
 * not the file: `keep` accepts it permanently, `drop` records it as wrong with
 * remediation owed through `ticket`, `pending` means nobody has decided yet.
 */
export type WaiverDecision = 'pending' | 'keep' | 'drop'

const WAIVER_DIRECTIONS = ['keep-fork', 'drop-fork', 'revert-fork'] as const
const WAIVER_DECISIONS = ['pending', 'keep', 'drop'] as const

/** One adjudicated — or explicitly unadjudicated — merge-integrity divergence. */
export interface Waiver {
  /** Repository-relative path, or a `/`-terminated directory prefix covering a group. */
  path: string
  direction: WaiverDirection
  decision: WaiverDecision
  /** Ticket id that owns the divergence. Deliberately not resolved against the filesystem. */
  ticket: string
}

/** One recorded upstream sync. */
export interface UpstreamSync {
  /** Full 40-hex sha of the upstream commit this sync absorbed. */
  upstreamSha: string
  /** Committer date of `upstreamSha` as `git show -s --format=%cI` prints it. */
  upstreamCommittedAt: string
  /** Full 40-hex sha of the fork-side merge commit whose second parent is `upstreamSha`. */
  mergeCommit: string
  /** Committer date of `mergeCommit` as `git show -s --format=%cI` prints it. */
  syncedAt: string
  /** Upstream release tag at `upstreamSha`, when the sync landed on a tagged commit. */
  upstreamTag?: string
}

/** Staleness alarm thresholds consumed by the reporting command, never by the gate. */
export interface UpstreamSyncThresholds {
  daysSinceSync: number
  commitsBehind: number
}

/** The complete tracked record. */
export interface UpstreamSyncRecord {
  current: UpstreamSync
  /** Prior syncs, oldest first. */
  history: UpstreamSync[]
  thresholds: UpstreamSyncThresholds
  waivers: Waiver[]
}

/** Outcome of the Git-side checks. */
export interface GitFailureReport {
  /** Record-versus-Git disagreements and unwaived merge-integrity findings. */
  failures: string[]
  /** Checks this checkout cannot perform. Never fail CI on these. */
  skipped: string[]
  /** Per-window accounting and unmatched waivers, for the report tail. */
  notes: string[]
}

/**
 * Read and JSON-parse the tracked record.
 *
 * @param root - Absolute repository root.
 * @returns The record as declared. Structure is asserted, not validated; run
 *   {@link collectShapeFailures} on the result before trusting any field.
 * @throws Error when the file is absent or is not valid JSON.
 */
export function readUpstreamSyncRecord(root: string = REPOSITORY_ROOT): UpstreamSyncRecord {
  const absolute = resolve(root, UPSTREAM_SYNC_RECORD)
  let text: string
  try {
    text = readFileSync(absolute, 'utf8')
  } catch (cause) {
    throw new Error(`${UPSTREAM_SYNC_RECORD} could not be read at ${absolute}`, { cause })
  }
  try {
    return JSON.parse(text) as UpstreamSyncRecord
  } catch (cause) {
    throw new Error(`${UPSTREAM_SYNC_RECORD} is not valid JSON`, { cause })
  }
}

/**
 * Validate the record's structure without touching Git.
 *
 * Accepts `unknown` on purpose: the caller holds an asserted
 * {@link UpstreamSyncRecord} whose declared types would make every runtime guard
 * below look unnecessary to the linter, and would make a malformed file crash
 * instead of report.
 *
 * @param record - Parsed record contents.
 * @returns One human-readable failure per structural defect; empty when sound.
 */
export function collectShapeFailures(record: unknown): string[] {
  const row = asObject(record)
  if (row === undefined) return [`${UPSTREAM_SYNC_RECORD} must contain a JSON object`]

  const failures: string[] = []
  const current = collectSyncFailures(row['current'], 'current', failures)

  const historyRaw = row['history']
  const history: UpstreamSync[] = []
  if (!Array.isArray(historyRaw)) {
    failures.push('history must be an array of prior syncs, oldest first (use [] for none)')
  } else {
    for (const [index, entry] of historyRaw.entries()) {
      const parsed = collectSyncFailures(entry, `history[${index}]`, failures)
      if (parsed !== undefined) history.push(parsed)
    }
  }

  collectThresholdFailures(row['thresholds'], failures)
  collectWaiverFailures(row['waivers'], failures)

  if (current !== undefined && history.length === historyRaw_length(historyRaw)) {
    collectChronologyFailures([...history, current], failures)
  }
  return failures
}

/**
 * Cross-check the record against Git and run the three merge-integrity gates on
 * every recorded window.
 *
 * Only call this after {@link collectShapeFailures} returns empty.
 *
 * @param record - Shape-validated record.
 * @param root - Absolute repository root.
 * @returns Failures, skipped checks, and per-window accounting notes.
 */
export function collectGitFailures(
  record: UpstreamSyncRecord,
  root: string = REPOSITORY_ROOT,
): GitFailureReport {
  const report: GitFailureReport = { failures: [], skipped: [], notes: [] }
  const hits = new Map<number, number>()
  const syncs = [
    ...record.history.map((sync, index) => ({ sync, label: `history[${index}]` })),
    { sync: record.current, label: 'current' },
  ]

  for (const { sync, label } of syncs) {
    verifyCommitTimestamps(root, sync, label, report)
    verifyTag(root, sync, label, report)
    verifyOnCurrentBranch(root, sync, label, report)
    const resolution = resolveWindow(root, sync, label)
    switch (resolution.kind) {
      case 'failed':
        report.failures.push(resolution.reason)
        break
      case 'skipped':
        report.skipped.push(resolution.reason)
        break
      case 'window':
        adjudicate(collectIntegrityFindings(root, resolution.window, label), record, label, hits, report)
        break
    }
  }

  verifyRecordedBaseAgainstTracking(root, record.current, report)

  for (const [index, waiver] of record.waivers.entries()) {
    const matched = hits.get(index) ?? 0
    if (matched === 0) {
      report.notes.push(
        `waiver ${waiver.path} (${waiver.direction}) matched no finding in any recorded window — stale, or its window is not verifiable here`,
      )
    }
  }
  return report
}

/** Waivers still awaiting a keep-or-drop decision, in declaration order. */
export function pendingWaivers(record: UpstreamSyncRecord): Waiver[] {
  return record.waivers.filter(waiver => waiver.decision === 'pending')
}

/** Waivers adjudicated as wrong, whose remediation has not landed. */
export function owedWaivers(record: UpstreamSyncRecord): Waiver[] {
  return record.waivers.filter(waiver => waiver.decision === 'drop')
}

/**
 * Whole days between the recorded sync and a reference instant.
 *
 * @param record - Shape-validated record.
 * @param now - Reference instant; defaults to the current time.
 * @returns Whole days elapsed, or `undefined` when `syncedAt` is unparseable.
 */
export function daysSinceSync(record: UpstreamSyncRecord, now: Date = new Date()): number | undefined {
  const synced = Date.parse(record.current.syncedAt)
  if (Number.isNaN(synced)) return undefined
  return Math.floor((now.getTime() - synced) / 86_400_000)
}

// ---------------------------------------------------------------------------
// Shape validation internals
// ---------------------------------------------------------------------------

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function historyRaw_length(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

function requireString(
  row: Record<string, unknown>,
  key: string,
  where: string,
  failures: string[],
): string | undefined {
  const raw = row[key]
  if (typeof raw !== 'string' || raw === '') {
    failures.push(`${where}.${key} must be a non-empty string`)
    return undefined
  }
  return raw
}

function requireSha(
  row: Record<string, unknown>,
  key: string,
  where: string,
  failures: string[],
): string | undefined {
  const raw = requireString(row, key, where, failures)
  if (raw === undefined) return undefined
  if (!FULL_SHA.test(raw)) {
    failures.push(`${where}.${key} must be a full 40-hex commit sha, got ${JSON.stringify(raw)}`)
    return undefined
  }
  return raw
}

function requireInstant(
  row: Record<string, unknown>,
  key: string,
  where: string,
  failures: string[],
): string | undefined {
  const raw = requireString(row, key, where, failures)
  if (raw === undefined) return undefined
  if (!ISO_INSTANT.test(raw)) {
    failures.push(
      `${where}.${key} must be an ISO-8601 instant with an offset, exactly as \`git show -s --format=%cI\` prints it, got ${JSON.stringify(raw)}`,
    )
    return undefined
  }
  return raw
}

function collectSyncFailures(value: unknown, where: string, failures: string[]): UpstreamSync | undefined {
  const row = asObject(value)
  if (row === undefined) {
    failures.push(`${where} must be an object`)
    return undefined
  }
  const upstreamSha = requireSha(row, 'upstreamSha', where, failures)
  const mergeCommit = requireSha(row, 'mergeCommit', where, failures)
  const upstreamCommittedAt = requireInstant(row, 'upstreamCommittedAt', where, failures)
  const syncedAt = requireInstant(row, 'syncedAt', where, failures)

  const tagRaw = row['upstreamTag']
  let upstreamTag: string | undefined
  if (tagRaw !== undefined) {
    if (typeof tagRaw !== 'string' || tagRaw === '') {
      failures.push(`${where}.upstreamTag, when present, must be a non-empty string`)
    } else {
      upstreamTag = tagRaw
    }
  }

  if (upstreamSha === undefined || mergeCommit === undefined) return undefined
  if (upstreamCommittedAt === undefined || syncedAt === undefined) return undefined
  if (upstreamSha === mergeCommit) {
    failures.push(`${where}: upstreamSha and mergeCommit must differ`)
    return undefined
  }
  return {
    upstreamSha,
    mergeCommit,
    upstreamCommittedAt,
    syncedAt,
    ...(upstreamTag === undefined ? {} : { upstreamTag }),
  }
}

function collectThresholdFailures(value: unknown, failures: string[]): void {
  const row = asObject(value)
  if (row === undefined) {
    failures.push('thresholds must be an object with daysSinceSync and commitsBehind')
    return
  }
  for (const key of ['daysSinceSync', 'commitsBehind']) {
    const raw = row[key]
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) {
      failures.push(`thresholds.${key} must be a positive integer`)
    }
  }
}

function isWaiverDirection(raw: string): raw is WaiverDirection {
  return WAIVER_DIRECTIONS.some(candidate => candidate === raw)
}

function isWaiverDecision(raw: string): raw is WaiverDecision {
  return WAIVER_DECISIONS.some(candidate => candidate === raw)
}

function collectWaiverFailures(value: unknown, failures: string[]): void {
  if (!Array.isArray(value)) {
    failures.push('waivers must be an array (use [] when nothing is waived)')
    return
  }
  const seen = new Set<string>()
  for (const [index, entry] of value.entries()) {
    const where = `waivers[${index}]`
    const row = asObject(entry)
    if (row === undefined) {
      failures.push(`${where} must be an object`)
      continue
    }
    const path = requireString(row, 'path', where, failures)
    const direction = requireString(row, 'direction', where, failures)
    const decision = requireString(row, 'decision', where, failures)
    requireString(row, 'ticket', where, failures)

    if (path !== undefined && !isRepositoryRelative(path)) {
      failures.push(
        `${where}.path must be a repository-relative POSIX path, or a group prefix ending in "/", got ${JSON.stringify(path)}`,
      )
    }
    if (direction !== undefined && !isWaiverDirection(direction)) {
      failures.push(`${where}.direction must be one of ${WAIVER_DIRECTIONS.join(', ')}, got ${JSON.stringify(direction)}`)
    }
    if (decision !== undefined && !isWaiverDecision(decision)) {
      failures.push(`${where}.decision must be one of ${WAIVER_DECISIONS.join(', ')}, got ${JSON.stringify(decision)}`)
    }
    if (path !== undefined && direction !== undefined) {
      const key = `${direction}:${path}`
      if (seen.has(key)) failures.push(`${where}: duplicate waiver for ${path} (${direction})`)
      seen.add(key)
    }
  }
}

function isRepositoryRelative(path: string): boolean {
  if (path.startsWith('/') || path.includes('\\') || path.includes('//')) return false
  return !path.split('/').includes('..')
}

function collectChronologyFailures(syncs: UpstreamSync[], failures: string[]): void {
  const merges = new Set<string>()
  let previous: UpstreamSync | undefined
  for (const [index, sync] of syncs.entries()) {
    const where = index === syncs.length - 1 ? 'current' : `history[${index}]`
    if (merges.has(sync.mergeCommit)) {
      failures.push(`${where}: mergeCommit ${short(sync.mergeCommit)} is recorded more than once`)
    }
    merges.add(sync.mergeCommit)
    if (previous !== undefined && Date.parse(sync.syncedAt) <= Date.parse(previous.syncedAt)) {
      failures.push(
        `${where}: syncedAt ${sync.syncedAt} is not after the preceding entry's ${previous.syncedAt}; history must be oldest first with current last`,
      )
    }
    if (Date.parse(sync.syncedAt) < Date.parse(sync.upstreamCommittedAt)) {
      failures.push(
        `${where}: syncedAt ${sync.syncedAt} precedes upstreamCommittedAt ${sync.upstreamCommittedAt}; a merge cannot predate the commit it absorbed`,
      )
    }
    previous = sync
  }
}
// ---------------------------------------------------------------------------
// Git-layer internals (§4.2.bis) — lower half of this module
// ---------------------------------------------------------------------------

/** One parsed `git diff-tree -r --raw` line. */
interface RawDiffEntry {
  /** Single-letter status (A/D/M/T) validated by {@link RAW_ENTRY}. */
  status: string
  /** Repository-relative path of the changed file. */
  path: string
}

/** A resolved merge-integrity window: three shas that bound the three gates. */
interface SyncWindow {
  /** merge-base(fork-parent, upstream-sha): the state before divergence. */
  base: string
  /** First parent of the merge commit (fork-side tip). */
  fork: string
  /** = sync.upstreamSha. */
  upstream: string
  /** = sync.mergeCommit. */
  merge: string
}

/** Outcome of resolving one sync's window. */
type WindowResolution =
  | { kind: 'window'; window: SyncWindow }
  | { kind: 'skipped'; reason: string }
  | { kind: 'failed'; reason: string }

/** One finding from the three merge-integrity gates. */
interface IntegrityFinding {
  path: string
  direction: WaiverDirection
}

/**
 * Run one read-only Git subprocess and return its stdout.
 *
 * @throws Error when Git exits non-zero. Callers expecting a missing commit
 *   (shallow checkout) use {@link gitOptional} instead.
 */
function gitText(root: string, args: string[]): string {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER,
  })
  if (result.error !== undefined) {
    throw new Error(`git ${args.join(' ')} could not start: ${result.error.message}`, { cause: result.error })
  }
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed with status ${String(result.status)}: ${result.stderr.trim()}`)
  }
  return result.stdout
}

/**
 * Run one read-only Git subprocess, returning `undefined` on any failure.
 *
 * Used for commands that legitimately fail when a commit is absent in a
 * shallow checkout.
 */
function gitOptional(root: string, args: string[]): string | undefined {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER,
  })
  if (result.error !== undefined || result.status !== 0) return undefined
  return result.stdout
}

/**
 * Test whether `ancestor` is reachable from `descendant`.
 *
 * @returns `true` / `false` from Git's exit code, or `undefined` when Git
 *   could not answer (a sha is absent in a shallow checkout).
 */
function gitIsAncestor(root: string, ancestor: string, descendant: string): boolean | undefined {
  const result = spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', ancestor, descendant], {
    encoding: 'utf8',
  })
  if (result.error !== undefined) return undefined
  if (result.status === 0) return true
  if (result.status === 1) return false
  return undefined
}

/** Abbreviate a 40-hex sha to 12 characters for diagnostics. */
function short(sha: string): string {
  return sha.slice(0, 12)
}

/**
 * Parse `git diff-tree -r --raw` stdout into status-path pairs.
 *
 * Each line looks like `:100644 100644 <oldsha> <newsha> M\tpath`. The
 * metadata prefix is validated by {@link RAW_ENTRY}; non-matching lines
 * (blank, or unexpected format) are silently skipped.
 */
function parseDiffTreeRaw(stdout: string): RawDiffEntry[] {
  const entries: RawDiffEntry[] = []
  for (const line of stdout.split('\n')) {
    if (line === '') continue
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    const meta = line.slice(0, tab)
    const path = line.slice(tab + 1)
    const match = RAW_ENTRY.exec(meta)
    if (match === null) continue
    const status = match[1]
    if (status === undefined) continue
    entries.push({ status, path })
  }
  return entries
}

/** Read the parents of a merge commit, or `undefined` when the commit is absent. */
function mergeParents(root: string, merge: string): string[] | undefined {
  const line = gitOptional(root, ['rev-list', '--parents', '-n', '1', merge])
  if (line === undefined) return undefined
  const parts = line.trim().split(' ')
  if (parts.length < 3) return undefined
  return parts.slice(1)
}

// ---------------------------------------------------------------------------
// Per-window verification (called by collectGitFailures)
// ---------------------------------------------------------------------------

/** Cross-check recorded timestamps against `git show -s --format=%cI`. */
function verifyCommitTimestamps(
  root: string,
  sync: UpstreamSync,
  label: string,
  report: GitFailureReport,
): void {
  const upstreamDate = gitOptional(root, ['show', '-s', '--format=%cI', sync.upstreamSha])
  if (upstreamDate === undefined) {
    report.skipped.push(
      `${label}: upstreamSha ${short(sync.upstreamSha)} not in this checkout — timestamp not cross-checked`,
    )
    return
  }
  const upstreamTrimmed = upstreamDate.trim()
  if (upstreamTrimmed !== sync.upstreamCommittedAt) {
    report.failures.push(
      `${label}: upstreamCommittedAt is ${sync.upstreamCommittedAt} but git reports ${upstreamTrimmed} for ${short(sync.upstreamSha)}`,
    )
  }

  const mergeDate = gitOptional(root, ['show', '-s', '--format=%cI', sync.mergeCommit])
  if (mergeDate === undefined) {
    report.skipped.push(
      `${label}: mergeCommit ${short(sync.mergeCommit)} not in this checkout — timestamp not cross-checked`,
    )
    return
  }
  const mergeTrimmed = mergeDate.trim()
  if (mergeTrimmed !== sync.syncedAt) {
    report.failures.push(
      `${label}: syncedAt is ${sync.syncedAt} but git reports ${mergeTrimmed} for ${short(sync.mergeCommit)}`,
    )
  }
}

/** When the record carries an upstream tag, confirm it points at upstreamSha. */
function verifyTag(
  root: string,
  sync: UpstreamSync,
  label: string,
  report: GitFailureReport,
): void {
  if (sync.upstreamTag === undefined) return
  const tags = gitOptional(root, ['tag', '--points-at', sync.upstreamSha])
  if (tags === undefined) {
    report.skipped.push(
      `${label}: could not list tags at ${short(sync.upstreamSha)} — tag not cross-checked`,
    )
    return
  }
  const tagList = tags.split('\n').map(t => t.trim()).filter(t => t !== '')
  if (!tagList.includes(sync.upstreamTag)) {
    report.failures.push(
      `${label}: upstreamTag ${JSON.stringify(sync.upstreamTag)} does not point at ${short(sync.upstreamSha)}; git tags: ${tagList.length === 0 ? '(none)' : tagList.join(', ')}`,
    )
  }
}

/** Confirm the merge commit is reachable from HEAD in this checkout. */
function verifyOnCurrentBranch(
  root: string,
  sync: UpstreamSync,
  label: string,
  report: GitFailureReport,
): void {
  const ancestor = gitIsAncestor(root, sync.mergeCommit, 'HEAD')
  if (ancestor === undefined) {
    report.skipped.push(
      `${label}: mergeCommit ${short(sync.mergeCommit)} not in this checkout — reachability not checked`,
    )
    return
  }
  if (!ancestor) {
    report.skipped.push(
      `${label}: mergeCommit ${short(sync.mergeCommit)} is not reachable from HEAD in this checkout`,
    )
  }
}

/**
 * Resolve the merge window: base, fork-parent, upstream, merge.
 *
 * The merge's second parent must equal the recorded upstreamSha; otherwise
 * the record is wrong (a failure, not a skip). When any commit is absent
 * (shallow checkout), the window degrades to skipped.
 */
function resolveWindow(
  root: string,
  sync: UpstreamSync,
  label: string,
): WindowResolution {
  const parents = mergeParents(root, sync.mergeCommit)
  if (parents === undefined) {
    return {
      kind: 'skipped',
      reason: `${label}: mergeCommit ${short(sync.mergeCommit)} not in this checkout — window unresolved`,
    }
  }
  const forkParent = parents[0]
  const upstreamParent = parents[1]
  if (forkParent === undefined || upstreamParent === undefined) {
    return {
      kind: 'failed',
      reason: `${label}: mergeCommit ${short(sync.mergeCommit)} has ${parents.length} parent(s); expected at least 2`,
    }
  }
  if (upstreamParent !== sync.upstreamSha) {
    return {
      kind: 'failed',
      reason: `${label}: mergeCommit's second parent is ${short(upstreamParent)}, not the recorded ${short(sync.upstreamSha)}`,
    }
  }
  const baseLine = gitOptional(root, ['merge-base', forkParent, sync.upstreamSha])
  if (baseLine === undefined) {
    return {
      kind: 'failed',
      reason: `${label}: git merge-base between fork parent ${short(forkParent)} and upstream ${short(sync.upstreamSha)} failed`,
    }
  }
  const base = baseLine.trim()
  if (!FULL_SHA.test(base)) {
    return {
      kind: 'failed',
      reason: `${label}: git merge-base returned ${JSON.stringify(base)}, expected a 40-hex sha`,
    }
  }
  return {
    kind: 'window',
    window: { base, fork: forkParent, upstream: sync.upstreamSha, merge: sync.mergeCommit },
  }
}

/**
 * Run the three merge-integrity gates on one resolved window.
 *
 * Gate ① keep-fork: upstream deleted the path in the window; the merge tree
 *   still carries it.
 * Gate ② drop-fork: upstream added the path in the window; the merge tree
 *   does not carry it.
 * Gate ③ revert-fork: upstream modified the path and the fork never touched
 *   it, yet the merge holds the merge-base blob (the upstream change was
 *   reverted to base).
 */
function collectIntegrityFindings(
  root: string,
  window: SyncWindow,
  _label: string,
): IntegrityFinding[] {
  const upChanges = parseDiffTreeRaw(
    gitText(root, ['diff-tree', '-r', '--raw', window.base, window.upstream]),
  )
  const forkChanges = parseDiffTreeRaw(
    gitText(root, ['diff-tree', '-r', '--raw', window.base, window.fork]),
  )
  const mergeChanges = parseDiffTreeRaw(
    gitText(root, ['diff-tree', '-r', '--raw', window.base, window.merge]),
  )
  const mergeTree = gitText(root, ['ls-tree', '-r', '--name-only', window.merge])
    .split('\n')
    .filter(p => p !== '')

  const mergeTreeSet = new Set(mergeTree)
  const forkTouchedSet = new Set(forkChanges.map(e => e.path))
  const mergeChangedSet = new Set(mergeChanges.map(e => e.path))

  const findings: IntegrityFinding[] = []
  for (const entry of upChanges) {
    switch (entry.status) {
      case 'D':
        if (mergeTreeSet.has(entry.path)) {
          findings.push({ path: entry.path, direction: 'keep-fork' })
        }
        break
      case 'A':
        if (!mergeTreeSet.has(entry.path)) {
          findings.push({ path: entry.path, direction: 'drop-fork' })
        }
        break
      case 'M':
      case 'T':
        if (!forkTouchedSet.has(entry.path) && !mergeChangedSet.has(entry.path)) {
          findings.push({ path: entry.path, direction: 'revert-fork' })
        }
        break
    }
  }
  return findings
}

/** Find the index of the first waiver that covers one finding, if any. */
function matchWaiver(waivers: Waiver[], finding: IntegrityFinding): number | undefined {
  for (const [index, waiver] of waivers.entries()) {
    if (waiver.direction !== finding.direction) continue
    if (waiver.path.endsWith('/')) {
      if (finding.path.startsWith(waiver.path)) return index
    } else if (waiver.path === finding.path) {
      return index
    }
  }
  return undefined
}

/**
 * Match findings against waivers. Unmatched findings are failures; matched
 * findings increment the per-waiver hit counter for the stale-waiver tail.
 */
function adjudicate(
  findings: IntegrityFinding[],
  record: UpstreamSyncRecord,
  label: string,
  hits: Map<number, number>,
  report: GitFailureReport,
): void {
  for (const finding of findings) {
    const index = matchWaiver(record.waivers, finding)
    if (index === undefined) {
      report.failures.push(
        `${label}: ${finding.direction} finding at ${finding.path} has no waiver — merge did not apply upstream content for this path`,
      )
      continue
    }
    hits.set(index, (hits.get(index) ?? 0) + 1)
  }
}

/**
 * Cross-check the recorded current upstreamSha against the upstream
 * remote-tracking ref, when present. Informational (notes, not failures):
 * the ref may be stale, and staleness is the report's job, not the gate's.
 */
function verifyRecordedBaseAgainstTracking(
  root: string,
  current: UpstreamSync,
  report: GitFailureReport,
): void {
  const refSha = gitOptional(root, ['rev-parse', '--verify', UPSTREAM_TRACKING_REF])
  if (refSha === undefined) {
    report.notes.push(
      `upstream tracking ref ${UPSTREAM_TRACKING_REF} not present — recorded base not cross-checked`,
    )
    return
  }
  const trimmed = refSha.trim()
  if (trimmed !== current.upstreamSha) {
    report.notes.push(
      `upstream tracking ref points at ${short(trimmed)}, but record.current.upstreamSha is ${short(current.upstreamSha)} — ref may be stale or record may be behind`,
    )
  }
}
