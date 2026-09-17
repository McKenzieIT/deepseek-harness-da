# Agent Note: 锁定评测协议在外部 Attempt 前失败

Status: implemented

[English](2026-09-17-locked-evaluation-protocol-preflight.md) | 中文

## 问题

受控评测可能先花费模型调用并触碰外部系统，之后才发现冻结的 Case Manifest 无法满足后续阶段的选例或配对规则。若把该矛盾当作普通失败 Attempt，会污染分母，并诱使操作者在看到可用语料后临时替换案例。

## 决策

Evaluation Controller 在启动任何外部 Attempt 前验证每个阶段的选例要求、组别数量、replicate 数量、Task 材料身份和工具目录身份。不匹配属于协议错误：controller 在网络、provider、sidecar 或数仓访问前停止，并要求显式协议修订。基础设施失败仍是独立且不可变的 Attempt 结果，绝不转换成 `wrong`、`declined` 或 `correct` grade。

[Phase-gate incremental-value experiment](../../../../wayfinder/task-orchestration-dag/tickets/G25a-phase-gate-incremental-value-experiment.md) 应用了该规则。修订后的真实执行切片包含十个 L2 案例和两个 L3 案例，但保留的 Stage 1 条款要求 L1 和 L4 案例。controlled runner 在消耗 18 个 smoke Attempt 或 252 个决策 Attempt 前拒绝 Stage 1。

原始 Session 事件和查询行保留在被忽略的 Evidence Cut 中。可提交 observation 只保留身份、摘要、计数、分类结果、grade 和成本。Session 提取、确定性评分、配对分析和故障注入都是纯设施或受控设施，并在真实运行前完成测试。

## 考虑过的替代方案

**静默替换成最接近的可用复杂度组合。** 未采用，因为未获批准就修改 smoke population 会破坏冻结协议，并使后续决策依赖一个未记录的选择。

**先运行决策批次，再在报告中说明 smoke 缺口。** 未采用，因为 Stage 1 是昂贵批次的准入检查；绕过它会在评测设施尚未证明能测量声明比较前消耗证据预算。

**把 provider、sidecar 或数仓失败计为模型失败。** 未采用，因为这些结果测量的是环境可用性，不是被评测的编排策略，并会使遇到故障的组产生偏差。

## 后果

协议矛盾会更早停止进度，即使实现本身已经就绪，也可能需要人工修订。这个延迟换来可复现的 Comparison Plan，保留全部决策 Attempt，并阻止基础设施可用性或操作者替换进入因果估计。
