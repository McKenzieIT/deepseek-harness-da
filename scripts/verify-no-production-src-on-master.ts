/**
 * Pre-push gate: refuse a push to master whose push range contains a commit
 * touching production package source (packages/<group>/<pkg>/src).
 *
 * Enforces the CLAUDE.md and docs/da-pr-workflow.md rule that changes touching
 * packages source land on a feature branch plus PR, not master; direct-to-main
 * is allowed only for Wayfinder docs and experiment scripts whose diff does not
 * touch packages source. The gate skips every branch other than master and
 * skips when master has nothing to push. Tests override the branch and range
 * through GATE_BRANCH and GATE_RANGE.
 */
import { execFileSync } from 'node:child_process'

export interface Violation {
  /** Commit SHA, as returned by `git rev-list`. */
  sha: string
  /** Commit subject line. */
  subject: string
  /** Production-source files the commit touches. */
  files: string[]
}

/** Matches `packages/<group>/<pkg>/src/...` (one or more path segments before `src`). */
export const PROD_SRC_PATTERN = /^packages\/(?:[^/]+\/)+src\//

/** Return the commits that touch production package source. Pure: git access is injected. */
export function findViolations(
  commits: readonly string[],
  filesFor: (sha: string) => string[],
  subjectFor: (sha: string) => string,
): Violation[] {
  const violations: Violation[] = []
  for (const sha of commits) {
    const files = filesFor(sha).filter(file => PROD_SRC_PATTERN.test(file))
    if (files.length > 0) violations.push({ sha, subject: subjectFor(sha), files })
  }
  return violations
}

function git(args: readonly string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) as string
}

function currentBranch(): string {
  return git(['rev-parse', '--abbrev-ref', 'HEAD']).trim()
}

function pushRange(): string | null {
  let origin: string
  try {
    origin = git(['rev-parse', '--verify', 'origin/master']).trim()
  } catch {
    return null // no origin/master ref locally; nothing to enforce
  }
  const head = git(['rev-parse', 'HEAD']).trim()
  if (origin === head) return null // master is up to date; nothing to push
  return `${origin}..${head}`
}

function report(violations: Violation[]): never {
  console.error('verify-no-production-src-on-master: refusing push to master.')
  console.error('These commits touch packages/*/src and must land on a feature branch + PR, not master:')
  for (const v of violations) {
    console.error(`  ${v.sha.slice(0, 10)} ${v.subject}`)
    for (const file of v.files.slice(0, 8)) console.error(`    ${file}`)
    if (v.files.length > 8) console.error(`    ... +${v.files.length - 8} more`)
  }
  console.error('Per CLAUDE.md / docs/da-pr-workflow.md: move these commits to a feat/ or fix/ branch (cherry-pick + git reset) and open a PR.')
  process.exit(1)
}

export function main(): void {
  const branch = process.env.GATE_BRANCH ?? currentBranch()
  if (branch !== 'master') process.exit(0)

  const range = process.env.GATE_RANGE ?? pushRange()
  if (!range) process.exit(0)

  const commits = git(['rev-list', '--no-merges', range]).trim().split('\n').filter(Boolean)
  const violations = findViolations(
    commits,
    sha => git(['diff-tree', '--no-commit-id', '--name-only', '-r', sha]).trim().split('\n').filter(Boolean),
    sha => git(['log', '-1', '--format=%s', sha]).trim(),
  )
  if (violations.length === 0) process.exit(0)
  report(violations)
}

if (!process.env.VITEST) main()
