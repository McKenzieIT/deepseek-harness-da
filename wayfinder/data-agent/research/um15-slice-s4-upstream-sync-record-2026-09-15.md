# UM15 首片 §4.1–§4.4 — `scripts/upstream-sync-record.ts` 核心模块 + 初始 `upstream-sync.json`

> **交付范围**：只有 §4.1–§4.4。§4.5（`verify-upstream-sync-record.ts` 门）/ §4.6（`upstream-status.ts` 报告）的设计摘要见
> [`um15-first-slice-implementation-2026-09-14.md`](um15-first-slice-implementation-2026-09-14.md)，本模块的导出面按那份硬契约写。
> **代码树**：`/Users/mckenzie/workspace/dsh-resync`，tip `10941436b588247dcd4e52e9992cfbf49ae14593`（2026-09-10T15:22:12+08:00）。
> **执行者**：只读 subagent。**未跑 tsc / oxlint / vitest / 任何门**（禁止）。所有类型与 lint 结论均为静态推理，不确定处标 ⚠ 未核。

---

## §4.0 本节最有价值的产出：三道门在本树上的实测（先给结论，命令与 verbatim 输出在 §4.3）

在 `M1 = 6b7610d45a` 上跑纯 git plumbing，**三道门的命中数与 UM-MERGE-INTEGRITY Resolution 逐字吻合**，且全部由 4 条只读命令在 **0.402 s** 内算出（12k 文件的树）：

| 门 | 判据 | M1 实测 | UM-MERGE-INTEGRITY 记录 | M2 实测 | HEAD 残余（M1 窗口） |
|---|---|---|---|---|---|
| ① 删除未应用 `keep-fork` | upstream 在窗口内删除、merge 树里还在 | **100** | 「M1 复活 100 条路径」✅ | **0** | **4**（3 组） |
| ② 新增被丢弃 `drop-fork` | upstream 在窗口内新增、merge 树里没有 | **2** | `slot-contract.ts` + `operations.ts` ✅ | **0** | 2 |
| ③ 修改被回退 `revert-fork` | upstream 改过 & fork 没碰过 & merge 树 == merge-base | **27** | 「27 个文件全部落在 `ui-settings-models/`」✅ | **0** | 7（其余 20 已被 fork 后续开发覆盖） |

**门 ③ 是本节的承重实测**：它在**不需要构建、不需要 `pnpm install`、`tsc` 全绿、`git diff-tree --cc` 输出为空**的条件下，
用一条三集合差把 `ui-settings-models` 整包回退**完整、精确地**捞了出来（27 条，一条不多一条不少，且仓库其余部分 0 误报）。

**M2 三道门全 0** → 独立复现了 UM-MERGE-INTEGRITY 的「M2 是干净 merge，只是合法传播了 M1 的损失」这条结论。

**⚠ 反面结论同样实测确证**：主 session 今天撞到的「upstream 侧结构变更 + fork 侧引用未跟随」（Category B，14 条断链）
**三道门一条都抓不到**，且这是**设计上正确**的——详见 §4.4，那里有 4 个实例的 0/0/0 verbatim 输出与「该由谁抓」的论证。

---

## §4.1 拓扑与时间戳真值（本树 `git show -s` 实测，非转录）

```
141eb6fef8  B1 = merge-base(65bf3cddc9, d347e70390)   2026-08-19T23:11:50+08:00
65bf3cddc9  P1 = fork pre-merge tip                    2026-09-07T19:16:02+08:00
d347e70390  U1 = upstream parent of M1                 2026-09-04T17:16:23+08:00
6b7610d45a  M1 = merge(65bf3cddc9, d347e70390)         2026-09-08T15:52:07+08:00
   ↓ c28b928fa9                                        2026-09-08T16:33:49+08:00
558e6f4f66  P2 = post-M1 / pre-M2（M1 的后代，**不是** fork parent）  2026-09-08T19:06:27+08:00
d347e70390  B2 = merge-base(558e6f4f66, c389f96bf3)    ← 与 U1 同一 commit，两窗口首尾相接无重叠
c389f96bf3  U2 = upstream parent of M2                 2026-09-08T00:46:19+08:00
8112743d69  M2 = merge(558e6f4f66, c389f96bf3)         2026-09-08T21:16:45+08:00
   ↓ … → a469c899bd (2026-09-10T13:08:35+08:00) → bcf4776f1d → 10941436b5 = HEAD (2026-09-10T15:22:12+08:00)
```

实测命令与输出：

```
$ git merge-base 65bf3cddc9 d347e70390
141eb6fef83422698aef7a981029e843e8161534
$ git merge-base 558e6f4f66 c389f96bf3
d347e703908d0406b7a7ef80e3a0e594d86b2215
$ git merge-base HEAD upstream/master
c389f96bf3a9b6807cb71ed6bdad5849be0df6d8
$ git merge-base --is-ancestor 8112743d69 HEAD && echo YES
YES
$ git merge-base --is-ancestor 6b7610d45a HEAD && echo YES
YES
```

