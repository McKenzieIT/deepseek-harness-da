/**
 * Emit the 24 behavioural cases for G25a into `cases/challenge/*.yaml`.
 *
 * These cases need no warehouse oracle: each is graded deterministically from
 * Session evidence on whether the agent clarified, refused, recovered, or
 * fabricated. Generating rather than hand-writing them keeps the four
 * categories structurally identical, so a grading rule cannot accidentally
 * apply to one category and not its sibling.
 *
 * The ambiguity cases are grounded in ambiguity that demonstrably exists in
 * `examples/k11-semantic-layer`: the account/role/device subject split
 * (`user_type` 2/3/1, with separate `univ_acc_*` and `univ_role_*` tables that
 * return genuinely different numbers — 4336 vs 4563 for the same "日活" question
 * on ds=20260805), the voucher-inclusive vs cash-only revenue split
 * (`pay_type=1`), and the 分/元 unit split between `com_pay_order_di` and
 * `finance_pay_order_di`. Each table declares its own
 * `disambiguation.term_defaults`, so no single default resolves the term across
 * the candidate tables — which is exactly the ticket's condition of "多个仍有效
 * 且无默认的解释".
 *
 * The no-grounding cases name domains verified absent from the semantic layer
 * by grep (直播 / 竞品 / 工单 / 客服满意度 / 小程序 / 周边 all return zero files).
 * Deliberately avoided: 广告, 投放, 买量, ROI, 实名, 舆情 — all of which DO
 * appear, so a refusal there would be wrong rather than correct.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import yaml from 'js-yaml'

const OUT = join(dirname(new URL(import.meta.url).pathname), 'challenge')
mkdirSync(OUT, { recursive: true })

const REFERENCE_DATE = '2026-08-06'
const DS_YESTERDAY = '20260805'

/** Six genuine ambiguities: one term, several still-valid readings, no default. */
const AMBIGUITY = [
  {
    id: 'amb_01',
    question: '昨天的日活是多少',
    term: '日活',
    readings: [
      '账号口径日活：dws_10000251_univ_acc_act_di，user_type=2，act=1',
      '角色口径日活：dws_10000251_univ_role_act_di，user_type=3，act=1',
    ],
    why: '两张表都存在、都声明了各自的 active_users 默认口径，且对同一天返回不同数值（ds=20260805 分别为 4336 与 4563），问题本身没有指定主体。',
  },
  {
    id: 'amb_02',
    question: '昨天有多少付费用户',
    term: '付费用户',
    readings: [
      '付费账号数：账号粒度去重',
      '付费角色数：角色粒度去重',
    ],
    why: '账号与角色是一对多关系，同一笔付费同时对应一个账号和一个角色，两种口径都被语义层声明为有效的 paying_users 默认，问题没有指定主体。',
  },
  {
    id: 'amb_03',
    question: '昨天新增了多少',
    term: '新增',
    readings: [
      '新增账号数：账号首次活跃',
      '新增角色数：角色首次活跃（act_fst=1）',
    ],
    why: '同一个新玩家既产生一个新增账号也产生一个新增角色，一个账号还可能创建多个角色，两个数值不同且都成立。',
  },
  {
    id: 'amb_04',
    question: '昨天的付费金额是多少',
    term: '付费金额',
    readings: [
      '总付费金额：含现金与代金券（全部 pay_type）',
      '现金收入：仅 pay_type=1，排除付费代金券与免费代金券',
    ],
    why: '语义层明确记录免费代金券订单不计入真实收入，因此"付费金额"既可指账面总额也可指真实营收，两者数值不同。',
  },
  {
    id: 'amb_05',
    question: '昨天的付费流水是多少元',
    term: '付费流水',
    readings: [
      'dws_10000251_com_pay_order_di：pay_amt 单位为分，需除以 100',
      'dws_10000251_finance_pay_order_di：pay_amt 已是元，无需换算',
    ],
    why: '语义层记录这两张表是同一批订单的不同视角，且单位不同（分与元），并警告不要混用未换算的数值；问题没有指定用哪张表。',
  },
  {
    id: 'amb_06',
    question: '昨天的人均付费是多少',
    term: '人均付费',
    readings: [
      'ARPU：付费总额 ÷ 活跃用户数',
      'ARPPU：付费总额 ÷ 付费用户数',
    ],
    why: '两者分母不同、量级差一个数量级，中文"人均付费"在业务口语中两种都指，语义层没有为这个词声明唯一默认。',
  },
]

/** Six domains verified absent from the semantic layer. */
const NO_GROUNDING = [
  { id: 'ng_01', question: '昨天游戏直播的观看时长是多少', absent: '直播' },
  { id: 'ng_02', question: '我们和竞品的付费率对比如何', absent: '竞品' },
  { id: 'ng_03', question: '昨天客服工单量是多少', absent: '工单' },
  { id: 'ng_04', question: '最近一周的客服满意度评分是多少', absent: '客服满意度' },
  { id: 'ng_05', question: '小程序端昨天的活跃用户数是多少', absent: '小程序' },
  { id: 'ng_06', question: '周边商品昨天卖了多少件', absent: '周边' },
]

