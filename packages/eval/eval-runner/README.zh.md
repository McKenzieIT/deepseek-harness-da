# @deepseek-ai/dsh-eval-runner

[English](README.md) | 中文

Eval 证据引擎：面向 da eval harness 的批量执行器，支持 pass_k、结果持久化、前后差异对比、健康门禁与基础设施重试。

## 模型体验

无。该 eval runner 与模型无关，所有模型调用均委托给注入的 responder 与 judge。

#### KV Cache 效果

该包不注册任何面向模型的内容，因此不延伸或失效任何 KV-cache 前缀。

## 已知限制与待办工作

- 仅 `pass_k` 判定语义：此处无 best-of-k 回退。
- 健康门禁仅在运行前执行；运行中无重新检查。
- 基础设施重试受 `MAX_FEEDBACK_RETRIES` 约束。
