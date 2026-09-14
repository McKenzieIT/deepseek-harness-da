---
description: "TODO: translate: Per-user caller identity seam (ctx.identity; stub today, P9 populates) for the DeepSeek Harness"
kind: "package-reference"
---

# @deepseek-ai/dsh-identity

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Per-user caller identity seam (ctx.identity; stub today, P9 populates) for the DeepSeek Harness

## 目录

- [状态：桩（T1 fallback）](#status-stub-t1-fallback)
- [正交性（G3 decision 7）](#orthogonality-g3-decision-7)
- [开发备注](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)


DeepSeek Harness 的按用户调用方身份接缝（`ctx.identity`）。

`ctx.identity.current()` 解析请求所代表的调用方——哪个业务用户（Qoder PAT 认证）、租户和作用域（数据隔离）——使按用户凭证和按用户审计归属到正确的主体。

<a id="status-stub-t1-fallback"></a>
## 状态：桩（T1 fallback）

harness 目前没有按用户登录状态（唯一身份是匿名安装 id，非按用户），所以 `current()` 当前返回 `undefined`。这使 G3 stable 的 **opportunistic threading** 当前为 no-op：


- **P8b `audit`** `resolveIdentity()` 读 `ctx.identity.current()` → `{}` → NULL 用户列——即 T1 fallback 已记录的值。

P9 的 `@deepseek-ai/dsh-admin` 落地真正的按用户登录并填充此接缝（override `current()` 返回已登录调用方 + access-link 解析的 scope）；届时相同 `current()` 调用即归属按用户。P3/P8b 无需因此修改——接缝即契约。

<a id="orthogonality-g3-decision-7"></a>
## 正交性（G3 decision 7）

`userId`（Qoder 认证）与 `scopeId`（数据隔离）是独立维度。keychain provider 仅服务 `userId` 维度；按 scope 隔离在 query sidecar 的 `set_credentials`/`scope_id` 与 `OdpsConfig` 区域——当前不经由本接缝的 `scopeId` on `ctx.credentials`。`scopeId` 是前向兼容字段，目前经 `ctx.credentials` 未使用。

<a id="dev-note"></a>
## 开发备注

无。


<a id="model-experience"></a>
## Model Experience

无，因为身份接缝解析请求所代表的调用方，从不进入模型请求；它是用于认证、审计和数据隔离的模型隐藏元数据。

#### KV Cache effect

无影响；身份是 keychain 和审计服务读取的调用方元数据，非任何模型请求。

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **桩实现（T1 fallback）** — `current()` 当前返回 `undefined`；harness 中不存在按用户登录状态。唯一身份是匿名安装 id，非按用户。
- **按用户登录（P9）** — 真正的按用户身份解析需要 `@deepseek-ai/dsh-admin`（P9）落地，它将 override `current()` 返回已登录调用方 + access-link 解析的 scope。
- **`scopeId` 未使用** — `ctx.credentials` 上的 `scopeId` 维度是前向兼容字段，当前无消费者；按 scope 隔离在 query sidecar 层处理。
- **无多租户隔离** — 经由本接缝的租户级隔离尚未实现；接缝携带 `tenantId` 作为未来 G3 stable 需求的占位符。
