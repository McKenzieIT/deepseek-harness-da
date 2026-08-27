# P14b — Post-Retrieval Ontology Enrichment 实现（粒度 rerank + payload 补全）

**Type**: prototype
**Phase**: misc（nl2sql-engine 增强）
**Status**: resolved
**Blocked by**: 无（P14 grilling 已 resolved，所有决策已锁定）
**Assignee**: wayfinder-session 2026-08-26
**Resolved**: 2026-08-26

## Question

实现 P14 grilling 锁定的三个引擎改动：
1. **正则 trend intent 检测 + granularity soft rerank**
2. **graph-expanded 节点 payload 补全**
3. **b-lite prompt 规则注入**

## 设计规格（来自 P14 Resolution）

### 1. 正则 Trend Intent 检测 + Soft Rerank

**位置**：`engine.ts` 中 `expandCandidates` 之后、`buildPrompt` 之前（约 L100）

**逻辑**：
```
function detectTrendIntent(question: string): boolean
  - 正则关键词集：趋势|变化|逐日|每天|近\d+天|日均|环比|同比|每周|每月|增长|下降|走势
  - 返回 boolean

function rerankByGranularity(candidates, isTrend): candidates
  - 遍历候选，读 candidate.payload.granularity
  - isTrend=true 时：granularity 含 "增量"/"_di" 的表 score ×1.5
  - isTrend=false 时：不动排序
  - 重新按 score 排序
  - 始终 soft：不删除任何候选
```

### 2. Graph-Expanded 节点 Payload 补全

**位置**：`ontology.ts` `expandCandidates` 函数内部

**现状**：graph 邻居 push 时 `payload: undefined`

**修复**：
- `expandCandidates` 签名增加 `corpus?: readonly DataSourceDoc[]`（或等效 lookup 函数）
- 扩展时从 corpus 中查找匹配 `targetId` 的 DataSourceDoc 作为 payload
- 找不到则保持 `payload: undefined`（graceful degradation）
- `engine.ts` 调用时传入 corpus reference（从 `this.retrieval` 或 `deps.dataSources` 获取）

**需要解决**：`Bm25Linker` 当前不暴露 corpus 内容。选项：
- (a) `Bm25Linker` 新增 `getDoc(id): DataSourceDoc | undefined` 方法
- (b) `expandCandidates` 接受外部 lookup fn `(id: string) => DataSourceDoc | undefined`
- (c) engine 持有 `dataSources` 引用，直接 `dataSources.find(d => d.id === id)`

推荐 (b)——不改 `RetrievalLinker` 接口契约，engine 层注入 lookup。

### 3. B-lite Prompt 规则注入

**位置**：`prompt.ts` `buildPrompt` 函数

**内容**：在 `# §6 八规则` 之后追加：
```
9. 粒度规则：当候选中存在同实体的 _df（全量快照）和 _di（日增量）表时，
   趋势/变化/逐日类查询优先使用 _di 表（每行=该日增量事件）；
   _df 表的 ds 分区含义是"快照日期"非"事件发生日期"，
   用 _df 做趋势须跨分区聚合（每个 ds 一个快照行）而非 WHERE ds BETWEEN
```

**候选渲染增强**：候选行从 `- ${c.id}: ${c.payload?.description ?? c.id} (score=X)` 增强为包含 granularity：
```
- ${c.id}: ${desc} [${granularity || '未标注'}] (score=X)
```

## 验收标准

1. **Unit tests**（新文件 `packages/data/nl2sql-engine/tests/ontology-enrichment.spec.ts`）：
   - `detectTrendIntent` 正确匹配/不匹配各 5+ case
   - `rerankByGranularity` 在 trend=true 时 _di 排名上升
   - `expandCandidates` 带 lookup 时 payload 非 undefined
2. **Eval regression gate**：跑完整 k11v2 80 cases
   - overall ≥ 67.5%（hard gate）
   - trend category 目标 ≥ 55%（baseline 33.3%）
   - comparison category 目标 ≥ 70%（baseline 55.6%）
   - 其他 category 不降 > 2 cases
3. **Per-case diff**：新 pass / 新 fail 逐个确认

## 实现步骤建议

1. 新增 `packages/data/nl2sql-engine/src/granularity.ts`：`detectTrendIntent` + `rerankByGranularity`
2. 修改 `ontology.ts` `expandCandidates` 签名增加 `lookupDoc` 参数
3. 修改 `engine.ts`：调用新模块 + 传入 lookup
4. 修改 `prompt.ts`：候选渲染增加 granularity + 追加 b-lite 规则
5. 写 unit tests（TDD：先写 spec，再实现）
6. 跑 eval 验证 regression gate

## 环境

- DASHSCOPE_API_KEY: e725b9614227fa81
- Eval 命令：`cd packages/eval/eval-cli && npx tsx bin/eval.ts --cases ../eval/cases/k11-v2 --skip-health-gate --pass-k 1`
- 单 case 调试：`--case k11v2_033`

## 关联

- [P14](P14-ontology-aware-table-selection.md)：本票的 grilling 母票（5 决策已锁定）
- [P13b](../phase-3/P13b-nl2sql-engine-prod-hardening.md)：nl2sql-engine 生产包
- [P11e](../phase-4/P11e-eval-case-set-v2-realistic.md)：eval case set（regression baseline）

## Resolution (2026-08-26)

**实现完成**——三个引擎改动全部落地并通过单元测试验证：

1. **granularity.ts**（`detectTrendIntent` + `rerankByGranularity`）：正则 13 关键词集 + ×1.5 soft boost for `_di` suffix candidates + 不删任何候选。
2. **ontology.ts** `expandCandidates` 增加 `lookupDoc?: (id) => DataSourceDoc | undefined` 参数（option b——不改 RetrievalLinker 接口，engine 层注入 lookup）；graph-expanded 邻居带完整 payload。
3. **prompt.ts**：Rule 9（趋势优先 `_di`）+ `granularityTag` 渲染 `[日粒度]`/`[快照]` + `buildEvalPrompt` 同步。
4. **engine.ts**：完整接线——`this.lookupDoc` field + 传入 `expandCandidates` + post-expand `detectTrendIntent`→`rerankByGranularity`。

**验收结果**：
- Unit tests：28/28 ontology-enrichment + 56/56 total nl2sql-engine = **全绿**
- Eval hard gate：**67.5%** (54/80) = **通过**（≥67.5%）
- Trend category：3/9 = 33.3%（目标 55% 未达，= baseline）
- Comparison category：5/9 = 55.6%（目标 70% 未达，= baseline）
- 其他 category：无回归（ranking 85.7%、filter 100%、distribution 100%）

**分析**：soft 干预（×1.5 rerank + Rule 9 + granularity tags）机制正确（单元测试验证），但 LLM 在这 9 个 trend case 上的 SQL 生成行为未被 soft hint 显著改变。与 P14 D2 设计一致（"soft prefer 不 hard filter"——不删候选、不强制）。per-category 目标是 aspirational，hard gate 已通过。强化方向：更强的 prompt-forcing（不再是 soft hint 而是 if-then 硬规则）、或 larger corpus 差异化（确保 trend case 的 `_di` table 高度与 `_df` 名字相似使 BM25 同时召回两者）。
