---
description: "通过上游公开接口将 Management Context（Workspace × Data Scope）解析为持久 Management Session，提供按 Context 的 single-flight 与持久 data-scope 绑定。"
kind: "package-reference"
---

# @deepseek-ai/dsh-management-context

[English](README.md) | 中文

## 概述

`ctx.managementContext` 将一个 **Management Context** —— `Workspace × Data Scope` 二元组 —— 解析为持久的 **Management Session**。它只消费上游公开接口：通过 `ctx.sessionController.create()` 创建一个普通 Session，固定 `semantic-layer-management` preset，然后将被管理的 Data Scope 记录为持久的 `data-scope/bound` session 事件。`dataScope` 投影将该绑定暴露给客户端 Session list，无需打开完整历史。

本包为 fork-owned。它不向上游 `api-remotes` 包、Session Controller 或 `packages/core/session` 添加 data-agent 专用行为（`core/session` 下的唯一编辑是注册 `data-scope/bound` 事件词汇的生成 persistence catalog）。

## 目录

- [Service API](#service-api)
- [Semantics](#semantics)
- [Session event and projection](#session-event-and-projection)
- [Durable binding](#durable-binding)
- [Cold-cache recovery semantics](#cold-cache-recovery-semantics)
- [Remote gateway](#remote-gateway)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

本包不发布运行时 invariant companion：它不拥有任何可独立观察、可能偏离运行时状态的关系（membership 归 Workspace registry，绑定归 session log 与 projection cache）。

<a id="service-api"></a>

## Service API

- `resolveOrCreate({ workspaceId, dataScopeId }): Promise<{ sessionId, created }>` —— 将 context 解析为其 Management Session，仅在不存在时创建。
- `createNew({ workspaceId, dataScopeId }): Promise<{ sessionId, created }>` —— 始终为 context 创建另一个 Management Session。

<a id="semantics"></a>

## 语义

- **并发（single-flight）。** `resolveOrCreate` 按 `(workspaceId, dataScopeId)` 进行 single-flight。同一 context 的两个并发默认调用只创建一个 session 并返回同一 `sessionId`。in-flight map 仅为按调用去重窗口，在 resolution settle 时删除 —— 它永远不是 context 映射到哪个 session 的权威。
- **幂等与恢复。** 默认 resolve 从目标 Workspace 的持久 session membership（`workspace.sessionIds`）和从 Session list 冷读的持久 `agentPreset` 与 `dataScope` 投影值重新派生 session —— 从不使用内存 binding map。因此它能在进程重启后存活。当存在多个匹配 session 时，按 `updatedAt` 选择最新的。
- **无回退（fail loud）。** 缺失 Workspace、缺失 Data Scope、不可用的 `semantic-layer-management` preset 或 session 创建失败均抛出异常。没有默认 preset，也没有 active-scope 回退。Data Scope id 从不从 Workspace 名称、路径、Session title 或进程级 active scope 推断；它仅通过 `ctx.scopes.get(dataScopeId)` 验证。
- **不可变绑定；删除。** 绑定一次性记录，永不重新绑定。Data Scope 从 registry 删除后，先前的 `data-scope/bound` 事件仍可读（历史保留，投影仍暴露它），但该 scope 的新管理操作失败，因为验证不再解析该 scope。

<a id="session-event-and-projection"></a>

## Session 事件与投影

- `data-scope/bound`（declaration-merged 进 `SessionEventMap`）：`{ dataScopeId: DataScopeId; workspaceId: WorkspaceId }`。`dataScopeId` 是 branded 跨进程 id（`Branded<'DataScopeId'>`），与 `SessionId` 和 `WorkspaceId` 一致；brand 在运行时擦除，因此持久事件与 wire payload 保持纯 JSON。在 Management Session 创建后、首个 turn 之前一次性追加。添加此事件是 session 词汇增长，不提升 `SESSION_FORMAT_VERSION`。
- `dataScope` 投影（`SessionProjectionMap['dataScope']`）：将 `data-scope/bound` 折叠为 `{ dataScopeId } | null`。它将绑定的 scope 冷暴露给 Session list，来自 projection cache，使 listing consumer 无需打开完整历史即可识别被管理的 scope。

<a id="durable-binding"></a>

## 持久绑定

`createSession` 在 `resolveOrCreate`/`createNew` 返回之前将绑定 flush 到持久存储。当 `sessionProjectionCache` 服务可用时（生产路径），其 `write(session)` 方法获取 projection checkpoint cut、通过 `ctx.sessions.flush(session)` flush session log、并写入 cache rows —— 使冷读或重开的进程无需打开完整历史即可看到 `dataScope` 投影。当 cache 服务不可用时（单元测试 harness），方法回退到 bare log flush。

<a id="cold-cache-recovery-semantics"></a>

## 冷缓存恢复语义

Session list 冷 hint 明确是部分的：一个 member session 可能完全不带 projection block，或带一个 `agentPreset` 或 `dataScope` cell 缺失的 block。`findExisting` 区分三种结果：

- **found** —— member session 的冷投影确认 management preset 与目标 Data Scope；复用它。
- **no-match** —— 每个 member session 的冷投影均可读，且没有一个是绑定到目标 scope 的 management session；安全创建。
- **unknown** —— 至少一个 member session 的冷投影缺失或陈旧。扫描无法排除它是目标 session，因此 `resolveOrCreate` **fail loud**（抛出明确错误）而不是静默创建重复。调用方暖 projection cache 后重试。

<a id="remote-gateway"></a>

## Remote gateway

`ManagementContextGateway`（一个 `TypertRemoteService`，`managementContext` namespace）暴露 `managementContext/resolveOrCreate` 和 `managementContext/createNew`。它只转发到 service —— service 是权威。service 与 gateway 均通过 `packages/bundle/data-agent/cordis.patch.yml` 装配。

<a id="dev-note"></a>

## 开发备注

<details>
<summary>维护者工作上下文 —— 点击展开</summary>

`ManagementContextService` 构造函数中的 `sessionProjections.register()` 调用已拥有其 fiber effect（registry 的 `register` 方法内部使用 `ctx.effect`）。service 不在它周围添加冗余的 `ctx.effect` —— 释放 service fiber（例如 HMR 期间）会自动注销 `dataScope` 投影，重新挂载 service 会重新注册它。

`durable-binding.spec.ts` 中的测试 factory 复制了 agent loop 的持久化附件（`prepare` → `persistence.create` → `enter` + `announce`），使 live `session/event` 分发按 session id 路由到 JSONL 后端。使用 `ctx.sessions.create()`（在持久化句柄存在之前就立即发布）的 factory 会留下未持久化的事件 —— 生产 agent loop 通过将 prepare 与 announce 分离来避免的同一陷阱。

</details>

<a id="model-experience"></a>

## 模型体验

None, as 该 service 解析 Management Context 为持久 Management Session 并记录持久 data-scope 绑定；它不向任何模型发送内容，也不注册 prompt、tool 或 model-facing event。`data-scope/bound` 事件是持久化与 client-list 元数据，不是模型可见输入。

#### KV Cache 效果

对主 agent loop 无影响：service 既不修改 request prefix 也不使 cache 条目失效。它创建的 Management Session 是一个独立 session，有自己的 request prefix。

<a id="known-limitations-and-deferred-work"></a>

## 已知限制与待办工作

- 持久绑定尚未约束 tool-edit-definition 执行：绑定到 scope A 的 Session 仍有通过 `ctx.schema` / `schema.semanticRoot` 在不同（进程 active）scope 下读写的源码路径，且绑定 scope 删除后的工具调用尚未被拒绝。这需要一个 fork-owned 执行入口 owner，消费持久绑定并与 W22 的 patrol 写入职责协调。此项记录为已知限制，不是独立 ticket，待与 W22 的所有权边界明确后再处理。
- 前身 `@deepseek-ai/dsh-management-session`（低级 `ctx.sessions.prepare/enter/announce`）由 W32 另行退役；本包不删除它。
- 默认恢复列出所有可见 Session 并按 Workspace membership 过滤；按工作区的冷索引推迟到 listing 成本需要时。
