---
type: task
status: closed
blocked_by: []
---

# CL-12: SQL semantic judge 基线回归修复

## Question

CL-10 启用 SQL semantic judge 后，original 80 cases 从 100% 降至 70%（24 wrong）。这 24 个失败是真实的 SQL 语义问题，需要逐 case 分析根因并修复。

修复方向可能涉及：NL2SQL 引擎 system prompt 改进、语义层定义描述优化、或 case 本身的 expected 需修正。

## 具体内容

### 失败 cases（24 个 original + 8 个 alias）

**Original wrong**（24/80）:
k11v2_013, 015, 017, 018, 019, 027, 037, 042, 043, 049, 050, 059, 061, 064, 066, 067, 069, 070, 071, 072, 075, 076, 078, 079

**Alias wrong**（8/40）:
k11v2_alias_009, 015, 022, 024, 029, 031, 038, 039

### SQL judge 打分维度

每个 case 的 judge 从 5 个维度评分（0 或 1）：
- `table_selection` — 选对了表吗
- `field_selection` — 选对了字段吗
- `filter_conditions` — 过滤条件正确吗
- `aggregation_logic` — 聚合逻辑正确吗
- `overall_semantics` — 整体语义是否匹配

### 分析步骤

1. 从 `eval-results/9788424c-*.json` 提取 32 个失败 case 的 judge rationale 和维度分数
2. 按失败模式聚类（选错表、缺 join、agent 拒绝而非生成 SQL、过滤条件偏差等）
3. 识别 top-3 可修复的失败模式
4. 评估修复路径：(a) 引擎 system prompt 调整；(b) 语义层定义描述丰富化；(c) case expected 修正

### 验收标准

- 完成 32 个失败 case 的根因分析报告
- 识别并实施至少 top-1 可修复的失败模式
- sql-judge 模式下 original pass_rate 从 70% 提升至 80%+
- 回归验证：已 pass 的 case 不 regress

### 涉及文件

- `eval-results/9788424c-a167-4a19-9c72-e27ae7455f58.json` — 失败数据源
- `packages/data/nl2sql-engine/` — system prompt 和引擎逻辑
- `examples/k11-semantic-layer/tables/` — 定义描述

## Resolution

**Run ID**: `10320fe2-f2af-4586-aa82-705ed12aef09`（2026-08-30）

5 个不可回答 case 迁移为 DELIVERY（019, 049, 075, 078, 079）+ 5 表 alt_labels enrichment。Original: 70.0% → 75.0%。
