/**
 * GA-EVAL-EVENTDEF-PREFETCH — the deterministic half of the event detector's
 * safety contract.
 *
 * `src/event-detect.ts` ships on one property (`dev/event-detect-fp-probe.ts`):
 * it must never route a DWS question to an event definition, because injecting
 * an event definition for a summary-table question steers the model onto the
 * event view and returns a plausible wrong value the semantic judge accepts.
 * The live half of that property — a real model's judgement — cannot be unit
 * tested and stays in the probe. What is pinned HERE is the half the probe
 * assumes is fixed:
 *
 *  - which corpus items can even become candidates (`params_fields` is the
 *    event marker; a 1-character alias is not evidence of anything),
 *  - what the detection prompt literally says, including the description budget
 *    that keeps it bounded,
 *  - that a reply is only ever mapped back onto a name the pre-filter actually
 *    offered, and never onto a prefix-sibling,
 *  - that a failed detection call degrades to "no event", never to an error.
 *
 * `detectEventName` takes its corpus and its completion through
 * `DetectEventDeps`, so every case below injects a plain fake — no module
 * mocking is involved anywhere in this file.
 *
 * Run: npx vitest run packages/eval/eval-cli/tests/event-detect.spec.ts
 */
import { describe, expect, it } from 'vitest'
import {
  NO_EVENT,
  buildDetectionPrompt,
  detectEventName,
  parseDetectionReply,
  prefilterEventCandidates,
  type CorpusItemLike,
  type DetectEventDeps,
  type EventCandidate,
} from '../src/event-detect.ts'

/** Build a corpus item with an arbitrary (deliberately unvalidated) payload. */
function item(id: string, payload: unknown): CorpusItemLike {
  return { id, payload }
}

/** The recharge event as the semantic layer emits it, minus the fields this module ignores. */
const RECHARGE = item('event:game.recharge', {
  name: 'game.recharge',
  description: '充值成功事件',
  event_filter: "event = 'game.recharge'",
  alt_labels: ['充值', '氪金'],
  params_fields: { amount: 'double' },
})

/** What `RECHARGE` must reduce to for a question containing 「充值」. */
const RECHARGE_CANDIDATE: EventCandidate = {
  name: 'game.recharge',
  description: '充值成功事件',
  eventFilter: "event = 'game.recharge'",
  matchedPhrases: ['充值'],
}

const RECHARGE_QUESTION = '昨天充值总金额是多少（事件级，排除沙盒）？'

describe('prefilterEventCandidates — the params_fields event marker', () => {
  it('yields the event name, description, filter and matched phrase for a lexical hit', () => {
    expect(prefilterEventCandidates([RECHARGE], RECHARGE_QUESTION)).toEqual([RECHARGE_CANDIDATE])
  })

  it('skips items whose payload is not a non-null object', () => {
    // A table item's payload is a string id in some corpora, and `typeof null`
    // is 'object' — both must be rejected before the payload is read.
    const corpus = [
      item('string-payload', '充值'),
      item('number-payload', 42),
      item('null-payload', null),
      { id: 'no-payload-key' },
    ]
    expect(prefilterEventCandidates(corpus, RECHARGE_QUESTION)).toEqual([])
  })

  it('skips object payloads whose params_fields is absent, non-object or null', () => {
    // `params_fields` is the probe that marks a corpus item as an event; a DWS
    // table item carries alt_labels too, so the marker is the only gate.
    const corpus = [
      item('no-params', { name: 'dws.recharge.day', alt_labels: ['充值'] }),
      item('string-params', { name: 'dws.pay.day', alt_labels: ['充值'], params_fields: 'amount' }),
      item('null-params', { name: 'dws.pay.sum', alt_labels: ['充值'], params_fields: null }),
    ]
    expect(prefilterEventCandidates(corpus, RECHARGE_QUESTION)).toEqual([])
  })
})

