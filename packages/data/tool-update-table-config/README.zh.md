# @deepseek-ai/dsh-tool-update-table-config

[English](README.md) | 中文

面向模型的 update_table_config 工具：向语义层 substrate 写入按表的 ODPS 项目覆盖，用于 data agent 的自我进化循环（仅管理员；Tier-2 审计）

## 模型体验

间接地，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM 适配器。

#### KV Cache 效果

本包对可复用请求前缀的贡献为仅追加，不会使先前的缓存条目失效。

## 已知限制与延期工作

- 仅管理员（Tier-2 审计）。
- 仅支持按表的 ODPS 项目覆盖，无字段级配置。
- 写入与 substrate 耦合。