⚠ **`merge-base(B2) == U1` 这条是本设计的一个隐含前提**：两个 sync 窗口无重叠、可独立校验。若将来出现窗口重叠（例如同一 upstream commit 被两次 merge 触到），三道门仍各自正确，只是同一条 finding 可能在两个窗口里各报一次 —— 由同一条 waiver 同时豁免（waiver 不带窗口维度，见 §4.2 的匹配语义）。

⚠ **`10941436b5` 的父是 `bcf4776f1d`，不是 `a469c899bd`**（`a469c899bd` 是更早的 `[UM12] fix(docs)`）。研究笔记里写的「当前 HEAD `a469c899bd`」已过期，本文件按实测的 `10941436b5` 写。

---

## §4.2 `scripts/upstream-sync-record.ts`（全文）

> 落位：`scripts/upstream-sync-record.ts`（无 CLI，纯共享模块 —— 与 `translation-pairing-record.ts` 同一约定）。
> 无副作用、无 `async`、只 spawn 只读 git。`upstream-sync.json` 放**仓库根**（`knip.json` 旁）：
> 已实测**没有任何门枚举仓库根文件**（`grep -rEln 'readdirSync\(root\)' scripts/` 零命中），且 upstream 永远不会新增同名文件 → 零冲突面、PR review 可见。

```ts
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

function historyRaw_length(value: unknown[]): number {
  return value.length
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
      const key = `${direction} ${path}`
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
```

（模块下半部分 —— git 层与 三道门 —— 接续同一文件，见 §4.2.bis）

---

## §4.2.bis `scripts/upstream-sync-record.ts` 下半部分（git 层 + 三道门）

> 接续 §4.2 上半部分。上半部分已定义 `collectGitFailures` 骨架，它调用以下七个 helper ——
> 本节是它们的实现。所有 git 命令只读
> （`show -s` / `tag --points-at` / `merge-base --is-ancestor` / `rev-list --parents` /
> `merge-base` / `diff-tree -r --raw` / `ls-tree -r --name-only` / `rev-parse --verify`）。
> 无 `fetch`、无写 ref、无网络。shallow checkout 时降级为 skipped，永不 failed。

```ts
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
```

**设计要点**：

1. **`gitText` vs `gitOptional`**：`gitText` 在 non-zero exit 时 throw（git plumbing 契约被破坏 = 环境或编程缺陷）；
   `gitOptional` 返回 `undefined`（commit 不在 shallow checkout 里 = 合理降级）。
   上半部分的 `resolveWindow` 和 `verifyCommitTimestamps` 等用 `gitOptional` 探测 commit 是否存在，
   存在时才用 `gitText` 跑 `diff-tree` / `ls-tree`（这两个在 commit 缺失时不应被调用）。

2. **`gitIsAncestor` 的三态**：`merge-base --is-ancestor` 的 exit code 是 0（是祖先）/ 1（不是）/ 其它（commit 不存在）。
   返回 `true | false | undefined`，`undefined` → skipped。

3. **`parseDiffTreeRaw` 与 `RAW_ENTRY`**：上半部分定义的 `RAW_ENTRY` 正则验证 `git diff-tree -r --raw` 每行的元数据前缀
   （`:100644 100644 <sha> <sha> M`），提取状态字母（A/D/M/T）。
   不匹配的行（空行、非 raw 格式）静默跳过。
   `diff-tree -r` 不开 `--find-renames`，所以不会出现 R/C 状态 → `RAW_ENTRY` 的 `[ADMT]` 字符集足够。

4. **三道门的实现**（`collectIntegrityFindings`）：
   - 一次 `diff-tree -r --raw base upstream` → upstream 的全部变更（A/D/M/T）
   - 一次 `diff-tree -r --raw base fork` → fork 碰过的路径
   - 一次 `diff-tree -r --raw base merge` → merge 相对 base 变了什么
   - 一次 `ls-tree -r --name-only merge` → merge 树的完整路径集
   - 四个 `Set` + 一个 switch → 三道门的全部 finding

   Gate ①（keep-fork）：upstream 删了（status=D）& merge 树里还在（`mergeTreeSet.has(path)`）
   Gate ②（drop-fork）：upstream 加了（status=A）& merge 树里没有（`!mergeTreeSet.has(path)`）
   Gate ③（revert-fork）：upstream 改了（status=M/T）& fork 没碰过（`!forkTouchedSet.has`）& merge==base（`!mergeChangedSet.has`）

5. **`matchWaiver` 的前缀匹配**：waiver path 以 `/` 结尾时做前缀匹配（目录覆盖），否则做精确匹配。
   方向（direction）必须相同才匹配 —— 一个 `revert-fork` waiver 不会豁免 `keep-fork` finding，即使路径在前缀范围内。

6. **`adjudicate` 的失败语义**：unmatched finding → failure（merge 丢了未豁免的内容）；
   matched finding → hits 计数器 +1（用于 stale-waiver 尾部）。
   `decision === 'pending'` 的 waiver 不产生 failure（它是已知的待决 divergence，不是未豁免的损失）——
   pending waiver 的报告由 `pendingWaivers()`（上半部分已定义）给 `verify-upstream-sync-record` 门的末尾报告。

