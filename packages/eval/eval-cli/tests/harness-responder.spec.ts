/// <reference types="node" />
/**
 * HarnessAgentResponder — the eval harness that drives one full Cordis agent
 * session per eval question and turns the resulting session log into an
 * AgentResponse.
 *
 * What this suite pins:
 *
 *  (1) Carry-forward #37 (D3ii) — explicit scopeId. The scopeId passed via
 *      opts reaches the SemanticLayerService config (NOT the old hardcoded
 *      'k11'), and bootContext() fail-louds when it is absent instead of
 *      silently defaulting. bootContext() calls the seam before it creates a
 *      context, so the throw costs nothing.
 *
 *  (2) Boot — bootContext() is exercised for real, in process. It mounts the
 *      ~16 plugins the harness needs (loader + group builtin, LLM runtime,
 *      credentials, dashscope, semantic layer, sessions, system prompt, tools,
 *      agent registry/default-model/loop, identity, audit, result cache, PTC
 *      runtime, session projections, goals) against a temporary preset root,
 *      and the optional MaxCompute query engine is exercised in all three of
 *      its states: mounted from an explicit sidecar path, mounted from the
 *      repo-default sidecar path, and failing to mount (the harness degrades
 *      with a warning rather than aborting the boot).
 *      NOTE: an earlier revision of this header claimed in-process
 *      ctx.plugin() was impossible here because eval-cli ships no
 *      `src/invariant.ts` test-invariants companion. That is wrong —
 *      scripts/test-invariants.ts:118 returns no companions when a package
 *      has none, which is not an error; the boots below run in ~0.4s.
 *
 *  (3) respond() — driven end-to-end against a real agent (real AgentLoop,
 *      real preset mount, scripted LLM adapter) so the session events it reads
 *      are produced by the production session writer, and additionally against
 *      a stub agent registry for the session-log shapes a healthy session
 *      never emits (absent message body, text block without text, unparsable
 *      tool arguments) and for the failure modes (agent throws, agent hangs
 *      past the 5-minute case budget).
 *
 *  (4) Repo-root / preset-dir resolution — both the found and the
 *      walked-to-the-filesystem-root outcomes of resolveRepoRoot(), and the
 *      constructor's missing-composition fail-loud.
 *
 * Run: npx vitest run packages/eval/eval-cli/tests/harness-responder.spec.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { dirname, join, resolve, sep } from 'node:path'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import {
  LlmAdapter, ToolCallId,
  type GenerateOptions, type LlmResolvedModelInfo, type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
// Cordis service augmentations the assertions below read off the booted
// context: ctx.schema, ctx.agents, ctx.loader. The harness mounts these
// plugins through dynamic import, so the spec has to pull their `declare
// module` augmentations in itself.
import type {} from '@deepseek-ai/dsh-semantic-layer'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { HarnessAgentResponder, type HarnessBootOptions, type Variant } from '../src/harness-responder.ts'

/** Toggle for the `node:url` seam below; hoisted so `vi.mock` can close over it. */
const urlState = vi.hoisted(() => ({ shallowModulePath: false }))

// Repo root (tests/ → eval-cli/ → eval/ → packages/ → repo root).
const ROOT = join(__dirname, '..', '..', '..', '..')
const PRESET_DIR = join(ROOT, 'packages/bundle/data-agent/presets/data-agent')
const SCHEMA_DIR = join(ROOT, 'examples/k11-semantic-layer')
const STANDIN_SIDECAR = join(ROOT, 'packages/query/query-maxcompute/dev/standin-sidecar.mjs')

/** The harness's own 5-minute per-case budget (src/harness-responder.ts:57). */
const CASE_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Test-only subclass that exposes the protected semanticLayerConfig() seam so
 * the positive case can assert the SemanticLayerService config (scopeId flows
 * through) without booting a context at all.
 */
class ExposedHarnessResponder extends HarnessAgentResponder {
  exposeSemanticLayerConfig(): { semanticRoot: string; scopeId: string } {
    return this.semanticLayerConfig()
  }
}

