/**
 * Pre-push gate: refuse a push to master whose push range contains a commit
 * touching protected production source (see PROD_SRC_PATTERN for the exact
 * surfaces: packages/.../src, apps/.../src, native/.../src, python/.../src,
 * and scripts/). Enforces the CLAUDE.md and docs/da-pr-workflow.md rule that
 * feat/fix/refactor touching a protected surface land on a branch + PR, not
 * master; direct-to-main is allowed only for Wayfinder docs and experiment
 * scripts whose diff touches none of those surfaces. The gate skips every
 * branch other than master and skips when master has nothing to push. Tests
 * override the branch and range through GATE_BRANCH and GATE_RANGE.
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

/**
 * Matches production source on a direct push to master, mirroring the
 * CLAUDE.md / docs/da-pr-workflow.md rule that feat/fix/refactor touching a
 * protected surface land on a branch + PR, not master. Protected surfaces:
 *   - `packages/<group>/<pkg>/src/`, `apps/<app>/src/`, `native/<pkg>/.../src/`,
 *     `python/<pkg>/src/` — source under a `src/` directory.
 *   - `scripts/` — no `src/` subdir; the .ts/.sh/.py files are themselves the
 *     source, so the whole tree is protected.
 * The gate is src-only to match the existing packages source scope; non-src
 * files in apps/native/python (READMEs, configs, tests/) are NOT caught here.
 */
export const PROD_SRC_PATTERN = /^(?:(?:packages|apps|native|python)\/(?:[^/]+\/)+src\/|scripts\/)/

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
  console.error('These commits touch protected production source and must land on a feature branch + PR, not master:')
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