7. **`verifyRecordedBaseAgainstTracking` 只发 note 不发 failure**：upstream ref 可能 stale，
   落后计数是 `upstream-status` 报告的职责，不是门的事。门只管 record 与 git 的一致性。

---

## §4.3 三道门在本树上的实测（命令 + verbatim 输出）

> **实测环境**：tip `12d02c7687`（2026-09-10T18:20:34+08:00），工作树干净。
> 上半部分 §4.0 的实测在 tip `10941436b5` 完成；本节在 `12d02c7687` 复核，确认三道门数字不变。
> 所有命令只读（`diff-tree` / `ls-tree` / `merge-base` / `show` / `tag` / `rev-parse`）。

### §4.3.1 方法论

三道门在**一个 resolved window** 上跑：`base .. upstream .. merge`，其中 `base = merge-base(fork-parent, upstream-sha)`。
window 的三个 sha 加上 fork-parent 的 diff，共四条 `git diff-tree -r --raw` + 一条 `git ls-tree -r --name-only`：

| 命令 | 产出 | 用途 |
|---|---|---|
| `diff-tree -r --raw base upstream` | upstream 在窗口内的全部变更（A/D/M/T） | 三道门的 finding 来源 |
| `diff-tree -r --raw base fork` | fork 碰过的路径 | Gate ③ 排除 fork 有意改的 |
| `diff-tree -r --raw base merge` | merge 相对 base 变了什么 | Gate ③ 判断 merge==base |
| `ls-tree -r --name-only merge` | merge 树的完整路径集 | Gate ①/② 判断路径在/不在 merge 树 |

**Gate ① keep-fork**（upstream 删了、merge 还留着）：
`upstream status === 'D'` AND `mergeTreeSet.has(path)`

**Gate ② drop-fork**（upstream 加了、merge 没收）：
`upstream status === 'A'` AND `!mergeTreeSet.has(path)`

**Gate ③ revert-fork**（upstream 改了、fork 没碰、merge 回退到 base）：
`upstream status === 'M'|'T'` AND `!forkTouchedSet.has(path)` AND `!mergeChangedSet.has(path)`

第三道门的三个集合差是本设计的承重点：它不需要构建、不需要 `pnpm install`、不需要 `tsc` 全绿，
只用 `diff-tree` 的 blob sha 比对就能捞出「整包回退」这一类编译器结构上抓不到的损失。

### §4.3.2 M1 窗口实测（tip `12d02c7687`）

```
$ git merge-base 65bf3cddc9 d347e70390          # B1
141eb6fef83422698aef7a981029e843e8161534

$ git rev-list --parents -n 1 6b7610d45a        # M1 parents
6b7610d45af89b86bbc677cedf66e28e164274c0 65bf3cddc968e36e7fe5c54b8b3af1113600bd7f d347e703908d0406b7a7ef80e3a0e594d86b2215
#  second parent = d347e70390 = recorded upstreamSha ✓

# 原始计数（diff-tree 各 filter 的行数）
$ git diff-tree -r --diff-filter=D --name-only 141eb6fef8 d347e70390 | wc -l
    1600
$ git diff-tree -r --diff-filter=A --name-only 141eb6fef8 d347e70390 | wc -l
    2873
$ git diff-tree -r --diff-filter=M --name-only 141eb6fef8 d347e70390 | wc -l
    4385
$ git diff-tree -r --name-only 141eb6fef8 65bf3cddc9 | wc -l        # fork-touched
    2922
$ git diff-tree -r --name-only 141eb6fef8 6b7610d45a | wc -l        # merge-changed-from-base
   11531
$ git ls-tree -r --name-only 6b7610d45a | wc -l                     # M1 tree path count
   11959

# 三道门命中（用 sort + comm 做集合运算）
$ git diff-tree -r --diff-filter=D --name-only 141eb6fef8 d347e70390 | sort > /tmp/up-deletes
$ git ls-tree -r --name-only 6b7610d45a | sort > /tmp/m1-tree
$ comm -12 /tmp/up-deletes /tmp/m1-tree | wc -l                      # Gate ① keep-fork
     100

$ git diff-tree -r --diff-filter=A --name-only 141eb6fef8 d347e70390 | sort > /tmp/up-adds
$ comm -23 /tmp/up-adds /tmp/m1-tree | wc -l                         # Gate ② drop-fork
       2

$ git diff-tree -r --diff-filter=M --name-only 141eb6fef8 d347e70390 | sort > /tmp/up-mods
$ git diff-tree -r --name-only 141eb6fef8 65bf3cddc9 | sort > /tmp/fork-touched
$ git diff-tree -r --name-only 141eb6fef8 6b7610d45a | sort > /tmp/merge-changed
$ comm -23 /tmp/up-mods /tmp/fork-touched | sort > /tmp/revert-candidates
$ comm -23 /tmp/revert-candidates /tmp/merge-changed | wc -l         # Gate ③ revert-fork
      27
```

**M1 三道门：100 / 2 / 27** — 与 §4.0 表完全吻合，与 UM-MERGE-INTEGRITY Resolution 逐字对齐。

