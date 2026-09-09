import { describe, expect, it } from 'vitest'
import { EvalCaseSchema } from '../src/eval_case.ts'
import { REFERENCE_PLACEHOLDERS, resolveReferenceSql } from '../src/reference_sql.ts'

/** Build a case carrying 'sql' as its reference SQL and 'anchorDs' as its snapshot anchor. */
function caseWith(sql: string | undefined, anchorDs?: string) {
  return EvalCaseSchema.parse({
    case_id: 'c',
    input: { question: 'q' },
    expected: { sql, result_value: { value: 1 }, match_mode: 'scalar_exact' },
    ...(anchorDs === undefined ? {} : { meta: { anchor_ds: anchorDs } }),
  })
}

describe('resolveReferenceSql', () => {
  it('substitutes ds_yesterday as the day before the case anchor', () => {
    const r = resolveReferenceSql(caseWith("SELECT 1 WHERE ds = '{{ds_yesterday}}'", '20260806'))
    expect(r.kind).toBe('resolved')
    if (r.kind !== 'resolved') return
    expect(r.sql).toBe("SELECT 1 WHERE ds = '20260805'")
    expect(r.anchorDs).toBe('20260806')
    expect(r.substitutions).toEqual({ ds_yesterday: '20260805' })
  })

  it('substitutes ds_7d_ago as seven days before the case anchor', () => {
    const r = resolveReferenceSql(caseWith("SELECT 1 WHERE ds >= '{{ds_7d_ago}}'", '20260806'))
    expect(r.kind).toBe('resolved')
    if (r.kind !== 'resolved') return
    expect(r.sql).toBe("SELECT 1 WHERE ds >= '20260730'")
    expect(r.substitutions).toEqual({ ds_7d_ago: '20260730' })
  })

  it('resolves each case against its own anchor, not a shared constant', () => {
    const a = resolveReferenceSql(caseWith("ds='{{ds_yesterday}}'", '20260806'))
    const b = resolveReferenceSql(caseWith("ds='{{ds_yesterday}}'", '20260101'))
    expect(a.kind === 'resolved' && a.sql).toBe("ds='20260805'")
    expect(b.kind === 'resolved' && b.sql).toBe("ds='20251231'")
  })

  it('crosses a month boundary correctly', () => {
    const r = resolveReferenceSql(caseWith("ds='{{ds_7d_ago}}'", '20260302'))
    expect(r.kind === 'resolved' && r.sql).toBe("ds='20260223'")
  })

  it('substitutes every occurrence of a repeated placeholder', () => {
    const r = resolveReferenceSql(caseWith("a='{{ds_yesterday}}' OR b='{{ds_yesterday}}'", '20260806'))
    expect(r.kind === 'resolved' && r.sql).toBe("a='20260805' OR b='20260805'")
  })

  it('passes through SQL that carries no placeholder, anchor or not', () => {
    const r = resolveReferenceSql(caseWith('SELECT 1'))
    expect(r.kind).toBe('resolved')
    if (r.kind !== 'resolved') return
    expect(r.sql).toBe('SELECT 1')
    expect(r.anchorDs).toBeUndefined()
    expect(r.substitutions).toEqual({})
  })

  it('reports absent when the case declares no reference SQL', () => {
    expect(resolveReferenceSql(caseWith(undefined)).kind).toBe('absent')
  })

  it('refuses a template whose case declares no anchor_ds', () => {
    const r = resolveReferenceSql(caseWith("ds='{{ds_yesterday}}'"))
    expect(r.kind).toBe('unresolvable')
    if (r.kind !== 'unresolvable') return
    expect(r.reason).toBe('missing-anchor')
    expect(r.detail).toContain('ds_yesterday')
  })

  it('refuses an unknown placeholder instead of passing it through', () => {
    const r = resolveReferenceSql(caseWith("ds='{{ds_tomorrow}}'", '20260806'))
    expect(r.kind).toBe('unresolvable')
    if (r.kind !== 'unresolvable') return
    expect(r.reason).toBe('unknown-placeholder')
    expect(r.detail).toContain('ds_tomorrow')
  })

  it('names a repeated unknown placeholder once', () => {
    const r = resolveReferenceSql(caseWith("a='{{ds_tomorrow}}' OR b='{{ds_tomorrow}}'", '20260806'))
    expect(r.kind).toBe('unresolvable')
    if (r.kind !== 'unresolvable') return
    expect(r.detail.match(/ds_tomorrow/g)).toHaveLength(1)
  })

  it('refuses a malformed anchor_ds rather than computing a bogus ds', () => {
    const r = resolveReferenceSql(caseWith("ds='{{ds_yesterday}}'", '2026-08-06'))
    expect(r.kind).toBe('unresolvable')
    if (r.kind !== 'unresolvable') return
    expect(r.reason).toBe('malformed-anchor')
  })

  it('enumerates the closed placeholder set', () => {
    expect([...REFERENCE_PLACEHOLDERS]).toEqual(['ds_yesterday', 'ds_7d_ago'])
  })
})
