# P2 — 低置信 decomposition「改口径」回流 affordance 原型

**Type**: prototype (HITL)
**Phase**: post-v1
**Status**: open
**Assignee**: unclaimed
**Blocked by**: 无
**Related**: [P1](P1-decomposition-prototype.md)（decomposition 卡终版,本票延续其动态原型裁决套路）、[G1](G1-design-decisions.md) D5（confidence<0.7 黄边 + "理解可能不准确,请确认"提示）

## Question

G1 D5:decomposition 卡 confidence<0.7 时加黄边 + "理解可能不准确,请确认"提示。但**用户如何「改口径」(纠正/修正理解)并回流**?内联 affordance 什么形态?原型 2–3 个低保真形态给人 react(参 P1 动态原型裁决套路):

候选方向(待原型验证):
- inline 编辑 metric 口径(点 metric → 改文本 → 回流)
- 「纠正理解」按钮 → 输入 → 回流
- chip 式快捷纠正(预设修正项)

## Scope

仅 prototype(低保真形态 + HITL react,不接真实回流实现——实现是 destination 工作)。目的:把「选哪种 affordance」从说不清磨到 sharp → 毕业 grilling 票。本票是 map「改口径回流通道」雾的 **UX 层**磨清。
