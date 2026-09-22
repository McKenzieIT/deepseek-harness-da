# CL-5 检索策略正式实验（三步）

## 上下文

CL-5 原型级验证已完成（`packages/eval/retrieval-experiment/` + `research/cl5-retrieval-gradient-experiment-report.md`），结论：
- Continuous-blend（C 策略）在所有覆盖率下 ≥ Strategy B，方向确认
- B 有 recall 天花板（只 boost 不引入新候选）
- Hard-switch 因 CJK bigram 稀释无效
- Tokenizer 对混合 CJK/ASCII query 不生成 bigram 是确定性 bug
- Alias 覆盖率是最大杠杆

但原型存在五个偏差（非生产代码、tokenizer 已修改、L2/L3 手工构造、缺管线组件、C 公式朴素），绝对值不可直引用。本 session 做正式实验。

## 关键文件

- 生产检索入口：`packages/data/tool-search-data-sources/src/index.ts`
  - `applyAliasFusion()` — 当前 Strategy B 实现，ALIAS_BOOST=2.0 硬编码
  - `extractQueryTerms()` — 有 CJK/ASCII 混合 bigram bug
  - `applyGraphExpansionAndJoins()` — graph expand（不变）
  - `Config` — 工具配置 schema
  - `searchDataSources()` — BM25 检索投影
- 图谱：`packages/data/semantic-layer/src/relation-graph.ts`（RelationGraph, resolveAlias）
- BM25：`packages/data/nl2sql-engine/src/bm25-linking.ts`（Bm25Linker）
- Graph expand：`packages/data/nl2sql-engine/src/ontology.ts`（expandCandidates）
- Alt-labels 发现工具：`packages/data/tool-discover-alt-labels/`（discover_alt_labels）
- K11 语义层：`examples/k11-semantic-layer/`（321 tables + 453 events + 10 concepts）
- Eval cases：`packages/eval/eval/cases/k11-v2/`（80 原始 + 40 alias-dependent = 120 total）
- Eval runner：`packages/eval/eval-runner/src/runner.ts`（runBatch）
- 原型实验包（参考）：`packages/eval/retrieval-experiment/`
  - `src/blending.ts` 的修复版 `extractQueryTerms` 可作为 tokenizer 修复参考
  - `scripts/run-gradient.ts` 的 L2/L3 alias 映射可作为 enrichment 目标参考

## Step 1：修 tokenizer + 实现 continuous-blend 可配置

### 1a. 修复 extractQueryTerms

文件：`packages/data/tool-search-data-sources/src/index.ts`

当前 bug：`extractQueryTerms` 对 CJK/ASCII 混合 token（如"氪金超过500元的玩家"）整体做 CJK regex 检测，因含 ASCII 字符检测失败，不生成 bigram。39% 的 K11 eval query 受影响。

修复方案：在 CJK/非CJK 边界分段，对每个 CJK 段独立生成 bigram。参考 `packages/eval/retrieval-experiment/src/blending.ts` 的 `extractQueryTerms` 修复版实现。

验证：
- 现有 `tool-search-data-sources` tests 全绿（`packages/data/tool-search-data-sources/tests/`）
- "这个月氪金超过500元的玩家有多少" 应生成包含 "氪金" 的 terms
- "ARPPU是多少" 应生成 "arppu" + "是多" + "多少"

### 1b. 实现 continuous-blend 作为可配置 blending mode

文件：`packages/data/tool-search-data-sources/src/index.ts`

在 `applyAliasFusion` 旁新增 `applyContinuousBlend` 函数，逻辑：
1. 计算 query coverage = terms_with_alias_hits / total_terms（用 `extractQueryTerms` + `graph.resolveAlias`）
2. BM25 pass：score 按 `(1 - coverage)` 加权
3. Graph pass：alias resolve → 命中节点 + 1-hop 邻居 → score 按 `coverage` 加权
4. 合并去重，按 final score 排序

在 Config 中新增：
```typescript
readonly blendingMode?: 'strategy-b' | 'continuous-blend'  // default 'strategy-b'
```

在 `execute` 中按 `config.blendingMode` 分派（`applyAliasFusion` vs `applyContinuousBlend`），不改动其余管线（query expansion、ctx.retrieval、graph expand、qualify 均不变）。

验证：
- 所有现有 tests 不变（默认 strategy-b）
- 新增 tests：continuous-blend 路径、coverage 计算、graph pass 引入新候选

### 1c. 确认全量 tests 通过

```bash
pnpm test -- packages/data/tool-search-data-sources
pnpm test -- packages/data/semantic-layer packages/data/nl2sql-engine
```

