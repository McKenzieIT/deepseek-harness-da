/**
 * K11 live join eval cases — real table names and join relationships from the
 * K11 semantic layer's dimension_refs. Unlike join-cases.ts (hand-rolled
 * fixture graph + scripted LLM), these cases are designed for the live
 * comparison runner (real LLM, real corpus, real RelationGraph).
 *
 * Each case carries a `joinExpectation` for structural scoring: the tables that
 * should be joined and the key condition the SQL must contain. This lets the
 * runner judge SQL quality without executing against real ODPS.
 *
 * @module @deepseek-ai/dsh-nl2sql-engine/src/eval/k11-join-cases
 */

/** A join expectation for structural scoring of generated SQL. */
export interface JoinExpectation {
  /** The DWS (fact) table that must appear in FROM/JOIN. */
  readonly dwsTable: string
  /** The DIM table that must appear in JOIN. */
  readonly dimTable: string
  /** The join key pattern (substring) expected in the ON clause. */
  readonly joinKeyPattern: string
}

/** A K11 live eval case: question + structural join expectation. */
export interface K11JoinCase {
  readonly id: string
  readonly question: string
  readonly joinExpectation: JoinExpectation
  /** Optional: the DIM label column the question implies (e.g. server_name). */
  readonly expectedSelectColumn?: string
}

/** K11 live join eval case set (real K11 semantic-layer table names + join relationships). */
export const K11_JOIN_CASES: readonly K11JoinCase[] = [
  {
    id: 'k11-j01',
    question: '各服务器的充值总金额',
    joinExpectation: {
      dwsTable: 'dws_10000251_pay_order_di',
      dimTable: 'dim_10000251_server_info',
      joinKeyPattern: 'server_id',
    },
    expectedSelectColumn: 'server_name',
  },
  {
    id: 'k11-j02',
    question: '每个商品配置的付费订单数',
    joinExpectation: {
      dwsTable: 'dws_10000251_pay_order_di',
      dimTable: 'dim_10000251_trans_recharge_df',
      joinKeyPattern: 'cfg_id',
    },
  },
  {
    id: 'k11-j03',
    question: '各活动的充值金额排名',
    joinExpectation: {
      dwsTable: 'dws_10000251_pay_order_di',
      dimTable: 'dim_10000251_com_activity_info',
      joinKeyPattern: 'activity_id',
    },
  },
  {
    id: 'k11-j04',
    question: '各区服角色通用特征的战力分布',
    joinExpectation: {
      dwsTable: 'dws_10000251_role_common_feature_df',
      dimTable: 'dim_10000251_server_info',
      joinKeyPattern: 'server_id',
    },
    expectedSelectColumn: 'server_name',
  },
  {
    id: 'k11-j05',
    question: '各服务器流失角色数',
    joinExpectation: {
      dwsTable: 'dws_10000251_univ_role_churn_di',
      dimTable: 'dim_10000251_server_info',
      joinKeyPattern: 'server_id',
    },
    expectedSelectColumn: 'server_name',
  },
]

/**
 * Structural join scorer: check if generated SQL contains the expected table
 * references and join key pattern. Returns true when the SQL demonstrates
 * correct multi-table join awareness.
 *
 * @param sql - The generated SQL to evaluate (undefined → false).
 * @param expectation - The join expectation to check against.
 * @returns True when the SQL contains the DWS table, DIM table, and join key pattern.
 */
export function scoreJoinStructural(sql: string | undefined, expectation: JoinExpectation): boolean {
  if (!sql) return false
  const lower = sql.toLowerCase()
  const hasDws = lower.includes(expectation.dwsTable.toLowerCase())
  const hasDim = lower.includes(expectation.dimTable.toLowerCase())
  const hasJoinKey = lower.includes(expectation.joinKeyPattern.toLowerCase())
  return hasDws && hasDim && hasJoinKey
}
