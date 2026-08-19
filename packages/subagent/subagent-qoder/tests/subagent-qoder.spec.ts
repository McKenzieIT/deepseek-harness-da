import type { Options, Query, SDKMessage, SDKResultMessage } from '@qoder-ai/qoder-agent-sdk'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { QODER_PERSONAL_ACCESS_TOKEN } from '../src/index.ts'
import * as subagentQoder from '../src/index.ts'
import {
  consumeQoderQuery,
  disposeQoderQuery,
  qoderQueryOptions,
  startQoderRun,
  successfulResult,
  textTask,
  type QoderRunSpec,
} from '../src/run.ts'

type QueryFactory = (params: { prompt: string; options: Options }) => Query

const queryMock = vi.hoisted(() => vi.fn<QueryFactory>())
const accessTokenMock = vi.hoisted(() => vi.fn<(token: string) => unknown>())

vi.mock('@qoder-ai/qoder-agent-sdk', () => ({
  query: queryMock,
  accessToken: accessTokenMock,
}))

const fakeParent = {
  id: 'parent',
  session: { header: { cwd: process.cwd() } },
} as unknown as Agent

function request(
  prompt: ContentBlock[] = [{ type: 'text', text: 'do the task' }],
  signal = new AbortController().signal,
) {
  return { prompt, parent: fakeParent, signal }
}

function success(result = 'answer', isError = false): SDKResultMessage {
  return {
    type: 'result',
    subtype: 'success',
    is_error: isError,
    result,
  } as unknown as SDKResultMessage
}

type ErrorSubtype = Exclude<SDKResultMessage['subtype'], 'success'>

function failure(
  subtype: ErrorSubtype,
  errors: string[] = ['fixture failure'],
): SDKResultMessage {
  return {
    type: 'result',
    subtype,
    is_error: true,
    errors,
  } as unknown as SDKResultMessage
}

function systemInit(): SDKMessage {
  return { type: 'system', subtype: 'init', protocol_version: '1.2.0' } as unknown as SDKMessage
}

function statusMessage(): SDKMessage {
  return { type: 'system', subtype: 'status', status: null } as unknown as SDKMessage
}

function assistantMessage(text: string): SDKMessage {
  return {
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
    parent_tool_use_id: null,
    uuid: 'msg',
    session_id: 'session',
  } as unknown as SDKMessage
}

function queryFrom(messages: readonly SDKMessage[], after?: Error, close = vi.fn()): Query {
  async function* stream(): AsyncGenerator<SDKMessage, void> {
    for (const message of messages) yield message
    if (after !== undefined) throw after
  }
  return Object.assign(stream(), { close }) as unknown as Query
}

function waitingQuery(signal: AbortSignal, close = vi.fn()): Query {
  async function* stream(): AsyncGenerator<SDKMessage, void> {
    await new Promise<never>((_resolve, reject) => {
      const fail = (): void => {
        reject(signal.reason instanceof Error
          ? signal.reason
          : new Error(String(signal.reason)))
      }
      if (signal.aborted) fail()
      else signal.addEventListener('abort', fail, { once: true })
    })
  }
  return Object.assign(stream(), { close }) as unknown as Query
}

function spec(overrides: Partial<QoderRunSpec> = {}): QoderRunSpec {
  return { cwd: '/workspace', pat: 'pat-value', disposeGraceMs: 5, ...overrides }
}

interface FakeRun {
  readonly close: ReturnType<typeof vi.fn>
  readonly options: Options[]
  readonly runSpec: QoderRunSpec
}

function fakeRun(
  messages: readonly SDKMessage[] = [success()],
  after?: Error,
): FakeRun {
  const close = vi.fn()
  const query = queryFrom(messages, after, close)
  const options: FakeRun['options'] = []
  queryMock.mockImplementation((params) => {
    options.push(params.options)
    return query
  })
  return { close, options, runSpec: spec() }
}

const CRED_CONFIG = {
  path: '/tmp/dsh-subagent-qoder-test-creds.yaml',
  dshHome: '/tmp',
  watch: false,
}

