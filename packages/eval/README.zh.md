---
description: "TODO: translate: Data-agent eval harness group: dsh-eval mirrors reverse-bi rbi-eval orchestration design as a da-fresh TypeScript pure library"
kind: "package-group"
---

# eval

[English](README.md) | 中文

## 概述

`eval/` 组提供 data agent 的评测库、CLI、runner service 与检索实验。纯评测类型接收注入的 responder、executor 与 judge，宿主包负责连接真实模型和查询 provider。各包 README 说明对应执行模式与产物格式。

## 目录

- [包](#packages)
- [开发备注](#dev-note)

<a id="packages"></a>
## 包

Data-agent eval harness 组：`dsh-eval` 包镜像 reverse-bi `rbi-eval` 编排设计（非代码）为 da-fresh TypeScript 纯库。它不在 Cordis context 上注册任何内容；host 连线真实的 `dsh-sdk-client` / `dsh-query` / `dsh-llm-dashscope` 协作者并注入。

| 包 | ctx-key | 职责 |
|---|---|---|
| [`eval/`](eval/README.zh.md) | —（无；纯库） | `MultiTurnSession` + pass_k + DELIVERY/EXECUTION 评分 + 注入的 responder/executor/judge |

<a id="dev-note"></a>
## 开发备注

规则：[package](../AGENTS.md)，[root](../../AGENTS.md#conventions)。
