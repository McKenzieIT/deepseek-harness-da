# R1 — 执行级评分与非循环 ground truth 论文认读

**Type**: research  ·  **Status**: resolved
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Branch**: `research/R1-exec-grader-papers`

## Question

Spider、BIRD、Spider 2.0 与 GradeSQL 如何定义并实现 SQL 执行级评分、结果集归一化、多 SQL 等价接受和非循环 ground truth；这些方法映射到 `packages/eval/` 时，哪些事实足以约束后续的 execution-grader seam 与 168-case expected result 派生决策？

## Answer

完整认读与来源见 [执行级评分与非循环 ground truth 论文认读](../research/exec-grader-papers.md)。四套体系没有统一的 execution-match 语义：BIRD 与 GradeSQL 使用 set equality，Spider distilled test-suite 使用 bag equality、列排列和条件式行序，Spider 2.0 使用 focused columns、逐题行序策略与多个答案文件。G1 因而需要显式、可版本化且逐 case 声明的 comparator policy；严格 bag equality、位置列、显式行序、严格 NULL 与无隐式数值容差只是待 R23 mutation baseline 检验的起始 profile，不是论文已经证明的统一默认值。

168 个 K11-v2 case 当前没有 reference SQL；143 个已有 `result_value` 也缺 snapshot、执行 SQL 和可重放 provenance。后续 ground truth 必须由领域人员编写并复核的 reference SQL 在不可变数据库快照上实际执行派生，保存 raw/normalized artifacts、digest 与 policy version；被测模型或同源 LLM 不得成为 gold 的作者或最终裁决者。25 个 delivery-only case 保持非 execution case，不伪造 expected result。