describe('Carry-forward #37 (D3ii) — harness-responder explicit scopeId', () => {
  it('resolves variant compositions from the installed data-agent bundle by default', () => {
    expect(() => new ExposedHarnessResponder({
      schemaDir: 'examples/k11-semantic-layer',
      provider: 'aga',
      model: 'qwen3.7-max',
      variant: 'A',
      today: '20260902',
      scopeId: 'custom-scope-42',
    })).not.toThrow()
  })

  it('positive: semanticLayerConfig() returns the explicit scopeId (not the old hardcoded k11)', () => {
    // Construct with an explicit non-k11 scopeId. The constructor only checks
    // the preset file exists (no ctx.plugin), so this is safe without the
    // test-invariants companion.
    const responder = new ExposedHarnessResponder({
      schemaDir: 'examples/k11-semantic-layer',
      provider: 'aga',
      model: 'qwen3.7-max',
      variant: 'A',
      presetDir: PRESET_DIR,
      today: '20260902',
      scopeId: 'custom-scope-42',
    })

    const config = responder.exposeSemanticLayerConfig()
    // D3ii: the explicit scopeId flows into the SemanticLayerService config —
    // NOT the old hardcoded 'k11' (the silent default pointer anti-pattern).
    expect(config.scopeId).toBe('custom-scope-42')
    expect(config.scopeId).not.toBe('k11')
    expect(config.semanticRoot).toBe('examples/k11-semantic-layer')
  })

  it('D3ii throw: bootContext (via respond) without scopeId fail-louds before any plugin mount', async () => {
    // Construct WITHOUT scopeId — the constructor succeeds (preset exists),
    // but bootContext() (reached via respond() → ensureContext()) throws at
    // the top via the seam, before ctx is created or any plugin mounts. This
    // is the no-default-pointer contract: no silent 'k11' fallback.
    const responder = new HarnessAgentResponder({
      schemaDir: 'examples/k11-semantic-layer',
      provider: 'aga',
      model: 'qwen3.7-max',
      variant: 'A',
      presetDir: PRESET_DIR,
      today: '20260902',
      // scopeId intentionally omitted → D3ii fail-loud
    })

    await expect(responder.respond('test question')).rejects.toThrow(
      'harness-responder bootContext: explicit scopeId required (D3ii)',
    )
  })
})

// ─── Shared fixtures for the boot / respond suites ─────────────────────────────

/**
 * A preset root shaped like the shipped data-agent bundle (one composition per
 * variant letter) whose single row registers a `query_data` tool. The harness
 * only requires that `<presetDir>/<variant file>` exists and mounts; using a
 * local composition keeps the agent scope free of the bundle's 15 data-plane
 * rows (which need the whole app-boot composition to activate) while still
 * exercising the real mountPreset path in respond()'s setup callback.
 */
let presetRoot: string
/** Contexts booted by this file; disposed together so no sidecar child leaks. */
const bootedContexts: Context[] = []

const QUERY_TOOL_PLUGIN = `export const name = 'eval-fixture-query-data'
export const inject = ['tools']
export function apply(ctx) {
  ctx.effect(() => ctx.tools.register({
    name: 'query_data',
    description: 'fixture query_data used by the eval harness suite',
    parameters: {
      type: 'object',
      properties: { sql: { type: 'string' } },
      required: ['sql'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute: args => Promise.resolve('1 row for ' + args.sql),
  }))
}
`

const COMPOSITION = `- id: eval-fixture-query-data
  name: ./query-data-tool.js
`

beforeAll(() => {
  presetRoot = mkdtempSync(join(tmpdir(), 'dsh-eval-preset-'))
  writeFileSync(join(presetRoot, 'query-data-tool.js'), QUERY_TOOL_PLUGIN, 'utf8')
  for (const file of [
    'agent.cordis.yml',
    'b-free-react-planning.cordis.yml',
    'c-hybrid.cordis.yml',
    'd-bare-react.cordis.yml',
  ]) writeFileSync(join(presetRoot, file), COMPOSITION, 'utf8')
})

