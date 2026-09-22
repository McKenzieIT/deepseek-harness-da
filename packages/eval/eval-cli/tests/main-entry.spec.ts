/// <reference types="node" />
/**
 * Exercises the argv-driven main() in process against the real responder,
 * runBatch, persistence, and report pipeline. DashScope points at a loopback
 * server that either returns a passive completion or drives a real query_data
 * tool call before answering the SQL semantic judge.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main } from '../src/main.ts'

const ROOT = realpathSync(join(__dirname, '..', '..', '..', '..'))
const CASES = join(ROOT, 'packages/eval/eval/cases/k11-v2')
const SCHEMA = join(ROOT, 'examples/k11-semantic-layer')
const JUDGE_JSON = JSON.stringify({
  table_selection: 1,
  field_selection: 1,
  filter_conditions: 1,
  aggregation_logic: 1,
  overall_semantics: 1,
  rationale: 'fixture verdict',
})

type RouteMode = 'passive' | 'judge-text' | 'judge-reasoning' | 'judge-empty'
interface WireMessage { readonly role?: string; readonly content?: unknown }
interface WireRequest {
  readonly input?: { readonly messages?: readonly WireMessage[] }
  readonly parameters?: { readonly tools?: readonly unknown[] }
}
interface StoredRun {
  readonly cases: Array<{
    readonly pass_k_results: Array<{
      readonly generated_sql?: string | null
      readonly sql_judge?: { readonly score: number }
    }>
  }>
}

let server: Server
let dashscopeUrl: string
let routeMode: RouteMode = 'passive'
const cleanups: Array<() => void> = []

function snapshot(message: Record<string, unknown>, finishReason = 'stop'): string {
  return JSON.stringify({
    output: { choices: [{ finish_reason: finishReason, message }] },
    usage: { input_tokens: 1, output_tokens: 1 },
    request_id: 'req-main-entry',
  })
}

function includesJudgePrompt(messages: readonly WireMessage[]): boolean {
  return messages.some(({ content }) => typeof content === 'string'
    && (content.includes('SQL 语义正确性评审 Judge') || content.includes('SQL semantic correctness judge')))
}

function routedSnapshot(request: WireRequest): string {
  if (routeMode === 'passive') {
    return snapshot({ role: 'assistant', content: '0.8' })
  }

  const messages = request.input?.messages ?? []
  if (includesJudgePrompt(messages)) {
    if (routeMode === 'judge-text') return snapshot({ role: 'assistant', content: JUDGE_JSON })
    if (routeMode === 'judge-reasoning') {
      return snapshot({ role: 'assistant', reasoning_content: JUDGE_JSON, content: '' })
    }
    return snapshot({ role: 'assistant', content: '' })
  }

  const hasTools = (request.parameters?.tools?.length ?? 0) > 0
  const hasToolResult = messages.some(message => message.role === 'tool')
  if (hasTools && !hasToolResult) {
    return snapshot({
      role: 'assistant',
      content: 'Running the query.',
      tool_calls: [{
        index: 0,
        id: 'call-query-data-main-entry',
        type: 'function',
        function: {
          name: 'query_data',
          arguments: JSON.stringify({ sql: 'SELECT 1', scope_id: 'k11' }),
        },
      }],
    }, 'tool_calls')
  }

  return snapshot({ role: 'assistant', content: 'The query attempt completed.' })
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => { body += chunk })
    req.on('end', () => {
      const request = JSON.parse(body) as WireRequest
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(routedSnapshot(request))
    })
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  dashscopeUrl = typeof address === 'object' && address !== null
    ? `http://127.0.0.1:${address.port}`
    : ''
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => { if (error) reject(error); else resolve() })
  })
})

class ExitSignal extends Error {
  constructor(readonly code: number) { super(`process.exit(${code})`) }
}

interface MainResult { readonly out: string[]; readonly err: string[]; readonly exit: number | null }

afterEach(() => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  } finally {
    routeMode = 'passive'
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  }
})

function dshHome(withKey = true): string {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-eval-main-')))
  cleanups.push(() => { rmSync(home, { recursive: true, force: true }) })
  if (withKey) {
    writeFileSync(
      join(home, '.credentials.yaml'),
      'version: 1\nrefs:\n  DASHSCOPE_API_KEY: fake-for-test\n',
      { mode: 0o600 },
    )
  }
  return home
}

function outDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-eval-output-')))
  cleanups.push(() => { rmSync(dir, { recursive: true, force: true }) })
  return dir
}

function setEnv(env: Readonly<Record<string, string>>): void {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
}

async function runMain(argv: string[], home: string): Promise<MainResult> {
  setEnv({
    DSH_HOME: home,
    DASHSCOPE_BASE_URL: dashscopeUrl,
    EVAL_LLM_PROVIDER: 'aga',
    EVAL_LLM_MODEL: 'qwen3.7-max',
  })
  const out: string[] = []
  const err: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { out.push(args.map(String).join(' ')) })
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { err.push(args.map(String).join(' ')) })
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
    throw new ExitSignal(typeof code === 'number' ? code : 0)
  })
  const savedArgv = process.argv
  process.argv = ['node', 'dsh-eval', ...argv]
  let exit: number | null = null
  try {
    await main()
  } catch (error) {
    if (error instanceof ExitSignal) exit = error.code
    else throw error
  } finally {
    process.argv = savedArgv
  }
  return { out, err, exit }
}

function readStoredRun(output: string): StoredRun {
  const files = readdirSync(output).filter(file => file.endsWith('.json'))
  expect(files).toHaveLength(1)
  return JSON.parse(readFileSync(join(output, files[0]!), 'utf8')) as StoredRun
}

const BASE_ARGS = [
  '--cases', CASES,
  '--schema', SCHEMA,
  '--pass-k', '1',
  '--case', 'k11v2_001',
  '--skip-health-gate',
]

describe('main — engine responder', () => {
  it('runs a case, persists an explicit run-id, and prints the report', async () => {
    const output = outDir()
    const { out, exit } = await runMain([
      ...BASE_ARGS,
      '--output', output,
      '--run-id', 'run-main-entry-1',
      '--sidecar', join(tmpdir(), 'nonexistent-sidecar.mjs'),
    ], dshHome())

    expect(exit).toBeNull()
    const text = out.join('\n')
    expect(text).toContain('Loading 1 case(s)')
    expect(text).toContain('k11v2_001')
    expect(text).toContain('SQL Semantic Judge: enabled')
    expect(text).toContain('Completed in')
    expect(text).toContain('Results written to:')
    expect(readdirSync(output).some(file => file.includes('run-main-entry-1'))).toBe(true)
  }, 60_000)

  it('runs without the SQL judge under --no-sql-judge', async () => {
    const { out, exit } = await runMain([
      ...BASE_ARGS,
      '--output', outDir(),
      '--case', 'k11v2_002',
      '--no-sql-judge',
    ], dshHome())

    expect(exit).toBeNull()
    expect(out.join('\n')).not.toContain('SQL Semantic Judge: enabled')
    expect(out.join('\n')).toContain('Completed in')
  }, 60_000)
})

describe('main — harness responder', () => {
  it('mounts variant A with the SQL judge and a sidecar path', async () => {
    const { out, exit } = await runMain([
      ...BASE_ARGS,
      '--output', outDir(),
      '--responder', 'harness',
      '--variant', 'A',
      '--sidecar', join(tmpdir(), 'nonexistent-sidecar.mjs'),
    ], dshHome())

    expect(exit).toBeNull()
    expect(out.join('\n')).toContain('Responder: harness (variant A)')
    expect(out.join('\n')).toContain('Completed in')
  }, 120_000)

  it('mounts variant B without a SQL judge', async () => {
    const output = outDir()
    const { out, exit } = await runMain([
      ...BASE_ARGS,
      '--output', output,
      '--case', 'k11v2_002',
      '--responder', 'harness',
      '--variant', 'B',
      '--no-sql-judge',
    ], dshHome())

    expect(exit).toBeNull()
    expect(out.join('\n')).toContain('Responder: harness (variant B)')
    expect(out.join('\n')).toContain('Completed in')
    expect(readStoredRun(output).cases[0]?.pass_k_results[0]).not.toHaveProperty('error')
  }, 120_000)

  it.each([
    ['judge-text', 1],
    ['judge-reasoning', 1],
    ['judge-empty', 0],
  ] as const)('records generated SQL and the %s verdict', async (mode, expectedScore) => {
    routeMode = mode
    const output = outDir()
    const { exit } = await runMain([
      ...BASE_ARGS,
      '--output', output,
      '--responder', 'harness',
      '--variant', 'D',
    ], dshHome())

    expect(exit).toBeNull()
    const attempt = readStoredRun(output).cases[0]?.pass_k_results[0]
    expect(attempt).toMatchObject({
      generated_sql: 'SELECT 1',
      sql_judge: { score: expectedScore },
    })
  }, 120_000)
})

describe('main — credential pre-flight', () => {
  it('exits 1 when DASHSCOPE_API_KEY is absent from the credential file', async () => {
    const { err, exit } = await runMain(BASE_ARGS, dshHome(false))

    expect(exit).toBe(1)
    expect(err.join('\n')).toContain('DASHSCOPE_API_KEY not found')
  }, 60_000)
})