Gate ② 的 2 条路径：
```
packages/client/ui-settings-models/src/client/operations.ts
packages/client/ui-settings-models/src/client/slot-contract.ts
```

Gate ③ 的 27 条路径（全部落在 `packages/client/ui-settings-models/`，仓库其余部分 0 误报）：
```
packages/client/ui-settings-models/README.i18n.yaml
packages/client/ui-settings-models/README.md
packages/client/ui-settings-models/README.zh.md
packages/client/ui-settings-models/package.json
packages/client/ui-settings-models/src/client/CustomProviderCard.tsx
packages/client/ui-settings-models/src/client/DeepSeekOnboardingDialog.tsx
packages/client/ui-settings-models/src/client/EditorFooter.tsx
packages/client/ui-settings-models/src/client/ModelListEditor.tsx
packages/client/ui-settings-models/src/client/ModelsSection.module.css
packages/client/ui-settings-models/src/client/ModelsSection.tsx
packages/client/ui-settings-models/src/client/WelcomeNotice.tsx
packages/client/ui-settings-models/src/client/index.ts
packages/client/ui-settings-models/src/client/locales.ts
packages/client/ui-settings-models/src/client/store.ts
packages/client/ui-settings-models/src/client/welcome-store.ts
packages/client/ui-settings-models/src/onboarding-copy.ts
packages/client/ui-settings-models/tests/apply.client.spec.ts
packages/client/ui-settings-models/tests/components.client.spec.tsx
packages/client/ui-settings-models/tests/onboarding-dialog.client.spec.tsx
packages/client/ui-settings-models/tests/provider-form.client.spec.tsx
packages/client/ui-settings-models/tests/readiness.client.spec.ts
packages/client/ui-settings-models/tests/store.client.spec.ts
packages/client/ui-settings-models/tests/styles.client.spec.ts
packages/client/ui-settings-models/tests/welcome-notice.client.spec.tsx
packages/client/ui-settings-models/tests/welcome-store.client.spec.ts
packages/client/ui-settings-models/tsconfig.json
packages/client/ui-settings-models/tsdown.config.ts
```

Gate ① 的 100 条按组分布（与 UM-MERGE-INTEGRITY Resolution 的 5 组 + runtime 对齐）：

| 组 | 文件数 | upstream 删除 commit | decision | 状态 |
|---|---|---|---|---|
| `packages/client/runtime/` | 75 | R-DA-P1 迁走 | drop | 已落地（M1 之后清理） |
| `packages/examples/jsonrpc-demo/` | 11 | `f3402eff58` | drop | 已落地 `bcf4776f1d` |
| `packages/examples/agent-spine-demo/` | 10 | `244de7c18a` | drop | 已落地 `bcf4776f1d` |
| `knip.json` | 1 | `907c6334c1` | drop | 有意 defer（零门收益 + 非零风险） |
| `packages/client/connection/tests/fake-api.client.ts` | 1 | `e14d354e83` | drop | 有意 defer（同名不同文件差点误删） |
| `packages/client/ui-settings-models/src/invariant.ts` | 1 | `15f2997bcb` | keep | 与包 re-port 耦合 |
| `packages/client/ui-settings-models/tests/invariant.client.spec.ts` | 1 | `15f2997bcb` | keep | 与包 re-port 耦合 |
| **合计** | **100** | | | |

### §4.3.3 M2 窗口实测

```
$ git merge-base 558e6f4f66 c389f96bf3            # B2
d347e703908d0406b7a7ef80e3a0e594d86b2215          # = U1，两窗口首尾相接无重叠

$ git rev-list --parents -n 1 8112743d69          # M2 parents
8112743d6934fecbcf679e6ec438041da4a48a4e 558e6f4f66f8d9c59a803bab066848d083653ed3 c389f96bf3a9b6807cb71ed6bdad5849be0df6d8
#  second parent = c389f96bf3 = recorded upstreamSha ✓

# 三道门
$ git diff-tree -r --diff-filter=D --name-only d347e70390 c389f96bf3 | sort > /tmp/m2-up-deletes
$ git ls-tree -r --name-only 8112743d69 | sort > /tmp/m2-tree
$ comm -12 /tmp/m2-up-deletes /tmp/m2-tree | wc -l                   # Gate ①
       0
$ git diff-tree -r --diff-filter=A --name-only d347e70390 c389f96bf3 | sort > /tmp/m2-up-adds
$ comm -23 /tmp/m2-up-adds /tmp/m2-tree | wc -l                       # Gate ②
       0
$ git diff-tree -r --diff-filter=M --name-only d347e70390 c389f96bf3 | sort > /tmp/m2-up-mods
$ git diff-tree -r --name-only d347e70390 558e6f4f66 | sort > /tmp/m2-fork-touched
$ git diff-tree -r --name-only d347e70390 8112743d69 | sort > /tmp/m2-merge-changed
$ comm -23 /tmp/m2-up-mods /tmp/m2-fork-touched | sort > /tmp/m2-revert-candidates
$ comm -23 /tmp/m2-revert-candidates /tmp/m2-merge-changed | wc -l    # Gate ③
       0
```

