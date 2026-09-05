/**
 * CL-20: open-ended question triage gate — deterministic decline for questions
 * that need clarification before SQL generation. Validates the gate fires for
 * known open-ended patterns and does NOT fire for answerable questions.
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

/**
 * Test LLM that separates triage calls from generation calls.
 * Triage calls contain '只回复一个词' (the triage prompt's instruction);
 * generation calls get a canned SQL response.
 */
class TriageMockLlm implements Llm {
  constructor(private readonly triageAnswer: 'answerable' | 'needs_clarification') {}
  callCount = 0
  triageCallCount = 0

  async generate(args: LlmGenerateArgs): Promise<LlmGenerateResult> {
    this.callCount += 1
    if (args.prompt?.includes('只回复一个词')) {
      this.triageCallCount += 1
      return { sql: this.triageAnswer }
    }
    return { sql: "SELECT COUNT(*) FROM dws_10000251_com_pay_order_df WHERE ds='20260903'" }
  }
}

function makeEngine(triageAnswer: 'answerable' | 'needs_clarification') {
  const llm = new TriageMockLlm(triageAnswer)
  const odps = new StandInOdps({})
  const engine = new Nl2sqlEngine({ dataSources: DS, llm, odps })
  return { engine, llm }
}

describe('CL-20 open-ended triage gate', () => {
  // --- DECLINE cases: triage returns needs_clarification ---

  const SHOULD_DECLINE = [
    { id: '079', q: '卡牌平衡性怎么样', reason: '主观判断词（平衡性）' },
    { id: '080', q: '经济系统健康吗', reason: '主观判断词（健康）' },
    { id: 'voice_033', q: '该不该加一波限时礼包', reason: '运营决策建议' },
    { id: 'voice_036', q: '当前卡池还值得继续开吗', reason: '主观判断（值不值得）' },
    { id: 'voice_041', q: '最近数据有什么异常吗', reason: '范围过宽' },
    { id: 'voice_048', q: '这个月运营数据总结一下', reason: '综合总结' },
  ]

  for (const { id, q, reason } of SHOULD_DECLINE) {
    test(`decline: ${id} — ${reason}`, async () => {
      const { engine, llm } = makeEngine('needs_clarification')
      const r = await engine.run({ question: q, eventDef: EV })
      expect(r.decline).toBe(true)
      expect(r.declineKind).toBe('open_ended_question')
      expect(r.ok).toBe(false)
      expect(llm.triageCallCount).toBe(1)
      expect(r.trace.some(t => t.step === 'open_ended_triage')).toBe(true)
    })
  }

  // --- PASS-THROUGH cases: triage returns answerable ---

  const SHOULD_PASS_THROUGH = [
    { id: '073', q: '游戏收入最近表现怎么样', reason: '有隐含指标（收入→pay_amt）' },
    { id: '076', q: '服务器之间有没有不平衡的情况', reason: '有隐含维度（服务器×角色数）' },
    { id: '077', q: '玩家留存有什么问题吗', reason: '有隐含指标（留存→次留/7留）' },
    { id: 'normal', q: '昨天充值了多少钱', reason: '明确指标查询' },
  ]

  for (const { id, q, reason } of SHOULD_PASS_THROUGH) {
    test(`pass-through: ${id} — ${reason}`, async () => {
      const { engine, llm } = makeEngine('answerable')
      const r = await engine.run({ question: q, eventDef: EV })
      // The triage should NOT trigger — declineKind must NOT be open_ended_question.
      // (The engine may still decline for other reasons — e.g. StandInOdps has no
      // matching scripted outcome — but that's unrelated to the triage gate.)
      expect(r.declineKind).not.toBe('open_ended_question')
      expect(llm.triageCallCount).toBe(1)
      expect(r.trace.some(t => t.step === 'open_ended_triage')).toBe(false)
      // Generation loop was entered (triage didn't short-circuit)
      expect(r.trace.some(t => t.step === 'llm_generate')).toBe(true)
    })
  }

  // --- When triage says answerable, generation proceeds ---

  test('triage answerable → generation loop executes', async () => {
    const { engine, llm } = makeEngine('answerable')
    const r = await engine.run({ question: '昨天充值了多少钱', eventDef: EV })
    // Should have triage call + at least one generation call
    expect(llm.triageCallCount).toBe(1)
    expect(llm.callCount).toBeGreaterThan(1)
    expect(r.trace.some(t => t.step === 'llm_generate')).toBe(true)
  })

  // --- When triage says needs_clarification, no generation calls ---

  test('triage needs_clarification → no generation, immediate decline', async () => {
    const { engine, llm } = makeEngine('needs_clarification')
    const r = await engine.run({ question: '经济系统健康吗', eventDef: EV })
    expect(r.decline).toBe(true)
    expect(r.declineKind).toBe('open_ended_question')
    // Only the triage call, no generation calls
    expect(llm.triageCallCount).toBe(1)
    expect(llm.callCount).toBe(1)
    expect(r.trace.some(t => t.step === 'llm_generate')).toBe(false)
  })
})
