/// <reference types="node" />
/**
 * `expandQuery` and the detection half of `Nl2sqlAgentResponder`
 * (`completeDetection` + `loadEventContext`), all driven against a real Context
 * with `llm` stubbed via `ctx.provide(...)` and a structural `schema` seam —
 * the responder takes both as constructor / call inputs, so no real plugin
 * mounts are needed. `completeDetection` / `loadEventContext` are module-private
 * methods reached through a typed cast.
 *
 *  - expandQuery: the no-LLM early return (unmounted, and mounted-without-stream),
 *    the EXP2_ARM English-prompt arm, the newline-flattening happy path, the
 *    empty-expansion fallback, and the swallow-and-[DIAG] catch.
 *  - completeDetection: text preferred, reasoning fallback when there is no text.
 *  - loadEventContext: the per-question cache, the unmounted-schema and
 *    no-event outcomes, the event-view enrichment (real extractEventView over a
 *    temp config.yaml, and the semanticRoot-absent → undefined arm), and the
 *    definition-not-found path.
 *
 * Run: npx vitest run packages/eval/eval-cli/tests/context-responder-detect.spec.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { expandQuery, Nl2sqlAgentResponder, type EventContext, type SchemaSeam } from '../src/context.ts'
import type { CorpusItemLike } from '../src/event-detect.ts'

/** A stub `ctx.llm.stream` yielding a text block and/or a reasoning block, then finish. */
function streamOf(parts: { text?: string; reasoning?: string }) {
  const chunks: StreamChunk[] = []
  let index = 0
  if (parts.text !== undefined) {
    chunks.push({ type: 'block-start', index, blockType: 'text' })
    chunks.push({ type: 'text-delta', index, text: parts.text })
    chunks.push({ type: 'block-end', index, block: { type: 'text', text: parts.text } })
    index++
  }
  if (parts.reasoning !== undefined) {
    chunks.push({ type: 'block-start', index, blockType: 'reasoning' })
    chunks.push({ type: 'reasoning-delta', index, text: parts.reasoning })
    chunks.push({ type: 'block-end', index, block: { type: 'reasoning', text: parts.reasoning } })
    index++
  }
  chunks.push({ type: 'finish', reason: { kind: 'stop' } })
  return async function* (): AsyncIterable<StreamChunk> {
    for (const chunk of chunks) yield chunk
  }
}

/** A `Context` whose `llm` service streams the given blocks (or throws when iterated). */
function llmCtx(llm: unknown): Context {
  const ctx = new Context()
  ;(ctx as unknown as { provide(k: string, v: unknown): void }).provide('llm', llm)
  return ctx
}

/** The private detection surface of the responder, reached by cast. */
interface DetectionInternals {
  completeDetection(prompt: string): Promise<string>
  loadEventContext(schema: SchemaSeam | undefined, corpus: readonly CorpusItemLike[], question: string): Promise<EventContext | null>
}
function internals(r: Nl2sqlAgentResponder): DetectionInternals {
  return r as unknown as DetectionInternals
}
function responder(ctx: Context): Nl2sqlAgentResponder {
  return new Nl2sqlAgentResponder(ctx, '20260101', 'aga', 'qwen3.7-max', false, 'k11', true)
}

/** An event-shaped corpus item so the lexical prefilter keeps `game.recharge`. */
const EVENT_CORPUS: CorpusItemLike[] = [{
  id: 'game.recharge',
  description: 'recharge success event',
  payload: { name: 'game.recharge', event_filter: "event = 'game.recharge'", params_fields: { amount: { type: 'double' } } },
}]

const tmpDirs: string[] = []
function semanticRootWithEventView(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'crd-sem-')))
  tmpDirs.push(dir)
  writeFileSync(join(dir, 'config.yaml'), [
    'event_view:',
    '  full_name: ieu_ods.ods_10000251_all_view',
    "  params_extract_template: \"GET_JSON_OBJECT(params,'$.{field_name}')\"",
    '  base_columns:',
    '    core:',
    '      - name: dt',
    '      - name: event',
  ].join('\n') + '\n')
  return dir
}

let envArm: string | undefined
let envArmSaved = false
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true })
  if (envArmSaved) {
    if (envArm === undefined) delete process.env.EXP2_ARM
    else process.env.EXP2_ARM = envArm
    envArmSaved = false
  }
  vi.restoreAllMocks()
})
/** Set EXP2_ARM for one test, remembering the original for afterEach to restore. */
function setArm(value: string): void {
  envArm = process.env.EXP2_ARM
  envArmSaved = true
  process.env.EXP2_ARM = value
}
/** Capture the [DIAG] stderr the detection/expansion paths emit; restored by vi.restoreAllMocks. */
function hushStderr(): string[] {
  const lines: string[] = []
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')) })
  return lines
}

