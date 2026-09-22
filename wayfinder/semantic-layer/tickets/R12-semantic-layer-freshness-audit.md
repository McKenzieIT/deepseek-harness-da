---
type: research
status: resolved
assignee: codex
blocked_by: []
---

# R12: 语义层设计时效性、遗留项与 Ontology 结合审计

## Question

以 2026-09-18 的仓库状态为准，审查当前语义层设计与实现，并回答：

1. 2026-08-18 至 2026-09-18 的相关一手研究是否使现有 Context Layer、检索、Ontology、信任信号或组织记忆决策过时？
2. 地图、ticket、代码和测试之间还存在哪些未完成、失真或失去依赖关系的改造项？
3. `wayfinder/semantic-layer/` 下哪些 session prompt 已完成、被后续决策取代或引用失效，应归档而非继续作为入口？
4. 当前语义层与 Ontology/知识图谱的结合已落到哪些真实生产路径，哪些仍只是声明、实验或远期规划？

## Scope

研究审计。优先使用 2026-08-18 至 2026-09-18 发布的一手论文、官方技术文档和仓库代码；区分已实现事实、地图声明、实验结论与建议。产出写入 `research/r12-semantic-layer-freshness-audit.md`。

## Answer

完整审计见 [R12 研究报告](../research/r12-semantic-layer-freshness-audit.md)。

结论：现有方向未过时，但完成度被高估。Ontology 已进入定义模型、alias 检索、关系扩展、join prompt/critic 和图 UI 的部分路径；生产与 eval 对 concept/metric 的消费不同，lineage 不保方向，trust 缺 provenance，管理 agent/patrol 尚未形成真实自演化闭环。R9 的“统一行业定义”、R10 的“prompt caching 零风险约省 70%”、CL-5 的 continuous-blend 最优性和 goal 部分覆盖 Organizational Memory 均需修订。25 份 session prompt 均不应原样继续使用。

本审计新增 [G8](G8-ontology-execution-auditability.md)、[CL-30](CL30-hybrid-retrieval-fusion-revalidation.md)、[W21](W21-production-schema-provider.md)、[W22](W22-patrol-real-edit-composition.md) 与 [A21](A21-map-prompt-hygiene.md)。
