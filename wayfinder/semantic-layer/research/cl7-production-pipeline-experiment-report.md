# CL-7 生产管线检索级实验报告

> 关联票：[CL-5](../tickets/CL5-retrieval-gradient-experiment.md)（原型实验）、[CL-6](../tickets/CL6-tokenizer-fix-and-continuous-blend.md)（代码实现）、[CL-7](../tickets/CL7-production-retrieval-experiment.md)（本实验）

## 1. 实验目的

在**生产管线**（SemanticLayerService + tool-search-data-sources 的 execute 全路径）上验证 continuous-blend（C 策略）是否优于 strategy-b（B 策略），以及 enrichment 的真实 recall 增益。

## 2. 实验设置

### 2.1 生产管线组件

| 组件 | 来源 | 说明 |
|------|------|------|
| BM25 corpus | `SemanticLayerService.loadRetrievalCorpusAll()` | 4692 items（328 tables + 3919 metrics + 3207 events） |
| Relation graph | `SemanticLayerService.getRelationGraph()` | 含 aliasIndex 反向索引 |
| Blending | `applyAliasFusion` (B) / `applyContinuousBlend` (C) | 通过 `Config.blendingMode` 分派 |
| Graph expansion | `applyGraphExpansionAndJoins()` | 1-hop joins + derived_from 邻居 |
| Query expansion | **禁用** (`config.queryExpansion=false`) | 无 LLM provider |
| Qualification | **不可用** | 无 `ctx.query` provider |

### 2.2 自变量

| 变量 | 值 |
|------|-----|
| Blending mode | `strategy-b` (B) / `continuous-blend` (C) |
| 语义层状态 | L1（4 表有 alt_labels，56 aliases）/ L3（28 表有 alt_labels，~150 aliases） |

L3 aliases 来源：CL-5 梯度实验的 `L3_ALIASES` 映射，手工写入 YAML（非 `discover_alt_labels` 自动生成）。

### 2.3 数据集

120 cases = 80 原始 k11-v2 + 40 CL-4 alias-dependent cases。topK=20。

## 3. 中间发现：alias-resolved 候选被 topK cap 丢弃

### 3.1 Run 1：B 和 C 均未修复 alias scoring

首次运行 **C = B（零 delta）**。

诊断：生产 BM25 corpus 含 3919 virtual metrics，BM25 top-20 以 metric ID 为主。Alias 解析返回 table-level ID，与 metric ID 不交叉。两种策略添加的 alias-resolved 候选 score 均远低于 BM25 score：
- B：`ALIAS_BOOST × hitCount = 2.0`，BM25 score = 30–40（差 15–20×）
- C：`coverage × hitCount/maxGraph ≈ 0.18`，BM25 normalized = 0.5–0.82（差 3–4×）

`applyGraphExpansionAndJoins` 从 `[...candidates]`（含 alias 候选）开始，但 `candidates.length > topK` 时立即 `break`，然后 `slice(0, topK)` 丢弃所有排在末尾的 alias 候选。

**结论：alias resolution 在生产管线中自 CL-1 起实质失效。** 不分 B 或 C。

### 3.2 Run 2：仅修复 C（median-floor）

| Config | Mean R@20 |
|--------|-----------|
| B(L1)  | 0.467 |
| C(L1)  | 0.629 |
| B(L3)  | 0.479 |
| C(L3)  | 0.804 |

看似 C 大幅优于 B（+32.5pp at L3）。但这是因为 C 有 median-floor 修复而 B 没有。

### 3.3 Run 3：B 和 C 均修复 alias scoring

对 B 的 `applyAliasFusion` 也应用 median-floor：`score = max(ALIAS_BOOST × capped, medianBm25)`。

| Config | Mean R@20 | Median R@20 | Mean P@20 | Orig R@20 | Alias R@20 |
|--------|-----------|-------------|-----------|-----------|------------|
| B(L1)  | **0.629** | 1.000       | 0.034     | 0.456     | 0.975      |
| C(L1)  | **0.629** | 1.000       | 0.034     | 0.456     | 0.975      |
| B(L3)  | **0.804** | 1.000       | 0.045     | 0.744     | 0.925      |
| C(L3)  | **0.804** | 1.000       | 0.045     | 0.744     | 0.925      |

