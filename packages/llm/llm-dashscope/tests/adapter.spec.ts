import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, {
  createUserMessage,
  ProviderRequestId,
  userAgent,
} from '@deepseek-ai/dsh-llm'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { getOrCreateAnonymousUserId, type AnonymousUserId } from '@deepseek-ai/dsh-anonymous-user-id'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as LlmDashScope from '@deepseek-ai/dsh-llm-dashscope'
import { DashScopeAdapter, resolveAdapterOptions } from '@deepseek-ai/dsh-llm-dashscope'
import { httpErrorCode } from '../src/adapter.ts'
import { assemble } from './assemble.ts'
import { closeMockServers, mockServer, textEvents } from './mock-server.ts'
import type { Behavior } from './mock-server.ts'

const TEST_USER_ID = '00000000-0000-4000-8000-000000000001' as AnonymousUserId
let testHome: string

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), 'dsh-llm-dashscope-'))
  vi.stubEnv('DSH_HOME', testHome)
})

afterEach(async () => {
  await closeMockServers()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  rmSync(testHome, { recursive: true, force: true })
})

async function harness(baseURL: string, config: object = {}) {
  vi.stubEnv('DASHSCOPE_API_KEY', 'test-key')
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(LlmDashScope, { baseURL, ...config })
  return ctx
}

function adapterOf(config: Partial<LlmDashScope.Config> & { apiKey?: string } = {}): DashScopeAdapter {
  const { apiKey, ...rest } = config
  return new DashScopeAdapter({
    options: () => resolveAdapterOptions(rest),
    resolveApiKey: () => Promise.resolve(apiKey ?? 'k'),
    resolveUserId: () => TEST_USER_ID,
  })
}

