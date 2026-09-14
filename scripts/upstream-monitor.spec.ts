import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { monitorUpstream } from './upstream-monitor.ts'
import { probeRef } from './upstream-status.ts'
import { collectGitFailures, readUpstreamSyncRecord, type UpstreamSyncRecord } from './upstream-sync-record.ts'

/**
 * A fixture repository with a real path-based `upstream` remote, so ref
 * probing, `ls-remote`, and `fetch` all work offline.
 */
interface Fixture {
  /** Temp container holding the bare remote, the seed clone, and the fork. */
  readonly container: string
  /** The fork checkout: the repository under test. */
  readonly root: string
  /** Path of the bare repository wired as remote `upstream`. */
  readonly remote: string
  /** Base commit shared by fork and upstream. */
  readonly base: string
  /** Upstream commit recorded as `current.upstreamSha`. */
  readonly upstreamHead: string
  /** Fork-only commit that becomes the merge's first parent. */
  readonly forkHead: string
  /** Merge commit recorded as `current.mergeCommit`. */
  readonly merge: string
}

const MS_PER_DAY = 86_400_000
const REPOSITORY_ROOT = join(import.meta.dirname, '..')
const fixtureContainers: string[] = []

afterEach(() => {
  for (const container of fixtureContainers.splice(0)) rmSync(container, { recursive: true, force: true })
})

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

