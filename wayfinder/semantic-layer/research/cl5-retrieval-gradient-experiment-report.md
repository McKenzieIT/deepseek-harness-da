# CL-5 检索策略覆盖率梯度实验报告

> 关联票：[CL-3](../tickets/CL3-retrieval-strategy-experiment.md)（实验设计）、[CL-4](../tickets/CL4-supplement-alias-eval-cases.md)（补充 case）、[CL-5](../tickets/CL5-retrieval-gradient-experiment.md)（实验实施）

## 1. 实验目的

验证 CL-3 的核心假设：A/B/C 三种检索策略是同一 blending 函数 f(coverage)→weight 的特例。通过覆盖率梯度（Level 0–3）× blending 变体，找到最优策略方向。

## 2. ABC 策略定义（CL-1 D4 / CL-3 D3）

| 策略 | 行为 | f(coverage)→weight 特例 |
|------|------|------------------------|
| **A（Graph-first, BM25 fallback）** | alias 命中 → 直接用图结果，skip BM25 | 硬切换，阈值极低（任何命中就切） |
| **B（Always-fused, 当前生产）** | BM25 + alias 并行，alias 命中候选 boost 固定权重（ALIAS_BOOST=2.0） | 固定权重，不随 coverage 变化 |
| **C（Subgraph projection + BM25 fallback）** | 子图投射 + BM25 fallback，权重随覆盖率变化 | 连续函数，coverage 高→图权重高 |

CL-3 D3 推论：实验本质 = 找最优 blending 函数 f(coverage)→weight。

## 3. 实验设置

### 3.1 自变量 1：图谱覆盖率

| Level | 构造方式 | Alias 数 | Concept 数 | Alias→covered_asset 命中率 |
|-------|---------|---------|-----------|--------------------------|
| L0 | 剥离所有 alt_labels + concepts | 0 | 0 | 0.0% |
| L1 | 当前状态 | 56 | 10 | 31.7% |
| L2 | L1 + 14 个高频表注入短 CJK alias | 111 | 10 | 66.7% |
| L3 | L2 + 11 个低频表补全 alias | 146 | 10 | 75.8% |

**L2/L3 构造方法**：从表描述中手动提取 2 字符 CJK 业务关键词（如 `dws_pay_order` → "付费"/"充值"/"订单"），注入为 `extraAliases`。**非** `discover_alt_labels` 自动生成。

### 3.2 自变量 2：Blending 策略

| 实验策略 | 对应 ABC | 实现 | 参数 |
|---------|---------|------|------|
| `strategyB` | B（控制组） | BM25 → applyAliasFusion（固定 boost）→ expandCandidates | aliasBoost=2.0 |
| `hardSwitch` | A 的泛化 | coverage ≥ threshold → 纯子图；否则 → 纯 BM25 | threshold: 0.3/0.5/0.7 |
| `continuousBlend` | C 的朴素近似 | final = coverage × graph_score + (1-coverage) × bm25_score | 无额外参数 |

### 3.3 因变量

- **主指标**：recall@20（ground truth = case.dimensions.covered_assets）
- **辅指标**：precision@20、query coverage

### 3.4 数据集

120 cases = 80 原始 k11-v2 + 40 CL-4 alias-dependent cases。

### 3.5 实验代码

- 包：`packages/eval/retrieval-experiment/`
- 脚本：`scripts/run-gradient.ts`（npx tsx 执行）
- 33 单元测试全绿

## 4. 实验结果

### 4.1 主表（Mean Recall@20）

| | L0 (0%) | L1 (31.7%) | L2 (66.7%) | L3 (75.8%) |
|---|---------|-----------|-----------|-----------|
| **Strategy B** | 0.383 | 0.467 | 0.467 | 0.467 |
| **Hard-switch (t=0.3)** | 0.383 | 0.467 | 0.467 | 0.467 |
| **Hard-switch (t=0.5)** | 0.383 | 0.467 | 0.467 | 0.467 |
| **Hard-switch (t=0.7)** | 0.383 | 0.467 | 0.467 | 0.467 |
| **Continuous-blend** | 0.388 | 0.504 | 0.525 | 0.533 |

### 4.2 C vs B Delta

| Level | B | C | Delta |
|-------|-----|-----|-------|
| L0 | 0.383 | 0.388 | +0.4pp |
| L1 | 0.467 | 0.504 | +3.7pp |
| L2 | 0.467 | 0.525 | +5.8pp |
| L3 | 0.467 | 0.533 | +6.7pp |

C 在所有 level 都 ≥ B，delta 随覆盖率单调递增。

