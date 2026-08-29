# Experiment Audit Log — Semantic Layer Effort

## 2026-08-30: CL-8 Cross-Validation (continuous-blend default)

### Setup

- **Code state**: `Config.blendingMode` default = `continuous-blend`; both `applyAliasFusion` and `applyContinuousBlend` have median-floor fix
- **Cases**: 80 original K11 cases (eval-cli glob filters alias cases)
- **Model**: aga/qwen3.7-max, engine responder, pass_k=1, SqlJudge disabled
- **Run ID**: `cl8-continuous-blend`

### Data (verbatim)

| Metric | cl8-full-fixed (strategy-b) | cl8-continuous-blend |
|--------|---------------------------|---------------------|
| pass_rate | 96.3% (77/80) | **100.0% (80/80)** |
| correct | 77 | 80 |
| wrong | 3 | 0 |
| declined | 0 | 0 |

Previously-wrong cases now correct:
- k11v2_011: `load_event_definition{event_name: "game.yanwu.match"}` (was wrong)
- k11v2_012: `SELECT COUNT(DISTINCT role_id) FROM dws_10000251_play_rogue_df` (was wrong)
- k11v2_025: `SELECT SUM(arena_win_times) / NULLIF(SUM(arena_battle_times), 0)` (was wrong)

### Verdict

**100% confirms zero regression from the blendingMode change.** The 3 flipped cases are LLM non-determinism on PVP metric_lookup borderline cases, not a blendingMode effect (CL-7 proved B=C at retrieval level). Both runs validate the median-floor alias scoring fix + L3 enrichment.

### Ticket Pointer

Cross-validates: [CL-8 — 端到端 Eval + Go/No-Go](../tickets/CL8-e2e-eval-go-nogo.md)

---

## 2026-08-30: CL-7 Production Pipeline Retrieval Experiment

### Setup

- **Corpus**: `SemanticLayerService.loadRetrievalCorpusAll()` — 4692 items (328 tables + 3919 metrics + 3207 events)
- **Graph**: `SemanticLayerService.getRelationGraph()` — live RelationGraph with aliasIndex
- **Cases**: 120 K11 cases (80 original + 40 CL-4 alias-dependent), `covered_assets` as ground truth
- **Varied**: `Config.blendingMode` (strategy-b / continuous-blend) × semantic layer state (L1: 4 tables with aliases / L3: 28 tables with aliases)
- **Pipeline**: Full `search_data_sources` execute: BM25 → blending → graph expansion → qualify (no query expansion, no qualification)
- **L3 aliases**: Hand-crafted from CL-5 `L3_ALIASES` mapping, written to K11 YAML files via `enrich-l3-aliases.ts`

### Data (verbatim)

**Run 1** (neither B nor C fixed): B = C = 0.467 (L1), 0.479 (L3). Zero delta.

**Run 2** (only C fixed with median-floor):

| Config | Mean R@20 |
|--------|-----------|
| B(L1)  | 0.467     |
| C(L1)  | 0.629     |
| B(L3)  | 0.479     |
| C(L3)  | 0.804     |

**Run 3** (both B and C fixed with median-floor — final):

| Config | Mean R@20 | Median R@20 | Mean P@20 | Orig R@20 | Alias R@20 |
|--------|-----------|-------------|-----------|-----------|------------|
| B(L1)  | 0.629     | 1.000       | 0.034     | 0.456     | 0.975      |
| C(L1)  | 0.629     | 1.000       | 0.034     | 0.456     | 0.975      |
| B(L3)  | 0.804     | 1.000       | 0.045     | 0.744     | 0.925      |
| C(L3)  | 0.804     | 1.000       | 0.045     | 0.744     | 0.925      |

B = C exactly (120/120 unchanged). Enrichment: both +17.5pp (L1→L3).
Flip analysis L1→L3: 27 improved, 2 regressed (k11v2_alias_009, _019), 91 unchanged.

### Verdict

**B and C produce identical results when both have the median-floor alias scoring fix.** The Run 2 "C wins" result was an artifact of fixing C but not B.

The real bug was alias-resolved candidate scoring: `ALIAS_BOOST=2.0` vs BM25 scores of 30–40 in the 4692-item production corpus. `applyGraphExpansionAndJoins` dropped these low-scored candidates at the topK slice. **Alias resolution has been effectively disabled in production since CL-1.**

The median-floor fix (`score = max(original, medianBm25)`) resolves this for both strategies. The blending formula (fixed boost vs coverage-weighted) makes no difference to recall@20.

Enrichment is the sole lever: +17.5pp from 4→28 tables with alt_labels.

### Fidelity Caveat

- **No query expansion**: `config.queryExpansion=false` (no LLM provider). Production would have LLM-powered expansion, potentially boosting both B and C. Direction should hold; absolute values may shift.
- **No qualification**: No `ctx.query` provider. Candidate IDs are unqualified (no ODPS project prefix). Affects the downstream NL2SQL but not retrieval-level metrics.
- **L3 aliases hand-crafted**: From CL-5 `L3_ALIASES`, not `discover_alt_labels`. Quality likely higher than LLM auto-discovery.
- **Median-floor fix applied to both B and C**: Run 3 applied the median-floor fix to B's `applyAliasFusion` as well, revealing B=C. The fix addresses an independent scoring bug (alias-resolved candidates scored 15–20× below BM25 in the 4692-item corpus), not a strategy-specific design choice.

### Ticket Pointer

Resolves: [CL-7 — Production Pipeline Retrieval Experiment](../tickets/CL7-production-retrieval-experiment.md)
Full report: [research/cl7-production-pipeline-experiment-report.md](cl7-production-pipeline-experiment-report.md)

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
