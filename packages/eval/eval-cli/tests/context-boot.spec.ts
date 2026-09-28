/// <reference types="node" />
/**
 * Exercises eval-cli's real Cordis boot sequence in process. DashScope points
 * at a loopback snapshot server; optional query runs use the in-repo stand-in
 * sidecar and every acquired context is disposed to quiescence.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boot, resolveQueryWaitSeconds, type BootResult } from '../src/context.ts'

const ROOT = realpathSync(join(__dirname, '..', '..', '..', '..'))
const SCHEMA = join(ROOT, 'examples/k11-semantic-layer')
const STANDIN_SIDECAR = join(ROOT, 'packages/query/query-maxcompute/dev/standin-sidecar.mjs')
const JUDGE_JSON = JSON.stringify({
  table_selection: 1,
  field_selection: 1,
  filter_conditions: 1,
  aggregation_logic: 1,
  overall_semantics: 1,
  rationale: 'fixture verdict',
})

let server: Server
let dashscopeUrl: string
let responseKind: 'text' | 'reasoning' | 'empty' = 'text'
const requestBodies: string[] = []
const contexts: BootResult['ctx'][] = []
const tempRoots: string[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => { body += chunk })
    req.on('end', () => {
      requestBodies.push(body)
      const message = responseKind === 'text'
        ? { role: 'assistant', content: JUDGE_JSON }
        : responseKind === 'reasoning'
          ? { role: 'assistant', reasoning_content: JUDGE_JSON, content: '' }
          : { role: 'assistant', content: '' }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        output: { choices: [{ finish_reason: 'stop', message }] },
        usage: { input_tokens: 1, output_tokens: 1 },
        request_id: 'req-context-boot',
      }))
    })
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  dashscopeUrl = typeof address === 'object' && address !== null
    ? `http://127.0.0.1:${address.port}`
    : ''
})

afterEach(async () => {
  const disposals = await Promise.allSettled(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  vi.unstubAllEnvs()
  responseKind = 'text'
  requestBodies.splice(0)
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
  const failure = disposals.find(result => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => { if (error) reject(error); else resolve() })
  })
})

function useOfflineDashScope(): void {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-eval-boot-')))
  tempRoots.push(home)
  writeFileSync(
    join(home, '.credentials.yaml'),
    'version: 1\nrefs:\n  DASHSCOPE_API_KEY: fake-for-test\n',
    { mode: 0o600 },
  )
  vi.stubEnv('DSH_HOME', home)
  vi.stubEnv('DASHSCOPE_BASE_URL', dashscopeUrl)
}

async function bootTracked(overrides: Partial<Parameters<typeof boot>[0]> = {}): Promise<BootResult> {
  useOfflineDashScope()
  const result = await boot({
    schemaDir: SCHEMA,
    provider: 'aga',
    model: 'qwen3.7-max',
    today: '20260101',
    withQuery: false,
    noSqlJudge: false,
    queryExpansion: false,
    scopeId: 'k11',
    ...overrides,
  })
  contexts.push(result.ctx)
  return result
}

const JUDGE_INPUT = {
  question: '昨天的总付费金额是多少',
  generated_sql: 'SELECT 1',
  schema_context: 'table fixture',
}

describe('boot — offline collaborators', () => {
  it('mounts the engine collaborators and reads a text SQL-judge response', async () => {
    vi.stubEnv('EXP2_ARM', undefined)
    const { collaborators } = await bootTracked()

    expect(collaborators.executor).toBeNull()
    expect(collaborators.sqlJudge).not.toBeNull()
    await expect(collaborators.sqlJudge!.judgeSql(JUDGE_INPUT)).resolves.toMatchObject({
      score: 1,
      rationale: 'fixture verdict',
    })
    expect(requestBodies.at(-1)).toContain('SQL 语义正确性评审 Judge')
  })

  it('selects the English judge prompt and falls back to reasoning content', async () => {
    vi.stubEnv('EXP2_ARM', 'E')
    responseKind = 'reasoning'
    const { collaborators } = await bootTracked()

    expect(collaborators.sqlJudge).not.toBeNull()
    await expect(collaborators.sqlJudge!.judgeSql(JUDGE_INPUT)).resolves.toMatchObject({
      score: 1,
      rationale: 'fixture verdict',
    })
    expect(requestBodies.at(-1)).toContain('SQL semantic correctness judge')
  })

  it('returns the judge parse failure when both text and reasoning are empty', async () => {
    responseKind = 'empty'
    const { collaborators } = await bootTracked()

    expect(collaborators.sqlJudge).not.toBeNull()
    await expect(collaborators.sqlJudge!.judgeSql(JUDGE_INPUT)).resolves.toMatchObject({
      score: 0,
      rationale: 'Failed to parse judge response: ',
    })
  })

  it('omits both the query executor and SQL judge when disabled', async () => {
    vi.stubEnv('EXP2_ARM', undefined)
    const { collaborators } = await bootTracked({ noSqlJudge: true })

    expect(collaborators.executor).toBeNull()
    expect(collaborators.sqlJudge).toBeNull()
  })
})

describe('boot — optional query engine', () => {
  it('uses the default sidecar, config path, and wait window', async () => {
    vi.stubEnv('MAXC_CONFIG', undefined)
    vi.stubEnv('MAXC_WAIT_SECONDS', undefined)
    const result = await bootTracked({ withQuery: true, noSqlJudge: true })

    expect(result.collaborators.executor).not.toBeNull()
    expect(result.executorIdentity).toBe(STANDIN_SIDECAR)
    expect(result.queryWaitSeconds).toBe(60)
    await expect(result.collaborators.executor!.execute('SELECT 1')).resolves.toMatchObject({
      state: 'completed',
      rowCount: 1,
    })
  }, 60_000)

  it('uses explicit query settings and records the configured wait', async () => {
    vi.stubEnv('MAXC_CONFIG', join(tmpdir(), 'eval-maxc-config.yaml'))
    vi.stubEnv('MAXC_WAIT_SECONDS', '12')
    const result = await bootTracked({
      withQuery: true,
      sidecarPath: STANDIN_SIDECAR,
      noSqlJudge: true,
    })

    expect(result.collaborators.executor).not.toBeNull()
    expect(result.executorIdentity).toBe(STANDIN_SIDECAR)
    expect(result.queryWaitSeconds).toBe(12)
  }, 60_000)

  it('rejects a non-positive or non-integer query wait', () => {
    expect(() => resolveQueryWaitSeconds('not-a-number')).toThrow(
      'eval-cli: MAXC_WAIT_SECONDS must be a positive integer',
    )
  })
})