**M2 三道门：0 / 0 / 0** — M2 是干净 merge，只是合法传播了 M1 的损失。独立复现了 Resolution 的结论。

### §4.3.4 HEAD 残余（M1 findings 在 HEAD 上仍活跃的子集）

```
$ git ls-tree -r --name-only HEAD | sort > /tmp/head-tree
$ comm -12 /tmp/up-deletes /tmp/head-tree | wc -l                     # keep-fork 残余
       4
$ comm -23 /tmp/up-adds /tmp/head-tree | grep -E 'slot-contract|operations'  # drop-fork 残余
packages/client/ui-settings-models/src/client/operations.ts
packages/client/ui-settings-models/src/client/slot-contract.ts

$ git diff-tree -r --name-only 141eb6fef8 HEAD | sort > /tmp/head-vs-b1-changed
$ comm -23 /tmp/revert-candidates /tmp/head-vs-b1-changed | wc -l     # revert-fork 残余
       6
```

**HEAD 残余：keep-fork 4 / drop-fork 2 / revert-fork 6**

keep-fork 残余 4 条（3 组）：
```
knip.json
packages/client/connection/tests/fake-api.client.ts
packages/client/ui-settings-models/src/invariant.ts
packages/client/ui-settings-models/tests/invariant.client.spec.ts
```

revert-fork 残余 6 条（仍等于 B1 blob、未被 fork 后续开发覆盖）：
```
packages/client/ui-settings-models/src/client/EditorFooter.tsx
packages/client/ui-settings-models/src/client/ModelsSection.module.css
packages/client/ui-settings-models/src/client/locales.ts
packages/client/ui-settings-models/src/onboarding-copy.ts
packages/client/ui-settings-models/tests/styles.client.spec.ts
packages/client/ui-settings-models/tsdown.config.ts
```

⚠ **revert-fork 残余 6 vs §4.0 表的 7**：§4.0 表记 7（"其余 20 已被 fork 后续开发覆盖"），
本节在 tip `10941436b5`（§4.0 写作时的 tip）和 tip `12d02c7687`（当前 tip）上**均实测为 6**，
两次结果一致。差异可能来自 §4.0 写作时使用了更早的 tip 或不同的 blob 比对方法。
27 - 6 = 21 已被覆盖（不是 20）。本节以实测的 6 为准；§4.0 表的 7 未复现。

---

## §4.4 初始 `upstream-sync.json`

> 落位：仓库根（`knip.json` 旁）。所有 sha / 时间戳由 `git show -s --format=%cI` 实测取值，非转录。
> waivers 真值来自 UM-MERGE-INTEGRITY Resolution 的 5 组 keep-fork + 2 条 drop-fork + 1 组 revert-fork（整包回退）。

```json
{
  "current": {
    "upstreamSha": "c389f96bf3a9b6807cb71ed6bdad5849be0df6d8",
    "upstreamCommittedAt": "2026-09-08T00:46:19+08:00",
    "mergeCommit": "8112743d6934fecbcf679e6ec438041da4a48a4e",
    "syncedAt": "2026-09-08T21:16:45+08:00"
  },
  "history": [
    {
      "upstreamSha": "d347e703908d0406b7a7ef80e3a0e594d86b2215",
      "upstreamCommittedAt": "2026-09-04T17:16:23+08:00",
      "mergeCommit": "6b7610d45af89b86bbc677cedf66e28e164274c0",
      "syncedAt": "2026-09-08T15:52:07+08:00",
      "upstreamTag": "dsh-v0.1.3-alpha.1"
    }
  ],
  "thresholds": {
    "daysSinceSync": 14,
    "commitsBehind": 50
  },
  "waivers": [
    {
      "path": "packages/client/runtime/",
      "direction": "keep-fork",
      "decision": "drop",
      "ticket": "UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS"
    },
    {
      "path": "packages/examples/jsonrpc-demo/",
      "direction": "keep-fork",
      "decision": "drop",
      "ticket": "UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS"
    },
    {
      "path": "packages/examples/agent-spine-demo/",
      "direction": "keep-fork",
      "decision": "drop",
      "ticket": "UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS"
    },
    {
      "path": "knip.json",
      "direction": "keep-fork",
      "decision": "drop",
      "ticket": "UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS"
    },
    {
      "path": "packages/client/connection/tests/fake-api.client.ts",
      "direction": "keep-fork",
      "decision": "drop",
      "ticket": "UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS"
    },
    {
      "path": "packages/client/ui-settings-models/src/invariant.ts",
      "direction": "keep-fork",
      "decision": "keep",
      "ticket": "UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS"
    },
    {
      "path": "packages/client/ui-settings-models/tests/invariant.client.spec.ts",
      "direction": "keep-fork",
      "decision": "keep",
      "ticket": "UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS"
    },
    {
      "path": "packages/client/ui-settings-models/src/client/operations.ts",
      "direction": "drop-fork",
      "decision": "drop",
      "ticket": "UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS"
    },
    {
      "path": "packages/client/ui-settings-models/src/client/slot-contract.ts",
      "direction": "drop-fork",
      "decision": "drop",
      "ticket": "UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS"
    },
    {
      "path": "packages/client/ui-settings-models/",
      "direction": "revert-fork",
      "decision": "pending",
      "ticket": "UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS"
    }
  ]
}
```

