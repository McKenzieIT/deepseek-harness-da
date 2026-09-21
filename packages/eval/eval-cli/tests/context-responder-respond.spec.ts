/// <reference types="node" />
/**
 * `Nl2sqlAgentResponder.respond` and its private `buildSchemaContext`.
 *
 * respond() constructs a real `Nl2sqlEngine` internally, so `Nl2sqlEngine` is
 * narrow-mocked here (everything else in the module — `Bm25Linker`,
 * `StandInOdps`, `looksLikeToolCall`, `buildPrompt` — is delegated to the real
 * implementation via importActual). This is NOT faking a contract to reach an
 * impossible branch: every reply branch below is a production-reachable engine
 * outcome (ok / decline / tool_call_emitted / beyond_single_query / pending /
 * fallthrough). The mock only makes which reachable outcome occur deterministic,
 * so respond()'s branching — the unit under test — can be pinned without
 * standing up an LLM. The engine's own behavior is covered by nl2sql-engine's
 * suite. The retrieval / lookupDoc / partitionResolver / promptBuilder closures
 * respond() hands the engine are exercised directly off the captured config,
 * since the mocked engine never calls them.
 *
 * Run: npx vitest run packages/eval/eval-cli/tests/context-responder-respond.spec.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'

/** Mutable holder the mocked engine reads its scripted result from and writes its config to. */
const engineState = vi.hoisted(() => ({ result: undefined as unknown, config: undefined as Record<string, unknown> | undefined }))

vi.mock('@deepseek-ai/dsh-nl2sql-engine', async () => {
  const actual = await vi.importActual<typeof import('@deepseek-ai/dsh-nl2sql-engine')>('@deepseek-ai/dsh-nl2sql-engine')
  class FakeEngine {
    constructor(config: Record<string, unknown>) { engineState.config = config }
    async run(): Promise<unknown> { return engineState.result }
  }
  return { ...actual, Nl2sqlEngine: FakeEngine }
})

const { Nl2sqlAgentResponder } = await import('../src/context.ts')
const { buildPromptEN } = await import('../src/exp2-prompts-en.ts')

/** Route a stubbed `ctx.llm.stream` by call purpose: expansion (has system), detection (maxTokens 64), else answer. */
function routingLlm(routes: { expansion?: string; detection?: string; answer?: string }) {
  const emit = (text: string): StreamChunk[] => [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  return {
    stream(options: { system?: unknown; maxTokens?: number }) {
      let text = routes.answer ?? ''
      if (options.system !== undefined) text = routes.expansion ?? ''
      else if (options.maxTokens === 64) text = routes.detection ?? ''
      return (async function* (): AsyncIterable<StreamChunk> { for (const c of emit(text)) yield c })()
    },
  }
}

interface SchemaStub {
  loadRetrievalCorpusAll?(): unknown[]
  getRelationGraph?(scopeId?: string): unknown
  loadEventDefinition?(name: string): unknown
  loadTableDefinition?(name: string, scopeId?: string): { partitions: Array<{ name: string }> } | null
  semanticRoot?: string
}

function ctxWith(llm: unknown, schema: SchemaStub): Context {
  const ctx = new Context()
  const provide = (ctx as unknown as { provide(k: string, v: unknown): void }).provide.bind(ctx)
  provide('llm', llm)
  provide('schema', schema)
  return ctx
}

function makeResponder(ctx: Context, opts?: { queryExpansion?: boolean }): InstanceType<typeof Nl2sqlAgentResponder> {
  return new Nl2sqlAgentResponder(ctx, '20260101', 'aga', 'qwen3.7-max', false, 'k11', opts?.queryExpansion ?? false)
}

const tmpDirs: string[] = []
/** A semantic root whose config.yaml carries a full event_view, so extractEventView returns one. */
function eventViewRoot(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'crr-sem-')))
  tmpDirs.push(dir)
  writeFileSync(join(dir, 'config.yaml'), [
    'event_view:',
    '  full_name: ieu_ods.ods_10000251_all_view',
    "  params_extract_template: \"GET_JSON_OBJECT(params,'$.{field_name}')\"",
  ].join('\n') + '\n')
  return dir
}

