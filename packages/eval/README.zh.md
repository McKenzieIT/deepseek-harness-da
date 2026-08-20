# eval

[English](README.md) | 中文

Data-agent eval harness 组：`dsh-eval` 包镜像 reverse-bi `rbi-eval` 编排设计（非代码）为 da-fresh TypeScript 纯库。它不在 Cordis context 上注册任何内容；host 连线真实的 `dsh-sdk-client` / `dsh-query` / `dsh-llm-dashscope` 协作者并注入。

| 包 | ctx-key | 职责 |
|---|---|---|
| [`eval/`](eval/README.md) | —（无；纯库） | `MultiTurnSession` + pass_k + DELIVERY/EXECUTION 评分 + 注入的 responder/executor/judge |

规则：[package](../AGENTS.md)，[root](../../AGENTS.md#conventions)。