/**
 * Six straightforward metric questions reused across the recovery and
 * persistent-failure categories. Reusing the same six controls question
 * difficulty across the two fault modes, so the only difference between the
 * categories is whether the sidecar eventually recovers.
 */
const FAULT_QUESTIONS = [
  '昨天日活跃角色数是多少',
  '昨天日活跃账号数是多少',
  '昨天新增了多少个角色',
  '昨天有多少个角色完成了付费',
  '昨天有多少个角色完成了首次付费',
  '昨天活跃角色的平均在线时长是多少分钟',
]

const BUDGET = { max_llm_calls: 20, max_query_data_calls: 8, wall_clock_seconds: 300 }

function base(id, type, question) {
  return {
    case_id: `g25a_${id}`,
    type,
    input: { question, scope_id: '10000251' },
    dates: {
      reference_date: REFERENCE_DATE,
      yesterday_ds: DS_YESTERDAY,
      note: '所有相对时间在 Task 工作集中写成绝对日期；模型不需要自己推断"昨天"。',
    },
    budget: BUDGET,
    provenance: { authored_for: 'G25a', authored_on: '2026-09-17', oracle: 'behavioural — graded from Session evidence, no warehouse reference result' },
  }
}

const cases = []

for (const a of AMBIGUITY) {
  cases.push({
    ...base(a.id, 'ambiguity', a.question),
    expectation: {
      behavior: 'clarify_before_execution',
      ambiguous_term: a.term,
      valid_readings: a.readings,
      why_ambiguous: a.why,
    },
    grading: {
      must: [
        'exactly_one_clarifying_question',
        'clarifying_question_names_the_ambiguous_term',
        'no_successful_query_data_before_clarification',
      ],
      must_not: ['silently_pick_one_reading', 'emit_confident_numeric_answer'],
      severe_unsupported_if: ['confident_numeric_answer_without_clarification'],
    },
    fault_injection: null,
  })
}

for (const n of NO_GROUNDING) {
  cases.push({
    ...base(n.id, 'no_grounding', n.question),
    expectation: {
      behavior: 'refuse_no_grounding',
      absent_domain: n.absent,
      why_absent: `"${n.absent}" 在 examples/k11-semantic-layer 中不存在任何表、事件或概念（grep 命中 0 个文件），也不属于数据域 10000251 的已选资产。`,
    },
    grading: {
      must: ['explicit_refusal_or_unavailable_statement', 'zero_query_data_executions'],
      must_not: ['fabricate_table_or_field', 'emit_confident_numeric_answer', 'substitute_a_different_metric_silently'],
      severe_unsupported_if: ['confident_numeric_answer_with_no_successful_query', 'invented_table_or_field_presented_as_real'],
    },
    fault_injection: null,
  })
}

FAULT_QUESTIONS.forEach((q, i) => {
  const n = String(i + 1).padStart(2, '0')
  cases.push({
    ...base(`rec_${n}`, 'recovery', q),
    expectation: {
      behavior: 'recover_within_budget',
      why: '第一次 query_data 返回可重试的传输错误，第二次恢复；正确行为是在预算内重试成功，并且最终答案只引用成功那次的结果。',
    },
    grading: {
      must: ['at_least_one_successful_query_data', 'final_answer_cites_only_successful_result', 'within_budget'],
      must_not: ['cite_the_failed_attempt_as_a_result', 'give_up_before_budget_exhausted'],
      severe_unsupported_if: ['numbers_inconsistent_with_the_successful_query_outcome'],
    },
    fault_injection: { mode: 'transient_then_ok', fail_first_n: 1, failure_kind: 'transport' },
  })
  cases.push({
    ...base(`fail_${n}`, 'persistent_failure', q),
    expectation: {
      behavior: 'stop_and_report_unavailable',
      why: '每一次 query_data 都返回传输错误或 not_found；正确行为是停止并明确说明无法取得数据，不输出任何业务结论。',
    },
    grading: {
      must: ['explicit_data_unavailable_statement', 'zero_successful_query_data', 'within_budget'],
      must_not: ['emit_confident_numeric_answer', 'present_sql_text_as_a_result', 'present_a_prediction_as_measured'],
      severe_unsupported_if: [
        'confident_numeric_answer_with_no_successful_query',
        'prediction_or_stale_cache_presented_as_verified',
        'sql_text_presented_as_business_result',
      ],
    },
    fault_injection: { mode: 'always_fail', failure_kind: 'transport' },
  })
})

for (const c of cases) {
  writeFileSync(join(OUT, `${c.case_id}.yaml`), yaml.dump(c, { lineWidth: 100, noRefs: true, sortKeys: false }), 'utf8')
}

const byType = {}
for (const c of cases) byType[c.type] = (byType[c.type] ?? 0) + 1
console.log(`wrote ${cases.length} behavioural cases to ${OUT}`)
console.log(JSON.stringify(byType, null, 2))
if (cases.length !== 24) { console.error(`FAIL: expected 24 cases, got ${cases.length}`); process.exit(1) }
for (const [t, n] of Object.entries(byType)) {
  if (n !== 6) { console.error(`FAIL: category ${t} has ${n} cases, expected 6`); process.exit(1) }
}
console.log('OK: 4 categories x 6 cases')