### 4.3 按 case 类型拆分（Recall@20）

| | 原始 80 case | Alias-dependent 40 case |
|---|-------------|------------------------|
| L0 / B | 0.463 | 0.225 |
| L1 / B | 0.463 | 0.475 |
| L1 / C-blend | 0.469 | 0.575 |
| L2 / C-blend | 0.500 | 0.575 |
| L3 / C-blend | 0.512 | 0.575 |

### 4.4 Median Recall@20

| | L0 | L1 | L2 | L3 |
|---|---|---|---|---|
| **B** | 0.000 | 0.000 | 0.000 | 0.000 |
| **C-blend** | 0.000 | 0.500 | 0.500 | 0.750 |

## 5. 观察与解读

### 5.1 B 策略有 recall 天花板

B 在 L1→L2→L3 recall 锁死 0.467。原因：`applyAliasFusion` **只 boost 已在 BM25 结果中的候选**，不引入新候选。BM25 找不到的表，boost 再高无用。

Continuous-blend 的 graph pass 独立于 BM25 引入新候选，所以能突破天花板。

### 5.2 Hard-switch 在所有配置下无效

所有阈值 × 所有 level，hard-switch 结果等同 B。原因：query 级 coverage（"查询词中多少比例命中 alias"）始终极低。中文 query 经 bigram 分词后产生大量非业务词（"的付"、"有多"、"是多"），分母膨胀导致 coverage 永远 < 0.3，100% 降级为纯 BM25。

**结论：基于 query 级 coverage 的硬切换在 CJK bigram tokenizer 下不可行。**

### 5.3 Alias 覆盖率是最大杠杆

L0→L3 continuous-blend recall 从 0.388→0.533（+14.5pp），其中 L0→L1（+11.6pp）贡献最大。alias 覆盖率提升带来的 recall 增益远大于策略选择带来的增益。

### 5.4 Tokenizer 发现

生产 `extractQueryTerms`（`tool-search-data-sources/src/index.ts`）对含 ASCII/数字的中文 query 不生成 CJK bigram。47/120 (39%) 的 query 受影响。实验包修复后 L1 命中率从 19.2% 跳到 31.7%。

## 6. 实验局限性

本实验为**原型级验证（prototype validation）**，以下偏差需注意：

| 偏差 | 说明 | 影响 |
|------|------|------|
| **非生产代码** | blending 函数是重新实现，非 `tool-search-data-sources` 生产路径 | B 的绝对值可能与生产不同 |
| **缺少管线组件** | 无 query expansion（P15a）、无 `ctx.retrieval` hybrid | 生产 recall 可能更高（expansion 帮助） |
| **Tokenizer 已修改** | 实验包修复了 CJK/ASCII 混合 bigram bug | 对比的是"修复后"的行为，非当前生产 |
| **L2/L3 手工构造** | alias 从表描述手动提取，非 `discover_alt_labels` 生成 | alias 质量可能偏高（人工挑选的精准度 > LLM 自动发现） |
| **C 策略公式朴素** | `coverage × graph + (1-coverage) × bm25` 是最简线性混合 | 最优 f(coverage)→weight 可能是非线性的 |
| **无随机性控制** | 检索级实验无 LLM 随机性（确定性），但 alias 质量未做 ablation | 个别 alias 可能 over-fit 特定 case |

## 7. 结论与行动建议

### 可信结论（方向性）

1. **C 方向确认**：continuous-blend 在所有覆盖率下 ≥ B，方向正确
2. **B 有结构性缺陷**：只 boost 不引入新候选 = recall 天花板
3. **Hard-switch 不适合 CJK**：bigram 稀释使 query 级 coverage 无法达到切换阈值
4. **Alias 覆盖率 > 策略选择**：enrichment 投资回报最高

### 行动建议

1. **回写 tokenizer 修复**到 `tool-search-data-sources/src/index.ts` 的 `extractQueryTerms`——这是确定性 bug fix，不依赖实验结论
2. **切换生产策略为 continuous-blend**——需要在生产管线（含 query expansion、ctx.retrieval）中实现并用 eval 验证
3. **加速 enrichment**——跑 `discover_alt_labels` 覆盖更多表，这是 recall 提升的最大杠杆
4. **正式实验**——在生产管线中用 eval pass_rate（而非检索级指标）做端到端验证

### 不可信结论（需正式实验验证）

- 绝对数值（0.383 / 0.467 / 0.533 等）不可直接引用为生产预期
- 线性混合公式是否最优（可能需要非线性、learned weight）
- L2/L3 alias 质量是否代表 LLM 自动发现的真实水平