afterAll(async () => {
  for (const ctx of bootedContexts) await ctx.fiber.dispose()
  rmSync(presetRoot, { recursive: true, force: true })
})

/** Scripted LLM adapter: each model call consumes the next chunk list. */
class ScriptAdapter extends LlmAdapter {
  constructor(private readonly script: StreamChunk[][]) { super() }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model })
  }

  async * stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    const chunks = this.script.shift()
    if (chunks === undefined) throw new Error('ScriptAdapter: script exhausted')
    for (const chunk of chunks) yield chunk
  }
}

/** One assistant turn that emits `body` as a single text block and stops. */
function say(body: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: body },
    { type: 'block-end', index: 0, block: { type: 'text', text: body } },
    { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

/** One assistant turn that emits `body` then calls `query_data({ sql })`. */
function sayAndQuery(body: string, sql: string): StreamChunk[] {
  const id = ToolCallId('call-query-data-1')
  const args = JSON.stringify({ sql })
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: body },
    { type: 'block-end', index: 0, block: { type: 'text', text: body } },
    { type: 'block-start', index: 1, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 1, id, name: 'query_data', argumentsDelta: args },
    { type: 'block-end', index: 1, block: { type: 'tool-call', id, name: 'query_data', arguments: args } },
    { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

interface BootOverrides extends Partial<HarnessBootOptions> {
  readonly variant?: Variant
}

function makeResponder(overrides: BootOverrides = {}): HarnessAgentResponder {
  return new HarnessAgentResponder({
    schemaDir: SCHEMA_DIR,
    provider: 'evalmock',
    model: 'evalmock-model',
    variant: 'A',
    presetDir: presetRoot,
    today: '20260902',
    scopeId: 'k11',
    ...overrides,
  })
}

/** Boot a responder for real and route its provider at a scripted adapter. */
async function bootWithScript(
  script: StreamChunk[][],
  overrides: BootOverrides = {},
): Promise<HarnessAgentResponder> {
  const responder = makeResponder(overrides)
  const ctx = await (responder as unknown as { ensureContext(): Promise<Context> }).ensureContext()
  bootedContexts.push(ctx)
  ctx.llm.registerAdapter(['evalmock'], new ScriptAdapter(script))
  return responder
}

describe('HarnessAgentResponder — construction and context lifecycle', () => {
  it('fail-louds when the variant composition is missing from the preset dir', () => {
    const empty = mkdtempSync(join(tmpdir(), 'dsh-eval-nopreset-'))
    try {
      expect(() => makeResponder({ presetDir: empty, variant: 'D' })).toThrow(
        `HarnessAgentResponder: variant D composition not found at ${join(empty, 'd-bare-react.cordis.yml')}`,
      )
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('maps every variant letter onto its own composition file', () => {
    const seen: string[] = []
    for (const variant of ['A', 'B', 'C', 'D'] as const) {
      const responder = makeResponder({ variant })
      seen.push((responder as unknown as { presetPath: string }).presetPath)
    }
    expect(seen).toEqual([
      join(presetRoot, 'agent.cordis.yml'),
      join(presetRoot, 'b-free-react-planning.cordis.yml'),
      join(presetRoot, 'c-hybrid.cordis.yml'),
      join(presetRoot, 'd-bare-react.cordis.yml'),
    ])
  })

  it('boots the context once and hands the same instance to every later call', async () => {
    const responder = makeResponder()
    const internals = responder as unknown as { ensureContext(): Promise<Context> }
    const first = await internals.ensureContext()
    bootedContexts.push(first)
    // Second call takes the cached-context arm (this.ctx !== null).
    const second = await internals.ensureContext()
    expect(second).toBe(first)
    // The boot really did mount the harness services, not a bare Context.
    expect(first.schema).toBeInstanceOf(Object)
    expect(first.agents).toBeInstanceOf(Object)
    expect(first.loader.builtins.group).toBeInstanceOf(Function)
  })

  it('collapses concurrent boots onto one in-flight boot promise', async () => {
    const responder = makeResponder()
    const internals = responder as unknown as { ensureContext(): Promise<Context> }
    // Both calls are issued before the first boot settles: the second sees
    // ctx === null but bootPromise !== null and joins it.
    const [a, b] = await Promise.all([internals.ensureContext(), internals.ensureContext()])
    bootedContexts.push(a)
    expect(b).toBe(a)
  })
})

describe('HarnessAgentResponder — respond() over a real agent session', () => {
  it('returns the assistant text verbatim and no SQL when the agent only talks', async () => {
    const responder = await bootWithScript([say('K11 had 1234 daily active users.')])
    const result = await responder.respond('how many daily active users?')
    expect(result.reply).toBe('K11 had 1234 daily active users.')
    expect(result.generated_sql).toBeNull()
    // The transcript is the real session log, not a synthetic echo.
    expect((result.transcript as SessionEvent[]).map(event => event.type))
      .toContain('assistant/message')
  })

  it('extracts the SQL the agent passed to query_data and reports it alongside the answer', async () => {
    const sql = 'SELECT count(1) FROM dwd_user_login_di WHERE ds = 20260902'
    const responder = await bootWithScript([
      sayAndQuery('Running the count now.', sql),
      say('1234 users logged in.'),
    ])
    const result = await responder.respond('how many daily active users?')
    expect(result.generated_sql).toBe(sql)
    expect(result.reply).toBe('1234 users logged in.')
  })

  it('marks an A-variant answer declined when the phase gate stamps the INCOMPLETE marker', async () => {
    const responder = await bootWithScript([say('【incomplete】 the semantic layer has no churn table.')])
    const result = await responder.respond('what is the churn rate?')
    expect(result.reply).toBe('Declined: 【incomplete】 the semantic layer has no churn table.')
  })

  it('truncates a declined reply at 500 characters of final text', async () => {
    const long = `【incomplete】${'x'.repeat(900)}`
    const responder = await bootWithScript([say(long)])
    const result = await responder.respond('what is the churn rate?')
    expect(result.reply).toBe(`Declined: ${long.slice(0, 500)}`)
    expect(result.reply).toHaveLength('Declined: '.length + 500)
  })

  it('marks a C-variant answer declined on the route:decline token', async () => {
    const responder = await bootWithScript([say('【route:decline】 out of scope')], { variant: 'C' })
    const result = await responder.respond('what is the weather?')
    expect(result.reply).toBe('Declined: 【route:decline】 out of scope')
  })

  it('finds a decline marker left in an earlier assistant turn even when the last turn is clean', async () => {
    const sql = 'SELECT 1'
    const responder = await bootWithScript([
      sayAndQuery('【route:decline】 I will try anyway.', sql),
      say('Here is the best effort answer.'),
    ])
    const result = await responder.respond('something out of scope')
    // The final text carries no marker, so the decline can only come from the
    // scan over the whole session log.
    expect(result.reply).toBe('Declined: Here is the best effort answer.')
    expect(result.generated_sql).toBe(sql)
  })

  it('detects a prose decline for the phase-gate-less B variant', async () => {
    const responder = await bootWithScript([say('抱歉，无法回答这个问题。')], { variant: 'B' })
    const result = await responder.respond('what is the churn rate?')
    expect(result.reply).toBe('Declined: 抱歉，无法回答这个问题。')
  })

  it('leaves a normal B-variant answer undeclined after every prose pattern misses', async () => {
    const responder = await bootWithScript([say('Daily active users were 1234.')], { variant: 'B' })
    const result = await responder.respond('how many daily active users?')
    expect(result.reply).toBe('Daily active users were 1234.')
  })

  it('leaves an A-variant answer undeclined when no marker appears anywhere in the log', async () => {
    const responder = await bootWithScript([say('Daily active users were 1234.')])
    const result = await responder.respond('how many daily active users?')
    expect(result.reply).toBe('Daily active users were 1234.')
  })
})

// ─── Stub agent registry ───────────────────────────────────────────────────────

interface StubTrace {
  sessionId: string
  cwd: string
  provider: string
  model: string
  followups: string[]
  disposals: number
}

interface StubConfig {
  /** What the stub session reports as its full event log. */
  readonly events: readonly unknown[]
  /** Second `whenIdle()` — the quiescence wait that raceTimeout guards. */
  readonly settle?: () => Promise<void>
}

/** Context shared by the stub suite; booted once, disposed with the file. */
let stubHost: Context | undefined

async function stubHostContext(): Promise<Context> {
  if (stubHost !== undefined) return stubHost
  const responder = makeResponder()
  const ctx = await (responder as unknown as { ensureContext(): Promise<Context> }).ensureContext()
  bootedContexts.push(ctx)
  ctx.llm.registerAdapter(['evalmock', 'evalmock-alt'], new ScriptAdapter([]))
  stubHost = ctx
  return ctx
}

/**
 * A stand-in for `ctx.agents` that creates a *real* agent (so respond()'s
 * setup callback really mounts the preset into a real agent scope and the
 * handle is really disposed) but serves the session event log from the test.
 *
 * The production session writer can never emit an assistant message without a
 * body, a text block without text, or unparsable tool arguments — and a
 * healthy agent never hangs past the case budget — so those shapes are only
 * reachable by substituting the log and the quiescence wait.
 */
function stubAgentContext(host: Context, config: StubConfig, trace: StubTrace): Context {
  let settled = false
  return {
    agents: {
      create: async (options: {
        // Branded: the stub forwards `options` verbatim to the real
        // host.agents.create, so it must satisfy the real signature.
        sessionId: SessionId
        meta: { cwd: string }
        agentOptions: { provider: string; model: string }
        setup: (agentCtx: Context) => Promise<void>
      }) => {
        trace.sessionId = options.sessionId
        trace.cwd = options.meta.cwd
        trace.provider = options.agentOptions.provider
        trace.model = options.agentOptions.model
        const real = await host.agents.create(options)
        return {
          agent: {
            whenIdle: async (): Promise<void> => {
              if (!settled) return
              await (config.settle ?? ((): Promise<void> => Promise.resolve()))()
            },
            followup: (message: { content: { type: string; text?: string }[] }): void => {
              trace.followups.push(message.content.map(block => block.text ?? '').join(''))
              settled = true
            },
            session: { snapshotEvents: (): readonly unknown[] => config.events },
          },
          dispose: async (): Promise<void> => {
            trace.disposals += 1
            await real.dispose()
          },
        }
      },
    },
  } as unknown as Context
}

function newTrace(): StubTrace {
  return { sessionId: '', cwd: '', provider: '', model: '', followups: [], disposals: 0 }
}

/** Attach a stub context to an already-constructed responder. */
async function withStub(
  responder: HarnessAgentResponder,
  config: StubConfig,
  trace: StubTrace,
): Promise<HarnessAgentResponder> {
  const host = await stubHostContext()
  ;(responder as unknown as { ctx: Context | null }).ctx = stubAgentContext(host, config, trace)
  return responder
}

function assistantMessage(content: unknown): unknown {
  return { type: 'assistant/message', data: { message: { content } } }
}

describe('HarnessAgentResponder — respond() session-log edge shapes', () => {
  it('passes the question, a fresh eval session id, the cwd and the model route to the agent', async () => {
    const trace = newTrace()
    const responder = await withStub(
      makeResponder({ provider: 'evalmock-alt', model: 'alt-model-7' }),
      { events: [assistantMessage([{ type: 'text', text: 'ok' }])] },
      trace,
    )
    const result = await responder.respond('how many users?')
    expect(trace.followups).toEqual(['how many users?'])
    expect(trace.sessionId).toMatch(/^eval-harness-[0-9a-f-]{36}$/)
    expect(trace.cwd).toBe(process.cwd())
    expect(trace.provider).toBe('evalmock-alt')
    expect(trace.model).toBe('alt-model-7')
    expect(trace.disposals).toBe(1)
    expect(result.reply).toBe('ok')
  })

  it('reads an empty final text when the assistant event carries no message body', async () => {
    const trace = newTrace()
    const responder = await withStub(
      makeResponder(),
      {
        events: [
          { type: 'turn/start', data: {} },
          { type: 'assistant/message', data: {} },
        ],
      },
      trace,
    )
    const result = await responder.respond('q')
    expect(result.reply).toBe('')
    expect(result.generated_sql).toBeNull()
  })

  it('keeps the last non-empty assistant text and joins only its text blocks', async () => {
    const trace = newTrace()
    const responder = await withStub(
      makeResponder(),
      {
        events: [
          assistantMessage([{ type: 'text', text: 'first answer' }]),
          assistantMessage([
            { type: 'thinking', text: 'hidden reasoning' },
            { type: 'text', text: 'second ' },
            { type: 'text' },
            { type: 'text', text: 'answer' },
          ]),
          assistantMessage([{ type: 'thinking', text: 'trailing reasoning only' }]),
        ],
      },
      trace,
    )
    const result = await responder.respond('q')
    // The trailing event's blocks are all filtered out (empty text), so the
    // previous turn stays the final text; the missing `text` becomes ''.
    expect(result.reply).toBe('second answer')
  })

  it('takes the last query_data SQL and ignores other tools and unparsable arguments', async () => {
    const trace = newTrace()
    const responder = await withStub(
      makeResponder(),
      {
        events: [
          { type: 'tool/call', data: { name: 'search_data_sources', arguments: '{"q":"users"}' } },
          { type: 'tool/call', data: { name: 'query_data', arguments: '{"sql":"SELECT 1"}' } },
          { type: 'tool/call', data: { name: 'query_data', arguments: '{"sql":"SELECT 2"}' } },
          { type: 'tool/call', data: { name: 'query_data', arguments: '{"sql": broken' } },
          { type: 'tool/call', data: { name: 'query_data' } },
          { type: 'tool/call', data: { name: 'query_data', arguments: '{"sql":""}' } },
          assistantMessage([{ type: 'text', text: 'done' }]),
        ],
      },
      trace,
    )
    const result = await responder.respond('q')
    // 'SELECT 2' is the last *usable* sql: the malformed JSON, the missing
    // arguments and the empty sql all leave the previous value standing.
    expect(result.generated_sql).toBe('SELECT 2')
    expect(result.reply).toBe('done')
  })

  it('scans non-text assistant blocks for the decline marker of an A-variant run', async () => {
    const trace = newTrace()
    const responder = await withStub(
      makeResponder(),
      {
        events: [
          { type: 'assistant/message', data: {} },
          assistantMessage([{ type: 'text', text: '【incomplete】 no table' }]),
          assistantMessage([{ type: 'text', text: 'partial answer' }]),
        ],
      },
      trace,
    )
    const result = await responder.respond('q')
    expect(result.reply).toBe('Declined: partial answer')
  })

  it('reports the agent error and still salvages the SQL when the session throws', async () => {
    const trace = newTrace()
    const responder = await withStub(
      makeResponder(),
      {
        events: [{ type: 'tool/call', data: { name: 'query_data', arguments: '{"sql":"SELECT 3"}' } }],
        settle: () => Promise.reject(new Error('agent exploded')),
      },
      trace,
    )
    const result = await responder.respond('q')
    expect(result.reply).toBe('Error: agent exploded')
    expect(result.generated_sql).toBe('SELECT 3')
    expect(trace.disposals).toBe(1)
  })

  it('stringifies a non-Error rejection from the agent', async () => {
    const trace = newTrace()
    const responder = await withStub(
      makeResponder(),
      {
        events: [],
        // eslint-disable-next-line prefer-promise-reject-errors
        settle: () => Promise.reject('plain string failure'),
      },
      trace,
    )
    const result = await responder.respond('q')
    expect(result.reply).toBe('Error: plain string failure')
    expect(result.generated_sql).toBeNull()
  })

  it('aborts a case that never reaches quiescence at the 5-minute budget', async () => {
    const trace = newTrace()
    // The clock is swapped inside the quiescence wait — i.e. after the real
    // agent has been created but before raceTimeout arms its timer — so the
    // 5-minute budget can elapse without the suite waiting 5 minutes and
    // without faking the clock the agent scope was built under.
    let armed!: () => void
    const armedFirst = new Promise<void>((resolveArmed) => { armed = resolveArmed })
    const responder = await withStub(
      makeResponder(),
      {
        events: [assistantMessage([{ type: 'text', text: 'still thinking' }])],
        settle: () => {
          vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
          armed()
          return new Promise<void>(() => { /* never settles */ })
        },
      },
      trace,
    )
    try {
      const pending = responder.respond('q')
      await armedFirst
      await vi.advanceTimersByTimeAsync(CASE_TIMEOUT_MS)
      vi.useRealTimers()
      const result = await pending
      expect(result.reply).toBe('Error: HarnessAgentResponder: case timeout (300s)')
      expect(trace.disposals).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('HarnessAgentResponder — optional MaxCompute query engine', () => {
  it('mounts the query engine from an explicit sidecar path and MAXC_CONFIG', async () => {
    vi.stubEnv('MAXC_CONFIG', join(ROOT, 'packages/query/query-maxcompute/dev/fake-credentials.ts'))
    try {
      const responder = makeResponder({ withQuery: true, sidecarPath: STANDIN_SIDECAR })
      const ctx = await (responder as unknown as { bootContext(): Promise<Context> }).bootContext()
      bootedContexts.push(ctx)
      expect(ctx.query).toBeInstanceOf(Object)
    } finally {
      vi.unstubAllEnvs()
    }
  }, 60_000)

  it('falls back to the in-repo standin sidecar and the HOME maxc config', async () => {
    vi.stubEnv('MAXC_CONFIG', undefined)
    try {
      const responder = makeResponder({ withQuery: true })
      const ctx = await (responder as unknown as { bootContext(): Promise<Context> }).bootContext()
      bootedContexts.push(ctx)
      expect(ctx.query).toBeInstanceOf(Object)
    } finally {
      vi.unstubAllEnvs()
    }
  }, 60_000)

  it('keeps booting when the query engine cannot start, leaving ctx.query unpublished', async () => {
    vi.stubEnv('MAXC_CONFIG', undefined)
    vi.stubEnv('HOME', undefined)
    try {
      const responder = makeResponder({
        withQuery: true,
        sidecarPath: join(tmpdir(), 'dsh-eval-missing-sidecar.mjs'),
      })
      const ctx = await (responder as unknown as { bootContext(): Promise<Context> }).bootContext()
      bootedContexts.push(ctx)
      // The boot completed (the harness degrades) but the engine is absent.
      expect(ctx.agents).toBeInstanceOf(Object)
      expect(Reflect.get(ctx, 'query')).toBeUndefined()
    } finally {
      vi.unstubAllEnvs()
    }
  }, 60_000)

  it('stringifies a query-engine mount failure that is not an Error', async () => {
    // The shipped engine always fails with an Error (previous case). The
    // String(err) arm is NOT reachable through ctx.plugin(): Cordis rewraps a
    // plugin's thrown non-Error, so it arrives as an Error either way
    // (verified). The one production route left is the dynamic import itself
    // rejecting with a non-Error — a module in the engine's load graph that
    // throws a bare value at top level. Substituting the optional engine
    // module reproduces that; nothing else about the boot is faked.
    vi.doMock('@deepseek-ai/dsh-query-maxcompute', () => {
      const broken = {}
      Object.defineProperty(broken, 'MaxComputeQueryEngine', {
        enumerable: true,
        get: (): never => {
          throw { sidecar: 'unusable', toString: () => 'NONERR-SENTINEL' }
        },
      })
      return broken
    })
    const warnings: string[] = []
    const warn = vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
      warnings.push(String(message))
    })
    try {
      const responder = makeResponder({ withQuery: true, sidecarPath: STANDIN_SIDECAR })
      const ctx = await (responder as unknown as { bootContext(): Promise<Context> }).bootContext()
      bootedContexts.push(ctx)
      expect(warnings).toEqual([
        '  [HarnessAgentResponder] Query engine failed to mount: NONERR-SENTINEL',
      ])
      expect(Reflect.get(ctx, 'query')).toBeUndefined()
    } finally {
      warn.mockRestore()
      vi.doUnmock('@deepseek-ai/dsh-query-maxcompute')
    }
  }, 60_000)
})

/**
 * Report the harness module as if it had been installed at a shallow path
 * outside any checkout — the published-package layout, where the
 * module-relative walk reaches the filesystem root without ever seeing a
 * `packages/` + `apps/` pair. Only this module's own path is redirected; every
 * other `fileURLToPath` call and every filesystem probe still answers for real.
 *
 * The seam is `node:url`'s `fileURLToPath`, not a `globalThis.URL` subclass:
 * `resolveRepoRoot` was changed to `fileURLToPath` (URL.pathname yields
 * '/C:/…' on Windows, which silently killed the module-relative walk there),
 * and `fileURLToPath` resolves through Node's internal URL parser, so
 * stubbing the global URL no longer reaches it. A global-URL stub would leave
 * the two tests below passing for the wrong reason — the module walk would
 * simply succeed and return the real root, which is what they assert.
 */
vi.mock('node:url', async () => {
  const actual = await vi.importActual<typeof import('node:url')>('node:url')
  const moduleTail = join('src', 'harness-responder.ts')
  return {
    ...actual,
    default: actual,
    fileURLToPath: (input: string | URL): string => {
      const real = actual.fileURLToPath(input)
      // Rooted on the current volume so the walk terminates the same way on
      // Windows (C:\dsh-install\…) as on POSIX (/dsh-install/…).
      return urlState.shallowModulePath && real.endsWith(moduleTail)
        ? resolve(sep, 'dsh-install', 'lib', 'harness-responder.js')
        : real
    },
  }
})

function stubShallowInstallPath(): void {
  urlState.shallowModulePath = true
}

function unstubShallowInstallPath(): void {
  urlState.shallowModulePath = false
}

describe('HarnessAgentResponder — repo root resolution', () => {
  it('walks up from the module to the checkout that holds packages/ and apps/', () => {
    const responder = makeResponder()
    const found = (responder as unknown as { resolveRepoRoot(): string }).resolveRepoRoot()
    expect(found).toBe(resolve(ROOT))
  })

  it('falls back to the working directory when no ancestor of the module is a checkout', () => {
    const responder = makeResponder()
    const internals = responder as unknown as { resolveRepoRoot(): string }
    // The cwd walk must land on a SECOND, synthetic checkout — not the real
    // one the module lives in. Asserting the real root here would pass
    // whether or not the module-relative walk was actually skipped, because
    // both walks would answer with the same directory.
    const elsewhere = mkdtempSync(join(tmpdir(), 'dsh-eval-checkout-'))
    mkdirSync(join(elsewhere, 'packages'))
    mkdirSync(join(elsewhere, 'apps'))
    const original = process.cwd()
    stubShallowInstallPath()
    process.chdir(elsewhere)
    try {
      const cwdCheckout = resolve('.')
      expect(cwdCheckout).not.toBe(resolve(ROOT))
      expect(internals.resolveRepoRoot()).toBe(cwdCheckout)
    } finally {
      process.chdir(original)
      unstubShallowInstallPath()
      rmSync(elsewhere, { recursive: true, force: true })
    }
  })

  it('returns the working directory itself when neither walk finds a checkout', () => {
    const responder = makeResponder()
    const internals = responder as unknown as { resolveRepoRoot(): string }
    const away = mkdtempSync(join(tmpdir(), 'dsh-eval-nowhere-'))
    const original = process.cwd()
    stubShallowInstallPath()
    process.chdir(away)
    try {
      // Neither /dsh-install/... nor any ancestor of a temp dir is a checkout.
      expect(internals.resolveRepoRoot()).toBe(resolve('.'))
      expect(dirname(resolve('.'))).not.toBe(resolve(ROOT))
    } finally {
      process.chdir(original)
      unstubShallowInstallPath()
      rmSync(away, { recursive: true, force: true })
    }
  })
})
