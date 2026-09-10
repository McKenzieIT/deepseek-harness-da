# @deepseek-ai/dsh-goal-eval-context

[English](README.md) | 中文

DeepSeek Harness data agent（数据智能体）的上下文插件：将评估证据注入 goal round 上下文，使模型能在无进展阻断触发前自行调整方向。

## 概述

一个函数插件（`apply(ctx, config)`）会注册：

- `ctx.systemPrompt.section({ name: 'eval-evidence', order: 50, ... })` — 当某个 goal 处于 active 状态且存在评估运行时，向系统提示词追加一个 `<eval_evidence>` XML 块。
- `ctx.on('goal/changed', ...)` — 跟踪某个 goal 当前是否处于 `active` 状态，使得在没有 goal 进行时该 section 自行抑制。

以上两项注册均为 fiber 作用域，并由 Cordis 自动 dispose（资源释放）；监听器与 section 随挂载上下文一同拆卸。该插件不持有任何持久 registry slot：它读取 `ctx.evidenceQuery` 与 `ctx.systemPrompt`，仅写入提示词 section。

section 文本由纯渲染函数（`renderEvalEvidence`）基于结构化参数（`buildEvalEvidenceParams`）生成；渲染该块不发起 LLM（大语言模型）调用。

### 配置

```yaml
# cordis.yml
goal-eval-context:
  hintEscalationThreshold: 2 # default; the hint escalates one step before the goal policy blocks at N=3
```

## 模型体验

间接，经 @deepseek-ai/dsh-nl2sql-engine 的 LLM 适配器。

#### KV Cache 效果

评估运行的 LLM 调用在独立调用路径上执行，不会扩展或失效 agent loop（智能体循环）的可复用请求前缀。

## 已知限制与待办工作

- **WARN-13 — 全局与 per-goal 无进展计数器（有意分歧）** — `computeConsecutiveNoImprovement` 遍历全局历史运行序列（评估存储中的每一对运行），而 `@deepseek-ai/dsh-goal-eval-policy` 只跟踪自身的 per-goal、per-trigger 计数器。两者按设计可以不同：上下文呈现层向模型展示完整的历史视图以便其自行调整，而策略执行的是控制 round 推进的 per-goal 计数器。保持两套计数器分离，可避免上下文意外遮蔽策略状态。该分歧在代码中有记录，且为有意为之：未重新审视策略边界前不要将二者统一。
- **section 在每次组装时总是求值** — `text()` 回调读取 `ctx.evidenceQuery.getEvalStore()` 并在每次系统提示词组装时重新计算参数。渲染路径为纯函数且开销低（无 LLM、除内存存储外无 I/O），但未在一个轮次内跨组装做 memoize。
- **无显式的评估触发 token 归因** — 本插件自身不触发评估，仅渲染已有结果。运行评估的 token 开销归属 `@deepseek-ai/dsh-eval-runner-service`，而非本包。
