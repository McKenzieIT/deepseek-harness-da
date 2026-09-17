/** Stage 0 tests for the controlled runner's frozen schedule and parity gates. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildDecisionPlan,
  selectSmokeCases,
  validateObservationParity,
  type G25aManifest,
} from '../src/controlled-runner.ts'

const MANIFEST = JSON.parse(readFileSync(resolve(import.meta.dirname, '../cases/manifest.json'), 'utf8')) as G25aManifest

describe('controlled runner plan', () => {
  it('builds the locked 252-Attempt decision schedule deterministically', () => {
    const first = buildDecisionPlan(MANIFEST)
    const second = buildDecisionPlan(MANIFEST)
    expect(first).toEqual(second)
    expect(first).toHaveLength(252)
    for (const testCase of MANIFEST.cases) {
      const rows = first.filter(attempt => attempt.caseId === testCase.case_id)
      expect(rows.filter(attempt => attempt.arm === 'state_machine')).toHaveLength(3)
      expect(rows.filter(attempt => attempt.arm === 'policy')).toHaveLength(3)
      expect(rows.filter(attempt => attempt.arm === 'floor')).toHaveLength(1)
      expect(new Set(rows.map(attempt => attempt.taskDigest))).toHaveLength(1)
    }
  })

  it('fails loud because the amended manifest cannot satisfy the still-locked smoke complexity mix', () => {
    expect(() => selectSmokeCases(MANIFEST)).toThrow(/requires 2×L1, 1×L2, 1×L3, and 1×L4.*has L1=0, L2=10, L3=2, L4=0/)
  })

  it('rejects tool-catalogue or Task-working-set drift across arms', () => {
    expect(() => validateObservationParity([
      { arm: 'state_machine', taskDigest: 'same', toolNames: ['a', 'b'] },
      { arm: 'policy', taskDigest: 'same', toolNames: ['a', 'c'] },
      { arm: 'floor', taskDigest: 'same', toolNames: ['a', 'b'] },
    ])).toThrow(/tool catalogue drift/)
    expect(() => validateObservationParity([
      { arm: 'state_machine', taskDigest: 'a', toolNames: ['a'] },
      { arm: 'policy', taskDigest: 'b', toolNames: ['a'] },
      { arm: 'floor', taskDigest: 'a', toolNames: ['a'] },
    ])).toThrow(/Task working set drift/)
  })
})
