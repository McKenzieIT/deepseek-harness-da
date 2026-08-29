# CL-5 — 检索策略覆盖率梯度实验实施

**Type**: task
**Phase**: context-layer-alignment
**Status**: open (infrastructure done, experiment run pending)
**Assignee**: claude
**Blocked by**: 无（CL-4 已完成 2026-08-29）
**Blocks**: 无
**Related**: [CL-3](CL3-retrieval-strategy-experiment.md)（D3/D4 毕业）、[P3](P3-ontology-nl2sql-integration.md)（先例）

## Question

实施覆盖率梯度实验，验证检索策略在不同图谱覆盖率下的表现，找到 C 策略（子图投射 + BM25 fallback）超过 B 策略（always-fused）的拐点。

### 实验设计

**自变量 1：图谱覆盖率**

| Level | 构造方式 |
|-------|---------|
| 0 | 剥离所有 alt_labels 和 concept，纯 BM25 |
| 1 | 当前状态（10 concept，现有 alt_labels） |
| 2 | 模拟中等覆盖：enrichment 使 ~50% case 可通过 alias 命中 covered_assets |
| 3 | 模拟高覆盖：enrichment 使 ~90% case 可通过 alias 命中 covered_assets |

Level 2/3 通过运行 `discover_alt_labels` + 手动补充 concept 构造。

**自变量 2：Fallback 机制**

- **硬切换**：coverage >= threshold 时用子图，否则降级 BM25。Threshold sweep: 0.3, 0.5, 0.7, 0.9
- **连续混合**：`final_score = coverage × graph_score + (1 - coverage) × bm25_score`，无阈值

**因变量**

- 主指标：precision@K、recall@K（K = topK 配置，默认 20），ground truth = case `covered_assets`
- 辅指标：端到端 pass_rate（在 Level 1 和 Level 3 各跑一轮 batch eval 作 sanity check）

### 关键推论

A/B/C 是同一公式的特例：
- A ≈ 硬切换，阈值极低（任何 alias 命中就跳过 BM25）
- B ≈ 连续混合，权重固定（不随 coverage 变化，当前 ALIAS_BOOST=2.0）
- C ≈ 连续混合，权重随 coverage 变化

实验本质 = 找最优 blending 函数 f(coverage) → weight。

### 输出

- 检索级指标对比表（4 level × N fallback 配置）
- B vs C 的 recall@K 随覆盖率变化曲线
- 拐点分析：C 超过 B 的最低覆盖率
- Alias 质量筛查报告（per-alias precision 统计 + 可疑 alias 列表）

## Progress: Infrastructure (2026-08-30)

新包 `@deepseek-ai/dsh-retrieval-experiment`（`packages/eval/retrieval-experiment/`）已实现，33 tests 全绿，tsc clean。

### 已完成组件

1. **Level 0–3 图谱快照机制**（`graph-snapshot.ts`）：
   - `buildGraphSnapshot(semanticRoot, config, label)` — 核心函数，从磁盘加载定义后在内存中变换
   - `snapshotLevel0` — 剥离所有 alt_labels + concepts，纯 BM25 基线
   - `snapshotLevel1` — 当前状态原样使用
   - `snapshotLevel2/3` — 通过 `extraAliases` + `extraConcepts` 注入扩展
   - 复制了 `SemanticLayerService.getRelationGraph()` 的图构建逻辑为独立纯函数
   - 返回冻结的 `{ graph: RelationGraph, linker: Bm25Linker, stats }` 对

2. **Blending 函数变体**（`blending.ts`）：
   - `strategyB` — 当前生产行为（BM25 + alias boost + graph expand），`aliasBoost` 参数化
   - `hardSwitch` — coverage >= threshold 纯子图，否则纯 BM25，`threshold` 参数化
   - `continuousBlend` — `final = coverage × graph + (1-coverage) × bm25`
   - `computeQueryCoverage` — 查询词中 alias 命中比例（0–1）
   - `runRetrieval` — 统一调度入口

3. **检索级指标 harness**（`metrics.ts` + `harness.ts`）：
   - `computeRetrievalMetrics(retrievedIds, coveredAssets, K)` → `{ precisionAtK, recallAtK }`
   - `aggregateMetrics` — mean/median 聚合
   - `runExperiment(opts)` — 批量跑 case set × config 矩阵 → `ComparisonTable`
   - `formatComparisonTable` — 渲染 markdown 对比表

### 待做（下一 session）

- 用 K11 80 cases + CL-4 补充 cases 跑 L0/L1 × 3 策略基线实验
- 构造 L2/L3 快照（运行 `discover_alt_labels` 扩展 + 手动补充 concept）
- 跑完整梯度实验矩阵 + 生成对比表/曲线
- Alias 质量筛查