describe('expandQuery', () => {
  it('returns the question unchanged when no llm service is mounted', async () => {
    expect(await expandQuery(new Context(), 'ARPPU 是多少')).toBe('ARPPU 是多少')
  })

  it('returns the question unchanged when the llm has no stream method', async () => {
    expect(await expandQuery(llmCtx({}), 'ARPPU 是多少')).toBe('ARPPU 是多少')
  })

  it('returns the expanded terms, flattening newlines to spaces', async () => {
    const ctx = llmCtx({ stream: streamOf({ text: 'ARPPU ARPU 人均付费\npay_amt acc_summary' }) })
    expect(await expandQuery(ctx, 'ARPPU 是多少')).toBe('ARPPU ARPU 人均付费 pay_amt acc_summary')
  })

  it('falls back to the question when the expansion is empty', async () => {
    expect(await expandQuery(llmCtx({ stream: streamOf({ text: '   ' }) }), 'ARPPU 是多少')).toBe('ARPPU 是多少')
  })

  it('uses the English expansion prompt under EXP2_ARM=B and still returns the expansion', async () => {
    setArm('b')
    const ctx = llmCtx({ stream: streamOf({ text: 'daily active users dau' }) })
    expect(await expandQuery(ctx, 'how many DAU')).toBe('daily active users dau')
  })

  it('swallows a thrown Error, logs [DIAG] with its message, and falls back', async () => {
    const diag = hushStderr()
    const ctx = llmCtx({ stream: () => { throw new Error('transport down') } })
    expect(await expandQuery(ctx, 'ARPPU 是多少')).toBe('ARPPU 是多少')
    expect(diag.join('\n')).toContain('[DIAG] expandQuery failed: transport down')
  })

  it('stringifies a thrown non-Error in the [DIAG] line and falls back', async () => {
    const diag = hushStderr()
    const ctx = llmCtx({ stream: () => { throw 'raw expand failure' } })
    expect(await expandQuery(ctx, 'ARPPU 是多少')).toBe('ARPPU 是多少')
    expect(diag.join('\n')).toContain('[DIAG] expandQuery failed: raw expand failure')
  })
})

describe('Nl2sqlAgentResponder.completeDetection', () => {
  it('returns the trimmed text block when present', async () => {
    const r = responder(llmCtx({ stream: streamOf({ text: '  game.recharge \n' }) }))
    expect(await internals(r).completeDetection('detect?')).toBe('game.recharge')
  })

  it('constructs the real ODPS adapter under --with-query and still detects', async () => {
    // withQuery:true selects CtxOdpsAdapter over StandInOdps in the constructor.
    const withQuery = new Nl2sqlAgentResponder(
      llmCtx({ stream: streamOf({ text: 'game.recharge' }) }), '20260101', 'aga', 'qwen3.7-max', true, 'k11', true,
    )
    expect(await internals(withQuery).completeDetection('detect?')).toBe('game.recharge')
  })

  it('falls back to the reasoning block when there is no text', async () => {
    const r = responder(llmCtx({ stream: streamOf({ reasoning: '  game.login  ' }) }))
    expect(await internals(r).completeDetection('detect?')).toBe('game.login')
  })
})

describe('Nl2sqlAgentResponder.loadEventContext', () => {
  it('returns null when the schema seam cannot load event definitions', async () => {
    const r = responder(llmCtx({ stream: streamOf({ text: 'game.recharge' }) }))
    expect(await internals(r).loadEventContext({}, EVENT_CORPUS, 'how many game.recharge today')).toBeNull()
  })

  it('returns null when no candidate event matches the question', async () => {
    // The prefilter finds nothing, so detection never calls the LLM.
    const r = responder(llmCtx({ stream: streamOf({ text: 'game.recharge' }) }))
    const schema: SchemaSeam = { loadEventDefinition: () => ({ name: 'x' }) }
    expect(await internals(r).loadEventContext(schema, EVENT_CORPUS, '昨天的 DAU 是多少')).toBeNull()
  })

  it('enriches with the projected definition and the extracted event view', async () => {
    hushStderr()
    const root = semanticRootWithEventView()
    const r = responder(llmCtx({ stream: streamOf({ text: 'game.recharge' }) }))
    const schema: SchemaSeam = {
      loadEventDefinition: (name: string) => ({ name, event_filter: "event = 'game.recharge'", params_fields: { amount: { type: 'double' } }, confirmation: 'confirmed' }),
      semanticRoot: root,
    }
    const ctx = await internals(r).loadEventContext(schema, EVENT_CORPUS, 'how many game.recharge today')
    expect(ctx?.eventDef).toEqual({ name: 'game.recharge', event_filter: "event = 'game.recharge'", params_fields: { amount: { type: 'double' } } })
    expect(ctx?.eventView?.full_name).toBe('ieu_ods.ods_10000251_all_view')
    expect(ctx?.eventView?.base_columns).toEqual(['dt', 'event'])
  })

  it('omits the event view when the schema reports no semanticRoot', async () => {
    hushStderr()
    const r = responder(llmCtx({ stream: streamOf({ text: 'game.recharge' }) }))
    const schema: SchemaSeam = { loadEventDefinition: (name: string) => ({ name }) }
    const ctx = await internals(r).loadEventContext(schema, EVENT_CORPUS, 'how many game.recharge today')
    expect(ctx?.eventDef).toEqual({ name: 'game.recharge' })
    expect(ctx?.eventView).toBeUndefined()
  })

  it('returns null when the detected event has no definition', async () => {
    hushStderr()
    const r = responder(llmCtx({ stream: streamOf({ text: 'game.recharge' }) }))
    const schema: SchemaSeam = { loadEventDefinition: () => undefined }
    expect(await internals(r).loadEventContext(schema, EVENT_CORPUS, 'how many game.recharge today')).toBeNull()
  })

  it('caches the result per question, loading the definition only once', async () => {
    hushStderr()
    let loads = 0
    const r = responder(llmCtx({ stream: streamOf({ text: 'game.recharge' }) }))
    const schema: SchemaSeam = { loadEventDefinition: (name: string) => { loads++; return { name } } }
    const q = 'how many game.recharge today'
    const first = await internals(r).loadEventContext(schema, EVENT_CORPUS, q)
    const second = await internals(r).loadEventContext(schema, EVENT_CORPUS, q)
    expect(second).toBe(first)
    expect(loads).toBe(1)
  })
})
