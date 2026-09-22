---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-09-23-data-scope-bound

[English](2026-09-23-data-scope-bound.md) | 中文

## 概述

新增 fork-owned 日志事件 data-scope/bound，记录 Management Session 管理的 Data Scope。在通过公开 sessionController.create() 创建 Management Session 后、首个 turn 之前一次性追加。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-09-23-data-scope-bound
baseline: false
changes:
  - root: "event:data-scope/bound"
    previous: null
    after: "c8e9fdac03c9f3fe2d7984edbed326bcc4faee9afff2912087508af7e854f3fe"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

该事件为新增 root，不修改任何已有声明类型。不识别该事件的旧 reader 拒绝恢复包含该事件的持久化 Management Session（known-event-types 注册表门控 replay），这是旧 reader 无法安全解释绑定时的预期 fail-loud 行为。绑定 payload 为纯 JSON（{ dataScopeId, workspaceId }），不设置 ignorable 标志。不需要提升 Session format version（requiresVersionBump=false）：该事件为同版本新增，其唯一 reader 为 fork-owned management-context projection。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/data/management-context/tests --no-cache：24 个测试通过（3 个文件）。pnpm run verify-persistence-catalog：catalog 为最新。persistence.spec.ts 测试通过真实 JSONL 后端写入 data-scope/bound 事件，关闭 context 后重新打开并读回事件，通过 shipping dataScope projection 折叠并断言绑定可恢复。

<a id="dev-note"></a>
## 开发备注

无。
