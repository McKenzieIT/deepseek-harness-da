# W6a — goal-eval-policy plugin（no-progress backstop）

**Type**: task
**Status**: Open
**Blocked by**: —（并行根）

## Question

实现 policy 层 no-progress 自动 block 机制。

## 规格

新 Cordis plugin `@deepseek-ai/dsh-goal-eval-policy`：

### 职责
1. 当 goal 活跃时，追踪已完成的 goal rounds
2. 每 K rounds 自动触发一次全量 eval（通过 `ctx.evalRunner`）
3. 对比本次 eval 与上次 eval 的 delta（`ctx.evidenceQuery.beforeAfterDelta()`）
4. 追踪连续无改进次数（`improved === 0` 计为无改进）
5. 达到 N 次时调 `ctx.goals.block(ref, { code: 'no-progress', message })`

### Config

```yaml
- id: goal-eval-policy
  name: '@deepseek-ai/dsh-goal-eval-policy'
  config:
    goalEvalIntervalRounds: 3   # K: 每多少 rounds 触发一次 eval
    noProgressThreshold: 3      # N: 连续多少次无改进后 force-block
```

### 接口依赖
- `ctx.goals`（GoalService — 读 goal state + block verb）
- `ctx.evidenceQuery`（beforeAfterDelta）
- `ctx.evalRunner`（EvalRunnerService seam — 触发 eval run）

### ⚠️ Spec 缺口（code review 发现 — 实现前必读）

现有 `packages/data/semantic-layer-goal/src/no-progress-detector.ts` proto **消费 `RunSummary`**（`pass_rate`/`correct_count`/`regression_count`），但 W6 决议的"连续无改进"是针对 eval **delta** 定义的（`improved === 0`，见 W6 ticket D2）。

**实现 W6a 时必须修正**：
- detector 的输入应是 **`DeltaReport`**（来自 `eval-runner/compareDelta` 或 `evidenceQuery.beforeAfterDelta`），不是单次 `RunSummary`
- "无改进"判定 = `delta.summary.improved === 0`（本轮无任何 case flip 向 correct）
- 连续 N 次 `improved === 0` → block（N=3）
- proto 的 `extractMetric`/`lastProgressValue` 逻辑（基于 pass_rate 数值比较）应替换为 delta-based 的 `improved === 0` 判定，或保留 pass_rate 作为辅助信号但主信号是 delta

**为什么 delta 而非 pass_rate**：pass_rate 可能因 case 集变化而漂移（新增 case 拉低 rate 但实际无退化）；delta 只看 flip，准确反映"本轮改动有无变好"。这正是 G4/W6 的"eval 填 goal 留的完成证据缺口"语义。

proto 中可保留的：`NoProgressState` 状态机骨架、`resetDetector(preserveBaseline)`、`blockReason` 输出 `code: 'no-progress'`。

### 行为细节
- 监听 `goal/changed` 事件：goal 创建/resume 时重置计数器
- 监听 admitted goal rounds（count increments）：达到 K 的倍数时触发 eval
- Eval 完成后：调 `beforeAfterDelta(lastRunId, currentRunId)` → 若 `improved === 0` → `consecutiveNoImprovement++`
- 若 `consecutiveNoImprovement >= N` → block goal
- Model 先于 policy 自 block 时（已 blocked 状态）→ policy 不重复 block
- Goal resume 时 → 重置 `consecutiveNoImprovement = 0`

### 边界
- 不修改 goal-round-driver（那是 model 层）
- 不注入 model context（那是 W6b 的职责）
- 仅观测 + block，不做 resume/complete 决策

## 验收

- [ ] K=3 时，每 3 个 admitted goal rounds 触发一次 eval
- [ ] N=3 时，连续 3 次 eval 无改进后 goal 被 block（code='no-progress'）
- [ ] Goal resume 后计数器重置
- [ ] 已 blocked 的 goal 不重复 block
- [ ] Config 参数可部署时调整
- [ ] 测试覆盖核心逻辑
