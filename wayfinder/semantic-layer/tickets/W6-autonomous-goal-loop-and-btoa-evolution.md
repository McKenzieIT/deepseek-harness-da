# W6 — ③ 自驱循环 + B→A 演进（③-gated，deferred）

**Type**: task（③ 阶段）
**Status**: Open（③-gated，deferred — v1 栈完成后展开）
**Blocked by**: W3 + W4 + W5（v1 ①② 栈完成）+ goal（已有，data-agent map）

## Question

G4 决议 ③ = 自主 goal 循环，v1 之后展开（同 map，不迁 data-agent map）。本 ticket 立框架，**细节 ③ sharp 后填**（管理 agent preset 形状、no-progress 阈值调参是本 ticket 的工作，非现在 spec）。

### ③ 自驱循环
1. **管理 agent preset**（goal-orchestrated，区别数据 agent 的 pipeline）：工具集 = 诊断 / 生成 / 验证 / 解释 / 批量 + eval feedback
2. **eval→goal 集成策略**：W3 的 before/after delta → 管理 agent 下一 round context + **block-on-no-progress**（连续 N 轮无改进 → goal block `no-progress`，N 待调）
3. **goal-round-driver 组合 eval**：round/batch 边界跑全量 eval（W3），delta 喂回 goal

### B→A 演进（dashboard-hero）
4. 证据模块（W5 约束 #1 可提升）**提升为落地** + **翻转默认路由**（#2）+ 资产工作区**降为 drill 目标**（#4）。eval 历史积累足够支撑 trajectory 视图时触发。

## 自治边界

goal = **同会话、人类门控、模型自判完成**（非后台守护；"打开会话不开工"是有意安全设计）。always-on 巡检/定期**不在此 ticket**（需 scheduler，超出 goal 设计，G4 已 rule out of scope）。

## 验收（③ 阶段展开时细化）

- [ ] 自驱循环可朝 goal 推进 + eval 证据自校准 + block-on-no-progress 生效
- [ ] B→A 演进落地（证据模块提升为落地页 + 路由翻转 + 工作区降为 drill）

## 参考

- G4（③ 决议 / goal⊕eval 架构 / 4 演进约束 / 自治边界 / goal 不是 daemon）
- 依赖：W3（eval engine+delta）、W4（evidence backend）、W5（UI+4 约束）、goal 机制（data-agent map `packages/goal`）
- 跨 map：eval 核心 + case 集 + goal 均为复用平台依赖
