/**
 * CL-20: capability triage gate — deterministic decline for requests whose
 * DELIVERABLE no single query can produce (report / forecast / recommendation).
 *
 * Deliberately does NOT gate on vagueness or subjectivity: that boundary is not
 * self-consistent in the k11-v2 case set (`076 服务器之间有没有不平衡` expects SQL
 * while `079 卡牌平衡性怎么样` expects a refusal — same word stem, opposite ground
 * truth), so a classifier drawn there only trades one error class for another.
 * Deliverable-kind transfers across business domains without a vocabulary list.
 *
 * Run: `pnpm vitest run packages/data/nl2sql-engine/tests/open-ended-triage.spec.ts`
 */
import { describe, test, expect } from 'vitest'
import { Nl2sqlEngine } from '../src/engine.ts'
import { StandInOdps } from '../src/stand-in-odps.ts'
import { FIXTURE_DATA_SOURCES, FIXTURE_EVENT_DEF } from '../src/eval/cases.ts'
import type { Llm, LlmGenerateArgs, LlmGenerateResult } from '../src/replay-llm.ts'

const DS = FIXTURE_DATA_SOURCES
const EV = FIXTURE_EVENT_DEF

/** Marker unique to the triage prompt, used to route the mock's two roles. */
const TRIAGE_MARKER = 'beyond_single_query or data_request'

/**
 * Test LLM separating triage calls from generation calls: the triage prompt is
 * identified by its final instruction line, generation gets canned SQL.
 */
class TriageMockLlm implements Llm {
  constructor(private readonly verdict: 'beyond_single_query' | 'data_request') {}
  callCount = 0
  triageCallCount = 0

  async generate(args: LlmGenerateArgs): Promise<LlmGenerateResult> {
    this.callCount += 1
    if (args.prompt?.includes(TRIAGE_MARKER)) {
      this.triageCallCount += 1
      return { sql: this.verdict }
    }
    return { sql: "SELECT COUNT(*) FROM dws_pay_order_di WHERE ds='20260903'" }
  }
}

function makeEngine(verdict: 'beyond_single_query' | 'data_request') {
  const llm = new TriageMockLlm(verdict)
  const engine = new Nl2sqlEngine({ dataSources: DS, llm, odps: new StandInOdps({}) })
  return { engine, llm }
}

describe('CL-20 capability triage gate', () => {
  // --- Deliverable is beyond a single query → decline before generation ---

  const BEYOND = [
    { id: 'voice_048', q: '这个月运营数据总结一下', kind: '综合总结' },
    { id: 'voice_044', q: '帮我出个周报', kind: '周期报告' },
    { id: 'voice_045', q: '预测一下下周的充值能到多少', kind: '预测' },
    { id: 'voice_047', q: '有什么提升收入的方法吗', kind: '策略建议' },
    { id: 'voice_033', q: '该不该加一波限时礼包', kind: '决策建议' },
  ]

  for (const { id, q, kind } of BEYOND) {
    test(`decline: ${id}（${kind}）`, async () => {
      const { engine, llm } = makeEngine('beyond_single_query')
      const r = await engine.run({ question: q, eventDef: EV })
      expect(r.ok).toBe(false)
      expect(r.decline).toBe(true)
      expect(r.declineKind).toBe('open_ended_question')
      expect(r.trace.some(t => t.step === 'capability_triage')).toBe(true)
      // Gate fires BEFORE generation — no generation call is made at all
      expect(llm.triageCallCount).toBe(1)
      expect(llm.callCount).toBe(1)
      expect(r.trace.some(t => t.step === 'llm_generate')).toBe(false)
    })
  }

  // --- Data requests proceed to generation, including vague/subjective ones ---

  const DATA_REQUESTS = [
    { id: '073', q: '游戏收入最近表现怎么样', why: '模糊但要数值' },
    { id: '076', q: '服务器之间有没有不平衡的情况', why: '主观措辞但期望 SQL（不可误伤）' },
    { id: '077', q: '玩家留存有什么问题吗', why: '模糊但期望 SQL' },
    { id: '079', q: '卡牌平衡性怎么样', why: '主观——本门禁刻意不管，留给 §5' },
    { id: 'exec', q: '昨天充值了多少钱', why: '明确指标' },
  ]

  for (const { id, q, why } of DATA_REQUESTS) {
    test(`pass-through: ${id}（${why}）`, async () => {
      const { engine, llm } = makeEngine('data_request')
      const r = await engine.run({ question: q, eventDef: EV })
      // The capability gate must not claim this one. (The engine may still
      // decline downstream — StandInOdps has no scripted outcome — but never
      // via this gate.)
      expect(r.declineKind).not.toBe('open_ended_question')
      expect(r.trace.some(t => t.step === 'capability_triage')).toBe(false)
      // Generation was entered
      expect(llm.triageCallCount).toBe(1)
      expect(r.trace.some(t => t.step === 'llm_generate')).toBe(true)
    })
  }

  // --- Scope guard: the gate is deliverable-kind, not vagueness ---

  test('门禁不判模糊性：主观问题在 data_request 下照常进生成', async () => {
    const { engine } = makeEngine('data_request')
    for (const q of ['经济系统健康吗', '卡牌平衡性怎么样', '数据看起来正常吗']) {
      const r = await engine.run({ question: q, eventDef: EV })
      expect(r.declineKind).not.toBe('open_ended_question')
    }
  })

  test('triage 只调一次，与生成重试次数无关', async () => {
    const { engine, llm } = makeEngine('data_request')
    await engine.run({ question: '昨天充值了多少钱', eventDef: EV })
    expect(llm.triageCallCount).toBe(1)
  })
})