## Step 2：构造 L2/L3 + 检索级实验（生产管线）

### 2a. 用 discover_alt_labels 构造 L2/L3 定义

在 `examples/k11-semantic-layer/` 上跑 `discover_alt_labels`（需 LLM 接入），为当前缺 alias 的 25 个 covered_assets 表生成 alt_labels。写入 YAML 后作为 L2/L3 状态。

如果 LLM 不可用，退而求其次：用原型实验的 L3 alias 映射（`retrieval-experiment/scripts/run-gradient.ts` 中的 `L3_ALIASES`）手动写入 YAML 文件，但需在报告中标注为手工构造。

构造完后验证：
```bash
pnpm test -- packages/data/semantic-layer/tests/k11-seed.spec.ts
```

### 2b. 写检索级实验脚本（走生产管线）

不用 `retrieval-experiment` 包的 blending 函数——直接构造 Cordis context，挂载 SemanticLayerService，调 `search_data_sources` tool 的 `execute`。

```typescript
// 伪代码结构
for (const blendingMode of ['strategy-b', 'continuous-blend']) {
  // 构造 Cordis app，挂载 semantic-layer + tool-search-data-sources
  // config.blendingMode = blendingMode
  for (const case of cases) {
    const result = await toolExecute('search_data_sources', { query: case.question, top_k: 20 })
    const retrievedIds = result.candidates.map(c => c.id)
    // 计算 precision@K, recall@K vs case.covered_assets
  }
}
```

关键：这跑的是真实管线，含 query expansion、enriched linker cache、graph expand、qualify 全路径。

对比矩阵：
- B（L1）：当前状态 + strategy-b
- C（L1）：当前状态 + continuous-blend
- B（L3）：enriched 后 + strategy-b
- C（L3）：enriched 后 + continuous-blend

### 2c. 输出检索级实验报告

格式同 `research/cl5-retrieval-gradient-experiment-report.md`，但标注为"生产管线实验"。重点对比：
- C vs B 的 delta 在生产管线上是否一致
- Query expansion 对两种策略的影响
- Enrichment（L1→L3）的真实 recall 增益

## Step 3：端到端 eval 验证

### 3a. 配置 eval runner

使用 W3 `runBatch`（`packages/eval/eval-runner/src/runner.ts`），需要：
- **AgentResponder**：真实 data-agent（含 search_data_sources → load_definition → query_data 全链路）。如果无法接入真实 agent，用 `SqlJudge`-only 模式（SQL 语义判别，不执行 ODPS）。
- **Case paths**：120 个 K11 case YAML
- **pass_k**：建议 1（检索确定性，LLM 是主要随机源，pass_k=1 节省成本，多轮取代 pass_k）

### 3b. 跑对比

| Run | blendingMode | 语义层状态 | 说明 |
|-----|-------------|-----------|------|
| run-b-l1 | strategy-b | L1（当前） | 基线 |
| run-c-l1 | continuous-blend | L1（当前） | C vs B |
| run-c-l3 | continuous-blend | L3（enriched） | C + enrichment |

每个 run 产出 JSONL（W3 persistence），然后用 W4 `beforeAfterDelta` 做 flip 分析：
- run-b-l1 vs run-c-l1 → C 策略切换的 flip（哪些 case 变好/变差）
- run-c-l1 vs run-c-l3 → enrichment 的 flip

### 3c. 决策

- 如果 run-c-l1 pass_rate > run-b-l1 且无严重 regression（flip 分析无致命 case）→ **切换生产为 continuous-blend**
- 如果 run-c-l3 pass_rate 显著 > run-c-l1 → **确认 enrichment 投资优先级**
- 如果 C 的 pass_rate ≤ B → **不切换**，检索级优势未转化为端到端优势，需分析原因（可能是 noise candidates 干扰 NL2SQL）

### 3d. 输出端到端实验报告

更新 `research/cl5-retrieval-gradient-experiment-report.md`，新增"端到端验证"章节，含 pass_rate、flip 分析、最终决策。

## 注意事项

- Step 1 是确定性代码改动（bug fix + feature），不依赖实验结果，直接做
- Step 2 是低成本验证（无 LLM 调用，除非跑 discover_alt_labels），主要验证生产管线行为
- Step 3 是高成本验证（LLM + 可能 ODPS），是最终决策依据。如果 Step 2 的生产管线结果与原型不一致（C 没赢 B），应先排查原因再决定是否跑 Step 3
- 全程用 `/wayfinder semantic-layer/map.md CL-5` 跟踪进展
