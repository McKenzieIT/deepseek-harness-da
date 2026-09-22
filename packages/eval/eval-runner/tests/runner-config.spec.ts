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
import { COMPARATOR_POLICY_VERSION } from '@deepseek-ai/dsh-eval'
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
  max_infra_retries: 2,
  concurrency: 4,
  sql_judge: false,
  verdict_semantics: 'pass^k',
  responder: 'engine',
  scope_id: 'k11',
  today: '20260903',
  query_expansion: true,
  with_query: true,
  executor_identity: 'packages/query/query-maxcompute/dev/maxc-sidecar.mjs',
  query_wait_seconds: 300,
  comparator_policy_version: COMPARATOR_POLICY_VERSION,
  column_semantics: 'by-name',
  max_stored_rows: 200,
  skip_health_gate: false,
}

describe('RunResult.config (GA-EVAL-REBASELINE item 4)', () => {
  it('records the supplied config on the run result', async () => {
    const { agent, executor, judge } = makeStubs()
    agent.setDefaultReply({ reply: '1000', generated_sql: 'SELECT 1000 AS total' })
    executor.setResult('SELECT 1000 AS total', { state: 'completed', columns: ['total'], rows: [[1000]], rowCount: 1 })
    judge.setScore(1.0)
    const collaborators = buildCollaborators(agent, executor, judge)

    const result = await runBatch([caseA], collaborators, {
      pass_k: SAMPLE_CONFIG.pass_k,
      max_infra_retries: 2,
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
    executor.setResult('SELECT 1000 AS total', { state: 'completed', columns: ['total'], rows: [[1000]], rowCount: 1 })
    judge.setScore(1.0)
    const collaborators = buildCollaborators(agent, executor, judge)

    const result = await runBatch([caseA], collaborators, {
      pass_k: SAMPLE_CONFIG.pass_k,
      concurrency: SAMPLE_CONFIG.concurrency,
      skip_health_gate: SAMPLE_CONFIG.skip_health_gate,
      config: SAMPLE_CONFIG,
    })

    // Each field is load-bearing for contamination detection:
    //  - provider/model: which gateway was actually hit (the AGA-contamination
    //    gap was that the JSON couldn't reveal a wrong gateway was used)
    //  - verdict_semantics: pass^k vs best-of-k changes what "correct" means
    //  - sql_judge/responder/scope_id/today: protocol inputs that change outcomes
    //  - pass_k/concurrency: runtime semantics
    //  - query_expansion/with_query/skip_health_gate: feature flags that affect results
    const cfg = result.config
    expect(cfg.provider).toBe('aga')
    expect(cfg.model).toBe('qwen3.7-max')
    expect(cfg.pass_k).toBe(3)
    expect(cfg.concurrency).toBe(4)
    expect(cfg.sql_judge).toBe(false)
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
    executor.setResult('SELECT 1000 AS total', { state: 'completed', columns: ['total'], rows: [[1000]], rowCount: 1 })
    judge.setScore(1.0)
    const collaborators = buildCollaborators(agent, executor, judge)

    const result = await runBatch([caseA], collaborators, {
      pass_k: SAMPLE_CONFIG.pass_k,
      concurrency: SAMPLE_CONFIG.concurrency,
      skip_health_gate: SAMPLE_CONFIG.skip_health_gate,
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

  it('rejects a new run when no self-describing config is supplied', async () => {
    const { agent, executor, judge } = makeStubs()
    agent.setDefaultReply({ reply: '1000', generated_sql: 'SELECT 1000 AS total' })
    executor.setResult('SELECT 1000 AS total', { state: 'completed', columns: ['total'], rows: [[1000]], rowCount: 1 })
    judge.setScore(1.0)
    const collaborators = buildCollaborators(agent, executor, judge)

    await expect(runBatch([caseA], collaborators, {
      pass_k: 1,
      skip_health_gate: true,
    } as never)).rejects.toThrow(/config.*required/i)
  })

  it('rejects a comparator policy version that differs from the resolved implementation', async () => {
    const { agent, executor, judge } = makeStubs()
    agent.setDefaultReply({ reply: '1000', generated_sql: 'SELECT 1000 AS total' })
    const collaborators = buildCollaborators(agent, executor, judge)

    await expect(runBatch([caseA], collaborators, {
      pass_k: SAMPLE_CONFIG.pass_k,
      concurrency: SAMPLE_CONFIG.concurrency,
      skip_health_gate: SAMPLE_CONFIG.skip_health_gate,
      config: { ...SAMPLE_CONFIG, comparator_policy_version: COMPARATOR_POLICY_VERSION + 1 },
    })).rejects.toThrow(/comparator_policy_version/i)
  })

  it('rejects runtime options that disagree with the persisted config', async () => {
    const { agent, executor, judge } = makeStubs()
    agent.setDefaultReply({ reply: '1000', generated_sql: 'SELECT 1000 AS total' })
    const collaborators = buildCollaborators(agent, executor, judge)

    await expect(runBatch([caseA], collaborators, {
      pass_k: 1,
      concurrency: SAMPLE_CONFIG.concurrency,
      skip_health_gate: SAMPLE_CONFIG.skip_health_gate,
      config: SAMPLE_CONFIG,
    })).rejects.toThrow(/pass_k/i)
  })

  it.each(['executor_identity', 'query_wait_seconds'] as const)(
    'rejects a real-execution run that omits %s',
    async (field) => {
      const { agent, executor, judge } = makeStubs()
      const collaborators = buildCollaborators(agent, executor, judge)

      await expect(runBatch([caseA], collaborators, {
        pass_k: SAMPLE_CONFIG.pass_k,
        concurrency: SAMPLE_CONFIG.concurrency,
        skip_health_gate: SAMPLE_CONFIG.skip_health_gate,
        config: { ...SAMPLE_CONFIG, [field]: undefined },
      })).rejects.toThrow(new RegExp(field))
    },
  )

  it('rejects a sql_judge flag that does not match the mounted collaborator', async () => {
    const { agent, executor, judge } = makeStubs()
    const collaborators = buildCollaborators(agent, executor, judge)

    await expect(runBatch([caseA], collaborators, {
      pass_k: SAMPLE_CONFIG.pass_k,
      concurrency: SAMPLE_CONFIG.concurrency,
      skip_health_gate: SAMPLE_CONFIG.skip_health_gate,
      config: { ...SAMPLE_CONFIG, sql_judge: true },
    })).rejects.toThrow(/sql_judge/i)
  })
})
