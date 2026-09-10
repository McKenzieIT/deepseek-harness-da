/**
 * Gate: verify `scripts/upstream-sync.json` is internally consistent and that
 * Git agrees with the record's claims — each `mergeCommit` absorbed the
 * recorded `upstreamSha`, timestamps line up, waivers match real findings.
 *
 * Staleness (how far behind upstream) is deliberately NOT gated here: upstream
 * moves independent of any PR, so a behind-gate would fail on unrelated PRs and
 * be disabled within a week. The record's internal consistency is
 * author-controllable, so it gates; staleness belongs to `upstream-status` (a
 * never-failing report).
 *
 * Shape is checked first; git verification is skipped if the shape is wrong
 * (short-circuit). History this checkout cannot verify (e.g. CI with no
 * upstream remote-tracking ref, or a shallow checkout missing the merge's
 * second parent) is reported as `skipped`, not `failed` — the load-bearing
 * second-parent identity check still runs when the ref is absent.
 * @module scripts/verify-upstream-sync-record
 */
import { resolve } from 'node:path'
import {
  UPSTREAM_SYNC_RECORD,
  REPOSITORY_ROOT,
  collectGitFailures,
  collectShapeFailures,
  pendingWaivers,
  readUpstreamSyncRecord,
  type GitFailureReport,
} from './upstream-sync-record.ts'

export function collectUpstreamSyncRecordViolations(root: string = REPOSITORY_ROOT): GitFailureReport {
  const record = readUpstreamSyncRecord(root)
  const shapeFailures = collectShapeFailures(record)
  if (shapeFailures.length > 0) {
    // Short-circuit: do not run git verification against a malformed record.
    return { failures: shapeFailures, skipped: [], notes: [] }
  }
  const report = collectGitFailures(record, root)
  const pending = pendingWaivers(record)
  if (pending.length > 0) {
    report.notes.push(`${pending.length} waiver(s) still pending a keep-or-drop decision:`)
    for (const waiver of pending) {
      report.notes.push(`  ${waiver.path} (${waiver.direction}) — ${waiver.ticket}`)
    }
  }
  return report
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const { failures, skipped, notes } = collectUpstreamSyncRecordViolations(REPOSITORY_ROOT)
  if (failures.length > 0) {
    process.stderr.write(`verify-upstream-sync-record: ${UPSTREAM_SYNC_RECORD} inconsistencies:\n`)
    for (const failure of failures) process.stderr.write(`  ${failure}\n`)
  }
  for (const skip of skipped) process.stderr.write(`  [skipped] ${skip}\n`)
  for (const note of notes) process.stderr.write(`  [note] ${note}\n`)
  if (failures.length > 0) process.exit(1)
  process.stdout.write(`verify-upstream-sync-record: ${UPSTREAM_SYNC_RECORD} is consistent with Git.\n`)
}
