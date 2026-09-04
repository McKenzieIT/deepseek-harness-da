import { describe, it, expect } from 'vitest'
import { findViolations, PROD_SRC_PATTERN } from './verify-no-production-src-on-master'

describe('PROD_SRC_PATTERN', () => {
  it.each([
    'packages/data/evidence-query/src/index.ts',
    'packages/core/session/src/types.ts',
    'packages/data/src/foo.ts',
    // apps/<app>/src — apps/ is a policy-protected surface (template §2 allowlist).
    'apps/cli/src/bin.ts',
    'apps/web/src/index.tsx',
    'apps/web/lib/types/src/x.ts',
    // native/<pkg>/.../src — native/ is a policy-protected surface.
    'native/landlock-run/packages/entry/src/index.ts',
    // python/<pkg>/src — python/ is a policy-protected surface.
    'python/sdk/src/mod.py',
    'python/sdk-runtime/src/x.py',
    // scripts/ has no src/ subdir; the .ts/.sh/.py files are themselves the source,
    // so the whole scripts/ tree is protected (matches the policy's protected dir).
    'scripts/verify-md-links.ts',
    'scripts/types/foo.ts',
    'scripts/release/bump.ts',
  ])('matches protected production source: %s', (path) => {
    expect(PROD_SRC_PATTERN.test(path)).toBe(true)
  })

  it.each([
    'packages/data/evidence-query/package.json',
    'packages/data/evidence-query/tests/x.spec.ts',
    'packages/eval/eval/cases/k11-v2/case.yaml',
    'wayfinder/data-agent/map.md',
    'docs/da-pr-workflow.md',
    'lefthook.yml',
    // src-style gaps: policy protects entire apps/native/python dirs, but this gate
    // stays src-only to mirror the existing packages/*/src scope. Non-src files in
    // those dirs are NOT caught here — the PR body lists them as known gaps.
    'apps/web/README.md',
    'apps/cli/config/foo.json',
    'python/sdk/tests/x.py',
    'python/sdk-runtime/hatch_build.py',
    'native/landlock-run/docs/README.md',
    'native/landlock-run/scripts/foo.sh',
  ])('does not match non-src paths: %s', (path) => {
    expect(PROD_SRC_PATTERN.test(path)).toBe(false)
  })
})

describe('findViolations', () => {
  const filesFor = (map: Record<string, string[]>) => (sha: string): string[] => map[sha] ?? []
  const subjectFor = (map: Record<string, string>) => (sha: string): string => map[sha] ?? '(no subject)'

  it('returns only the commits that touch packages/*/src', () => {
    const commits = ['aaa', 'bbb', 'ccc']
    const files = {
      aaa: ['packages/data/evidence-query/src/index.ts', 'wayfinder/x.md'],
      bbb: ['wayfinder/ticket.md'],
      ccc: ['packages/core/session/src/types.ts'],
    }
    const subjects = { aaa: 'fix(data): src change', bbb: 'docs(wayfinder): map', ccc: 'feat(core): new type' }
    const violations = findViolations(commits, filesFor(files), subjectFor(subjects))
    expect(violations).toHaveLength(2)
    expect(violations).toMatchObject([
      { sha: 'aaa', subject: 'fix(data): src change', files: ['packages/data/evidence-query/src/index.ts'] },
      { sha: 'ccc', subject: 'feat(core): new type' },
    ])
  })

  it('returns empty when no commit touches src', () => {
    const violations = findViolations(
      ['aaa'],
      filesFor({ aaa: ['wayfinder/x.md', 'docs/y.md'] }),
      subjectFor({}),
    )
    expect(violations).toEqual([])
  })

  it('returns empty for an empty commit list', () => {
    expect(findViolations([], filesFor({}), subjectFor({}))).toEqual([])
  })
})
