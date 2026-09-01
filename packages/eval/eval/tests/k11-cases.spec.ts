import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadCases } from '../src/case_loader.ts'

const CASES_DIR = join(import.meta.dirname, '../cases/k11-v2')

describe('K11 eval cases', () => {
  const casePaths = readdirSync(CASES_DIR)
    .filter(f => f.startsWith('k11v2_') && f.endsWith('.yaml'))
    .sort()
    .map(f => join(CASES_DIR, f))

  it('contains exactly 168 case files', () => {
    expect(casePaths).toHaveLength(168)
  })

  it('all 168 cases pass EvalCaseSchema validation via loadCases', () => {
    const cases = loadCases(casePaths)
    expect(cases).toHaveLength(168)
  })

  it('all case_ids are unique and correctly formatted', () => {
    const cases = loadCases(casePaths)
    const ids = cases.map(c => c.case_id)
    expect(new Set(ids).size).toBe(168)
    for (const id of ids) {
      expect(id).toMatch(/^k11v2_((alias|voice)_)?\d{3}$/)
    }
  })

  it('covers all 8 query intents', () => {
    const cases = loadCases(casePaths)
    const intents = new Set(cases.map(c => (c.dimensions as Record<string, unknown>).query_intent))
    expect(intents).toEqual(new Set([
      'metric_lookup', 'trend', 'ranking', 'distribution',
      'proportion', 'comparison', 'open_ended', 'filter',
    ]))
  })

  it('covers all 4 SQL complexity levels', () => {
    const cases = loadCases(casePaths)
    const levels = new Set(cases.map(c => (c.dimensions as Record<string, unknown>).sql_complexity))
    expect(levels).toEqual(new Set(['L1', 'L2', 'L3', 'L4']))
  })

  it('every non-voice case references at least one covered_asset', () => {
    const cases = loadCases(casePaths)
    for (const c of cases) {
      // voice/open-ended cases legitimately carry no specific covered_asset.
      if (c.case_id.startsWith('k11v2_voice_')) continue
      const assets = (c.dimensions as Record<string, unknown>).covered_assets as string[]
      expect(assets.length).toBeGreaterThan(0)
    }
  })
})
