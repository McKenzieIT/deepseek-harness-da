/**
 * P3 C4 multi-table join eval fixtures + cases. The fixture graph is a
 * HAND-ROLLED fake RelationGraphLike (no semantic-layer dep — the nl2sql-engine
 * stays decoupled; the engine only needs the structural interface).
 *
 * @module @deepseek-ai/dsh-nl2sql-engine/src/eval/join-cases
 */
import type { RelationGraphLike, RelationGraphEdge } from '../ontology.ts'
import { MatchMode } from '../types.ts'
import type { DataSourceDoc } from '../bm25-linking.ts'
import type { EvalCase } from './cases.ts'
import type { ScriptedGen } from '../replay-llm.ts'

/** Fixture corpus for the join eval (2 DWS + 1 DIM). */
export const JOIN_FIXTURE_DS: readonly DataSourceDoc[] = [
  { id: 'dws_pay_order_di', description: '充值订单 DWS 汇总 pay_amt server_id role_id' },
  { id: 'dim_server_info', description: '区服维度表 server_id server_name' },
  { id: 'dws_battle_di', description: '战斗 DWS 汇总 battle_count server_id' },
]

/**
 * Build the fixture relation graph: dws_pay_order_di ⟷ dim_server_info on
 * server_id; dws_battle_di ⟷ dim_server_info on server_id.
 */
export function buildJoinFixtureGraph(): RelationGraphLike {
  const edges: Record<string, RelationGraphEdge[]> = {
    dws_pay_order_di: [{ targetId: 'dim_server_info', type: 'joins', on: 'server_id = server_id' }],
    dws_battle_di: [{ targetId: 'dim_server_info', type: 'joins', on: 'server_id = server_id' }],
    dim_server_info: [
      { targetId: 'dws_pay_order_di', type: 'joins', on: 'server_id = server_id' },
      { targetId: 'dws_battle_di', type: 'joins', on: 'server_id = server_id' },
    ],
  }
  const edgesOf = (id: string): readonly RelationGraphEdge[] => edges[id] ?? []
  return {
    findJoinPath(a, b) {
      if (a === b) return [a]
      if (edgesOf(a).some(e => e.targetId === b)) return [a, b]
      for (const e of edgesOf(a)) {
        if (edgesOf(e.targetId).some(e2 => e2.targetId === b)) return [a, e.targetId, b]
      }
      return null
    },
    getJoinCondition(a, b) {
      return edgesOf(a).find(e => e.targetId === b && e.on)?.on ?? null
    },
    getRelated(id, type) {
      const all = edgesOf(id)
      return type ? all.filter(e => e.type === type) : all
    },
    getDerived() {
      return []
    },
  }
}

const MULTI_SQL =
  'SELECT s.server_name, SUM(p.pay_amt) AS total FROM dws_pay_order_di p '
  + "JOIN dim_server_info s ON p.server_id = s.server_id WHERE p.ds='20260819' GROUP BY s.server_name"

/** ≥3 multi-table join eval cases (P3 C4). */
export const JOIN_EVAL_CASES: readonly EvalCase[] = [
  {
    id: 'j01',
    question: '各服务器的充值总金额',
    llm: { sql: MULTI_SQL } as ScriptedGen,
    odps: { sub: 'JOIN dim_server_info', out: { state: 'done', result_id: 'j1', rows: [{ server_name: 's1', total: 100 }] } },
    expected: { result_value: [{ server_name: 's1', total: 100 }], match_mode: MatchMode.SET_EXACT },
    turns: 1,
  },
  {
    id: 'j02',
    question: '各服务器战斗次数',
    llm: { sql: MULTI_SQL.replace('dws_pay_order_di', 'dws_battle_di').replace('SUM(p.pay_amt) AS total', 'COUNT(*) AS battle_count') } as ScriptedGen,
    odps: { sub: 'server_name', out: { state: 'done', result_id: 'j2', rows: [{ server_name: 's1', battle_count: 5 }] } },
    expected: { result_value: [{ server_name: 's1', battle_count: 5 }], match_mode: MatchMode.SET_EXACT },
    turns: 1,
  },
  {
    id: 'j03',
    question: '充值最高的区服名',
    llm: { sql: `${MULTI_SQL} ORDER BY total DESC LIMIT 1` } as ScriptedGen,
    odps: { sub: 'ORDER BY total', out: { state: 'done', result_id: 'j3', rows: [{ server_name: 's1', total: 100 }] } },
    expected: { result_value: [{ server_name: 's1', total: 100 }], match_mode: MatchMode.SET_EXACT },
    turns: 1,
  },
]
