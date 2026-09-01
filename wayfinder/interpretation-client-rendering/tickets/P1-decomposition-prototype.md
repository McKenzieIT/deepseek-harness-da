# P1: 查询理解卡优化编排 · 动态插件原型(HITL 裁决)

**Type**: prototype (HITL)
**Status**: 🔶 claimed(第一轮三问全部裁决「成立」;第二轮微交互裁决进行中——指标公式悬停揭示 + 焦点能力泛化,pkg-3 已挂载)
**Blocked by**: [R9](R9-decomposition-display-optimization-plan.md)
**Blocks**: [T5](T5-present-decomposition-display-upgrade.md)

## Question

R9 的应然编排(焦点行/结构行/明细行/信任带)相对现状是否真的"抓得住重点"?用户在真实 GUI 里对照后的裁决是什么(全盘采纳 / 调整 / 否决)?

## 原型载体(本会话动态插件 qdec-1,Mode 1)

1. `tool.call.toolview` key=`present_decomposition` + `priority: -1` 影子覆盖:真实对话流量直接看到优化卡(停止插件即还原)。
2. `shell.overlay` 演示面板:「现状如实(8 token 失效)/ 仅修 token / 优化编排」三列对照 × 两场景(常规 / 低置信+模糊)。

## 第一轮裁决(2026-09-01,用户)

- **焦点行成立**:summary 作卡片标题 + 置信度徽标常显(含折叠态)。
- **指标降级成立**:metrics 放弃 KPI 大卡,改为"名称—表达式"明细行。
- **谱系合行成立**:时间→维度→筛选→源合并单行 chips。

## 第二轮裁决(进行中)

用户追问:①指标公式改为悬停揭示是否更优?②焦点能力是否泛化到更多设计?

分析结论(详见会话记录)与 pkg-3 实现:

- **指标公式分层揭示**(默认只显名称+单位;悬停/键盘聚焦预览表达式;点击/Enter 钉住展开;触摸可达)——方向成立,但单通道 hover 不够:补 focus/click 通道 + 虚线下划线可供性 + **信任自适应**(低置信时口径全展开——透明度优先原则的动态化)。
- **焦点能力泛化**:确认成立的有 present_table 折叠卡同语言(T5 Phase 2)、焦点行携带状态与展开深度(error/低置信改变焦点层而非只改 body)、键盘焦点纪律;明确不泛化的:suggest_followups 主次分层(变体裁决已否决,扁平列表胜出);留雾的:turn 级跨卡焦点条、与上轮分解的变更高亮、chip 数据预览(依赖 R6)、可编辑 chips 回流。

## Resolution

(第二轮裁决后填写:VERDICT + 折回 T5 的最终口径;原型作废。)
