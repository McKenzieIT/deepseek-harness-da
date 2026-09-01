# P1: 查询理解卡优化编排 · 动态插件原型(HITL 裁决)

**Type**: prototype (HITL)
**Status**: ✅ resolved(三轮裁决完毕,2026-09-01)
**Blocked by**: [R9](R9-decomposition-display-optimization-plan.md)
**Blocks**: [T5](T5-present-decomposition-display-upgrade.md)

## Question

R9 的应然编排(焦点行/结构行/明细行/信任带)相对现状是否真的"抓得住重点"?用户在真实 GUI 里对照后的裁决是什么(全盘采纳 / 调整 / 否决)?

## 原型载体(本会话动态插件 qdec-1,Mode 1)

1. `tool.call.toolview` key=`present_decomposition` + `priority: -1` 影子覆盖:真实对话流量直接看到优化卡(停止插件即还原)。
2. `shell.overlay` 演示面板:「现状如实 / 仅修 token / 优化编排」三列对照 × 场景页签(常规 / 低置信+模糊 / 十指标压力)。

## 裁决记录

**第一轮**:焦点行成立(summary 作标题+置信度徽标常显,含折叠态);指标降级成立(放弃 KPI 大卡);谱系合行成立(时间→维度→筛选→源单行 chips)。

**第二轮**:悬停揭示口径**否决**("看起来没有更优")——①空间利用率缺陷(10 指标逐行向下衍生);②自洽性 bug(点击收起后光标仍在指标名上,hover 预览规则压回显示,悬停与钉住互斥打架,属方案固有缺陷)。结论:口径**常显**胜出,问题只在纵向堆叠。

**第三轮**:常显 + 自适应多列网格——**裁决通过**("仍可")。

## Resolution(VERDICT)

**最终口径(折回 T5 的设计定稿)**:

1. **焦点行**:eyebrow「查询理解」+ summary 作标题(超长省略+title)+ 置信度徽标常显数值(<0.7 转 warn 并附"请确认");折叠态保留焦点行 + 时间/维度 mini chips。
2. **谱系 chips 行**:时间 → 维度(实底 chip)→ 筛选(虚线描边 chip)→ 来源(实线描边 chip),单行 wrap,取代 4 行 label-value。
3. **指标常显网格**:`repeat(auto-fill, minmax(190px, 1fr))`;每格上行=名称(+单位)、下行=口径表达式(mono,超长省略+title);caption 带计数「将计算 · N 项」;窄卡自动退单列。**否决**:KPI 大卡(语义错位——意图声明不是结果)、悬停/点击收纳(自洽性 bug+可发现性+无障碍三重缺陷)。
4. **信任带**:低置信 = warn 描边+徽标+警示行;`isError` = role=alert 错误行;"信任自适应展开"随常显裁决失效,仅保留警示强化。
5. **工程基线**(R9 Phase 0 不变):真实 alias token 全量替换、locale seat、parseArgs 全字段防御、无 hook 组件直调纪律(本轮 #300 事故的教训,组件测试须覆盖折叠/场景切换分支)。

原型作废流程:待 T5 折回仓库包(测试+快照绿)后,动态插件停止并标记作废;在此之前保持挂载,作为真实流量的临时最优展示(进程内有效,重启即失)。