let errLines: string[] = []
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true })
  engineState.result = undefined
  engineState.config = undefined
  errLines = []
  vi.restoreAllMocks()
})
/** Silence + capture the [DIAG] stderr respond() emits. */
function hush(): void {
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errLines.push(a.map(String).join(' ')) })
}

describe('respond — reply routing by engine outcome', () => {
  it('returns a long non-SQL, non-tool-call answer verbatim', async () => {
    hush()
    engineState.result = { ok: false, decline: false, pending: false, sql: 'This is a plain sentence answer, well over twenty characters long.', trace: [] }
    const r = makeResponder(ctxWith(routingLlm({}), { loadRetrievalCorpusAll: () => [] }))
    const out = await r.respond('what can this data show?')
    expect(out.reply).toBe('This is a plain sentence answer, well over twenty characters long.')
    expect(out.generated_sql).toBe('This is a plain sentence answer, well over twenty characters long.')
    expect(out.schema_context).toBe('(no candidates)')
    expect(out.transcript).toEqual([])
  })

  it('answers from the rows on an ok result, grounding the answer prompt in schema context', async () => {
    hush()
    engineState.result = {
      ok: true, result: [{ total: 42 }], sql: 'SELECT COUNT(*) AS total FROM dws_pay',
      trace: [{ step: 'bm25_linking', candidates: [{ id: 'dws_pay' }] }],
    }
    const corpus = [{ id: 'dws_pay', payload: { table_comment: '付费日汇总', granularity: 'day', columns: [{ name: 'pay_amt', type: 'double', comment: '付费额' }] } }]
    const r = makeResponder(ctxWith(routingLlm({ answer: 'The total is 42.' }), { loadRetrievalCorpusAll: () => corpus }))
    const out = await r.respond('how much total pay')
    expect(out.reply).toBe('The total is 42.')
    expect(out.schema_context).toContain('- dws_pay: 付费日汇总 [粒度: day]')
    expect(out.schema_context).toContain('pay_amt(double, 付费额)')
    expect(out.generated_sql).toBe('SELECT COUNT(*) AS total FROM dws_pay')
  })

  it('synthesizes a grounded decline when the engine emits a tool call, with candidates present', async () => {
    hush()
    engineState.result = { ok: false, decline: true, declineKind: 'tool_call_emitted', sql: null, trace: [{ step: 'bm25_linking', candidates: [{ id: 'evt_login' }] }] }
    const corpus = [{ id: 'evt_login', description: '登录事件', payload: { params_fields: { device: { description: '设备' }, ip: {} } } }]
    const r = makeResponder(ctxWith(routingLlm({ answer: '当前没有满意度字段，可提供登录设备/ip。' }), { loadRetrievalCorpusAll: () => corpus }))
    const out = await r.respond('用户满意度如何')
    expect(out.reply).toBe('当前没有满意度字段，可提供登录设备/ip。')
    expect(out.schema_context).toContain('- evt_login: 登录事件 | fields: device (设备), ip')
  })

  it('synthesizes a decline for a beyond-single-query deliverable with no candidates', async () => {
    hush()
    engineState.result = { ok: false, decline: true, declineKind: 'beyond_single_query', sql: null, trace: [] }
    const r = makeResponder(ctxWith(routingLlm({ answer: '请指明具体指标，如 DAU 或充值金额。' }), { loadRetrievalCorpusAll: () => [] }))
    const out = await r.respond('给我做个完整运营周报')
    expect(out.reply).toBe('请指明具体指标，如 DAU 或充值金额。')
    expect(out.schema_context).toBe('(no candidates)')
  })

  it('reports a plain decline with its reason', async () => {
    hush()
    engineState.result = { ok: false, decline: true, sql: null, reason: '不可修复错误 table_not_found', trace: [] }
    // Schema exposes no loadRetrievalCorpusAll, exercising the `?? []` corpus fallback.
    const r = makeResponder(ctxWith(routingLlm({}), {}))
    const out = await r.respond('q')
    expect(out.reply).toBe('Declined: 不可修复错误 table_not_found')
    expect(out.schema_context).toBe('(no candidates)')
  })

  it('falls back to a generic decline message when no reason is given', async () => {
    hush()
    engineState.result = { ok: false, decline: true, sql: null, trace: [] }
    const r = makeResponder(ctxWith(routingLlm({}), { loadRetrievalCorpusAll: () => [] }))
    expect((await r.respond('q')).reply).toBe('Declined: unable to answer')
  })

  it('reports a pending query', async () => {
    hush()
    engineState.result = { ok: false, decline: false, pending: true, sql: null, trace: [] }
    const r = makeResponder(ctxWith(routingLlm({}), { loadRetrievalCorpusAll: () => [] }))
    expect((await r.respond('q')).reply).toBe('The query is still running; no answer yet.')
  })

  it('uses the engine reason on a bare failure, and No answer when even that is absent', async () => {
    hush()
    engineState.result = { ok: false, decline: false, pending: false, sql: null, reason: 'weird internal state', trace: [] }
    const withReason = makeResponder(ctxWith(routingLlm({}), { loadRetrievalCorpusAll: () => [] }))
    expect((await withReason.respond('q')).reply).toBe('weird internal state')

    engineState.result = { ok: false, decline: false, pending: false, sql: null, trace: [] }
    const noReason = makeResponder(ctxWith(routingLlm({}), { loadRetrievalCorpusAll: () => [] }))
    expect((await noReason.respond('q')).reply).toBe('No answer.')
  })

  it('does not treat a tool-call string or a short string as the reply', async () => {
    hush()
    // A tool-call-shaped sql is long and non-SQL but looksLikeToolCall → not echoed.
    engineState.result = { ok: false, decline: false, pending: false, sql: '{"name":"search_data_sources","arguments":{"q":"x"}}', reason: 'fell through', trace: [] }
    const r = makeResponder(ctxWith(routingLlm({}), { loadRetrievalCorpusAll: () => [] }))
    expect((await r.respond('q')).reply).toBe('fell through')

    // A short non-SQL string (<=20 chars) is not echoed either.
    engineState.result = { ok: false, decline: false, pending: false, sql: 'too short', reason: 'fell through 2', trace: [] }
    const r2 = makeResponder(ctxWith(routingLlm({}), { loadRetrievalCorpusAll: () => [] }))
    expect((await r2.respond('q')).reply).toBe('fell through 2')
  })
})

