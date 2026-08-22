/**
 * P13b NL→SQL engine — da-fresh EvalCase set (aligns G2: borrows only
 * `result_value` + `match_mode` + `turns`; rbi BI-specific fields not reused —
 * G2 review F1). Ported from `prototypes/p13-nl2sql-engine/eval/cases.mjs`.
 *
 * Per-scope representative ~9 cases (metric_lookup/trend/ranking/distribution/
 * proportion + honest decline + feedback self-correction). Fixture
 * `dataSources` + `eventDef` stand in for the P6 substrate. Each case carries
 * its own scripted LLM/ODPS (deterministic; the eval validates the pipeline +
 * pass-rate computation + the honest-decline path, NOT real LLM quality — that
 * is live AGA smoke / production eval, P11).
 *
 * Question text carries recall keywords ('充值'→dws_pay_order_di / '战斗'→
 * dws_battle_di / '埋点'→ods_event_view / '月球'→empty candidates → decline)
 * so BM25's candidate tables align with the SQL's tables (else the critic
 * falsely rejects table ∉ candidates).
 *
 * code-review-low fix #7: c07's scripted ODPS entry carried a `__never__`
 * substring that no SQL ever matches (the engine declines on the
 * `moon_landing` ∉ candidates critic before reaching execute) — dead code.
 * `odps` is now optional; c07 omits it (the runner uses the stand-in default).
 *
 * @module @deepseek-ai/dsh-nl2sql-engine/src/eval/cases
 */
import { MatchMode, type QueryOutcome } from '../types.ts'
import type { DataSourceDoc } from '../bm25-linking.ts'
import type { ScriptedGen } from '../replay-llm.ts'

/** Fixture data-source docs standing in for the P6 substrate (eval reproducible). */
export const FIXTURE_DATA_SOURCES: readonly DataSourceDoc[] = [
  { id: 'dws_pay_order_di', description: '充值订单 DWS 汇总表 pay_amt amount role_uv', metrics: { pay_amt: {}, role_uv: {} } },
  { id: 'ods_event_view', description: '埋点事件 ods event battle item change pay result', metrics: {} },
  { id: 'dws_battle_di', description: '战斗 DWS 汇总 battle result win rate count', metrics: { win_rate: {}, battle_count: {} } },
]

/** Fixture event definition standing in for the P6 substrate (game.pay.order). */
export const FIXTURE_EVENT_DEF = {
  name: 'game.pay.order',
  params_fields: { amount: {}, role_id: {}, coinType: {}, result: {} },
  partitions: [{ name: 'ds' }],
} as const

/** The expected outcome of an eval case: result value, match mode, optional decline flag and epsilon. */
export interface EvalCaseExpected {
  readonly result_value: unknown
  readonly match_mode: MatchMode
  readonly decline?: boolean
  readonly eps?: number
}

/**
 * A single eval case: id, question, scripted LLM, optional scripted ODPS,
 * expected outcome, and turn budget.
 */
export interface EvalCase {
  readonly id: string
  readonly question: string
  readonly llm: ScriptedGen
  /** Scripted ODPS outcome keyed by SQL substring; omitted when unreachable (fix #7). */
  readonly odps?: { readonly sub: string; readonly out: QueryOutcome }
  readonly expected: EvalCaseExpected
  readonly turns: number
  /** P4 D4: reference date YYYYMMDD passed to the engine's time-param extraction. */
  readonly today?: string
}

