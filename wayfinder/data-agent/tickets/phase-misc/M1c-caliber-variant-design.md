# M1c-caliber-variant-design — 口径变体（caliber）设计：内嵌冗余 vs 独立字典 + 前沿方案

**Type**: research（AFK；M1 决策 7 前置实验）
**Phase**: misc
**Assignee**: wayfinder-session 2026-08-24
**Status**: Open（research subagent fired）
**Surfaced by**: M1 grilling 决策 7（caliber_variants 回填）——用户质疑"口径变体内嵌表自身 yaml 是否与跨表信息产生大量冗余文本"+"前沿研究如何解决口径问题"。
**Scope**: 口径（caliber）作为 metric 维度的设计——内嵌 vs 独立口径字典 + 前沿 metric layer 方案调研。
**Question**: dsh 的口径变体（caliber_variants）当前内嵌在 table/event 的 metrics 块，是否产生跨表冗余？reverse-bi（能力源）的真实 caliber_variants 设计是什么？前沿 metric layer（dbt MetricFlow / Cube.js / Looker LookML）如何解决口径/measure 问题？dsh 应采什么形态？

## 实验任务

1. **rbi 真实设计**：reverse-bi 仓（/Users/mckenzie/workspace/reverse-bi 或 research 笔记 wayfinder/data-agent/research/reverse-bi-*.md）查 CaliberVariant 完整 schema + 用法。dsh 的 MetricDefSchema caliber_variants = {id, description, default}（无 expr）——rbi 的 caliber_variants 是否带 expr？多口径 expr 怎么表达（caliber_variants 各带 expr vs 多 metric）？rbi 是否有独立口径字典？

2. **前沿 metric layer**：调研（web search + 文档）dbt Semantic Layer/MetricFlow、Cube.js、Looker LookML 的 measure/口径设计：
   - 多口径（账号DAU/设备DAU/角色DAU）怎么表达？多 measure vs 单 measure + 口径变体？
   - 口径定义放哪？内嵌 model/cube/view vs 独立口径字典？
   - 有无冗余问题 + 怎么解？

3. **dsh 冗余评估**：基于 K11 实际（账号/设备/角色口径跨表共用），评估口径内嵌 table yaml metrics 块的冗余程度。若口径独立字典（如 terminology.yaml 同级的 calibers.yaml）+ metric 引用 caliber id，是否消冗余？

4. **推荐**：dsh 应采什么形态？(a) 内嵌 caliber_variants（现状，带冗余）；(b) 独立口径字典 + metric 引用；(c) 多 metric 表达多口径（不引入 caliber 概念）；(d) 其他。

## 报告要求

< 800 字，给 rbi file:line + 前沿方案对比表 + dsh 冗余评估 + 推荐形态。若推荐改变 M1 决策 7（caliber 回填）或 C 重构（MetricDefinition schema），明示。
