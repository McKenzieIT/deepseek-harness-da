import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadCases } from '../src/case_loader.ts'

const CASES_DIR = join(import.meta.dirname, '../cases/k11')

describe('K11 eval cases', () => {
  const casePaths = readdirSync(CASES_DIR)
    .filter(f => f.startsWith('k11_') && f.endsWith('.yaml'))
    .sort()
    .map(f => join(CASES_DIR, f))

  it('contains exactly 161 case files', () => {
    expect(casePaths).toHaveLength(161)
  })

  it('all 161 cases pass EvalCaseSchema validation via loadCases', () => {
    const cases = loadCases(casePaths)
    expect(cases).toHaveLength(161)
  })

  it('all case_ids are unique and correctly formatted', () => {
    const cases = loadCases(casePaths)
    const ids = cases.map(c => c.case_id)
    expect(new Set(ids).size).toBe(161)
    for (const id of ids) {
      expect(id).toMatch(/^k11_\d{3}$/)
    }
  })

  it('covers all 7 query intents', () => {
    const cases = loadCases(casePaths)
    const intents = new Set(cases.map(c => (c.dimensions as Record<string, unknown>).query_intent))
    expect(intents).toEqual(new Set([
      'metric_lookup', 'trend', 'ranking', 'distribution',
      'proportion', 'comparison', 'cohort',
    ]))
  })

  it('covers all 4 SQL complexity levels', () => {
    const cases = loadCases(casePaths)
    const levels = new Set(cases.map(c => (c.dimensions as Record<string, unknown>).sql_complexity))
    expect(levels).toEqual(new Set(['L1', 'L2', 'L3', 'L4']))
  })

  it('every case references at least one covered_asset', () => {
    const cases = loadCases(casePaths)
    for (const c of cases) {
      const assets = (c.dimensions as Record<string, unknown>).covered_assets as string[]
      expect(assets.length).toBeGreaterThan(0)
    }
  })
})
