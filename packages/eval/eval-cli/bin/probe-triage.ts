#!/usr/bin/env node --import tsx/esm
/**
 * CL-20 live probe for the capability-triage gate (`triageQuestion`,
 * packages/data/nl2sql-engine/src/engine.ts).
 *
 * Why this exists. The gate's unit tests
 * (packages/data/nl2sql-engine/tests/open-ended-triage.spec.ts) feed the
 * classifier a MOCKED verdict, so they pin the plumbing — gate fires before
 * generation, sets `declineKind`, costs one call — but assert nothing about
 * whether the prompt classifies a given question the way we intend. That gap is
 * how `052 最近7天每天的商店销售额`, an unambiguous data request, shipped with a
 * 3-in-5 false-positive rate: no mocked test can fail for a prompt-wording bug.
 *
 * This probe closes the gap by running the REAL prompt against the REAL model N
 * times per question and reporting the observed fire rate against the intended
 * verdict. It also removes the need to infer gate firing from latency (the route
 * the CL-20 session had to take, because eval artefacts do not persist the
 * trace): here the engine's own `trace` is read directly, so a fire is observed,
 * not guessed.
 *
 * Cost: exactly one LLM round-trip per iteration. Generation calls are
 * short-circuited with canned SQL, so a pass-through verdict does not go on to
 * spend a real generation call.
 *
 * Run (requires ~/.dsh/.credentials.yaml):
 *   node --import tsx/esm packages/eval/eval-cli/bin/probe-triage.ts
 *   REPS=5 node --import tsx/esm packages/eval/eval-cli/bin/probe-triage.ts
 *   node --import tsx/esm packages/eval/eval-cli/bin/probe-triage.ts 052 voice_044
 *
 * Exit code is 1 when any case's observed verdict disagrees with the intended
 * one on any repetition, so it can gate a change to the triage prompt.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime, BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import * as llmDashscope from '@deepseek-ai/dsh-llm-dashscope'
import { LocalCredentialProvider } from '@deepseek-ai/dsh-credentials-local'
import {
  Nl2sqlEngine,
  StandInOdps,
  FIXTURE_DATA_SOURCES,
  FIXTURE_EVENT_DEF,
  type Llm,
  type LlmGenerateArgs,
  type LlmGenerateResult,
} from '@deepseek-ai/dsh-nl2sql-engine'

/** Unique to the triage prompt's final instruction — routes the adapter's two roles. */
const TRIAGE_MARKER = 'beyond_single_query or data_request'

/** Canned generation answer: generation must never reach the network here. */
const CANNED_SQL = "SELECT COUNT(*) FROM dws_pay_order_di WHERE ds='20260903'"

type Verdict = 'gate' | 'pass'

interface ProbeCase {
  readonly id: string
  readonly q: string
  /** The verdict the gate is designed to reach — see `why`. */
  readonly expect: Verdict
  readonly why: string
}

/**
 * The 11 cases the CL-20 follow-up must hold, plus extra `052`-shaped requests.
 *
 * `expect: 'gate'` are the 7 k11-v2 cases the gate is intended to intercept;
 * `expect: 'pass'` are the 3 that must reach generation plus the multi-day
 * itemized shapes that regressed. The DAILY_* entries are not k11-v2 cases —
 * they are paraphrases of `052`'s shape, included because a single case cannot
 * show whether the fix generalises past the one question that exposed the bug.
 */
const CASES: readonly ProbeCase[] = [
  // ── must reach generation (false positive here = user-visible regression) ──
  { id: '052', q: '最近7天每天的商店销售额', expect: 'pass', why: '多日逐日明细（本次修复目标，曾 3/5 误伤）' },
  { id: '073', q: '游戏收入最近表现怎么样', expect: 'pass', why: '模糊但要数值' },
  { id: '076', q: '服务器之间有没有不平衡的情况', expect: 'pass', why: '主观措辞但期望 SQL' },
  { id: '077', q: '玩家留存有什么问题吗', expect: 'pass', why: '模糊但期望 SQL' },
  { id: 'DAILY_dau', q: '最近30天每天的活跃用户数', expect: 'pass', why: '同形态泛化：跨月逐日' },
  { id: 'DAILY_month', q: '这个月每天的充值金额', expect: 'pass', why: '同形态泛化：「这个月」+逐日（词法最贴近「月报」）' },
  { id: 'DAILY_week', q: '上周每天的订单量', expect: 'pass', why: '同形态泛化：「上周」+逐日（词法最贴近「周报」）' },
  { id: 'DAILY_item', q: '各个渠道昨天的新增用户数', expect: 'pass', why: '同形态泛化：逐项而非逐日' },
  // ── must be intercepted (regression here = losing the delivered capability) ──
  { id: 'voice_033', q: '该不该加一波限时礼包', expect: 'gate', why: '决策建议' },
  { id: 'voice_036', q: '当前卡池还值得继续开吗', expect: 'gate', why: '决策建议' },
  // KNOWN DIVERGENCE, do not "fix": CL-20 listed 041 among the gate's 7
  // intercepts, but the gate fires 0/5 on it — the ticket inferred firing from
  // latency. Making it fire needs an unspecified-subject clause, and that clause
  // was measured to pull 077 to 5/5 and 076 to 2/5, both of which expect SQL. Left
  // as an expected failure so the row keeps reporting the real behaviour; 041's
  // refusal comes from the model's own §5 decline, which already passes judge.
  { id: 'voice_041', q: '最近数据有什么异常吗', expect: 'gate', why: '⚠ 门禁实测 0/5——见上方注释，非本门禁负责' },
  { id: 'voice_044', q: '帮我出个周报', expect: 'gate', why: '周期报告（与 052 的真正分界）' },
  { id: 'voice_045', q: '预测一下下周的充值能到多少', expect: 'gate', why: '预测' },
  { id: 'voice_047', q: '有什么提升收入的方法吗', expect: 'gate', why: '策略建议' },
  { id: 'voice_048', q: '这个月运营数据总结一下', expect: 'gate', why: '叙述性总结' },
]

