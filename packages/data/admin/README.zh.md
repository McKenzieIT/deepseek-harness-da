---
description: "TODO: translate: Admin + access isolation: per-user login, identity, scope resolution, PAT self-service, fail-closed authz"
kind: "package-reference"
---

# @deepseek-ai/dsh-admin

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Admin + access isolation: per-user login, identity, scope resolution, PAT self-service, fail-closed authz

## 目录

- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)


管理 + 访问隔离：按用户登录、身份、scope 解析、PAT 自助、fail-closed 授权

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## 模型体验

间接，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

本包的贡献仅追加至可复用的请求前缀，不会使既有缓存条目失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延后工作

- 用户存储为内存式，此处未接入持久化 seam。
- PAT 管理仅支持自助；不存在管理员签发 token 的流程。
- 授权为 fail-closed：缺规则即拒绝，而非允许。
