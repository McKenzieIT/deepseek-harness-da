/**
 * Spec for GA-EVAL-REBASELINE item 4: `RunResult.config` records a run's
 * protocol/semantics/concurrency/model IN THE RESULT JSON ARTIFACT so a
 * contaminated/mis-attributed run is detectable from its artifact alone.
 *
 * The gap this closes: a 63-case AGA-contaminated eval run went undetected
 * from its JSON because the JSON had no model/concurrency/verdict-semantics —
 * only run_id/timestamp/cases/summary. Recording the full run config in the
 * artifact makes mis-attribution self-evident without a human-maintained audit
 * log.
 */
import { describe, expect, it } from 'vitest'
import { runBatch } from '../src/runner.ts'
import { writeRunResult, readRunResult } from '../src/persistence.ts'
import { buildCollaborators } from '../src/collaborators.ts'
import { StubAgentResponder, StubQueryExecutor, StubJudgeExecutor } from '../src/stubs.ts'
import type { RunConfig, RunResult } from '../src/types.ts'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'

const fixtureDir = import.meta.dirname
const caseA = `${fixtureDir}/fixtures/case-a.yaml`

function makeStubs() {
  const agent = new StubAgentResponder()
  const executor = new StubQueryExecutor()
  const judge = new StubJudgeExecutor()
  return { agent, executor, judge }
}

/** A representative run config (mirrors what eval-cli main.ts builds). */
const SAMPLE_CONFIG: RunConfig = {
  provider: 'aga',
  model: 'qwen3.7-max',
  pass_k: 3,
  concurrency: 4,
  sql_judge: true,
  verdict_semantics: 'pass^k',
  responder: 'engine',
  scope_id: 'k11',
  today: '20260903',
  query_expansion: true,
  with_query: true,
  skip_health_gate: false,
}

describe('RunResult.config (GA-EVAL-REBASELINE item 4)', () => {
  it('records the supplied config on the run result', async () => {
    const { agent, executor, judge } = makeStubs()
    agent.setDefaultReply({ reply: '1000', generated_sql: 'SELECT 1000 AS total' })
    executor.setResult('SELECT 1000 AS total', { success: true, rows: [{ total: 1000 }], row_count: 1, error: null })
    judge.setScore(1.0)
    const collaborators = buildCollaborators(agent, executor, judge)

    const result = await runBatch([caseA], collaborators, {
      pass_k: SAMPLE_CONFIG.pass_k,
      concurrency: SAMPLE_CONFIG.concurrency,
      skip_health_gate: SAMPLE_CONFIG.skip_health_gate,
      config: SAMPLE_CONFIG,
    })

    // The result MUST carry the config verbatim — this is what makes a
    // contaminated run self-identifying from its JSON artifact.
    expect(result.config).toBeDefined()
    expect(result.config).toEqual(SAMPLE_CONFIG)
  })

  it('the config records every protocol+semantics field needed to detect mis-attribution', async () => {
    const { agent, executor, judge } = makeStubs()
    agent.setDefaultReply({ reply: '1000', generated_sql: 'SELECT 1000 AS total' })
    executor.setResult('SELECT 1000 AS total', { success: true, rows: [{ total: 1000 }], row_count: 1, error: null })
    judge.setScore(1.0)
    const collaborators = buildCollaborators(agent, executor, judge)

    const result = await runBatch([caseA], collaborators, {
      pass_k: 1,
      skip_health_gate: true,
      config: SAMPLE_CONFIG,
    })

    // Each field is load-bearing for contamination detection:
    //  - provider/model: which gateway was actually hit (the AGA-contamination
    //    gap was that the JSON couldn't reveal a wrong gateway was used)
    //  - verdict_semantics: pass^k vs best-of-k changes what "correct" means
    //  - sql_judge/responder/scope_id/today: protocol inputs that change outcomes
    //  - pass_k/concurrency: runtime semantics
    //  - query_expansion/with_query/skip_health_gate: feature flags that affect results
    const cfg = result.config!
    expect(cfg.provider).toBe('aga')
    expect(cfg.model).toBe('qwen3.7-max')
    expect(cfg.pass_k).toBe(3)
    expect(cfg.concurrency).toBe(4)
    expect(cfg.sql_judge).toBe(true)
    expect(cfg.verdict_semantics).toBe('pass^k')
    expect(cfg.responder).toBe('engine')
    expect(cfg.scope_id).toBe('k11')
    expect(cfg.today).toBe('20260903')
    expect(cfg.query_expansion).toBe(true)
    expect(cfg.with_query).toBe(true)
    expect(cfg.skip_health_gate).toBe(false)
  })

  it('writeRunResult persists config to the JSON artifact (detectable post-hoc)', async () => {
    const { agent, executor, judge } = makeStubs()
    agent.setDefaultReply({ reply: '1000', generated_sql: 'SELECT 1000 AS total' })
    executor.setResult('SELECT 1000 AS total', { success: true, rows: [{ total: 1000 }], row_count: 1, error: null })
    judge.setScore(1.0)
    const collaborators = buildCollaborators(agent, executor, judge)

    const result = await runBatch([caseA], collaborators, {
      pass_k: 1,
      skip_health_gate: true,
      config: SAMPLE_CONFIG,
    })

    const tempDir = mkdtempSync(join(tmpdir(), 'eval-runner-config-test-'))
    const outputPath = join(tempDir, 'run-with-config.json')
    writeRunResult(result, outputPath)

    // Read back the raw JSON text to prove config survives serialization
    // (not just the in-memory object) — this is the artifact-contamination
    // detection guarantee.
    const { readFileSync } = await import('node:fs')
    const rawJson = readFileSync(outputPath, 'utf8')
    const parsed = JSON.parse(rawJson) as RunResult

    expect(parsed.config).toBeDefined()
    expect(parsed.config).toEqual(SAMPLE_CONFIG)

    // readRunResult must also surface it (same code path as delta/evidence readers)
    const loaded = readRunResult(outputPath)
    expect(loaded.config).toEqual(SAMPLE_CONFIG)
  })

  it('omits config gracefully when none is supplied (additive — does not break legacy callers)', async () => {
    const { agent, executor, judge } = makeStubs()
    agent.setDefaultReply({ reply: '1000', generated_sql: 'SELECT 1000 AS total' })
    executor.setResult('SELECT 1000 AS total', { success: true, rows: [{ total: 1000 }], row_count: 1, error: null })
    judge.setScore(1.0)
    const collaborators = buildCollaborators(agent, executor, judge)

    // No config option supplied — legacy call shape
    const result = await runBatch([caseA], collaborators, {
      pass_k: 1,
      skip_health_gate: true,
    })

    // config is optional; absence is not a crash, just a non-self-describing artifact
    expect(result.config).toBeUndefined()
    // Existing fields are untouched (additive change, no regressions)
    expect(result.run_id).toBeDefined()
    expect(result.timestamp).toBeDefined()
    expect(result.cases).toHaveLength(1)
    expect(result.summary.total).toBe(1)
  })
})
