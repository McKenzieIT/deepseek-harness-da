import { describe, it, expect } from 'vitest'
import { findViolations, PROD_SRC_PATTERN } from './verify-no-production-src-on-master'

describe('PROD_SRC_PATTERN', () => {
  it.each([
    'packages/data/evidence-query/src/index.ts',
    'packages/core/session/src/types.ts',
    'packages/data/src/foo.ts',
  ])('matches production package source: %s', (path) => {
    expect(PROD_SRC_PATTERN.test(path)).toBe(true)
  })

  it.each([
    'packages/data/evidence-query/package.json',
    'packages/data/evidence-query/tests/x.spec.ts',
    'packages/eval/eval/cases/k11-v2/case.yaml',
    'wayfinder/data-agent/map.md',
    'docs/da-pr-workflow.md',
    'scripts/verify-foo.ts',
    'lefthook.yml',
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
