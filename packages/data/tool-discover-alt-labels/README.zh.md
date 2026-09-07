# @deepseek-ai/dsh-tool-discover-alt-labels

[English](README.md) | 中文

面向模型的 discover_alt_labels 工具：在语义层之上进行 AI 原生的 SKOS 别名发现（CL-1 Phase 3 富集），用于 management agent 的富集阶段。

## 模型体验

间接通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM 适配器。

#### KV Cache 效果

本包向可复用请求前缀写入的内容为仅追加，不会使既有缓存条目失效。

## 已知限制与后续工作

- 纯建议：发现的标签不写回语义层。
- 名称上限 200 字符。
- 仅在富集阶段可调用。
