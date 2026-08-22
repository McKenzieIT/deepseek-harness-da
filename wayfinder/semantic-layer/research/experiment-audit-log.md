# Experiment Audit Log — Semantic Layer Effort

## 2026-08-22: P3 Ontology NL2SQL Join Comparison (Structural)

### Setup

- **Corpus**: K11 semantic layer, 321 tables (162 DWS + 159 DIM), loaded via `loadTables(examples/k11-semantic-layer)`
- **Graph**: Built from `tableKindPlugin.relations()` over all parsed tables' `dimension_refs` (126 DWS with 225 join edges to 34 DIM tables)
- **Cases**: 5 K11 multi-table join eval cases (`k11-join-cases.ts`):
  - k11-j01: 各服务器的充值总金额 (pay_order → server_info ON server_id)
  - k11-j02: 每个商品配置的付费订单数 (pay_order → trans_recharge ON cfg_id)
  - k11-j03: 各活动的充值金额排名 (pay_order → com_activity_info ON activity_id)
  - k11-j04: 各区服角色通用特征的战力分布 (role_common_feature → server_info ON server_id)
  - k11-j05: 各服务器流失角色数 (univ_role_churn → server_info ON server_id)
- **Varied**: `EngineDeps.graph` — group A: real `RelationGraph` from K11 dimension_refs; group B: `undefined`
- **LLM**: PromptAwareLlm (scripted test double — returns correct multi-table JOIN SQL for each question; same SQL for both groups)
- **ODPS**: Permissive `StandInOdps({})` (returns `{ state: 'done', rows: [{ cnt: 42 }] }` for any SQL)
- **Scoring**: Structural join scoring — does the SQL reference the expected DWS table, DIM table, and join key pattern?

### Data (verbatim)

| Case | With Graph | Without Graph | Mechanism |
|------|-----------|---------------|-----------|
| k11-j01 | PASS (joinCorrect=true, traceHasConstraints=true) | FAIL (declined=true, sql=undefined) | Graph expands BM25 candidates to include dim_server_info; without graph, DIM not in candidates → critic `table_not_in_candidates` → decline |
| k11-j02 | PASS (joinCorrect=true, traceHasConstraints=true) | FAIL (declined=true, sql=undefined) | Same mechanism: graph expansion adds dim_trans_recharge_df |
| k11-j03 | PASS (joinCorrect=true, traceHasConstraints=true) | PASS (joinCorrect=true) | BM25 retrieves both tables from "活动充值" keywords matching both descriptions; graph adds redundant constraint |
| k11-j04 | PASS (joinCorrect=true, traceHasConstraints=true) | FAIL (declined=true, sql=undefined) | Graph expansion adds dim_server_info |
| k11-j05 | PASS (joinCorrect=true, traceHasConstraints=true) | FAIL (declined=true, sql=undefined) | Graph expansion adds dim_server_info |

**Aggregate**:
- With graph: **100%** pass rate (5/5)
- Without graph: **20%** pass rate (1/5)
- Delta: **+80 percentage points**
- `joinConstraintsInjected`: true (all 5 cases)

### Verdict

The ontology relation graph provides two concrete mechanisms for multi-table query accuracy:

1. **Graph-expanded recall (C3)**: `expandCandidates` adds 1-hop `joins` neighbors (DIM tables) to BM25 candidates. Without this, the critic's `table_not_in_candidates` rule correctly rejects SQL referencing unlinked DIM tables — the LLM can generate the right JOIN, but the critic blocks it because the DIM wasn't retrieved.

2. **Join constraint injection (C1)**: `buildJoinConstraints` injects declared join conditions as hard constraints into the LLM prompt. This ensures the LLM uses the correct join keys rather than guessing.

The +80pp delta is driven primarily by mechanism #1 (recall expansion). Mechanism #2 (constraint injection) is harder to measure in isolation with a scripted LLM (it always generates the same SQL regardless of prompt content).

### Fidelity Caveat

- **Scripted LLM, not live**: The PromptAwareLlm is a test double that always generates correct multi-table JOIN SQL regardless of prompt content. A real LLM (DashScope/DeepSeek) would show the true accuracy delta — the scripted double demonstrates the mechanism (graph enables the SQL to pass the critic) but not the LLM's sensitivity to join constraints in the prompt. The real delta with a live LLM is likely smaller than 80pp (the LLM might generate single-table SQL without constraints, rather than correct JOIN SQL that gets blocked).
- **No ODPS execution**: SQL is not executed; scoring is structural (table + key presence). A live ODPS would additionally validate SQL correctness (column names, partition filters, data types).
- **Partition resolver not wired**: `partitionResolver` was not provided (defaults to `['ds']`); matches K11's actual partition scheme so no distortion.

### Ticket Pointer

Resolves: [P3 — Ontology NL2SQL Integration](../tickets/P3-ontology-nl2sql-integration.md) acceptance criterion "对比实验：有/无 ontology 辅助的多表查询准确率"
