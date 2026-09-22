---
description: "Eval 证据引擎：提供严格 pass^k、评分前置检查、类型化基础设施重试、可重放执行产物、运行策略兼容性校验、持久化、差异对比与健康门禁。"
kind: "package-reference"
---

# @deepseek-ai/dsh-eval-runner

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

Eval 证据引擎提供严格 pass^k、评分前置检查、类型化基础设施重试、可重放执行产物、运行策略兼容性校验、持久化、差异对比与健康门禁。

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)


Eval 证据引擎提供严格 pass^k、评分前置检查、类型化基础设施重试、可重放执行产物、运行策略兼容性校验、持久化、差异对比与健康门禁。

Candidate Agent 运行前，每个结构合法的 case 都会检查是否具有可用评分内容。存在执行器时，可解析的参考 SQL 会先执行：环境故障成为 `infra_failure`，无效参考 SQL 或其结果与声明 expected 不一致成为 `case_defect`，两者都不进入模型错误分母。每个返回的 `CaseVerdict` 都携带 preflight evidence，以及离线重评分所需的 case 来源路径、schema version、scope、expected 字段、metadata 与已解析参考 SQL。基础设施重试只发生在一次模型回复采样后的 SQL 执行阶段，因此一次 `pass_k` attempt 不会静默变成多次模型采样。

未发布运行时 invariant companion，因为 `@deepseek-ai/dsh-eval-runner` 不拥有可能与其运行时状态独立发生分歧的可观测关系。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

无。该 eval runner 与模型无关，所有模型调用均委托给注入的 responder 与 judge。

#### KV Cache 效果

该包不注册任何面向模型的内容，因此不延伸或失效任何 KV-cache 前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办工作

- 仅 `pass_k` 判定语义：此处无 best-of-k 回退。
- 健康门禁仅在运行前执行；运行中无重新检查。
- 基础设施重试受已记录的 run option `max_infra_retries` 约束；抛出的基础设施错误与类型化可重试 outcome 使用同一个上限。
- 若持久化 artifact 的 row cap 省略了 comparator 所需数据，离线重评分返回 `not-measured`；若提供方未物化完整结果，则返回 `environment-blocked`。