beforeEach(() => {
  accessTokenMock.mockImplementation((token: string) => ({ type: 'accessToken', accessToken: token }))
  queryMock.mockImplementation(() => queryFrom([]))
})

afterEach(() => {
  queryMock.mockReset()
  accessTokenMock.mockReset()
  vi.restoreAllMocks()
})

describe('task admission and package contracts', () => {
  it('preserves text sequences and rejects empty, blank, and non-text tasks', () => {
    expect(textTask([
      { type: 'text', text: 'one' },
      { type: 'text', text: 'two' },
    ])).toBe('onetwo')
    expect(() => textTask([])).toThrow('only text blocks')
    expect(() => textTask([{ type: 'reasoning', text: 'hidden' }]))
      .toThrow('only text blocks')
    expect(() => textTask([{ type: 'text', text: ' \n ' }]))
      .toThrow('must not be empty')
  })

  it('registers one fixed qoder provider, validates config, and unregisters on dispose', async () => {
    const ctx = new Context()
    await ctx.plugin(SubagentRuntime)
    await ctx.plugin(LocalCredentialProvider, CRED_CONFIG)
    const fiber = await ctx.plugin(subagentQoder, {})
    expect(ctx.subagents.getProvider('qoder')).toMatchObject({
      name: 'qoder',
      capabilities: {
        outputSchema: false,
        depthLimit: false,
        toolFilter: false,
        persona: false,
      },
      inheritsParentContext: false,
    })
    expect(ctx.subagents.list()).toEqual(['qoder'])
    await fiber.dispose()
    expect(ctx.subagents.list()).toEqual([])

    for (const disposeGraceMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(ctx.plugin(subagentQoder, { disposeGraceMs }))
        .rejects.toThrow('disposeGraceMs must be a positive finite number')
    }
    await expect(ctx.plugin(subagentQoder, {
      disposeGraceMs: MAX_TIMER_DELAY_MS + 1,
    })).rejects.toThrow(
      'disposeGraceMs must be no greater than',
    )
    await ctx.fiber.dispose()
  })

  it('keeps the Loader namespace shape', () => {
    expect('default' in subagentQoder).toBe(false)
    expect(subagentQoder.name).toBe('subagent-qoder')
    expect(subagentQoder.inject).toEqual(['subagents', 'credentials'])
  })
})

describe('query options and result mapping', () => {
  it('builds the fixed unattended options with PAT auth, optional model, and terminal-only pins', () => {
    const controller = new AbortController()
    const options = qoderQueryOptions(spec({ pat: 'explicit-pat', model: 'qwen-plus' }), controller)
    expect(options.abortController).toBe(controller)
    expect(options.cwd).toBe('/workspace')
    expect(options.persistSession).toBe(false)
    expect(options.disallowedTools).toEqual(['AskUserQuestion'])
    expect(options.model).toBe('qwen-plus')
    expect(accessTokenMock).toHaveBeenCalledWith('explicit-pat')
    expect(options.auth).toEqual({ type: 'accessToken', accessToken: 'explicit-pat' })
    for (const omitted of [
      'includePartialMessages',
      'resolveModel',
      'resolveModelTimeoutMs',
      'settingSources',
      'canUseTool',
      'onElicitation',
    ]) {
      expect(options).not.toHaveProperty(omitted)
    }
  })

  it('omits model when unset so Qoder chooses its default', () => {
    const controller = new AbortController()
    const options = qoderQueryOptions(spec({ model: undefined }), controller)
    expect(options).not.toHaveProperty('model')
  })

  it('accepts only a non-error success with a non-blank final result', () => {
    expect(successfulResult(success('exact final'))).toBe('exact final')
    expect(() => successfulResult(success('answer', true)))
      .toThrow('marked as an error')
    expect(() => successfulResult(success(' \n ')))
      .toThrow('contained no answer')
    expect(() => successfulResult(failure(
      'error_during_execution',
      ['first', 'second'],
    ))).toThrow('first; second')
    expect(() => successfulResult(failure(
      'error_max_turns',
      [],
    ))).toThrow('error_max_turns')
  })

  it('drains the complete stream, keeps the latest strict success, and skips noise', async () => {
    const query = queryFrom([
      systemInit(),
      assistantMessage('partial reasoning'),
      statusMessage(),
      success('first'),
      success('last'),
    ])
    await expect(consumeQoderQuery(query)).resolves.toEqual({
      output: [{ type: 'text', text: 'last' }],
      stopReason: 'completed',
    })
    await expect(consumeQoderQuery(
      queryFrom([systemInit(), statusMessage()]),
    )).rejects.toThrow('ended without a result')
  })
})

