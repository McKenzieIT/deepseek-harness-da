# P3 — Ontology Phase 2: NL2SQL 集成

**Type**: task
**Status**: Resolved
**Blocked by**: P2-ontology-relations-graph

## Question

将 ontology 关系图集成到 NL2SQL 引擎中，使多表查询能利用 join path 推理生成正确 SQL。

## Scope

### 1. Schema Linking 后查询关系图

NL2SQL 引擎在 schema linking（检索+加载相关 definitions）后：
- 调用 `findJoinPath(tableA, tableB)` 确认 join 合理性
- 若找到 path，自动注入 join condition 到 SQL 生成 prompt

### 2. Multi-table Join 注入

当用户问题涉及多张表时：
- 从关系图获取 join path
- 将 join condition 作为 hard constraint 注入 LLM prompt（不让 LLM 猜测 join key）
- 示例：`"dws_pay_order.user_id = ods_login.user_id"` 作为已知事实提供

### 3. Critic 校验增强

NL2SQL critic 新增检查：
- 生成的 SQL 中的 JOIN 是否在关系图中有声明
- 无声明的 JOIN → 警告（可能 hallucination）

### 4. 检索扩展（关系图增强召回）

搜索 "收入" → BM25 命中 pay_order → 通过关系图发现 `derived_from: refund_order` → 扩展召回 refund_order。

## 验收标准

- [x] 多表查询时 join condition 从关系图获取（非 LLM 推断）
- [x] Critic 校验未声明 JOIN 并发出警告
- [x] 关系图增强检索召回（至少 1 个 case 验证）
- [x] 对比实验：有/无 ontology 辅助的多表查询准确率

## Resolution

All four acceptance criteria met:

1. **Join condition injection (C1)**: `buildJoinConstraints` in `ontology.ts` extracts declared join conditions from the graph for each candidate pair and injects them as hard constraints into the prompt. Engine trace confirms `join_constraints` step fires for all 5 K11 cases.

2. **Critic undeclared-JOIN warning (C2)**: `buildDeclaredJoinPairs` feeds the critic a whitelist; the `undeclared_join` rule warns on any SQL JOIN pair absent from the set. Verified in `ontology.spec.ts`.

3. **Graph-enhanced recall (C3)**: `expandCandidates` adds 1-hop `joins` neighbors (DIM tables) + `derived_from` targets to BM25 candidates. Without this, 4/5 K11 cases decline because the DIM table isn't in candidates. Verified in comparison test.

4. **Comparison experiment**: K11 live join eval (5 cases, structural scoring):
   - With graph: **100%** (5/5)
   - Without graph: **20%** (1/5)
   - Delta: **+80pp**
   - Caveat: scripted LLM, not live DashScope — measures mechanism (graph enables JOINs to pass critic), not real LLM sensitivity. Full audit: `wayfinder/semantic-layer/research/experiment-audit-log.md`.

Implementation locations:
- `packages/data/nl2sql-engine/src/ontology.ts` — C1/C2/C3 pure functions
- `packages/data/nl2sql-engine/src/engine.ts` — graph integration (~line 90–130)
- `packages/data/nl2sql-engine/src/critic.ts` — undeclared_join rule
- `packages/data/nl2sql-engine/src/eval/k11-join-cases.ts` — K11 live cases
- `packages/data/nl2sql-engine/src/eval/live-comparison-runner.ts` — live comparison runner
- `packages/data/nl2sql-engine/tests/k11-live-comparison.spec.ts` — test (34/34 pass)