/** The da-fresh eval case set (~9 representative scenarios). */
export const EVAL_CASES: readonly EvalCase[] = [
  {
    id: 'c01',
    question: '昨天充值总金额',
    llm: { sql: "SELECT SUM(pay_amt) AS total FROM dws_pay_order_di WHERE ds='20260819'" },
    odps: { sub: "ds='20260819'", out: { state: 'done', result_id: 'r1', rows: [{ total: 42 }] } },
    expected: { result_value: 42, match_mode: MatchMode.SCALAR_EXACT },
    turns: 1,
  },
  {
    id: 'c02',
    question: '昨天战斗胜率',
    llm: { sql: "SELECT win_rate FROM dws_battle_di WHERE ds='20260819'" },
    odps: { sub: 'FROM dws_battle_di', out: { state: 'done', result_id: 'r2', rows: [{ win_rate: 0.5 }] } },
    expected: { result_value: 0.5, match_mode: MatchMode.VALUE_CLOSE },
    turns: 1,
  },
  {
    id: 'c03',
    question: '充值 Top10 道具 埋点',
    llm: {
      sql: "SELECT GET_JSON_OBJECT(params,'$.coinType') AS coin_type, SUM(CAST(GET_JSON_OBJECT(params,'$.amount') AS BIGINT)) AS total_amount FROM ods_event_view WHERE event='game.pay.order' AND ds='20260819' GROUP BY GET_JSON_OBJECT(params,'$.coinType') ORDER BY total_amount DESC LIMIT 10",
    },
    odps: { sub: 'coinType', out: { state: 'done', result_id: 'r3', rows: [{ coin_type: 'gold', total_amount: 100 }] } },
    expected: { result_value: [{ coin_type: 'gold', total_amount: 100 }], match_mode: MatchMode.SET_EXACT },
    turns: 1,
  },
  {
    id: 'c04',
    question: '各服务器战斗次数',
    llm: { sql: "SELECT server_id, COUNT(*) AS battle_count FROM dws_battle_di WHERE ds='20260819' GROUP BY server_id" },
    odps: { sub: 'server_id', out: { state: 'done', result_id: 'r4', rows: [{ server_id: 's1', battle_count: 10 }] } },
    expected: { result_value: [{ server_id: 's1', battle_count: 10 }], match_mode: MatchMode.SET_EXACT },
    turns: 1,
  },
  {
    id: 'c05',
    question: '昨天战斗总次数',
    llm: { sql: "SELECT COUNT(*) AS battle_count FROM dws_battle_di WHERE ds='20260819'" },
    odps: { sub: "FROM dws_battle_di WHERE ds='20260819'", out: { state: 'done', result_id: 'r5', rows: [{ battle_count: 10 }] } },
    expected: { result_value: 10, match_mode: MatchMode.SCALAR_EXACT },
    turns: 1,
  },
  {
    id: 'c06',
    question: '昨天充值人数',
    llm: { sql: "SELECT COUNT(DISTINCT role_id) AS role_uv FROM dws_pay_order_di WHERE ds='20260819'" },
    odps: { sub: 'COUNT(DISTINCT', out: { state: 'done', result_id: 'r6', rows: [{ role_uv: 5 }] } },
    expected: { result_value: 5, match_mode: MatchMode.SCALAR_EXACT },
    turns: 1,
  },
  {
    // c07: '月球'→empty candidates→critic rejects moon_landing ∉ candidates→decline before execute.
    // fix #7: the dead '__never__' ODPS scripted entry is removed (odps omitted).
    id: 'c07',
    question: '昨天月球登陆次数',
    llm: { sql: "SELECT COUNT(*) FROM moon_landing WHERE ds='20260819'" },
    expected: { result_value: null, match_mode: MatchMode.NULL_CHECK, decline: true },
    turns: 1,
  },
  {
    id: 'c08',
    question: '昨天充值异常表',
    llm: { sql: 'SELECT SUM(pay_amt) AS total FROM dws_pay_order_di WHERE ds=20260820' },
    odps: { sub: 'ds=20260820', out: { state: 'failed', failureKind: 'table_not_found', error: 'Table dws_pay_order_di not found in scope' } },
    expected: { result_value: null, match_mode: MatchMode.NULL_CHECK, decline: true },
    turns: 1,
  },
  {
    id: 'c09',
    question: '充值 parse_failed 重写',
    llm: ({ attempt }) => ({
      sql:
        attempt === 0
          ? 'SELECT BAD SYNTAX FROM dws_pay_order_di WHERE ds=20260819'
          : "SELECT SUM(pay_amt) AS total FROM dws_pay_order_di WHERE ds='20260819'",
    }),
    odps: { sub: 'BAD SYNTAX', out: { state: 'failed', failureKind: 'parse_failed', error: 'syntax error near BAD' } },
    expected: { result_value: 42, match_mode: MatchMode.SCALAR_EXACT },
    turns: 2,
  },
]
