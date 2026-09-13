---
description: "TODO: translate: Retrieval strategy gradient experiment infrastructure: Level 0-3 graph snapshots, blending function variants, precision@K/recall@K harness"
kind: "package-reference"
---

# @deepseek-ai/dsh-retrieval-experiment

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Retrieval strategy gradient experiment infrastructure: Level 0-3 graph snapshots, blending function variants, precision@K/recall@K harness

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)


检索策略梯度实验基础设施：Level 0-3 图快照、混合函数变体、precision@K/recall@K harness

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

间接通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

本包对可复用请求前缀的贡献为仅追加，不会使既有缓存条目失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延后工作

- Level 0-3 图快照为时间点快照，不支持实时流式传输。
- 混合变体为研究脚手架，未经生产环境调优。
- 指标仅含 precision@K/recall@K，不含 nDCG。