**B = C 完全相同。** 120 case 中 0 improved, 0 regressed, 120 unchanged。

## 4. 最终结果

### 4.1 B vs C：无差异

Blending 公式（固定 boost vs coverage-weighted）对 recall@20 无影响。两者在 alias-resolved 候选正确 scoring 后产生完全相同的候选集。

### 4.2 Enrichment：唯一杠杆

| | L1 | L3 | Delta |
|---|---|---|---|
| B = C | 0.629 | **0.804** | **+17.5pp** |

L1→L3 的 +17.5pp 完全来自 alias 覆盖率提升（4 表→28 表有 alt_labels）。

### 4.3 Flip 分析（L1 → L3，B 和 C 相同）

27 improved, 2 regressed, 91 unchanged。

回退案例：
- `k11v2_alias_009`（"免费玩家中坚持活跃超过30天的占比"）：新增 alias 候选挤出了原本通过 BM25 命中的目标表
- `k11v2_alias_019`（"各区服新注册角色数排名"）：同上

## 5. 关键发现

### 5.1 CL-5 原型实验 vs 生产管线

| | CL-5 原型 | 生产管线 |
|---|---|---|
| C vs B delta (L3) | +6.7pp | **0pp** |
| 原因 | 原型 C 用 topK×2 BM25 pool | 生产两者用同一 BM25 pool |
| Enrichment L1→L3 (C) | +14.5pp | +17.5pp |

CL-5 原型的 C vs B delta 来自两个原型偏差：(1) C 的 BM25 pool 是 B 的 2 倍；(2) 原型没有 topK cap 问题（自带 expandCandidates 在 slice 之后执行）。在生产管线中这两个偏差消失，C vs B delta = 0。

### 5.2 真正的 bug fix：alias-resolved scoring

修复前（CL-1 以来的生产行为）：
- `applyAliasFusion` 给 alias-resolved 候选 score = `ALIAS_BOOST × hitCount = 2.0–4.0`
- BM25 score = 30–40（4692-item corpus）
- graph expansion `slice(0, topK)` 丢弃所有 alias 候选
- **Alias resolution 自 CL-1 以来在生产中实质失效**

修复后：
- alias-resolved 候选 score = `max(原始 score, medianBm25)`
- 确保至少排在 BM25 中位数位置，不被 topK cap 丢弃
- B 和 C 均已修复

### 5.3 Enrichment 是核心投资方向

| | 修复前 | 修复后 |
|---|---|---|
| B(L1) recall | 0.467 | 0.629 (+16.2pp) |
| B(L3) recall | 0.479 | 0.804 (+32.5pp vs 修复前 L1) |

修复 alias scoring 本身就带来 +16.2pp（L1）。叠加 enrichment 再加 +17.5pp。两者乘积效应：L1 修复前 0.467 → L3 修复后 0.804 = **+33.7pp**。

## 6. 实验局限性

| 偏差 | 说明 |
|------|------|
| 无 query expansion | 生产会有 LLM 扩展，可能进一步提升 recall |
| 无 qualification | 候选 ID 未加 ODPS project 前缀 |
| L3 alias 手工构造 | 质量可能高于 LLM 自动发现 |
| Recall 不区分排序 | B 和 C 可能在 MRR/precision 上有差异（未测） |

## 7. 结论与行动建议

1. **Blending 公式无影响** — B 和 C 结果完全相同（120/120 unchanged）。默认已切换为 `continuous-blend`（架构更清晰、coverage-weighted），`strategy-b` 保留为可配置选项
2. **alias-resolved scoring fix 必须 ship** — 修复了自 CL-1 以来的生产 bug（B 和 C 均已修复 median-floor）
3. **加速 enrichment** — 这是 recall 提升的唯一杠杆（+17.5pp per round）
4. **CL-8 端到端 eval** — 验证检索级改善是否转化为 SQL 准确率提升