describe('run publication, cancellation, and settlement', () => {
  it('publishes after the Query exists, returns the terminal answer, and disposes once', async () => {
    const fixture = fakeRun([success('exact answer')])
    const run = await startQoderRun(
      request([
        { type: 'text', text: 'first' },
        { type: 'text', text: 'second' },
      ]),
      fixture.runSpec,
    )
    expect(fixture.options).toHaveLength(1)
    expect(accessTokenMock).toHaveBeenCalledWith('pat-value')
    expect(fixture.options[0]?.auth).toEqual({ type: 'accessToken', accessToken: 'pat-value' })
    await expect(run.result).resolves.toEqual({
      output: [{ type: 'text', text: 'exact answer' }],
      stopReason: 'completed',
    })
    const first = run.dispose()
    const second = run.dispose()
    expect(second).toBe(first)
    await first
    expect(fixture.close).toHaveBeenCalledOnce()
  })

  it('flattens every SDK error result to a shared error stop reason', async () => {
    const subtypes: ErrorSubtype[] = [
      'error_during_execution',
      'error_max_turns',
      'error_max_budget_usd',
    ]
    for (const subtype of subtypes) {
      const fixture = fakeRun([failure(subtype)])
      const onError = vi.fn()
      const run = await startQoderRun(request(), { ...fixture.runSpec, onError })
      await expect(run.result).resolves.toEqual({
        output: [],
        stopReason: 'error',
      })
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'error')
      await run.dispose()
    }
  })

  it('maps a missing result and an invalid success to error', async () => {
    for (const messages of [
      [success('answer', true)],
      [success('')],
      [systemInit(), assistantMessage('no result came')],
    ]) {
      const fixture = fakeRun(messages)
      const run = await startQoderRun(request(), fixture.runSpec)
      await expect(run.result).resolves.toMatchObject({
        stopReason: 'error',
      })
      await run.dispose()
    }
  })

  it('maps an iterator rejection (e.g. ProtocolVersionMismatchError) to error', async () => {
    const fixture = fakeRun([], new Error('wire protocol mismatch'))
    const run = await startQoderRun(request(), fixture.runSpec)
    await expect(run.result).resolves.toEqual({
      output: [],
      stopReason: 'error',
    })
    await run.dispose()
  })

  it('gives local cancellation precedence and isolates overlapping controllers', async () => {
    const controllers: AbortController[] = []
    let index = 0
    const secondClose = vi.fn()
    const queries = [
      undefined,
      queryFrom([success('second answer')], undefined, secondClose),
    ]
    queryMock.mockImplementation(({ options }) => {
      controllers.push(options.abortController!)
      const q = queries[index++]!
      if (q === undefined) return waitingQuery(options.abortController!.signal)
      return q
    })
    const firstAbort = new AbortController()
    const first = await startQoderRun(
      request([{ type: 'text', text: 'wait' }], firstAbort.signal),
      spec(),
    )
    const second = await startQoderRun(
      request([{ type: 'text', text: 'finish' }]),
      spec(),
    )
    expect(controllers).toHaveLength(2)
    expect(controllers[0]).not.toBe(controllers[1])
    firstAbort.abort(new Error('parent cancelled'))
    await expect(first.result).resolves.toEqual({
      output: [],
      stopReason: 'aborted',
    })
    await expect(second.result).resolves.toEqual({
      output: [{ type: 'text', text: 'second answer' }],
      stopReason: 'completed',
    })
    expect(controllers[1]!.signal.aborted).toBe(false)
    await Promise.all([first.dispose(), second.dispose()])
  })

  it('keeps local cancellation authoritative when the SDK iterator ends normally', async () => {
    const parentAbort = new AbortController()
    async function* stream(): AsyncGenerator<SDKMessage, void> {
      yield success('candidate answer')
      parentAbort.abort(new Error('parent cancelled at iterator completion'))
    }
    queryMock.mockImplementation(() => Object.assign(stream(), { close: vi.fn() }) as unknown as Query)
    const run = await startQoderRun(
      request(undefined, parentAbort.signal),
      spec(),
    )
    await expect(run.result).resolves.toEqual({
      output: [],
      stopReason: 'aborted',
    })
    await run.dispose()
  })

  it('rejects a pre-abort before SDK startup', async () => {
    const preAborted = new AbortController()
    preAborted.abort()
    await expect(startQoderRun(request(undefined, preAborted.signal), spec()))
      .rejects.toThrow('aborted before SDK startup')
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('rejects a synchronous query construction failure with the original error', async () => {
    queryMock.mockImplementationOnce(() => {
      throw new Error('query construction failed')
    })
    await expect(startQoderRun(request(), spec()))
      .rejects.toThrow('query construction failed')
  })
})

describe('query disposal', () => {
  it('closes the query once', async () => {
    const close = vi.fn()
    await disposeQoderQuery({ close })
    expect(close).toHaveBeenCalledOnce()
  })

  it('is a no-op when the query never existed', async () => {
    await expect(disposeQoderQuery(undefined)).resolves.toBeUndefined()
  })

  it('surfaces a close failure', async () => {
    const close = vi.fn(() => { throw new Error('close boom') })
    await expect(disposeQoderQuery({ close })).rejects.toThrow('close boom')
  })
})

describe('provider start with credentials-seam PAT', () => {
  it('resolves the PAT per operation, passes it via accessToken, and completes', async () => {
    const ctx = new Context()
    await ctx.plugin(SubagentRuntime)
    await ctx.plugin(LocalCredentialProvider, CRED_CONFIG)
    const resolve = vi.spyOn(ctx.credentials, 'resolve')
      .mockResolvedValue({ value: 'resolved-pat', source: 'file' })
    await ctx.plugin(subagentQoder, { disposeGraceMs: 29 })
    queryMock.mockImplementation(() => queryFrom([success('live answer')]))
    const run = await ctx.subagents.start('qoder', request())
    await expect(run.result).resolves.toEqual({
      output: [{ type: 'text', text: 'live answer' }],
      stopReason: 'completed',
    })
    expect(resolve).toHaveBeenCalledWith(QODER_PERSONAL_ACCESS_TOKEN)
    expect(accessTokenMock).toHaveBeenCalledWith('resolved-pat')
    await run.dispose()
    await ctx.fiber.dispose()
  })

  it('rejects when the PAT is not configured before touching the SDK', async () => {
    const ctx = new Context()
    await ctx.plugin(SubagentRuntime)
    await ctx.plugin(LocalCredentialProvider, CRED_CONFIG)
    const resolve = vi.spyOn(ctx.credentials, 'resolve').mockResolvedValue(undefined)
    await ctx.plugin(subagentQoder, {})
    await expect(ctx.subagents.start('qoder', request()))
      .rejects.toThrow('QODER_PERSONAL_ACCESS_TOKEN is not configured')
    expect(queryMock).not.toHaveBeenCalled()
    expect(resolve).toHaveBeenCalledWith(QODER_PERSONAL_ACCESS_TOKEN)
    await ctx.fiber.dispose()
  })

  it('rejects delegation without a parent working directory before resolving the PAT', async () => {
    const ctx = new Context()
    await ctx.plugin(SubagentRuntime)
    await ctx.plugin(LocalCredentialProvider, CRED_CONFIG)
    const resolve = vi.spyOn(ctx.credentials, 'resolve')
    await ctx.plugin(subagentQoder, {})
    await expect(ctx.subagents.start('qoder', {
      ...request(),
      parent: {
        id: 'parent-no-cwd',
        session: { header: {} },
      } as unknown as Agent,
    })).rejects.toThrow('no working directory for the child')
    expect(queryMock).not.toHaveBeenCalled()
    expect(resolve).not.toHaveBeenCalled()
    // cwd is checked before the PAT resolve in start()
    await ctx.fiber.dispose()
  })
})
