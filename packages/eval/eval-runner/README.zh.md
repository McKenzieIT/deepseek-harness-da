---
description: "TODO: translate: Eval evidence engine: batch runner with pass_k, result persistence, before/after delta comparison, health-gate, and infra-retry for the da eval harness"
kind: "package-reference"
---

# @deepseek-ai/dsh-eval-runner

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Eval evidence engine: batch runner with pass_k, result persistence, before/after delta comparison, health-gate, and infra-retry for the da eval harness

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)


Eval 证据引擎：面向 da eval harness 的批量执行器，支持 pass_k、结果持久化、前后差异对比、健康门禁与基础设施重试。

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
- 基础设施重试受 `MAX_FEEDBACK_RETRIES` 约束。