describe('DashScopeAdapter against a mock server', () => {
  it('streams a text generation end to end through the assembler', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const ctx = await harness(server.url)

    const result = await assemble(ctx, {
      model: 'qwen-flash',
      maxTokens: 50,
      messages: [createUserMessage({
        content: [{ type: 'text', text: 'hi' }],
        source: { kind: 'plugin', plugin: 'test' },
      })],
    })
    expect(result.message.content).toEqual([{ type: 'text', text: 'hello' }])
    expect(result.finish).toEqual({ kind: 'stop' })
    // The real wire carries prompt_tokens_details.cached_tokens:0 even at 0 → cacheReadTokens:0.
    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 1, cacheReadTokens: 0 })

    // Native wire body: input.messages + parameters.result_format/incremental_output; no thinking/stream.
    expect(server.requests[0]).toMatchObject({
      model: 'qwen-flash',
      input: { messages: [{ role: 'user', content: 'hi' }] },
      parameters: { result_format: 'message', incremental_output: true, max_tokens: 50 },
    })
    expect(server.requests[0]).not.toHaveProperty('thinking')
    expect(server.requests[0]).not.toHaveProperty('stream')
    expect(server.requests[0]).not.toHaveProperty('stream_options')
    expect(server.requests[0]).not.toHaveProperty('enable_thinking')
    // App attribution + DashScope identity + native SSE trigger are independent wire facts.
    expect(server.headers[0]?.['user-agent']).toBe(userAgent())
    expect(server.headers[0]?.['x-dashscope-sse']).toBe('enable')
    expect(server.headers[0]?.['x-dashscope-harness-user-id']).toBe(getOrCreateAnonymousUserId())
    expect(server.headers[0]).not.toHaveProperty('x-dashscope-harness-session-id')
    expect(server.headers[0]).not.toHaveProperty('x-dashscope-harness-compact')
  })

  it('streams raw chunks through ctx.llm.stream', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents, delayMs: 2 }])
    const ctx = await harness(server.url)
    const kinds: string[] = []
    for await (const chunk of ctx.llm.stream({
      provider: 'dashscope',
      model: 'qwen-flash',
      messages: [createUserMessage({
        content: [{ type: 'text', text: 'hi' }],
        source: { kind: 'plugin', plugin: 'test' },
      })],
    })) {
      kinds.push(chunk.type)
    }
    expect(kinds).toEqual(['block-start', 'text-delta', 'block-end', 'usage', 'finish'])
  })

  it('forwards the harness session id for trajectory routing', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const ctx = await harness(server.url)
    await assemble(ctx, {
      model: 'qwen-flash',
      messages: [createUserMessage({
        content: [{ type: 'text', text: 'hi' }],
        source: { kind: 'plugin', plugin: 'test' },
      })],
      sessionId: SessionId('child-session'),
    })
    expect(server.headers[0]?.['x-dashscope-harness-session-id']).toBe('child-session')
  })

  it('marks the auxiliary compaction call on the wire', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const ctx = await harness(server.url)
    await assemble(ctx, {
      model: 'qwen-flash',
      messages: [createUserMessage({
        content: [{ type: 'text', text: 'hi' }],
        source: { kind: 'plugin', plugin: 'test' },
      })],
      purpose: 'compaction',
    })
    expect(server.headers[0]?.['x-dashscope-harness-compact']).toBe('1')
  })

  it('puts tools in parameters.tools, not at top level', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const ctx = await harness(server.url)
    await assemble(ctx, {
      model: 'qwen-plus',
      messages: [createUserMessage({
        content: [{ type: 'text', text: 'hi' }],
        source: { kind: 'plugin', plugin: 'test' },
      })],
      tools: [{ name: 'get_weather', description: 'Get weather', parameters: { type: 'object', properties: {} } }],
    })
    expect((server.requests[0] as { parameters: { tools?: unknown } }).parameters.tools).toEqual([
      { type: 'function', function: { name: 'get_weather', description: 'Get weather', parameters: { type: 'object', properties: {} } } },
    ])
    expect(server.requests[0]).not.toHaveProperty('tools')
  })

  it.each([
    [401, 'AUTH'],
    [403, 'AUTH'],
    [404, 'MODEL_NOT_AVAILABLE'],
    [429, 'RATE_LIMIT'],
    [400, 'INVALID_REQUEST'],
    [500, 'SERVER'],
    [503, 'SERVER'],
  ])('maps HTTP %d to failure code %s', async (status, code) => {
    const behavior: Behavior = {
      kind: 'http-error',
      status,
      body: JSON.stringify({ code: 'c', message: `failed with ${status}`, request_id: `req-${status}` }),
    }
    const server = await mockServer([behavior])
    const ctx = await harness(server.url)
    const result = await assemble(ctx, { model: 'qwen-flash', messages: [] })
    // toMatchObject: the body also carries request_id → failure.requestId (verified separately);
    // this test pins only the code/message/status mapping.
    expect(result.finish).toMatchObject({
      kind: 'error',
      failure: { message: `failed with ${status}`, code, status },
    })
  })

  it('extracts request_id from the error BODY (not headers)', async () => {
    const server = await mockServer([{
      kind: 'http-error',
      status: 429,
      body: JSON.stringify({ code: 'Throttling', message: 'slow down', request_id: 'body-req-429' }),
    }])
    const ctx = await harness(server.url)
    const result = await assemble(ctx, { model: 'qwen-flash', messages: [] })
    expect(result.finish).toMatchObject({
      kind: 'error',
      failure: { code: 'RATE_LIMIT', status: 429, requestId: ProviderRequestId('body-req-429') },
    })
  })

  it('reports a transport failure with the endpoint in the message', async () => {
    const ctx = await harness('http://127.0.0.1:1')
    const result = await assemble(ctx, { model: 'qwen-flash', messages: [] })
    expect(result.finish).toMatchObject({
      kind: 'error',
      failure: { code: 'TRANSPORT', message: 'DashScope API request to http://127.0.0.1:1 failed' },
    })
  })

  it('classifies an aborted request as an aborted finish', async () => {
    const controller = new AbortController()
    controller.abort()
    const ctx = await harness('http://127.0.0.1:1')
    const result = await assemble(ctx, {
      model: 'qwen-flash',
      messages: [],
      signal: controller.signal,
    })
    expect(result.finish).toMatchObject({ kind: 'aborted', failure: { code: 'ABORTED' } })
  })

  it('classifies an abrupt body close as TRANSPORT', async () => {
    const server = await mockServer([{
      kind: 'close-early',
      events: ['{"output":{"choices":[{"finish_reason":"null","message":{"content":"par"}}]},"usage":{"input_tokens":1,"output_tokens":1}}'],
    }])
    const ctx = await harness(server.url)
    const result = await assemble(ctx, { model: 'qwen-flash', messages: [] })
    expect(result.finish.kind).toBe('error')
    if (result.finish.kind !== 'error') throw new Error('expected an error finish')
    expect(result.finish.failure.code).toBe('TRANSPORT')
  })

  it('maps a direct-adapter connection failure to TRANSPORT without losing the cause', async () => {
    const cause = new TypeError('connection refused')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(cause)
    const adapter = adapterOf({ baseURL: 'https://example.invalid' })
    try {
      const drain = async (): Promise<void> => {
        for await (const _chunk of adapter.stream({ provider: 'dashscope', model: 'qwen-flash', messages: [] })) { /* drain */ }
      }
      await expect(drain()).rejects.toMatchObject({ code: 'TRANSPORT', cause })
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('classifies a clean stream close without a terminal finish_reason as STREAM_CLOSED', async () => {
    // The mock cleanly closes (response.end()) after a non-terminal ("null") event; translate
    // raises STREAM_CLOSED (an LlmError), which the adapter re-throws unchanged (not TRANSPORT).
    const server = await mockServer([{ kind: 'sse', events: [
      '{"output":{"choices":[{"finish_reason":"null","message":{"role":"assistant","content":"par"}}]},"usage":{"input_tokens":1,"output_tokens":1}}',
    ] }])
    const ctx = await harness(server.url)
    const result = await assemble(ctx, { model: 'qwen-flash', messages: [] })
    expect(result.finish).toMatchObject({ kind: 'error', failure: { code: 'STREAM_CLOSED' } })
  })
})

describe('plugin registration and config', () => {
  it('keeps wire helpers off the package root', () => {
    for (const helper of ['httpErrorCode', 'serializeMessages', 'serializeRequest', 'parseSse', 'mapFinishReason', 'mapUsage', 'translate']) {
      expect(LlmDashScope).not.toHaveProperty(helper)
    }
  })

  it('registers the dashscope provider with the AGA default baseURL and catalog', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmDashScope, {})
    expect(ctx.llm.listProviders()).toEqual([{ id: 'dashscope', name: 'DashScope' }])
    expect(ctx.llm.listConfigurableProviders()).toEqual([{
      provider: 'dashscope',
      displayName: 'DashScope',
      settingsNs: 'llm-dashscope',
      settingsPath: [],
    }])
    await expect(ctx.llm.listModels('dashscope')).resolves.toEqual([
      { provider: 'dashscope', id: 'qwen-flash', name: 'Qwen-Flash', inputModalities: ['text'] },
      { provider: 'dashscope', id: 'qwen-plus', name: 'Qwen-Plus', inputModalities: ['text'] },
      { provider: 'dashscope', id: 'qwen3.7-max', name: 'Qwen3.7-Max', inputModalities: ['text'] },
      { provider: 'dashscope', id: 'qwen3.6-plus', name: 'Qwen3.6-Plus', inputModalities: ['text'] },
    ])
    await expect(ctx.llm.resolveModelInfo('dashscope', 'qwen-flash'))
      .resolves.toMatchObject({
        context: { contextWindow: 131_072 },
        defaultMaxTokens: 8_192,
      })
  })

  it('exposes no reasoning efforts (thinking is model-bound; UNSUPPORTED_REASONING_EFFORT if requested)', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmDashScope, { baseURL: 'http://127.0.0.1:1' })
    const info = await ctx.llm.resolveModelInfo('dashscope', 'qwen-flash')
    expect(info.reasoning).toBeUndefined()
  })

  it('falls back to DASHSCOPE_API_KEY and DASHSCOPE_BASE_URL env vars', async () => {
    vi.stubEnv('DASHSCOPE_API_KEY', 'env-key')
    vi.stubEnv('DASHSCOPE_BASE_URL', 'http://127.0.0.1:1')
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmDashScope, {})
    expect(ctx.llm.listProviders()).toEqual([{ id: 'dashscope', name: 'DashScope' }])
  })

  it('defaults to the AGA public base URL without config or env', async () => {
    vi.stubEnv('DASHSCOPE_API_KEY', 'k')
    vi.stubEnv('DASHSCOPE_BASE_URL', undefined)
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmDashScope, {})
    expect(ctx.llm.listProviders()).toEqual([{ id: 'dashscope', name: 'DashScope' }])
    expect(resolveAdapterOptions({}).baseURL)
      .toBe('https://pre-aga-ai-gateway.alibaba-inc.com/api/v1/services/aigc/text-generation/generation')
  })

  it('reads the ambient variable when no credentials seam is mounted', async () => {
    vi.stubEnv('DASHSCOPE_API_KEY', 'ambient-key')
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmDashScope, { baseURL: server.url })
    await assemble(ctx, { model: 'qwen-flash', messages: [] })
    expect(server.headers[0]?.authorization).toBe('Bearer ambient-key')
  })

  it('fails the request actionably with MISSING_CREDENTIAL when no key is anywhere', async () => {
    vi.stubEnv('DASHSCOPE_API_KEY', '')
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmDashScope, { baseURL: 'http://127.0.0.1:1' })
    const result = await assemble(ctx, { model: 'qwen-flash', messages: [] })
    expect(result.finish).toMatchObject({ kind: 'error', failure: { code: 'MISSING_CREDENTIAL' } })
  })

  it('rejects invalid idle watchdog bounds', () => {
    expect(() => resolveAdapterOptions({ streamIdleTimeoutMs: Number.POSITIVE_INFINITY }))
      .toThrow(/streamIdleTimeoutMs.*positive finite/)
    expect(() => resolveAdapterOptions({ streamIdleTimeoutMs: MAX_TIMER_DELAY_MS + 1 }))
      .toThrow(/streamIdleTimeoutMs.*no greater/)
  })

  it('maps unusual statuses to HTTP_<status>', () => {
    expect(httpErrorCode(418)).toBe('HTTP_418')
  })
})
