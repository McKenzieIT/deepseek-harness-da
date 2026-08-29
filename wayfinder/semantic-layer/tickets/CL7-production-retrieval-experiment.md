# CL-7 — 生产管线检索级实验

**Type**: task
**Phase**: context-layer-alignment
**Status**: resolved
**Assignee**: claude
**Blocked by**: [CL-6](CL6-tokenizer-fix-and-continuous-blend.md)
**Blocks**: [CL-8](CL8-e2e-eval-go-nogo.md)

## Resolution

**B = C（blending 公式无影响）**。真正的 bug = alias-resolved 候选 scoring 过低（ALIAS_BOOST=2.0 vs BM25=30–40），被 topK cap 丢弃。**Alias resolution 自 CL-1 起在生产中实质失效。**

Median-floor 修复后（`score = max(原始, medianBm25)`），B(L3)=C(L3)=0.804，120 case 中 0 差异。Enrichment 是唯一杠杆（L1→L3 +17.5pp）。

⚠️ 实验过程经历 3 次 run：Run 1 两者均未修复→B=C=0.467；Run 2 仅修复 C→C 看似大幅优于 B（+32.5pp，为实验偏差）；Run 3 两者均修复→B=C=0.804。最终结论基于 Run 3。

B 的 `applyAliasFusion` 已同步修复 median-floor（独立 bug fix，非实验设计的一部分——该 bug 自 CL-1 起存在，不分 B/C）。

完整报告：[research/cl7-production-pipeline-experiment-report.md](../research/cl7-production-pipeline-experiment-report.md)

## Question

在生产管线（含 query expansion、enriched linker cache、graph expand、qualify 全路径）上验证 continuous-blend 是否仍优于 strategy-b，以及 enrichment 的真实 recall 增益。

### 2a. 构造 L2/L3 enrichment

用 `discover_alt_labels` 或手工映射为当前缺 alias 的表生成 alt_labels。写入 K11 语义层 YAML。

### 2b. 写检索级实验脚本（走生产管线）

直接构造 Cordis context，挂载 SemanticLayerService，调 `search_data_sources` tool 的 `execute`。

对比矩阵：
- B（L1）：当前状态 + strategy-b
- C（L1）：当前状态 + continuous-blend
- B（L3）：enriched 后 + strategy-b
- C（L3）：enriched 后 + continuous-blend

### 2c. 决策门

- C vs B 的 delta 在生产管线上是否一致？
- Query expansion 对两种策略的影响？
- Enrichment（L1→L3）的真实 recall 增益？

如果生产管线 C 没赢 B，先排查原因再决定是否进入 CL-8。