describe('respond — query expansion, event grounding, and the engine config closures', () => {
  it('wraps retrieval when expansion changes the query, threads the graph, and appends the event block', async () => {
    hush()
    engineState.result = { ok: false, decline: true, sql: null, reason: 'x', trace: [] }
    const corpus = [{ id: 'game.recharge', description: 'recharge', payload: { name: 'game.recharge', params_fields: { amount: {} } } }]
    const schema: SchemaStub = {
      loadRetrievalCorpusAll: () => corpus,
      getRelationGraph: () => ({ edges: [] }),
      loadEventDefinition: (name: string) => ({ name, event_filter: "event = 'game.recharge'" }),
      loadTableDefinition: (name: string) => (name === 'dws_has_parts' ? { partitions: [{ name: 'ds' }, { name: 'hh' }] } : null),
      // A real semanticRoot so extractEventView yields an eventView, exercising the
      // engine-input eventView spread.
      semanticRoot: eventViewRoot(),
    }
    // Expansion returns a string different from the question -> wrapped retrieval.
    const llm = routingLlm({ expansion: 'game.recharge 充值 pay_amt', detection: 'game.recharge' })
    const r = makeResponder(ctxWith(llm, schema), { queryExpansion: true })
    const out = await r.respond('how many game.recharge')
    // eventCtx non-null -> the event schema block is appended, naming the view.
    expect(out.schema_context).toContain('事件数据源（已 pre-fetch，属于本次可用 schema）：')
    expect(out.schema_context).toContain('- 事件名: game.recharge')
    expect(out.schema_context).toContain('- 事件视图表（合法 FROM 目标）: ieu_ods.ods_10000251_all_view')

    // The engine never calls the closures respond() built, so exercise them off the captured config.
    const cfg = engineState.config!
    const retrieval = cfg.retrieval as { retrieve(q: string, opts?: { topK?: number; mode?: string }): readonly unknown[] }
    expect(Array.isArray(retrieval.retrieve('game', { topK: 5, mode: 'bm25-only' }))).toBe(true)
    const lookupDoc = cfg.lookupDoc as (id: string) => unknown
    expect(lookupDoc('game.recharge')).toBe(corpus[0])
    expect(lookupDoc('missing')).toBeUndefined()
    const partitionResolver = cfg.partitionResolver as (t: string) => readonly string[] | null
    expect(partitionResolver('dws_has_parts')).toEqual(['ds', 'hh'])
    expect(partitionResolver('dws_no_parts')).toBeNull()
    // graph was threaded in because getRelationGraph returned a value.
    expect(cfg.graph).toEqual({ edges: [] })
    // Default (non-EXP2) prompt builder is the contextPrefetched closure.
    const promptBuilder = cfg.promptBuilder as (a: unknown) => string
    expect(typeof promptBuilder({ question: 'q', candidates: [], eventDef: null, conventions: null })).toBe('string')
  })

  it('uses buildPromptEN and omits the graph under EXP2_ARM, and skips expansion when disabled', async () => {
    hush()
    const savedArm = process.env.EXP2_ARM
    process.env.EXP2_ARM = 'B'
    try {
      engineState.result = { ok: false, decline: true, sql: null, reason: 'x', trace: [] }
      // No getRelationGraph, no loadTableDefinition on the schema.
      const schema: SchemaStub = { loadRetrievalCorpusAll: () => [] }
      const r = makeResponder(ctxWith(routingLlm({}), schema), { queryExpansion: false })
      await r.respond('q')
      const cfg = engineState.config!
      expect(cfg.promptBuilder).toBe(buildPromptEN)
      expect('graph' in cfg).toBe(false)
      // partitionResolver still returns null when the schema cannot resolve tables.
      const partitionResolver = cfg.partitionResolver as (t: string) => readonly string[] | null
      expect(partitionResolver('anything')).toBeNull()
    } finally {
      if (savedArm === undefined) delete process.env.EXP2_ARM
      else process.env.EXP2_ARM = savedArm
    }
  })
})