/** Real LLM for the triage call only; canned SQL for generation. */
class TriageProbeLlm implements Llm {
  triageCalls = 0
  generationCalls = 0

  constructor(
    private readonly ctx: Context,
    private readonly provider: string,
    private readonly model: string,
  ) {}

  async generate(args: LlmGenerateArgs): Promise<LlmGenerateResult> {
    const prompt = args.prompt ?? ''
    if (!prompt.includes(TRIAGE_MARKER)) {
      this.generationCalls += 1
      return { sql: CANNED_SQL }
    }
    this.triageCalls += 1
    const assembler = new BlockAssembler()
    const stream = this.ctx.llm.stream({
      provider: this.provider,
      model: this.model,
      messages: [
        createUserMessage({
          content: [{ type: 'text' as const, text: prompt }],
          source: { kind: 'plugin' as const, plugin: 'eval-cli' },
        }),
      ],
    })
    for await (const chunk of stream) assembler.push(chunk)
    const text = assembler
      .blocks()
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('')
    return { sql: text }
  }
}

interface Observation {
  readonly verdict: Verdict
  /** Raw first line of the model's reply, for diagnosing an unparseable answer. */
  readonly raw: string
}

async function observeOnce(llm: TriageProbeLlm, question: string): Promise<Observation> {
  const engine = new Nl2sqlEngine({
    dataSources: FIXTURE_DATA_SOURCES,
    llm,
    odps: new StandInOdps({}),
  })
  const r = await engine.run({ question, eventDef: FIXTURE_EVENT_DEF })
  const fired = r.trace.some(t => t.step === 'capability_triage')
  return { verdict: fired ? 'gate' : 'pass', raw: (r.reason ?? '').slice(0, 60) }
}

/** Bounded-concurrency map — conc 3 matches run-eval.sh (conc 4 triggers AGA empty-response bursts). */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++
        if (i >= items.length) return
        out[i] = await fn(items[i]!)
      }
    }),
  )
  return out
}

async function main(): Promise<void> {
  const reps = Number(process.env.REPS ?? '3')
  const filters = process.argv.slice(2).filter(a => !a.startsWith('-'))
  const selected = filters.length > 0 ? CASES.filter(c => filters.some(f => c.id.includes(f))) : CASES
  if (selected.length === 0) {
    console.error(`probe-triage: no case matched ${filters.join(', ')}`)
    process.exit(2)
  }

  const provider = process.env.EVAL_LLM_PROVIDER ?? 'aga'
  const model = process.env.EVAL_LLM_MODEL ?? 'qwen3.7-max'

  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(LocalCredentialProvider, {
    path: join(homedir(), '.dsh', '.credentials.yaml'),
    dshHome: join(homedir(), '.dsh'),
  })
  await ctx.plugin(llmDashscope)
  const llm = new TriageProbeLlm(ctx, provider, model)

  console.log(`probe-triage: provider=${provider} model=${model} reps=${reps} cases=${selected.length}`)
  console.log(`             ${selected.length * reps} LLM calls total\n`)

  // Flatten to (case, rep) so concurrency spans repetitions too.
  const jobs = selected.flatMap(c => Array.from({ length: reps }, () => c))
  const observations = await mapLimit(jobs, 3, async c => ({ c, o: await observeOnce(llm, c.q) }))

  const byId = new Map<string, { c: ProbeCase; verdicts: Verdict[] }>()
  for (const { c, o } of observations) {
    const entry = byId.get(c.id) ?? { c, verdicts: [] }
    entry.verdicts.push(o.verdict)
    byId.set(c.id, entry)
  }

  let failures = 0
  console.log('case         intended  observed          agree  note')
  console.log('──────────────────────────────────────────────────────────────────────')
  for (const { c, verdicts } of byId.values()) {
    const agree = verdicts.filter(v => v === c.expect).length
    const ok = agree === verdicts.length
    if (!ok) failures += 1
    const shape = verdicts.map(v => (v === 'gate' ? 'G' : 'p')).join('')
    console.log(
      `${c.id.padEnd(12)} ${c.expect.padEnd(9)} ${shape.padEnd(17)} ${`${agree}/${verdicts.length}`.padEnd(6)} ${ok ? '' : '⚠ '}${c.why}`,
    )
  }
  console.log('──────────────────────────────────────────────────────────────────────')
  console.log('G = gate fired (beyond_single_query), p = passed to generation')
  console.log(`triage LLM calls=${llm.triageCalls}, generation calls (canned, offline)=${llm.generationCalls}`)

  if (failures > 0) {
    console.error(`\n❌ ${failures}/${byId.size} case(s) disagreed with the intended verdict on at least one rep.`)
    process.exit(1)
  }
  console.log(`\n✅ all ${byId.size} case(s) matched the intended verdict on ${reps}/${reps} reps.`)
}

await main()
