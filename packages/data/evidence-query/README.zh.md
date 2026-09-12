# @deepseek-ai/dsh-evidence-query

[English](README.md) | 中文

统一的 evidence-query 后端层：提供覆盖率、缺口分析、可达性、评估结果与资产健康度，供侧边栏与看板消费。

`FileBackedEvalResultStore` 同时读取旧的无版本 eval JSONL 与 version-2 记录。每一条持久化记录都在接收前完成运行时校验：未知 verdict、错误 run 配置、无效 execution artifact 与不支持的 record version 会使加载明确失败，而不会落成 `pending`。Version-2 metadata 保留 runner verdict、run 配置、case preflight evidence、attempt execution evidence 与 case provenance；六种 runner verdict 均显式映射，其中 `unjudged`、`infra_failure` 与 `case_defect` 表示为 `error`。

## 模型体验

间接方式，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

本包对可复用请求前缀的贡献为仅追加，不会使既有缓存条目失效。

## 已知限制与延后工作

- 只读投影，从不回写语义层。
- 缺口分析提出关系，但不持久化。
- 可达性以 BFS 为界，除默认值外无路径长度上限。
