import { describe, expect, it } from 'vitest'
import { loadCase, loadCases } from '../src/case_loader.ts'

const fixtures = import.meta.dirname!
const s1Yaml = `${fixtures}/fixtures/s1.yaml`
const s3Json = `${fixtures}/fixtures/s3-scalar.json`

describe('case_loader', () => {
  it('loads + validates a YAML case', () => {
    const c = loadCase(s1Yaml)
    expect(c.case_id).toBe('s1-multiturn-pass')
    expect(c.input.turns.length).toBe(2)
    expect(c.expected.match_mode).toBe('scalar_exact')
  })

  it('loads + validates a JSON case', () => {
    const c = loadCase(s3Json)
    expect(c.case_id).toBe('s3-scalar')
    expect(c.expected.result_value).toEqual({ value: 12345 })
  })

  it('loads several cases in order', () => {
    const cs = loadCases([s1Yaml, s3Json])
    expect(cs.map(c => c.case_id)).toEqual(['s1-multiturn-pass', 's3-scalar'])
  })

  it('rejects a duplicate case_id across files', () => {
    expect(() => loadCases([s1Yaml, s1Yaml])).toThrow(/duplicate case_id/)
  })

  it('throws on a missing file', () => {
    expect(() => loadCase(`${fixtures}/fixtures/no-such-file.yaml`)).toThrow()
  })
})