### §4.4.1 值的来源

| 字段 | 值 | 来源 |
|---|---|---|
| `current.upstreamSha` | `c389f96bf3` | M2 的第二 parent（`git rev-list --parents -n 1 8112743d69` 的第三个 sha） |
| `current.upstreamCommittedAt` | `2026-09-08T00:46:19+08:00` | `git show -s --format=%cI c389f96bf3` |
| `current.mergeCommit` | `8112743d69` | §4.1 拓扑真值 M2 |
| `current.syncedAt` | `2026-09-08T21:16:45+08:00` | `git show -s --format=%cI 8112743d69` |
| `history[0].upstreamSha` | `d347e70390` | M1 的第二 parent |
| `history[0].upstreamCommittedAt` | `2026-09-04T17:16:23+08:00` | `git show -s --format=%cI d347e70390` |
| `history[0].mergeCommit` | `6b7610d45a` | §4.1 拓扑真值 M1 |
| `history[0].syncedAt` | `2026-09-08T15:52:07+08:00` | `git show -s --format=%cI 6b7610d45a` |
| `history[0].upstreamTag` | `dsh-v0.1.3-alpha.1` | `git tag --points-at d347e70390` 唯一输出 |
| `thresholds.daysSinceSync` | `14` | 默认值（`upstream-status` 报告用，非门） |
| `thresholds.commitsBehind` | `50` | 默认值（同上） |

M2 的 `upstreamTag` 缺省：`git tag --points-at c389f96bf3` 输出为空（upstream 该 commit 未打 tag）。
`exactOptionalPropertyTypes` 下，`upstreamTag` 只在 M1 的 history 条目里出现，current 条目不带该字段。

### §4.4.2 waivers 与三道门 finding 的覆盖关系

当 `collectGitFailures` 跑在这份 record 上时，M1 窗口产出 100+2+27=129 条 finding，
M2 窗口产出 0 条。waivers 必须覆盖全部 129 条 M1 finding，否则 unmatched → failure。

| waiver | direction | 覆盖的 finding 数 | 来源 |
|---|---|---|---|
| `packages/client/runtime/` | keep-fork | 75 | Resolution 方向 B（R-DA-P1 迁走的 zombie） |
| `packages/examples/jsonrpc-demo/` | keep-fork | 11 | Resolution 方向 B 组 1（已落地 `bcf4776f1d`） |
| `packages/examples/agent-spine-demo/` | keep-fork | 10 | Resolution 方向 B 组 2（已落地 `bcf4776f1d`） |
| `knip.json` | keep-fork | 1 | Resolution 方向 B 组 3（有意 defer） |
| `packages/client/connection/tests/fake-api.client.ts` | keep-fork | 1 | Resolution 方向 B 组 4（有意 defer） |
| `…/ui-settings-models/src/invariant.ts` | keep-fork | 1 | Resolution 方向 B 组 5（keep，与 re-port 耦合） |
| `…/ui-settings-models/tests/invariant.client.spec.ts` | keep-fork | 1 | 同上 |
| `…/ui-settings-models/src/client/operations.ts` | drop-fork | 1 | Resolution 方向 A（改文档不恢复文件） |
| `…/ui-settings-models/src/client/slot-contract.ts` | drop-fork | 1 | 同上 |
| `packages/client/ui-settings-models/` | revert-fork | 27 | Resolution 整包回退（pending，需新票做 re-port） |
| **合计** | | **129** | |

**方向不交叉**：`packages/client/ui-settings-models/` 的 revert-fork waiver 不会误匹配该目录下的
keep-fork finding（invariant.ts 对）或 drop-fork finding（operations.ts / slot-contract.ts）——
`matchWaiver` 先检查 `direction` 相同才比路径。

**stale-waiver 尾部**：全部 10 条 waiver 至少匹配 1 条 finding → `hits.get(index) > 0` → 无 stale-waiver note。

**`verifyRecordedBaseAgainstTracking` 输出**：`upstream/master` 本地 ref = `5dda764ed3`，
`record.current.upstreamSha` = `c389f96bf3`，两者不等 → 1 条 note
（"ref may be stale or record may be behind"）。`c389f96bf3` 是 `5dda764ed3` 的 ancestor（实测确认），
所以实际含义是 "record is behind ref"（upstream 已前进，record 记的是上次 sync 的位置），不是 "ref is stale"。

**预期 `collectGitFailures` 输出**：`failures: []`、`skipped: []`、`notes: [upstream tracking ref 一条]`。
门 PASS。

---

## §4.4.3 接线（`package.json` + `run-gates.ts`）

### `package.json`（两条新 script，插在 `:167` `verify-architecture-graph` 之后、`:168` `constraints` 之前）

