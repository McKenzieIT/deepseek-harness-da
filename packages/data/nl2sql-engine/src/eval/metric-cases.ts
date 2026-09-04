/**
 * P4 D4 metric eval fixtures + cases. Pure-metric cases exercise the Level 2.5
 * deterministic path (0 LLM calls). The comparison runner runs them with the
 * metric corpus (Level 2.5) vs with metrics stripped (Level 2 LLM loop).
 *
 * Fixture note: BM25 CJK unigram+bigram tokenization means shared unigrams
 * across descriptions cause cross-matches (e.g. '付费' in two metric descs
 * would make a query match both → 2 metric hits → Level 2, not Level 2.5).
 * Each metric description is crafted so its recall keywords appear ONLY in
 * its intended question (no shared CJK unigrams with other questions), so
 * each pure-metric query yields exactly 1 BM25 hit → Level 2.5 route.
 *
 * @module @deepseek-ai/dsh-nl2sql-engine/src/eval/metric-cases
 */
import { MatchMode } from '../types.ts'
import type { DataSourceDoc } from '../bm25-linking.ts'
import type { EvalCase } from './cases.ts'

/** Fixture corpus: pure metrics (Level 2.5) + one table (for the stripped Level 2 run). */
export const METRIC_FIXTURE_DS: readonly DataSourceDoc[] = [
  { id: 'dau', description: '日活 DAU 活跃', payload: { kind: 'metric', name: 'dau', description: '日活', computation: { sql: 'COUNT(DISTINCT user_id)', metadata: { source: 'ods_login', aggregation: 'count_distinct', field: 'user_id' } } } },
  { id: 'pay_amt_sum', description: '总金额 充值 sum pay_amt', payload: { kind: 'metric', name: 'pay_amt_sum', description: '付费总金额', computation: { sql: 'SUM(pay_amt)', metadata: { source: 'dws_pay_order_di', aggregation: 'sum', field: 'pay_amt' } } } },
  { id: 'pay_user_cnt', description: '付费用户 count role_id', payload: { kind: 'metric', name: 'pay_user_cnt', description: '付费人数', computation: { sql: 'COUNT(DISTINCT role_id)', metadata: { source: 'dws_pay_order_di', aggregation: 'count_distinct', field: 'role_id' } } } },
  { id: 'battle_count', description: '战斗 battle count', payload: { kind: 'metric', name: 'battle_count', description: '战斗次数', computation: { sql: 'COUNT(*)', metadata: { source: 'dws_battle_di', aggregation: 'count', field: '*' } } } },
  { id: 'dws_pay_order_di', description: '订单 DWS pay_amt role_id', payload: { kind: 'dws' } },
]

/** >=5 metric eval cases (P4 D4). Each pure-metric case exercises Level 2.5. */
export const METRIC_EVAL_CASES: readonly EvalCase[] = [
  {
    id: 'm01', question: '昨天DAU是多少', today: '20260820',
    llm: { sql: "SELECT COUNT(DISTINCT user_id) FROM ods_login WHERE ds='20260819'" },
    odps: { sub: "FROM ods_login WHERE ds='20260819'", out: { state: 'done', result_id: 'm1', rows: [{ cnt: 7 }] } },
    expected: { result_value: 7, match_mode: MatchMode.SCALAR_EXACT }, turns: 1,
  },
  {
    id: 'm02', question: '昨天充值总金额', today: '20260820',
    llm: { sql: "SELECT SUM(pay_amt) FROM dws_pay_order_di WHERE ds='20260819'" },
    odps: { sub: "FROM dws_pay_order_di WHERE ds='20260819'", out: { state: 'done', result_id: 'm2', rows: [{ _c0: 42 }] } },
    expected: { result_value: 42, match_mode: MatchMode.SCALAR_EXACT }, turns: 1,
  },
  {
    id: 'm03', question: '昨天付费用户数', today: '20260820',
    llm: { sql: "SELECT COUNT(DISTINCT role_id) FROM dws_pay_order_di WHERE ds='20260819'" },
    odps: { sub: 'COUNT(DISTINCT role_id)', out: { state: 'done', result_id: 'm3', rows: [{ cnt: 5 }] } },
    expected: { result_value: 5, match_mode: MatchMode.SCALAR_EXACT }, turns: 1,
  },
  {
    id: 'm04', question: '今天战斗次数', today: '20260820',
    llm: { sql: "SELECT COUNT(*) FROM dws_battle_di WHERE ds='20260820'" },
    odps: { sub: "FROM dws_battle_di WHERE ds='20260820'", out: { state: 'done', result_id: 'm4', rows: [{ cnt: 9 }] } },
    expected: { result_value: 9, match_mode: MatchMode.SCALAR_EXACT }, turns: 1,
  },
  {
    id: 'm05', question: '2026-08-15的DAU', today: '20260820',
    llm: { sql: "SELECT COUNT(DISTINCT user_id) FROM ods_login WHERE ds='20260815'" },
    odps: { sub: "FROM ods_login WHERE ds='20260815'", out: { state: 'done', result_id: 'm5', rows: [{ cnt: 11 }] } },
    expected: { result_value: 11, match_mode: MatchMode.SCALAR_EXACT }, turns: 1,
  },
]
