/* oxlint-disable typescript/no-unsafe-call, typescript/no-unsafe-assignment -- node:fs not resolved by oxlint here (tsc passes). */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveRunFile, checkRenderable, describeExecutionMode } from '../src/compare.ts'

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

/** A run whose config carries `overrides` on top of a fully-recorded baseline. */
function runWith(overrides: Record<string, unknown> | null) {
  const config = overrides === null ? undefined : {
    pass_k: 3,
    verdict_semantics: 'pass^k',
    with_query: true,
    executor_identity: 'dev/maxc-sidecar.mjs',
    comparator_policy_version: 1,
    column_semantics: 'by-name',
    ...overrides,
  }
  return { run_id: 'r', timestamp: '', cases: [], summary: { total: 0, correct: 0, wrong: 0, pass_rate: 0 }, ...(config === undefined ? {} : { config }) }
}

/**
 * G1 D4: a run must state how it graded and what executed its SQL, or a
 * comparison of it is uninterpretable. A run that records a config but omits
 * those fields was produced by a build that should know them, so it is refused
 * rather than warned about.
 */
describe('checkRenderable', () => {
  it('accepts a run that records mode and comparator policy', () => {
    expect(checkRenderable(runWith({})).ok).toBe(true)
  })

  it('refuses a run whose config omits the comparator policy version', () => {
    const v = checkRenderable(runWith({ comparator_policy_version: undefined }))
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/comparator_policy_version/)
  })

  it('refuses a run whose config omits the column semantics', () => {
    const v = checkRenderable(runWith({ column_semantics: undefined }))
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/column_semantics/)
  })

  it('refuses a real-execution run that does not name its executor', () => {
    const v = checkRenderable(runWith({ executor_identity: undefined }))
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/executor_identity/)
  })

  it('accepts a judge-only run with no executor identity, since none executed', () => {
    expect(checkRenderable(runWith({ with_query: false, executor_identity: undefined })).ok).toBe(true)
  })

  it('marks a run with no config at all as unattributable rather than refusing it', () => {
    const v = checkRenderable(runWith(null))
    expect(v.ok).toBe(true)
    expect(v.unattributable).toBe(true)
  })
})

describe('describeExecutionMode', () => {
  it('distinguishes a real-execution run from a judge-only one', () => {
    const real = describeExecutionMode(runWith({}))
    const judgeOnly = describeExecutionMode(runWith({ with_query: false, executor_identity: undefined }))
    expect(real).not.toBe(judgeOnly)
  })

  it('distinguishes two executors, so a stand-in run never reads as a real one', () => {
    const real = describeExecutionMode(runWith({ executor_identity: 'dev/maxc-sidecar.mjs' }))
    const standIn = describeExecutionMode(runWith({ executor_identity: 'dev/standin-sidecar.mjs' }))
    expect(real).not.toBe(standIn)
  })

  it('distinguishes two column semantics, which disagree on aliased results', () => {
    expect(describeExecutionMode(runWith({}))).not.toBe(describeExecutionMode(runWith({ column_semantics: 'positional' })))
  })

  it('is null for a run that records no config', () => {
    expect(describeExecutionMode(runWith(null))).toBeNull()
  })
})
