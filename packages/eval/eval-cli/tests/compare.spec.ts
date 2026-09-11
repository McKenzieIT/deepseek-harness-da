import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveRunFile } from '../src/compare.ts'

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'resolve-run-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

/**
 * GA-AUDIT1-followup ece-13: `resolveRunFile` must resolve a run id prefix
 * deterministically and fail loud on ambiguity. The previous implementation
 * returned `readdirSync(dir).filter(...).files[0]` — unsorted, with no exact-
 * match preference and no ambiguity guard, so `run-1` could silently load
 * `run-10.json` (whichever the filesystem happened to return first).
 */
describe('resolveRunFile', () => {
  it('prefers an exact `${prefix}.json` over prefix-colliding siblings', () => {
    // 'run-1' is a string-prefix of both 'run-1.json' and 'run-10.json'; the
    // exact file must win so comparing run-1 never accidentally loads run-10.
    writeFileSync(join(dir, 'run-1.json'), '{}')
    writeFileSync(join(dir, 'run-10.json'), '{}')
    expect(resolveRunFile('run-1', dir)).toBe(join(dir, 'run-1.json'))
  })

  it('throws when multiple ambiguous prefix matches remain and no exact file exists', () => {
    writeFileSync(join(dir, 'pre-a.json'), '{}')
    writeFileSync(join(dir, 'pre-b.json'), '{}')
    expect(() => resolveRunFile('pre', dir)).toThrow(/ambiguous/i)
  })

  it('throws when no file matches the prefix', () => {
    expect(() => resolveRunFile('does-not-exist', dir)).toThrow(/no run file/i)
  })

  it('resolves a single unambiguous prefix match', () => {
    writeFileSync(join(dir, 'solo-xyz.json'), '{}')
    expect(resolveRunFile('solo', dir)).toBe(join(dir, 'solo-xyz.json'))
  })
})
