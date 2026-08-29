# CL-5 — 检索策略覆盖率梯度实验实施

**Type**: task
**Phase**: context-layer-alignment
**Status**: resolved
**Assignee**: claude
**Blocked by**: 无（CL-4 已完成 2026-08-29）
**Blocks**: 无
**Related**: [CL-3](CL3-retrieval-strategy-experiment.md)（D3/D4 毕业）、[P3](P3-ontology-nl2sql-integration.md)（先例）

## Question

实施覆盖率梯度实验，验证检索策略在不同图谱覆盖率下的表现，找到 C 策略（子图投射 + BM25 fallback）超过 B 策略（always-fused）的拐点。

## Resolution

**完整实验报告**：[research/cl5-retrieval-gradient-experiment-report.md](../research/cl5-retrieval-gradient-experiment-report.md)

### 实验基建

新包 `@deepseek-ai/dsh-retrieval-experiment`（`packages/eval/retrieval-experiment/`），33 tests 全绿，tsc clean。

- **graph-snapshot.ts**：Level 0-3 图谱快照构造器（stripAliases/stripConcepts/extraAliases/extraConcepts）
- **blending.ts**：三策略变体（strategy-b / hard-switch / continuous-blend）+ 改进版 tokenizer（CJK/ASCII 混合边界分段 bigram）
- **metrics.ts**：precision@K / recall@K + 聚合
- **harness.ts**：批量实验 runner + markdown 对比表

### Tokenizer 发现

生产 `extractQueryTerms`（`tool-search-data-sources`）对含 ASCII/数字的中文 query 无法生成 CJK bigram（47/120 cases 受影响）。实验包修复了此问题：在 CJK/非CJK 边界分段后再生成 bigram。**此修复应回写生产代码**。

### 实验结果

120 cases（80 原始 k11-v2 + 40 CL-4 alias-dependent），topK=20。

**覆盖率梯度**

| Level | Alias 数 | Concept 数 | Alias→covered_asset 命中率 |
|-------|---------|-----------|--------------------------|
| L0    | 0       | 0         | 0.0%                     |
| L1    | 56      | 10        | 31.7%                    |
| L2    | 111     | 10        | 66.7%                    |
| L3    | 146     | 10        | 75.8%                    |

**完整对比表**

| Config                  | Mean R@20 | Median R@20 | Orig R@20 | Alias R@20 |
|-------------------------|-----------|-------------|-----------|------------|
| L0 / strategy-b         | 0.383     | 0.000       | 0.463     | 0.225      |
| L0 / continuous-blend   | 0.388     | 0.000       | 0.469     | 0.225      |
| L1 / strategy-b         | 0.467     | 0.000       | 0.463     | 0.475      |
| L1 / continuous-blend   | 0.504     | 0.500       | 0.469     | 0.575      |
| L2 / strategy-b         | 0.467     | 0.000       | 0.463     | 0.475      |
| L2 / continuous-blend   | 0.525     | 0.500       | 0.500     | 0.575      |
| L3 / strategy-b         | 0.467     | 0.000       | 0.463     | 0.475      |
| L3 / continuous-blend   | 0.533     | 0.750       | 0.512     | 0.575      |

（hard-switch 在所有阈值×所有 level 下等同 strategy-b，省略。）

**C vs B 拐点分析**

| Level | B (strategy-b) | C (continuous-blend) | Delta |
|-------|---------------|---------------------|-------|
| L0    | 0.383         | 0.388               | +0.4pp |
| L1    | 0.467         | 0.504               | +3.7pp |
| L2    | 0.467         | 0.525               | +5.8pp |
| L3    | 0.467         | 0.533               | +6.7pp |

**C 在所有 level 都赢 B**，delta 随覆盖率单调递增。无拐点——C 从 L0 开始就优于 B。

### 关键结论

1. **Continuous-blend（C 策略）确认为最优方向**：在所有覆盖率下都 ≥ strategy-b，且增益随覆盖率增长。L3 相对 L0 提升 +15pp recall@20。

2. **Strategy-b 有 recall 天花板（0.467）**：B 只 boost 已在 BM25 结果中的候选项，不引入新候选。L1→L2→L3 增加 alias 对 B 零增益，因为瓶颈不在 scoring 而在 candidate set。

3. **Hard-switch 无效**：query 级 coverage 因 CJK bigram 稀释始终很低（<0.3），阈值永远达不到，全部降级纯 BM25。**不推荐作为生产策略**。

4. **Tokenizer 是隐藏瓶颈**：生产 `extractQueryTerms` 对混合 query 不生成 CJK bigram，导致 40% 的 query alias resolution 完全失效。修复后 L1 hit rate 从 19.2% 跳到 31.7%。

5. **Alias 覆盖率是核心杠杆**：L0→L3 recall 从 0.383 跳到 0.533（+15pp），主要驱动力是 alias coverage 而非策略选择。投资 enrichment（discover_alt_labels）比调参回报更高。

### 行动项

1. ✅ 实验基建已完成（`packages/eval/retrieval-experiment/`）
2. **回写 tokenizer 修复**到生产 `tool-search-data-sources/src/index.ts` 的 `extractQueryTerms`
3. **切换生产策略为 continuous-blend**（替代当前 `applyAliasFusion` 固定 boost）
4. **加速 enrichment**（discover_alt_labels 覆盖更多表），这是 recall 提升的最大杠杆
5. L2/L3 alias 映射已保存在 `scripts/run-gradient.ts`，可作为 enrichment 目标参考
