# @deepseek-ai/dsh-admin

[English](README.md) | 中文

管理 + 访问隔离：按用户登录、身份、scope 解析、PAT 自助、fail-closed 授权

## 模型体验

间接，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

本包的贡献仅追加至可复用的请求前缀，不会使既有缓存条目失效。

## 已知限制与延后工作

- 用户存储为内存式，此处未接入持久化 seam。
- PAT 管理仅支持自助；不存在管理员签发 token 的流程。
- 授权为 fail-closed：缺规则即拒绝，而非允许。
