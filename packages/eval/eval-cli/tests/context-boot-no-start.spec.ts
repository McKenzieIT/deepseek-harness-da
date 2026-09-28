/// <reference types="node" />
/** Covers boot()'s compatibility path for a query provider without start(). */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { InstanceId, QueryOutcome, QueryRequest } from '@deepseek-ai/dsh-query'
import { boot, type BootResult } from '../src/context.ts'

const queryMock = vi.hoisted(() => ({ configs: [] as unknown[] }))

vi.mock('@deepseek-ai/dsh-query-maxcompute', async () => {
  const { QueryEngine } = await vi.importActual<typeof import('@deepseek-ai/dsh-query')>(
    '@deepseek-ai/dsh-query',
  )

  class QueryEngineWithoutStart extends QueryEngine {
    constructor(ctx: Context, config: unknown) {
      super(ctx)
      queryMock.configs.push(config)
    }

    execute(request: QueryRequest): Promise<QueryOutcome> {
      return Promise.resolve({ state: 'failed', sql: request.sql, error: 'unused fixture' })
    }

    attach(_instanceId: InstanceId): Promise<QueryOutcome> {
      return Promise.resolve({ state: 'failed', sql: '', error: 'unused fixture' })
    }

    cancel(_instanceId: InstanceId): Promise<void> {
      return Promise.resolve()
    }

    getProgress(_instanceId: InstanceId): Promise<QueryOutcome> {
      return Promise.resolve({ state: 'failed', sql: '', error: 'unused fixture' })
    }
  }

  return { MaxComputeQueryEngine: QueryEngineWithoutStart }
})

const ROOT = realpathSync(join(__dirname, '..', '..', '..', '..'))
const SCHEMA = join(ROOT, 'examples/k11-semantic-layer')
let context: BootResult['ctx'] | undefined
let home: string | undefined

afterEach(async () => {
  try {
    if (context !== undefined) await context.fiber.dispose()
  } finally {
    context = undefined
    vi.unstubAllEnvs()
    queryMock.configs.splice(0)
    if (home !== undefined) rmSync(home, { recursive: true, force: true })
    home = undefined
  }
})

describe('boot — query provider compatibility', () => {
  it('keeps the executor when the mounted query provider has no start method', async () => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-eval-no-start-')))
    writeFileSync(
      join(home, '.credentials.yaml'),
      'version: 1\nrefs:\n  DASHSCOPE_API_KEY: fake-for-test\n',
      { mode: 0o600 },
    )
    vi.stubEnv('DSH_HOME', home)
    vi.stubEnv('MAXC_CONFIG', '/fixture/maxc.yaml')
    vi.stubEnv('MAXC_WAIT_SECONDS', '12')

    const result = await boot({
      schemaDir: SCHEMA,
      provider: 'aga',
      model: 'qwen3.7-max',
      today: '20260101',
      withQuery: true,
      sidecarPath: '/fixture/sidecar.mjs',
      noSqlJudge: true,
      queryExpansion: false,
      scopeId: 'k11',
    })
    context = result.ctx

    expect(result.collaborators.executor).not.toBeNull()
    expect(queryMock.configs).toEqual([{
      sidecarPath: '/fixture/sidecar.mjs',
      credMode: 'sidecar-self',
      maxcConfigPath: '/fixture/maxc.yaml',
      toolCallTimeoutMs: 72_000,
    }])
  })
})
