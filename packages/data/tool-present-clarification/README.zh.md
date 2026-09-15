---
description: "TODO: translate: Model-facing present_clarification tool: present a clarifying question to the user and HALT the turn awaiting their answer (self-evolution #2a; callable in any phase)"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-present-clarification

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Model-facing present_clarification tool: present a clarifying question to the user and HALT the turn awaiting their answer (self-evolution #2a; callable in any phase)

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)


面向模型的 present_clarification 工具：向用户提出澄清问题并中止轮次，等待用户回答（self-evolution #2a；可在任意阶段调用）

未发布运行时 invariant companion，因为 `@deepseek-ai/dsh-tool-present-clarification` 不拥有可能与其运行时状态独立发生分歧的可观测关系。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

间接地，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM 适配器。

#### KV Cache 影响

本包的贡献以仅追加方式并入可复用的请求前缀，不会使既有缓存条目失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 纯展示：中止轮次且不存储答案。
- 可在任意阶段调用，但每个轮次仅允许一个待处理的澄清。