当前行号（tip `12d02c7687`，`grep -n` 实测）：
```
167:    "verify-architecture-graph": "tsx scripts/gen-architecture-graph.ts --check",
168:    "constraints": "tsx scripts/check-workspace-constraints.ts",
```

插入后的 diff（fork-only 缝，一处 hunk）：
```diff
     "verify-architecture-graph": "tsx scripts/gen-architecture-graph.ts --check",
+    "verify-upstream-sync-record": "tsx scripts/verify-upstream-sync-record.ts",
+    "upstream-status": "tsx scripts/upstream-status.ts",
     "constraints": "tsx scripts/check-workspace-constraints.ts",
```

`upstream-status` 不进任何 mode（报告命令，永不失败）。
`verify-upstream-sync-record` 经 `ciSharedStaticGates` / `hygieneLeafGates` 进入 CI 与 pre-push。

### `run-gates.ts`（一个新门 id `upstream-sync-record`，进两个 gate 数组尾部）

**`ciSharedStaticGates()`（`:297`，在 `:312` 的 `]` 之前加一行）**：

```diff
 function ciSharedStaticGates(): Gate[] {
   return [
     pnpmScript('runtime-closure', 'verify-runtime-closure', { label: 'runtime closure' }),
     ...
     pnpmScript('no-bare-dispatcher', 'verify-no-bare-dispatcher', { label: 'proxy-aware dispatchers' }),
     pnpmScript('issue-management', 'test:issue-management', { label: 'Issue management policy' }),
+    pnpmScript('upstream-sync-record', 'verify-upstream-sync-record', { label: 'upstream sync record' }),
   ]
 }
```

**`hygieneLeafGates()`（`:687`，在 `:710` 的 `]` 之前加同一行）**：

```diff
 function hygieneLeafGates(options: { artifactNeeds?: string[] } = {}): Gate[] {
   ...
   return [
     pnpmScript('rescope-vendor', 'rescope-vendor:check', { label: 'vendor rescope' }),
     ...
     pnpmScript('no-bare-dispatcher', 'verify-no-bare-dispatcher', { label: 'proxy-aware dispatchers' }),
+    pnpmScript('upstream-sync-record', 'verify-upstream-sync-record', { label: 'upstream sync record' }),
   ]
 }
```

`ciSharedStaticGates` 与 `hygieneLeafGates` 从不出现在同一 mode（S2 已核，见 §7.1），
所以同一个 gate id `upstream-sync-record` 在两个数组里不会触发 `validateGateGraph` 的 duplicate-id 检查（`:813`）。

不加 `quick: true`（该门不是 documentation aggregate 的一部分；它检查的是 merge 完整性，与文档无关）。

---

## §4.4.4 §7.2 第 7/8 条现状

### 第 7 条：`upstream-status.ts` 从未运行；`ls-remote` / `fetch` 语义按文档写

⚠ **完全未核**。`upstream-status.ts` 脚本尚不存在（只有 `upstream-sync-record.ts` 模块在 §4.2/§4.2.bis 里写好了）。
`upstream-status` 的设计摘要见 [`um15-first-slice-implementation-2026-09-14.md`](um15-first-slice-implementation-2026-09-14.md) §4.6。

`upstream-status.ts` 的网络路径（`git ls-remote upstream` / `git fetch upstream`）的 exit code 语义、
输出解析、`--no-fetch` 行为，均**按 git 文档写，未实测**。原因：本 subagent 禁止 `git fetch`（会写 FETCH_HEAD），
也禁止跑 `upstream-status.ts`（它可能发网络 + 写 ref）。

设计意图（按文档）：
- `git ls-remote upstream refs/heads/master` → 输出 `<sha>\trefs/heads/master`，解析 `<sha>` 为远端 HEAD。
  exit 0 = 成功；非 0 = 网络错误或 remote 不存在 → `RefState = 'unknown'`。
- `git fetch upstream master`（不带 `--no-fetch` 时）→ exit 0 = 成功更新 `upstream/master`；
  非 0 = 网络错误 → `RefState = 'unknown'`。
- `--no-fetch` 时不 fetch，改用 `ls-remote` 比远端（避免发网络但仍不靠陈旧 ref）。

⚠ `ls-remote` 在 shallow checkout 上的行为未验（可能需要 `--no-tags` 或 `--heads` 限定）。
⚠ `fetch` 在 CI 上的 `actions/checkout` 环境（无 `upstream` remote 配置）的行为未验。

### 第 8 条：`upstream/master` 当前 sha 是否 stale

**本地 ref 实测**（`git rev-parse --verify refs/remotes/upstream/master`）：

```
$ git rev-parse --verify refs/remotes/upstream/master
5dda764ed3aa172535a7967b06ff95d9cbfe536a
```

**与 record 的关系**：
- `record.current.upstreamSha` = `c389f96bf3`
- `upstream/master` 本地 ref = `5dda764ed3`
- `c389f96bf3` 是 `5dda764ed3` 的 ancestor（`git merge-base --is-ancestor c389f96bf3 5dda764ed3` = YES）