describe('prefilterEventCandidates — lexical stage', () => {
  it('falls back to the corpus item id when the payload name is not a string', () => {
    const corpus = [item('game.coin.change', { name: 42, params_fields: {} })]
    expect(prefilterEventCandidates(corpus, '昨天 game.coin.change 发生了多少次？')).toEqual([
      { name: 'game.coin.change', description: '', eventFilter: '', matchedPhrases: ['game.coin.change'] },
    ])
  })

  it('drops an event that has neither a payload name nor an item id', () => {
    // An unnamed event could never be loaded by `loadEventDefinition`, so it
    // must not reach the prompt even though its alias matched.
    const corpus = [
      { id: '', payload: { name: '', alt_labels: ['充值'], params_fields: {} } },
      RECHARGE,
    ]
    expect(prefilterEventCandidates(corpus, RECHARGE_QUESTION).map(c => c.name)).toEqual(['game.recharge'])
  })

  it('requires a phrase of at least 2 characters — 「充」 is not evidence, 「充值」 is', () => {
    const corpus = [
      item('one.char', { name: 'one.char', alt_labels: ['充'], params_fields: {} }),
      item('two.char', { name: 'two.char', alt_labels: ['充值'], params_fields: {} }),
    ]
    // The question contains 「充」 (inside 「充值」) for both items; only the
    // 2-character alias may count.
    expect(prefilterEventCandidates(corpus, RECHARGE_QUESTION).map(c => c.name)).toEqual(['two.char'])
  })

  it('ignores a non-array alt_labels and skips non-string entries inside one', () => {
    // `{ length: 99 }` is the interesting entry: without the `typeof label ===
    // 'string'` guard it clears the length test and then throws on
    // `.toLowerCase()`, so this case fails loudly if the guard is removed.
    const corpus = [
      item('labels.not.array', { name: 'labels.not.array', alt_labels: '充值', params_fields: {} }),
      item('labels.mixed', { name: 'labels.mixed', alt_labels: ['充值', 7, null, { length: 99 }], params_fields: {} }),
    ]
    expect(prefilterEventCandidates(corpus, RECHARGE_QUESTION)).toEqual([
      { name: 'labels.mixed', description: '', eventFilter: '', matchedPhrases: ['充值'] },
    ])
  })

  it('matches case-insensitively and reports each matched phrase once', () => {
    const corpus = [
      item('dup', { name: 'game.recharge', alt_labels: ['game.recharge', '充值'], params_fields: {} }),
    ]
    expect(prefilterEventCandidates(corpus, '统计 GAME.RECHARGE 的充值次数')).toEqual([
      { name: 'game.recharge', description: '', eventFilter: '', matchedPhrases: ['game.recharge', '充值'] },
    ])
  })

  it('defaults description and eventFilter to empty strings when the payload fields are not strings', () => {
    const corpus = [item('x', { name: 'game.item.change', description: 42, event_filter: null, params_fields: {} })]
    expect(prefilterEventCandidates(corpus, '昨天 game.item.change 多少条？')).toEqual([
      { name: 'game.item.change', description: '', eventFilter: '', matchedPhrases: ['game.item.change'] },
    ])
  })

  it('skips an event whose name and aliases are all absent from the question', () => {
    const corpus = [item('miss', { name: 'game.card.gacha', alt_labels: ['十连'], params_fields: {} })]
    expect(prefilterEventCandidates(corpus, '昨天充值总金额是多少？')).toEqual([])
  })

  it('name-sorts the hits and keeps only the first 8', () => {
    // Fed in reverse order: without the sort the cut would keep ev-j…ev-c, and
    // without the cut all ten would reach the prompt.
    const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    const corpus = [...letters].reverse().map(l => item(`ev-${l}`, { name: `ev-${l}`, params_fields: {} }))
    const question = letters.map(l => `ev-${l}`).join(' ')
    expect(prefilterEventCandidates(corpus, question).map(c => c.name)).toEqual([
      'ev-a', 'ev-b', 'ev-c', 'ev-d', 'ev-e', 'ev-f', 'ev-g', 'ev-h',
    ])
  })
})

describe('buildDetectionPrompt', () => {
  it('exports NONE as the no-event reply the prompt instructs the model to use', () => {
    // Every literal 'NONE' asserted below is this constant interpolated.
    expect(NO_EVENT).toBe('NONE')
  })

  it('renders one line per candidate, bracketing the event filter only when there is one', () => {
    const prompt = buildDetectionPrompt('昨天充值总金额是多少？', [
      { name: 'game.recharge', description: '充值', eventFilter: "event='game.recharge'", matchedPhrases: ['充值', '氪金'] },
      { name: 'game.role.create', description: '', eventFilter: '', matchedPhrases: ['创角'] },
    ])
    expect(prompt).toContain(
      '# 候选事件（词法预筛结果；只能从中选，或选 NONE）\n'
      + "- game.recharge [event='game.recharge']（命中词：充值、氪金）：充值\n"
      + '- game.role.create（命中词：创角）：\n'
      + '\n# 示例',
    )
  })

  it('embeds the question verbatim and closes with the one-line NONE instruction', () => {
    const prompt = buildDetectionPrompt('昨天创角的新增角色数是多少？', [RECHARGE_CANDIDATE])
    expect(prompt).toContain(
      '# 用户问题\n昨天创角的新增角色数是多少？\n\n只输出一行：事件名 或 NONE。不要解释，不要输出其他任何内容。',
    )
  })

  it('truncates a description longer than the 160-char budget and marks the cut', () => {
    const prompt = buildDetectionPrompt('q', [
      { name: 'e.long', description: 'x'.repeat(161), eventFilter: '', matchedPhrases: ['p1'] },
    ])
    expect(prompt).toContain(`- e.long（命中词：p1）：${'x'.repeat(160)}…\n\n# 示例`)
    expect(prompt).not.toContain('x'.repeat(161))
  })

  it('keeps a description of exactly 160 chars verbatim', () => {
    const exact = 'y'.repeat(160)
    const prompt = buildDetectionPrompt('q', [
      { name: 'e.exact', description: exact, eventFilter: '', matchedPhrases: ['p1'] },
    ])
    expect(prompt).toContain(`- e.exact（命中词：p1）：${exact}\n\n# 示例`)
    // '…' occurs nowhere else in the prompt template, so its absence proves the
    // budget is exclusive at 160.
    expect(prompt).not.toContain('…')
  })
})

