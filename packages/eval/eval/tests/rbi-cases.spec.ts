import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadCases } from '../src/case_loader.ts'
import { resolveReferenceSql } from '../src/reference_sql.ts'

const CASES_DIR = join(import.meta.dirname, '../cases/rbi-10000251-exec')

describe('rbi-10000251-exec eval cases', () => {
  const casePaths = readdirSync(CASES_DIR)
    .filter(f => f.endsWith('.yaml'))
    .sort()
    .map(f => join(CASES_DIR, f))

  it('contains exactly 39 case files', () => {
    expect(casePaths).toHaveLength(39)
  })

  it('all 39 cases pass EvalCaseSchema validation via loadCases', () => {
    expect(loadCases(casePaths)).toHaveLength(39)
  })

  it('every case reaches the grader with its reference SQL', () => {
    for (const c of loadCases(casePaths)) {
      expect(typeof c.expected.sql).toBe('string')
      expect(c.expected.sql).not.toBe('')
    }
  })

  it('every case declaring a template placeholder also declares an anchor_ds', () => {
    for (const c of loadCases(casePaths)) {
      if (!/\{\{/.test(c.expected.sql ?? '')) continue
      expect(c.meta?.anchor_ds, c.case_id).toMatch(/^\d{8}$/)
    }
  })

  it('carries the tier and provenance that make these the reference template', () => {
    for (const c of loadCases(casePaths)) {
      expect(c.meta?.tier, c.case_id).toBe('verified')
      expect(c.meta?.provenance, c.case_id).toBe('migrated')
    }
  })

  it('every reference SQL resolves to executable SQL with no placeholder left', () => {
    for (const c of loadCases(casePaths)) {
      const r = resolveReferenceSql(c)
      expect(r.kind, `${c.case_id}: ${r.kind === 'unresolvable' ? r.detail : ''}`).toBe('resolved')
      if (r.kind !== 'resolved') continue
      expect(r.sql, c.case_id).not.toContain('{{')
    }
  })

  it('resolves the 37 templated cases against anchor 20260806 and leaves 2 untemplated', () => {
    const resolutions = loadCases(casePaths).map(resolveReferenceSql)
    const templated = resolutions.filter(r => r.kind === 'resolved' && Object.keys(r.substitutions).length > 0)
    expect(templated).toHaveLength(37)
    for (const r of templated) {
      expect(r.kind === 'resolved' && r.anchorDs).toBe('20260806')
    }
  })
})
