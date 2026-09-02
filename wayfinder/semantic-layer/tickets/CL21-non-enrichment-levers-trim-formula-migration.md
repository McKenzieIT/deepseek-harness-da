---
type: task
status: open
blocked_by: []
---

# CL-21: sql-judge 78% 推进——trim/概念formula/迁移（非 enrichment）

## Question

CL-17 部分关闭后的剩余：overall 70.8% < 78%。enrichment 杠杆已尽（labels 已在，概念 case 仍拒）。真正剩余 3 杠杆（皆非 "add labels"）：

1. **trim 过度 enrich 的表**：`univ_role_tag_df` 12 alt_labels（应 ≤6 targeted；ARPU/ARPPU/流失/LTV/首充/首次充值 generic 稀释 BM25——CL-9 教训）。08-31 日志称 "trimmed to 6" 但文件实有 12-14 → 未完全落地。审计其他 over-enriched 表（08-31 涉及 6 表）。
2. **概念 formula/定义**：大R 阈值（`pay_amt_std >= X`）/回归 标识字段（`is_return`/`react`）——agent 不知用 `pay_amt_std` 定义大R（live: `voice_026`/`028` 有时发明阈值，非确定性）。需 concept YAML 加 formula 字段（可能需 CL-2 concept schema 扩展）或表 alt_label 带口径。
3. **迁移真不可答 EXEC-refusal→DELIVERY**：`018`（PVE 最终关卡）/`071`（小队）/`058`/`064`/`066`/`070`（多表/缺字段）——拒绝质量高，DELIVERY judge 可打高分（CL-12/14/15 先例）。

## 背景

- CL-17 partial（enrichment 已尽；本票接剩余 3 杠杆）。
- 概念 case（`voice_026`/`028`/`alias_022`/`038` 大R/回归）08-31 已 enrich 但仍拒 → 需 formula 非 label。
- 验证需 eval（`scripts/run-eval.sh`）；注意 CL-22（dup 清理 BM25 效应待查）。

## 验收

- overall ≥78%。
- 概念 case（大R/回归）≥2 翻转。
- trim 无 BM25 稀释回归（对比 eval）。
- 全量 eval + compare + experiment-log。

## 关键文件

- 语义层：`examples/k11-semantic-layer/tables/`、`concepts/`
- concept schema（若扩 formula）：`packages/data/semantic-layer/src/`（CL-2 ConceptKindPlugin）
- eval cases：`packages/eval/eval/cases/k11-v2/`
- eval wrapper：`scripts/run-eval.sh`
- 实验日志：`wayfinder/semantic-layer/research/experiment-audit-log.md`