/** Commit `path` with a pinned committer/author date so timestamps are deterministic. */
function commitAt(root: string, path: string, content: string, when: string): string {
  const absolute = join(root, path)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, content)
  execFileSync('git', ['-C', root, 'add', '--', path], { stdio: ['pipe', 'pipe', 'pipe'] })
  execFileSync('git', ['-C', root, 'commit', '-m', `add ${path}`], {
    env: { ...process.env, LANG: 'C', LC_ALL: 'C', GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return git(root, ['rev-parse', 'HEAD'])
}

/** An ISO instant `days` before now, with an explicit offset git round-trips. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * MS_PER_DAY).toISOString().replace('Z', '+00:00')
}

function configure(root: string): void {
  git(root, ['config', 'user.email', 'upstream-monitor@example.com'])
  git(root, ['config', 'user.name', 'Upstream Monitor Tests'])
  git(root, ['config', 'commit.gpgsign', 'false'])
}

/**
 * Build a fork whose `merge` commit really absorbed `upstreamHead` as its
 * second parent, with `upstream/master` fetched from a local bare remote.
 * `syncedDaysAgo` dates the merge, which is what staleness reads.
 */
function fixture(syncedDaysAgo = 1): Fixture {
  const container = mkdtempSync(join(tmpdir(), 'dsh-upstream-monitor-'))
  fixtureContainers.push(container)
  const remote = join(container, 'upstream.git')
  const seed = join(container, 'seed')
  const root = join(container, 'fork')

  git(container, ['init', '--bare', '--initial-branch=master', remote])
  git(container, ['init', '--initial-branch=master', root])
  configure(root)
  const base = commitAt(root, 'shared.txt', 'base\n', daysAgo(syncedDaysAgo + 30))
  git(root, ['remote', 'add', 'upstream', remote])
  git(root, ['push', '--quiet', 'upstream', 'master'])

  git(container, ['clone', '--quiet', '--no-local', remote, seed])
  configure(seed)
  const upstreamHead = commitAt(seed, 'upstream-only.txt', 'upstream\n', daysAgo(syncedDaysAgo + 20))
  git(seed, ['push', '--quiet', 'origin', 'master'])

  git(root, ['fetch', '--quiet', 'upstream', 'master'])
  const forkHead = commitAt(root, 'fork-only.txt', 'fork\n', daysAgo(syncedDaysAgo + 10))
  execFileSync('git', ['-C', root, 'merge', '--no-ff', '--no-edit', '-m', 'merge upstream', upstreamHead], {
    env: { ...process.env, LANG: 'C', LC_ALL: 'C', GIT_AUTHOR_DATE: daysAgo(syncedDaysAgo), GIT_COMMITTER_DATE: daysAgo(syncedDaysAgo) },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const merge = git(root, ['rev-parse', 'HEAD'])
  return { container, root, remote, base, upstreamHead, forkHead, merge }
}

/** Advance the bare remote by `count` commits the fork has not merged. */
function advanceRemote(context: Fixture, count: number): string {
  const seed = join(context.container, 'seed')
  let head = ''
  for (let index = 0; index < count; index += 1) {
    head = commitAt(seed, `remote-${index}.txt`, `remote ${index}\n`, daysAgo(0))
  }
  git(seed, ['push', '--quiet', 'origin', 'master'])
  return head
}

/** The record the fixture's real git history supports. */
function record(context: Fixture, overrides: Partial<UpstreamSyncRecord> = {}): UpstreamSyncRecord {
  return {
    current: {
      upstreamSha: context.upstreamHead,
      upstreamCommittedAt: git(context.root, ['show', '-s', '--format=%cI', context.upstreamHead]),
      mergeCommit: context.merge,
      syncedAt: git(context.root, ['show', '-s', '--format=%cI', context.merge]),
    },
    history: [],
    thresholds: { daysSinceSync: 14, commitsBehind: 150 },
    waivers: [],
    ...overrides,
  }
}

function writeRecord(context: Fixture, value: unknown): void {
  writeFileSync(join(context.root, 'upstream-sync.json'), `${JSON.stringify(value, undefined, 2)}\n`)
}

interface Invocation {
  readonly status: number
  readonly stdout: string
  readonly stderr: string
}

/** Run one repository CLI as a real process against a fixture root. */
function invoke(script: string, args: string[]): Invocation {
  const result = execFileSync('pnpm', ['--silent', 'exec', 'tsx', join(REPOSITORY_ROOT, 'scripts', script), ...args], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    env: { ...process.env, LANG: 'C', LC_ALL: 'C' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return { status: 0, stdout: result, stderr: '' }
}

/** Same as `invoke`, tolerating a non-zero exit so the code can be asserted. */
function invokeAllowingFailure(script: string, args: string[]): Invocation {
  try {
    return invoke(script, args)
  } catch (cause) {
    const failure = cause as { status?: number; stdout?: string; stderr?: string }
    return { status: failure.status ?? -1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' }
  }
}

describe('upstream monitoring', { timeout: 180_000 }, () => {
  it('separates the always-zero report from the actionable monitor on one stale checkout', () => {
    const context = fixture(40)
    writeRecord(context, record(context))
    advanceRemote(context, 3)

    const report = invokeAllowingFailure('upstream-status.ts', ['--root', context.root])
    const monitor = invokeAllowingFailure('upstream-monitor.ts', ['--root', context.root])

    // The report is deliberately not a gate: a scheduled run of it can never fail.
    expect(report.status).toBe(0)
    expect(report.stdout).toContain('days since sync, exceeds threshold 14')
    // The monitor turns the same finding into a failed job.
    expect(monitor.status).toBe(1)
    expect(monitor.stdout).toContain('upstream-monitor: verdict = stale-threshold')
  })

  it('passes when the fork carries the current upstream head inside both thresholds', () => {
    const context = fixture(1)
    writeRecord(context, record(context))

    const result = monitorUpstream(context.root, { noFetch: false })

    expect(result.verdict).toBe('fresh')
    expect(result.exitCode).toBe(0)
    expect(result.lines.join('\n')).toContain('behind-count = 0 commits')
  })

  it('fails when the fork falls further behind than the recorded commit threshold', () => {
    const context = fixture(1)
    writeRecord(context, record(context, { thresholds: { daysSinceSync: 14, commitsBehind: 2 } }))
    advanceRemote(context, 3)

    const result = monitorUpstream(context.root, { noFetch: false })

    expect(result.verdict).toBe('stale-threshold')
    expect(result.exitCode).toBe(1)
    expect(result.lines.join('\n')).toContain('3 commits behind, exceeds threshold 2')
  })

  it('fails when the last sync is older than the recorded day threshold', () => {
    const context = fixture(40)
    writeRecord(context, record(context))

    const result = monitorUpstream(context.root, { noFetch: false })

    expect(result.verdict).toBe('stale-threshold')
    expect(result.exitCode).toBe(1)
    expect(result.lines.join('\n')).toMatch(/4[01] days since sync, exceeds threshold 14/)
  })

  it('fails when the upstream remote cannot be probed at all', () => {
    const context = fixture(1)
    writeRecord(context, record(context))
    git(context.root, ['remote', 'set-url', 'upstream', join(context.container, 'absent.git')])

    const result = monitorUpstream(context.root, { noFetch: false })

    expect(result.verdict).toBe('remote-unavailable')
    expect(result.exitCode).toBe(3)
    expect(result.lines.join('\n')).toContain('ref state = unknown')
  })

  it('fails when the sync record is unreadable', () => {
    const context = fixture(1)
    writeFileSync(join(context.root, 'upstream-sync.json'), '{ not json\n')

    const result = monitorUpstream(context.root, { noFetch: false })

    expect(result.verdict).toBe('invalid-record')
    expect(result.exitCode).toBe(2)
    expect(result.lines.join('\n')).toContain('upstream-sync.json is not valid JSON')
  })

  it('fails when the sync record violates its own shape contract', () => {
    const context = fixture(1)
    writeRecord(context, record(context, { thresholds: { daysSinceSync: 14, commitsBehind: 0 } }))

    const result = monitorUpstream(context.root, { noFetch: false })

    expect(result.verdict).toBe('invalid-record')
    expect(result.exitCode).toBe(2)
    expect(result.lines.join('\n')).toContain('thresholds.commitsBehind must be a positive integer')
  })

  it('fails when the recorded upstream commit is absent from the checkout ancestry', () => {
    const context = fixture(1)
    const unmerged = advanceRemote(context, 1)
    git(context.root, ['fetch', '--quiet', 'upstream', 'master'])
    const current = { ...record(context).current, upstreamSha: unmerged }
    writeRecord(context, { ...record(context), current })

    const result = monitorUpstream(context.root, { noFetch: false })

    expect(result.verdict).toBe('invalid-record')
    expect(result.exitCode).toBe(2)
    expect(result.lines.join('\n')).toContain('is not an ancestor of HEAD')
  })

  it('withholds a behind-count instead of reporting false green when the tracking ref is stale', () => {
    const context = fixture(1)
    writeRecord(context, record(context))
    advanceRemote(context, 2)

    const result = monitorUpstream(context.root, { noFetch: true })

    expect(result.verdict).toBe('indeterminate')
    expect(result.exitCode).toBe(4)
    expect(result.lines.join('\n')).toContain('ref state = stale')
  })

  it('counts a fetch that advances the tracking ref as fresh, not as its own staleness', () => {
    const context = fixture(1)
    writeRecord(context, record(context))
    const advanced = advanceRemote(context, 2)

    const probe = probeRef(context.root, false)
    const report = invokeAllowingFailure('upstream-status.ts', ['--root', context.root])

    // Reading the local ref before the fetch would report stale here and
    // withhold the behind-count on every run where upstream had moved.
    expect(probe.state).toBe('fresh')
    expect(probe.localSha).toBe(advanced)
    expect(probe.remoteSha).toBe(advanced)
    expect(report.stdout).toContain('behind-count = 2 commits')
  })

  it('accepts a fresh tracking ref without fetching', () => {
    const context = fixture(1)
    writeRecord(context, record(context))

    const result = monitorUpstream(context.root, { noFetch: true })

    expect(result.verdict).toBe('fresh')
    expect(result.exitCode).toBe(0)
  })

  it('reports a merge whose second parent is not the recorded upstream commit', () => {
    const context = fixture(1)
    const current = { ...record(context).current, upstreamSha: context.base }
    current.upstreamCommittedAt = git(context.root, ['show', '-s', '--format=%cI', context.base])
    writeRecord(context, { ...record(context), current })

    const report = collectGitFailures(readUpstreamSyncRecord(context.root), context.root)

    expect(report.failures.join('\n')).toContain(
      `current: mergeCommit's second parent is ${context.upstreamHead.slice(0, 12)}, not the recorded ${context.base.slice(0, 12)}`,
    )
  })

  it('writes the verdict to a report file even when the monitor fails', () => {
    const context = fixture(40)
    writeRecord(context, record(context))
    const reportPath = join(context.container, 'reports', 'upstream-monitor.txt')

    const monitor = invokeAllowingFailure('upstream-monitor.ts', ['--root', context.root, '--report', reportPath])

    expect(monitor.status).toBe(1)
    expect(readFileSync(reportPath, 'utf8')).toContain('upstream-monitor: verdict = stale-threshold')
  })
})
