# W6 — ③ 自驱循环 + B→A 演进

**Type**: task（③ 阶段）
**Status**: Closed
**Blocked by**: W3 ✅ + W4 ✅ + W5-full ✅ + goal ✅

## Question

G4 决议 ③ = 自主 goal 循环，v1 之后展开。本 ticket 决策 ③ 的具体设计：no-progress 检测机制、eval→goal 反馈接线、GoalDock 形态、B→A 演进触发方式。

## Resolution

W6 经 grilling 逐项决策。管理 agent 的自驱循环 = **Layered 双层互补**架构（model 自判为主 + policy backstop）+ **Context plugin 注入 eval evidence** + **GoalDock 在 sidebar 内联** + **B→A 自动翻转**。

### 架构决议

#### D1: no-progress 检测 = Layered（model + policy）

两层互补：
- **主路径**（model 层）：eval delta 通过 context plugin 注入每轮 round context → 模型看到证据后自行决定是否 block（用现有 tool-goal `blockedAfterConsecutiveRounds` 机制，阈值 3）
- **Backstop**（policy 层）：新 Cordis 插件 `goal-eval-policy`，每 K rounds 自动触发 eval，追踪连续无改进次数，达到 N 时程序化调 `ctx.goals.block({ code: 'no-progress', message })`

**设计原理**：
- 填 goal README 的 known limitation "no independent evaluator"
- Model 得 eval 数据能做更好的方向调整（不止 block 决策）
- Policy 作安全网——即使模型失灵也能收敛
- 符合 goal "model self-judges" 哲学（policy 是补充非替代）

#### D2: K/N 阈值 = K=3, N=3（configurable）

- K = 每 3 个 goal rounds 自动触发一次全量 eval（`goalEvalIntervalRounds`）
- N = 连续 3 次 eval 无改进后 force-block（`noProgressThreshold`）
- 效果：最迟 9 rounds 无进展后 block（model 层可能在 3 rounds 就自 block）
- 两参数均为 Cordis config，部署时可调无需改代码

**调参指标**：
- 误 block 率（block 后人类 resume 成功 → N 应提高）
- 浪费 rounds（model 自 block 先于 policy → K/N 可放宽）
- goal 完成率（过低 → 可能 N 太小）
- delta 轨迹形态（oscillating 不应计为"无改进"——`improved > 0` = 有改进）

#### D3: eval delta 注入 = Context plugin

新 Cordis context plugin `goal-eval-context`：
- 当 goal 活跃 + eval 结果存在时，在 agent pre-step 注入 `<eval_evidence>` block
- 内容：最近一次 eval pass_rate + delta summary (improved/regressed/unchanged) + consecutive_no_improvement_count + 建议（无进展时提示换方向）
- 与 goal-round-driver 完全解耦（可独立启用/禁用）
- 读取 `ctx.evidenceQuery` 而非直接读文件

#### D4: GoalDock = Sidebar 内联卡片

EvidenceSidebar 顶部新增 GoalDock 区域：
- 显示：objective（截断）+ phase badge + round/maxGoalRounds + 最近 eval pass_rate 迷你 sparkline
- 与会话 dock 的 GoalBar **共存**（不是迁移）
- 复用 `ui-goal` 的 GoalBar pattern（projection 读取、verb face）
- 新增 evidence 融合部分（sparkline 从 ctx.evidenceQuery 读取）

#### D5: B→A 演进 = Feature flag + 自动翻转

- 双路由并存：`/workspace`（B 资产工作区）+ `/dashboard`（A 证据 dashboard）
- 默认 landing 由 feature flag 控制（`layoutMode: 'B' | 'A' | 'auto'`）
- `auto` 模式：当 eval 历史超过阈值（如 3+ eval runs with delta data）→ 自动翻转为 A 落地
- B 的所有组件不推翻——A = 证据模块提升为 hero + workspace 降为 drill 目标
- 满足 W5 四条演进约束（证据=可提升模块 / 路由可切换 / 共享 evidence-query / 资产可深链）

### 自治边界（重申）

goal = 同会话、人类门控、模型自判完成。"打开会话不开工"是有意安全设计。always-on 巡检/定期**不在此 ticket**（需 scheduler，超出 goal 设计）。

### 毕业实现 ticket

- **W6a** — goal-eval-policy plugin（no-progress backstop）
- **W6b** — goal-eval-context plugin（eval delta → round context 注入）
- **W6c** — GoalDock in EvidenceSidebar（UI）
- **W6d** — B→A layout evolution（路由 + 自动翻转）
- **W6e** — Management agent persona ③ 演进（prompt + tool activation）

Blocking：W6a、W6b、W6c 并行无前置；W6d←W6c；W6e←W6b。

## 参考

- G4（③ 决议 / goal⊕eval / 4 演进约束 / 自治边界）
- W3（eval engine + delta）、W4（evidence-query backend）、W5-full（UI + 4 约束）
- goal 机制（packages/goal — GoalService / goal-round-driver / tool-goal）
- tool-goal `blockedAfterConsecutiveRounds: 3`（model 自 block 门槛）
- evidence-query `beforeAfterDelta()`（policy 读取 delta 的接口）