describe('parseDetectionReply', () => {
  const candidates: readonly EventCandidate[] = [
    RECHARGE_CANDIDATE,
    { name: 'game.role.create', description: '创角', eventFilter: '', matchedPhrases: ['创角'] },
  ]

  it('reads NONE as "not an event", case-insensitively', () => {
    expect(parseDetectionReply('NONE', candidates)).toBeNull()
    expect(parseDetectionReply('none\n', candidates)).toBeNull()
  })

  it('reads a blank reply as "not an event" rather than throwing', () => {
    expect(parseDetectionReply('   \n  \n', candidates)).toBeNull()
  })

  it('returns the candidate named on the first line, stripped of quoting and punctuation', () => {
    expect(parseDetectionReply('`game.recharge`。\n（因为问的是充值事件）', candidates)).toBe('game.recharge')
    expect(parseDetectionReply('  game.role.create  ', candidates)).toBe('game.role.create')
  })

  it('recovers a candidate name wrapped in stray prose', () => {
    expect(parseDetectionReply('事件：game.role.create', candidates)).toBe('game.role.create')
  })

  it('refuses a name the pre-filter never offered', () => {
    expect(parseDetectionReply('game.item.change', candidates)).toBeNull()
  })

  it('refuses a prefix of a candidate name, which would load the wrong sibling event', () => {
    expect(parseDetectionReply('game.role', candidates)).toBeNull()
  })
})

describe('detectEventName', () => {
  it('returns no event and never calls the model when nothing matched lexically', async () => {
    const prompts: string[] = []
    const deps: DetectEventDeps = {
      corpus: [RECHARGE],
      complete: (prompt) => {
        prompts.push(prompt)
        return Promise.resolve('game.recharge')
      },
    }
    expect(await detectEventName(deps, '最近7天的日均付费率是多少？')).toEqual({ eventName: null, candidates: [] })
    expect(prompts).toEqual([])
  })

  it('hands the built prompt to the injected completion and maps the reply onto a candidate', async () => {
    const prompts: string[] = []
    const deps: DetectEventDeps = {
      corpus: [RECHARGE],
      complete: (prompt) => {
        prompts.push(prompt)
        return Promise.resolve('game.recharge\n')
      },
    }
    expect(await detectEventName(deps, RECHARGE_QUESTION)).toEqual({
      eventName: 'game.recharge',
      candidates: [RECHARGE_CANDIDATE],
    })
    expect(prompts).toHaveLength(1)
    expect(prompts.join('')).toContain("- game.recharge [event = 'game.recharge']（命中词：充值）：充值成功事件")
    expect(prompts.join('')).toContain(`# 用户问题\n${RECHARGE_QUESTION}\n`)
  })

  it('keeps the candidates but picks nothing when the model answers NONE', async () => {
    const deps: DetectEventDeps = { corpus: [RECHARGE], complete: () => Promise.resolve('NONE') }
    expect(await detectEventName(deps, RECHARGE_QUESTION)).toEqual({
      eventName: null,
      candidates: [RECHARGE_CANDIDATE],
    })
  })

  it('degrades to no event — not an error — when the detection call fails', async () => {
    // Detection is an enrichment, never a gate: a 503 must reproduce the
    // pre-detection behaviour instead of failing the eval case.
    const deps: DetectEventDeps = {
      corpus: [RECHARGE],
      complete: () => Promise.reject(new Error('detection model 503')),
    }
    expect(await detectEventName(deps, RECHARGE_QUESTION)).toEqual({
      eventName: null,
      candidates: [RECHARGE_CANDIDATE],
    })
  })
})
