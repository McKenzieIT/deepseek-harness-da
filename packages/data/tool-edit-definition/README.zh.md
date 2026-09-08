# @deepseek-ai/dsh-tool-edit-definition

[English](README.md) | 中文

面向模型的 edit_definition 工具：对语义层资产定义应用部分补丁，并记录审计轨迹

## 模型体验

间接通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM 适配器。

#### KV Cache 效应

本包对可复用请求前缀的贡献为仅追加，不会使既有缓存条目失效。

## 已知限制与延后工作

- 仅支持部分补丁，没有全量替换模式。
- 审计轨迹为仅追加；撤销受 `revert_edit` 约束，且没有分支历史。
- 资产名称上限为 200 个字符。
