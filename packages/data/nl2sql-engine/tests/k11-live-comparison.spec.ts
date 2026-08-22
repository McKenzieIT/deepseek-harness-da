import { test, expect } from 'vitest'
import { K11_JOIN_CASES, scoreJoinStructural } from '../src/eval/k11-join-cases.ts'
import { runLiveComparison } from '../src/eval/live-comparison-runner.ts'
// Integration test: reaches into semantic-layer internals to build the real K11
// relation graph (the nl2sql-engine has no runtime dep on semantic-layer by design;
// this test validates the structural interface contract against the real graph).
import { RelationGraph } from '../../semantic-layer/src/relation-graph.ts'
import { tableKindPlugin } from '../../semantic-layer/src/kinds/table-kind.ts'
import { loadTables } from '../../semantic-layer/src/io.ts'
import { TableDefinitionSchema } from '../../semantic-layer/src/types.ts'
import type { Llm, LlmGenerateArgs, LlmGenerateResult } from '../src/replay-llm.ts'
import type { DataSourceDoc } from '../src/bm25-linking.ts'
import { resolve } from 'path'

const K11_ROOT = resolve(import.meta.dirname, '../../../../examples/k11-semantic-layer')

function buildK11Graph(): RelationGraph {
  const g = new RelationGraph()
  const entries: { sourceId: string; relations: { target: string; type: 'joins' | 'derived_from' | 'related_to'; on?: string }[] }[] = []
  for (const t of loadTables(K11_ROOT)) {
    const r = TableDefinitionSchema.safeParse(t.raw)
    if (!r.success) continue
    entries.push({ sourceId: r.data.table_name, relations: tableKindPlugin.relations(r.data) })
  }
  if (entries.length === 0) throw new Error(`K11 fixtures not found at ${K11_ROOT}`)
  g.build(entries)
  return g
}

function buildK11Corpus(): DataSourceDoc[] {
  const out: DataSourceDoc[] = []
  for (const t of loadTables(K11_ROOT)) {
    const r = TableDefinitionSchema.safeParse(t.raw)
    if (!r.success) continue
    out.push({ id: r.data.table_name, description: r.data.description ?? r.data.table_comment ?? '' })
  }
  return out
}

/**
 * Scripted LLM that always generates correct multi-table JOIN SQL. The delta
 * between with-graph and without-graph is NOT from the LLM changing behavior —
 * it is from the ENGINE: without graph expansion, the critic's
 * `table_not_in_candidates` rule rejects the DIM table → engine declines.
 * With graph, `expandCandidates` adds DIMs to candidates → critic accepts.
 */
class JoinAwareLlm implements Llm {
  async generate(args: LlmGenerateArgs): Promise<LlmGenerateResult> {
    const { question } = args
    const q = question.toLowerCase()

    if (q.includes('服务器') && q.includes('充值')) {
      return { sql: "SELECT s.server_name, SUM(p.pay_amt) AS total FROM dws_10000251_pay_order_di p JOIN dim_10000251_server_info s ON p.server_id = s.server_id WHERE p.ds='20260822' GROUP BY s.server_name" }
    }
    if (q.includes('商品配置') && q.includes('付费')) {
      return { sql: "SELECT r.recharge_id, COUNT(*) AS order_cnt FROM dws_10000251_pay_order_di p JOIN dim_10000251_trans_recharge_df r ON p.cfg_id = r.id WHERE p.ds='20260822' GROUP BY r.recharge_id" }
    }
    if (q.includes('活动') && q.includes('充值')) {
      return { sql: "SELECT a.activity_id, SUM(p.pay_amt) AS total FROM dws_10000251_pay_order_di p JOIN dim_10000251_com_activity_info a ON p.activity_id = a.activity_id WHERE p.ds='20260822' GROUP BY a.activity_id ORDER BY total DESC" }
    }
    if (q.includes('区服') && q.includes('角色通用特征')) {
      return { sql: "SELECT s.server_name, AVG(f.combat_power) AS avg_power FROM dws_10000251_role_common_feature_df f JOIN dim_10000251_server_info s ON f.server_id = s.server_id WHERE f.ds='20260822' GROUP BY s.server_name" }
    }
    if (q.includes('服务器') && q.includes('流失')) {
      return { sql: "SELECT s.server_name, COUNT(*) AS churn_cnt FROM dws_10000251_univ_role_churn_di c JOIN dim_10000251_server_info s ON c.rel_role_srv_fst = s.server_id WHERE c.ds='20260822' GROUP BY s.server_name" }
    }
    return { sql: "SELECT COUNT(*) FROM dws_10000251_pay_order_di WHERE ds='20260822'" }
  }
}

test('K11 live comparison — structural join scoring with real graph', async () => {
  const graph = buildK11Graph()
  const corpus = buildK11Corpus()
  const llm = new JoinAwareLlm()

  const result = await runLiveComparison({
    llm,
    dataSources: corpus,
    graph,
    isLiveLlm: false,
  })

  expect(result.cases.length).toBe(5)
  expect(result.joinConstraintsInjected).toBe(true)
  expect(result.withGraphPassRate).toBeGreaterThanOrEqual(0.6)

  for (const c of result.cases) {
    if (c.withGraph.traceHasConstraints) {
      expect(c.withGraph.joinCorrect).toBe(true)
    }
  }
})

test('K11 scoreJoinStructural — correct SQL passes, missing table fails', () => {
  const exp = K11_JOIN_CASES[0]!.joinExpectation
  expect(scoreJoinStructural(
    'SELECT s.server_name FROM dws_10000251_pay_order_di p JOIN dim_10000251_server_info s ON p.server_id = s.server_id',
    exp,
  )).toBe(true)
  expect(scoreJoinStructural(
    "SELECT SUM(pay_amt) FROM dws_10000251_pay_order_di WHERE ds='20260822'",
    exp,
  )).toBe(false)
  expect(scoreJoinStructural(undefined, exp)).toBe(false)
})