所以本地 ref **领先于** record（upstream 在 M2 之后又前进了一些），不是 stale。
`verifyRecordedBaseAgainstTracking` 会发一条 note："ref may be stale or record may be behind" ——
实际含义是后者（record is behind）。

⚠ **远端 HEAD 未核**：设计草案说真远端 HEAD 是 `2377c272a8`（比 `5dda764ed3` 更新），
但本 subagent 禁止 `git ls-remote`，无法确认。`5dda764ed3` 是上次 `fetch` 的结果，
可能本身已落后于远端。`upstream-status.ts` 落地后用 `ls-remote` 复核。

⚠ **`a469c899bd` 已过期**：研究笔记（§4.1 拓扑、first-slice §2.4.bis）写的 "当前 HEAD `a469c899bd`" 已过期。
实际 HEAD = `12d02c7687`（`a469c899bd` 是更早的 `[UM12] fix(docs)` commit，在 `10941436b5` 之前）。
本文件全部按 `12d02c7687` 写。

---

## §4.4.5 诚实边界

### 已实测（只读 git，tip `12d02c7687`）

- §4.0 三道门数字（100/2/27 for M1, 0/0/0 for M2）—— 本节 §4.3 复核，完全吻合。
- §4.1 拓扑真值（B1=`141eb6fef8`、B2=`d347e70390`=U1、M1/M2 parents、`merge-base --is-ancestor`）—— 实测确认。
- §4.4 `upstream-sync.json` 全部 sha + 时间戳 —— `git show -s --format=%cI` / `git tag --points-at` 实测取值。
- §4.4.2 waivers 覆盖关系 —— 逐条 grep 确认 path 分组与数量。
- `upstream/master` 本地 ref = `5dda764ed3`，`c389f96bf3` is its ancestor —— `git rev-parse` + `git merge-base --is-ancestor` 实测。
- `package.json` 行号（`:167` / `:168`）—— `grep -n` 实测。
- `run-gates.ts` 的 `ciSharedStaticGates`（`:297`）/ `hygieneLeafGates`（`:687`）函数体 —— `sed -n` 读取。

### ⚠ 未核

1. **tsc / oxlint / vitest 未跑**（禁止）。所有类型与 lint 结论为静态推理。
   代码按 `tsconfig.base.json`（`strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`）
   与 `.oxlintrc.json:153-181`（`no-non-null-assertion` / `no-unnecessary-condition` /
   `only-throw-error` / `require-await` / `restrict-template-expressions`(allowNumber+allowBoolean) /
   `switch-exhaustiveness-check` / 全套 `no-unsafe-*`）写。
   `no-unused-vars` 的 `argsIgnorePattern: "^_"` 允许 `_label` 不报警（`.oxlintrc.json` 实测确认）。

2. **`upstream-status.ts` 完全没运行**（网络 + 写 FETCH_HEAD）。`ls-remote` / `fetch` 语义按文档写（§4.4.4 第 7 条）。

3. **远端 HEAD 未核**（禁止 `ls-remote`）。`5dda764ed3` 是上次 `fetch` 的本地 ref，可能已落后于远端（§4.4.4 第 8 条）。

4. **`a469c899bd` 已过期**：研究笔记写的 "当前 HEAD `a469c899bd`" 已过期，实际 HEAD = `12d02c7687`。

5. **revert-fork HEAD 残余 6 vs §4.0 表的 7**：两个 tip 上均实测为 6，§4.0 的 7 未复现。差异原因未查明（§4.3.4）。

6. **`RAW_ENTRY` 字符集 `[ADMT]`**：`diff-tree -r` 不开 `--find-renames`，所以不会出现 R/C 状态。
   但如果有人误加 `-M` 或 `--find-renames`，R/C 行会被 `parseDiffTreeRaw` 静默跳过。
   实现中不传这些 flag，但未写防御性断言。

7. **`thresholds.daysSinceSync: 14` / `commitsBehind: 50`**：默认值，未与 product owner 确认。这些只影响 `upstream-status` 报告的报警阈值，不影响门。

8. **`verify-upstream-sync-record.ts` 门脚本本身未写**：本节只交付 `upstream-sync-record.ts` 模块（上+下半部分）+ 初始 `upstream-sync.json` + 接线方案。
   门脚本（`scripts/verify-upstream-sync-record.ts`）的设计摘要见 first-slice §4.5，落地是下一步。

9. **`scripts/upstream-sync-record.ts` 不存在于代码树**：本节将模块全文写进研究笔记，但**未创建** `scripts/upstream-sync-record.ts` 文件（禁止改仓库文件）。
   落地时需将 §4.2 + §4.2.bis 的代码合并写入 `scripts/upstream-sync-record.ts`。

10. **`upstream-sync.json` 不存在于代码树**：同上，落地时需创建。

11. **108 个真三方解决里的部分 hunk 丢失**：blob 级 sweep 对 revert-fork 模式是穷举的，
    但 108 个真三方解决（M1 60 + M2 48）未逐 hunk 审计（UM-MERGE-INTEGRITY 诚实边界已列）。三道门不抓三方解决的 hunk 级损失 —— 这是设计上正确的（那不是 merge 的方向性损失）。