describe('buildSchemaContext — candidate rendering (via respond)', () => {
  it('renders table, event, plain, missing, and fallback candidates', async () => {
    hush()
    engineState.result = {
      ok: false, decline: true, sql: null, reason: 'x',
      trace: [{ step: 'bm25_linking', candidates: [{ id: 'tbl_min' }, { id: 'evt_nodesc' }, { id: 'plain_desc' }, { id: 'plain_nodesc' }, { id: 'ghost' }] }],
    }
    const corpus = [
      // Table with no granularity and a column missing type + comment; label from payload.description.
      { id: 'tbl_min', payload: { description: '最小表', columns: [{ name: 'id' }] } },
      // Event whose params field has no description.
      { id: 'evt_nodesc', payload: { params_fields: { raw: {} } } },
      // Plain item with a description.
      { id: 'plain_desc', description: '纯描述项' },
      // Plain item with no description -> falls back to the id.
      { id: 'plain_nodesc', payload: {} },
      // 'ghost' is absent from the corpus -> not found.
    ]
    const r = makeResponder(ctxWith(routingLlm({}), { loadRetrievalCorpusAll: () => corpus }))
    const lines = ((await r.respond('q')).schema_context ?? '').split('\n')
    expect(lines).toContain('- tbl_min: 最小表')
    expect(lines).toContain('  columns: id(?)')
    expect(lines).toContain('- evt_nodesc: evt_nodesc | fields: raw')
    expect(lines).toContain('- plain_desc: 纯描述项')
    expect(lines).toContain('- plain_nodesc: plain_nodesc')
    expect(lines).toContain('- ghost: (not found in corpus)')
  })

  it('prefers table_comment, then description, then id for a table detail label', async () => {
    hush()
    engineState.result = {
      ok: false, decline: true, sql: null, reason: 'x',
      trace: [{ step: 'bm25_linking', candidates: [{ id: 't_desc' }, { id: 't_id' }] }],
    }
    const corpus = [
      // No table_comment -> description.
      { id: 't_desc', payload: { description: '描述作为标签', columns: [{ name: 'c', type: 'string' }] } },
      // Neither table_comment nor description -> the id.
      { id: 't_id', payload: { columns: [{ name: 'c', type: 'bigint' }] } },
    ]
    const r = makeResponder(ctxWith(routingLlm({}), { loadRetrievalCorpusAll: () => corpus }))
    const text = (await r.respond('q')).schema_context
    expect(text).toContain('- t_desc: 描述作为标签')
    expect(text).toContain('- t_id: t_id')
    expect(text).toContain('c(bigint)')
  })
})
