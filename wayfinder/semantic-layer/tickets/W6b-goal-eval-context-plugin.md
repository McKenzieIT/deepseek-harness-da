# W6b — goal-eval-context plugin（eval delta → round context）

**Type**: task
**Status**: Open
**Blocked by**: —（并行根）

## Question

实现 eval evidence 注入管理 agent 每轮 round context 的 context plugin。

## 规格

新 Cordis context plugin `@deepseek-ai/dsh-goal-eval-context`：

### 职责
在管理 agent 的 goal round 上下文中注入结构化 eval 证据，使模型能据此自主调整工作方向或决定 block。

### 注入形态

当 goal 活跃 + eval 结果存在时，在 `agent/pre-step` 注入一段 `<eval_evidence>` block：

```xml
<eval_evidence>
Pass rate: 78/161 (48.4%)
Last delta: +3 improved, -1 regressed, 157 unchanged (vs run abc123)
Consecutive evaluations without improvement: 0
Direction: Progress detected — continue current approach.
</eval_evidence>
```

当 consecutiveNoImprovement > 0 时：
```xml
<eval_evidence>
Pass rate: 78/161 (48.4%)
Last delta: 0 improved, 0 regressed, 161 unchanged (vs run abc123)
Consecutive evaluations without improvement: 2/3
Direction: No improvement detected for 2 consecutive evaluations. Consider changing approach or investigating regressed cases before continuing.
</eval_evidence>
```

### 接口依赖
- `ctx.evidenceQuery`（evalResultQuery + beforeAfterDelta）
- `ctx.goals`（读 goal state — 判断是否注入）
- 不依赖 goal-round-driver（完全解耦）

### 行为细节
- 通过 Cordis prompt registration（非 tool call）注入
- 仅当 goal phase === 'active' 时注入
- 若无 eval 结果 → 注入 "No evaluation data yet. Consider triggering an evaluation."
- 从 goal-eval-policy 的状态读取 consecutiveNoImprovement（或自行从 eval store 计算）
- `Direction` 行为简单规则映射（无 LLM）：improved>0 → continue / improved===0 → suggest change

### 与 goal-round-driver 的关系
- 完全独立注册：即使没有 goal-round-driver，context 也可注入（覆盖 manual goal 场景）
- 注入位置：system prompt section（非 user message），每次 pre-step 更新

## 验收

- [ ] Goal 活跃时 model 上下文中可见 `<eval_evidence>` block
- [ ] 内容反映最新 eval 结果 + delta + no-improvement 计数
- [ ] 无 eval 数据时注入提示性 fallback
- [ ] Goal 非活跃时不注入
- [ ] 与 goal-round-driver 可独立启用/禁用
- [ ] 测试覆盖注入逻辑
